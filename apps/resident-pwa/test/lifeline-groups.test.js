import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeLifelineCards } from '../src/features/lifeline/lifeline-groups.js';

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
