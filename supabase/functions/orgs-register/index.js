import { handleOrgsRegister } from './handler.js';

Deno.serve((request) => handleOrgsRegister(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));