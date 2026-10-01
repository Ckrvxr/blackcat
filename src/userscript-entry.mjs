import {DEFAULT_SETTINGS, normalizeSettings, resolveAutomationState, resolveSiteEnabled, resolveThemeForSite, setSiteOverride, toThemeOptions} from './settings.mjs';
import {openSettingsPanel} from './settings-panel.mjs';

const SETTINGS_KEY = 'blackcat.settings.v1';
const ENGINE = globalThis.BlackcatDarkReaderEngine;
const getValue = globalThis.GM_getValue;
const setValue = globalThis.GM_setValue;
const registerMenu = globalThis.GM_registerMenuCommand;
const addValueListener = globalThis.GM_addValueChangeListener;
let automationTimer = null;

async function readSettings() {
    if (typeof getValue !== 'function') {
        return normalizeSettings(DEFAULT_SETTINGS);
    }
    return normalizeSettings(await getValue(SETTINGS_KEY, DEFAULT_SETTINGS));
}

async function persist(settings) {
    if (typeof setValue === 'function') {
        await setValue(SETTINGS_KEY, settings);
    }
}

function getThemeOptions(settings, now = new Date()) {
    if (!settings.enabled || !resolveSiteEnabled(settings, location.href)) return null;
    const themeSettings = resolveThemeForSite(settings, location.href);
    const context = {now};
    if (settings.automation.mode === 'system') {
        context.systemDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
    } else if (settings.automation.mode === 'location') {
        context.locationNight = settings.location.latitude !== null && settings.location.longitude !== null &&
            ENGINE?.isNightAtLocation?.(settings.location.latitude, settings.location.longitude, now) === true;
    }
    const automation = resolveAutomationState(themeSettings, context);
    return automation.enabled ? toThemeOptions({...themeSettings, mode: automation.mode}) : null;
}

let appliedSignature = null;

function apply(settings, force = true) {
    const themeOptions = getThemeOptions(settings);
    if (!themeOptions) {
        if (appliedSignature !== null && ENGINE?.disable) {
            ENGINE.disable();
        }
        appliedSignature = null;
        return;
    }
    if (!ENGINE || typeof ENGINE.apply !== 'function') {
        console.warn('[Blackcat] Dark Reader engine did not load. Check the userscript manager network/cache.');
        return;
    }
    const signature = JSON.stringify(themeOptions);
    if (force || signature !== appliedSignature) {
        ENGINE.apply(themeOptions);
    }
    appliedSignature = signature;
}

async function update(mutator) {
    const settings = await readSettings();
    const next = normalizeSettings(mutator(settings) || settings);
    await persist(next);
    apply(next);
    scheduleAutomation(next);
    return next;
}

function scheduleAutomation(settings) {
    if (automationTimer !== null) {
        clearTimeout(automationTimer);
        automationTimer = null;
    }
    if (!['time', 'location'].includes(settings.automation.mode)) return;
    if (settings.automation.mode === 'location' && (settings.location.latitude === null || settings.location.longitude === null)) return;
    const now = new Date();
    const delay = settings.automation.mode === 'time'
        ? 60_000 - now.getSeconds() * 1_000 - now.getMilliseconds()
        : settings.location.latitude !== null && settings.location.longitude !== null && ENGINE?.nextTimeChangeAtLocation
            ? Math.max(1_000, ENGINE.nextTimeChangeAtLocation(settings.location.latitude, settings.location.longitude, now) - now.getTime() + 100)
            : 60_000;
    automationTimer = setTimeout(() => {
        apply(settings, false);
        scheduleAutomation(settings);
    }, delay);
}

function register(label, callback) {
    if (typeof registerMenu === 'function') {
        registerMenu(`[Blackcat] ${label}`, callback);
    }
}

function cycleEngine(current) {
    const engines = ['dynamicTheme', 'cssFilter', 'svgFilter', 'staticTheme'];
    return engines[(engines.indexOf(current) + 1) % engines.length];
}

async function start() {
    let settings = await readSettings();
    const hostname = location.hostname.toLowerCase();

    register('Settings', () => openSettingsPanel({
        settings,
        hostname,
        onSave: async (next) => {
            settings = normalizeSettings(next);
            await persist(settings);
            apply(settings);
            scheduleAutomation(settings);
        },
    }));

    register('Toggle this site', async () => {
        settings = await update((current) => setSiteOverride(
            current,
            hostname,
            !resolveSiteEnabled(current, location.href),
        ));
    });

    register('Toggle globally', async () => {
        settings = await update((current) => ({...current, enabled: !current.enabled}));
    });

    register(`Theme engine: ${settings.engine} (cycle)`, async () => {
        settings = await update((current) => ({...current, engine: cycleEngine(current.engine)}));
    });

    register(`Color mode: ${settings.mode ? 'dark' : 'dimmed'} (toggle)`, async () => {
        settings = await update((current) => ({...current, mode: current.mode ? 0 : 1}));
    });

    register(`Brightness: ${settings.brightness}% (-10)`, async () => {
        settings = await update((current) => ({...current, brightness: current.brightness - 10}));
    });
    register(`Brightness: ${settings.brightness}% (+10)`, async () => {
        settings = await update((current) => ({...current, brightness: current.brightness + 10}));
    });
    register(`Contrast: ${settings.contrast}% (-10)`, async () => {
        settings = await update((current) => ({...current, contrast: current.contrast - 10}));
    });
    register(`Contrast: ${settings.contrast}% (+10)`, async () => {
        settings = await update((current) => ({...current, contrast: current.contrast + 10}));
    });
    register(`Automation: ${settings.automation.mode} (cycle)`, async () => {
        const modes = ['none', 'system', 'time', 'location'];
        settings = await update((current) => ({
            ...current,
            automation: {...current.automation, mode: modes[(modes.indexOf(current.automation.mode) + 1) % modes.length]},
        }));
    });

    apply(settings);
    scheduleAutomation(settings);

    if (typeof addValueListener === 'function') {
        addValueListener(SETTINGS_KEY, (_key, _oldValue, newValue, remote) => {
            if (remote && newValue) {
                settings = normalizeSettings(newValue);
                apply(settings);
                scheduleAutomation(settings);
            }
        });
    }

    const colorScheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    const onSchemeChange = () => apply(settings, false);
    if (typeof colorScheme?.addEventListener === 'function') {
        colorScheme.addEventListener('change', onSchemeChange);
    } else if (typeof colorScheme?.addListener === 'function') {
        colorScheme.addListener(onSchemeChange);
    }

}

void start().catch((error) => console.error('[Blackcat] Failed to initialize:', error));
