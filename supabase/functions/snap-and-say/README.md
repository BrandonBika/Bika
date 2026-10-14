# Snap & Say backend

This Edge Function accepts multipart `audio`, optional `image`, `duration_seconds`, latitude, longitude, location accuracy, and device timestamp. It validates MIME types (ignoring MIME parameters), uploads evidence to the private `report-evidence` bucket, then saves the report as `Needs Review` and returns its receipt. The database trigger records `report_created`. Gemini processing runs with `EdgeRuntime.waitUntil`; it converts the original media blobs to inline base64 only in that background task. On successful analysis it updates classification fields, records `ai_runs` and `ai_classified`/routing events, and advances status only after those writes succeed. Low-confidence results and provider, key, timeout, resource, or rate-limit failures remain `Needs Review`; failure categories are stored without configured secrets. The resident ID is resolved from the validated bearer token; a client-supplied ID is never accepted.

Browser `audio/webm;codecs=opus` is normalized to `audio/webm`; browser `audio/mp4` is sent to Gemini as `audio/m4a` while evidence metadata retains the original browser MIME. Gemini receives `contents[].parts[]` with inline media and JSON output mode. The response is validated for transcription, translation, category, urgency, routing, confidence, and review fields.

## Required configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (recommended for auth user validation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- Optional `GEMINI_MODEL` (defaults to `gemini-3.8-flash`)
- Optional `GEMINI_FALLBACK_MODEL` (no fallback model is selected when unset)

Audio is limited to 5 MiB and images to 8 MiB. Evidence is uploaded directly from the original `Blob`; temporary byte buffers and base64 strings exist only in the background task. Evidence metadata failures trigger deletion of the inserted report and uploaded objects. The selected model, prompt version, sanitized raw response on success, latency, token metadata, and redacted error category on failure are written to `ai_runs`. Gemini API rate-limit responses (HTTP 429) do not undo the saved report: it remains in `Needs Review` for later recovery.

Each configured model receives up to three attempts for transient HTTP 429/503 responses. After all primary-model attempts fail with 429 or 503, the optional fallback model receives the same bounded retry policy. Other primary errors do not trigger fallback. `ai_runs.model` records the model used for the successful result, or the final model attempted when processing fails.

## Reprocessing a Needs Review report

The `reprocess-report` Edge Function has `verify_jwt = false` and authenticates only with the `x-admin-task-secret` header matching the Edge Function secret `ADMIN_TASK_SECRET` using constant-time comparison. The service-role key is used internally by the function and is never needed in the caller's shell. It accepts one to five explicitly supplied report UUIDs or tracking numbers, rejects reports not in `Needs Review` or without audio evidence, and records `ai_runs` and report events. A server-side rate limit allows five requests per fifteen minutes. It is restricted in code to the staging Supabase host and does not implement bulk selection.

When explicitly approved, call it from PowerShell. The command reads the secret without echoing it, obtains only the public anon key from the PWA runtime config, and sends no service-role key or JWT:

```powershell
$runtimeConfig = Get-Content 'apps\resident-pwa\runtime-config.js' -Raw
$publicAnonKey = [regex]::Match($runtimeConfig, "supabaseAnonKey:\s*['""]([^'""]+)['""]").Groups[1].Value
if (-not $publicAnonKey) { throw 'The public Supabase anon key was not found in runtime-config.js.' }
$secureAdminSecret = Read-Host -Prompt 'ADMIN_TASK_SECRET' -AsSecureString
$adminSecret = [System.Net.NetworkCredential]::new('', $secureAdminSecret).Password
$headers = @{
  apikey = $publicAnonKey
  'x-admin-task-secret' = $adminSecret
}
$body = @{ reports = @("CN-2026-000014", "CN-2026-000018") } | ConvertTo-Json
try {
  Invoke-RestMethod -Method Post -Uri "https://gnwaaedtofazlkjkurea.supabase.co/functions/v1/reprocess-report" -Headers $headers -ContentType "application/json" -Body $body
} finally {
  $headers['x-admin-task-secret'] = $null
  $adminSecret = $null
  $secureAdminSecret.Dispose()
}
```

Do not run this against any report until the owner approves the exact identifiers. The two identified recovery candidates are not processed by deployment or testing.

## References

- [Gemini 3.8 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini audio input](https://ai.google.dev/gemini-api/docs/audio)

## Local tests

```powershell
node --test supabase\functions\snap-and-say\handler.test.js
node --test supabase\functions\reprocess-report\handler.test.js
```
