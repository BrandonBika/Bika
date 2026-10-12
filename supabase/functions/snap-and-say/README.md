# Snap & Say backend

This Edge Function accepts multipart `audio`, optional `image`, `duration_seconds`, latitude, longitude, location accuracy, and device timestamp. It validates real MIME types (ignoring MIME parameters), uploads evidence to the private `report-evidence` bucket, calls Gemini 3.8 Flash, and stores report and evidence metadata without public media URLs. Browser `audio/webm;codecs=opus` is normalized to `audio/webm`; browser `audio/mp4` is sent to Gemini as its documented M4A MIME type (`audio/m4a`) while evidence metadata retains the original browser MIME. The Gemini request uses `contents[].parts[]` with `inline_data` for each media item and requests JSON output. The response parser accepts Gemini's candidate text JSON, and the validated result must include transcription, translation, category, urgency, routing recommendation, confidence, and review fields. Provider failures are stored in `ai_runs.error` after redacting the configured Gemini key. The resident ID is resolved from the validated bearer token; a client-supplied ID is never accepted.

## Required configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (recommended for auth user validation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

Evidence is uploaded to the private `report-evidence` bucket. Object paths use `<reporter_id>/<report_id>/<file>`, and `report_evidence` stores the bucket and path. The bucket limits each object to 25 MiB and allows the configured audio, image, and video MIME types. The handler currently accepts audio and image evidence up to 8 MiB each. Evidence metadata failures trigger deletion of the inserted report and uploaded objects; cleanup failures are returned as errors. Gemini model, prompt version, raw response, latency, token metadata, and errors are written to `ai_runs`. Malformed Gemini output still saves the report and evidence as `Needs Review`; critical output keeps 112, 10111, and 10177 available prominently in the client confirmation.

## Reprocessing a Needs Review report

The operator script `supabase/scripts/reprocess-snap-and-say.js` retries classification only for explicitly supplied report UUIDs or tracking numbers. It is restricted in code to this staging project's URL, requires `SUPABASE_SERVICE_ROLE_KEY` and `GEMINI_API_KEY` in the operator's environment, and refuses reports that are not `Needs Review` or do not have audio evidence. It downloads the private evidence, reruns the same model/schema path, updates only the AI classification fields, and records an `ai_runs` row and report events. There is no bulk mode. Do not run it on any report until the owner approves the exact IDs.

```powershell
$env:SUPABASE_URL = 'https://gnwaaedtofazlkjkurea.supabase.co'
node supabase/scripts/reprocess-snap-and-say.js <approved-report-uuid-or-tracking-number>
```

Set the service-role and Gemini environment variables securely in the local shell before running; never place their values in command history or print them. The two currently identified recovery candidates, `CN-2026-000014` and `CN-2026-000018`, are not processed by this change.

## Local testing

```bash
node --test supabase/functions/snap-and-say/handler.test.js
```

Tests inject a Gemini key and mock fetch; production does not bypass missing-key behavior for mocks:

```bash
node --test supabase/functions/snap-and-say/handler.test.js
```

For a manual smoke test, use the real browser flow with a signed-in resident, hold the recording control for more than one second, capture a small JPEG/PNG or select **Skip photo**, and confirm the backend returns the persisted report.
