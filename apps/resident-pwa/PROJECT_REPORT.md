# CivicNeuro Resident PWA — project report

## Summary
This app is a mobile-first citizen service portal for South African residents to report civic issues, track their cases, access local safety and service information, and use Beacon/Lifeline safety features. The resident-facing experience is mostly implemented as a static web app with route-based pages, custom web components, and Supabase-backed auth/data flows when configured correctly. Core user journeys such as sign-in, account creation, service reporting, and Beacon/Lifeline flows are in place, but live backend connectivity is incomplete in the current checked-in state: browser console errors show failed CORS requests to the configured Supabase functions, and several routes still rely on demo/mock data or are marked as not connected yet. Overall, the app is feature-rich and fairly polished as a UX prototype, but it is not yet production-ready without a proper Supabase deployment, CORS configuration, and a pass on production security and data flow.

## Part A: Overview (non-technical)

### 1) What the app is, who it is for, and the problem it solves
The app is a CivicNeuro resident portal designed for residents to report municipal issues, access ward/community information, and get safety support. The README describes it as a secure, mobile-first PWA for South African residents to report civic issues (potholes, water leaks, power outages, sanitation), take part in polls and surveys, access emergency Lifeline services, and share live walking routes through Beacon. Based on the route list in `apps/resident-pwa/README.md`, the app targets residents and supporters in local communities rather than municipal staff or platform admins; the resident experience is the primary focus (`apps/resident-pwa/README.md`, route listing).

### 2) Main resident user journeys
1. Sign up and verify email: `welcome` → `register` → verify email flow → `home`.
2. Sign in or continue as guest: `welcome` → `sign-in` or `startGuestSession()` → `guest-report`, then `guest-confirmation` or `track-report`.
3. File a report: `home` or `report-new` → select category, add location/media, submit report → `report-submitted`.
4. Track reports: `my-reports` / `track-report` displays report cards and status details; user can view thread, escalate, reopen, or provide satisfaction feedback (`apps/resident-pwa/src/features/reports/reports.store.js`, `apps/resident-pwa/src/pages/report-new/report-new.js`).
5. Get community information: `news`, `polls`, `survey`, `community-pulse`, `your-area`, `trending-issues`, `help-and-safety`.
6. Safety and emergency tools: `lifeline-home` and `beacon-home` with route sharing and emergency contact groups.
7. Offline or weak-connectivity flow: `reports.client.js` checks `navigator.onLine`, queues reports offline, and routes to `offline-queued` when needed.

### 3) Roles and permissions
The app is structured around three broad roles in the RBAC package: guest, resident, and org/admin/platform roles. The live route gate is simple: `apps/resident-pwa/src/router.js` uses route metadata (`auth`, `guest`) and `sessionStore` to restrict pages. `sessionStore` treats `isGuest` as a separate session state; `startGuestSession()` marks the user as authenticated but guest. `packages/rbac/src/matrix.js` defines a broader permissions matrix, including `report:create`, `beacon:use`, `lifeline:use`, `poll:vote`, and `survey:answer`, and the tests confirm that a guest cannot vote on polls. The app itself mostly relies on route-level gating and session flags; the database-side enforcement is handled via Supabase row-level security (RLS) for resident profile, Beacon contact, and Lifeline card tables.

### 4) Current status: completeness judgement
Overall status: about 70% complete for core resident workflows, 50–60% complete for live production integration.
- Finished / strong: app shell, routes, auth UI, report form and lifecycle screens, Beacon safety flow UX, Lifeline card UX, emergency screens, notifications screen, and route-based navigation.
- Rough / partially implemented: resident directory search is explicitly marked as not connected yet; some pages are present but depend on backend functions not deployed or misconfigured; mock/demo fixtures are still used in several places.
- Missing / not production-ready: live CORS/backend configuration, secure deployment config, push notifications, real production data storage for reports/news/polls/surveys beyond scaffolding, and confidence in server-side enforcement for all features.

### 5) What non-technical stakeholders should know
- This is a mobile-first prototype that looks feature-complete in the interface but still depends on backend wiring and deployment decisions.
- Real user data should not be relied on until the app is connected to a configured Supabase project and the Edge Functions/CORS layer is working.
- Resident privacy and consent are treated seriously in the code and SQL, but the app should be validated with real users before launch, especially for Beacon location sharing and contact collection.
- The app uses mock or seeded content in a number of places; this is acceptable for demos, but it must be removed or replaced before production launch.

## Part B: Technical architecture

### 1) Tech stack and exact versions
From the checked-in project files:
- Root workspace is a Node/NPM monorepo with workspaces: `package.json` (`workspaces: ["packages/*", "apps/*"]`).
- App package: `apps/resident-pwa/package.json` has `"name": "@civicneuro/resident-pwa"`, `"version": "0.1.0"`, `"private": true`, and a single dependency: `leaflet": "^1.9.4"`.
- Internal package versions are all `0.1.0` (for example `packages/supabase-client/package.json`, `packages/ui/package.json`, `packages/rbac/package.json`).
- Framework: there is no React/Vue/Angular framework in the resident PWA; it is built with plain ES modules and custom Web Components (`src/main.js`, `src/components/...`, `src/pages/...`).
- Build tool: no bundler is configured in the app; the project runs from a custom zero-dependency Node server (`tools/dev-server.js`), which serves static files and injects an import map for workspace packages.
- Styling: custom CSS files under `apps/resident-pwa/src/styles` and page/component CSS files; no Tailwind/Bootstrap/Material UI appears to be in use.
- State management: custom state store package `@civicneuro/state`; `sessionStore`, `notificationsStore`, and `beacon` state are the main stores.
- Routing: hash-based client router in `apps/resident-pwa/src/router.js`.
- Auth and backend: direct Supabase client package + Supabase Edge Functions via `@civicneuro/functions-client`.
- Maps/geolocation: Leaflet + browser geolocation APIs.

