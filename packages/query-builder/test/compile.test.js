/**
 * @file packages/query-builder/test/compile.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileQuery } from '../src/index.js';

describe('Query Builder', () => {
  it('compiles simple query', () => {
    const q = compileQuery({
      combinator: 'AND',
      conditions: [{ field: 'status', op: '=', value: 'open' }]
    });
    assert.strictEqual(q, 'status = "open"');
  });
});
