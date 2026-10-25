# Platform Admin dashboard handoff

- Organisation approvals — done. Reads organizations through the signed-in Supabase client; Approve/Reject invoke the existing `orgs-approve` Edge Function with the current session token. No application contact field is present in the current schema, so contact displays as unavailable.
- Posts — done (demo data). Feed, lifecycle tabs, and Alert/News/Poll draft modal use local mock state; publishing is not wired to a backend.
- Surveys — done (demo data). Creation, close/archive actions, response detail and analytics bars use local mock state.
- Analytics — partial. Report KPIs and category bars query reports with the signed-in session; active-user count is unavailable until a source is provided.
- Export data — partial. Map GeoJSON/CSV and report sheet CSV/print-to-PDF use the signed-in report query; Surveys and Polls exports are demo data.
- My profile — done. Name, email, and role use the signed-in staff context; password update and sign-out use Supabase Auth. Support and legal copy are placeholders.
- Pilot mode — partial (demo data). Master switch and mock organisation details are local; branch editing and promotion do not call a backend.
