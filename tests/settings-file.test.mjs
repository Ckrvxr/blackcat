import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_SETTINGS, normalizeSettings} from '../src/settings.mjs';
import {MAX_SETTINGS_FILE_BYTES, parseSettingsFile, serializeSettingsFile} from '../src/settings-file.mjs';

const FORMAT = 'blackcat-settings';

const fileFor = (settings, version = 1, format = FORMAT) => JSON.stringify({format, version, settings});

test('exports and restores the complete normalized configuration', () => {
    const settings = normalizeSettings({
        enabled: false,
        enabledByDefault: false,
        language: 'zh-CN',
        engine: 'cssFilter',
        brightness: 115,
        automation: {mode: 'location'},
        location: {latitude: 34.1, longitude: -118.2},
        siteOverrides: {'example.com': false},
        siteThemes: {'example.com': {brightness: 80, engine: 'svgFilter'}},
        siteThemeModes: {'example.com': 'independent'},
    });

    assert.deepEqual(parseSettingsFile(serializeSettingsFile(settings)), settings);
});

test('rejects malformed, unrelated, or unsupported configuration files', () => {
    assert.throws(() => parseSettingsFile('{'), /JSON/);
    assert.throws(() => parseSettingsFile('[]'), /configuration file/i);
    assert.throws(() => parseSettingsFile(fileFor(DEFAULT_SETTINGS, 2)), /version/i);
    assert.throws(() => parseSettingsFile(fileFor(DEFAULT_SETTINGS, 1, 'other-app')), /configuration file/i);
    assert.throws(() => parseSettingsFile(fileFor(null)), /settings/i);
});

test('rejects oversized input before parsing it', () => {
    assert.throws(() => parseSettingsFile(' '.repeat(MAX_SETTINGS_FILE_BYTES + 1)), /too large/i);
});

test('normalizes imported values and drops invalid or unknown data', () => {
    const settings = parseSettingsFile(fileFor({
        enabled: 'yes',
        engine: 'unknown-engine',
        brightness: 999,
        unknownSetting: '<script>',
        siteOverrides: {'example.com': 'yes', 'bad..host': false},
        siteThemes: {'example.com': {brightness: 400, unknownSetting: '<script>'}},
    }));

    assert.equal(settings.enabled, DEFAULT_SETTINGS.enabled);
    assert.equal(settings.engine, DEFAULT_SETTINGS.engine);
    assert.equal(settings.brightness, 150);
    assert.equal('unknownSetting' in settings, false);
    assert.deepEqual(settings.siteOverrides, {});
    assert.deepEqual(settings.siteThemes['example.com'], {brightness: 150});
});