### 2) Folder and file structure
Key structure:
- `apps/resident-pwa/` — resident PWA shell and pages.
  - `index.html` — app shell and preload of CSS/manifest.
  - `manifest.webmanifest` — PWA manifest.
  - `service-worker.js` — shell caching service worker.
  - `runtime-config.js` — runtime config for Supabase and mock mode.
  - `src/main.js` — bootstraps app, configures clients, sets up router, registers service worker.
  - `src/router.js` — hash routes and auth guards.
  - `src/session.js` — resident session and guest session state.
  - `src/components/` — reusable UI web components like app shell, bottom nav, offline banner, map pin picker, progress bar, etc.
  - `src/features/` — cross-cutting client logic: auth, reports, notifications, beacon, public info, etc.
  - `src/pages/` — route-level pages (`welcome`, `home`, `my-reports`, `beacon-home`, etc.).
  - `src/styles/` — global CSS and app theme tokens.
- `packages/*` — internal workspace libraries for i18n, state, security, UI, Supabase access, RBAC, geo helpers, functions client, offline queue.
- `supabase/functions/` — Edge Function code including `beacon-route`, `reports-*`, `lifeline-*`, `media-*`, etc.
- `supabase/migrations/` — SQL migrations for resident profiles, Beacon contacts, and Lifeline cards.
- `tools/dev-server.js` — custom dev server.

### 3) How the app starts and runs
- `index.html` loads the app shell and `src/main.js` as an ES module (`apps/resident-pwa/index.html`).
- `main.js` configures Supabase and functions clients using `runtime-config.js`; it then initializes i18n and router. It registers the service worker only in production mode (`apps/resident-pwa/src/main.js`).
- `app-shell.js` renders the shell and, on route changes, dynamically imports a page module by route name, then appends it into the main content area (`apps/resident-pwa/src/components/app-shell/app-shell.js`).
- The router uses hash-based routes and calls `window.addEventListener('hashchange', ...)` (`apps/resident-pwa/src/router.js`).
- A custom Node server injects an import map for `@civicneuro/*` packages and serves static files on `http://localhost:3000` (`tools/dev-server.js`).
- The README instructs the app to be run as `node tools/dev-server.js` and then open `http://localhost:3000/apps/resident-pwa/index.html` (`apps/resident-pwa/README.md`).

### 4) Architecture pattern and data flow
- Frontend pattern: route-driven, component-based DOM rendering using custom web components rather than a framework. Each page is a class that extends `BaseElement` from `@civicneuro/ui`.
- Client state: in-memory stores for session, notifications, and reports, plus localStorage/sessionStorage for some Beacon state and pending path data.
- API layer: `packages/functions-client/src/invoke.js` centralizes function calls, supports a mock adapter, and uses `fetch()` to `SUPABASE_URL/functions/v1/<endpoint>` when mock mode is off.
- Direct Supabase DB access: `packages/supabase-client/src/client.js` and `auth.js` wrap `auth/v1/*` and `rest/v1/*` calls. They store access tokens in memory and never write to `localStorage`/`sessionStorage` (`packages/supabase-client/src/auth.js`).
- Offline: `reports.client.js` detects `navigator.onLine`; if offline, it calls `enqueueReport` from `@civicneuro/offline-queue`, not the live Edge Function.
- Error handling: page-level `try/catch` blocks trigger `showToast` messages; `main.js` catches start-up failures and renders an error state; the Edge Function `beacon-route/handler.js` catches and maps service errors to structured JSON with codes such as `UNAUTHORIZED`, `ROUTE_SERVICE_ERROR`, and `ROUTING_NOT_CONFIGURED`.
- Loading states: `app-shell.js` inserts a `cn-skeleton` before route content loads, and many pages render skeleton/plain UI while waiting for data.

