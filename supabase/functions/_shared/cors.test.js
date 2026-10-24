import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, withCors } from './cors.js';

test('allows only exact configured origins in production', () => {
  const env = {
    ALLOWED_ORIGINS: 'https://bika.example, https://admin.example',
    NODE_ENV: 'production'
  };
  assert.equal(isAllowedOrigin('https://bika.example', env), true);
  assert.equal(isAllowedOrigin('https://bika.example.attacker.test', env), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', env), false);
});

test('local fallback requires an explicit development environment', () => {
  assert.equal(isAllowedOrigin('http://localhost:3000', { APP_ENV: 'development' }), true);
  assert.equal(isAllowedOrigin('http://localhost:3000', {}), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', {
    APP_ENV: 'development',
    NODE_ENV: 'production'
  }), false);
});

test('sets an exact allowed origin and rejects disallowed preflight origins', async () => {
  const env = { ALLOWED_ORIGINS: 'https://bika.example', NODE_ENV: 'production' };
  const request = new Request('https://api.example.test', {
    method: 'POST',
    headers: { Origin: 'https://bika.example' }
  });
  const response = withCors(Response.json({ ok: true }), request, env);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://bika.example');
  assert.equal((await response.json()).ok, true);

  const preflight = withCors(new Response(null), new Request('https://api.example.test', {
    method: 'OPTIONS',
    headers: { Origin: 'https://other.example' }
  }), env);
  assert.equal(preflight.status, 403);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), null);
});
