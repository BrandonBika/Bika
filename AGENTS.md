# CivicNeuro agent handoff

This file is a working orientation, not a substitute for checking the current code and Git diff. The repository has extensive pre-existing local edits. Preserve them; do not reset, clean, or overwrite files to make the tree look pristine.

## Project and goal

CivicNeuro is a multi-tenant civic-issue reporting platform for South African residents and the organizations and platform staff who respond to reports. It aims to support issue reporting and tracking, community information, and resident safety workflows through three static web apps backed by Supabase.

The resident PWA is the main citizen-facing app. The organization dashboard supports municipal/community organizations; the platform-admin app supports platform staff. Treat demo fixtures and mock flows as prototypes, not as production data or proof that a backend integration is complete.

## Repository map

- `apps/resident-pwa/` — resident mobile-first PWA: `index.html`, `manifest.webmanifest`, `service-worker.js`, `runtime-config.js`, and `src/` (`main.js`, `router.js`, reusable `components/`, feature clients/stores, route-level `pages/`, and `styles/`). `test/` contains app tests; `vendor/` contains generated browser bundles.
- `apps/org-dashboard/` — static organization dashboard, with `src/`, `index.html`, headers/redirect rules, and its package manifest.
- `apps/platform-admin/` — static platform staff dashboard, with `src/`, `test/`, and generated `vendor/` bundles.
- `packages/` — shared ES-module packages: `config`, `design-tokens`, `functions-client`, `geo`, `i18n`, `logger`, `media-client`, `offline-queue`, `query-builder`, `rbac`, `schemas`, `security-web`, `state`, `supabase-client`, and `ui`.
- `supabase/` — canonical backend project: `migrations/`, `functions/` (Edge Functions and `_shared/` code), `policies/`, `seed/`, `tests/`, `manual/`, `templates/`, `config.toml`, and `hardening.md`.
- `tests/` — Beacon, E2E, fixtures, integration, load, security, and unit test areas.
- `scripts/` — SQL test runner, local/demo seeding and cleanup, Beacon and alert browser tests, realtime tests, vendor entry point, and a migration helper.
- `tools/` — local development server, static boundary/security/layout checks, scaffold checks, and shared-file tooling.
- `docs/` — architecture, security/compliance, product/design, decisions, and operational/runbook references. Some docs are stale, placeholders, or incomplete; verify relevant content before treating a doc title as an implemented decision.
- `infra/` — hosting and Supabase infrastructure notes.

Useful source/docs: root `README.md` (stack and reporting/migration notes), `apps/resident-pwa/README.md` (local setup, runtime config, Beacon routing and GPS behavior), `apps/resident-pwa/PROJECT_REPORT.md` (broad assessment; verify against newer work), and `docs/beacon-implementation-status.md` (assessment dated 2026-10-10; predates some current backend work).

## Stack and common commands

- Use Node.js 20 (`.nvmrc`) and npm workspaces (`packages/*`, `apps/*`); root package is ES modules.
- Application code is HTML, CSS, and vanilla JavaScript ES modules, using Web Components and JSDoc. Do not introduce TypeScript, React/Vue/Angular, Tailwind, or a new server framework without explicit product direction.
- Backend: Supabase Postgres/PostGIS, Auth, Storage, Realtime, JavaScript Edge Functions, and scheduled jobs (`pg_cron`). RLS and server-side Edge Functions are security boundaries; do not replace them with client-only checks.
- Browser mapping uses Leaflet `^1.9.4` and OpenStreetMap map tiles. Snap & Say uses Gemini in `snap-and-say`; Whisper is not the active Snap & Say provider.
- Root locked versions include `@supabase/supabase-js` 2.118.0, Leaflet 1.9.4, `@zegocloud/zego-uikit-prebuilt` 2.18.4, `zego-zim-web` 2.16.0, esbuild 0.28.2, pg 8.23.1, and Playwright 1.64.1. Check the lockfile when changing dependencies.
- From the repository root:
  - `npm ci` — install from the checked-in lockfile.
  - `npm run dev` — build browser vendor bundles, then start the local server (`tools/dev-server.js`).
  - `npm run dev:demo` — same with demo mode enabled.
  - `npm test` — configured Node test suite.
  - `npm run lint` — ESLint.
  - `npm run check:all` — security/style/boundary/layout/import checks listed in `package.json`.
  - `npm run check:no-secrets` — explicit secret scan.
  - `npm run test:sql:dev` — SQL tests against configured local/dev Supabase; requires its expected environment.
  - `npm run test:beacon:dev`, `npm run test:beacon:browser`, `npm run test:alerts:browser` — additional Beacon/alert checks; inspect their setup and target environment before running.
