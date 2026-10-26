import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLifelineCardValidationError,
  mergeLifelineCards
} from '../src/features/lifeline/lifeline-groups.js';

test('requires a group name and at least one complete person', () => {
  assert.equal(
    getLifelineCardValidationError('', [{ name: 'Alex', phone: '0821234567' }]),
    'Enter a group name.'
  );
  assert.equal(
    getLifelineCardValidationError('Family', []),
    'Add at least one person with a name and phone number.'
  );
  assert.match(
    getLifelineCardValidationError('Family', [{ name: 'Alex', phone: '' }]),
    /Enter a name and phone number for each person/
  );
});

test('allows one to four complete people and rejects invalid counts or phone digits', () => {
  const person = { name: 'Alex', phone: '+27 82 123 4567' };
  assert.equal(getLifelineCardValidationError('Family', [person]), '');
  assert.equal(getLifelineCardValidationError('Family', Array(4).fill(person)), '');
  assert.equal(
    getLifelineCardValidationError('Family', Array(5).fill(person)),
    'A group can have at most 4 people.'
  );
  assert.match(
    getLifelineCardValidationError('Family', [{ name: 'Alex', phone: '12' }]),
    /Phone numbers must contain 3 to 15 digits/
  );
});

test('saved numbers customize the resident copy of a starter group', () => {
  const starter = {
    id: 'starter-crime',
    name: 'Crime',
    isPreset: true,
    members: [{ id: 'saps', name: 'SAPS', phone: '10111' }]
  };
  const saved = {
    id: 'starter-crime',
    name: 'Crime',
    members: [{ id: 'neighbor', name: 'Neighbour', phone: '0712345678' }]
  };

  const [group] = mergeLifelineCards([starter], [saved]);

  assert.equal(group.isPreset, true);
  assert.deepEqual(group.members, saved.members);
  assert.deepEqual(starter.members, [{ id: 'saps', name: 'SAPS', phone: '10111' }]);
});

test('personal groups remain separate from starter examples', () => {
  const starter = { id: 'starter-crime', name: 'Crime', isPreset: true, members: [] };
  const personal = { id: 'group-family', name: 'Family', members: [] };

  const groups = mergeLifelineCards([starter], [personal]);

  assert.deepEqual(groups, [starter, personal]);
});
