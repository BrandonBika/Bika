import { handleReportsCreate } from './handler.js';

Deno.serve((request) => handleReportsCreate(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));