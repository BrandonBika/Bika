# Snap & Say backend

This Edge Function accepts multipart `audio`, optional `image`, `duration_seconds`, latitude, longitude, location accuracy, and device timestamp. It validates MIME types (ignoring MIME parameters), uploads evidence to the private `report-evidence` bucket, then immediately saves the report and returns its ID and receipt with an explicit `Analysis pending` state. The database trigger records `report_created`. Gemini processing runs with `EdgeRuntime.waitUntil`; it transcribes the original audio and reviews optional image evidence in one background request. The resident confirmation polls the saved report for the classification. On successful analysis the function updates classification fields, records `ai_runs` and `ai_classified`/routing events, and advances status only after those writes succeed. Low-confidence or invalid-category results require human review. Provider, key, timeout, resource, and rate-limit failures are recorded on the report and in `ai_runs` where possible; report-write failures are logged. Whisper is not used by the active Snap & Say flow. The resident ID is resolved from the validated bearer token; a client-supplied ID is never accepted.

Audio classification and in-prompt transcription support English (`en`), isiZulu (`zu`), isiXhosa (`xh`), Afrikaans (`af`), Sepedi/Northern Sotho (`nso`), Setswana (`tn`), Sesotho (`st`), Xitsonga (`ts`), siSwati (`ss`), Tshivenda (`ve`), and isiNdebele (`nr`), including code-switching. The report stores the original transcript, English translation, and detected language in the existing `description_original`, `description_english`, and `detected_language` columns. Transcript confidence is validated independently and retained in the existing `ai_runs.raw_output` JSON; no report column was added. Unknown/other language results and transcription confidence below `0.4` require human review.

Browser `audio/webm;codecs=opus` is normalized to `audio/webm`; browser `audio/mp4` is sent to Gemini as `audio/m4a` while evidence metadata retains the original browser MIME. Gemini receives the classification instructions through `systemInstruction` and the user media/GPS through `contents[].parts[]`. The request uses JSON output mode, a response schema with canonical category and urgency enums, temperature `0.1`, and a 15-second per-request timeout. The response is validated for transcription, translation, category, urgency, routing, confidence, and review fields.

## Required configuration

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (recommended for auth user validation)
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `GUEST_LOOKUP_HMAC_KEY` (required to issue lookup credentials for anonymous residents)
- Optional `GEMINI_MODEL` (defaults to `gemini-3.8-flash`)
- Optional `GEMINI_FALLBACK_MODEL` (no fallback model is selected when unset)

Audio is limited to 5 MiB and images to 8 MiB; the resident compresses oversized photos before upload and rejects oversized audio with a friendly message. The function uploads the received evidence Blobs directly; temporary byte buffers and base64 strings exist only in the background task. Evidence metadata failures trigger deletion of the inserted report and uploaded objects. The selected model, prompt version, sanitized raw response on success, latency, token metadata, and redacted error category on failure are written to `ai_runs`. Gemini API rate-limit responses (HTTP 429) do not undo the saved report: the report is marked for human review with a recorded analysis failure.

Each configured model receives up to three attempts for transient HTTP 429/503 responses, with 250 ms and 500 ms backoffs. With the 15-second request timeout, the worst-case Gemini time is 45.75 seconds per model or 91.5 seconds when the optional fallback model is also exhausted. The resident polls for up to 120 seconds to allow for this retry budget and report persistence. Other primary errors do not trigger fallback. `ai_runs.model` records the model used for the successful result, or the final model attempted when processing fails.

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
  Invoke-RestMethod -Method Post -Uri "${env:SUPABASE_URL}/functions/v1/reprocess-report" -Headers $headers -ContentType "application/json" -Body $body
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

## Multilingual audio evaluation harness

The harness calls the same `callGeminiWithRetry` request/retry/fallback path and `finalizeGeminiResult` validator used by the Edge Function, and reads Gemini's structured JSON response. It does not write to Supabase or include an image; it tests model transcription and classification from audio. Use consented, non-sensitive recordings and keep the generated CSV private because it contains transcripts.

Place recordings in a folder with filenames in the form `<language-code>_<expected-category>_<clip-id>.<extension>`, for example `zu_fire_01.webm`. Supported extensions are `.webm`, `.wav`, `.mp3`, `.aac`, `.ogg`, `.m4a`, and `.mp4`. Set `GEMINI_API_KEY` in the local environment and optionally set `GEMINI_MODEL` or `GEMINI_FALLBACK_MODEL`; the key is never printed. Do not run the harness against live audio without explicit approval.

```powershell
$env:GEMINI_API_KEY = Read-Host -Prompt 'GEMINI_API_KEY'
node tools\eval-snap-languages.js path\to\audio-folder path\to\results.csv
Remove-Item Env:GEMINI_API_KEY
```

The CSV contains the expected and detected language, original and English text, expected and predicted category, urgency, transcription/classification confidence, human-review flag, duration, and a sanitized error code. The console prints per-language and per-category accuracy counts. Expected labels come from filenames; check the dataset labels before interpreting the accuracy summaries.

### Recording plan

For each of the 11 supported languages, record five incident phrases covering fire, a medical collapse, a break-in, a road accident, and flooding. Where possible, use two speakers and record each phrase once in a quiet setting and once with realistic background noise. Add one code-switched clip per language. Use the English phrases in the phone-test sheet as the semantic prompts. Every non-English draft phrase supplied for recording must be marked **DRAFT: needs native-speaker review** and approved by a native speaker before recording or scoring; none are verified translations.
