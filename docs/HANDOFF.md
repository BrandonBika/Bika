# Platform Admin dashboard handoff

## Status

### Done

- Organisation approvals: loads pending and reviewed organizations through the signed-in Supabase client. Approve/Reject call the existing `orgs-approve` Edge Function; its server-side RPC requires Platform Admin and writes an audit row. Contact is shown as unavailable because the current organization schema has no contact field.
- My profile: reads the current staff context; password change and sign-out call Supabase Auth. Help and legal text remain placeholders.

### Partial

- Posts: feed, lifecycle tabs, type tabs, and draft modal are present; content and changes are local demo data, not published.
- Surveys: list, create, close/archive, response and chart tabs are present; responses and changes are local demo data.
- Analytics: report counts, resolution time, and category chart query the signed-in reports table. Active-user count has no source and displays “Not available.”
- Export data: Map view GeoJSON/CSV and Report sheet CSV/print-to-PDF use the signed-in report query and the shared CSV formula-injection guard. Surveys/Polls exports use local demo data.
- Pilot mode: master switch, mock organisation rows and controls are present; all state and actions are local.
- Platform activity: Platform Admin reads `organization_status_audit` with the signed-in session. Platform Employees see clearly labelled mock activity because current RLS restricts audit rows to admins.
- Chat: read-only empty state is present; no conversation source is wired.
- Manage profiles: list and invite/deactivate controls are local-only.
- System settings: requested fields and audit preview are shown but are not persisted.
- Platform team: Full Admin/Support invite and revoke controls are local-only.

### Not started

- No requested page route is missing. Persistent Posts/Surveys/Chat/Pilot workflows, staff-management endpoints, and persisted system settings are not implemented. Do not treat their demo controls as real operations.

## Wiring and security

- `src/config.js` defines the ordered role-specific sidebar and enabled routes. The Platform section begins at Organisation approvals.
- `src/route-guards.js` blocks admin-only pages for Platform Employees; `src/main.js` dispatches to thin page modules and the shared `features/workspace-pages.js` renderer.
- Role gating is **UX only**. Organisation review is protected by the existing Edge Function/database RPC. Any future server mutation for posts, surveys, pilot mode, staff, system settings, or chat must independently validate the bearer token, derive the actor from that token, and enforce role/ownership server-side. Do not wire mock buttons to privileged APIs without those checks.
- All rendered application content uses DOM `textContent`; no data is inserted with `innerHTML`. Supabase table and Edge Function requests use the configured signed-in client. CSV output uses `packages/security-web/src/csv-safe.js`.
- Demo records are centralized in `src/mock-data.js`. The UI displays a “Demo data” badge on pages using them.

## Follow-up before production use

The production build succeeds. Browser-check the role-specific sidebar, CSV/GeoJSON downloads, PDF print flow, and Approve/Reject flow against a staging Supabase project with the organization approval migration applied. Keep demo-only actions visibly marked until server-side endpoints and authorization checks exist.
