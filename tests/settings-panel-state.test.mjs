import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, normalizeSettings, toThemeOptions} from '../src/settings.mjs';
import {THEME_SETTING_KEYS, changePanelSetting, getPanelValue, isPanelSettingChanged, createSettingsCommitter} from '../src/settings-panel-state.mjs';

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

test('all engine options remain editable in global and independent site scopes', () => {
    for (const key of THEME_SETTING_KEYS) {
        const value = toThemeOptions(DEFAULT_SETTINGS)[key];
        const global = changePanelSetting(normalizeSettings({}), host, key, value);
        assert.equal(getPanelValue(global, host, key), value);
        const independent = changePanelSetting(global, host, 'siteStyleMode', 'independent');
        const next = changePanelSetting(independent, host, key, value, 'site');
        assert.equal(next.siteThemes[host][key], value);
    }
});

test('site styles follow global or restore saved independent values without losing them', () => {
    const initial = normalizeSettings({brightness: 115, siteThemes: {'other.com': {contrast: 120}}});
    const independent = changePanelSetting(initial, host, 'siteStyleMode', 'independent');
    const changed = changePanelSetting(independent, host, 'brightness', 80, 'site');
    assert.equal(changed.brightness, 115);
    assert.equal(getPanelValue(changed, host, 'brightness', 'site'), 80);

    const following = changePanelSetting(changed, host, 'siteStyleMode', 'global');
    assert.equal(getPanelValue(following, host, 'brightness', 'site'), 115);
    assert.equal(following.siteThemes[host].brightness, 80);
    assert.equal(following.siteThemes['other.com'].contrast, 120);

    const globalChanged = changePanelSetting(following, host, 'brightness', 125);
    const restored = changePanelSetting(globalChanged, host, 'siteStyleMode', 'independent');
    assert.equal(getPanelValue(restored, host, 'brightness', 'site'), 80);
    assert.equal(getPanelValue(restored, host, 'brightness'), 125);
});

test('automation, coordinates, language and enablement change independently', () => {
    let current = normalizeSettings({});
    for (const [key, value] of [['automation.mode', 'location'], ['location.latitude', 30], ['location.longitude', 120], ['language', 'en'], ['enabled', false], ['enabledByDefault', false], ['siteEnabled', true]]) {
        current = changePanelSetting(current, host, key, value);
        assert.equal(getPanelValue(current, host, key), value);
    }
    assert.equal(current.automation.mode, 'location');
    assert.equal(current.location.latitude, 30);
});

test('bold markers compare global and site values against factory defaults', () => {
    let current = normalizeSettings({});
    assert.equal(isPanelSettingChanged(current, host, 'brightness'), false);
    current = changePanelSetting(current, host, 'brightness', 110);
    current = changePanelSetting(current, host, 'siteStyleMode', 'independent');
    assert.equal(isPanelSettingChanged(current, host, 'brightness', 'site'), true);
    current = changePanelSetting(current, host, 'brightness', 100, 'site');
    assert.equal(isPanelSettingChanged(current, host, 'brightness', 'site'), false);
    assert.equal(isPanelSettingChanged(current, host, 'siteStyleMode'), true);
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

test('fixed dark mode and removed palette fields are not panel settings', () => {
    const removedSettings = ['mode', 'styleSystemControls', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor', 'automation.behavior'];
    for (const key of removedSettings) {
        assert.equal(THEME_SETTING_KEYS.includes(key), false);
        assert.throws(() => changePanelSetting(normalizeSettings({}), host, key, 'value'), TypeError);
    }
    assert.equal(toThemeOptions(DEFAULT_SETTINGS).mode, 1);
});

test('unknown panel fields and invalid theme modes are rejected instead of becoming stored data', () => {
    const initial = normalizeSettings({});
    assert.throws(() => changePanelSetting(initial, host, '__proto__', {}), TypeError);
    assert.throws(() => changePanelSetting(initial, host, 'siteStyleMode', 'unexpected'), /site theme mode/);
    assert.throws(() => changePanelSetting(initial, host, 'brightness', 120, 'site'), /require independent style mode/);
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
