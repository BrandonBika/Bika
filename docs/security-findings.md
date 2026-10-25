# Pre-demo security findings

## Scope and verification limits

This report reflects the `security/pre-demo` source tree after commits
`46063f7`, `e60cdf2`, `621f180`, `00f1b50`, `d1e5339`, `752f148`, and
`961784a`. It does not verify live Supabase, Vercel, Auth, Zego, or provider
settings. No secrets are reproduced here.

`gitleaks` is not installed, so neither the working tree nor full Git history
has had a completed Gitleaks scan. The repository's frontend service-role check
passed, but that is not a substitute for the missing history scan.

## Findings

| Finding | Severity | Status | Owner | What changed / remaining work |
|---|---|---|---|---|
| Vulnerable `protobufjs` and Zego ZIM dependency versions | Critical / High | Done in repository | Engineering | Patched `protobufjs`, upgraded `zego-zim-web`, refreshed the lockfile and vendored client bundle. `npm audit` reported zero vulnerabilities after the upgrade. |
| Organization approval gate and approval audit | High | Implemented; deployment pending | Engineering / Supabase operator | Additive migration [20261024000100_organization_approval_gate.sql](../supabase/migrations/20261024000100_organization_approval_gate.sql) adds pending/approved/rejected status, approval checks, reassignment protections, and an actor/status audit row. Registration and approval handlers validate bearer identity. Apply and test the migration on the intended Supabase project before relying on this protection. |
| Beacon message revocation | High | Implemented; deployment pending | Engineering / Supabase operator | Additive migration [20261024000200_beacon_message_revocation.sql](../supabase/migrations/20261024000200_beacon_message_revocation.sql) removes direct-conversation memberships on removal/block and adds current-connection checks to message reads. Apply it and run the SQL regression tests before relying on it live. |
| Wildcard CORS and missing response security headers | High | Implemented in repository; host configuration pending | Engineering / deployment owner | Shared CORS now uses exact `ALLOWED_ORIGINS` values and Vercel has HSTS, `nosniff`, frame protection, Referrer-Policy, Permissions-Policy, and CSP headers. Set production `ALLOWED_ORIGINS` and verify the deployed response headers. |
| Unauthenticated success-shaped transcription stub | High | Fixed in repository | Engineering | `transcribe` now validates a bearer token with the shared helper and returns `410 TRANSCRIPTION_DISABLED`; unauthenticated and anonymous callers are rejected. The active Snap & Say flow is separate. |
| Empty media, privacy, pilot, notification, webhook, and job functions | High if deployed | Unresolved / deployment state unknown | Engineering / deployment owner | Most listed directories contain zero-byte handlers and entrypoints. They have no repository-defined authorization, ownership, shared-secret, signature, or rate-limit behavior. Do not deploy them until implemented; verify none are active in the live project. |
| Zego connection authorization | High | Partial | Engineering | The token handler validates a signed-in Supabase user and derives the Zego user ID from that identity. It does not verify a current accepted/unblocked relationship for intended call recipients, and the production routing/entrypoint is not confirmed in this checkout. |
| Secret exposure in worktree or history | High if present | Cannot tell | Repository owner | `gitleaks` was unavailable, so no full-history result exists. `npm run check:service-role` passed for frontend code; rotate any credential confirmed by a later scan. Install with `winget install Gitleaks.Gitleaks`, then scan the worktree and history. |
| Upload validation and metadata stripping | Medium | Partial | Engineering | The evidence bucket is private and report submission checks MIME strings and size. No server-side magic-byte check or server-side EXIF stripping was found. The media API directories are empty. |
| Upload-size documentation mismatch | Medium | Needs documentation correction | Product / engineering | The shared report-evidence endpoint allows 25 MiB. Snap & Say uses 8 MiB images and 5 MiB audio, from [limits.js](../packages/media-client/src/limits.js). Document these as separate flow-specific limits; do not raise the smaller limits without product and storage review. |
| Login, upload, messaging, and provider rate limits | Medium | Partial / live settings unknown | Engineering / Supabase operator | Report submission has server-side user/IP limits; Beacon request and search RPCs have database limits. No dedicated message or upload limit was found. Supabase Auth's live login limits cannot be verified from this repository. |
| Beacon live-location prototype | Medium | Gated and labelled | Engineering | Circle, consent, and chat routes remain available. Live start, route, and session routes remain gated; the UI labels the flow as a prototype and says location/alerts are not delivered to others. |
| Demo accounts and test configuration | Medium | Repository guard added; live database unknown | App owner | Demo seed scripts now require explicit development mode. `.env.example` contains placeholders and `.gitignore` excludes `.env*` except the example. Remove any test accounts from the live database manually. |

## Endpoint authorization inventory

“Source behavior” below is what is implemented in this checkout, not proof of
what is deployed. `supabase/config.toml` explicitly configures entrypoints for
`report-submit`, `report-guest-submit`, `report-track`, `snap-and-say`, and
`reprocess-report`; live deployment state for other names is unknown.

