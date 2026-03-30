import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Slider } from 'resource:///org/gnome/shell/ui/slider.js';
import St from 'gi://St';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { ConfigHelper } from './configHelper.js';

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

const BrightnessIndicator = GObject.registerClass(
class BrightnessIndicator extends PanelMenu.Button {
    constructor(configHelper) {
        super(0.0, 'Brightness Manager', false);
        this._configHelper = configHelper;
        this._configData = null;
        this._debounceTimers = [];

        let icon = new St.Icon({
            icon_name: 'display-brightness-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        this._buildMenu();
    }

    async _buildMenu() {
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Loading config...'));

        this._configData = await this._configHelper.loadConfig();
        
        this.menu.removeAll();

        if (!this._configData.monitors || this._configData.monitors.length === 0) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No monitors found in config'));
            return;
        }

        for (let monitor of this._configData.monitors) {
            let header = new PopupMenu.PopupMenuItem(`[Display ${monitor.displayId}] ${monitor.id}`);
            header.sensitive = false; // Make it look just like a label
            this.menu.addMenuItem(header);

            if (monitor.sliders) {
                for (let sliderConfig of monitor.sliders) {
                    let min = sliderConfig.min !== undefined ? sliderConfig.min : 0;
                    let max = sliderConfig.max !== undefined ? sliderConfig.max : 100;
                    let val = sliderConfig.lastValue !== undefined ? sliderConfig.lastValue : 50;
                    
                    let labelItem = new PopupMenu.PopupMenuItem(`${sliderConfig.name}`);
                    labelItem.sensitive = false;
                    this.menu.addMenuItem(labelItem);

                    // GNOME sliders use 0.0 to 1.0 range
                    let normalizedValue = (val - min) / (max - min);
                    let sliderItem = new PopupMenu.PopupBaseMenuItem({ activate: false });
                    let slider = new Slider(normalizedValue);
                    slider.x_expand = true;
                    sliderItem.add_child(slider);
                    
                    this.menu.addMenuItem(sliderItem);

                    // Setup debouncer for this specific slider (delay 400ms)
                    let timer = new DebounceTimer(400, (newValue) => {
                        let actualValue = Math.round(min + (newValue * (max - min)));
                        sliderConfig.lastValue = actualValue;
                        
                        this._configHelper.executeCommand(sliderConfig.command, actualValue, this._configData.ddcutilPath);
                        this._configHelper.saveConfig(this._configData);
                    });
                    
                    this._debounceTimers.push(timer);

                    slider.connect('notify::value', () => {
                        timer.trigger(slider.value);
                    });
                }
            }
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        let refreshItem = new PopupMenu.PopupMenuItem('Refresh UI Config');
        refreshItem.connect('activate', () => {
            this._buildMenu();
        });
        this.menu.addMenuItem(refreshItem);

        let detectItem = new PopupMenu.PopupMenuItem('Reload Monitors (ddcutil detect)');
        detectItem.connect('activate', async () => {
            this.menu.removeAll();
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Running ddcutil detect...'));
            await this._configHelper._generateDefaultConfig();
            this._buildMenu();
        });
        this.menu.addMenuItem(detectItem);
    }

    destroy() {
        for (let timer of this._debounceTimers) {
            timer.destroy();
        }
        this._debounceTimers = [];
        super.destroy();
    }
});

export default class CustomBrightnessExtension extends Extension {
    enable() {
        this._configHelper = new ConfigHelper();
        this._indicator = new BrightnessIndicator(this._configHelper);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._configHelper = null;
    }
}
