// ==UserScript==
// @name         Blackcat Dark Reader
// @namespace    https://github.com/Ckrvxr/blackcat
// @version      0.1.0-beta.1
// @description  Dark Reader page themes for userscript managers
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @require      https://cdn.jsdelivr.net/gh/Ckrvxr/blackcat@v0.1.0-beta.1/dist/engine.js
// @updateURL    https://raw.githubusercontent.com/Ckrvxr/blackcat/v0.1.0-beta.1/dist/blackcat.user.js
// @downloadURL  https://raw.githubusercontent.com/Ckrvxr/blackcat/v0.1.0-beta.1/dist/blackcat.user.js
// ==/UserScript==
(function () {
    'use strict';

    const DEFAULT_SETTINGS = Object.freeze({
        enabled: true,
        enabledByDefault: true,
        engine: 'dynamicTheme',
        mode: 1,
        brightness: 100,
        contrast: 100,
        grayscale: 0,
        sepia: 0,
        useFont: false,
        fontFamily: 'system-ui, sans-serif',
        textStroke: 0,
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
    const THEME_RANGES = Object.freeze({
        mode: [0, 1],
        brightness: [50, 150],
        contrast: [50, 150],
        grayscale: [0, 100],
        sepia: [0, 100],
        textStroke: [0, 1],
    });
    const HOST_PATTERN = /^(?:\*\.)?(?:[a-z0-9.-]+|\[[a-f0-9:.]+\])$/i;
    const THEME_KEYS = [
        ...Object.keys(THEME_RANGES),
        'engine', 'useFont', 'fontFamily', 'darkSchemeBackgroundColor', 'darkSchemeTextColor',
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
            .map(([host, theme]) => [host.toLowerCase(), normalizeThemePatch(theme)]));
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

    function normalizeFontFamily(value) {
        return typeof value === 'string' && value.length <= 200 && /^[\p{L}\p{N}\s,_'"-]+$/u.test(value)
            ? value
            : DEFAULT_SETTINGS.fontFamily;
    }

    function normalizeSettings(value) {
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
            engine: ENGINES.has(input.engine) ? input.engine : DEFAULT_SETTINGS.engine,
            useFont: typeof input.useFont === 'boolean' ? input.useFont : DEFAULT_SETTINGS.useFont,
            fontFamily: normalizeFontFamily(input.fontFamily),
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

    function toThemeOptions(value) {
        const settings = normalizeSettings(value);
        return {
            engine: settings.engine,
            mode: settings.mode,
            brightness: settings.brightness,
            contrast: settings.contrast,
            grayscale: settings.grayscale,
            sepia: settings.sepia,
            useFont: settings.useFont,
            fontFamily: settings.fontFamily,
            textStroke: settings.textStroke,
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

    function resolveSiteEnabled(settings, href) {
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

    function resolveThemeForSite(settings, href) {
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

    function setSiteTheme(settings, hostname, enabled, themePatch = {}) {
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

    function setSiteOverride(settings, hostname, enabled) {
        if (typeof hostname !== 'string' || !validHostPattern(hostname) || hostname.startsWith('*.')) {
            throw new TypeError('hostname must be a valid exact host name');
        }
        if (typeof enabled !== 'boolean') {
            throw new TypeError('enabled must be a boolean');
        }

        const current = normalizeSettings(settings);
        const siteOverrides = {...current.siteOverrides};
        const key = hostname.toLowerCase();
        if (enabled === current.enabledByDefault) {
            delete siteOverrides[key];
        } else {
            siteOverrides[key] = enabled;
        }
        return normalizeSettings({...current, siteOverrides});
    }

    function isWithinTimeWindow(start, end, date = new Date()) {
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

    function resolveAutomationState(settings, {systemDark = false, now = new Date(), locationNight = false} = {}) {
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

    const HOST_ID = 'blackcat-settings-panel';

    const THEME_SETTING_KEYS = [
        'engine', 'mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'textStroke', 'useFont', 'fontFamily',
        'styleSystemControls', 'detectDarkTheme', 'darkSchemeBackgroundColor', 'darkSchemeTextColor',
        'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor',
    ];
    const NUMERIC_THEME_KEYS = new Set(['mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'textStroke']);

    function openSettingsPanel({settings, hostname, onSave}) {
        const themeSettings = resolveThemeForSite(settings, location.href);
        const hasSiteTheme = Object.hasOwn(settings.siteThemes, hostname.toLowerCase());
        const existing = document.getElementById(HOST_ID);
        if (existing) {
            existing.shadowRoot?.querySelector('[role="dialog"]')?.focus();
            return;
        }

        const host = document.createElement('div');
        host.id = HOST_ID;
        const shadow = host.attachShadow({mode: 'open'});
        const style = document.createElement('style');
        style.textContent = `
        :host { all: initial; color-scheme: dark; font: 14px/1.45 system-ui, sans-serif; }
        * { box-sizing: border-box; }
        .backdrop { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px; background: #0009; }
        .panel { width: min(560px, 100%); max-height: min(860px, 94vh); overflow: auto; padding: 22px; color: #e8e6e3; background: #181a1b; border: 1px solid #454a4d; border-radius: 12px; box-shadow: 0 12px 48px #0009; }
        h1 { margin: 0 0 16px; font-size: 20px; }
        h2 { margin: 20px 0 8px; font-size: 14px; color: #b8c0c5; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        label { display: grid; gap: 5px; margin: 9px 0; color: #d5dadd; }
        label.check { display: flex; align-items: center; gap: 9px; }
        input, select, button { color: inherit; font: inherit; }
        input[type="text"], input[type="time"], select { min-width: 0; width: 100%; padding: 8px; border: 1px solid #596168; border-radius: 6px; background: #25292c; }
        input[type="range"] { width: 100%; accent-color: #8ab4f8; }
        input[type="color"] { width: 48px; height: 30px; padding: 2px; border: 1px solid #596168; border-radius: 5px; background: #25292c; }
        input[type="checkbox"] { width: 16px; height: 16px; accent-color: #8ab4f8; }
        output { float: right; color: #aeb8bf; font-variant-numeric: tabular-nums; }
        .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
        button { padding: 8px 14px; border: 1px solid #596168; border-radius: 6px; background: #25292c; cursor: pointer; }
        button.primary { border-color: #8ab4f8; color: #101820; background: #8ab4f8; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #8ab4f8; outline-offset: 2px; }
        @media (max-width: 460px) { .grid { grid-template-columns: 1fr; } .panel { padding: 16px; } }
    `;

        const backdrop = document.createElement('div');
        backdrop.className = 'backdrop';
        const panel = document.createElement('section');
        panel.className = 'panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'blackcat-title');
        panel.tabIndex = -1;

        const heading = document.createElement('h1');
        heading.id = 'blackcat-title';
        heading.textContent = 'Blackcat · Dark Reader';
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.hidden = true;
        panel.append(heading, status);

        const form = document.createElement('form');
        const controls = {};
        const addText = (parent, text, tag = 'h2') => {
            const element = document.createElement(tag);
            element.textContent = text;
            parent.append(element);
            return element;
        };
        const addField = (parent, labelText, control) => {
            const label = document.createElement('label');
            const caption = document.createElement('span');
            caption.textContent = labelText;
            label.append(caption, control);
            parent.append(label);
            return control;
        };
        const addCheck = (parent, labelText, key, value) => {
            const label = document.createElement('label');
            label.className = 'check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = Boolean(value);
            const caption = document.createElement('span');
            caption.textContent = labelText;
            label.append(input, caption);
            parent.append(label);
            controls[key] = input;
            return input;
        };
        const addSelect = (parent, labelText, key, value, choices) => {
            const select = document.createElement('select');
            for (const [optionValue, optionLabel] of choices) {
                const option = document.createElement('option');
                option.value = optionValue;
                option.textContent = optionLabel;
                select.append(option);
            }
            select.value = String(value);
            controls[key] = select;
            return addField(parent, labelText, select);
        };
        const addRange = (parent, labelText, key, value, min, max, step, suffix = '') => {
            const label = document.createElement('label');
            const caption = document.createElement('span');
            const output = document.createElement('output');
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            output.value = `${value}${suffix}`;
            input.addEventListener('input', () => {
                output.value = `${input.value}${suffix}`;
            });
            caption.textContent = labelText;
            caption.append(output);
            label.append(caption, input);
            parent.append(label);
            controls[key] = input;
        };
        const grid = document.createElement('div');
        grid.className = 'grid';

        addText(form, 'Enablement');
        addCheck(form, 'Enable Blackcat', 'enabled', settings.enabled);
        addCheck(form, 'Enable on sites without an override', 'enabledByDefault', settings.enabledByDefault);
        addCheck(form, `Enable for ${hostname}`, 'siteEnabled', resolveSiteEnabled(settings, location.href));
        addCheck(form, 'Use theme settings for this site only', 'siteThemeOnly', hasSiteTheme);

        addText(form, 'Theme');
        addSelect(grid, 'Rendering engine', 'engine', themeSettings.engine, [
            ['dynamicTheme', 'Dynamic theme'],
            ['cssFilter', 'Filter'],
            ['svgFilter', 'Filter+ (SVG)'],
            ['staticTheme', 'Static theme'],
        ]);
        addSelect(grid, 'Color mode', 'mode', themeSettings.mode, [['1', 'Dark'], ['0', 'Dimmed']]);
        form.append(grid);
        addRange(form, 'Brightness', 'brightness', themeSettings.brightness, 50, 150, 1, '%');
        addRange(form, 'Contrast', 'contrast', themeSettings.contrast, 50, 150, 1, '%');
        addRange(form, 'Grayscale', 'grayscale', themeSettings.grayscale, 0, 100, 1, '%');
        addRange(form, 'Sepia', 'sepia', themeSettings.sepia, 0, 100, 1, '%');
        addRange(form, 'Text stroke', 'textStroke', themeSettings.textStroke, 0, 1, 0.1, 'px');
        addCheck(form, 'Use custom font', 'useFont', themeSettings.useFont);
        const font = document.createElement('input');
        font.type = 'text';
        font.maxLength = 200;
        font.value = themeSettings.fontFamily;
        controls.fontFamily = addField(form, 'Font family', font);
        addCheck(form, 'Style system controls', 'styleSystemControls', themeSettings.styleSystemControls);
        addCheck(form, 'Do not theme pages that already use a dark theme', 'detectDarkTheme', themeSettings.detectDarkTheme);

        addText(form, 'Colors');
        const colorGrid = document.createElement('div');
        colorGrid.className = 'grid';
        for (const [key, labelText] of [
            ['darkSchemeBackgroundColor', 'Dark background'],
            ['darkSchemeTextColor', 'Dark text'],
            ['lightSchemeBackgroundColor', 'Dimmed background'],
            ['lightSchemeTextColor', 'Dimmed text'],
        ]) {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = themeSettings[key].length === 4 ? `#${[...themeSettings[key].slice(1)].map((c) => c + c).join('')}` : themeSettings[key];
            controls[key] = addField(colorGrid, labelText, input);
        }
        const selection = document.createElement('input');
        selection.type = 'text';
        selection.maxLength = 9;
        selection.value = themeSettings.selectionColor;
        controls.selectionColor = addField(colorGrid, 'Selection color (auto or hex)', selection);
        const scrollbar = document.createElement('input');
        scrollbar.type = 'text';
        scrollbar.maxLength = 9;
        scrollbar.value = themeSettings.scrollbarColor;
        controls.scrollbarColor = addField(colorGrid, 'Scrollbar color (auto, blank, or hex)', scrollbar);
        form.append(colorGrid);

        addText(form, 'Automation');
        addSelect(form, 'Mode', 'automationMode', settings.automation.mode, [
            ['none', 'Off'],
            ['system', 'Follow system color scheme'],
            ['time', 'Time schedule'],
            ['location', 'Sunrise and sunset'],
        ]);
        addSelect(form, 'When automation chooses light', 'automationBehavior', settings.automation.behavior, [
            ['OnOff', 'Turn Dark Reader off'],
            ['Scheme', 'Use the dimmed theme'],
        ]);
        const timeGrid = document.createElement('div');
        timeGrid.className = 'grid';
        const activation = document.createElement('input');
        activation.type = 'time';
        activation.value = settings.automation.activation;
        controls.activation = addField(timeGrid, 'Turn on at', activation);
        const deactivation = document.createElement('input');
        deactivation.type = 'time';
        deactivation.value = settings.automation.deactivation;
        controls.deactivation = addField(timeGrid, 'Turn off at', deactivation);
        form.append(timeGrid);
        const locationNote = document.createElement('p');
        locationNote.textContent = 'Coordinates are stored in this script manager only; Blackcat does not request device location.';
        form.append(locationNote);
        const locationGrid = document.createElement('div');
        locationGrid.className = 'grid';
        const latitude = document.createElement('input');
        latitude.type = 'number';
        latitude.min = '-90';
        latitude.max = '90';
        latitude.step = 'any';
        latitude.value = settings.location.latitude ?? '';
        controls.latitude = addField(locationGrid, 'Latitude (-90 to 90)', latitude);
        const longitude = document.createElement('input');
        longitude.type = 'number';
        longitude.min = '-180';
        longitude.max = '180';
        longitude.step = 'any';
        longitude.value = settings.location.longitude ?? '';
        controls.longitude = addField(locationGrid, 'Longitude (-180 to 180)', longitude);
        form.append(locationGrid);

        const actions = document.createElement('div');
        actions.className = 'actions';
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Reset defaults';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'primary';
        save.textContent = 'Save';
        actions.append(reset, cancel, save);
        form.append(actions);
        panel.append(form);
        backdrop.append(panel);
        shadow.append(style, backdrop);
        (document.documentElement || document.body).append(host);

        const close = () => host.remove();
        cancel.addEventListener('click', close);
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) close();
        });
        panel.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') close();
        });
        const loadThemeControls = (source) => {
            for (const key of THEME_SETTING_KEYS) {
                const control = controls[key];
                if (control.type === 'checkbox') {
                    control.checked = source[key];
                } else {
                    let value = String(source[key]);
                    if (control.type === 'color' && value.length === 4) {
                        value = `#${[...value.slice(1)].map((character) => character + character).join('')}`;
                    }
                    control.value = value;
                    control.dispatchEvent(new Event('input'));
                }
            }
        };
        controls.siteThemeOnly.addEventListener('change', () => {
            loadThemeControls(controls.siteThemeOnly.checked ? resolveThemeForSite(settings, location.href) : settings);
        });
        controls.automationMode.addEventListener('change', () => {
            const mode = controls.automationMode.value;
            controls.automationBehavior.disabled = mode === 'none';
            controls.activation.disabled = mode !== 'time';
            controls.deactivation.disabled = mode !== 'time';
            controls.latitude.disabled = mode !== 'location';
            controls.longitude.disabled = mode !== 'location';
        });
        controls.automationMode.dispatchEvent(new Event('change'));
        reset.addEventListener('click', () => {
            const defaults = normalizeSettings(DEFAULT_SETTINGS);
            for (const key of ['enabled', 'enabledByDefault', 'useFont', 'styleSystemControls', 'detectDarkTheme']) {
                controls[key].checked = defaults[key];
            }
            for (const key of ['engine', 'mode', 'brightness', 'contrast', 'grayscale', 'sepia', 'textStroke', 'fontFamily', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor']) {
                controls[key].value = String(defaults[key]);
                controls[key].dispatchEvent(new Event('input'));
            }
            controls.mode.value = String(defaults.mode);
            controls.automationMode.value = defaults.automation.mode;
            controls.automationBehavior.value = defaults.automation.behavior;
            controls.activation.value = defaults.automation.activation;
            controls.deactivation.value = defaults.automation.deactivation;
            controls.latitude.value = '';
            controls.longitude.value = '';
            controls.siteEnabled.checked = resolveSiteEnabled(defaults, location.href);
            controls.siteThemeOnly.checked = false;
            controls.automationMode.dispatchEvent(new Event('change'));
        });
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const themeValues = {};
            for (const key of THEME_SETTING_KEYS) {
                const control = controls[key];
                themeValues[key] = control.type === 'checkbox' ? control.checked :
                    NUMERIC_THEME_KEYS.has(key) ? Number(control.value) : control.value;
            }
            const base = normalizeSettings({
                ...settings,
                enabled: controls.enabled.checked,
                enabledByDefault: controls.enabledByDefault.checked,
                automation: {
                    ...settings.automation,
                    mode: controls.automationMode.value,
                    activation: controls.activation.value,
                    deactivation: controls.deactivation.value,
                    behavior: controls.automationBehavior.value,
                },
                location: {
                    latitude: controls.latitude.value,
                    longitude: controls.longitude.value,
                },
            });
            const withTheme = controls.siteThemeOnly.checked
                ? setSiteTheme(base, hostname, true, themeValues)
                : setSiteTheme(normalizeSettings({...base, ...themeValues}), hostname, false);
            const withSiteRule = setSiteOverride(withTheme, hostname, controls.siteEnabled.checked);
            save.disabled = true;
            try {
                await onSave(withSiteRule);
                close();
            } catch {
                status.hidden = false;
                status.textContent = 'Settings could not be saved. Please retry.';
            } finally {
                save.disabled = false;
            }
        });
        panel.focus();
    }

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

})();
