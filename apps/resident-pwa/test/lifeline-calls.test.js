import assert from 'node:assert/strict';
import test from 'node:test';
import { clearSession, setSession } from '@civicneuro/supabase-client';
import {
  mapResolvedCallMembers,
  normalizeLifelinePhone,
  requestCallToken,
  splitLifelineInvitees,
  toLifelineCallNumber,
  toZegoUserId
} from '../src/features/lifeline/lifeline-calls.js';

test('normalizes phone formats before matching resolved circle residents', () => {
  assert.equal(normalizeLifelinePhone('+27 (82) 123-4567'), '27821234567');
  const members = [
    { id: 'b', name: 'Saved Name', phone: '082 123 4567' },
    { id: 'c', name: 'Other Resident', phone: '0712345678' }
  ];
  const resolved = [{
    phone: '0821234567',
    user_id: '123e4567-e89b-42d3-a456-426614174000',
    display_name: 'B Resident'
  }];

  assert.deepEqual(mapResolvedCallMembers(members, resolved), [
    { ...members[0], userId: resolved[0].user_id, displayName: 'B Resident' },
    members[1]
  ]);
});

test('uses a stable 32-character Zego ID derived from the verified Supabase UUID', () => {
  assert.equal(toZegoUserId('123e4567-e89b-42d3-a456-426614174000'), '123e4567e89b42d3a456426614174000');
  assert.throws(() => toZegoUserId('not-a-uuid'), /resident ID/);
});

test('formats South African Lifeline phone numbers as E.164', () => {
  assert.equal(toLifelineCallNumber('082 123 4567'), '+27821234567');
  assert.equal(toLifelineCallNumber('+27 (82) 123-4567'), '+27821234567');
});

test('preserves short emergency codes for native phone links', () => {
  assert.equal(toLifelineCallNumber('112'), '112');
  assert.equal(toLifelineCallNumber('10111'), '10111');
  assert.equal(toLifelineCallNumber('10177'), '10177');
  assert.equal(toLifelineCallNumber('10-111'), null);
});

test('keeps successful invitees and returns partial errorInvitees without throwing', () => {
  const callees = [
    { userID: 'user-1', userName: 'One' },
    { userID: 'user-2', userName: 'Two' }
  ];
  const errorInvitees = [{ userID: 'user-2', errorCode: 500 }];

  assert.deepEqual(splitLifelineInvitees(callees, errorInvitees), {
    invited: [callees[0]],
    failed: errorInvitees
  });
});

test('uses an HTTP error when the token endpoint returns non-JSON', async (t) => {
  setSession('test-access-token', { id: '123e4567-e89b-42d3-a456-426614174000' });
  t.after(clearSession);
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>not found</html>', {
    status: 404,
    headers: { 'content-type': 'text/html' }
  }));

  await assert.rejects(
    requestCallToken(['123e4567-e89b-42d3-a456-426614174001']),
    { message: 'Call service unavailable (HTTP 404).' }
  );
});

test('uses the token endpoint error message when a JSON error response is returned', async (t) => {
  setSession('test-access-token', { id: '123e4567-e89b-42d3-a456-426614174000' });
  t.after(clearSession);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: 'Call service is not configured.'
  }), { status: 503, headers: { 'content-type': 'application/json' } }));

  await assert.rejects(
    requestCallToken(['123e4567-e89b-42d3-a456-426614174001']),
    { message: 'Call service is not configured.' }
  );
});

test('reports a clear HTTP status for a token endpoint 404', async (t) => {
  setSession('test-access-token', { id: '123e4567-e89b-42d3-a456-426614174000' });
  t.after(clearSession);
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 404 }));

  await assert.rejects(
    requestCallToken(['123e4567-e89b-42d3-a456-426614174001']),
    { message: 'Call service unavailable (HTTP 404).' }
  );
});
