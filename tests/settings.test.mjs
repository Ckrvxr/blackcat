import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, normalizeSettings, resolveSiteEnabled, setSiteOverride, resolveSiteThemeMode, resolveThemeForSite, setSiteTheme, setSiteThemeMode, toThemeOptions, resolveAutomationState, isWithinTimeWindow} from '../src/settings.mjs';

test('defaults to an always-dark theme with no configurable scheme palette', () => {
    assert.equal(DEFAULT_SETTINGS.enabled, true);
    assert.equal(DEFAULT_SETTINGS.detectDarkTheme, true);
    assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'styleSystemControls'), false);
    assert.equal(DEFAULT_SETTINGS.engine, 'dynamicTheme');
    assert.equal(DEFAULT_SETTINGS.mode, undefined);
    assert.equal(toThemeOptions(DEFAULT_SETTINGS).mode, 1);
    for (const key of ['darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor']) {
        assert.equal(Object.hasOwn(DEFAULT_SETTINGS, key), false);
        assert.equal(Object.hasOwn(toThemeOptions(DEFAULT_SETTINGS), key), false);
    }
    assert.equal(DEFAULT_SETTINGS.automation.mode, 'system');
    assert.equal(DEFAULT_SETTINGS.language, 'auto');
});

test('forces system control styling off without persisting the removed setting', () => {
    const settings = normalizeSettings({
        styleSystemControls: true,
        siteThemes: {'example.com': {styleSystemControls: true}},
    });

    assert.equal(Object.hasOwn(settings, 'styleSystemControls'), false);
    assert.deepEqual(settings.siteThemes, {});
    assert.equal(toThemeOptions(settings).styleSystemControls, false);
});

test('normalizes saved language preferences', () => {
    assert.equal(normalizeSettings({language: 'zh-CN'}).language, 'zh-CN');
    assert.equal(normalizeSettings({language: 'en'}).language, 'en');
    assert.equal(normalizeSettings({language: 'unsupported'}).language, 'auto');
});

test('normalizes persisted values and rejects invalid engine names', () => {
    const settings = normalizeSettings({
        enabled: 'yes',
        engine: 'executeCode',
        brightness: 190,
        contrast: -1,
        automation: {mode: 'unknown'},
    });

    assert.equal(settings.enabled, true);
    assert.equal(settings.engine, 'dynamicTheme');
    assert.equal(settings.brightness, 150);
    assert.equal(settings.contrast, 50);
    assert.equal(settings.automation.mode, 'system');
});

test('removes legacy font and text stroke settings from data and engine options', () => {
    const legacy = {
        useFont: true,
        fontFamily: 'Inter, sans-serif',
        textStroke: 0.8,
        siteThemes: {'example.com': {useFont: true, fontFamily: 'Inter, sans-serif', textStroke: 0.8}},
    };
    const settings = normalizeSettings(legacy);
    const options = toThemeOptions({...DEFAULT_SETTINGS, ...legacy});

    assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'useFont'), false);
    assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'fontFamily'), false);
    assert.equal(Object.hasOwn(DEFAULT_SETTINGS, 'textStroke'), false);
    assert.equal(Object.hasOwn(settings, 'useFont'), false);
    assert.equal(Object.hasOwn(settings, 'fontFamily'), false);
    assert.equal(Object.hasOwn(settings, 'textStroke'), false);
    assert.deepEqual(settings.siteThemes, {});
    assert.equal(Object.hasOwn(options, 'useFont'), false);
    assert.equal(Object.hasOwn(options, 'fontFamily'), false);
    assert.equal(Object.hasOwn(options, 'textStroke'), false);
});

