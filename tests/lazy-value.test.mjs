import test from 'node:test';
import assert from 'node:assert/strict';
import {createLazyValue} from '../src/lazy-value.mjs';

test('lazy value is created only when first requested and reused afterward', () => {
    let calls = 0;
    const value = {index: true};
    const getValue = createLazyValue(() => {
        calls++;
        return value;
    });

    assert.equal(calls, 0);
    assert.equal(getValue(), value);
    assert.equal(getValue(), value);
    assert.equal(calls, 1);
});

test('lazy value can retry after its factory throws', () => {
    let calls = 0;
    const getValue = createLazyValue(() => {
        calls++;
        if (calls === 1) throw new Error('initialization failed');
        return 'ready';
    });

    assert.throws(getValue, /initialization failed/);
    assert.equal(getValue(), 'ready');
    assert.equal(getValue(), 'ready');
    assert.equal(calls, 2);
});
