/* extension.js - ddcutil Brightness Controller
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* GI Libraries */
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

/* GNOME Shell modules */
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

/* Extension modules */
import {ConfigHelper} from './configHelper.js';


/**
 * A simple debounce timer that coalesces rapid calls into a single
 * deferred invocation. Used to avoid excessive ddcutil subprocess
 * spawns while a slider is being dragged.
 */
class DebounceTimer {
    constructor(timeout, callback) {
        this._timeout = timeout;
        this._callback = callback;
        this._timerId = null;
    }

    trigger(...args) {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._timeout, () => {
            this._callback(...args);
            this._timerId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
    }
}


/**
 * Panel indicator button that displays per-monitor brightness/contrast
 * sliders in a popup menu.
 */
const BrightnessIndicator = GObject.registerClass(
class BrightnessIndicator extends PanelMenu.Button {
    _init(configHelper, extension) {
        super._init(0.0, 'Brightness Manager', false);
        this._configHelper = configHelper;
        this._extension = extension;
        this._configData = null;
        this._debounceTimers = [];
        this._sliderSignals = [];

        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3 /* Right click */) {
                this._extension.openPreferences();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        this._buildMenu();
    }

    _disconnectSliders() {
        if (this._sliderSignals) {
            for (const {slider, signalId} of this._sliderSignals) {
                if (slider && signalId)
                    slider.disconnect(signalId);
            }
            this._sliderSignals = [];
        }
    }

    async _buildMenu() {
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Loading config...'));

        this._configData = await this._configHelper.loadConfig();

        this._disconnectSliders();
        this.menu.removeAll();

        if (!this._configData.monitors || this._configData.monitors.length === 0) {
            this.menu.addMenuItem(
                new PopupMenu.PopupMenuItem('No monitors found in config')
            );
            return;
        }

        for (const monitor of this._configData.monitors) {
            const header = new PopupMenu.PopupMenuItem(
                `[Display ${monitor.displayId}] ${monitor.id}`
            );
            header.sensitive = false;
            this.menu.addMenuItem(header);

            if (monitor.sliders) {
                for (const sliderConfig of monitor.sliders) {
                    const min = sliderConfig.min !== undefined
                        ? sliderConfig.min : 0;
                    const max = sliderConfig.max !== undefined
                        ? sliderConfig.max : 100;
                    const val = sliderConfig.lastValue !== undefined
                        ? sliderConfig.lastValue : 50;

                    const labelItem = new PopupMenu.PopupMenuItem(
                        `${sliderConfig.name}`
                    );
                    labelItem.sensitive = false;
                    this.menu.addMenuItem(labelItem);

                    // GNOME sliders use 0.0 to 1.0 range
                    const normalizedValue = (val - min) / (max - min);
                    const sliderItem = new PopupMenu.PopupBaseMenuItem({
                        activate: false,
                    });
                    const slider = new Slider(normalizedValue);
                    slider.x_expand = true;
                    sliderItem.add_child(slider);

                    this.menu.addMenuItem(sliderItem);

                    // Debouncer for this slider (0ms = immediate)
                    const timer = new DebounceTimer(0, newValue => {
                        const actualValue = Math.round(
                            min + (newValue * (max - min))
                        );
                        sliderConfig.lastValue = actualValue;

                        this._configHelper.executeCommand(
                            sliderConfig.command,
                            actualValue,
                            this._configData.ddcutilPath
                        );
                        this._configHelper.saveConfig(this._configData);
                    });

                    this._debounceTimers.push(timer);

                    const signalId = slider.connect('notify::value', () => {
                        timer.trigger(slider.value);
                    });
                    this._sliderSignals.push({slider, signalId});
                }
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh UI Config');
        refreshItem.connect('activate', () => {
            this._buildMenu();
        });
        this.menu.addMenuItem(refreshItem);

        const detectItem = new PopupMenu.PopupMenuItem(
            'Reload Monitors (ddcutil detect)'
        );
        detectItem.connect('activate', async () => {
            this._disconnectSliders();
            this.menu.removeAll();
            this.menu.addMenuItem(
                new PopupMenu.PopupMenuItem('Running ddcutil detect...')
            );
            await this._configHelper._generateDefaultConfig();
            this._buildMenu();
        });
        this.menu.addMenuItem(detectItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem('⚙️ Settings');
        settingsItem.connect('activate', () => {
            this._extension.openPreferences();
        });
        this.menu.addMenuItem(settingsItem);
    }

    destroy() {
        this._disconnectSliders();
        for (const timer of this._debounceTimers) {
            timer.destroy();
        }
        this._debounceTimers = [];
        super.destroy();
    }
});


/**
 * Main extension class.
 *
 * This function is called when your extension is enabled, which could be
 * done in GNOME Extensions, when you log in or when the screen is unlocked.
 *
 * Anything created, modified or setup in enable() MUST be undone in
 * disable(). Not doing so is the most common reason extensions are rejected
 * during review.
 */
export default class BrightnessControllerExtension extends Extension {
    /**
     * Called when the extension is enabled.
     * Creates the panel indicator and config helper.
     */
    enable() {
        this._configHelper = new ConfigHelper();
        this._indicator = new BrightnessIndicator(this._configHelper, this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    /**
     * Called when the extension is disabled.
     * Destroys all objects created in enable().
     */
    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._configHelper = null;
    }
}
