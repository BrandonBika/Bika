# Beacon design proposal

Evidence labels:
- Checked this session = read directly in repository files, live staging metadata, or official documentation during this revision.
- Design recommendation = proposed future behavior, not current implementation.
- Unknown = not exposed by the read-only sources available during this revision.

## Step 0: read-only checks performed and blockers

All staging queries below used `npx supabase` against project ref `gnwaaedtofazlkjkurea`. Queries selected counts and catalog metadata only; no row contents, phone numbers, tokens, or secret values were requested or shown. CLI reads were read-only.

### Current staging counts and metadata (checked 14 October 2026)

| Table | Row count | Current RLS policies | Table grants for `anon` / `authenticated` |
|---|---:|---|---|
| `beacon_contacts` | 1 | Authenticated owner-only SELECT, INSERT, UPDATE, DELETE (`auth.uid() = owner_id`) | No `anon` grants; `authenticated` SELECT, INSERT, UPDATE, DELETE |
| `beacon_sessions` | 1 | Service-role-only `ALL` policy | No `anon` or `authenticated` grants; `service_role` retains all table privileges |
| `beacon_location_points` | 0 | Service-role-only `ALL` policy | No `anon` or `authenticated` grants; `service_role` retains all table privileges |
| `lifeline_cards` | 1 | Authenticated owner-only SELECT, INSERT, UPDATE, DELETE (`auth.uid() = owner_id`) | No `anon` grants; `authenticated` SELECT, INSERT, UPDATE, DELETE |
| `resident_profiles` | Not requested for count | Authenticated owner-only SELECT and UPDATE policies | No `anon` grants; `authenticated` SELECT and UPDATE on `full_name`, `phone`, `address`, `report_status_updates_sms`, `community_safety_alerts`, `ward_councillor_bulletins`, and `beacon_circle_requests` |
| `consents` | Not requested for count | Authenticated own-row SELECT, INSERT, UPDATE; service-role ALL | No `anon` grants; `authenticated` SELECT, INSERT, and UPDATE only for `revoked_at` |

`postgres` and `service_role` have administrative/table-owner privileges as appropriate; those are not client grants. The privilege hardening migration in [supabase/migrations/20261012000100_privilege_hardening.sql](../supabase/migrations/20261012000100_privilege_hardening.sql) removes client privileges on the old WhatsApp Beacon tables and constrains `resident_profiles` updates.

