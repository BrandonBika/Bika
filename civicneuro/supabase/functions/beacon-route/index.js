import { handleBeaconRoute } from './handler.js';

Deno.serve((request) => handleBeaconRoute(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
