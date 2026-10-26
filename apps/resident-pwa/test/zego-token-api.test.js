import assert from 'node:assert/strict';
import test from 'node:test';
import zegoToken from '../../../api/zego-token.js';

test('Vercel token route forwards the auth and recipient contract to the existing handler', async (t) => {
  const envNames = ['ZEGO_APP_ID', 'ZEGO_SERVER_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const previousEnv = new Map(envNames.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.env.ZEGO_APP_ID = '123456789';
  process.env.ZEGO_SERVER_SECRET = '0123456789abcdef0123456789abcdef';
  process.env.SUPABASE_URL = 'https://project.example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';

  const callerId = '123e4567-e89b-42d3-a456-426614174000';
  const recipientId = '123e4567-e89b-42d3-a456-426614174001';
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: callerId });
    if (url.pathname === '/rest/v1/beacon_connections') {
      return Response.json([{ requester_id: callerId, addressee_id: recipientId }]);
    }
    if (url.pathname === '/rest/v1/beacon_blocks') return Response.json([]);
    throw new Error('Unexpected token handler request.');
  });

  const response = {
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(name.toLowerCase(), value);
    },
    end(body) {
      this.body = body;
    }
  };
  await zegoToken({
    method: 'POST',
    url: '/api/zego-token',
    headers: {
      host: 'app.example.test',
      authorization: 'Bearer user-access-token',
      'content-type': 'application/json'
    },
    body: { recipientIds: [recipientId] }
  }, response);

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.appId, 123456789);
  assert.equal(body.userId, callerId.replaceAll('-', ''));
  assert.equal(typeof body.token, 'string');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
