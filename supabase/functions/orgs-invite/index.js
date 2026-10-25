import { handleOrgsInvite } from './handler.js';

Deno.serve((request) => handleOrgsInvite(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
