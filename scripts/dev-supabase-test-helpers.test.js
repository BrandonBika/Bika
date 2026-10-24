import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDevelopmentEnvironment } from './dev-supabase-test-helpers.js';

test('demo seed utilities require explicit development mode', () => {
  assert.doesNotThrow(() => assertDevelopmentEnvironment(new Map([
    ['APP_ENV', 'development']
  ])));
  assert.throws(() => assertDevelopmentEnvironment(new Map()), /APP_ENV=development/);
  assert.throws(() => assertDevelopmentEnvironment(new Map([
    ['APP_ENV', 'development'],
    ['NODE_ENV', 'production']
  ])), /APP_ENV=development/);
});
