import { handleReportGuestSubmit } from './handler.js';

Deno.serve((request) => handleReportGuestSubmit(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
