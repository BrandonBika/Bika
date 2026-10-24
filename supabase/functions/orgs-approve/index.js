import { handleOrgsApprove } from './handler.js';

Deno.serve((request) => handleOrgsApprove(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));