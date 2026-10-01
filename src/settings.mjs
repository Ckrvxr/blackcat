export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    enabledByDefault: true,
    language: 'auto',
    engine: 'dynamicTheme',
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    sepia: 0,
    detectDarkTheme: true,
    automation: Object.freeze({
        mode: 'system',
        activation: '18:00',
        deactivation: '09:00',
    }),
    location: Object.freeze({latitude: null, longitude: null}),
    siteOverrides: Object.freeze({}),
    siteThemes: Object.freeze({}),
    siteThemeModes: Object.freeze({}),
});

const ENGINES = new Set(['dynamicTheme', 'cssFilter', 'svgFilter', 'staticTheme']);
const AUTOMATION_MODES = new Set(['none', 'system', 'time', 'location']);
const LANGUAGE_PREFERENCES = new Set(['auto', 'en', 'zh-CN']);
const THEME_RANGES = Object.freeze({
    brightness: [50, 150],
    contrast: [50, 150],
    grayscale: [0, 100],
    sepia: [0, 100],
});
const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])$/i;
const THEME_KEYS = [...Object.keys(THEME_RANGES), 'engine', 'detectDarkTheme'];

function finiteNumber(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, value));
}

function normalizeTime(value, fallback) {
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        return fallback;
    }
    return value;
}

function normalizeCoordinate(value, min, max) {
    if (value === null || value === undefined || value === '') return null;
    const coordinate = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function validHostPattern(host) {
    return HOST_PATTERN.test(host) && !host.includes('..') && !host.startsWith('.') && !host.endsWith('.') && !host.includes('.-') && !host.includes('-.');
}

function normalizeSiteOverrides(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([host, enabled]) => validHostPattern(host) && typeof enabled === 'boolean')
            .map(([host, enabled]) => [host.toLowerCase(), enabled]),
    );
}

function normalizeThemePatch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const input = Object.fromEntries(THEME_KEYS.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
    const normalized = normalizeSettings(input);
    return Object.fromEntries(Object.keys(input).map((key) => [key, normalized[key]]));
}

function normalizeSiteThemes(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
        .filter(([host, theme]) => validHostPattern(host) && Boolean(theme) && typeof theme === 'object' && !Array.isArray(theme))
        .map(([host, theme]) => [host.toLowerCase(), normalizeThemePatch(theme)])
        .filter(([, theme]) => Object.keys(theme).length > 0));
}

function normalizeSiteThemeModes(value, siteThemes, inferLegacyModes) {
    const modes = value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value)
            .filter(([host, mode]) => validHostPattern(host) && ['global', 'independent'].includes(mode))
            .map(([host, mode]) => [host.toLowerCase(), mode]))
        : {};
    if (inferLegacyModes) {
        for (const host of Object.keys(siteThemes)) {
            if (!Object.hasOwn(modes, host)) modes[host] = 'independent';
        }
    }
    return modes;
}

function resolveHostRecord(records, hostname) {
    if (Object.hasOwn(records, hostname)) return records[hostname];
    const wildcard = Object.keys(records)
        .filter((host) => host.startsWith('*.') && hostname.endsWith(host.slice(1)))
        .sort((a, b) => b.length - a.length)[0];
    return wildcard ? records[wildcard] : undefined;
}

export function normalizeSettings(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const automation = input.automation && typeof input.automation === 'object' ? input.automation : {};
    const siteThemes = normalizeSiteThemes(input.siteThemes);
    const siteThemeModes = normalizeSiteThemeModes(input.siteThemeModes, siteThemes, !Object.hasOwn(input, 'siteThemeModes'));
    return {
        ...DEFAULT_SETTINGS,
        ...Object.fromEntries(Object.entries(THEME_RANGES).map(([key, [min, max]]) => [
            key,
            finiteNumber(input[key], DEFAULT_SETTINGS[key], min, max),
        ])),
        enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
        enabledByDefault: typeof input.enabledByDefault === 'boolean' ? input.enabledByDefault : DEFAULT_SETTINGS.enabledByDefault,
        language: LANGUAGE_PREFERENCES.has(input.language) ? input.language : DEFAULT_SETTINGS.language,
        engine: ENGINES.has(input.engine) ? input.engine : DEFAULT_SETTINGS.engine,
        detectDarkTheme: typeof input.detectDarkTheme === 'boolean' ? input.detectDarkTheme : DEFAULT_SETTINGS.detectDarkTheme,
        automation: {
            mode: AUTOMATION_MODES.has(automation.mode) ? automation.mode : DEFAULT_SETTINGS.automation.mode,
            activation: normalizeTime(automation.activation, DEFAULT_SETTINGS.automation.activation),
            deactivation: normalizeTime(automation.deactivation, DEFAULT_SETTINGS.automation.deactivation),
        },
        location: {
            latitude: normalizeCoordinate(input.location?.latitude, -90, 90),
            longitude: normalizeCoordinate(input.location?.longitude, -180, 180),
        },
        siteOverrides: normalizeSiteOverrides(input.siteOverrides),
        siteThemes,
        siteThemeModes,
    };
}