test('drops legacy dimmed mode and color overrides from settings and engine options', () => {
    const settings = normalizeSettings({
        mode: 0,
        darkSchemeBackgroundColor: '#123456',
        darkSchemeTextColor: '#abcdef',
        lightSchemeBackgroundColor: '#eeeeee',
        lightSchemeTextColor: '#111111',
        selectionColor: '#abcdef',
        scrollbarColor: '#123',
        styleSystemControls: true,
        detectDarkTheme: false,
        automation: {mode: 'system', behavior: 'Scheme'},
    });
    const options = toThemeOptions(settings);

    assert.equal(options.mode, 1);
    assert.equal(settings.mode, undefined);
    assert.equal(settings.automation.behavior, undefined);
    for (const key of ['darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor']) {
        assert.equal(settings[key], undefined);
        assert.equal(options[key], undefined);
    }
    assert.equal(Object.hasOwn(settings, 'styleSystemControls'), false);
    assert.equal(options.styleSystemControls, false);
    assert.equal(settings.detectDarkTheme, false);
});

test('only theme fields are passed to the rendering engine', () => {
    const options = toThemeOptions({
        ...DEFAULT_SETTINGS,
        enabled: false,
        automation: {mode: 'time', activation: '18:00', deactivation: '09:00'},
        siteOverrides: {'example.com': false},
    });

    assert.equal(options.engine, 'dynamicTheme');
    assert.equal(options.detectDarkTheme, true);
    assert.equal(Object.hasOwn(options, 'enabled'), false);
    assert.equal(Object.hasOwn(options, 'automation'), false);
    assert.equal(Object.hasOwn(options, 'siteOverrides'), false);
});

test('per-site overrides take precedence over the global switch', () => {
    const settings = normalizeSettings({
        enabled: true,
        enabledByDefault: false,
        siteOverrides: {'example.com': true, 'disabled.test': false}
    });

    assert.equal(resolveSiteEnabled(settings, 'https://example.com/page'), true);
    assert.equal(resolveSiteEnabled(settings, 'https://disabled.test'), false);
    assert.equal(resolveSiteEnabled(settings, 'https://other.test'), false);
});

test('site overrides are removed when they match the default policy', () => {
    const defaults = normalizeSettings({enabledByDefault: true});
    const disabled = setSiteOverride(defaults, 'Example.COM', false);

    assert.equal(resolveSiteEnabled(disabled, 'https://example.com'), false);
    assert.equal(disabled.siteOverrides['example.com'], false);

    const restored = setSiteOverride(disabled, 'example.com', true);
    assert.equal(resolveSiteEnabled(restored, 'https://example.com'), true);
    assert.equal(Object.hasOwn(restored.siteOverrides, 'example.com'), false);
});

test('site style modes copy global values once and retain independent values while following global', () => {
    const base = normalizeSettings({brightness: 110, contrast: 120, engine: 'dynamicTheme'});
    const independent = setSiteThemeMode(base, 'example.com', 'independent');

    assert.equal(resolveSiteThemeMode(independent, 'https://example.com/page'), 'independent');
    assert.equal(independent.siteThemes['example.com'].brightness, 110);
    assert.equal(resolveThemeForSite(independent, 'https://example.com/page').brightness, 110);

    const edited = setSiteTheme(independent, 'example.com', {brightness: 130, engine: 'svgFilter'});
    assert.equal(resolveThemeForSite(edited, 'https://example.com/page').brightness, 130);
    assert.equal(resolveThemeForSite(edited, 'https://example.com/page').engine, 'svgFilter');
    assert.equal(resolveThemeForSite(edited, 'https://other.test').brightness, 110);

    const following = setSiteThemeMode(edited, 'example.com', 'global');
    assert.equal(resolveSiteThemeMode(following, 'https://example.com/page'), 'global');
    assert.equal(resolveThemeForSite(following, 'https://example.com/page').brightness, 110);
    assert.equal(following.siteThemes['example.com'].brightness, 130);

    const globalChanged = normalizeSettings({...following, brightness: 115});
    const restored = setSiteThemeMode(globalChanged, 'example.com', 'independent');
    assert.equal(restored.siteThemes['example.com'].brightness, 130);
    assert.equal(resolveThemeForSite(restored, 'https://example.com/page').brightness, 130);
    assert.throws(() => setSiteThemeMode(restored, 'example.com', 'unexpected'), /site theme mode/);
});

