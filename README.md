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