- Resident app can also be served with `node tools/dev-server.js`; use the HTTP URL printed by the server, not `file://`. The resident README documents `http://localhost:3000/apps/resident-pwa/index.html`.
- Platform admin README documents `npm run dev` from `apps/platform-admin`, then `http://localhost:4173/platform-admin/`. Do not put a service-role key in any browser app.
- Static app files do not need a framework build. Root `npm run dev` does bundle vendor dependencies, however, so distinguish that convenience step from an application compilation step.

## Data, configuration, and coordinates

- Supabase is the application data/auth/media/realtime backend. Local/demo fixtures and seed scripts also exist; identify mock mode and seed data before interpreting UI output as live.
- Beacon map tiles use OpenStreetMap. Search and walking routes go through the authenticated `beacon-route` Edge Function to configured self-hosted Nominatim-compatible geocoding and OSRM-compatible routing services. The documented route settings are `BEACON_GEOCODER_URL`, `BEACON_ROUTING_URL`, and optional `BEACON_ROUTING_PROFILE` (default `foot`). Do not configure public geocoder/router endpoints for production.
- PostGIS data uses EPSG:4326 geography. SQL constructs points as longitude, latitude (`ST_MakePoint(longitude, latitude)`); browser/Leaflet route coordinates are latitude, longitude. Convert deliberately at API/database boundaries; do not swap coordinate order. `packages/geo/` contains shared distance helpers.
- Browser-facing Supabase settings live in `apps/resident-pwa/runtime-config.js` as `supabaseUrl` and `supabaseAnonKey`; only a public anon/publishable key belongs there. The organization/platform apps must likewise use public client configuration.
- `.env.example` lists configuration names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_AUDIENCE`, `STORAGE_BUCKET_QUARANTINE`, `STORAGE_BUCKET_REPORT_MEDIA`, `SIGNED_URL_TTL_SECONDS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SENDER_ADDRESS`, `SMS_PROVIDER_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHISPER_API_KEY`, `GEMINI_API_KEY`, and `HCAPTCHA_SECRET`. Edge Functions also use `BEACON_GEOCODER_URL`, `BEACON_ROUTING_URL`, `BEACON_ROUTING_PROFILE`, and Zego token settings `ZEGO_APP_ID` / `ZEGO_SERVER_SECRET`; Gemini code supports `GOOGLE_GENAI_API_KEY` as an alternate name. These are names, not values: obtain credentials through the project's approved secret manager and keep server-only values out of static assets, logs, commits, and handoff docs.
- `.env.*` is ignored except `.env.example`. A local ignored `.env.test` may exist; never copy its contents into tracked files or expose its values. A second untracked `civicneuro/supabase/.temp/` directory was present at handoff, in addition to canonical `supabase/`; it is local Supabase CLI state, not source. Do not stage it or reveal its contents. Review ignore/tracking rules carefully if it appears in Git status.

## Documented decisions and rejected approaches

- Keep the apps in plain JavaScript/Web Components and avoid a mandatory frontend framework/bundler. This is the documented project stack; do not silently migrate to a prohibited framework.
- Keep Supabase as the backend rather than adding another backend provider. Do not introduce Cloudflare Workers, R2, Access, WAF, Turnstile, or `wrangler`; CAPTCHA is hCaptcha through Supabase Auth.
- Active Snap & Say processing is a Gemini-backed background request for transcription, translation, photo review, and classification. Whisper is not the active flow, despite older key names/provider references.
- Private report media should use private Storage and signed access rather than public media URLs. Do not broaden authenticated database reads to bypass RLS.
- Beacon location safety is accuracy-sensitive; the resident README documents high-accuracy browser geolocation, explicit confirmation for degraded accuracy, and paused off-path/arrival checks without a fresh fix under 50 m. Do not describe foreground browser watching as background phone tracking.

## Conversation-derived requirements

The prior VS Code history is relevant to this project: its clearly app-focused threads cover the platform-admin dashboard, resident PWA setup and audits, Beacon, Snap & Say, map/location behavior, notifications, and demo planning. The user reports 23 earlier conversations; the available index returned 25 workspace entries including this handoff, so it is not a clean one-to-one count of prior project conversations. The index also contains generic titles such as "definition of MOAT", "greeting", and "attachment review"; their transcript contents were unavailable, so they are not treated as CivicNeuro requirements or product decisions. Some older Copilot CLI transcripts could not be retrieved. The notes below separate verified dashboard instructions from broader app context and current repository evidence.

### Platform-admin dashboard

- The platform dashboard is for exactly two staff roles: `platform_admin` and `platform_employee`. It is not the organization dashboard. Keep route access and navigation role-specific.
- The four checked-in flow-map files under `docs/design/` are the UI reference: `civicneuro-flowmap-platform-admin-mono.html`, `civicneuro-flowmap-platform-employee-orange.html`, `civicneuro-flowmap-org-admin-red.html`, and `civicneuro-flowmap-org-employee-blue.html`. Use the matching platform-admin or platform-employee map for that role; do not substitute an unrelated design or invent a new dashboard flow.
- The historical implementation was explicitly phased. Phase 2 data pages were blocked until the actual schema had been confirmed; later tasks allowed building after field/schema facts were supplied. That old gate is not proof that today's schema or deployment is confirmed. Verify local migrations and the intended environment before any database work.
- A prior project correction said the platform dashboard's Supabase project must be identified from the resident runtime configuration, and that the `DATABASE_URL` in ignored `.env.test` points at a different project. Never use `.env.test` as an authority for the dashboard target. Do not connect to Supabase, inspect secrets, or run SQL/migrations unless the current task explicitly authorizes it and the target is independently verified.
- Keep dashboard data access in `apps/platform-admin/src/features/*.client.js`; page modules render and invoke clients. Do not introduce mock report data to make a real-data page look complete. Escape/render user-provided text using the existing safe DOM helpers; never interpolate it into HTML.
- A verified database fact from the dashboard work: the `record_report_event()` trigger records reassignment events when `assigned_organization_id` changes (`assignment_changed`, or `status_and_assignment_changed` if status also changes). Avoid duplicating that event in client code. Manual SQL must remain unapplied unless separately authorized; table grants should tolerate optional tables rather than fail when a table is absent.
- A reported redirect loop occurred when every navigation item was disabled and the guard redirected to a disabled dashboard route. The requested behavior was an always-allowed `home` route showing the signed-in staff name/role and a message that pages are not enabled yet. Current `route-guards.js` does allow `home` and falls back there; preserve this instead of redirecting to a disabled route.
- A later report said the dashboard remained loading after login. Current code has an explicit timeout helper and a dashboard error state, but this historical issue should be considered fixed only after reproducing or running focused tests against the complete auth/data flow.

### Resident/mobile app

- Treat the resident PWA as a core product, not merely a companion to the staff dashboard. Historical work includes connecting auth/profile/report flows to Supabase, app/backend audits, route and map-pin behavior, location-accuracy investigations, Beacon design and implementation, Snap & Say specifications/diagnostics, and renaming the resident alerts surface to notifications.
- When changing maps, check both resident and platform-admin configuration and helpers rather than fixing only one client. The platform dashboard also has a report-map flow; the resident app has a map pin picker and Beacon map/route flows.
- Beacon work is safety-sensitive. Keep permission, GPS accuracy, stale-fix, retry, destination, and off-path behavior explicit and testable. Clearly distinguish an approximate map pin from a verified GPS fix, foreground browser behavior from native background tracking, and local/demo state from a server-authoritative circle/session.
- Snap & Say is the resident reporting flow for photo evidence and spoken reports in South African languages. The active backend uses Gemini for the combined processing workflow; check the current feature client and `supabase/functions/snap-and-say/` before changing payload or UX assumptions. Do not revive Whisper as the active provider based on older notes.
- Resident history and the current repository both show demo/mock paths alongside Supabase flows. Never claim the PWA is production-connected based only on a working screen; verify the actual function, policy, migration, environment, and CORS behavior for the flow in question.

### Work style observed in the project conversations

- Follow explicit phase limits and scope restrictions. If asked for read-only work, do not edit; if asked not to access Supabase or run SQL, do not do so. Report briefly at phase boundaries when requested.
- Read the full supplied brief and the relevant design/source files before changing code. Some design maps are large; inspect targeted sections rather than dumping or rewriting the entire file.
- Keep updates surgical: for a bug-only request, do not add features or redesign the page. Preserve unrelated local changes and report any requested edit that could not be made.
- In dashboard work, concise progress/final reports without large code dumps were requested. Be explicit about what was verified, what remains uncertain, and whether an action was only drafted or actually applied.
- Preserve the exact workspace path/name `OneDrive - University of KwaZulu-Natal`; do not "correct" it to a different university/path spelling.

Some historical asks were explicitly time-boxed to a hackathon/demo; those dates and deadlines have passed. They are context, not a current priority or permission to skip schema/security validation. Several ADR, decisions, and roadmap files in the repository are empty or incomplete; rationale beyond the verified decisions above remains unknown.

## Known gaps, bugs, and gotchas

- The resident `PROJECT_REPORT.md` describes failed CORS calls to configured Supabase Functions, incomplete live backend connectivity, and demo-backed routes. It is an assessment, not a fresh reproduction; re-test before reporting these as current.
- Beacon status documentation is older than current migration/client work. It reports mock circle requests/chat/live sharing and incomplete production safety/accessibility validation, but newer backend migrations and uncommitted client work exist. Reconcile source, tests, migration history, and deployed Supabase state before relying on either conclusion.
- A migration file being present locally does not mean it has been applied. In particular, resolve migration-history drift and verify the target environment/backups before applying or rolling back reporting, guest-reporting, or Beacon migrations. Preserve audit, guest lookup, and private evidence data; never restore broad authenticated location/report-read policies as a shortcut.
- GPS/browser permission behavior varies by device and secure context. Beacon requires HTTPS (localhost qualifies), precise location permission, and device-level location accuracy; desktop emulation is not phone GPS. The resident README documents `?geodebug=1` diagnostics, which must not expose coordinates.
- Browser apps must not receive service-role credentials. Keep Edge Function secrets server-side; preserve RLS and authorization checks even when UI routes are gated.
- Generated vendor files, demo seeds, local Supabase state, test credentials, and ignored environment files can make local runs appear functional without proving production deployment. Never include their values in documentation.

## Current handoff status and next steps

- Repository branch at inspection: `integrate/snap-and-say-with-navigation`; last committed change: `5f58a7d` (`docs: document branching and snap regression`).
- The worktree was substantially dirty before this handoff (tracked edits plus untracked files). Changes span the platform-admin app, resident Beacon/Lifeline/messaging/notifications, shared Supabase client/realtime, security checks, dev tooling, migrations, and tests. Treat all of it as existing user work. Inspect `git status` and relevant diffs before editing; do not assume the last commit represents the complete implementation.
- The repository contains migration work for resident messaging, Beacon circles, and Lifeline circle-contact lookup dated 2026-10-20 to 2026-10-23, plus related uncommitted client/test changes. Their deployment/application status is unknown.
- The platform-admin source now includes auth/session routing, role guards, dashboard/report maps and details, staff/account pages, safe DOM and report clients, tile-error handling, and loading timeouts. Recent edits are uncommitted, so compare them with the reported dashboard issues before assuming those fixes are complete or committed.
- Next: (1) preserve and review the existing diff; (2) reconcile README and Beacon status claims with current code/tests; (3) confirm Supabase migration history and actual deployment before database work; (4) run focused tests for dashboard auth/guards/timeouts, maps, and resident work, then `npm test`, lint, and relevant checks; (5) finish remaining server-backed workflows, CORS/deployment validation, and real-device accessibility/location verification before calling the product production-ready.
- No implementation task is currently defined by the available conversation beyond writing this handoff. Do not invent one or claim that the pending work above is already underway by a specific agent.

## Working conventions and uncertainty

- Follow existing JavaScript module, JSDoc, naming, formatting, and package-boundary patterns. Reuse shared clients/helpers; keep changes focused and update directly related docs/tests.
- Make security/privacy behavior explicit: validate server-side, enforce least privilege in RLS/Edge Functions, avoid public media URLs, and never log secrets or precise location unnecessarily.
- The user wants a complete, factual handoff that clearly marks uncertainty and excludes secret values. The available conversation history also supports concise progress reports, scope discipline, and no large code dumps; personal naming/style preferences beyond that are unknown.
- For uncertain or conflicting behavior, say what evidence conflicts and ask before making a product/security decision. Verify the exact changed behavior with focused tests; do not infer production readiness from a passing UI demo.