test('migrates legacy site themes to independent mode and sanitizes persisted modes', () => {
    const legacy = normalizeSettings({siteThemes: {'example.com': {brightness: 130}}});
    assert.equal(legacy.siteThemeModes['example.com'], 'independent');

    const following = normalizeSettings({
        siteThemes: {'example.com': {brightness: 130}},
        siteThemeModes: {'example.com': 'global', 'bad host': 'independent', 'other.com': 'invalid'},
    });
    assert.equal(following.siteThemeModes['example.com'], 'global');
    assert.equal(following.siteThemeModes['bad host'], undefined);
    assert.equal(following.siteThemeModes['other.com'], undefined);
    assert.equal(following.siteThemes['example.com'].brightness, 130);
});

test('specific site mode overrides inherited wildcard style mode', () => {
    const inherited = normalizeSettings({siteThemes: {'*.example.com': {brightness: 90}}});
    assert.equal(resolveSiteThemeMode(inherited, 'https://news.example.com'), 'independent');
    assert.equal(resolveThemeForSite(inherited, 'https://news.example.com').brightness, 90);

    const overridden = normalizeSettings({
        ...inherited,
        siteThemeModes: {'*.example.com': 'independent', 'news.example.com': 'global'},
    });
    assert.equal(resolveSiteThemeMode(overridden, 'https://news.example.com'), 'global');
    assert.equal(resolveThemeForSite(overridden, 'https://news.example.com').brightness, DEFAULT_SETTINGS.brightness);
});

test('normalizes legacy site theme values and rejects unrecognized fields', () => {
    const sanitized = normalizeSettings({siteThemes: {'example.com': {brightness: 'bad', engine: 'invalid', injected: true}}});
    const safeTheme = resolveThemeForSite(sanitized, 'https://example.com/');
    assert.equal(safeTheme.brightness, DEFAULT_SETTINGS.brightness);
    assert.equal(safeTheme.engine, DEFAULT_SETTINGS.engine);
    assert.equal(Object.hasOwn(safeTheme, 'injected'), false);
});

test('automation only turns the fixed dark theme on or off', () => {
    const settings = normalizeSettings({automation: {mode: 'system', behavior: 'Scheme'}});
    assert.deepEqual(resolveAutomationState(settings, {systemDark: false}), {enabled: false});
    assert.deepEqual(resolveAutomationState(settings, {systemDark: true}), {enabled: true});

    const location = normalizeSettings({automation: {mode: 'location', behavior: 'Scheme'}});
    assert.deepEqual(resolveAutomationState(location, {locationNight: false}), {enabled: false});
    assert.deepEqual(resolveAutomationState(location, {locationNight: true}), {enabled: true});
});

test('location automation accepts only bounded, explicit coordinates', () => {
    const valid = normalizeSettings({
        automation: {mode: 'location'},
        location: {latitude: 37.7749, longitude: -122.4194},
    });
    assert.equal(valid.automation.mode, 'location');
    assert.deepEqual(valid.location, {latitude: 37.7749, longitude: -122.4194});

    const invalid = normalizeSettings({
        automation: {mode: 'location'},
        location: {latitude: 91, longitude: 'not-a-number'},
    });
    assert.deepEqual(invalid.location, {latitude: null, longitude: null});
});

test('time windows support daytime and overnight intervals', () => {
    assert.equal(isWithinTimeWindow('09:00', '17:00', new Date(2024, 0, 1, 12, 0)), true);
    assert.equal(isWithinTimeWindow('09:00', '17:00', new Date(2024, 0, 1, 20, 0)), false);
    assert.equal(isWithinTimeWindow('18:00', '09:00', new Date(2024, 0, 1, 23, 0)), true);
    assert.equal(isWithinTimeWindow('18:00', '09:00', new Date(2024, 0, 1, 12, 0)), false);
});
