import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapResolvedCallMembers,
  normalizeLifelinePhone,
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
