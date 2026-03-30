/* configHelper.js - Configuration management for ddcutil Brightness Controller
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* GI Libraries */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';


const CONFIG_DIR_NAME = 'custom-brightness-controller';
const CONFIG_FILE_NAME = 'config.json';


/**
 * Helper class for loading, saving, and auto-generating the extension's
 * JSON configuration file, as well as executing ddcutil commands.
 */
export class ConfigHelper {
    constructor() {
        this.configPath = this._getConfigPath();
    }

    /**
     * Build the full path to the config file, creating the parent
     * directory if it does not exist.
     *
     * @returns {string} absolute path to config.json
     */
    _getConfigPath() {
        const configDir = GLib.build_filenamev([
            GLib.get_user_config_dir(), CONFIG_DIR_NAME,
        ]);
        if (!GLib.file_test(configDir, GLib.FileTest.EXISTS))
            GLib.mkdir_with_parents(configDir, 0o755);

        return GLib.build_filenamev([configDir, CONFIG_FILE_NAME]);
    }

    /**
     * Load the config from disk. If the file does not exist, generate a
     * default config by running `ddcutil detect --terse`.
     *
     * @returns {Promise<Object>} the parsed config object
     */
    async loadConfig() {
        const file = Gio.File.new_for_path(this.configPath);
        if (!file.query_exists(null))
            return await this._generateDefaultConfig();

        try {
            const [, contents] = file.load_contents(null);
            const decoder = new TextDecoder('utf-8');
            const data = decoder.decode(contents);
            const parsed = JSON.parse(data);

            if (!parsed.ddcutilPath) {
                parsed.ddcutilPath = 'ddcutil';
                this.saveConfig(parsed);
            }
            return parsed;
        } catch (e) {
            console.error(
                `[Brightness Controller] Error parsing config: ${e.message}`
            );
            return {ddcutilPath: 'ddcutil', monitors: []};
        }
    }

    /**
     * Persist the config object to disk as formatted JSON.
     *
     * @param {Object} configData - the config to save
     */
    saveConfig(configData) {
        try {
            const file = Gio.File.new_for_path(this.configPath);
            const contents = JSON.stringify(configData, null, 2);
            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(contents);

            file.replace_contents(
                uint8Array,
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            console.error(
                `[Brightness Controller] Error saving config: ${e.message}`
            );
        }
    }

    /**
     * Generate a default config by running `ddcutil detect --terse` and
     * parsing the output into a monitor list with brightness/contrast
     * sliders.
     *
     * @returns {Promise<Object>} the generated config object
     */
    async _generateDefaultConfig() {
        return new Promise(resolve => {
            try {
                const proc = new Gio.Subprocess({
                    argv: ['ddcutil', 'detect', '--terse'],
                    flags: Gio.SubprocessFlags.STDOUT_PIPE |
                           Gio.SubprocessFlags.STDERR_PIPE,
                });

                proc.init(null);

                proc.communicate_utf8_async(null, null, (p, res) => {
                    try {
                        const [, stdout] = p.communicate_utf8_finish(res);
                        const config =
                            this._parseDdcutilDetectToConfig(stdout || '');
                        this.saveConfig(config);
                        resolve(config);
                    } catch (e) {
                        console.error(
                            '[Brightness Controller] Error reading ddcutil detect: ' +
                            e.message
                        );
                        const fallback = {
                            ddcutilPath: 'ddcutil', monitors: [],
                        };
                        this.saveConfig(fallback);
                        resolve(fallback);
                    }
                });
            } catch (e) {
                console.error(
                    '[Brightness Controller] Error spawning ddcutil: ' +
                    e.message
                );
                const fallback = {ddcutilPath: 'ddcutil', monitors: []};
                this.saveConfig(fallback);
                resolve(fallback);
            }
        });
    }

    /**
     * Parse the terse output of `ddcutil detect` into a config object.
     *
     * @param {string} output - stdout from ddcutil detect --terse
     * @returns {Object} config with monitors array
     */
    _parseDdcutilDetectToConfig(output) {
        const config = {ddcutilPath: 'ddcutil', monitors: []};
        let currentDisplayId = null;
        let currentMonitorName = null;

        const lines = output.split('\n');
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
                                name: 'Brightness',
                                command: `ddcutil setvcp 10 \${VAL} --display ${currentDisplayId}`,
                                min: 0,
                                max: 100,
                                lastValue: 50,
                            },
                            {
                                name: 'Contrast',
                                command: `ddcutil setvcp 12 \${VAL} --display ${currentDisplayId}`,
                                min: 0,
                                max: 100,
                                lastValue: 50,
                            },
                        ],
                    });
                    currentDisplayId = null;
                    currentMonitorName = null;
                }
            }
        }

        return config;
    }

    /**
     * Execute a ddcutil command by substituting `${VAL}` in the template
     * and optionally replacing the `ddcutil` binary path.
     *
     * @param {string} commandTemplate - the command string with ${VAL} placeholder
     * @param {number} value - the value to substitute
     * @param {string} [ddcutilPath='ddcutil'] - path to the ddcutil binary
     */
    executeCommand(commandTemplate, value, ddcutilPath = 'ddcutil') {
        const command = commandTemplate
            .replace('${VAL}', value.toString())
            .replace(/^ddcutil(\s)/, ddcutilPath + '$1');

        try {
            const proc = new Gio.Subprocess({
                argv: ['sh', '-c', command],
                flags: Gio.SubprocessFlags.NONE,
            });
            proc.init(null);
            proc.wait_async(null, null);
        } catch (e) {
            console.error(
                `[Brightness Controller] Error executing cmd ${command}: ` +
                e.message
            );
        }
    }
}
