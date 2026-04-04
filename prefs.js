/* prefs.js - ddcutil Brightness Controller Preferences
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* GI Libraries */
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';

/* GNOME Shell Extensions prefs module */
import {ExtensionPreferences}
    from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/* Extension modules */
import {ConfigHelper} from './configHelper.js';


/**
 * Preferences window for the Brightness Controller extension.
 *
 * Uses GTK4 + Adwaita widgets to present a monitor/slider configuration
 * editor backed by the shared JSON config file.
 */
export default class BrightnessPrefs extends ExtensionPreferences {
    /**
     * Fill the preferences window with configuration widgets.
     *
     * @param {Adw.PreferencesWindow} window - the preferences window
     */
    fillPreferencesWindow(window) {
        this._configHelper = new ConfigHelper();
        this._currentConfig = {ddcutilPath: 'ddcutil', monitors: []};

        window.connect('close-request', () => {
            this._configHelper = null;
            this._currentConfig = null;
        });

        const page = new Adw.PreferencesPage();
        window.add(page);

        // --- General group ---
        const generalGroup = new Adw.PreferencesGroup({
            title: 'General',
        });
        page.add(generalGroup);

        const ddcutilRow = new Adw.EntryRow({
            title: 'Environment Path to ddcutil',
            text: 'ddcutil',
        });
        generalGroup.add(ddcutilRow);

        // --- Monitors group ---
        const monitorsGroup = new Adw.PreferencesGroup({
            title: 'Monitors Configuration',
            description:
                'Define multiple layout sliders per monitor, limits, and custom string templates.',
        });
        page.add(monitorsGroup);

        // Save is deferred to the explicit Save button to prevent IO hangs.
        const saveConfig = () => {};

        /**
         * Create an expandable row for a single slider within a monitor.
         */
        const createSliderRow = (monitor, slider, sliderIndex, sliderParentExpander) => {
            const sliderRow = new Adw.ExpanderRow({
                title: `Slider: ${slider.name || 'Unnamed'}`,
            });

            const nameRow = new Adw.EntryRow({
                title: 'Name',
                text: slider.name || '',
            });
            nameRow.connect('notify::text', () => {
                slider.name = nameRow.text;
                sliderRow.title = `Slider: ${slider.name}`;
                saveConfig();
            });
            sliderRow.add_row(nameRow);

            const cmdRow = new Adw.EntryRow({
                title: 'Command',
                text: slider.command || '',
            });
            cmdRow.connect('notify::text', () => {
                slider.command = cmdRow.text;
                saveConfig();
            });
            sliderRow.add_row(cmdRow);

            const minRow = new Adw.EntryRow({
                title: 'Min Value',
                text: slider.min != null ? slider.min.toString() : '0',
            });
            minRow.connect('notify::text', () => {
                slider.min = parseInt(minRow.text, 10);
                saveConfig();
            });
            sliderRow.add_row(minRow);

            const maxRow = new Adw.EntryRow({
                title: 'Max Value',
                text: slider.max != null ? slider.max.toString() : '100',
            });
            maxRow.connect('notify::text', () => {
                slider.max = parseInt(maxRow.text, 10);
                saveConfig();
            });
            sliderRow.add_row(maxRow);

            const removeBtnRow = new Adw.ActionRow({title: 'Remove Slider'});
            const removeBtn = new Gtk.Button({
                label: 'Remove',
                valign: Gtk.Align.CENTER,
            });
            removeBtn.add_css_class('destructive-action');
            removeBtn.connect('clicked', () => {
                const actualIndex = monitor.sliders.indexOf(slider);
                if (actualIndex > -1) {
                    monitor.sliders.splice(actualIndex, 1);
                    saveConfig();
                    sliderParentExpander.remove(sliderRow);
                }
            });
            removeBtnRow.add_suffix(removeBtn);
            sliderRow.add_row(removeBtnRow);

            return sliderRow;
        };

        /**
         * Create an expandable row for a single monitor.
         */
        const createMonitorRow = (monitor, monitorIndex) => {
            const monitorRow = new Adw.ExpanderRow({
                title: `Monitor: ${monitor.id || 'Unknown'} ` +
                    `(Display ${monitor.displayId != null ? monitor.displayId : '?'})`,
            });

            const idRow = new Adw.EntryRow({
                title: 'Monitor ID',
                text: monitor.id || '',
            });
            idRow.connect('notify::text', () => {
                monitor.id = idRow.text;
                monitorRow.title =
                    `Monitor: ${monitor.id} (Display ${monitor.displayId})`;
                saveConfig();
            });
            monitorRow.add_row(idRow);

            const displayIdRow = new Adw.EntryRow({
                title: 'Display ID',
                text: monitor.displayId != null
                    ? monitor.displayId.toString() : '',
            });
            displayIdRow.connect('notify::text', () => {
                monitor.displayId = parseInt(displayIdRow.text, 10) || 0;
                monitorRow.title =
                    `Monitor: ${monitor.id} (Display ${monitor.displayId})`;
                saveConfig();
            });
            monitorRow.add_row(displayIdRow);

            if (monitor.sliders) {
                monitor.sliders.forEach((slider, sIndex) => {
                    const sRow = createSliderRow(
                        monitor, slider, sIndex, monitorRow
                    );
                    monitorRow.add_row(sRow);
                });
            }

            const addSliderRow = new Adw.ActionRow({
                title: 'Add New Slider',
            });
            const addSliderBtn = new Gtk.Button({
                label: 'Add Slider',
                valign: Gtk.Align.CENTER,
            });
            addSliderBtn.connect('clicked', () => {
                monitor.sliders = monitor.sliders || [];
                const newSlider = {
                    name: 'New Slider',
                    command: `ddcutil setvcp 10 \${VAL} --display ${monitor.displayId}`,
                    min: 0,
                    max: 100,
                    lastValue: 50,
                };
                monitor.sliders.push(newSlider);
                saveConfig();
                const newSRow = createSliderRow(
                    monitor, newSlider, monitor.sliders.length - 1, monitorRow
                );
                monitorRow.add_row(newSRow);
            });
            addSliderRow.add_suffix(addSliderBtn);
            monitorRow.add_row(addSliderRow);

            const removeMonitorRow = new Adw.ActionRow({
                title: 'Remove Monitor',
            });
            const removeMonitorBtn = new Gtk.Button({
                label: 'Remove Monitor',
                valign: Gtk.Align.CENTER,
            });
            removeMonitorBtn.add_css_class('destructive-action');
            removeMonitorBtn.connect('clicked', () => {
                const actualIndex =
                    this._currentConfig.monitors.indexOf(monitor);
                if (actualIndex > -1) {
                    this._currentConfig.monitors.splice(actualIndex, 1);
                    saveConfig();
                    monitorsGroup.remove(monitorRow);
                }
            });
            removeMonitorRow.add_suffix(removeMonitorBtn);
            monitorRow.add_row(removeMonitorRow);

            return monitorRow;
        };

        // --- Bottom actions group ---
        const addMonitorBtnRow = new Adw.ActionRow({
            title: 'Add New Monitor',
        });
        const addMonitorBtn = new Gtk.Button({
            label: 'Add Monitor',
            valign: Gtk.Align.CENTER,
        });
        addMonitorBtn.connect('clicked', () => {
            this._currentConfig.monitors = this._currentConfig.monitors || [];
            const newMonitor = {id: 'New Monitor', displayId: 1, sliders: []};
            this._currentConfig.monitors.push(newMonitor);
            saveConfig();
            const newMRow = createMonitorRow(
                newMonitor, this._currentConfig.monitors.length - 1
            );
            monitorsGroup.add(newMRow);
        });
        addMonitorBtnRow.add_suffix(addMonitorBtn);

        const bottomGroup = new Adw.PreferencesGroup();
        bottomGroup.add(addMonitorBtnRow);

        const actionRow = new Adw.ActionRow({
            title: 'Save or Discard Changes',
        });

        const saveBtn = new Gtk.Button({
            label: 'Save',
            valign: Gtk.Align.CENTER,
        });
        saveBtn.add_css_class('suggested-action');
        saveBtn.connect('clicked', () => {
            this._configHelper.saveConfig(this._currentConfig);
            window.close();
        });
        actionRow.add_suffix(saveBtn);

        const cancelBtn = new Gtk.Button({
            label: 'Cancel',
            valign: Gtk.Align.CENTER,
        });
        cancelBtn.connect('clicked', () => {
            window.close();
        });
        actionRow.add_suffix(cancelBtn);

        bottomGroup.add(actionRow);
        page.add(bottomGroup);

        // Load config asynchronously and populate the UI
        this._configHelper.loadConfig().then(configData => {
            this._currentConfig = configData;
            if (configData.ddcutilPath)
                ddcutilRow.text = configData.ddcutilPath;

            if (this._currentConfig.monitors) {
                this._currentConfig.monitors.forEach((mon, idx) => {
                    const mRow = createMonitorRow(mon, idx);
                    monitorsGroup.add(mRow);
                });
            }

            ddcutilRow.connect('notify::text', () => {
                this._currentConfig.ddcutilPath = ddcutilRow.text;
                saveConfig();
            });
        }).catch(e => {
            console.error(
                '[Brightness Controller Prefs] Failed to load config', e
            );
        });
    }
}
