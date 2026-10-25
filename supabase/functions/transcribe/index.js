import { handleTranscribe } from './handler.js';

Deno.serve((request) => handleTranscribe(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