### 5) Backend and services used
- Supabase: primary auth and data backend. The README explicitly says the app uses Supabase Auth and PostgREST directly for resident auth/profile reads, and other resident operations call Edge Functions at the configured project URL (`apps/resident-pwa/README.md`).
- Database tables: `public.resident_profiles`, `public.beacon_contacts`, and `public.lifeline_cards` are defined in SQL migrations and enforced by RLS (`supabase/migrations/0028_resident_profiles.sql`, `0029_beacon_contacts.sql`, `0030_lifeline_cards.sql`).
- Edge Functions: a large list of function folders exists under `supabase/functions/`, including `beacon-route`, `reports-create`, `lifeline-cards`, `media-upload-intent`, and others, but the resident app code mainly relies on the client wrapper and the `beacon-route` path in the runtime evidence.
- Geocoding and route planning: `supabase/functions/beacon-route/handler.js` requires `BEACON_GEOCODER_URL` and `BEACON_ROUTING_URL` and validates them to a self-hosted Nominatim/OSRM-compatible service. It rejects public provider fallback in production guidance (`apps/resident-pwa/README.md`).
- Map tile layer: `runtime-config.js` sets `tileHost` to `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
- Other services: a phone-contact-picker flow is built into the browser; there is no backend push-notification service as implemented yet.

### 6) Environment variables and configuration
Names from `.env.example` and docs (not values):
- `SUPABASE_URL` — base URL for Supabase project.
- `SUPABASE_ANON_KEY` — public browser key.
- `SUPABASE_SERVICE_ROLE_KEY` — privileged server-side key; must not be used in browser code.
- `SUPABASE_JWT_AUDIENCE` — JWT audience validation.
- `STORAGE_BUCKET_QUARANTINE`, `STORAGE_BUCKET_REPORT_MEDIA` — storage bucket names for media and quarantining.
- `SIGNED_URL_TTL_SECONDS` — signed URL expiry.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SENDER_ADDRESS` — email sending.
- `SMS_PROVIDER_API_KEY` — SMS service key.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` — WhatsApp integration keys.
- `WHISPER_API_KEY`, `GEMINI_API_KEY` — AI transcription/analysis options.
- `HCAPTCHA_SECRET` — captcha verification secret.
- `BEACON_GEOCODER_URL`, `BEACON_ROUTING_URL`, `BEACON_ROUTING_PROFILE` — geocoding and routing config (from the app README and Edge Function). `BEACON_ROUTING_PROFILE` defaults to `foot` in the Edge Function.
- `runtime-config.js` in the app provides the browser-side configuration: `env`, `useMock`, `supabaseUrl`, and `supabaseAnonKey` (values intentionally redacted in source; the app docs say not to put a service-role key in browser code).

Deployment/hosting target: there is no `Dockerfile`, `vercel.json`, `netlify.toml`, or hosting config in the checked-in app. The app runs via a custom Node server on localhost:3000; the hosting target is not defined in code (Not found / unclear).

## Part C: PWA specifics

### 1) Web app manifest
The manifest is defined in `apps/resident-pwa/manifest.webmanifest` and includes:
- `name`: `CivicNeuro Resident`
- `short_name`: `CivicNeuro`
- `start_url`: `./index.html`
- `display`: `standalone`
- `background_color`: `#ffffff`
- `theme_color`: `#0052cc`
- `icons`: 192x192 and 512x512 PNG files under `apps/resident-pwa/public/icons/`
The app also declares the manifest in `apps/resident-pwa/index.html` with `<link rel="manifest" href="./manifest.webmanifest">`.

### 2) Service worker and caching
The app uses a custom service worker, not Workbox or `vite-plugin-pwa`: `apps/resident-pwa/service-worker.js` registers a shell cache called `cn-shell-v11` and caches only a small, static shell list: `index.html`, `offline.html`, `manifest.webmanifest`, `src/main.js`, and `src/styles/main.css`. It does not cache API responses or auth tokens (`apps/resident-pwa/service-worker.js`). The fetch handler appears to intentionally skip `GET` requests that include `/functions/` or `/rest/` to avoid caching dynamic data. The service worker is only registered when `config.env === 'production'` (`apps/resident-pwa/src/main.js`).

### 3) Offline behaviour
The app does have some offline support:
- `service-worker.js` caches the app shell and serves `offline.html` when the network fails.
- `reports.client.js` checks `navigator.onLine` and calls `enqueueReport()` when offline.
- There is an `offline-queued` route and a dedicated offline-queue package (`packages/offline-queue/src/queue.js`). However, the actual implementation is in-memory and not persisted to IndexedDB; `queue.js` defines `let memoryQueue = []` and comments describe in-memory/IndexedDB but the current code is memory-only.
- The app is not a full offline-first app for all data: dynamic report/news/poll/survey data may fail or be mocked if the network is down or CORS is broken.

### 4) Installability
The app appears to meet the standard installability criteria for a PWA: manifest is present, icons are defined, and display mode is standalone. There is no evidence of custom install prompt handling (`beforeinstallprompt` listener, install button, or push permission flow) in the app files. This is a case of native browser installation rather than an app-controlled install prompt. The app is run from localhost in the current environment, which is allowed for local PWA testing (`apps/resident-pwa/index.html`, `manifest.webmanifest`).

### 5) Push notifications
There is no push notification setup found in the resident app or edge functions. Search for `PushManager`, `Notification.requestPermission`, and `beforeinstallprompt` did not reveal a working implementation; a runtime check also did not show a notification permission flow. This is a major missing production feature. The app does have an alerts/notifications UI (`notificationsStore` in `apps/resident-pwa/src/features/notifications/notifications.store.js`), but it is driven by in-memory fixtures, not real push subscriptions.

### 6) Device features used
- Geolocation: high-accuracy GPS is required for Beacon and route sharing (`apps/resident-pwa/src/features/beacon/beacon-location.js`), with `enableHighAccuracy: true`, 30-second timeout, and no cached fix.
- Camera/file upload: the report form uses `<input type="file" accept="image/*"` and video input, and the app includes camera-related UI (`report-new.js`, `components/camera-capture`, `components/media-capture`).
- Contact picker: the Beacon flow uses the browser’s contact picker when supported and a manual fallback (`apps/resident-pwa/README.md`, `beacon-add-to-circle.js`).
- Maps: Leaflet is used for route map, map pin selection, and live location markers (`apps/resident-pwa/src/features/beacon/leaflet-map.js`, `apps/resident-pwa/src/components/live-map/live-map.js`).
- No explicit microphone or Bluetooth use was found in the resident code paths reviewed.

