import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dispatchLifelineGroupCall,
  isLifelineCallSession,
  redirectGuestLifelineCall,
  startLifelineGroupCall,
  withLifelineCallTimeout
} from '../src/features/lifeline/lifeline.client.js';

const signedInMember = {
  id: 'member-1',
  name: 'In-app contact',
  phone: '0821234567',
  userId: '123e4567-e89b-42d3-a456-426614174001'
};

test('completes an all-in-app group call without invoking the fallback', async () => {
  const invited = [{
    userID: '123e4567e89b42d3a456426614174001',
    userName: 'In-app contact'
  }];
  const result = await dispatchLifelineGroupCall('group-1', [signedInMember], {
    sendInvitations: async (members) => ({ members, invited }),
    callFallback: async () => {
      throw new Error('Fallback should not run.');
    }
  });

  assert.deepEqual(result.invited, invited);
  assert.equal(result.members[0].status, 'ringing');
  assert.equal(result.fallback, null);
  assert.deepEqual(result.errors, []);
});

test('marks partial Zego invitation failures queued while successful invitees ring', async () => {
  const failed = [{ userID: '123e4567e89b42d3a456426614174002', errorCode: 500 }];
  const memberNotInvited = {
    id: 'member-2',
    name: 'Unavailable in-app contact',
    phone: '0712345678',
    userId: '123e4567-e89b-42d3-a456-426614174002'
  };
  const result = await dispatchLifelineGroupCall('group-partial', [signedInMember, memberNotInvited], {
    sendInvitations: async (members) => ({
      members,
      invited: [{ userID: '123e4567e89b42d3a456426614174001', userName: 'In-app contact' }],
      failed
    }),
    callFallback: async () => {
      throw new Error('Fallback should not run.');
    }
  });

  assert.equal(result.members[0].status, 'ringing');
  assert.equal(result.members[1].status, 'queued');
  assert.deepEqual(result.failed, failed);
  assert.equal(result.fallback, null);
});

test('returns all queued members when no contacts are app users', async () => {
  const memberWithoutApp = { id: 'member-2', name: 'Phone contact', phone: '0712345678' };
  let fallbackCalls = 0;
  const result = await dispatchLifelineGroupCall('group-no-app-users', [memberWithoutApp], {
    sendInvitations: async (members) => ({ members, invited: [], failed: [] }),
    callFallback: async () => {
      fallbackCalls++;
      throw new Error('Fallback should not run.');
    }
  });

  assert.equal(result.members[0].status, 'queued');
  assert.deepEqual(result.errors, []);
  assert.equal(result.fallback, null);
  assert.equal(fallbackCalls, 0);
});

test('keeps successful in-app invitations for a mixed group without calling the fallback', async () => {
  const memberWithoutApp = { id: 'member-2', name: 'Phone contact', phone: '0712345678' };
  let fallbackCalls = 0;
  const result = await dispatchLifelineGroupCall('group-mixed', [signedInMember, memberWithoutApp], {
    sendInvitations: async (members) => ({
      members,
      invited: [{
        userID: '123e4567e89b42d3a456426614174001',
        userName: 'In-app contact'
      }]
    }),
    callFallback: async () => {
      fallbackCalls++;
      throw new Error('Fallback should not run.');
    }
  });

  assert.equal(result.members[0].status, 'ringing');
  assert.equal(result.members[1].status, 'queued');
  assert.deepEqual(result.errors, []);
  assert.equal(fallbackCalls, 0);
});

test('throws when invitation setup fails and nobody is invited', async (t) => {
  const invitationError = new Error('Zego token service is unavailable.');
  t.mock.method(console, 'error', () => {});
  let fallbackCalls = 0;

  await assert.rejects(
    dispatchLifelineGroupCall('group-3', [signedInMember], {
      sendInvitations: async () => { throw invitationError; },
      callFallback: async () => {
        fallbackCalls++;
        throw new Error('Fallback should not run.');
      }
    }),
    { message: 'Zego token service is unavailable.' }
  );
  assert.equal(fallbackCalls, 0);
});

test('rejects a group without members before attempting either call route', async () => {
  await assert.rejects(
    dispatchLifelineGroupCall('group-4', []),
    { message: 'This Lifeline group has no members to call.' }
  );
});

test('allows only authenticated non-guest sessions to dispatch Lifeline calls', () => {
  assert.equal(isLifelineCallSession({ isAuthenticated: true, isGuest: false }), true);
  assert.equal(isLifelineCallSession({ isAuthenticated: true, isGuest: true }), false);
  assert.equal(isLifelineCallSession({ isAuthenticated: false, isGuest: false }), false);
});

test('redirects a guest before loading groups or starting the countdown', () => {
  const actions = [];
  const redirected = redirectGuestLifelineCall(
    { isAuthenticated: true, isGuest: true },
    {
      showToast: (message) => actions.push(['toast', message]),
      navigate: (route) => actions.push(['navigate', route])
    }
  );

  assert.equal(redirected, true);
  assert.deepEqual(actions, [
    ['toast', 'Sign in to use Lifeline calls'],
    ['navigate', 'lifeline-home']
  ]);
});

test('reuses the same in-flight group call promise and invitation request', async () => {
  let resolveInvitations;
  let invitationCount = 0;
  const group = { id: 'guarded-group', members: [signedInMember] };
  const options = {
    loadCards: async () => ({ cards: [group] }),
    sendInvitations: async (members) => {
      invitationCount++;
      if (invitationCount === 1) {
        await new Promise((resolve) => { resolveInvitations = resolve; });
      }
      return {
        members,
        invited: [{
          userID: '123e4567e89b42d3a456426614174001',
          userName: 'In-app contact'
        }]
      };
    },
    callFallback: async () => {
      throw new Error('Fallback should not run.');
    }
  };

  const first = startLifelineGroupCall(group.id, options);
  const second = startLifelineGroupCall(group.id, options);
  assert.strictEqual(second, first);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(invitationCount, 1);

  resolveInvitations();
  await Promise.all([first, second]);
  await startLifelineGroupCall(group.id, options);
  assert.equal(invitationCount, 2);
});

test('rejects a call request that exceeds its timeout', async () => {
  await assert.rejects(
    withLifelineCallTimeout(new Promise(() => {}), 1),
    { message: 'Lifeline call request timed out.' }
  );
});
