import test from 'node:test';
import assert from 'node:assert/strict';
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
    assert.match(metadata, /网页深色主题/);
    assert.doesNotMatch(metadata, /GM_xmlhttpRequest|@connect/);
});

test('installer metadata rejects refs that could inject header fields or URLs', () => {
    assert.throws(() => createUserscriptMetadata({version: '0.1.0', releaseRef: 'main\n// @grant unsafeWindow'}));
    assert.throws(() => createUserscriptMetadata({version: '0.1.0'}));
});