## Part D: Authentication and security

### 1) Auth system in full
The auth system is built around Supabase Auth, not a custom auth backend. Evidence:
- `packages/supabase-client/src/auth.js` owns token lifecycle; access and refresh tokens are kept in memory only and methods are exposed for `setSession`, `clearSession`, `refreshSession`, and `signOut`.
- `apps/resident-pwa/src/features/auth/auth.client.js` accepts sign-in by email or normalized phone number (South Africa numbers are normalized to +27 format), signs up, sends password reset links, and handles account verification redirect URLs using `new URL('./', window.location.href).href`.
- `register()` writes metadata into Supabase Auth user metadata: `full_name`, `phone`, `address`, `notification_consent`, and `privacy_consent_at`.
- `handleAuthRedirect()` processes the `access_token`, `refresh_token`, and `type` from Supabase verification or password recovery links. If the user is verified, it starts resident session.
- `resetPassword()` calls `updatePassword` and ends the session.
- The app explicitly says sign-in is never accepted in mock mode (`packages/functions-client/src/invoke.js` and app README). `startResidentSession()` updates the front-end session store and `setSession()` stores the token in memory, not in browser storage.

### 2) Route protection
Client-side route protection is implemented in `apps/resident-pwa/src/router.js`:
- Each route definition includes `auth` and `guest` flags.
- `handleRouteChange()` checks `sessionStore.get()` and redirects unauthenticated users to `welcome` for protected routes.
- `session-guard.js` exposes simple helpers `requireAuth()` and `requireResident()`.
This is client-side only. It is not a secure server-side policy and should not be trusted as the only gate.

### 3) Authorization rules and database security
The project includes real RLS policies in SQL migrations:
- `supabase/migrations/0028_resident_profiles.sql` creates `public.resident_profiles` and restricts reads and updates to `authenticated` users matching `auth.uid() = id`.
- `supabase/migrations/0029_beacon_contacts.sql` creates `public.beacon_contacts` with owner-scoped policies and unique constraint on `(owner_id, phone_normalized)`.
- `supabase/migrations/0030_lifeline_cards.sql` creates `public.lifeline_cards` with owner-scoped RLS and `members` JSON arrays limited to 1–4 items.
- `beacon-route/handler.js` enforces token authentication by calling `Supabase /auth/v1/user` and rejecting unauthenticated or unauthorized traffic.
These are solid pieces of backend enforcement; however, the app still contains mock data and some high-level route checks that are not a replacement for data-layer security.

### 4) Security observations and ranking
Observed strengths:
- No tokens are written to `localStorage`/`sessionStorage` by the auth package (`packages/supabase-client/src/auth.js`).
- The app has sanitization/security utilities (`packages/security-web`), and tests cover XSS-related escaping and URL sanitization.
- The service worker is restricted to static shell assets and deliberately avoids caching API responses (`apps/resident-pwa/service-worker.js`).
- The Edge Function authorizes the Beacon route using the bearer token and validates geocoding/routing config and coordinate ranges (`supabase/functions/beacon-route/handler.js`).

Observed concerns / issues ranked by severity:
1. High: live production has a backend connectivity / CORS problem. Evidence: browser page events show CORS errors for `${SUPABASE_URL}/functions/v1/news-list` and `surveys-list`, and the runtime fetch to live functions fails with `ERR_FAILED` / `Failed to fetch`.
2. Medium: client-side route guards are not a complete authorization model; they are only client-side checks. The app does include server-side RLS, but not every feature is covered by strong server-side enforcement in the reviewed code.
3. Medium: offline queue is in-memory only. `packages/offline-queue/src/queue.js` uses `let memoryQueue = []`; there is no durable queue, so reports or data can be lost across reloads.
4. Medium: some user flows are still mock/demo-driven: `reset-password.js` defaults to `mock-reset-token`, `captcha-widget.js` returns a mock captcha token, `beacon-add-to-circle.js` declares resident directory search is not connected yet, and `auth.client.js` warns that `resident_profiles` is not available until migration is applied.
5. Low: browser-safe Supabase settings are loaded from the ignored local `.env` by the development server; service-role keys and database connection strings must remain server-side.

## Part E: Data model and associations

### 1) Entities, fields, and constraints
Actual database entities found in SQL migrations:
- `auth.users` — Supabase Auth table. The app reads/writes identity and metadata for resident sign-up, verification, and password recovery (`apps/resident-pwa/src/features/auth/auth.client.js`, `supabase/migrations/0028_resident_profiles.sql`).
- `public.resident_profiles` — one-to-one resident profile. Fields: `id` (uuid, PK/FK to `auth.users`), `full_name`, `email`, `phone`, `address`, `notification_consent`, `privacy_consent_at`, `created_at`, `updated_at` (`supabase/migrations/0028_resident_profiles.sql`).
- `public.beacon_contacts` — owner-scoped contact list. Fields: `id`, `owner_id`, `name`, `phone`, `phone_normalized`, `invitation_status`, `message_prepared_at`, `created_at`, `updated_at` (`supabase/migrations/0029_beacon_contacts.sql`).
- `public.lifeline_cards` — owner-scoped emergency groups. Fields: `owner_id`, `id`, `name`, `icon`, `color`, `members` (JSONB array; 1–4 members), `created_at`, `updated_at` (`supabase/migrations/0030_lifeline_cards.sql`).

