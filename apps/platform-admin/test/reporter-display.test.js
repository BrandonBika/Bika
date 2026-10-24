import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveReporterDisplay } from '../src/features/reporter-display.js';

test('resident display uses the linked profile', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'resident', reporter_name: 'Ignored report name' },
    profile: { full_name: 'Profile Name', phone: '555-0100', email: 'profile@example.invalid' }
  }), {
    kind: 'resident',
    name: 'Profile Name',
    phone: '555-0100',
    email: 'profile@example.invalid'
  });
});

test('resident without a profile uses the resident fallback', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'resident', reporter_name: 'Ignored report name' },
    profile: null
  }), { kind: 'resident', name: 'Resident', phone: null, email: null });
});

test('consenting guest contact respects phone preference', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'guest', reporter_name: 'Ignored report name' },
    profile: { full_name: 'Ignored profile name', phone: '555-0100', email: 'profile@example.invalid' },
    guestContact: {
      phone: '555-0101',
      email: 'guest@example.invalid',
      contact_preference: 'phone',
      consent_to_updates: true,
      consent_revoked_at: null
    }
  }), { kind: 'guest', name: 'Guest', phone: '555-0101', email: null });
});

test('revoked guest consent hides contact details', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'guest' },
    guestContact: {
      phone: '555-0101',
      email: 'guest@example.invalid',
      contact_preference: 'email',
      consent_to_updates: true,
      consent_revoked_at: 'revoked'
    }
  }), { kind: 'guest', name: 'Guest', phone: null, email: null });
});

test('consenting guest contact respects email preference', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'guest' },
    guestContact: {
      phone: '555-0101',
      email: 'guest@example.invalid',
      contact_preference: 'email',
      consent_to_updates: true,
      consent_revoked_at: null
    }
  }), { kind: 'guest', name: 'Guest', phone: null, email: 'guest@example.invalid' });
});

test('guest without contact details shows only the guest label', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'guest' },
    guestContact: null
  }), { kind: 'guest', name: 'Guest', phone: null, email: null });
});

test('guest with a profile never shows profile identity', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'guest' },
    profile: { full_name: 'Ignored profile name', phone: '555-0100', email: 'profile@example.invalid' },
    guestContact: null
  }), { kind: 'guest', name: 'Guest', phone: null, email: null });
});

test('anonymous report ignores stray reporter name and linked records', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'anonymous', reporter_name: 'Ignored report name' },
    profile: { full_name: 'Ignored profile name', phone: '555-0100', email: 'profile@example.invalid' },
    guestContact: { phone: '555-0101', email: 'guest@example.invalid', consent_to_updates: true, consent_revoked_at: null }
  }), { kind: 'anonymous', name: 'Anonymous', phone: null, email: null });
});

test('unknown reporter type uses the anonymous display', () => {
  assert.deepEqual(resolveReporterDisplay({
    report: { reporter_type: 'unknown', reporter_name: 'Ignored report name' }
  }), { kind: 'anonymous', name: 'Anonymous', phone: null, email: null });
});

test('null inputs use the anonymous display without throwing', () => {
  const expected = {
    kind: 'anonymous',
    name: 'Anonymous',
    phone: null,
    email: null
  };
  assert.deepEqual(resolveReporterDisplay(null), expected);
  assert.deepEqual(resolveReporterDisplay({ report: null, profile: null, guestContact: null }), expected);
});
