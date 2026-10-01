// ==UserScript==
// @name         Blackcat Dark Reader
// @namespace    https://github.com/Ckrvxr/blackcat
// @version      0.1.0-beta.8
// @description  Dark Reader page themes / 网页深色主题
// @match        *://*/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addValueChangeListener
// @require      https://cdn.jsdelivr.net/gh/Ckrvxr/blackcat@v0.1.0-beta.8/dist/engine.js
// @updateURL    https://raw.githubusercontent.com/Ckrvxr/blackcat/v0.1.0-beta.8/dist/blackcat.user.js
// @downloadURL  https://raw.githubusercontent.com/Ckrvxr/blackcat/v0.1.0-beta.8/dist/blackcat.user.js
// ==/UserScript==
(function () {
    'use strict';

    const DEFAULT_SETTINGS = Object.freeze({
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

    function toThemeOptions(value) {
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
        delete siteOverrides[key];
        const inherited = resolveSiteEnabled({...current, siteOverrides}, `https://${key}/`);
        if (enabled !== inherited) siteOverrides[key] = enabled;
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

    const ENGLISH = Object.freeze({
        'menu.settings': '⚙️ More settings',
        'menu.site': '🌐 This site: {status}',
        'menu.global': '🌍 Global: {status}',
        'menu.colorMode': '🌗 Color mode: {mode}',
        'engine.dynamic': 'Dynamic theme',
        'engine.filter': 'Filter',
        'engine.svgFilter': 'Filter+ (SVG)',
        'engine.static': 'Static theme',
        'mode.dark': 'dark',
        'mode.dimmed': 'dimmed',
        'state.enabled': 'Enabled',
        'state.disabled': 'Disabled',
        'panel.language': 'Language',
        'panel.languageAuto': 'Follow browser',
        'panel.languageEnglish': 'English',
        'panel.languageChinese': 'Simplified Chinese',
        'panel.enabled': 'Enable Blackcat',
        'panel.enabledByDefault': 'Enable on sites by default',
        'panel.theme': 'Theme',
        'panel.engine': 'Rendering engine',
        'panel.colorMode': 'Color mode',
        'panel.modeDark': 'Dark',
        'panel.modeDimmed': 'Dimmed',
        'panel.brightness': 'Brightness',
        'panel.contrast': 'Contrast',
        'panel.grayscale': 'Grayscale',
        'panel.sepia': 'Sepia',
        'panel.systemControls': 'Style system controls',
        'panel.detectDark': 'Skip already-dark pages',
        'panel.colors': 'Colors',
        'panel.selectionColor': 'Selection color',
        'panel.scrollbarColor': 'Scrollbar color',
        'panel.automation': 'Automation',
        'panel.automationMode': 'Mode',
        'panel.automationOff': 'Off',
        'panel.automationSystem': 'Follow system',
        'panel.automationTime': 'Time schedule',
        'panel.automationLocation': 'Sunrise and sunset',
        'panel.automationBehavior': 'When automation chooses light',
        'panel.behaviorOff': 'Turn Dark Reader off',
        'panel.behaviorDimmed': 'Dimmed theme',
        'panel.turnOnAt': 'Turn on at',
        'panel.turnOffAt': 'Turn off at',
        'panel.locationNote': 'Enter both coordinates to use sunrise and sunset. They stay in your script manager; no device location permission is requested.',
        'panel.latitude': 'Latitude (-90 to 90)',
        'panel.longitude': 'Longitude (-180 to 180)',
        'panel.reset': 'Initialize',
        'panel.saveError': 'Applied, but not saved. Change the option again to retry.',
        'panel.subtitle': 'Appearance & preferences',
        'panel.siteTab': 'Site',
        'panel.general': 'General',
        'panel.close': 'Close settings',
        'panel.sections': 'Settings sections',
        'panel.live': 'Instant apply · Auto-save',
        'panel.scopeGlobal': 'Editing the global theme',
        'panel.scopeSite': 'Editing this site’s theme only',
        'panel.background': 'Background',
        'panel.text': 'Text',
        'panel.siteEnabledShort': 'Enable on this site',
        'panel.siteEnabledHelp': 'The global switch must also be on. This choice overrides the default site policy.',
        'panel.siteThemeShort': 'Separate theme for this site',
        'panel.siteThemeHelp': 'When on, changes in Theme affect only this site. Turning it off removes this site’s theme settings.',
        'panel.colorHelp': 'Use auto or a hex color such as #aabbcc. Leave scrollbar blank to keep the site’s style.',
        'panel.timeHelp': 'Uses your device’s local time. Overnight schedules are supported.',
        'panel.defaultsHelp': 'Bold labels indicate values different from factory defaults.',
        'panel.initializeHelp': 'Restore all defaults and clear every saved site configuration.',
        'panel.invalidInput': 'Check the highlighted field. Invalid values are not applied or saved.',
    });

    const SIMPLIFIED_CHINESE = Object.freeze({
        'menu.settings': '⚙️ 更多设置',
        'menu.site': '🌐 此网站上: {status}',
        'menu.global': '🌍 全局：{status}',
        'menu.colorMode': '🌗 色彩模式：{mode}',
        'engine.dynamic': '动态主题',
        'engine.filter': '滤镜',
        'engine.svgFilter': '增强滤镜（SVG）',
        'engine.static': '静态主题',
        'mode.dark': '深色',
        'mode.dimmed': '柔和',
        'state.enabled': '启用',
        'state.disabled': '关闭',
        'panel.language': '界面语言',
        'panel.languageAuto': '自动（跟随浏览器）',
        'panel.languageEnglish': '英文',
        'panel.languageChinese': '简体中文',
        'panel.enabled': '启用 Blackcat',
        'panel.enabledByDefault': '默认在所有网站启用',
        'panel.theme': '主题',
        'panel.engine': '渲染引擎',
        'panel.colorMode': '色彩模式',
        'panel.modeDark': '深色',
        'panel.modeDimmed': '柔和',
        'panel.brightness': '亮度',
        'panel.contrast': '对比度',
        'panel.grayscale': '灰度',
        'panel.sepia': '棕褐色',
        'panel.systemControls': '适配系统控件',
        'panel.detectDark': '跳过已使用深色主题的网站',
        'panel.colors': '颜色',
        'panel.selectionColor': '选中文本颜色',
        'panel.scrollbarColor': '滚动条颜色',
        'panel.automation': '自动切换',
        'panel.automationMode': '模式',
        'panel.automationOff': '关闭',
        'panel.automationSystem': '跟随系统配色',
        'panel.automationTime': '按时间切换',
        'panel.automationLocation': '按日出和日落切换',
        'panel.automationBehavior': '自动切换到浅色时',
        'panel.behaviorOff': '关闭深色模式',
        'panel.behaviorDimmed': '使用柔和主题',
        'panel.turnOnAt': '开启时间',
        'panel.turnOffAt': '关闭时间',
        'panel.locationNote': '请填写经纬度以使用日出和日落切换。坐标仅保存在脚本管理器中，不请求设备定位权限。',
        'panel.latitude': '纬度（-90 至 90）',
        'panel.longitude': '经度（-180 至 180）',
        'panel.reset': '初始化',
        'panel.saveError': '已生效，但未保存。请再次调整选项以重试。',
        'panel.subtitle': '外观与偏好设置',
        'panel.siteTab': '网站',
        'panel.general': '通用',
        'panel.close': '关闭设置',
        'panel.sections': '设置分区',
        'panel.live': '即时生效 · 自动保存',
        'panel.scopeGlobal': '正在调整全局主题',
        'panel.scopeSite': '仅调整此网站的主题',
        'panel.background': '背景',
        'panel.text': '文字',
        'panel.siteEnabledShort': '在此网站启用',
        'panel.siteEnabledHelp': '需同时开启全局开关；此选项优先于默认的网站启用规则。',
        'panel.siteThemeShort': '此网站使用独立主题',
        'panel.siteThemeHelp': '开启后，「主题」中的调整仅影响此网站；关闭会移除此网站的主题设置。',
        'panel.colorHelp': '可填 auto 或 #aabbcc 等十六进制颜色。滚动条留空时保留网站原样式。',
        'panel.timeHelp': '使用设备本地时间，支持跨午夜的时间段。',
        'panel.defaultsHelp': '加粗的选项表示其值与出厂默认值不同。',
        'panel.initializeHelp': '恢复全部默认设置，并清除所有网站的单独配置。',
        'panel.invalidInput': '请检查标红的输入项；无效值不会生效或保存。',
    });

    Object.freeze(Object.keys(ENGLISH));

    function detectLanguage(locale = globalThis.navigator?.language) {
        return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
    }

    function resolveLanguage(preference = 'auto', locale = globalThis.navigator?.language) {
        return preference === 'en' || preference === 'zh-CN' ? preference : detectLanguage(locale);
    }

    function translate(key, language = 'en', values = {}) {
        const messages = language.toLowerCase().startsWith('zh') ? SIMPLIFIED_CHINESE : ENGLISH;
        const template = messages[key] ?? ENGLISH[key] ?? key;
        return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name) => String(values[name] ?? `{${name}}`));
    }

    const THEME_SETTING_KEYS = Object.freeze(Object.keys(toThemeOptions(DEFAULT_SETTINGS)));
    const GLOBAL_KEYS = new Set(['enabled', 'enabledByDefault', 'language']);
    const NESTED_KEYS = new Set(['automation.mode', 'automation.behavior', 'automation.activation', 'automation.deactivation', 'location.latitude', 'location.longitude']);

    function getPanelValue(settings, hostname, key) {
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

    function changePanelSetting(settings, hostname, key, value) {
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

    function isPanelSettingChanged(settings, hostname, key) {
        return canonicalValue(getPanelValue(settings, hostname, key)) !== canonicalValue(getPanelValue(DEFAULT_SETTINGS, hostname, key));
    }

    // Apply immediately; serialize storage and coalesce pending slider snapshots.
    // Every caller still receives success/failure for the write covering its change.
    function createSettingsCommitter({apply, persist}) {
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

    const PANEL_STYLE = `
    :host { all: initial !important; position: fixed !important; top: 16px !important; right: 16px !important;
        width: min(384px, calc(100vw - 32px)) !important; z-index: 2147483647 !important; pointer-events: none !important;
        color-scheme: dark !important; font: 14px/1.5 system-ui, -apple-system, sans-serif !important; }
    *, *::before, *::after { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .panel { pointer-events: auto; display: flex; flex-direction: column; max-height: min(720px, calc(100vh - 32px));
        max-height: min(720px, calc(100dvh - 32px)); overflow: hidden; color: #e9edf2; background: #181c23;
        border: 1px solid #353d49; border-radius: 18px; box-shadow: 0 16px 56px #0006, 0 2px 8px #0004; }
    .panel:focus { outline: none; }
    header { display: flex; align-items: center; gap: 10px; padding: 18px 18px 14px; }
    .brand { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; background: #2a3546; color: #b4d0ff; font-size: 18px; font-weight: 600; }
    h1 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: .1px; }
    .subtitle { margin: 0; font-size: 12px; color: #a8b4c5; }
    button, input, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
    .close { margin-left: auto; width: 32px; height: 32px; padding: 0; font-size: 23px; border: 0; border-radius: 8px; background: transparent; color: #a8b4c5; }
    .close:hover { color: #fff; background: #2a303b; }
    .tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 0 18px 14px; padding: 4px; border-radius: 10px; background: #10141b; }
    .tab { min-width: 0; padding: 7px 2px; font-size: 13px; border: 0; border-radius: 7px; background: transparent; color: #a8b4c5; }
    .tab[aria-selected="true"] { background: #2a3546; color: #d8e6ff; }
    .body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 0 18px 12px; scrollbar-width: thin; scrollbar-color: #465163 transparent; }
    .scope, .site-name { padding: 9px 12px; border: 1px solid #303a49; border-radius: 9px; background: #202733; color: #b4d0ff; font-size: 12px; margin: 0 0 12px; overflow-wrap: anywhere; }
    .site-name { color: #e9edf2; font-size: 14px; }
    .field { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 0; padding: 9px 0; border-bottom: 1px solid #ffffff0d; }
    .caption { font-weight: 400; color: #dbe2ec; min-width: 0; }
    .field.changed > .caption { font-weight: 700; color: #fff; }
    .field.stack { display: grid; grid-template-columns: minmax(0, 1fr); justify-content: stretch; gap: 6px; padding: 8px 0; }
    .field.stack > .caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .field.stack > .caption output { font-size: 12px; font-weight: 400; color: #b4d0ff; font-variant-numeric: tabular-nums; }
    select, input[type="text"], input[type="number"], input[type="time"] { width: 156px; min-width: 0; max-width: 54%; border: 1px solid #414b5b;
        border-radius: 7px; padding: 6px 8px; background: #222936; font-size: 13px; }
    select { padding-right: 3px; }
    input[type="range"] { width: 100%; margin: 0; accent-color: #9dc2ff; cursor: pointer; }
    input[type="color"] { width: 44px; height: 30px; padding: 3px; background: #222936; border: 1px solid #414b5b; border-radius: 7px; cursor: pointer; }
    input[type="checkbox"] { appearance: none; flex-shrink: 0; position: relative; width: 34px; height: 20px; border: 1px solid #667184;
        margin: 0; border-radius: 12px; background: #343e4d; cursor: pointer; }
    input[type="checkbox"]::before { content: ''; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px;
        border-radius: 50%; background: #c1cad6; transition: transform .12s; }
    input[type="checkbox"]:checked { background: #9dc2ff; border-color: #9dc2ff; }
    input[type="checkbox"]:checked::before { background: #17263b; transform: translateX(14px); }
    .hint { margin: 8px 0 12px; color: #a8b4c5; font-size: 12px; line-height: 1.6; }
    details { margin-top: 14px; padding: 0 12px; border: 1px solid #353d49; border-radius: 10px; background: #1c222c; }
    summary { padding: 11px 0; color: #dbe2ec; font-size: 13px; cursor: pointer; }
    .group-title { margin: 14px 0 1px; font-size: 12px; font-weight: 500; color: #a8b4c5; }
    footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 18px; border-top: 1px solid #353d49; background: #151921; }
    .live-note { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #a8b4c5; }
    .live-note::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #8ecdb1; flex-shrink: 0; }
    .initialize { padding: 6px 10px; border: 1px solid #414b5b; border-radius: 7px; background: transparent; font-size: 12px; color: #c4cfdf; }
    .initialize:hover { background: #29313e; color: #fff; }
    .status { margin: 0; padding: 10px 18px; font-size: 12px; color: #ffb4b4; background: #42282e; }
    :is(button, input, select, summary):focus-visible { outline: 2px solid #9dc2ff; outline-offset: 3px; }
    [aria-invalid="true"] { border-color: #ffa8a8 !important; }
    @media (max-width: 420px) { :host { top: 8px !important; right: 8px !important; width: calc(100vw - 16px) !important; }
        .panel { max-height: calc(100dvh - 16px); border-radius: 14px; }
        header { padding-top: 14px; } }
    @media (prefers-reduced-motion: reduce) { input[type="checkbox"]::before { transition: none; } }
`;

    const HOST_ID = 'blackcat-settings-panel';
    let activePanel = null;

    function openSettingsPanel({settings, hostname, onChange}) {
        if (activePanel?.host.isConnected) {
            activePanel.focus();
            return activePanel;
        }
        activePanel?.close();
        hostname = hostname.toLowerCase();
        let current = normalizeSettings(settings);
        let activeTab = 'theme';
        let revision = 0;
        let storageError = false;
        const controls = new Map();
        const messages = [];
        const pages = new Map();
        const tabs = new Map();
        const t = (key, values) => translate(key, resolveLanguage(current.language), values);
        const element = (tag, className, parent) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            parent?.append(node);
            return node;
        };
        const message = (node, key, values) => {
            messages.push({node, key, values});
            node.textContent = t(key, values);
            return node;
        };
        const host = element('div');
        host.id = HOST_ID;
        const shadow = host.attachShadow({mode: 'open'});
        // The UI is already dark; exclude its stylesheet from Dark Reader recoloring.
        const style = element('style', 'darkreader darkreader--blackcat-ui', shadow);
        style.textContent = PANEL_STYLE;
        const panel = element('section', 'panel', shadow);
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-labelledby', 'blackcat-title');
        panel.tabIndex = -1;
        const header = element('header', '', panel);
        element('span', 'brand', header).textContent = 'B';
        const title = element('div', '', header);
        const heading = element('h1', '', title);
        heading.id = 'blackcat-title';
        heading.textContent = 'Blackcat';
        message(element('p', 'subtitle', title), 'panel.subtitle');
        const closeButton = element('button', 'close', header);
        closeButton.type = 'button';
        closeButton.dataset.action = 'close';
        closeButton.textContent = '×';
        const tabList = element('nav', 'tabs', panel);
        tabList.setAttribute('role', 'tablist');
        const body = element('div', 'body', panel);
        const status = element('p', 'status', panel);
        status.setAttribute('role', 'status');
        status.hidden = true;

        const selectTab = (name, focus = false) => {
            activeTab = name;
            for (const [key, tab] of tabs) {
                const selected = key === name;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
                pages.get(key).hidden = !selected;
            }
            body.scrollTop = 0;
            if (focus) tabs.get(name).focus();
        };
        for (const [key, label] of [['theme', 'panel.theme'], ['site', 'panel.siteTab'], ['automation', 'panel.automation'], ['general', 'panel.general']]) {
            const tab = message(element('button', 'tab', tabList), label);
            tab.type = 'button';
            tab.dataset.tab = key;
            tab.id = `blackcat-tab-${key}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', `blackcat-page-${key}`);
            const page = element('div', '', body);
            page.id = `blackcat-page-${key}`;
            page.dataset.page = key;
            page.setAttribute('role', 'tabpanel');
            page.setAttribute('aria-labelledby', tab.id);
            tabs.set(key, tab);
            pages.set(key, page);
            tab.addEventListener('click', () => selectTab(key));
            tab.addEventListener('keydown', (event) => {
                const names = [...tabs.keys()];
                let index = names.indexOf(key);
                if (event.key === 'ArrowRight') index = (index + 1) % names.length;
                else if (event.key === 'ArrowLeft') index = (index + names.length - 1) % names.length;
                else if (event.key === 'Home') index = 0;
                else if (event.key === 'End') index = names.length - 1;
                else return;
                event.preventDefault();
                selectTab(names[index], true);
            });
        }

        const updateStatus = () => {
            const invalid = [...controls.values()].some((control) => control.getAttribute('aria-invalid') === 'true');
            status.hidden = !invalid && !storageError;
            status.textContent = invalid ? t('panel.invalidInput') : storageError ? t('panel.saveError') : '';
        };
        const valid = (control) => {
            const key = control.dataset.setting;
            if (!control.validity.valid) return false;
            if (key === 'selectionColor' || key === 'scrollbarColor') {
                return control.value === 'auto' || (key === 'scrollbarColor' && control.value === '') || /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(control.value);
            }
            return control.type !== 'time' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(control.value);
        };
        const readValue = (control) => {
            if (control.type === 'checkbox') return control.checked;
            if (control.type === 'range' || control.dataset.setting === 'mode') return Number(control.value);
            if (control.type === 'number') return control.value === '' ? null : Number(control.value);
            return control.value;
        };
        const commit = (next) => {
            current = next;
            const version = ++revision;
            refresh();
            // The adapter applies synchronously and returns its queued storage completion.
            try {
                Promise.resolve(onChange(current)).then(() => {
                    if (version === revision) { storageError = false; updateStatus(); }
                }, () => {
                    if (version === revision) { storageError = true; updateStatus(); }
                });
            } catch {
                storageError = true;
                updateStatus();
            }
        };
        const addControl = (parent, key, labelKey, type, options = {}) => {
            const field = element('label', type === 'range' ? 'field stack' : 'field', parent);
            const caption = element('span', 'caption', field);
            message(element('span', '', caption), labelKey);
            const control = element(type === 'select' ? 'select' : 'input', '', field);
            control.dataset.setting = key;
            control.name = key;
            control.id = `blackcat-control-${key}`;
            field.htmlFor = control.id;
            if (type === 'select') {
                for (const [value, label] of options.choices) {
                    const option = message(element('option', '', control), label);
                    option.value = value;
                }
            } else {
                control.type = type;
                for (const attribute of ['min', 'max', 'step', 'maxLength']) {
                    if (options[attribute] !== undefined) control[attribute] = options[attribute];
                }
                if (type === 'range') element('output', '', caption);
            }
            controls.set(key, control);
            const inputEvent = ['range', 'text', 'number', 'color'].includes(type) ? 'input' : 'change';
            control.addEventListener(inputEvent, () => {
                if (!valid(control)) {
                    control.setAttribute('aria-invalid', 'true');
                    control.closest('.field').classList.remove('changed');
                    updateStatus();
                    return;
                }
                control.removeAttribute('aria-invalid');
                commit(changePanelSetting(current, hostname, key, readValue(control)));
            });
            return control;
        };
        const addCheck = (parent, key, label) => addControl(parent, key, label, 'checkbox');
        const addSelect = (parent, key, label, choices) => addControl(parent, key, label, 'select', {choices});
        const hint = (parent, key) => message(element('p', 'hint', parent), key);
        const condition = (parent, value) => {
            const group = element('div', '', parent);
            group.dataset.condition = value;
            return group;
        };

        const theme = pages.get('theme');
        const scope = element('p', 'scope', theme);
        addSelect(theme, 'mode', 'panel.colorMode', [['1', 'panel.modeDark'], ['0', 'panel.modeDimmed']]);
        addSelect(theme, 'engine', 'panel.engine', [['dynamicTheme', 'engine.dynamic'], ['cssFilter', 'engine.filter'], ['svgFilter', 'engine.svgFilter'], ['staticTheme', 'engine.static']]);
        for (const [key, min, max] of [['brightness', 50, 150], ['contrast', 50, 150], ['grayscale', 0, 100], ['sepia', 0, 100]]) {
            addControl(theme, key, `panel.${key}`, 'range', {min, max, step: 1});
        }
        addCheck(theme, 'styleSystemControls', 'panel.systemControls');
        addCheck(theme, 'detectDarkTheme', 'panel.detectDark');
        const colors = element('details', '', theme);
        message(element('summary', '', colors), 'panel.colors');
        for (const [titleKey, keys] of [
            ['panel.modeDark', [['darkSchemeBackgroundColor', 'panel.background'], ['darkSchemeTextColor', 'panel.text']]],
            ['panel.modeDimmed', [['lightSchemeBackgroundColor', 'panel.background'], ['lightSchemeTextColor', 'panel.text']]],
        ]) {
            message(element('h2', 'group-title', colors), titleKey);
            for (const [key, label] of keys) addControl(colors, key, label, 'color');
        }
        addControl(colors, 'selectionColor', 'panel.selectionColor', 'text', {maxLength: 7});
        addControl(colors, 'scrollbarColor', 'panel.scrollbarColor', 'text', {maxLength: 7});
        hint(colors, 'panel.colorHelp');

        const site = pages.get('site');
        element('p', 'site-name', site).textContent = hostname;
        addCheck(site, 'siteEnabled', 'panel.siteEnabledShort');
        hint(site, 'panel.siteEnabledHelp');
        addCheck(site, 'siteThemeOnly', 'panel.siteThemeShort');
        hint(site, 'panel.siteThemeHelp');

        const automation = pages.get('automation');
        addSelect(automation, 'automation.mode', 'panel.automationMode', [['none', 'panel.automationOff'], ['system', 'panel.automationSystem'], ['time', 'panel.automationTime'], ['location', 'panel.automationLocation']]);
        const behavior = condition(automation, 'active');
        addSelect(behavior, 'automation.behavior', 'panel.automationBehavior', [['OnOff', 'panel.behaviorOff'], ['Scheme', 'panel.behaviorDimmed']]);
        const schedule = condition(automation, 'time');
        addControl(schedule, 'automation.activation', 'panel.turnOnAt', 'time');
        addControl(schedule, 'automation.deactivation', 'panel.turnOffAt', 'time');
        hint(schedule, 'panel.timeHelp');
        const coordinates = condition(automation, 'location');
        addControl(coordinates, 'location.latitude', 'panel.latitude', 'number', {min: -90, max: 90, step: 'any'});
        addControl(coordinates, 'location.longitude', 'panel.longitude', 'number', {min: -180, max: 180, step: 'any'});
        hint(coordinates, 'panel.locationNote');

        const general = pages.get('general');
        addCheck(general, 'enabled', 'panel.enabled');
        addCheck(general, 'enabledByDefault', 'panel.enabledByDefault');
        addSelect(general, 'language', 'panel.language', [['auto', 'panel.languageAuto'], ['en', 'panel.languageEnglish'], ['zh-CN', 'panel.languageChinese']]);
        hint(general, 'panel.defaultsHelp');

        const footer = element('footer', '', panel);
        message(element('span', 'live-note', footer), 'panel.live');
        const initialize = message(element('button', 'initialize', footer), 'panel.reset');
        initialize.type = 'button';
        initialize.dataset.action = 'initialize';
        initialize.addEventListener('click', () => {
            for (const control of controls.values()) control.removeAttribute('aria-invalid');
            commit(changePanelSetting(current, hostname, 'initialize'));
        });

        function refresh() {
            panel.lang = resolveLanguage(current.language);
            for (const {node, key, values} of messages) node.textContent = t(key, values);
            closeButton.setAttribute('aria-label', t('panel.close'));
            tabList.setAttribute('aria-label', t('panel.sections'));
            initialize.title = t('panel.initializeHelp');
            scope.textContent = t(getPanelValue(current, hostname, 'siteThemeOnly') ? 'panel.scopeSite' : 'panel.scopeGlobal');
            for (const [key, control] of controls) {
                if (control.getAttribute('aria-invalid') === 'true') continue;
                const value = getPanelValue(current, hostname, key);
                if (control.type === 'checkbox') control.checked = value;
                else if (control.type === 'color' && value.length === 4) control.value = `#${[...value.slice(1)].map((character) => character + character).join('')}`;
                else control.value = value === null ? '' : String(value);
                const field = control.closest('.field');
                field.classList.toggle('changed', isPanelSettingChanged(current, hostname, key));
                const output = field.querySelector('output');
                if (output) output.value = `${value}%`;
            }
            for (const group of body.querySelectorAll('[data-condition]')) {
                const mode = current.automation.mode;
                group.hidden = group.dataset.condition === 'active' ? mode === 'none' : group.dataset.condition !== mode;
            }
            updateStatus();
        }
        const onEscape = (event) => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
        };
        const previousFocus = document.activeElement;
        const close = () => {
            const hadFocus = Boolean(shadow.activeElement);
            document.removeEventListener('keydown', onEscape, true);
            host.remove();
            if (activePanel === api) activePanel = null;
            if (hadFocus && previousFocus?.isConnected) previousFocus.focus();
        };
        const api = {
            host,
            close,
            focus: () => panel.focus(),
            update: (next) => {
                if (!host.isConnected) return;
                const normalized = normalizeSettings(next);
                if (JSON.stringify(normalized) === JSON.stringify(current)) return;
                current = normalized;
                ++revision;
                storageError = false;
                for (const control of controls.values()) control.removeAttribute('aria-invalid');
                refresh();
            },
        };
        closeButton.addEventListener('click', close);
        panel.addEventListener('click', (event) => event.stopPropagation());
        panel.addEventListener('keydown', (event) => event.stopPropagation());
        document.addEventListener('keydown', onEscape, true);
        selectTab(activeTab);
        refresh();
        (document.documentElement || document.body).append(host);
        activePanel = api;
        panel.focus();
        return api;
    }

    const SETTINGS_KEY = 'blackcat.settings.v1';
    const ENGINE = globalThis.BlackcatDarkReaderEngine;
    const getValue = globalThis.GM_getValue;
    const setValue = globalThis.GM_setValue;
    const registerMenu = globalThis.GM_registerMenuCommand;
    const unregisterMenu = globalThis.GM_unregisterMenuCommand;
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
            return registerMenu(label, callback);
        }
    }

    async function start() {
        let settings = await readSettings();
        const hostname = location.hostname.toLowerCase();
        const t = (key, values) => translate(key, resolveLanguage(settings.language), values);

        let settingsPanel = null;
        const adoptSettings = (next) => {
            settings = next;
            apply(settings, false);
            scheduleAutomation(settings);
            settingsPanel?.update(settings);
            registerMenuCommands();
        };
        const commit = createSettingsCommitter({apply: adoptSettings, persist});
        const reportSaveError = (error) => console.error('[Blackcat] Settings could not be saved:', error);
        const menuIds = [];
        let menuSignature = null;
        const registerMenuCommands = () => {
            const signature = JSON.stringify([resolveLanguage(settings.language), resolveSiteEnabled(settings, location.href), settings.enabled, settings.mode]);
            if (signature === menuSignature) return;
            if (menuIds.length > 0) {
                if (typeof unregisterMenu !== 'function' || menuIds.some((id) => id === undefined || id === null)) return;
                for (const id of menuIds) unregisterMenu(id);
                menuIds.length = 0;
            }
            menuSignature = signature;

            menuIds.push(register(t('menu.site', {
                status: t(resolveSiteEnabled(settings, location.href) ? 'state.enabled' : 'state.disabled'),
            }), () => {
                void commit(setSiteOverride(settings, hostname, !resolveSiteEnabled(settings, location.href))).catch(reportSaveError);
            }));
            menuIds.push(register(t('menu.global', {
                status: t(settings.enabled ? 'state.enabled' : 'state.disabled'),
            }), () => {
                void commit({...settings, enabled: !settings.enabled}).catch(reportSaveError);
            }));
            menuIds.push(register(t('menu.colorMode', {mode: t(settings.mode ? 'mode.dark' : 'mode.dimmed')}), () => {
                void commit({...settings, mode: settings.mode ? 0 : 1}).catch(reportSaveError);
            }));
            menuIds.push(register(t('menu.settings'), () => {
                settingsPanel = openSettingsPanel({settings, hostname, onChange: commit});
            }));
        };
        registerMenuCommands();

        apply(settings);
        scheduleAutomation(settings);

        if (typeof addValueListener === 'function') {
            addValueListener(SETTINGS_KEY, (_key, _oldValue, newValue, remote) => {
                if (remote && newValue) {
                    adoptSettings(normalizeSettings(newValue));
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