App-local collections and stores found in code:
- `sessionStore` — holds `isAuthenticated`, `isGuest`, `user`, `activeSharesCount`, `unreadAlertsCount`, `language` (`apps/resident-pwa/src/session.js`).
- `notificationsStore` — array of resident notifications with `kind`, `title`, `body`, `createdAt`, `readAt`, `reportRef` (`apps/resident-pwa/src/features/notifications/notifications.store.js`).
- `reportsStore` — seeded report objects with status, timeline, messages, satisfaction, and org context (`apps/resident-pwa/src/features/reports/reports.store.js`).
- `beacon` state — localStorage-backed state containing members, pending request arrays, active session, contacts permission, and chat state (`apps/resident-pwa/src/features/beacon/beacon.client.js`).
- `offline-queue` — in-memory queue of report payloads (`packages/offline-queue/src/queue.js`).
- `mockDb` inside `packages/functions-client/src/invoke.js` — realistic demo data for reports, polls, surveys, news, Lifeline cards, and Beacon requests when mock mode is enabled.

Not found / unclear: a complete database schema for reports, polls, surveys, and news was not found under `supabase/migrations`; these are represented in app state and mock function responses instead.

### 2) Relationships (written description and Mermaid ER diagram)
- One `auth.users` row can have one `resident_profiles` row (`id` is the PK/FK pointer).
- One `auth.users` row can own many `beacon_contacts` rows, and each contact is unique per owner by normalized phone number.
- One `auth.users` row can own many `lifeline_cards`, with a composite primary key `(owner_id, id)`.
- The app reads these tables only when a signed-in resident is active and uses `auth.uid() = owner_id` in the row-level policies.
- Reports, notifications, and community information are not backed by direct SQL tables in the checked-in app; they are front-end stores and mock responses.

```mermaid
erDiagram
  AUTH_USERS ||--o| RESIDENT_PROFILES : profile
  AUTH_USERS ||--o{ BEACON_CONTACTS : owns
  AUTH_USERS ||--o{ LIFELINE_CARDS : owns

  AUTH_USERS {
    uuid id PK
    text email
  }

  RESIDENT_PROFILES {
    uuid id PK,FK
    text full_name
    text email
    text phone
    text address
    boolean notification_consent
    timestamptz privacy_consent_at
  }

  BEACON_CONTACTS {
    uuid id PK
    uuid owner_id FK
    text name
    text phone
    text phone_normalized
    text invitation_status
    timestamptz message_prepared_at
  }

  LIFELINE_CARDS {
    uuid owner_id FK
    text id
    text name
    text icon
    text color
    jsonb members
    PRIMARY KEY(owner_id, id)
  }
```

### 3) Migrations / seed data
- `supabase/migrations/0028_resident_profiles.sql` creates the profile table and trigger. It inserts historical rows for existing auth users with `privacy_consent_at` metadata.
- `supabase/migrations/0029_beacon_contacts.sql` creates the owner-scoped Beacon contact table and a trigger to update `updated_at`.
- `supabase/migrations/0030_lifeline_cards.sql` creates the owner-scoped Lifeline card table and similar trigger.
- There is no app-level SQL seed for resident reports/polls/news; those are seeded in JS data stores (`reports.store.js`, `functions-client/invoke.js`).

### 4) Where each entity is used in the frontend
- Resident profile: `auth.client.js`, `sign-in.js`, `home.js`, `account.js` and related pages; session data is pulled into `sessionStore` after sign-in.
- Beacon contacts: `beacon-add-to-circle.js`, `beacon-find-contacts.js`, `beacon.client.js`.
- Lifeline cards: `lifeline-home.js`, `lifeline-card-create.js`, `lifeline-card-edit.js`, `lifeline-contacts-picker.js` and related store APIs.
- Reports: `report-new.js`, `my-reports.js`, `report-detail.js`, `report-thread.js`, `report-satisfaction.js`, `report-reopen-escalate.js`.
- Notifications: `home.js`, `notifications.js`, `notifications.store.js`.
- Polls/surveys/news: `polls.js`, `survey.js`, `news.js`, and the `functions-client` mock adapter.

## Part F: Pages, routes, and components

