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

test('userscript bundle includes Simplified Chinese UI messages', () => {
    assert.ok(script.includes('切换此网站'));
    assert.ok(script.includes('启用选项'));
    assert.ok(script.includes('恢复默认设置'));
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
