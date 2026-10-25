import { handleOrganizationInvitationAccept } from './handler.js';

Deno.serve((request) => handleOrganizationInvitationAccept(request, {
  env: { get: (name) => Deno.env.get(name) },
  fetchImpl: fetch
}));