### 1) Route table
| Path | Purpose | Auth required | Main components | Data reads/writes | Status |
|---|---|---:|---|---|---|
| `welcome` | Landing/entry screen | No | Welcome hero, sign-in/register buttons | None | Done |
| `sign-in` | Resident sign-in | No | Email/password inputs | Reads Supabase auth | Done |
| `register` | Create account | No | Full registration form | Writes Auth user metadata | Done |
| `verify-email` | Email verification result | No | Status/CTA | Reads redirect token flow | Partial |
| `forgot-password` | Reset request | No | Email field | Calls reset request | Done |
| `reset-password` | Set new password | No | Password fields | Calls `updatePassword()` | Partial (mock token default) |
| `session-expired` | Session expiry message | No | Error state | None | Done |
| `guest-report` | Guest issue reporting | No | Report form with guest context | Writes guest report payload | Done |
| `guest-confirmation` | Guest confirmation screen | No | Success state | None | Done |
| `track-report` | Search by reference number | Yes or guest capable | Search form | Reads report lookup | Done |
| `home` | Resident hub | Yes | Welcome banner, quick actions, area cards | Reads notifications, loads actions | Done |
| `menu` | App menu | Yes | Menu list | None | Present |
| `notifications` / `alerts` | Notifications feed | Yes | Notification list | Reads `notificationsStore` | Done |
| `report-new` | New issue form | Yes | Category, location, media fields | Submits report | Done |
| `report-duplicate-check` | Duplicate check before submit | Yes | Duplicate detection UI | Reads check state | Present |
| `report-submitted` | Submission confirmation | Yes | Success summary | Writes/reads reference number | Done |
| `my-reports` | Report list | Yes | Report cards and filters | Reads `reportsStore`/backend | Done |
| `report-detail` | Case detail view | Yes | Timeline, messages, actions | Reads a specific report | Done |
| `report-thread` | Conversation thread | Yes | Thread UI | Reads/writes messages | Done |
| `report-satisfaction` | Close-the-loop satisfaction | Yes | Rating UI | Writes satisfaction | Done |
| `report-reopen-escalate` | Reopen/escalate actions | Yes | Action panel | Writes status changes | Done |
| `snap-and-say` | Voice + photo report flow | Yes | Voice input, transcript | Reads AI/transcription service | Partial |
| `lifeline-home` | Emergency contacts | Yes | Lifeline cards | Reads/saves cards | Done |
| `lifeline-call-countdown` | Calling countdown | Yes | Timer UI | Writes call state | Present |
| `lifeline-calling-status` | Calling status screen | Yes | Calling UI | Reads active call state | Present |
| `lifeline-card-create` | Create card group | Yes | Form to create emergency card | Saves card into DB | Done |
| `lifeline-card-edit` | Edit card group | Yes | Edit card form | Updates card | Done |
| `lifeline-contacts-picker` | Pick contacts into card | Yes | Contact selection UI | Reads/writes contact list | Present |
| `contacts-permission` | Contact access request | Yes | Permission prompt | Reads browser permissions | Present |
| `beacon-home` | Beacon live safety state | Yes | Map, live route, prompt UI | Reads geolocation + beacon state | Done |
| `beacon-safety-notice` | Safety rules before sharing | Yes | Explanation screen | None | Present |
| `beacon-add-to-circle` | Add people to circle | Yes | Search/invite UI | Reads/writes circle requests | Done |
| `beacon-requests` | Incoming/outgoing requests | Yes | Circle request list | Reads/writes requests | Present |
| `beacon-find-contacts` | Look up device contacts | Yes | Contact picker/manual entry | Saves contact data | Done |
| `beacon-chat` | Beacon chat | Yes | Chat view | Reads/writes chat state | Present |
| `beacon-draw-path` | Draw route | Yes | Map route drawing | Saves pending route path | Done |
| `beacon-start-confirm` | Confirm starting route | Yes | Route start confirmation | Reads GPS accuracy + route start | Present |
| `beacon-share-session` | Share current route | Yes | Active sharing screen | Writes share session | Present |
| `your-area` | Local area info | Yes | Area summary cards | Reads area data | Present |
| `polls` | Community polls list | Yes | Poll cards | Reads poll list | Done |
| `poll-detail` | Poll detail / vote | Yes | Poll choices | Writes vote | Done |
| `community-pulse` | Community pulse stats | Yes | Stats and trends | Reads local demo stats | Done |
| `trending-issues` | Trending issue board | Yes | Trend cards | Reads demo trend data | Present |
| `news` | News feed | Yes | News cards | Reads functions/news list | Partial (CORS failure in live config) |
| `news-article` | Individual article | Yes | Article detail | Reads news article | Present |
| `survey` | Survey form | Yes | Question list | Reads/sends survey answers | Partial (CORS failure in live config) |
| `survey-submitted` | Survey success | Yes | Confirmation screen | Writes survey result | Present |
| `safety-info` | Safety guidance | Yes | Info panels | None | Present |
| `help-and-safety` | Support resources | Yes | Info cards | None | Present |
| `menu` | Additional navigation actions | Yes | Menu list | None | Present |
| `account` | Account management | Yes | Profile summary | Reads user profile | Present |
| `profile-edit` | Edit resident profile | Yes | Form | Writes profile data | Present |
| `badges-edit` | Edit earned badges | Yes | Badge cards | None / local state | Present |
| `notification-settings` | Notification preferences | Yes | Toggle form | Reads/writes preferences | Present |
| `language` | Language selection | Yes | Locale picker | Reads/writes app language | Present |
| `terms` | Terms/conditions | Yes | Terms text | None | Present |
| `privacy-policy` | Privacy policy | Yes | Policy text | None | Present |
| `contacts` | Contacts directory | Yes | Directory info | Reads contact data | Present |
| `data-export` | Data export screen | Yes | Export options | Not strongly connected | Partial |
| `delete-account` | Deletion flow | Yes | Confirmation UI | Not strongly connected | Partial |
| `pilot-org-select` | Pilot org selector | Yes | Org selection | Reads/writes org option | Present |
| `empty-state` | Generic empty state | Yes | Empty state | None | Present |
| `error-state` | Error fallback | Yes | Error panel | None | Present |
| `offline-queued` | Offline queue listing | Yes | Queue list | Reads queued reports | Present |

