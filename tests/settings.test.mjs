import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, normalizeSettings, resolveSiteEnabled, setSiteOverride, resolveThemeForSite, setSiteTheme, toThemeOptions, resolveAutomationState, isWithinTimeWindow} from '../src/settings.mjs';

test('defaults enable Dark Reader dynamically and follow system preference', () => {
    assert.equal(DEFAULT_SETTINGS.enabled, true);
    assert.equal(DEFAULT_SETTINGS.detectDarkTheme, true);
    assert.equal(DEFAULT_SETTINGS.styleSystemControls, false);
    assert.equal(DEFAULT_SETTINGS.engine, 'dynamicTheme');
    assert.equal(DEFAULT_SETTINGS.automation.mode, 'none');
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

test('normalizes font, colors, selection, scrollbars, and system-control options', () => {
    const settings = normalizeSettings({
        useFont: true,
        fontFamily: 'Inter, sans-serif',
        textStroke: 0.4,
        darkSchemeBackgroundColor: '#123456',
        selectionColor: '#abcdef',
        scrollbarColor: 'auto',
        styleSystemControls: false,
        detectDarkTheme: false,
    });

    assert.equal(settings.useFont, true);
    assert.equal(settings.fontFamily, 'Inter, sans-serif');
    assert.equal(settings.textStroke, 0.4);
    assert.equal(settings.darkSchemeBackgroundColor, '#123456');
    assert.equal(settings.selectionColor, '#abcdef');
    assert.equal(settings.scrollbarColor, 'auto');
    assert.equal(settings.styleSystemControls, false);
    assert.equal(settings.detectDarkTheme, false);

    const unsafeFont = normalizeSettings({fontFamily: 'Inter; display:none'});
    assert.equal(unsafeFont.fontFamily, DEFAULT_SETTINGS.fontFamily);
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

test('automation can turn off or switch to the dimmed color scheme', () => {
    const settings = normalizeSettings({automation: {mode: 'system', behavior: 'Scheme'}});
    assert.deepEqual(resolveAutomationState(settings, {systemDark: false}), {enabled: true, mode: 0});
    assert.deepEqual(resolveAutomationState(settings, {systemDark: true}), {enabled: true, mode: 1});

    const turnOff = normalizeSettings({automation: {mode: 'system', behavior: 'OnOff'}});
    assert.deepEqual(resolveAutomationState(turnOff, {systemDark: false}), {enabled: false, mode: 1});

    const location = normalizeSettings({automation: {mode: 'location', behavior: 'Scheme'}});
    assert.deepEqual(resolveAutomationState(location, {locationNight: false}), {enabled: true, mode: 0});
    assert.deepEqual(resolveAutomationState(location, {locationNight: true}), {enabled: true, mode: 1});
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
