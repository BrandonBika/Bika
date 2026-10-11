# Snap & Say backend

This Edge Function accepts multipart `audio`, optional `image`, `duration_seconds`, latitude, longitude, location accuracy, and device timestamp. It validates real MIME types (ignoring MIME parameters), uploads evidence to the private `report-evidence` bucket, calls Gemini 2.5 Flash, and stores report and evidence metadata without public media URLs. The resident ID is resolved from the validated bearer token; a client-supplied ID is never accepted.

## Required configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (recommended for auth user validation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Evidence is uploaded to the private `report-evidence` bucket. Object paths use `<reporter_id>/<report_id>/<file>`, and `report_evidence` stores the bucket and path. The bucket limits each object to 25 MiB and allows the configured audio, image, and video MIME types. The handler currently accepts audio and image evidence up to 8 MiB each. Evidence metadata failures trigger deletion of the inserted report and uploaded objects; cleanup failures are returned as errors. Gemini model, prompt version, raw response, latency, token metadata, and errors are written to `ai_runs`. Malformed Gemini output still saves the report and evidence as `Needs Review`; critical output keeps 112, 10111, and 10177 available prominently in the client confirmation.

## Local testing

```bash
node --test supabase/functions/snap-and-say/handler.test.js
```

Tests inject a Gemini key and mock fetch; production does not bypass missing-key behavior for mocks:

```bash
node --test supabase/functions/snap-and-say/handler.test.js
```

For a manual smoke test, use the real browser flow with a signed-in resident, hold the recording control for more than one second, capture a small JPEG/PNG or select **Skip photo**, and confirm the backend returns the persisted report.