| Function | Authentication and identity source | Role / organization check | Rate limit |
|---|---|---|---|
| `beacon-route` | Requires a bearer token and validates it against Supabase Auth; no request-body actor ID | No role/org check identified; route coordinates are input data | No endpoint rate limit found |
| `orgs-approve` | Shared `authenticateBearer`; actor comes from the validated token | Database approval RPC requires Platform Admin and writes the audit row | None found |
| `orgs-register` | Shared `authenticateBearer`; submitter is `identity.user.id` | New organization is pending; no approver role required to register | None found |
| `report-guest-submit` | Requires a valid Supabase bearer token for an anonymous/guest session; actor comes from Auth | Guest-only route; no organization role | User/IP windows plus a guest daily limit |
| `report-submit` | Requires a valid Supabase bearer token; actor comes from Auth | Submitted organization is checked against approved/active organizations | User/IP windows |
| `report-track` | Requires a valid Supabase bearer token plus tracking number, lookup code, and CAPTCHA; does not accept a body-supplied actor | No role/org check; lookup is scoped by the tracking credential | Failed-lookup/requester and IP protections |
| `reports-create` | Reuses report-submit handler and its token-derived identity | Same approved-organization check as report-submit | Same report-submit limits |
| `reports-reassign-org` | Shared `authenticateBearer`; actor comes from validated token | Database RPC enforces Platform Staff and approved organization; request IDs identify targets only | None found |
| `reprocess-report` | Requires the `ADMIN_TASK_SECRET` shared secret; JWT verification is disabled in config | Staging-host restriction; no resident/org identity | Admin task rate limit |
| `snap-and-say` | Validates a bearer token against Supabase Auth; report owner comes from returned user ID | No organization-role check identified in the handler | No dedicated request limit identified |
| `transcribe` | Shared `authenticateBearer`; ignores request-body identity | No role/org check; operation is disabled with 410 | None; no operation is performed |
| `zego-token` | Handler validates a bearer token against Supabase Auth and derives the Zego ID from the Auth user; body does not choose the caller | No role/org or accepted/unblocked-recipient check | None found |
| `analytics-query`, `beacon-block-report`, `beacon-connection`, `beacon-search`, `beacon-share-session`, `exports-generate`, `guest-contact-verify`, `invites-accept`, `invites-create`, `job-analytics-precompute`, `job-expire-invites`, `job-expire-location-shares`, `job-guest-contact-purge`, `job-orphan-media-cleanup`, `job-retention-purge`, `job-weekly-digest`, `lifeline-cards`, `lifeline-dispatch`, `media-signed-url`, `media-upload-intent`, `media-validate`, `notifier-send`, `orgs-boundary-upload`, `pilot-manage`, `pilot-promote`, `pilot-send-alert`, `platform-second-approval`, `platform-team-invite`, `privacy-delete`, `privacy-export`, `reports-bulk-map-visibility`, `reports-flag`, `reports-lookup`, `reports-update-status`, `whatsapp-webhook` | No executable handler/entrypoint behavior in this checkout; authorization and actor derivation are not implemented or verifiable. These must remain disabled until implemented. | No code-defined limits. Job functions need a shared-secret gate; the webhook needs provider-signature validation before being enabled. |

## Rate limiting, uploads, and tests

- **Login:** no application-level limiter found. Supabase Auth's configured limits
  are managed outside this repository and cannot be verified here.
- **Reports:** server-side user/IP limits; guest reports also have a daily user
  window.
- **Beacon requests/search:** database-backed `beacon_take_rate_limit` covers
  `request` and `search` actions.
- **Messaging:** RLS and current-connection checks protect access; no
  per-message rate limiter found.
- **Uploads:** report evidence inherits report-submission limits; no separate
  upload limit or media-API implementation found. Shared report evidence uses
  25 MiB. Snap & Say uses 8 MiB per image and 5 MiB per audio recording.
- **File validation:** private evidence storage and MIME/size checks exist for
  implemented report submission. Magic-byte verification and server-side EXIF
  stripping do not. EXIF handling found is client-side only.
- **JavaScript tests:** latest complete `npm test` run passed 224/224 tests.
  This includes organization handler tests, Beacon route/client tests, report
  submission/tracking tests, Snap & Say tests, Zego token tests, and the new
  transcribe fail-closed tests.
- **SQL security tests present:** `beacon_circle_security.test.sql`,
  `organization_approval_security.test.sql`, `messaging_security.test.sql`,
  `phase_a_privilege_hardening.test.sql`, `resident_preferences_beacon_contacts.test.sql`,
  `lifeline_circle_contact_lookup.test.sql`, `rls_anon_denied.test.sql`,
  `rls_audit_append_only.test.sql`, `rls_cross_tenant.test.sql`,
  `rls_mfa_aal2.test.sql`, `rls_realtime_channels.test.sql`,
  `rls_residents.test.sql`, and `rls_storage_objects.test.sql`.
- SQL tests were not run because doing so would apply migrations; no migration
  has been applied in this task.
