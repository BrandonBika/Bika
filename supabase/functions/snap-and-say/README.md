# Snap & Say backend

This Edge Function accepts multipart `audio`, optional `image`, `duration_seconds`, latitude, longitude, location accuracy, and device timestamp. It validates real MIME types (ignoring MIME parameters), uploads evidence to the private `report-evidence` bucket, calls Gemini, and stores report and evidence metadata without public media URLs. Browser `audio/webm;codecs=opus` is normalized to `audio/webm`; browser `audio/mp4` is sent to Gemini as `audio/m4a` while evidence metadata retains the original browser MIME. Gemini receives `contents[].parts[]` with inline media and JSON output mode. The response is validated for transcription, translation, category, urgency, routing, confidence, and review fields. Provider failures are saved in `ai_runs.error` after redacting the configured API key. The resident ID is resolved from the validated bearer token; a client-supplied ID is never accepted.

## Required configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (recommended for auth user validation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- Optional `GEMINI_MODEL` (defaults to `gemini-3.8-flash`)

Audio is limited to 5 MiB and images to 8 MiB. Evidence is uploaded directly from the original `Blob`; a byte buffer and base64 string are created only while preparing Gemini's inline request, then are released rather than retained in the report payload. Evidence metadata failures trigger deletion of the inserted report and uploaded objects. Gemini model, prompt version, raw response, latency, token metadata, and errors are written to `ai_runs`. Unavailable or malformed Gemini output still saves the report and evidence as `Needs Review`.

## Reprocessing a Needs Review report

The JWT-verified `reprocess-report` Edge Function additionally requires a service-role JWT and an `x-admin-task-secret` matching the Edge Function secret `ADMIN_TASK_SECRET`. It accepts one to five explicitly supplied report UUIDs or tracking numbers, rejects reports not in `Needs Review` or without audio evidence, and records `ai_runs` and report events. It is restricted in code to the staging Supabase host and does not implement bulk selection.

Call it from PowerShell without putting the secret in command history or output:

```powershell
$headers = @{
  Authorization = "Bearer $serviceRoleJwt"
  apikey = $publicAnonKey
  "x-admin-task-secret" = $adminTaskSecret
}
$body = @{ reports = @("CN-2026-000014", "CN-2026-000018") } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://gnwaaedtofazlkjkurea.supabase.co/functions/v1/reprocess-report" -Headers $headers -ContentType "application/json" -Body $body
```

Do not run this against any report until the owner approves the exact identifiers. The two currently identified recovery candidates have not been reprocessed.

## Local tests

```powershell
node --test supabase\functions\snap-and-say\handler.test.js
node --test supabase\functions\reprocess-report\handler.test.js
```
