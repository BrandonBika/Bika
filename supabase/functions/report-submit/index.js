import { handleReportSubmit } from './handler.js';

Deno.serve((request) => handleReportSubmit(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
