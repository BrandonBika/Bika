# CivicNeuro

Multi-tenant civic-issue reporting platform.

## Stack Rules
- Application code is HTML, CSS and JavaScript only (ES modules, JSDoc for types). No Python, Kivy, Django, FastAPI, TypeScript, React/Vue/Angular, or Tailwind.
- Front end: 3 static multi-page apps (resident PWA, org dashboard, platform admin portal), vanilla JS + Web Components, no build step required to run them.
- Backend is entirely Supabase: Postgres + PostGIS (with RLS), Supabase Auth (including email verification, MFA, auth hooks), Supabase Storage (private buckets), Supabase Realtime (private channels), Supabase Edge Functions (written as `.js` modules), and `pg_cron` for scheduled jobs.
- No Cloudflare of any kind (no Workers, R2, Access, WAF, Turnstile, wrangler). CAPTCHA is hCaptcha through Supabase Auth.
- AI providers: Whisper for speech-to-text (called only from the `transcribe` Edge Function) and Gemini for the Snap & Say agent (called only from the `snap-and-say` Edge Function).
- Dev-only tooling is JS (ESLint, Prettier, node:test). No bundler is mandated.

See docs/architecture/

## Database migration notes

### Core reporting relationships

`profiles` is the resident app's future canonical profile, with `resident_profiles` retained as the current source of mirrored identity fields. Existing resident profile rows backfill `profiles`; only `resident_profiles` changes synchronize into `profiles`, with a trigger-depth recursion guard. `full_name` remains intact in `resident_profiles`; the migration may split its first token and remainder into `profiles.first_name`/`last_name` only when those values are empty, which cannot reliably infer multi-part names. Authenticated users may update only fields owned by `profiles`; mirrored name, email, phone, and address are read-only there. `resident_profiles` rows are created by a security-definer trigger on `auth.users` only when signup metadata contains `privacy_consent_at`; there is no client INSERT policy. A `report` may reference its reporter and nullable recommended/assigned `organization`; Gemini's recommended organization remains report text until a verified organization link is available. Each report has `report_evidence`, `report_events`, AI-run metadata, and optional `guest_contacts`. `guest_report_lookup_secrets` stores only an Edge Function HMAC of the tracking secret. Duplicate reports can refer to another report. Evidence metadata stores a private bucket and object path, not a public URL.

### New migrations and rollback notes

| Migration | Scope | Rollback notes |
|---|---|---|
| `0032_core_reporting.sql` | Drafted locally only; preserves legacy report columns, makes `wa_id` nullable, flags historical sources, and creates profile/org/report/evidence/event, `ai_runs`, and `consents` schema, the private 25 MiB evidence bucket, tracking numbers, owner-only report RLS, and report event logging. Organization dispatch-contact columns are removed; Gemini routing is stored as text with a nullable organization FK. | Not applied. The existing staging `media_url` cannot be mapped to a private bucket/object, so it remains in the retained legacy column. If applied, do not drop populated report columns/tables or restore `reports.wa_id` to NOT NULL; app reports may have no WhatsApp ID. Dropping organization dispatch-contact columns is intentional. Back up before any rollback. Remove only unused additive objects after application rollback, retain private evidence and audit data, and do not restore the former broad authenticated report-read policy. Resolve staging migration-history drift before applying this migration. |
| `0033_guest_reporting.sql` | Drafted locally only; adds consented guest contacts, server-only HMAC lookup-secret hashes, per-report/per-requester 15-minute lockouts, per-report CAPTCHA/slow-down counters, non-blocking per-IP CAPTCHA/slow-down counters, and generic `rate_limits`. | Not applied. If applied, do not drop guest contacts, lookup hashes, attempt/counter history, or claim events until dependent guest tracking/claim code is disabled and data is backed up. Keep hashes and attempt/counter records inaccessible to `anon`/`authenticated`; remove only unused indexes/functions/policies after application rollback. |
| `0034_beacon_wa_id_policy_hardening.sql` | Drafted locally only; drops only the broad authenticated SELECT policies on Beacon sessions and points, retaining both service-role policies. | Not applied. Re-creating the removed broad policies would again expose Beacon locations to every authenticated user, so do not use that rollback; any later access requires a scoped sharing design. |
