import test from 'node:test';
import assert from 'node:assert/strict';
import {createUserscriptMetadata} from '../scripts/metadata.mjs';

test('installer metadata pins the external engine to an explicit release ref', () => {
    const metadata = createUserscriptMetadata({version: '0.1.0', assetRef: 'v0.1.0'});

    assert.match(metadata, /^\/\/ ==UserScript==/);
    assert.match(metadata, /@match\s+\*:\/\/\*\/*/);
    assert.match(metadata, /@run-at\s+document-start/);
    assert.match(metadata, /@require\s+https:\/\/cdn\.jsdelivr\.net\/gh\/Ckrvxr\/blackcat@v0\.1\.0\/dist\/engine\.js/);
    assert.match(metadata, /@grant\s+GM_registerMenuCommand/);
    assert.match(metadata, /网页深色主题/);
    assert.doesNotMatch(metadata, /GM_xmlhttpRequest|@connect/);
});

test('installer metadata rejects refs that could inject header fields or URLs', () => {
    assert.throws(() => createUserscriptMetadata({version: '0.1.0', assetRef: 'main\n// @grant unsafeWindow'}));
});
