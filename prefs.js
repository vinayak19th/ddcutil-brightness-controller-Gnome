import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { ConfigHelper } from './configHelper.js';

export default class BrightnessPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._configHelper = new ConfigHelper();
        this._currentConfig = { ddcutilPath: 'ddcutil', monitors: [] };

        const page = new Adw.PreferencesPage();
        window.add(page);

        const generalGroup = new Adw.PreferencesGroup({
            title: 'General',
        });
        page.add(generalGroup);

        const ddcutilRow = new Adw.EntryRow({
            title: 'Environment Path to ddcutil',
            text: 'ddcutil',
        });
        generalGroup.add(ddcutilRow);

        const monitorsGroup = new Adw.PreferencesGroup({
            title: 'Monitors Configuration',
            description: 'Define multiple layout sliders per monitor, limits, and custom string templates.'
        });
        page.add(monitorsGroup);
        
        let _saveTimeoutId = null;
        const saveConfig = () => {
            if (_saveTimeoutId) {
                GLib.source_remove(_saveTimeoutId);
            }
            _saveTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._configHelper.saveConfig(this._currentConfig);
                _saveTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        };

        const createSliderRow = (monitor, slider, sliderIndex, sliderParentExpander) => {
            let sliderRow = new Adw.ExpanderRow({ title: `Slider: ${slider.name || 'Unnamed'}` });
            
            let nameRow = new Adw.EntryRow({ title: 'Name', text: slider.name || '' });
            nameRow.connect('notify::text', () => { slider.name = nameRow.text; sliderRow.title = `Slider: ${slider.name}`; saveConfig(); });
            sliderRow.add_row(nameRow);
            
            let cmdRow = new Adw.EntryRow({ title: 'Command', text: slider.command || '' });
            cmdRow.connect('notify::text', () => { slider.command = cmdRow.text; saveConfig(); });
            sliderRow.add_row(cmdRow);
            
            let minRow = new Adw.EntryRow({ title: 'Min Value', text: slider.min != null ? slider.min.toString() : '0' });
            minRow.connect('notify::text', () => { slider.min = parseInt(minRow.text, 10); saveConfig(); });
            sliderRow.add_row(minRow);
            
            let maxRow = new Adw.EntryRow({ title: 'Max Value', text: slider.max != null ? slider.max.toString() : '100' });
            maxRow.connect('notify::text', () => { slider.max = parseInt(maxRow.text, 10); saveConfig(); });
            sliderRow.add_row(maxRow);
            
            let removeBtnRow = new Adw.ActionRow({ title: 'Remove Slider' });
            let removeBtn = new Gtk.Button({ label: 'Remove', valign: Gtk.Align.CENTER });
            removeBtn.add_css_class('destructive-action');
            removeBtn.connect('clicked', () => {
                let actualIndex = monitor.sliders.indexOf(slider);
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

        const createMonitorRow = (monitor, monitorIndex) => {
            let monitorRow = new Adw.ExpanderRow({
                title: `Monitor: ${monitor.id || 'Unknown'} (Display ${monitor.displayId != null ? monitor.displayId : '?'})`
            });
            
            let idRow = new Adw.EntryRow({ title: 'Monitor ID', text: monitor.id || '' });
            idRow.connect('notify::text', () => { monitor.id = idRow.text; monitorRow.title = `Monitor: ${monitor.id} (Display ${monitor.displayId})`; saveConfig(); });
            monitorRow.add_row(idRow);
            
            let displayIdRow = new Adw.EntryRow({ title: 'Display ID', text: (monitor.displayId != null) ? monitor.displayId.toString() : '' });
            displayIdRow.connect('notify::text', () => { monitor.displayId = parseInt(displayIdRow.text, 10) || 0; monitorRow.title = `Monitor: ${monitor.id} (Display ${monitor.displayId})`; saveConfig(); });
            monitorRow.add_row(displayIdRow);
            
            if (monitor.sliders) {
                monitor.sliders.forEach((slider, sIndex) => {
                    let sRow = createSliderRow(monitor, slider, sIndex, monitorRow);
                    monitorRow.add_row(sRow);
                });
            }
            
            let addSliderRow = new Adw.ActionRow({ title: 'Add New Slider' });
            let addSliderBtn = new Gtk.Button({ label: 'Add Slider', valign: Gtk.Align.CENTER });
            addSliderBtn.connect('clicked', () => {
                 monitor.sliders = monitor.sliders || [];
                 let newSlider = { name: 'New Slider', command: `ddcutil setvcp 10 \${VAL} --display ${monitor.displayId}`, min: 0, max: 100, lastValue: 50 };
                 monitor.sliders.push(newSlider);
                 saveConfig();
                 let newSRow = createSliderRow(monitor, newSlider, monitor.sliders.length - 1, monitorRow);
                 // We add before the 'addSliderRow' to keep buttons at the bottom theoretically
                 // But AdwExpanderRow.add_row only appends. This means the newly added slider appears below the Add button.
                 // This is acceptable constraint given gtk bindings.
                 monitorRow.add_row(newSRow);
            });
            addSliderRow.add_suffix(addSliderBtn);
            monitorRow.add_row(addSliderRow);
            
            let removeMonitorRow = new Adw.ActionRow({ title: 'Remove Monitor' });
            let removeMonitorBtn = new Gtk.Button({ label: 'Remove Monitor', valign: Gtk.Align.CENTER });
            removeMonitorBtn.add_css_class('destructive-action');
            removeMonitorBtn.connect('clicked', () => {
                let actualIndex = this._currentConfig.monitors.indexOf(monitor);
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

        const addMonitorBtnRow = new Adw.ActionRow({ title: 'Add New Monitor' });
        const addMonitorBtn = new Gtk.Button({ label: 'Add Monitor', valign: Gtk.Align.CENTER });
        addMonitorBtn.connect('clicked', () => {
             this._currentConfig.monitors = this._currentConfig.monitors || [];
             let newMonitor = { id: 'New Monitor', displayId: 1, sliders: [] };
             this._currentConfig.monitors.push(newMonitor);
             saveConfig();
             let newMRow = createMonitorRow(newMonitor, this._currentConfig.monitors.length - 1);
             monitorsGroup.add(newMRow);
        });
        addMonitorBtnRow.add_suffix(addMonitorBtn);
        // Place the add monitor button row in its own generic group at bottom
        const bottomGroup = new Adw.PreferencesGroup();
        bottomGroup.add(addMonitorBtnRow);
        page.add(bottomGroup);

        this._configHelper.loadConfig().then(configData => {
            this._currentConfig = configData;
            if (configData.ddcutilPath) {
                ddcutilRow.text = configData.ddcutilPath;
            }
            
            if (this._currentConfig.monitors) {
                this._currentConfig.monitors.forEach((mon, idx) => {
                    let mRow = createMonitorRow(mon, idx);
                    monitorsGroup.add(mRow);
                });
            }
            
            ddcutilRow.connect('notify::text', () => {
                this._currentConfig.ddcutilPath = ddcutilRow.text;
                saveConfig();
            });
        }).catch(e => {
            console.error('[Custom Brightness Prefs] Failed to load config dynamically', e);
        });
    }
}
