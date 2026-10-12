import { handleReportTrack } from './handler.js';

Deno.serve((request) => handleReportTrack(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
