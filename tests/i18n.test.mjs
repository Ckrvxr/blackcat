import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLanguage, MESSAGE_KEYS, resolveLanguage, translate} from '../src/i18n.mjs';

test('detects Chinese browser locales and keeps English for other locales', () => {
    assert.equal(detectLanguage('zh-CN'), 'zh-CN');
    assert.equal(detectLanguage('zh-TW'), 'zh-CN');
    assert.equal(detectLanguage('en-US'), 'en');
    assert.equal(detectLanguage(''), 'en');
});

test('resolves automatic and explicit language choices', () => {
    assert.equal(resolveLanguage('auto', 'zh-CN'), 'zh-CN');
    assert.equal(resolveLanguage('auto', 'en-US'), 'en');
    assert.equal(resolveLanguage('en', 'zh-CN'), 'en');
    assert.equal(resolveLanguage('zh-CN', 'en-US'), 'zh-CN');
    assert.equal(resolveLanguage('invalid', 'zh-CN'), 'zh-CN');
});

test('translates the three visible menu labels and their state values', () => {
    assert.equal(translate('menu.settings', 'zh-CN'), '⚙️ 更多设置');
    assert.equal(translate('menu.global', 'zh-CN', {status: '关闭'}), '🌍 全局：关闭');
    assert.equal(translate('menu.site', 'zh-CN', {status: '启用'}), '🌐 此网站上: 启用');
    assert.equal(translate('menu.global', 'en', {status: 'Disabled'}), '🌍 Global: Disabled');
    assert.equal(translate('panel.siteEnabledShort', 'zh-CN'), '在此网站启用');
    assert.equal(translate('panel.reset', 'zh-CN'), '初始化');
});

test('prefixes each menu command with a matching emoji', () => {
    const icons = {
        'menu.settings': '⚙️',
        'menu.site': '🌐',
        'menu.global': '🌍',
    };
    for (const language of ['en', 'zh-CN']) {
        for (const [key, icon] of Object.entries(icons)) {
            assert.ok(translate(key, language).startsWith(icon), `${key} should start with ${icon} in ${language}`);
        }
    }
});

test('provides a Simplified Chinese translation for every UI message', () => {
    for (const key of MESSAGE_KEYS) {
        assert.notEqual(translate(key, 'zh-CN'), translate(key, 'en'), `${key} should be translated`);
    }
});

test('falls back to English for an untranslated message', () => {
    assert.equal(translate('panel.automationLocation', 'zh-CN'), '按日出和日落切换');
    assert.equal(translate('unknown.key', 'zh-CN'), 'unknown.key');
});
