import {DEFAULT_SETTINGS, normalizeSettings, resolveSiteEnabled, resolveThemeForSite, setSiteOverride, setSiteTheme, toThemeOptions} from './settings.mjs';

export const THEME_SETTING_KEYS = Object.freeze(Object.keys(toThemeOptions(DEFAULT_SETTINGS)));
const GLOBAL_KEYS = new Set(['enabled', 'enabledByDefault', 'language']);
const NESTED_KEYS = new Set(['automation.mode', 'automation.behavior', 'automation.activation', 'automation.deactivation', 'location.latitude', 'location.longitude']);

export function getPanelValue(settings, hostname, key) {
    if (key === 'siteThemeOnly') return Object.hasOwn(settings.siteThemes, hostname);
    if (key === 'siteEnabled') return resolveSiteEnabled(settings, `https://${hostname}/`);
    if (THEME_SETTING_KEYS.includes(key)) {
        const theme = getPanelValue(settings, hostname, 'siteThemeOnly')
            ? resolveThemeForSite(settings, `https://${hostname}/`)
            : settings;
        return theme[key];
    }
    if (NESTED_KEYS.has(key)) {
        const [group, field] = key.split('.');
        return settings[group][field];
    }
    if (GLOBAL_KEYS.has(key)) return settings[key];
    throw new TypeError(`Unknown panel setting: ${key}`);
}

export function changePanelSetting(settings, hostname, key, value) {
    const current = normalizeSettings(settings);
    if (key === 'initialize') return normalizeSettings(DEFAULT_SETTINGS);
    if (key === 'siteEnabled') return setSiteOverride(current, hostname, value);
    if (key === 'siteThemeOnly') {
        return setSiteTheme(current, hostname, value, toThemeOptions(resolveThemeForSite(current, `https://${hostname}/`)));
    }
    if (THEME_SETTING_KEYS.includes(key)) {
        return getPanelValue(current, hostname, 'siteThemeOnly')
            ? setSiteTheme(current, hostname, true, {...current.siteThemes[hostname], [key]: value})
            : normalizeSettings({...current, [key]: value});
    }
    if (NESTED_KEYS.has(key)) {
        const [group, field] = key.split('.');
        return normalizeSettings({...current, [group]: {...current[group], [field]: value}});
    }
    if (GLOBAL_KEYS.has(key)) return normalizeSettings({...current, [key]: value});
    throw new TypeError(`Unknown panel setting: ${key}`);
}

function canonicalValue(value) {
    if (typeof value !== 'string' || !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) return value;
    const hex = value.toLowerCase();
    return hex.length === 4 ? `#${[...hex.slice(1)].map((character) => character + character).join('')}` : hex;
}

export function isPanelSettingChanged(settings, hostname, key) {
    return canonicalValue(getPanelValue(settings, hostname, key)) !== canonicalValue(getPanelValue(DEFAULT_SETTINGS, hostname, key));
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
