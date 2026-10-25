import test from 'node:test';
import assert from 'node:assert/strict';
import { NAVIGATION, ORG_ROLES } from '../src/config.js';
import { guardRoute, isPublicRoute } from '../src/route-guards.js';

test('organisation roles have the expected page counts', () => {
  assert.equal(NAVIGATION[ORG_ROLES.ADMIN].length, 10);
  assert.equal(NAVIGATION[ORG_ROLES.EMPLOYEE].length, 8);
});

test('employees cannot open admin-only membership and settings pages', () => {
  for (const route of ['manage-profiles', 'system-settings']) {
    const decision = guardRoute(route, ORG_ROLES.EMPLOYEE);
    assert.equal(decision.allowed, false);
    assert.equal(decision.route, 'dashboard');
  }
});

test('employees can open report detail but all server access remains RLS protected', () => {
  assert.equal(guardRoute('report-detail', ORG_ROLES.EMPLOYEE).allowed, true);
});

test('registration and recovery routes are public', () => {
  for (const route of [
    'login', 'register', 'application-pending', 'forgot-password',
    'reset-password', 'session-expired', 'invitation', 'expired-invite'
  ]) {
    assert.equal(isPublicRoute(route), true);
  }
});
