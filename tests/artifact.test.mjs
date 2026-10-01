import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distPath = path.join(projectRoot, 'dist');
const script = readFileSync(path.join(distPath, 'blackcat.user.js'), 'utf8');
const packageJSON = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const upstream = JSON.parse(readFileSync(path.join(projectRoot, 'upstream.json'), 'utf8'));
const adapter = readFileSync(path.join(projectRoot, 'src/userscript-entry.mjs'), 'utf8');
const panel = readFileSync(path.join(projectRoot, 'src/settings-panel.mjs'), 'utf8');
const panelState = readFileSync(path.join(projectRoot, 'src/settings-panel-state.mjs'), 'utf8');
const settings = readFileSync(path.join(projectRoot, 'src/settings.mjs'), 'utf8');
const i18n = readFileSync(path.join(projectRoot, 'src/i18n.mjs'), 'utf8');
const uiSource = [adapter, panel, panelState, settings, i18n].join('\n');

test('built userscript is self-contained and updates from an explicit release ref', () => {
    assert.match(script, /^\/\/ ==UserScript==/);
    const updateRef = script.match(/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/Ckrvxr\/blackcat\/([A-Za-z0-9._-]+)\/dist\/blackcat\.user\.js/);
    const downloadRef = script.match(/@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/Ckrvxr\/blackcat\/([A-Za-z0-9._-]+)\/dist\/blackcat\.user\.js/);
    assert.ok(updateRef, 'missing pinned userscript update URL');
    assert.ok(downloadRef, 'missing pinned userscript download URL');
    assert.equal(updateRef[1], downloadRef[1]);
    assert.ok(['main', `v${packageJSON.version}`].includes(updateRef[1]), 'asset ref must be main or this package version tag');
    assert.ok(script.includes(`// @version      ${packageJSON.version}`), 'userscript version must match package.json');
    assert.doesNotMatch(script, /^\/\/ @require/m, 'installer must not fetch runtime scripts');
    assert.ok(script.includes('Blackcat Dark Reader engine'), 'Dark Reader must be bundled into the installer');
    const engineAPIIndex = script.indexOf('Object.assign(globalThis,{BlackcatDarkReaderEngine:');
    assert.ok(engineAPIIndex >= 0, 'Dark Reader engine must be bundled into the installer');
    assert.doesNotMatch(script, /blackcat-prepaint|blackcat:theme-ready|blackcat:prepaint-installed/, 'installer must not inject a temporary background');
});

test('userscript menu labels omit the redundant project prefix', () => {
    assert.doesNotMatch(adapter, /\[Blackcat\] \$\{label\}/);
});

test('exposes exactly three menu commands in the requested order', () => {
    const registeredMenuKeys = [...adapter.matchAll(/menuIds\.push\(register\(t\('menu\.([A-Za-z]+)'/g)]
        .map((match) => match[1]);
    assert.deepEqual(registeredMenuKeys, ['site', 'global', 'settings']);
});

test('userscript bundle includes the requested Chinese menu labels and settings UI', () => {
    assert.ok(script.includes('⚙️ 所有设置'));
    assert.ok(script.includes('🌍 在所有站点上：{status}'));
    assert.ok(script.includes('🌐 在此站点上：{status}'));
    assert.ok(script.includes('此站点设置'));
    assert.ok(script.includes('全局设置'));
    assert.ok(script.includes('在所有站点上启用'));
    assert.ok(script.includes('在此站点上启用'));
    assert.ok(script.includes('动态'));
    assert.ok(script.includes('增强滤镜(SVG)'));
    assert.ok(script.includes('静态'));
    assert.ok(script.includes('通用'));
    assert.ok(script.includes('跟随全局样式'));
    assert.ok(script.includes('独立样式设置'));
    assert.doesNotMatch(script, /即时生效 · 自动保存|正在调整全局主题/);
    assert.doesNotMatch(panel, /panel\.scopeGlobal|panel\.live/);
    assert.ok(script.includes('配置文件'));
    assert.ok(script.includes('导出'));
    assert.ok(script.includes('导入'));
    assert.ok(script.includes('清除'));
    assert.ok(script.includes('！导入配置会覆盖当前所有配置'));
    assert.ok(script.includes('！清除配置将清除当前所有配置'));
    assert.ok(script.includes('panel.other'));
    assert.ok(script.includes('config-actions'));
    assert.ok(script.includes('blackcat-settings'));
    assert.doesNotMatch(script, /Enable on sites by default|所有站点启用|在此站点启用/);
});

test('settings UI supports language selection without adding a menu command', () => {
    assert.ok(script.includes('panel.language'));
    assert.ok(script.includes('简体中文'));
    assert.ok(script.includes('Follow browser'));
});

test('floating settings bundle has no modal or save/cancel workflow', () => {
    assert.ok(script.includes('tablist'));
    assert.ok(script.includes('dataset.setting'));
    assert.doesNotMatch(uiSource, /data-action=["'](?:save|cancel)|aria-modal/);
    assert.doesNotMatch(panel, /className\s*=\s*['"]backdrop/);
});

test('theme UI is fixed to dark and omits palette customization', () => {
    assert.equal(settings.includes('mode: 1'), true);
    for (const setting of ['mode', 'styleSystemControls', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor', 'automation.behavior']) {
        assert.doesNotMatch(panel, new RegExp(`['\"]${setting}['\"]`));
        assert.doesNotMatch(i18n, new RegExp(setting));
    }
    assert.doesNotMatch(adapter, /menu\.colorMode/);
});

test('userscript adapter no longer exposes font or text stroke settings', () => {
    for (const legacyOption of ['useFont', 'fontFamily', 'textStroke', 'Use custom font', 'Font family', 'Text stroke', '使用自定义字体', '文字描边']) {
        assert.doesNotMatch(uiSource, new RegExp(legacyOption));
    }
});

test('bundled engine API is exposed and all four engines are present', () => {
    assert.ok(script.includes('Object.assign(globalThis,{BlackcatDarkReaderEngine:'), 'engine must attach its API to the userscript global');
    for (const name of ['dynamicTheme', 'cssFilter', 'svgFilter', 'staticTheme']) {
        assert.ok(script.includes(name), `missing ${name} in bundled engine`);
    }
});

test('installer banner identifies upstream version, license and source revision', () => {
    assert.equal(upstream.version, '4.9.133');
    assert.match(upstream.commit, /^[a-f0-9]{40}$/);
    assert.ok(script.includes(`/*! Blackcat Dark Reader engine | Dark Reader ${upstream.version} | MIT | source ${upstream.commit} */`));
    assert.doesNotMatch(script, /\/\/ MIT License\n\/\/\n\/\/ Copyright \(c\) 2026 Dark Reader Ltd\./);
});

test('dist contains only the installable userscript', () => {
    assert.deepEqual(readdirSync(distPath), ['blackcat.user.js']);
});
