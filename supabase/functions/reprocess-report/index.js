import { handleReprocessReport } from './handler.js';

Deno.serve((request) => handleReprocessReport(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
