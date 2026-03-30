import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const CONFIG_DIR_NAME = 'custom-brightness-controller';
const CONFIG_FILE_NAME = 'config.json';

export class ConfigHelper {
    constructor() {
        this.configPath = this._getConfigPath();
    }

    _getConfigPath() {
        const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), CONFIG_DIR_NAME]);
        if (!GLib.file_test(configDir, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(configDir, 0o755);
        }
        return GLib.build_filenamev([configDir, CONFIG_FILE_NAME]);
    }

    async loadConfig() {
        let file = Gio.File.new_for_path(this.configPath);
        if (!file.query_exists(null)) {
            return await this._generateDefaultConfig();
        }

        try {
            const [, contents] = file.load_contents(null);
            const decoder = new TextDecoder('utf-8');
            const data = decoder.decode(contents);
            let parsed = JSON.parse(data);
            if (!parsed.ddcutilPath) {
                parsed.ddcutilPath = 'ddcutil';
                this.saveConfig(parsed);
            }
            return parsed;
        } catch (e) {
            console.error(`[Custom Brightness] Error parsing config: ${e.message}`);
            return { ddcutilPath: 'ddcutil', monitors: [] };
        }
    }

    saveConfig(configData) {
        try {
            let file = Gio.File.new_for_path(this.configPath);
            let contents = JSON.stringify(configData, null, 2);
            let encoder = new TextEncoder();
            let uint8Array = encoder.encode(contents);
            file.replace_contents(
                uint8Array,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            console.error(`[Custom Brightness] Error saving config: ${e.message}`);
        }
    }

    async _generateDefaultConfig() {
        return new Promise((resolve) => {
            try {
                let proc = new Gio.Subprocess({
                    argv: ['ddcutil', 'detect', '--terse'],
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                });

                proc.init(null);

                proc.communicate_utf8_async(null, null, (proc, res) => {
                    try {
                        let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                        let config = this._parseDdcutilDetectToConfig(stdout || '');
                        this.saveConfig(config);
                        resolve(config);
                    } catch (e) {
                        console.error('[Custom Brightness] Error reading ddcutil detect: ' + e.message);
                        let fallback = { ddcutilPath: 'ddcutil', monitors: [] };
                        this.saveConfig(fallback);
                        resolve(fallback);
                    }
                });
            } catch (e) {
                console.error('[Custom Brightness] Error spawning ddcutil: ' + e.message);
                let fallback = { ddcutilPath: 'ddcutil', monitors: [] };
                this.saveConfig(fallback);
                resolve(fallback);
            }
        });
    }

    _parseDdcutilDetectToConfig(output) {
        let config = { ddcutilPath: 'ddcutil', monitors: [] };
        let currentDisplayId = null;
        let currentMonitorName = null;

        let lines = output.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('Display ')) {
                currentDisplayId = line.replace('Display ', '').trim();
            } else if (line.startsWith('Monitor:')) {
                currentMonitorName = line.replace('Monitor:', '').trim();
                
                if (currentDisplayId && currentMonitorName) {
                    config.monitors.push({
                        id: currentMonitorName,
                        displayId: parseInt(currentDisplayId, 10),
                        sliders: [
                            {
                                name: "Brightness",
                                command: `ddcutil setvcp 10 \${VAL} --display ${currentDisplayId}`,
                                min: 0,
                                max: 100,
                                lastValue: 50
                            },
                            {
                                name: "Contrast",
                                command: `ddcutil setvcp 12 \${VAL} --display ${currentDisplayId}`,
                                min: 0,
                                max: 100,
                                lastValue: 50
                            }
                        ]
                    });
                    currentDisplayId = null;
                    currentMonitorName = null;
                }
            }
        }
        
        return config;
    }

    executeCommand(commandTemplate, value, ddcutilPath = 'ddcutil') {
        // Simple string replacement if the user wrote "ddcutil" directly in their template vs parameterized
        const command = commandTemplate.replace('${VAL}', value.toString()).replace(/^ddcutil(\s)/, ddcutilPath + '$1');
        try {
            let proc = new Gio.Subprocess({
                argv: ['sh', '-c', command],
                flags: Gio.SubprocessFlags.NONE,
            });
            proc.init(null);
            proc.wait_async(null, null);
        } catch (e) {
            console.error(`[Custom Brightness] Error executing cmd ${command}: ${e.message}`);
        }
    }
}
