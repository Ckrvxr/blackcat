import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(path.join(projectRoot, 'dist/blackcat.user.js'), 'utf8');
const packageJSON = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const engine = readFileSync(path.join(projectRoot, 'dist/engine.js'), 'utf8');
const upstream = JSON.parse(readFileSync(path.join(projectRoot, 'dist/upstream.json'), 'utf8'));
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
    assert.ok(script.includes('⚙️ 更多设置'));
    assert.ok(script.includes('🌍 全局：{status}'));
    assert.ok(script.includes('🌐 此网站上: {status}'));
    assert.doesNotMatch(script, /即时生效 · 自动保存|正在调整全局主题/);
    assert.doesNotMatch(panel, /panel\.scopeGlobal|panel\.live/);
    assert.ok(script.includes('初始化'));
    assert.ok(script.includes('panel.other'));
    assert.ok(script.includes('other-action'));
    assert.doesNotMatch(script, /Enable Blackcat|Enable on sites by default|启用 Blackcat|默认在所有网站启用/);
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
    for (const setting of ['mode', 'darkSchemeBackgroundColor', 'darkSchemeTextColor', 'lightSchemeBackgroundColor', 'lightSchemeTextColor', 'selectionColor', 'scrollbarColor', 'automation.behavior']) {
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

test('engine API is explicitly exposed on the userscript global', () => {
    assert.ok(engine.includes('Object.assign(globalThis,{BlackcatDarkReaderEngine:'), 'engine must attach its API to the userscript global');
});

test('engine artifact contains all four Dark Reader rendering engines', () => {
    for (const name of ['dynamicTheme', 'cssFilter', 'svgFilter', 'staticTheme']) {
        assert.ok(engine.includes(name), `missing ${name} in generated engine`);
    }
});

test('artifacts identify the exact upstream source revision', () => {
    assert.equal(upstream.version, '4.9.133');
    assert.match(upstream.commit, /^[a-f0-9]{40}$/);
    assert.ok(engine.includes(upstream.commit));
    assert.ok(script.includes(upstream.commit), 'self-contained installer must identify its bundled upstream engine');
});
