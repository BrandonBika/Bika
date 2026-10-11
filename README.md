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

`profiles` extends the authenticated resident profile while preserving `resident_profiles` during the application transition. A `report` may reference its reporter and the recommended/assigned `organization`; each report has multiple `report_evidence` objects, `report_events`, and optional `guest_contacts`. `guest_report_lookup_secrets` stores only the hashed tracking secret. Duplicate reports can refer to another report. Evidence metadata stores a private bucket and object path, not a public URL.

### New migrations and rollback notes

| Migration | Scope | Rollback notes |
|---|---|---|
| `0032_core_reporting.sql` | Drafted locally only; creates the core reporting/profile/organization/evidence/event schema, private evidence bucket, tracking numbers, report RLS, and report audit triggers. | Not applied. If applied, do not drop populated report columns/tables or restore `reports.wa_id` to NOT NULL; app reports may have no WhatsApp ID. Back up before any rollback. Remove only unused additive objects after application rollback, retain private evidence and audit data, and do not restore the former broad authenticated report-read policy. The migration-history discrepancy must be resolved before applying this migration. |
| `0033_guest_reporting.sql` | Drafted locally only; adds consented guest contacts, server-only lookup-secret hashes, five-failure lockout, and claim audit events. | Not applied. If applied, do not drop guest contacts, lookup hashes, or claim events until dependent guest tracking/claim code is disabled and data is backed up. Keep lookup hashes inaccessible to `anon`/`authenticated`; remove only unused indexes/functions/policies after application rollback. |
