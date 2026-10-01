import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, normalizeSettings, resolveSiteEnabled, setSiteOverride, resolveThemeForSite, setSiteTheme, toThemeOptions, resolveAutomationState, isWithinTimeWindow} from '../src/settings.mjs';

test('defaults to an always-dark theme with no configurable scheme palette', () => {
    assert.equal(DEFAULT_SETTINGS.enabled, true);
    assert.equal(DEFAULT_SETTINGS.detectDarkTheme, true);
    assert.equal(DEFAULT_SETTINGS.styleSystemControls, false);
    assert.equal(DEFAULT_SETTINGS.engine, 'dynamicTheme');
    assert.equal(DEFAULT_SETTINGS.mode, undefined);
    assert.equal(toThemeOptions(DEFAULT_SETTINGS).mode, 1);
    for (const key of ['darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor']) {
        assert.equal(Object.hasOwn(DEFAULT_SETTINGS, key), false);
        assert.equal(Object.hasOwn(toThemeOptions(DEFAULT_SETTINGS), key), false);
    }
    assert.equal(DEFAULT_SETTINGS.automation.mode, 'none');
    assert.equal(DEFAULT_SETTINGS.language, 'auto');
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
    assert.equal(settings.automation.mode, 'none');
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
        styleSystemControls: false,
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
    assert.equal(settings.styleSystemControls, false);
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

test('site theme overrides apply only to their matching host', () => {
    const base = normalizeSettings({brightness: 100, engine: 'dynamicTheme'});
    const local = setSiteTheme(base, 'example.com', true, {brightness: 130, engine: 'svgFilter'});

    assert.equal(resolveThemeForSite(local, 'https://example.com/page').brightness, 130);
    assert.equal(resolveThemeForSite(local, 'https://example.com/page').engine, 'svgFilter');
    assert.equal(resolveThemeForSite(local, 'https://other.test').brightness, 100);

    const cleared = setSiteTheme(local, 'example.com', false);
    assert.equal(Object.hasOwn(cleared.siteThemes, 'example.com'), false);

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
