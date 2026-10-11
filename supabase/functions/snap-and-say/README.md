# Snap & Say backend

This Edge Function accepts multipart `audio`, optional `image`, `duration_seconds`, latitude, longitude, location accuracy, and device timestamp. It validates real MIME types (ignoring MIME parameters), uploads evidence to private Supabase Storage buckets, calls Gemini 2.5 Flash, and stores the result and media URLs in `public.reports`. The resident ID is resolved from the validated bearer token; a client-supplied ID is never accepted.

## Required configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (recommended for auth user validation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

The storage buckets `audio-reports` and `image-reports` are created private by migration `0031_snap_and_say_reports.sql`. If Gemini is not configured, media and the report are still saved with status `Needs Review`; a non-sensitive configuration error is logged.

## Local testing

```bash
node --test supabase/functions/snap-and-say/handler.test.js
```

Tests inject a Gemini key and mock fetch; production does not bypass missing-key behavior for mocks:

```bash
node --test supabase/functions/snap-and-say/handler.test.js
```

For a manual smoke test, use the real browser flow with a signed-in resident, hold the recording control for more than one second, capture a small JPEG/PNG or select **Skip photo**, and confirm the backend returns the persisted report.
