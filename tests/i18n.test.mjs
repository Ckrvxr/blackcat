import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLanguage, MESSAGE_KEYS, translate} from '../src/i18n.mjs';

test('detects Chinese browser locales and keeps English for other locales', () => {
    assert.equal(detectLanguage('zh-CN'), 'zh-CN');
    assert.equal(detectLanguage('zh-TW'), 'zh-CN');
    assert.equal(detectLanguage('en-US'), 'en');
    assert.equal(detectLanguage(''), 'en');
});

test('translates menu labels and interpolates the current hostname', () => {
    assert.equal(translate('menu.settings', 'zh-CN'), '设置');
    assert.equal(translate('menu.settings', 'en'), 'Settings');
    assert.equal(translate('menu.site', 'zh-CN'), '切换此网站');
    assert.equal(translate('panel.siteEnabled', 'zh-CN', {hostname: 'example.com'}), '为 example.com 启用 Blackcat');
});

test('provides a Simplified Chinese translation for every UI message', () => {
    for (const key of MESSAGE_KEYS) {
        assert.notEqual(translate(key, 'zh-CN'), translate(key, 'en'), `${key} should be translated`);
    }
});

test('falls back to English for an untranslated message', () => {
    assert.equal(translate('automation.location', 'zh-CN'), '日出/日落');
    assert.equal(translate('unknown.key', 'zh-CN'), 'unknown.key');
});
