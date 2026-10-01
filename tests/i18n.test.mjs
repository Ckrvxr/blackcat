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
    assert.equal(translate('menu.settings', 'zh-CN'), '⚙️ 所有设置');
    assert.equal(translate('menu.global', 'zh-CN', {status: '关闭'}), '🌍 在所有站点上：关闭');
    assert.equal(translate('menu.site', 'zh-CN', {status: '启用'}), '🌐 在此站点上：启用');
    assert.equal(translate('menu.global', 'en', {status: 'Disabled'}), '🌍 On all sites: Disabled');
    assert.equal(translate('engine.dynamic', 'zh-CN'), '动态');
    assert.equal(translate('engine.filter', 'zh-CN'), '滤镜');
    assert.equal(translate('engine.svgFilter', 'zh-CN'), '增强滤镜(SVG)');
    assert.equal(translate('engine.static', 'zh-CN'), '静态');
    assert.equal(translate('panel.siteEnabledShort', 'zh-CN'), '在此站点上启用');
    assert.equal(translate('panel.currentSite', 'zh-CN'), '当前站点');
    assert.equal(translate('panel.theme', 'zh-CN'), '全局设置');
    assert.equal(translate('panel.general', 'zh-CN'), '通用');
    assert.equal(translate('panel.enabledByDefault', 'zh-CN'), '在所有站点上启用');
    assert.equal(translate('panel.globalRequired', 'zh-CN'), '请先开启全局开关，再启用此站点。');
    assert.equal(translate('panel.siteTab', 'zh-CN'), '此站点设置');
    assert.equal(translate('panel.siteStyleFollowGlobal', 'zh-CN'), '跟随全局样式');
    assert.equal(translate('panel.siteStyleIndependent', 'zh-CN'), '独立样式');
    assert.equal(translate('panel.configFile', 'zh-CN'), '配置文件');
    assert.equal(translate('panel.export', 'zh-CN'), '导出');
    assert.equal(translate('panel.import', 'zh-CN'), '导入');
    assert.equal(translate('panel.clear', 'zh-CN'), '清除');
    assert.equal(translate('panel.importWarning', 'zh-CN'), '！导入配置会覆盖当前所有配置');
    assert.equal(translate('panel.clearWarning', 'zh-CN'), '！清除配置将清除当前所有配置');
    assert.equal(translate('panel.subtitle', 'zh-CN'), '所有更改将即时生效并保存');
    assert.equal(translate('panel.subtitle', 'en'), 'All changes take effect immediately and are saved.');
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
