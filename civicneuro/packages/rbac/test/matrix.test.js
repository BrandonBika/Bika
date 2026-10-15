/**
 * @file packages/rbac/test/matrix.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { can, Roles, Permissions } from '../src/index.js';

describe('RBAC Matrix', () => {
  it('allows resident to use Beacon and Lifeline', () => {
    assert.strictEqual(can(Roles.RESIDENT, Permissions.BEACON_USE), true);
    assert.strictEqual(can(Roles.RESIDENT, Permissions.LIFELINE_USE), true);
  });

  it('restricts guest from voting on polls', () => {
    assert.strictEqual(can(Roles.GUEST, Permissions.POLL_VOTE), false);
  });
});
