import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, normalizeSettings, toThemeOptions} from '../src/settings.mjs';
import {changePanelSetting, getPanelValue, isPanelSettingChanged, createSettingsCommitter} from '../src/settings-panel-state.mjs';

const host = 'example.com';

test('changing one field preserves other settings and other sites', () => {
    const initial = normalizeSettings({contrast: 120, language: 'en', siteThemes: {'other.com': {brightness: 90}}});
    const next = changePanelSetting(initial, host, 'brightness', 110);
    assert.equal(next.brightness, 110);
    assert.equal(next.contrast, 120);
    assert.equal(next.language, 'en');
    assert.deepEqual(next.siteThemes, initial.siteThemes);
    assert.equal(initial.brightness, 100);
});

test('all engine options remain editable in global and site scopes', () => {
    for (const [key, value] of Object.entries(toThemeOptions(DEFAULT_SETTINGS))) {
        const global = changePanelSetting(normalizeSettings({}), host, key, value);
        assert.equal(getPanelValue(global, host, key), value);
        const scoped = changePanelSetting(global, host, 'siteThemeOnly', true);
        const next = changePanelSetting(scoped, host, key, value);
        assert.equal(next.siteThemes[host][key], value);
    }
});

test('site theme toggle copies the current appearance and never overwrites global values', () => {
    const initial = normalizeSettings({brightness: 115, siteThemes: {'other.com': {contrast: 120}}});
    const scoped = changePanelSetting(initial, host, 'siteThemeOnly', true);
    const changed = changePanelSetting(scoped, host, 'brightness', 80);
    assert.equal(changed.brightness, 115);
    assert.equal(getPanelValue(changed, host, 'brightness'), 80);
    const unscoped = changePanelSetting(changed, host, 'siteThemeOnly', false);
    assert.equal(getPanelValue(unscoped, host, 'brightness'), 115);
    assert.deepEqual(unscoped.siteThemes, initial.siteThemes);
});

test('automation, coordinates, language and enablement change independently', () => {
    let current = normalizeSettings({});
    for (const [key, value] of [['automation.mode', 'location'], ['automation.behavior', 'Scheme'], ['location.latitude', 30], ['location.longitude', 120], ['language', 'en'], ['enabled', false], ['enabledByDefault', false], ['siteEnabled', true]]) {
        current = changePanelSetting(current, host, key, value);
        assert.equal(getPanelValue(current, host, key), value);
    }
    assert.equal(current.automation.mode, 'location');
    assert.equal(current.location.latitude, 30);
});

test('bold markers compare against factory defaults, including site values and equivalent hex colors', () => {
    let current = normalizeSettings({});
    assert.equal(isPanelSettingChanged(current, host, 'brightness'), false);
    current = changePanelSetting(current, host, 'brightness', 110);
    current = changePanelSetting(current, host, 'siteThemeOnly', true);
    assert.equal(isPanelSettingChanged(current, host, 'brightness'), true);
    current = changePanelSetting(current, host, 'brightness', 100);
    assert.equal(isPanelSettingChanged(current, host, 'brightness'), false);
    assert.equal(isPanelSettingChanged(current, host, 'siteThemeOnly'), true);
    assert.equal(isPanelSettingChanged(normalizeSettings({darkSchemeBackgroundColor: '#181A1B'}), host, 'darkSchemeBackgroundColor'), false);
    assert.equal(isPanelSettingChanged(normalizeSettings({location: {latitude: ''}}), host, 'location.latitude'), false);
});

test('initialization restores every factory value and clears all site records', () => {
    const current = normalizeSettings({language: 'en', enabled: false, siteOverrides: {[host]: false, 'other.com': false}, siteThemes: {[host]: {brightness: 80}, 'other.com': {contrast: 120}}});
    const next = changePanelSetting(current, host, 'initialize');
    assert.deepEqual(next, normalizeSettings(DEFAULT_SETTINGS));
});

test('site enablement can override an inherited wildcard rule', () => {
    const hostname = 'news.example.com';
    const initial = normalizeSettings({siteOverrides: {'*.example.com': false}});
    const next = changePanelSetting(initial, hostname, 'siteEnabled', true);
    assert.equal(getPanelValue(next, hostname, 'siteEnabled'), true);
    assert.equal(next.siteOverrides[hostname], true);
    const restored = changePanelSetting(next, hostname, 'siteEnabled', false);
    assert.deepEqual(restored.siteOverrides, initial.siteOverrides);
});

test('unknown panel fields are rejected instead of becoming stored data', () => {
    assert.throws(() => changePanelSetting(normalizeSettings({}), host, '__proto__', {}), TypeError);
});

test('changes apply synchronously and rapid writes persist the newest snapshot', async () => {
    const applied = [];
    const stored = [];
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const commit = createSettingsCommitter({apply: (settings) => applied.push(settings.brightness), persist: async (settings) => {
        stored.push(settings.brightness);
        if (stored.length === 1) await blocked;
    }});
    const first = commit({brightness: 110});
    assert.deepEqual(applied, [110]);
    await Promise.resolve();
    const second = commit({brightness: 120});
    const third = commit({brightness: 130});
    assert.deepEqual(applied, [110, 120, 130]);
    release();
    await Promise.all([first, second, third]);
    assert.deepEqual(stored, [110, 130]);
});

test('a failed write rejects its caller without blocking subsequent changes', async () => {
    let writes = 0;
    const commit = createSettingsCommitter({apply: () => {}, persist: async () => {
        if (++writes === 1) throw new Error('storage unavailable');
    }});
    await assert.rejects(commit({brightness: 110}), /storage unavailable/);
    await commit({brightness: 120});
    assert.equal(writes, 2);
});
