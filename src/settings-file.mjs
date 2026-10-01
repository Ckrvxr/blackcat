import {normalizeSettings} from './settings.mjs';

const FORMAT = 'blackcat-settings';
const VERSION = 1;
export const MAX_SETTINGS_FILE_BYTES = 10 * 1024 * 1024;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function serializeSettingsFile(value) {
    return `${JSON.stringify({
        format: FORMAT,
        version: VERSION,
        settings: normalizeSettings(value),
    }, null, 2)}\n`;
}

export function parseSettingsFile(text) {
    if (typeof text !== 'string') throw new TypeError('Configuration file must contain JSON text');
    if (text.length > MAX_SETTINGS_FILE_BYTES) throw new RangeError('Configuration file is too large');
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new TypeError('Configuration file contains invalid JSON');
    }
    if (!isRecord(parsed) || parsed.format !== FORMAT) {
        throw new TypeError('Not a Blackcat configuration file');
    }
    if (parsed.version !== VERSION) throw new TypeError('Unsupported configuration file version');
    if (!isRecord(parsed.settings)) throw new TypeError('Configuration file settings must be an object');
    return normalizeSettings(parsed.settings);
}