export function toThemeOptions(value) {
    const settings = normalizeSettings(value);
    return {
        engine: settings.engine,
        mode: 1,
        brightness: settings.brightness,
        contrast: settings.contrast,
        grayscale: settings.grayscale,
        sepia: settings.sepia,
        styleSystemControls: false,
        detectDarkTheme: settings.detectDarkTheme,
    };
}

export function resolveSiteEnabled(settings, href) {
    let hostname;
    try {
        hostname = new URL(href).hostname.toLowerCase();
    } catch {
        return settings.enabledByDefault;
    }

    if (Object.hasOwn(settings.siteOverrides, hostname)) {
        return settings.siteOverrides[hostname];
    }

    const wildcard = Object.keys(settings.siteOverrides)
        .filter((host) => host.startsWith('*.') && hostname.endsWith(host.slice(1)))
        .sort((a, b) => b.length - a.length)[0];
    return wildcard ? settings.siteOverrides[wildcard] : settings.enabledByDefault;
}

export function resolveSiteThemeMode(settings, href) {
    const current = normalizeSettings(settings);
    let hostname;
    try {
        hostname = new URL(href).hostname.toLowerCase();
    } catch {
        return 'global';
    }
    return resolveHostRecord(current.siteThemeModes, hostname) || 'global';
}

export function resolveThemeForSite(settings, href) {
    const current = normalizeSettings(settings);
    let hostname;
    try {
        hostname = new URL(href).hostname.toLowerCase();
    } catch {
        return current;
    }
    if (resolveHostRecord(current.siteThemeModes, hostname) !== 'independent') return current;
    const theme = resolveHostRecord(current.siteThemes, hostname);
    return theme ? {...current, ...theme} : current;
}

export function setSiteTheme(settings, hostname, themePatch) {
    if (typeof hostname !== 'string' || !validHostPattern(hostname) || hostname.startsWith('*.')) {
        throw new TypeError('hostname must be a valid exact host name');
    }
    const current = normalizeSettings(settings);
    const siteThemes = {...current.siteThemes};
    const key = hostname.toLowerCase();
    const theme = normalizeThemePatch(themePatch);
    if (Object.keys(theme).length > 0) siteThemes[key] = theme;
    else delete siteThemes[key];
    return normalizeSettings({...current, siteThemes});
}

export function setSiteThemeMode(settings, hostname, mode) {
    if (typeof hostname !== 'string' || !validHostPattern(hostname) || hostname.startsWith('*.')) {
        throw new TypeError('hostname must be a valid exact host name');
    }
    if (!['global', 'independent'].includes(mode)) {
        throw new TypeError('site theme mode must be global or independent');
    }
    const current = normalizeSettings(settings);
    const key = hostname.toLowerCase();
    const siteThemes = {...current.siteThemes};
    if (mode === 'independent' && !Object.hasOwn(siteThemes, key)) {
        const inheritedTheme = resolveHostRecord(siteThemes, key);
        const source = inheritedTheme ? {...current, ...inheritedTheme} : current;
        siteThemes[key] = Object.fromEntries(THEME_KEYS.map((themeKey) => [themeKey, source[themeKey]]));
    }
    return normalizeSettings({
        ...current,
        siteThemes,
        siteThemeModes: {...current.siteThemeModes, [key]: mode},
    });
}

export function setSiteOverride(settings, hostname, enabled) {
    if (typeof hostname !== 'string' || !validHostPattern(hostname) || hostname.startsWith('*.')) {
        throw new TypeError('hostname must be a valid exact host name');
    }
    if (typeof enabled !== 'boolean') {
        throw new TypeError('enabled must be a boolean');
    }

    const current = normalizeSettings(settings);
    const siteOverrides = {...current.siteOverrides};
    const key = hostname.toLowerCase();
    delete siteOverrides[key];
    const inherited = resolveSiteEnabled({...current, siteOverrides}, `https://${key}/`);
    if (enabled !== inherited) siteOverrides[key] = enabled;
    return normalizeSettings({...current, siteOverrides});
}

export function isWithinTimeWindow(start, end, date = new Date()) {
    const toMinutes = (time) => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    };
    const current = date.getHours() * 60 + date.getMinutes();
    const from = toMinutes(start);
    const until = toMinutes(end);

    if (from === until) {
        return false;
    }
    return from < until ? current >= from && current < until : current >= from || current < until;
}

export function resolveAutomationState(settings, {systemDark = false, now = new Date(), locationNight = false} = {}) {
    switch (settings.automation.mode) {
        case 'system':
            return {enabled: systemDark === true};
        case 'time':
            return {enabled: isWithinTimeWindow(settings.automation.activation, settings.automation.deactivation, now)};
        case 'location':
            return {enabled: locationNight === true};
        default:
            return {enabled: true};
    }
}
