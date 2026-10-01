export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    enabledByDefault: true,
    language: 'auto',
    engine: 'dynamicTheme',
    mode: 1,
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    sepia: 0,
    darkSchemeBackgroundColor: '#181a1b',
    darkSchemeTextColor: '#e8e6e3',
    lightSchemeBackgroundColor: '#dcdad7',
    lightSchemeTextColor: '#181a1b',
    scrollbarColor: '',
    selectionColor: 'auto',
    styleSystemControls: false,
    detectDarkTheme: true,
    automation: Object.freeze({
        mode: 'none',
        activation: '18:00',
        deactivation: '09:00',
        behavior: 'OnOff',
    }),
    location: Object.freeze({latitude: null, longitude: null}),
    siteOverrides: Object.freeze({}),
    siteThemes: Object.freeze({}),
});

const ENGINES = new Set(['dynamicTheme', 'cssFilter', 'svgFilter', 'staticTheme']);
const AUTOMATION_MODES = new Set(['none', 'system', 'time', 'location']);
const AUTOMATION_BEHAVIORS = new Set(['OnOff', 'Scheme']);
const LANGUAGE_PREFERENCES = new Set(['auto', 'en', 'zh-CN']);
const THEME_RANGES = Object.freeze({
    mode: [0, 1],
    brightness: [50, 150],
    contrast: [50, 150],
    grayscale: [0, 100],
    sepia: [0, 100],
});
const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])$/i;
const THEME_KEYS = [
    ...Object.keys(THEME_RANGES),
    'engine', 'darkSchemeBackgroundColor', 'darkSchemeTextColor',
    'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'scrollbarColor', 'selectionColor',
    'styleSystemControls', 'detectDarkTheme',
];

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

function validColor(value, fallback) {
    return typeof value === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) ? value : fallback;
}

function validThemeColor(value, fallback, allowEmpty = false) {
    if (value === 'auto' || (allowEmpty && value === '')) {
        return value;
    }
    return validColor(value, fallback);
}

export function normalizeSettings(value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const automation = input.automation && typeof input.automation === 'object' ? input.automation : {};
    return {
        ...DEFAULT_SETTINGS,
        ...Object.fromEntries(Object.entries(THEME_RANGES).map(([key, [min, max]]) => [
            key,
            key === 'mode'
                ? (input.mode === 0 || input.mode === 1 ? input.mode : DEFAULT_SETTINGS.mode)
                : finiteNumber(input[key], DEFAULT_SETTINGS[key], min, max),
        ])),
        enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
        enabledByDefault: typeof input.enabledByDefault === 'boolean' ? input.enabledByDefault : DEFAULT_SETTINGS.enabledByDefault,
        language: LANGUAGE_PREFERENCES.has(input.language) ? input.language : DEFAULT_SETTINGS.language,
        engine: ENGINES.has(input.engine) ? input.engine : DEFAULT_SETTINGS.engine,
        darkSchemeBackgroundColor: validColor(input.darkSchemeBackgroundColor, DEFAULT_SETTINGS.darkSchemeBackgroundColor),
        darkSchemeTextColor: validColor(input.darkSchemeTextColor, DEFAULT_SETTINGS.darkSchemeTextColor),
        lightSchemeBackgroundColor: validColor(input.lightSchemeBackgroundColor, DEFAULT_SETTINGS.lightSchemeBackgroundColor),
        lightSchemeTextColor: validColor(input.lightSchemeTextColor, DEFAULT_SETTINGS.lightSchemeTextColor),
        scrollbarColor: validThemeColor(input.scrollbarColor, DEFAULT_SETTINGS.scrollbarColor, true),
        selectionColor: validThemeColor(input.selectionColor, DEFAULT_SETTINGS.selectionColor),
        styleSystemControls: typeof input.styleSystemControls === 'boolean'
            ? input.styleSystemControls
            : DEFAULT_SETTINGS.styleSystemControls,
        detectDarkTheme: typeof input.detectDarkTheme === 'boolean' ? input.detectDarkTheme : DEFAULT_SETTINGS.detectDarkTheme,
        automation: {
            mode: AUTOMATION_MODES.has(automation.mode) ? automation.mode : DEFAULT_SETTINGS.automation.mode,
            activation: normalizeTime(automation.activation, DEFAULT_SETTINGS.automation.activation),
            deactivation: normalizeTime(automation.deactivation, DEFAULT_SETTINGS.automation.deactivation),
            behavior: AUTOMATION_BEHAVIORS.has(automation.behavior) ? automation.behavior : DEFAULT_SETTINGS.automation.behavior,
        },
        location: {
            latitude: normalizeCoordinate(input.location?.latitude, -90, 90),
            longitude: normalizeCoordinate(input.location?.longitude, -180, 180),
        },
        siteOverrides: normalizeSiteOverrides(input.siteOverrides),
        siteThemes: normalizeSiteThemes(input.siteThemes),
    };
}

export function toThemeOptions(value) {
    const settings = normalizeSettings(value);
    return {
        engine: settings.engine,
        mode: settings.mode,
        brightness: settings.brightness,
        contrast: settings.contrast,
        grayscale: settings.grayscale,
        sepia: settings.sepia,
        darkSchemeBackgroundColor: settings.darkSchemeBackgroundColor,
        darkSchemeTextColor: settings.darkSchemeTextColor,
        lightSchemeBackgroundColor: settings.lightSchemeBackgroundColor,
        lightSchemeTextColor: settings.lightSchemeTextColor,
        scrollbarColor: settings.scrollbarColor,
        selectionColor: settings.selectionColor,
        styleSystemControls: settings.styleSystemControls,
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

export function resolveThemeForSite(settings, href) {
    const current = normalizeSettings(settings);
    let hostname;
    try {
        hostname = new URL(href).hostname.toLowerCase();
    } catch {
        return current;
    }
    if (Object.hasOwn(current.siteThemes, hostname)) {
        return {...current, ...current.siteThemes[hostname]};
    }
    const wildcard = Object.keys(current.siteThemes)
        .filter((host) => host.startsWith('*.') && hostname.endsWith(host.slice(1)))
        .sort((a, b) => b.length - a.length)[0];
    return wildcard ? {...current, ...current.siteThemes[wildcard]} : current;
}

export function setSiteTheme(settings, hostname, enabled, themePatch = {}) {
    if (typeof hostname !== 'string' || !validHostPattern(hostname) || hostname.startsWith('*.')) {
        throw new TypeError('hostname must be a valid exact host name');
    }
    if (typeof enabled !== 'boolean') {
        throw new TypeError('enabled must be a boolean');
    }
    const current = normalizeSettings(settings);
    const siteThemes = {...current.siteThemes};
    const key = hostname.toLowerCase();
    if (enabled) {
        siteThemes[key] = normalizeThemePatch(themePatch);
    } else {
        delete siteThemes[key];
    }
    return normalizeSettings({...current, siteThemes});
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
    let shouldBeDark;
    switch (settings.automation.mode) {
        case 'system':
            shouldBeDark = systemDark === true;
            break;
        case 'time':
            shouldBeDark = isWithinTimeWindow(settings.automation.activation, settings.automation.deactivation, now);
            break;
        case 'location':
            shouldBeDark = locationNight === true;
            break;
        default:
            return {enabled: true, mode: settings.mode};
    }

    if (settings.automation.behavior === 'Scheme') {
        return {enabled: true, mode: shouldBeDark ? 1 : 0};
    }
    return {enabled: shouldBeDark, mode: settings.mode};
}
