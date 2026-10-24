import { handleReportsReassignOrg } from './handler.js';

Deno.serve((request) => handleReportsReassignOrg(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));