import {DEFAULT_SETTINGS, normalizeSettings, resolveSiteEnabled, resolveSiteThemeMode, resolveThemeForSite, setSiteOverride, setSiteTheme, setSiteThemeMode, toThemeOptions} from './settings.mjs';

export const THEME_SETTING_KEYS = Object.freeze(Object.keys(toThemeOptions(DEFAULT_SETTINGS)).filter((key) => key !== 'mode' && key !== 'styleSystemControls'));
const GLOBAL_KEYS = new Set(['enabled', 'enabledByDefault', 'language']);
const NESTED_KEYS = new Set(['automation.mode', 'automation.activation', 'automation.deactivation', 'location.latitude', 'location.longitude']);

export function getPanelValue(settings, hostname, key, scope = 'global') {
    if (key === 'siteStyleMode') return resolveSiteThemeMode(settings, `https://${hostname}/`);
    if (key === 'siteEnabled') return resolveSiteEnabled(settings, `https://${hostname}/`);
    if (THEME_SETTING_KEYS.includes(key)) {
        if (scope === 'global') return settings[key];
        if (scope === 'site') return resolveThemeForSite(settings, `https://${hostname}/`)[key];
        throw new TypeError(`Unknown theme scope: ${scope}`);
    }
    if (NESTED_KEYS.has(key)) {
        const [group, field] = key.split('.');
        return settings[group][field];
    }
    if (GLOBAL_KEYS.has(key)) return settings[key];
    throw new TypeError(`Unknown panel setting: ${key}`);
}

export function changePanelSetting(settings, hostname, key, value, scope = 'global') {
    const current = normalizeSettings(settings);
    if (key === 'initialize') return normalizeSettings(DEFAULT_SETTINGS);
    if (key === 'siteEnabled') return setSiteOverride(current, hostname, value);
    if (key === 'siteStyleMode') return setSiteThemeMode(current, hostname, value);
    if (THEME_SETTING_KEYS.includes(key)) {
        if (scope === 'global') return normalizeSettings({...current, [key]: value});
        if (scope !== 'site') throw new TypeError(`Unknown theme scope: ${scope}`);
        if (getPanelValue(current, hostname, 'siteStyleMode') !== 'independent') {
            throw new TypeError('Site theme settings require independent style mode');
        }
        const siteTheme = Object.fromEntries(THEME_SETTING_KEYS.map((themeKey) => [
            themeKey,
            themeKey === key ? value : getPanelValue(current, hostname, themeKey, 'site'),
        ]));
        return setSiteTheme(current, hostname, siteTheme);
    }
    if (NESTED_KEYS.has(key)) {
        const [group, field] = key.split('.');
        return normalizeSettings({...current, [group]: {...current[group], [field]: value}});
    }
    if (GLOBAL_KEYS.has(key)) return normalizeSettings({...current, [key]: value});
    throw new TypeError(`Unknown panel setting: ${key}`);
}

export function isPanelSettingChanged(settings, hostname, key, scope = 'global') {
    return getPanelValue(settings, hostname, key, scope) !== getPanelValue(DEFAULT_SETTINGS, hostname, key, scope);
}

// Apply immediately; serialize storage and coalesce pending slider snapshots.
// Every caller still receives success/failure for the write covering its change.
export function createSettingsCommitter({apply, persist}) {
    let pending = null;
    let running = false;
    const drain = async () => {
        while (pending) {
            const batch = pending;
            pending = null;
            try {
                await persist(batch.settings);
                for (const waiter of batch.waiters) waiter.resolve();
            } catch (error) {
                for (const waiter of batch.waiters) waiter.reject(error);
            }
        }
        running = false;
    };
    return (value) => {
        const settings = normalizeSettings(value);
        apply(settings);
        const completion = new Promise((resolve, reject) => {
            const waiters = pending?.waiters || [];
            waiters.push({resolve, reject});
            pending = {settings, waiters};
        });
        if (!running) {
            running = true;
            void drain();
        }
        return completion;
    };
}