### 2) Navigation structure and layout
The shell layout is a phone-first design built in `cn-app-shell` (`apps/resident-pwa/src/components/app-shell/app-shell.js`), with:
- top mobile notch row
- header with `cn-top-menu-button`
- offline banner
- active Beacon share indicator
- `main` content area
- `cn-bottom-nav` for authenticated residents
The navigation is bottom-tab based and includes Lifeline, Home, Reports, Alerts, and Beacon. `cn-bottom-nav` is only rendered when `session.isAuthenticated` is true. This is mobile-first and designed for a single-column app shell, which suits the PWA use case.

### 3) Key reusable components and services
- `cn-app-shell` — overall shell and route loader.
- `cn-bottom-nav` — bottom tab navigation.
- `cn-top-menu-button` — header menu trigger.
- `cn-offline-banner` — offline state indicator.
- `cn-beacon-share-indicator` — active sharing state indicator.
- `cn-map-pin-picker` — map-based location selection.
- `cn-lifeline-card` — emergency contact card.
- `cn-live-map` — map display for route and live pins.
- `cn-voice-input` / `cn-transcript-view` — voice capture and transcript experience.
- `cn-captcha-widget` — captcha placeholder widget.
- `cn-confirm-dialog` — confirmation pop-ups.
- `cn-toast` — toast notifications.
- `sessionStore` / `notificationsStore` / `reportsStore` — application state stores.
- `configureSupabaseClient`, `requestSupabase`, `invokeFunction` — backend communication wrappers.
- `createBeaconLocationWatchController` — GPS handling for Beacon accuracy and route start validation.

### 4) Forms and validation
Form flows include sign-in/register, forgot/reset password, report creation, contact invites, Lifeline card creation/editing, and survey/polls. Validation is mixed:
- Front-end checks exist in page JS (`sign-in.js`, `report-new.js`, `reset-password.js`, `beacon-add-to-circle.js`).
- Backend and schema validation exists in packages such as `packages/schemas` and SQL CHECK constraints in `supabase/migrations/*.sql`.
- Example checks include South Africa phone number validation, email format validation, max member count (4) for Lifeline cards, and route distance/coord validation in `beacon-route/handler.js`.
- The form UX is fairly complete, but some flows still use placeholders or demo data rather than live backend validation.

### 5) UI/UX notes
- The app is designed as a clean, mobile-first, low-distraction interface: strong whitespace, card layouts, and large touch targets.
- It uses a custom “public-sans / source-serif” font stack from Google Fonts via `index.html`.
- It is primarily English-only. The app includes a language route (`language.js`), but there is no evidence of broad isiZulu or multiple-language translations beyond a page scaffold and i18n package (`packages/i18n`).
- Accessibility is partially considered: large buttons, labels, ARIA labels, keyboard event handlers, and reduced-motion logic are present, but there is no visible full accessibility audit in the checked-in files.

## Part G: Quality and operations

### 1) Testing
Existing automated tests are run from the repo root via `npm test`, and they passed during this review:
- `node --test packages/*/test/*.test.js apps/resident-pwa/test/*.test.js tests/beacon/*.test.js supabase/functions/beacon-route/handler.test.js`
- Result: 92 tests passed, 0 failed.
The project includes tests around:
- Lifeline group save/load logic (`apps/resident-pwa/test/lifeline-groups.test.js`)
- Mock adapter and report submission logic (`packages/functions-client` tests)
- Geo logic, RBAC rules, schema validation, and Beacon route accuracy edge cases (`packages/geo`, `packages/rbac`, `packages/schemas`, `supabase/functions/beacon-route/handler.test.js`).

### 2) Lint / type-check / build results
Static checks run during this review:
- `npm run lint` — passed with 0 errors and 33 warnings. Warnings are mostly unused variable warnings and a couple of `eqeqeq` warnings; no blocking lint errors were raised.
- There is no `build` script in the app or root package for a production bundle. The app is static and served by the custom Node dev server, so there is no TypeScript or bundler build step to validate.
- This means the codebase is closer to a static web app than a compiled app framework; quality relies more on tests, runtime checks, and manual QA.

### 3) Performance considerations
- The app is intentionally lightweight because it uses no heavy framework, no bundler, and no large runtime dependency besides Leaflet.
- Pages are dynamically imported by route name (`app-shell.js`), which reduces initial parse time.
- The service worker caches only a minimal shell, which is sensible for a PWA but does not solve offline data sync beyond shell caching.
- The repo does use a few large UI/JS files, and the Beacon feature is fairly heavy because geolocation, map rendering, and periodic updates all run in the browser.
- No bundle-size measurement or asset optimization was found in the app.

### 4) Logging, error tracking, analytics
- There is a logger package (`packages/logger`) and a custom `logger.js`, but the resident app itself mainly logs via `console.warn` / `console.error` in the browser (`beacon-location.js`, `main.js`).
- No Sentry, PostHog, GA, or analytics SDK is wired in the reviewed resident app code.
- `beacon-route/handler.js` returns structured error codes instead of an external telemetry layer.
- In other words: logging is present but it is mostly console-based and not production-grade observability.

