import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createUserscriptMetadata} from '../scripts/metadata.mjs';

test('installer metadata is self-contained and pins its update URL to the release ref', () => {
    const metadata = createUserscriptMetadata({version: '0.1.0', releaseRef: 'v0.1.0'});

    assert.match(metadata, /^\/\/ ==UserScript==/);
    assert.match(metadata, /@match\s+\*:\/\/\*\/*/);
    assert.match(metadata, /@run-at\s+document-start/);
    assert.doesNotMatch(metadata, /@require|@connect/);
    assert.match(metadata, /@updateURL\s+https:\/\/raw\.githubusercontent\.com\/Ckrvxr\/blackcat\/v0\.1\.0\/dist\/blackcat\.user\.js/);
    assert.match(metadata, /@downloadURL\s+https:\/\/raw\.githubusercontent\.com\/Ckrvxr\/blackcat\/v0\.1\.0\/dist\/blackcat\.user\.js/);
    assert.match(metadata, /@grant\s+GM_registerMenuCommand/);
    assert.match(metadata, /@grant\s+GM_unregisterMenuCommand/);
    assert.match(metadata, /Unified Dark Mode support for any sites/);
    assert.doesNotMatch(metadata, /GM_xmlhttpRequest|@connect/);
});

test('metadata embeds the project SVG for both icon sizes without remote requests', () => {
    const metadata = createUserscriptMetadata({version: '0.1.0', releaseRef: 'v0.1.0'});
    const svg = readFileSync(new URL('../assets/blackcat.svg', import.meta.url), 'utf8');
    for (const field of ['icon', 'icon64']) {
        const icon = metadata.match(new RegExp(`^// @${field}\\s+data:image/svg\\+xml;base64,([A-Za-z0-9+/=]+)$`, 'm'));
        assert.ok(icon, `Missing embedded @${field}`);
        assert.equal(Buffer.from(icon[1], 'base64').toString('utf8'), svg);
    }
});

test('installer metadata rejects refs that could inject header fields or URLs', () => {
    assert.throws(() => createUserscriptMetadata({version: '0.1.0', releaseRef: 'main\n// @grant unsafeWindow'}));
    assert.throws(() => createUserscriptMetadata({version: '0.1.0'}));
});