- Checked this session: `supabase_realtime` currently publishes no public tables (catalog result `[]`).
- Checked this session: `npx supabase functions list` did not list `beacon-route`; it is **not deployed** to the queried staging project. Source exists at [supabase/functions/beacon-route/handler.js](../supabase/functions/beacon-route/handler.js).
- Checked this session: `npx supabase secrets list` returned no `BEACON_*` names. The CLI output was filtered to names only; values were not displayed. The source references `BEACON_GEOCODER_URL`, `BEACON_ROUTING_URL`, and optionally `BEACON_ROUTING_PROFILE` in [supabase/functions/beacon-route/handler.js](../supabase/functions/beacon-route/handler.js).
- Unknown: which Auth providers are enabled on staging, whether Phone sign-in is enabled, and which SMS provider is configured. These settings are exposed through the Supabase Auth dashboard/Management API, not by the SQL catalog query or the read-only CLI commands used here; they were not queried.
- Checked this session: Supabase’s current Phone Login documentation says hosted projects enable phone auth in Auth Providers and require an SMS provider, and documents configurable local-development Auth settings. It also says the default OTP request interval is 60 seconds and default expiry is one hour: [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login), [Supabase CLI config](https://supabase.com/docs/guides/local-development/cli/config).
- Unknown: whether staging has test phone numbers or static OTP mappings configured. The CLI reads performed here do not expose hosted Auth provider/test settings, so staging testability cannot be confirmed without inspecting the Auth dashboard or Management API.

The only data reported from the live tables are counts and policy/grant metadata; no personal data was selected.

## Baseline from the current code

This design intentionally builds on the inventory in [docs/beacon-inventory.md](./beacon-inventory.md) and the current repo behaviour in these files:
- Route registration: [apps/resident-pwa/src/router.js](../apps/resident-pwa/src/router.js)
- Beacon home and share flow: [apps/resident-pwa/src/pages/beacon-home/beacon-home.js](../apps/resident-pwa/src/pages/beacon-home/beacon-home.js), [apps/resident-pwa/src/pages/beacon-start-confirm/beacon-start-confirm.js](../apps/resident-pwa/src/pages/beacon-start-confirm/beacon-start-confirm.js), [apps/resident-pwa/src/pages/beacon-share-session/beacon-share-session.js](../apps/resident-pwa/src/pages/beacon-share-session/beacon-share-session.js)
- Client-side state: [apps/resident-pwa/src/features/beacon/beacon.client.js](../apps/resident-pwa/src/features/beacon/beacon.client.js)
- Stored contacts schema: [supabase/migrations/0029_beacon_contacts.sql](../supabase/migrations/0029_beacon_contacts.sql)
- Resident profile schema: [supabase/migrations/0028_resident_profiles.sql](../supabase/migrations/0028_resident_profiles.sql)
- Lifeline card schema: [supabase/migrations/0030_lifeline_cards.sql](../supabase/migrations/0030_lifeline_cards.sql)
- Current phone normalization behavior in app: [apps/resident-pwa/src/features/auth/auth.client.js](../apps/resident-pwa/src/features/auth/auth.client.js)

## 1. Architecture decision summary

Evidence: Phone sign-in and phone-change flows checked this session in [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login). The architecture below is a design recommendation.

The repository currently proves that the app is a resident PWA with local-only Beacon state and a route helper, but no real end-to-end circle-sharing pipeline. The design below is therefore a real product design that intentionally does not preserve the simulated behavior from the old app.

We will build a verified-phone system where:
- Phone verification is required before a user can be discoverable, invite, accept, chat, or share location.
- Discovery is exact-match on a canonical verified number only.
- Circle membership is accepted explicitly and state is stored in dedicated relational tables.
- Each share session has an owner, recipients, a finite expiry, and the latest position only.
- Realtime is used for in-app delivery; SMS and push are later phases.
- The old `wa_id` tables are left in place and untouched; they are kept for the paused WhatsApp flow and not repurposed for resident Beacon.

## 2. Recommendation: identity model

Design recommendation; platform limitations cited from documentation checked this session.

### Options evaluated

1. Supabase Auth phone authentication only
   - Checked this session: Supabase documents phone OTP sign-in via `signInWithOtp` and verification via `verifyOtp`: [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login).
   - Strength: simple, server-supported, no custom SMS infra needed for the initial OTP.
   - Weakness: phone auth alone does not give a product-level “verified number is active and linked to the current account” record for search/discoverability, number changes, and handoff logic. A separate product record is still useful.

2. `auth.updateUser({ phone })` + OTP verification
   - Checked this session: Supabase documents setting a phone with `updateUser({ phone })` and verifying the phone change using `verifyOtp` with type `phone_change`: [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login).
   - Strength: native, supported, good for number change flows.
   - Weakness: this is still phone-auth state, not product-specific consent or discoverability. We likely still need a `verified_numbers`/`profiles` record to manage small product rules.

3. Custom OTP table with SMS provider
   - Design recommendation: this would be a custom mechanism, duplicating OTP and verification responsibilities already handled by Supabase Auth.
   - Strength: maximum control, especially if we need provider choice, custom templates, or a custom dispatch infrastructure.
   - Weakness: duplicates authentication concerns, increases operational burden, and requires custom SMS provider integration, rate limits, retries, fraud controls, and support tasks. It is not the preferred default for a product that already has Supabase Auth.

### Recommendation

Use Supabase Auth as the source of truth for phone verification. Do not create a duplicate `user_phone_verifications` or `verified_phone_numbers` table.

Design:
- Trust only `auth.users.phone` when `phone_confirmed_at IS NOT NULL`. Read it server-side in the exact-match lookup; do not copy its verification state into a client-writable public table.
- Only the Supabase Auth verification flow may set `phone_confirmed_at`. Clients may request a phone change and submit the OTP, but no Beacon client receives INSERT/UPDATE privileges on any phone-verification state. Do not expose an RPC that lets a caller set a verified flag.
- For a user who already has an email/password account: while signed in, normalize and submit the new number with `supabase.auth.updateUser({ phone: phoneE164 })`; present the received code; verify using `supabase.auth.verifyOtp({ phone: phoneE164, token, type: 'phone_change' })`. The account remains the same Auth user. Enable Beacon capabilities only after reloading/confirming that Auth now reports the phone as confirmed. If the number is already linked to a different Auth user, stop and present a generic support/recovery path; do not merge accounts automatically.
- A user may have one current Auth phone number; historical number history is not a Beacon table. Number changes take effect only after Auth confirms the new number. Discovery uses only the current confirmed number.
- Before a number change is confirmed, existing circles remain linked to the account ID, not the phone. On confirmation, expire outstanding lookup handles and pending invites targeted through the prior number; accepted circles remain attached to the same account. A recycled number can discover the account only after the new holder verifies it and the current owner has opted in.

### SMS provider and current price check

Prices checked 14 October 2026; amounts below are USD unless the provider page says otherwise.

| Provider/page checked | South Africa SMS price | South Africa verification price | Notes |
|---|---:|---:|---|
| Twilio SMS, [South Africa price page](https://www.twilio.com/en-us/sms/pricing/za) | **Unknown** from the current page content retrieved in this session; page is usage-based and its rate table was not exposed in the retrieved text | Not a verification product price | Do not treat the generic SMS rate as an all-in delivered message cost; carrier fees and message segments may affect billing |
| Twilio Verify, [Verify pricing](https://www.twilio.com/en-us/verify/pricing) | **Unknown** for the South Africa SMS channel fee | **$0.05 USD per successful verification** base fee, plus applicable channel fees; not an all-in South African price | Pricing text checked 14 October 2026 |
| Vonage SMS / Verify | **Unknown** | **Unknown** | Official pricing page did not expose a usable South Africa rate during this check; not ranked |
| MessageBird/Bird SMS / Verify | **Unknown** | **Unknown** | Supabase lists MessageBird as an SMS provider, but the page retrieved redirected to general API docs; not ranked |
| TextLocal SMS | **Unknown** | **Unknown** | Supabase lists TextLocal as community-supported; no current South Africa rate or verification fee was retrieved; not ranked |

Supabase’s Phone Login guide lists Twilio, Vonage, MessageBird, and community-supported TextLocal as SMS provider options, but it does not establish which is configured on staging or provide provider rates. No provider is recommended yet. Compare a written, current South Africa quote for delivered SMS and the complete verification transaction (including channel fees, carrier surcharges, sender setup, and any minimums) before deciding. Price comparison is incomplete.

### OTP expiry, attempt limits, resend throttling

Checked this session: Supabase Phone Login states a default 60-second OTP request interval and one-hour expiry, but the same guide's verification example also says the code must be entered within 60 seconds. Treat this documentation inconsistency as a reason to confirm the effective Auth setting before launch; the staging value is unknown. Use Auth/provider-supported attempt protections, CAPTCHA and rate limits. Design recommendation: configure a short OTP lifetime where supported, a bounded verification-attempt count, per-number and per-IP resend throttles, and temporary lockout after repeated failures. Do not assume custom OTP limits can be enforced by changing a Beacon table; Auth remains the verifier.

### Number changes, recycled numbers, and released numbers

Design recommendation:

- Releasing or changing a verified number must not silently maintain prior circle membership. The product should:
  - require re-verification before the new number becomes active for search/invite.
  - use only the current Auth phone after its `phone_confirmed_at` is set; do not keep duplicate historical verification rows.
  - leave existing accepted circles intact only if the person is still the same user; when the new number replaces the old one, the account is re-bound to the new verified number and all old active invites are marked expired.
  - if a recycled number is later assigned to a different person, the old account is no longer discoverable by that number after its Auth phone changes; the new holder must verify it and separately opt in.
  - a non-verified number must never be used to show a user in a search result or to start a share.

### What happens to circles when a verified number is released or changed

Design recommendation:

- Circle members keep their accepted relationship to the user account, not to the raw phone string.
- The user account remains the same entity; the canonical phone is updated.
- Invite links sent to the old number are invalid once the number is revoked.
- If the old number is later reassigned to another person, the old account’s discovery key is the current confirmed Auth phone only; no stale copied phone mapping remains in Beacon.
- Blocks remain tied to the account record, not to the phone string.

## 3. Discoverability design

Evidence cited in the inventory; recommendations below are design choices.

Requirements from the brief:
- OFF by default.
- Users opt in to “findable by phone number”.
- Lookup is exact match on a normalised verified number only.
- No name search, partial match, or list results.
- The response must not reveal whether a non-opted-in number has an account.
- Rate-limit lookups per user and per IP.

### Current code baseline

- Current phone login and resident profile logic does not implement a verified discoverability model; it is still a generic registration flow plus account metadata. See [apps/resident-pwa/src/features/auth/auth.client.js](../apps/resident-pwa/src/features/auth/auth.client.js) and [supabase/migrations/0028_resident_profiles.sql](../supabase/migrations/0028_resident_profiles.sql).
- The current Beacon inventory explicitly says `searchResidents()` returns `[]` and that there is no matching between saved contact phone numbers and resident accounts at the client layer: [docs/beacon-inventory.md](./beacon-inventory.md).

### Recommended design

- Add `public.user_discovery_settings` with `user_id`, `findable_by_phone`, `updated_at`, `consent_version`, and `last_opt_in_at`. Keep IP hashes and rate counters in a private server-only table.
- `findable_by_phone` defaults to false.
- A lookup RPC checks only `auth.users.phone_confirmed_at IS NOT NULL` and the target’s `user_discovery_settings.findable_by_phone = true`.
- The RPC always returns the same response shape: an opaque `lookup_handle` and a minimal `display_name` field. For no account and for an account that is not opted in, `display_name` is null and the same generic continuation text is returned; response work/timing is padded similarly. For a discoverable verified match, the display name may be shown so the requester can identify the intended person, but the handle—not a user ID—is used for invite creation. No raw user ID, raw phone, or result list is returned.
- The server logs rate-limit metadata but never exposes it to the caller.
- The exact match is computed on E.164 only; no partial match or name match.
- Rate limits:
  - per user: N lookups per 10-minute window, exact value to be set by product.
  - per IP: lower cap, to prevent bulk enumeration and tolling.
  - all lookup attempts are counted by one RPC and throttled before any DB lookup.

## 4. Circle model and invite flow

Design recommendation.

### Core rules

- Invite is created by one verified user for another verified user.
- The invite is accepted only by the recipient using explicit acceptance.
- Before acceptance, the invite hides everything beyond the minimal details needed to decide: the inviter’s display name and the invite reason if relevant; no full profile, no live location, and no history.
- A blocked person receives no block row, event, status, or block-specific error. A read returns the same empty/unavailable result as no accessible relationship. A refreshed view may no longer show inaccessible content; no design can erase content already cached or guarantee that someone who already knew the relationship cannot infer a change.
- Either side may leave or block a circle at any time.

### Data model

`public.circle_invites`
- `id uuid pk`
- `inviter_id uuid not null references auth.users(id)`
- `recipient_id uuid not null references auth.users(id)`; never store a raw recipient phone number
- `status` enum: `pending`, `accepted`, `declined`, `expired`, `revoked`
- `created_at`, `updated_at`, `expires_at`
- `message` text null, with strict length cap and no location/profile fields
- unique pending invite on `(inviter_id, recipient_id)` (partial unique index where pending)
- `recipient_id` is assigned only by a server-side invite operation resolving a short-lived opaque lookup handle; clients cannot submit arbitrary user IDs or recipient phone values.
- Enforce the maximum of 10 accepted memberships per account in the acceptance RPC under a per-user lock/transaction, so concurrent accepts cannot exceed the cap.
- The sender sees only neutral wording: “If this number is on Beacon and findable, they'll receive your invite”; the sender is never told whether the number matched.

`public.circle_memberships`
- One **symmetric, undirected relationship row** per pair, created only after invite acceptance.
- `user_low uuid not null references auth.users(id)` and `user_high uuid not null references auth.users(id)`, with `user_low < user_high` enforced by a CHECK constraint.
- `status` enum: `accepted`, `left`; plus `accepted_at`, `ended_at`, `ended_by`, `created_at`, `updated_at`.
- Unique constraint `(user_low, user_high)` guarantees at most one row per unordered pair. On re-acceptance, update the existing row; do not insert a reversed duplicate.
- A left relationship is no longer accepted, and either participant may re-invite only after applying invite limits. Blocking is kept in a separate directional table rather than overloading membership status.

`public.circle_blocks`
- `blocker_id uuid not null references auth.users(id)`, `blocked_user_id uuid not null references auth.users(id)`, `created_at`; CHECK blocker differs from blocked user; unique `(blocker_id, blocked_user_id)`.
- This is a private enforcement record. Only the blocker can read their own block settings. The blocked account cannot read the block row, any block status, block reason, or block event; operations return the same generic unavailable/absent response used for no match. Never send a “you were blocked” notification or expose the blocker’s identity through a block record.
- Absolute invisibility of a block cannot be guaranteed after the other person has already seen the relationship: revoking access means refreshed lists/threads may no longer contain accessible content. The security guarantee is no explicit block disclosure, no block-specific response, and no access to the blocker’s current data; a client that cached prior content may retain it.

### Opaque exact-match lookup and server-only abuse controls

Design recommendation:
- A lookup accepts one canonical E.164 input and may query only `auth.users.phone` where `phone_confirmed_at IS NOT NULL`, plus the target’s discoverability preference.
- Return the same response shape for a match, no account, and a non-discoverable account: an opaque, random, short-lived `lookup_handle` plus the same neutral instruction to continue or report “no match.” Never return `auth.users.id`, raw phone, or a result list.
- For a real eligible match, a server-only handle row binds the random handle to the target user ID, requester ID, expiry, and one-use state. For no match, create an indistinguishable decoy handle with no target. The invite endpoint resolves handles only on the server, consumes them atomically, and returns the same generic unavailable response if invalid, expired, already used, undiscoverable, blocked, or no-match.
- Apply comparable work to both paths and avoid account-specific errors. Exact equality of network timing cannot be guaranteed; use a fixed minimum response window with small jitter and monitor distributions. No user-readable table stores requester IP hashes, rate counters, or lookup outcomes.
- Put hashed IP metadata and rate-limit counters in a separate server-only schema/table (for example `private.beacon_abuse_limits`), with RLS enabled, no privileges for `anon` or `authenticated`, and access only to a narrowly scoped server function/role. Retention should be short and documented. Do not put these fields on user-readable discovery settings or `public.consents`.

## 5. Live location sharing design

Design recommendation.

### Requirements from brief

- Only to accepted members the owner selects per session.
- Time-limited; hard maximum 4 hours.
- Stoppable instantly by owner.
- Any recipient can hide or leave.
- Persistent “sharing is on” indicator.
- Need honest behavior for backgrounding/locks: browsers cannot guarantee background geolocation without app install state and OS rules.
- No stale dot masquerading as live.

### Data model

`public.location_sessions`
- `id uuid pk`
- `owner_id uuid references auth.users.id`
- `status` enum: `active`, `expired`, `stopped`, `revoked`
- `mode` enum: `live`, `route` (if path-sharing is later built)
- `started_at`, `ended_at`, `expires_at`
- `hard_stop_at` not null = started_at + 4h
- `owner_can_stop bool default true`
- `created_at`, `updated_at`

`public.location_session_recipients`
- `id uuid pk`
- `location_session_id uuid references public.location_sessions.id`
- `recipient_user_id uuid references auth.users.id`
- `status` enum: `accepted`, `revoked`, `left`, `blocked`
- `added_by`, `accepted_at`, `updated_at`
- unique on `(location_session_id, recipient_user_id)`

`public.location_session_current` (the only location storage table)
- `session_id uuid primary key references public.location_sessions(id) on delete cascade`
- `owner_id uuid not null references auth.users(id)`
- `latitude numeric(9,6) not null`, `longitude numeric(9,6) not null`
- `accuracy_m numeric(8,2)`, `captured_at timestamptz not null`, `updated_at timestamptz not null`
- Exactly one row per session; every new fix overwrites it in place. No append-only location table and no `location_points` table.

### History principle

Design recommendation.

The requirement says “store only the latest position per session, overwritten each update, deleted when the session ends or expires. No trail.”

Design:
- Each location update UPSERTs by `session_id`, replacing the prior coordinates and capture timestamp.
- Stop deletes the current row immediately and closes the session. A cleanup job deletes expired sessions; `ON DELETE CASCADE` deletes recipients and the current-position row.
- `beacon_location_points` is the legacy WhatsApp table, not a destination for this design. Do not repurpose or alter the WhatsApp schema.

### Expiry cleanup and access before cleanup

Design recommendation:
- Enable Supabase Cron (`pg_cron`) and schedule a narrowly scoped `SECURITY DEFINER` cleanup function once per minute. It deletes `location_sessions` with `expires_at <= now()` or terminal status; cascading foreign keys delete recipient rows and `location_session_current`. Make the function idempotent, restrict EXECUTE to the scheduler/admin role, and monitor failures with alerting and retry. Supabase documents scheduled SQL/functions and HTTP invocation through Cron: [Supabase Cron](https://supabase.com/docs/guides/cron) (checked this session).
- This provides eventual physical deletion if the scheduler is operating; it does not prove a scheduled job can never fail. Alerting and retry are required.
- RLS must require `status = 'active' AND expires_at > now()` on every read of session metadata and `location_session_current`, as well as owner or a recipient whose session-recipient row is active, whose symmetric circle membership is accepted, and where neither direction is blocked. The current-position SELECT policy must check the parent session; row existence alone never grants access. Thus authorization ends at expiry even if cleanup has not run.
- The session-creation RPC enforces `expires_at <= started_at + interval '4 hours'`; it does not trust client-supplied expiry.

### Backgrounding and app close behavior

The browser-controlled Geolocation API and iOS Web Push constraints mean a PWA cannot promise continuous GPS updates while backgrounded, locked, suspended, or closed. Web Push does not make background GPS reliable. When updates stop, show “Last updated …” and never present an old point as live. Sources checked this session: [W3C Geolocation API](https://www.w3.org/TR/geolocation/#watchposition-method) and [WebKit iOS/iPadOS Web Push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### Revocation transport decision: polling RPC vs per-session Realtime

Design recommendation: use an authenticated RPC to read recipient position, polled every 5 seconds; do not send coordinates over Realtime.

- Each RPC call rechecks the authenticated user, active session status, `expires_at > now()`, accepted circle membership, recipient authorization, and both block directions before returning the one current coordinate.
- On stop, revoke, leave, or block, the next successful RPC denies access. With a healthy connection and foreground app, the 5-second poll interval plus network/processing latency bounds when the UI learns about it; it is not an absolute end-to-end guarantee. Clear the coordinate on denial and treat a missed freshness threshold as stale.
- Supabase Realtime private-channel authorization is RLS-based, but a joined channel may retain authorization until token refresh/reconnection. It is therefore a weaker fit for rapid revocation of sensitive coordinates. Use Realtime for chat only; no per-session location topic carries coordinates.
- We cannot make a recipient forget coordinates already delivered, or guarantee revocation during network loss/background suspension. A disconnected recipient view is unavailable/stale, not proof that data already received has been erased.

## 6. Data model and schema design

Repository evidence is cited below; schema is a design recommendation.

This design should be implemented on top of the existing resident profile and contact models, not by reusing the older WhatsApp `wa_id` tables. The old tables are still in the repo as staging inventory data and should remain untouched for the paused WhatsApp flow. See [docs/app-data-inventory.md](./app-data-inventory.md), [supabase/migrations/0028_resident_profiles.sql](../supabase/migrations/0028_resident_profiles.sql), [supabase/migrations/0029_beacon_contacts.sql](../supabase/migrations/0029_beacon_contacts.sql).

### A. Tables to add

`public.user_discovery_settings`
- `user_id uuid primary key references auth.users(id) on delete cascade`
- `findable_by_phone boolean not null default false`
- `updated_at timestamptz not null`, `last_opt_in_at timestamptz`, `consent_version text`
- RLS: only the owner can read/update; lookup reads it server-side. No other account can enumerate opt-in state.
- Do not store lookup IP hashes or rate counters here; those belong in the server-only abuse-control table described above.

`public.circle_invites`
- as above

`public.circle_memberships`
- as above

`public.circle_blocks`
- as above

`public.location_sessions`
- `id uuid primary key`, `owner_id uuid not null references auth.users(id)`
- `status` (`active`, `stopped`, `expired`), `started_at`, `expires_at`, `ended_at`, `created_at`
- Server enforces `started_at < expires_at <= started_at + interval '4 hours'`; default duration is 1 hour.

`public.location_session_recipients`
- `session_id uuid references public.location_sessions(id) on delete cascade`
- `recipient_id uuid references auth.users(id)`, `status` (`active`, `revoked`, `left`), `added_at`, `revoked_at`
- Primary/unique key `(session_id, recipient_id)`; recipient must be a verified user in the accepted, unblocked circle.
- Recipient “hide” is local UI state and stops that client polling; “leave” is a server-side state transition that revokes future reads. Neither action ends the owner’s session for other recipients.

`public.location_session_current`
- `session_id uuid primary key references public.location_sessions(id) on delete cascade`
- `owner_id uuid not null references auth.users(id)`
- `latitude numeric(9,6) not null`, `longitude numeric(9,6) not null`
- `accuracy_m numeric(8,2)`, `captured_at timestamptz not null`, `updated_at timestamptz not null`
- One overwritten row per session; no history.

`public.chat_threads`
- `id uuid primary key`, `user_low uuid`, `user_high uuid` referencing `auth.users(id)`, CHECK `user_low < user_high`
- `status` (`active`, `closed`), `created_at`, `updated_at`, `closed_at`
- Unique `(user_low, user_high)`; creation RPC canonicalizes order and checks accepted membership plus no blocks.

`public.chat_messages`
- `id uuid primary key`, `thread_id uuid references public.chat_threads(id) on delete cascade`
- `sender_id uuid references auth.users(id)`, `body text not null` with a server-enforced length cap
- `message_type` limited to `text` and trusted `system`; `created_at timestamptz`, `deleted_at timestamptz`
- Index `(thread_id, created_at)` and retention index on `created_at`.
- Retention is controlled by configurable service setting `beacon_chat_retention_interval`, applied by scheduled cleanup. Exact interval remains undecided; show users the current period before chat. Do not claim the user chooses it in account settings.

Do not create `public.consent_records`. Reuse and extend `public.consents`, described in the Consent section below.

`private.beacon_lookup_handles` (server-only)
- `handle_hash bytea primary key`, `requester_id uuid`, `target_user_id uuid null`, `expires_at timestamptz`, `consumed_at timestamptz`, `created_at timestamptz`
- Stores a hash of a high-entropy opaque handle, not the raw handle. No client role has schema/table privileges.

`private.beacon_abuse_limits` (server-only)
- Hashed requester IP, requester/account key, action, window start, counter, expiry.
- No user-readable policy or client grants; used only by server-side lookup/invite endpoints and cleanup.

`public.beacon_reports`
- `id uuid primary key`, `reporter_id uuid not null references auth.users(id)`, `reported_user_id uuid not null references auth.users(id)`, optional `thread_id uuid`, `reason_code text`, bounded `description text`, `created_at timestamptz`, `status text`.
- Reporter may insert and read only their own report; reported user has no access. A trusted moderation role may read/process reports. Never expose the block record or report status to the reported account.

Required constraints/indexes:
- `circle_memberships`: CHECK `user_low < user_high`; unique `(user_low, user_high)`.
- `circle_blocks`: unique `(blocker_id, blocked_user_id)` and CHECK blocker differs from blocked.
- `circle_invites`: recipient/status/expiry index for pending inbox; partial unique pending invite on `(inviter_id, recipient_id)`.
- `location_sessions`: indexes `(owner_id, status, expires_at)` and `(status, expires_at)` for owner views and cleanup.
- `location_session_recipients`: primary/unique `(session_id, recipient_id)` and recipient/status index.
- `location_session_current`: session ID primary key and coordinate range checks.
- `chat_threads`: canonical pair CHECK and unique pair constraint.
- `chat_messages`: thread/time index plus created-time retention index.
- All client-facing tables enable RLS. `anon` has no Beacon grants. Authenticated grants are limited to explicit SELECTs and narrowly scoped RPC EXECUTE; direct client DML cannot change invite, membership, session, recipient, or message state. `private` tables grant nothing to `anon` or `authenticated`.

### B. Existing tables to reuse

- `public.resident_profiles` remains the resident-facing profile. Its `phone` field is legacy profile data, not verification evidence; Beacon trusts only `auth.users.phone` with non-null `phone_confirmed_at`. Current owner-only policies and hardening are defined in [supabase/migrations/0028_resident_profiles.sql](../supabase/migrations/0028_resident_profiles.sql) and [supabase/migrations/20261012000100_privilege_hardening.sql](../supabase/migrations/20261012000100_privilege_hardening.sql).
- `public.beacon_contacts` remains for user-saved contact addresses, but we should not use it as the source of truth for verified user lookup. It is currently explicit-contact data and owner-scoped in [supabase/migrations/0029_beacon_contacts.sql](../supabase/migrations/0029_beacon_contacts.sql).
- `public.lifeline_cards` remains out of scope for Beacon and should not duplicate the same contact data; it is an emergency call list, not a circle graph, in [supabase/migrations/0030_lifeline_cards.sql](../supabase/migrations/0030_lifeline_cards.sql).

### C. Old wa_id Beacon tables: reuse, replace, or leave untouched

Legacy-table description is cited to the baseline inventory; handling is a design recommendation.

Current repo evidence shows `beacon_sessions` and `beacon_location_points` are keyed by `wa_id` and appear tied to a WhatsApp-era flow, not the resident PWA. That is explicitly recorded in [docs/app-data-inventory.md](./app-data-inventory.md) and the old migration naming indicates a paused WhatsApp flow. We do not alter or drop them because the requirement says not to touch anything WhatsApp-related.

Recommendation:
- Leave the old `wa_id` tables untouched for the paused WhatsApp flow.
- Build real resident Beacon on new `location_sessions`, `location_session_recipients`, and `location_session_current` tables.
- Do not repurpose `beacon_sessions` or `beacon_location_points` for resident Beacon; do not drop or alter either WhatsApp-related table.

## 7. Phone normalization and migration plan

The current flaw is cited to the baseline inventory; normalization rules are design recommendations.

### Canonical format

- Use E.164 as the canonical format for all lookups and storage.
- South Africa rules:
  - `+27` is canonical. For a valid South African national number entered with the domestic trunk `0`, remove that one leading `0` and prepend `+27` (for example, `082 123 4567` becomes `+27821234567`).
  - `0027` is accepted as an international dialing alias and converted to `+27` before parsing (for example, `0027 82 123 4567` becomes `+27821234567`).
  - Strip presentation spaces, parentheses, and hyphens only; validate with a maintained numbering library. Do not accept multiple `+`, extensions, impossible lengths, or ambiguous international input without an explicit country selection.
  - Store the canonical E.164 value in `beacon_contacts.phone_normalized` when migrating existing saved contacts. Do not equate “digits only” with valid E.164.

### Current flaw to fix

- The inventory documents that current normalization can leave `+27 82...` and `082...` as different stored values; see [docs/beacon-inventory.md](./beacon-inventory.md) and [apps/resident-pwa/src/features/auth/auth.client.js](../apps/resident-pwa/src/features/auth/auth.client.js).
- Design recommendation: normalize valid South African input once to E.164 before storage/matching, including `+27`, local `0`, and `0027`; use a maintained numbering library rather than a hand-written length-only check. Reject invalid country codes, impossible national lengths, extensions, multiple plus signs, and ambiguous international values unless a country selector is supplied.

### Migration of existing beacon_contacts rows

- Read, rewrite, and backfill all `phone_normalized` values into E.164 using a migration script that normalizes all rows and updates duplicates by de-duping against the canonical value.
- If duplicate numbers exist under multiple raw values, keep the most recent row per canonical number and migrate older duplicates to `unlink`/`merged_from` or a historical archive table, but do not silently drop the user’s contact without a decision record.
- Preserve the original raw phone string for display if required, but never use it for matching.

## 8. Security model and RLS

RLS and privilege model below is a design recommendation informed by the current migration and staging metadata.

### Principles

- `anon` has no Beacon or circle privileges.
- `authenticated` can read and write only their own records or rows where a policy explicitly grants access.
- `service_role` is used only for internal admin tasks; not exposed to clients.
- Realtime access must use `private` channels and policies checked against the same RLS rules as the relevant tables.

### Required RLS behaviors (in words)

Phone verification (Supabase Auth)
- No public `user_phone_verifications` table. Supabase Auth is the source of truth (`auth.users.phone` and `phone_confirmed_at`).
- Clients cannot INSERT or UPDATE Auth verification state through a public table or RPC. Phone changes and OTP submission go through Supabase Auth; only Auth sets its confirmation fields.

`user_discovery_settings`
- Users can read and update only their own row.
- No other user can enumerate or read opt-in settings.

`circle_invites`
- The inviter may read their own outgoing invite metadata. A recipient can read a pending invite addressed to them, limited to inviter display name and invitation text. No phone, location, profile details, or inviter circle data are exposed.
- Create invites only through a server-side operation which resolves and consumes a valid opaque lookup handle, verifies both parties, checks no block exists, and applies per-user/IP limits. Clients cannot insert arbitrary `recipient_id` or phone strings.
- Recipient can accept/decline; inviter can revoke; server handles expiry. A blocked relationship returns the same generic unavailable result and exposes no invite row or changed state to the blocked person.

`circle_memberships`
- One undirected row per pair, canonicalized by `user_low < user_high`, unique `(user_low, user_high)`. Both parties can read the accepted relationship unless a block exists.
- Membership creation and state transitions occur through an RPC after recipient acceptance. A client cannot manufacture or reverse a duplicate pair.
- Either participant can leave; that ends the pair relationship. The blocked party cannot read this row or distinguish block from unavailable/absent state.

`circle_blocks`
- Only the blocker can read their own block record. The blocked user has no SELECT policy and receives no block event, block identifier, or changed relationship response.
- All invite, chat, membership, lookup-handle resolution, and location read operations check both block directions server-side. A blocked caller sees the same generic “unavailable” behavior as no result; the blocker gets confirmation in their own UI.

`location_sessions`
- Owner may read their session; recipients access only through the guarded position RPC when their recipient row is active, the circle pair is accepted, neither direction is blocked, `status = active`, and `expires_at > now()`.
- All create/stop/revoke/expiry state changes use constrained SECURITY DEFINER RPCs. Direct client INSERT/UPDATE/DELETE is not granted.

`location_session_recipients`
- Owner can see their selected recipient list; each recipient can see only their own active participation metadata. A blocked user cannot read rows or infer revocation.
- Insert/revoke/leave is RPC-only; server verifies current accepted membership and verified phone at session start. No direct client writes.

`chat_threads`
- A thread is created only by an RPC after checking both users are verified, have an accepted symmetric membership, and are not blocked in either direction. Only those two participants may read while the circle remains accepted and unblocked.
- Unique canonical pair `(user_low, user_high)` prevents duplicate threads. Thread creation is unavailable after leave/block until a new accepted circle exists.

`chat_messages`
- A participant may read and send only while the pair is accepted and unblocked and the thread is active. A message insert checks `sender_id = auth.uid()`, thread participation, membership, and both block directions; system messages are inserted only by a trusted server role.
- On leave, close the thread, deny further sends, and hide the thread from the ordinary chat list; retain messages only until the configured retention deadline, then delete. On block, immediately deny the blocked party all thread/message reads and writes (generic absent/unavailable result); also close the thread for both parties. The blocker can still access their own block/report controls, not the blocked user’s current activity.

### Realtime authorisation

Realtime authorization documentation was checked this session; recommendations follow.

- Checked this session: Supabase documents private channel authorization through RLS on `realtime.messages`: [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).
- Design recommendation: create a private thread channel for chat; its policy checks current accepted membership and both block directions. Do not create a per-session location channel carrying position data.
- Do not use public channels for location or chat.
- Chat channel authorization can remain stale for an already-joined subscription until token refresh/reconnection; membership and block changes must close the thread and trigger client unsubscribe/refresh. Location avoids this ambiguity by using the per-call RPC above.
- Persist messages in `chat_messages` and use a private Supabase Realtime channel for prompt in-app delivery. Without push, users who are offline or have closed the PWA receive no operating-system notification; messages load from the database when they return online/open the app. iOS Web Push requires a supported iOS/iPadOS version, Home Screen installation, and user permission, so it is explicitly out of the initial release.

### Security-definer functions and Edge functions

Design recommendation.

- Required security-definer processes:
  - exact-match lookup/opaque-handle issuance and one-use handle resolution for invites
  - `start_location_session()` for session creation, expiring stale sessions, and validating select recipients
  - `read_current_location()` to recheck authorization on each poll
  - `upsert_latest_location()` for in-place current-location writes only
  - `end_location_session()` and the scheduled expiry cleanup
  - `accept_circle_invite()`, `leave_circle()`, `block_user()`, and constrained chat-thread/message operations
- RPCs derive the caller from `auth.uid()`, fix `search_path`, validate every state transition, and have EXECUTE revoked from `PUBLIC`/`anon`; grant only authenticated where the function enforces identity, or scheduler/service role for maintenance.
- Edge functions should be used only for external SMS or provider calls and not for ordinary app logic.
- `anon` should never be able to call any Beacon route or lookup RPC.

## 9. Threat model: ranked risks and mitigations

Threat ranking and mitigations are design analysis, not implemented safeguards.

| Rank | Threat | Mitigation | Residual risk |
|---|---|---|---|
| 1 | Stalking / coercive use | Verify phone, explicit opt-in discoverability, active session only, 4h cap, session-owner controls, a small selected recipient set, no history, allow block/leave, no hidden forcing by design | Some risk remains if a person is physically coerced to share location |
| 2 | Phone-number spoofing and recycled numbers | Exact E.164 verified phone plus verification at each number change, current number must be active, revoke stale rows, no lookup by name | A victim may still be tricked into trusting a stale phone number if the old one is not immediately revoked |
| 3 | Enumeration | No partial match, no name search, no list results, identical “not found”/“not discoverable” response, rate limits | A determined attacker can still test known numbers with low-rate guesses |
| 4 | Harassment by invite | Invite approval flow, block, report, rate limits, no bulk sending from untrusted sources | Social manipulation remains possible |
| 5 | Minors / age risk | Require self-declaration that the user is at least 18; do not make minors discoverable by phone; obtain lawyer review | Self-declaration does not verify age; legal suitability is unresolved |
| 6 | Shared devices / unlocked phone | Session tokens are in memory only; app should support sign-out on device unlock and require re-auth for sensitive actions | Device compromise remains a major risk |
| 7 | Compromised account | MFA or strong reauth for sensitive actions; session revocation; location shutoff when account is lost | Some residual risk if the attacker has the device |
| 8 | Malicious recipients | Recipients only see active share if accepted, have hide/leave, and are blocked if the owner revokes them | A malicious user could still save a screenshot of a one-time location |
| 9 | Replay / stale location | Use session IDs, one overwritten current-position row, server-side expiry, and timestamp freshness checks | A compromised client can copy an already received coordinate |

## What this design cannot guarantee

- Background GPS on PWAs: browsers and mobile operating systems may suspend or stop location updates when the app is backgrounded, the phone is locked, or the app is closed.
- Recipient screenshots or copying: Beacon can stop future reads, but cannot retract a coordinate already displayed or prevent screenshots, photographs, or manual copying.
- Coerced sharing: consent screens and stop controls cannot prevent someone physically pressuring a user to verify, accept an invite, or start a session.
- A stolen unlocked phone or compromised active account: an attacker with an authenticated unlocked session may act as that user until the session is revoked or re-authentication is enforced.

## 10. Consent and POPIA design

Current consents schema/policies were checked this session; the extension is a design recommendation.

### Existing consent table: verified schema and extension design

Checked this session in staging and [supabase/migrations/20260919000000_core_reporting.sql](../supabase/migrations/20260919000000_core_reporting.sql): `public.consents` currently has `id uuid`, `user_id uuid`, `consent_type text`, `policy_version text`, `granted_at timestamptz`, `revoked_at timestamptz`, `created_at timestamptz`, and `updated_at timestamptz`.

Current staging policies:
- `consents_select_own`: authenticated SELECT where `user_id = auth.uid()`.
- `consents_insert_own`: authenticated INSERT where `user_id = auth.uid()`.
- `consents_revoke_own`: authenticated UPDATE where `user_id = auth.uid()`; the client grant is column-limited to `revoked_at`.
- `consents_service_role_all`: service-role ALL.
- No `anon` table grants; authenticated has SELECT and INSERT, and UPDATE only on `revoked_at`.

Do not add `consent_records`. Extend `public.consents`:
- Add nullable `resource_id uuid` to bind session-specific consent to a location session without storing coordinates or recipient phone numbers.
- Add a constraint/documented allowed vocabulary for `consent_type`, including `beacon_safety`, `phone_discoverability`, `live_location_session`, and `chat_retention_notice`; use `policy_version` for the exact copy/version shown.
- Keep `granted_at` database-generated and immutable for clients. Preserve own-row SELECT. Constrain INSERT to self and accepted consent types, preferably via an RPC that stamps `granted_at`; constrain client UPDATE to `revoked_at` only. No IP hash, user-agent hash, rate counter, or lookup outcome belongs in this user-readable table.
- Write one consent row per consent event. `resource_id` is the session ID for a session-start consent; discoverability consent is represented by its own event plus the current opt-in setting.

### Withdrawal

- A user can withdraw from discoverability at any time; the lookup RPC checks the current flag.
- A user can stop sharing immediately; location session is ended and the latest row is deleted.
- Chat retention is an app-level configurable setting; the period is undecided. Expiration cleanup deletes messages after the configured period, and leave/block stops access/sending as described in the chat section.
- On account deletion, revoke active sessions, delete current coordinates and owned Beacon rows, and apply a documented deletion/anonymisation rule for chat and consent records. Legal retention requirements need counsel; do not promise all consent evidence is erased automatically.

### Privacy policy points to include

- What data we collect: verified phone number, display name, circle membership, current location for an active session only, chat content for the configured retention period, consent version.
- What we never collect for this design: a full contact book, name-searchable user lists, unrelated phone numbers, or a long-term location trail. Server-only abuse controls may retain short-lived hashed IP/rate metadata as disclosed in the privacy notice.
- What we do not guarantee: persistent background geolocation in every browser or OS state.
- Where long-term retention does not apply: current-location history is deleted when the session ends.

This design acknowledges that legal compliance requires a lawyer and cannot be treated as a final legal conclusion; this is a product and engineering design, not legal advice.

## 11. Honest UX copy and flow

Repository behavior was checked this session; the future flow and copy below are design recommendations.

The existing app copy is mainly simulated and not trustworthy; the design below deliberately narrows to what the system can actually guarantee.

### Screen-by-screen flow

1. Verification screen
   - User enters phone number.
   - System sends OTP by SMS via Supabase Auth or a configured provider.
   - User enters the OTP.
   - App confirms verified.
   - Existing email-account users remain on the same account and add/verify a number through Auth `updateUser({ phone })` followed by `verifyOtp` with type `phone_change`; no duplicate Beacon verification record is created.

2. Discoverability opt-in
   - Explain that the user can be found by exact verified phone number only.
   - Toggle is off by default.
   - Require explicit acceptance and record the consent version.

3. Add contact / invite flow
   - User selects only an opaque result handle from exact verified-number lookup; invite creation resolves it server-side, never accepts a client-supplied user ID or phone.
   - Invite is pending until accepted.
   - The invite is in-app only; SMS invites are not part of this phase.

4. Accept invite
   - Recipient sees only the inviter’s first/display name and a neutral invite message needed to decide.
   - No full profile or location history is shown.
   - Accept or decline buttons only.

5. Circle screen
   - Shows accepted members and a short list of block/leave actions.
   - Only accepted members can chat or be chosen for a session.

6. Start session
   - User selects accepted members.
   - User confirms time-limited share and duration.
   - App shows a clear “share to X recipients for Y minutes” summary.
   - App records consent for the specific session.

7. Active share screen
   - Shows a live dot only while the session is active and updates are being received.
   - Shows a “last updated N minutes ago” state when a browser or network gap occurs.
   - Shows owner controls: stop share, end session, hide recipient.
   - Keep a prominent “Sharing is on” banner fixed in the app while the PWA is running, and restore it from server session state when reopened. Do not imply an OS-level indicator persists when the PWA is closed.
   - Recipient “hide” dismisses the share only on that device; “leave” revokes that recipient's server-side access. The owner’s session continues for other selected recipients.

8. Stop / block / report
   - Owner can stop instantly.
   - Recipient can leave or hide.
   - Block and report create private records for the acting user/server; the blocked party sees no block record, notification, or changed relationship state.

### Exact wording for consent and safety screens

These are designed to be honest, not aspirational.

Consent screen:
- “We use your verified phone number to identify your account and to send one-time codes for sign-in and account changes.”
- “If you turn on findability, your verified number can be used for exact-match lookup. We never show your phone number to another user.”
- “Location sharing is only sent to people you explicitly choose for a time-limited session.”
- “We store one current location for an active session. Access ends when the session stops or expires; scheduled cleanup deletes the stored point. We do not keep a route history.”
- “Beacon messages are stored for the retention period set by the service. That period is shown before you use chat and may change only with notice.”
- “We do not guarantee background location updates when the app is closed, the phone is locked, or the browser pauses geolocation.”

Safety screen:
- “Beacon is for time-limited location sharing between verified users in your accepted circle.”
- “If you turn on findability, your verified number can be used for exact-match lookup. We never show your phone number to another user.”
- “Only people you explicitly add to a session can see your latest location while the session is active.”
- “We store only the current location for an active session. Access ends when the session stops or expires; scheduled cleanup deletes the stored point.”
- “If the app is backgrounded, the browser is closed, or the phone is locked, updates may stop. We will show the last update time instead of pretending the location is live.”
- “You can stop sharing at any time. After the server accepts the stop, recipients cannot fetch new positions; a position already delivered cannot be taken back.”

This wording is intentionally modest and truthful in a way the current app copy is not.

## 12. Abuse and cost controls

Rate limits and safeguards below are design recommendations; SMS documentation was checked this session.

### Rate limits and abuse controls

- OTP sends: throttle by user and phone number; use provider-level and app-level limits.
- Invite sends: cap by user per time window and per live session.
- Lookup RPC: per user and per IP throttling, with hard failure after threshold.
- Message sends: per-thread and per-user caps; optional anti-spam warnings.
- Circle size: maximum 10 accepted other users; the owner is not counted as a circle member.
- Concurrent active sessions: maximum one active share per owner.
- Report and block actions: create private records immediately; never notify the blocked user that they were blocked or reveal the block record.

### Provider cost exposure

- Checked this session: Supabase Phone Login recommends adjusting Auth rate limits and configuring CAPTCHA to control SMS costs: [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login).
- Checked this session: Twilio Verify lists a $0.05 USD base fee per successful verification; South African SMS channel price is unknown from the retrieved page: [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing).
- The inventory cites environment-driven geocoding/routing at [supabase/functions/beacon-route/handler.js](../supabase/functions/beacon-route/handler.js); this revision's staging check found the function undeployed and no `BEACON_*` secret names returned.
- Design recommendation: route/geocoding would create provider costs if deployed. Do not use live until per-user/per-IP limits, normalized-query caching, and provider spend alerts are in place.

### Should `beacon-route` rate-limit and cache before live use?

Source noted in the inventory; this revision checked staging deployment/secrets. Recommendation:

- It must be rate-limited and cached before production use. Apply per-user and per-IP quotas, cache normalized geocode/route requests with bounded expiry, and configure provider budget alerts; exact thresholds follow the selected provider's quotas and product budget.

## 13. Testing plan

Design recommendation.

### RLS tests

- A client cannot insert or update any phone-verification status; only Supabase Auth can confirm `phone_confirmed_at`.
- A user cannot read another user’s discoverability settings.
- A non-accepted user cannot read a location session or current position.
- A revoked, expired, left, or blocked recipient’s next location RPC returns no position.
- A blocked user cannot invite or read the blocked thread.
- A recipient cannot read a session after expiry or stop.
- A non-owner cannot insert into location session recipients.
- A user cannot access a chat thread they are not in.

### Realtime chat tests

- A thread channel subscribes only when the user is a participant.
- Blocking closes the channel and denies reads/sends; test revocation after a live subscription as well as after reconnect.

### End-to-end scenario

- Two real phones, both verified.
- Phone A opts in to discoverability.
- Phone B looks up exact number on phone A.
- A invites B; B accepts.
- A creates a live share with B only.
- B polls position via RPC and receives a stale/unavailable state when updates pause.
- A stops the session; B sees it end and no longer receives updates.
- A blocks B; B cannot read or rejoin the thread or session.

## 14. Phased build plan

Design recommendation.

Phase 1 — Phone verification and normalization
- Verified phone OTP model
- Exact E.164 normalization and migration from raw numbers
- User profile fields for primary verified number
- Relative effort: small-to-medium

Phase 2 — Discoverability and lookup
- Discovery opt-in, exact match, stable RPC, rate limiting
- Relative effort: medium

Phase 3 — Circles and blocking
- Invites, acceptance, leave, block, report
- Relative effort: medium

Phase 4 — Chat
- Thread creation, Realtime RLS, system messages, retention policy
- Relative effort: medium

Phase 5 — Live location
- Session creation, recipient checks, current-location UPSERT, stale-state handling
- Relative effort: large

Phase 6 — Push and SMS later phases
- Not required for the first live feature
- Must be planned separately because of iPhone PWA push limits and cost exposure
- Relative effort: medium-to-large

## 15. Decisions confirmed and remaining open decisions

### Confirmed product decisions

- Maximum circle size: 10 accepted other users; the owner is not counted as a circle member.
- Every recipient must have a verified phone and be an accepted, unblocked circle member.
- Default location-session duration: 1 hour; hard cap: 4 hours.
- Ship the initial Beacon experience without push notifications.
- Minimum age: 18 by self-declaration; obtain legal review before launch.
- Chat retention is configurable, but the value is undecided. Show the configured period to users before chat and use scheduled deletion.
- Select an SMS provider only after a documented South Africa price comparison. The available evidence is in Section 2; South African Twilio SMS and channel fees remain unknown in this check.

### Still requiring product/legal decisions

1. SMS budget and provider contract: obtain actual delivered South African SMS and full verification quotes (including carrier fees, segments, sender costs, and minimums) before choosing. No provider is selected.
2. Chat-retention interval and whether users may delete their own messages before the service-wide expiry.
3. Exact lookup, invite, OTP, chat-send, and report rate-limit thresholds and abuse escalation policy.
4. Legal review of POPIA notice/consent, self-declared age 18, retention/deletion, and operator access to abuse reports.
5. Whether messages should be deleted immediately on leave/block rather than retained inaccessible until the configured retention deadline. Current recommendation: deny access and sends immediately; delete by the configured cleanup deadline.
6. Whether a session owner may include all 10 accepted circle members in one share, or whether a lower per-session recipient cap is preferred. Recommendation: start with a smaller per-session cap to reduce exposure.
7. What operational support/recovery path should handle a phone number already attached to another Auth account. Recommendation: no automatic account merge; require authenticated recovery.

## 16. Files created or changed

Only this file should change:
- [docs/beacon-design.md](./beacon-design.md)

This design intentionally does not start Phase 1 and does not change application code, database objects, or deployment configuration.