### 5) How to run it locally and deploy it
Local run:
- From the repo root: `node tools/dev-server.js`
- Open `http://localhost:3000/apps/resident-pwa/index.html`
This is from the README and verified by the custom server script.

Deployment: the code does not define a production host configuration beyond the custom dev server. No hosting target or deployment automation was found in the checked-in app files (Not found / unclear).

### 6) Git history summary
Recent repo history shows only two commits:
- `360f427` — `chore: extend resident-pwa structure for flow map v7`
- `6815e99` — `chore: scaffold repository structure`
This indicates that the resident app is still in an active, structured prototype stage rather than a mature multi-release product. The app has a fairly comprehensive UI but not yet a long-lived production history.

## Part H: Gaps and next steps

### 1) Known bugs, TODOs, and inconsistencies
- The app README explicitly calls out a live configuration issue: “The checked-in runtime config uses live mode” and notes that `useMock: true` enables demo fixtures for non-auth features (`apps/resident-pwa/README.md`).
- `apps/resident-pwa/src/features/auth/auth.client.js` warns: `resident_profiles is not available yet; using Supabase Auth profile metadata until the migration is applied.`
- `apps/resident-pwa/src/pages/beacon-add-to-circle/beacon-add-to-circle.js` warns: `Resident directory search is not connected yet. You can still invite someone using their phone contact.`
- `apps/resident-pwa/src/pages/reset-password/reset-password.js` sets `this._token = params.token || 'mock-reset-token';` — a placeholder/default token.
- `apps/resident-pwa/src/components/captcha-widget/captcha-widget.js` returns `mock-captcha-verified-token-` values; clearly not production validation.
- Browser page snapshots show runtime errors: failed CORS requests to `news-list` and `surveys-list`, plus a Beacon permission warning (`TypeError: Cannot set properties of undefined (setting 'onchange')`).
- `packages/offline-queue/src/queue.js` is in-memory only; it is not durable. This is a strong limitation for offline-first reliability.
- `supabase/config.toml` is empty (zero bytes), so there is no visible function or project configuration file in place.

### 2) What is missing for a production-ready launch
- Correct Supabase deployment and stable CORS configuration for Edge Functions.
- Production verification of all app data flows: news, surveys, reports, lifeline, beacon requests, and account management.
- Removal or gating of demo/mock data and mock tokens.
- Durable offline queue persistence and sync reconciliation.
- Real push notification support and permission flow.
- Server-side enforcement for any additional RBAC not covered by the SQL migrations.
- Deployment config and hosting target (not found in the repo).
- Security review and production hardening on auth, storage, and scope controls.

### 3) Technical debt and risks
- UI breadth is high, but backend completion is uneven. This creates a strong risk of “looks finished” product experiences that fail in real data or live deployment.
- Several features are clearly script-generated or not fully wired, especially resident directory search, mock tokens, and startup configuration.
- There are many route/page files but no visible full end-to-end deployment pipeline or environment control in the checked-in repo.
- The app uses localStorage and sessionStorage for some Beacon state and a few in-memory stores; that is workable for a demo but not robust enough for production if long-lived or sensitive data is stored.

### 4) Prioritised next steps (top 10)
1. Fix the live CORS and Supabase function configuration, then re-test traffic to `news`, `surveys`, and other Edge Function calls. Effort: M.
2. Remove mock/reset/captcha placeholders and replace them with real production flows or gated demo-only modes. Effort: S–M.
3. Replace in-memory offline queue with a durable queue (IndexedDB or similar) and implement resend/sync logic. Effort: M.
4. Fully wire resident directory search and contact invitation flows to a real backend or server-validated lookup. Effort: M.
5. Verify and complete the `resident_profiles` migration and ensure all sign-up and update flows are working against real profiles. Effort: S–M.
6. Add production-safe push notification permission flow and notification backend support. Effort: M–L.
7. Review and expand server-side authorization beyond current RLS to cover all app features that touch protected data. Effort: M.
8. Add a real deployment configuration and release pipeline (host, build, environment variables, health checks). Effort: M.
9. Clean up inconsistent placeholder pages and route definitions for account/data export/deletion flows. Effort: S–M.
10. Add end-to-end smoke tests for the real resident journeys (signup, report submit, beacon share, lifeline card save) against a test Supabase project. Effort: M.

### 5) Open questions the code could not answer
- What is the real production hosting environment for the resident PWA and which domain(s) will it use?
- Is a real Supabase project already provisioned and configured for this app, or is the repo still expected to be connected after a handoff?
- Are the app’s “report” and “news/survey” backend functions already deployed and CORS-enabled, or are they not yet live?
- What is the final scope for resident feature parity: is the app meant to be a full civic platform, or just a pilot PWA for a limited geographic region?
- Which data points are considered sensitive enough to require additional privacy review beyond the existing RLS policies?

## Final assessment
The resident PWA is visually rich, feature-dense, and functionally structured like a serious civic-service product. The front-end surface area is large and the UX is coherent. But for a real resident launch, the code still depends heavily on working backend config, CORS, and data migration setup. The app is not simply “not finished”; it is a well-scaffolded pilot with a strong design foundation and a substantial amount of code, but it still needs a production backend and complete integration work before it can be trusted with actual resident data or public traffic.
