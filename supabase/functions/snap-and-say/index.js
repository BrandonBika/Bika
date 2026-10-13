import { handleSnapAndSay } from './handler.js';

Deno.serve((request) => handleSnapAndSay(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch,
  waitUntil: (promise) => EdgeRuntime.waitUntil(promise)
}));
