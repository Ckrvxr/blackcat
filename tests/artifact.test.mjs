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

test('built script installs and updates from the same explicit asset ref', () => {
    assert.match(script, /^\/\/ ==UserScript==/);
    const requireRef = script.match(/@require\s+https:\/\/cdn\.jsdelivr\.net\/gh\/Ckrvxr\/blackcat@([A-Za-z0-9._-]+)\/dist\/engine\.js/);
    const updateRef = script.match(/@updateURL\s+https:\/\/raw\.githubusercontent\.com\/Ckrvxr\/blackcat\/([A-Za-z0-9._-]+)\/dist\/blackcat\.user\.js/);
    assert.ok(requireRef, 'missing pinned engine dependency');
    assert.ok(updateRef, 'missing pinned userscript update URL');
    assert.equal(requireRef[1], updateRef[1]);
    assert.ok(['main', `v${packageJSON.version}`].includes(requireRef[1]), 'asset ref must be main or this package version tag');
    assert.ok(script.includes(`// @version      ${packageJSON.version}`), 'userscript version must match package.json');
});

test('userscript menu labels omit the redundant project prefix', () => {
    assert.doesNotMatch(script, /registerMenu\(`\[Blackcat\] \$\{label\}`, callback\)/);
});

test('exposes exactly four menu commands in the requested order', () => {
    const registeredMenuKeys = [...script.matchAll(/menuIds\.push\(register\(t\('menu\.([A-Za-z]+)'/g)]
        .map((match) => match[1]);
    assert.deepEqual(registeredMenuKeys, ['site', 'global', 'colorMode', 'settings']);
});

test('userscript bundle includes the requested Chinese menu labels and settings UI', () => {
    assert.ok(script.includes('⚙️ 更多设置'));
    assert.ok(script.includes('🌍 全局：{status}'));
    assert.ok(script.includes('🌐 此网站上: {status}'));
    assert.ok(script.includes('🌗 色彩模式：{mode}'));
    assert.doesNotMatch(script, /色彩模式：\{mode\}（切换）/);
    assert.ok(script.includes('即时生效 · 自动保存'));
    assert.ok(script.includes('初始化'));
});

test('settings UI supports language selection without adding a menu command', () => {
    assert.ok(script.includes('panel.language'));
    assert.ok(script.includes('简体中文'));
    assert.ok(script.includes('Follow browser'));
});

test('floating settings bundle has no modal or save/cancel workflow', () => {
    assert.ok(script.includes("'tablist'"));
    assert.ok(script.includes('dataset.setting'));
    assert.doesNotMatch(script, /panel\.(?:save|cancel)'/);
    assert.doesNotMatch(script, /className = 'backdrop'|aria-modal/);
});

test('userscript adapter no longer exposes font or text stroke settings', () => {
    for (const legacyOption of ['useFont', 'fontFamily', 'textStroke', 'Use custom font', 'Font family', 'Text stroke', '使用自定义字体', '文字描边']) {
        assert.doesNotMatch(script, new RegExp(legacyOption));
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
});
