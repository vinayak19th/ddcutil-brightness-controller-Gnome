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
            text: 'ddcutil', // Placeholder until loaded
        });
        generalGroup.add(ddcutilRow);

        const configGroup = new Adw.PreferencesGroup({
            title: 'Custom Commands configuration',
            description: 'Define multiple layout sliders per monitor, limits, and custom string templates directly via the generated configuration manifest.'
        });
        page.add(configGroup);

        const openBtn = new Gtk.Button({
            label: 'Open Config Layout in External Editor',
            margin_top: 12,
            margin_bottom: 12,
        });
        openBtn.connect('clicked', () => {
            try {
                let file = Gio.File.new_for_path(this._configHelper.configPath);
                let uri = file.get_uri();
                let launcher = new Gio.Subprocess({
                    argv: ['xdg-open', uri],
                    flags: Gio.SubprocessFlags.NONE
                });
                launcher.init(null);
                launcher.wait_async(null, null);
            } catch(e) {
                console.error('[Custom Brightness Prefs] Error launching xdg-open: ' + e.message);
            }
        });
        configGroup.add(openBtn);

        // Asynchronously hydrate GTK UI elements with config
        this._configHelper.loadConfig().then(configData => {
            this._currentConfig = configData;
            if (configData.ddcutilPath) {
                ddcutilRow.text = configData.ddcutilPath;
            }
            
            ddcutilRow.connect('notify::text', () => {
                this._currentConfig.ddcutilPath = ddcutilRow.text;
                this._configHelper.saveConfig(this._currentConfig);
            });
        }).catch(e => {
            console.error('[Custom Brightness Prefs] Failed to load config dynamically', e);
        });
    }
}
