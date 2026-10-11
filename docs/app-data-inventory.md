# CivicNeuro resident app data inventory

**Inventory refreshed — 11 October 2026.** This document records the checked-in resident app, verified staging metadata, and the current Stage 1 scope. Migrations 0032–0034 are local drafts only; no migration or policy change has been applied to staging or live.

## 1. Scope and navigation

The resident PWA is a vanilla-JavaScript single-page app with hash routes. `src/router.js` is the source of route access rules; `src/components/app-shell/app-shell.js` lazy-imports one page module per route. The shell has a menu button at the top, an offline banner, and a five-item bottom bar (Lifeline, Home, Reports, Alerts, Beacon). Alerts is an alias for Notifications. Home adds shortcuts to Snap & Say, Report an issue, Your area, a poll, Community pulse, Trending issues, News, Surveys, and Notifications. The menu exposes Safety & emergency info, Help & FAQs, Contacts, Profile & settings, and Language.

In the table, **resident** means the router's non-guest authenticated state and **guest** means its in-memory guest state. `auth:false` routes can be opened without either state. These are client-side route guards, not proof of backend authorization.

| Route / screen | Who can open it | What the checked-in screen does |
|---|---|---|
| `welcome` | Both; public | Entry screen linking to sign-in, registration, guest report, and guest report tracking. |
| `sign-in` | Both; public | Sign in with an email/phone identifier and password; offers forgot-password and guest-report links. |
| `register` | Both; public | Collects a resident account, consent, and optional updates preference. |
| `verify-email` | Both; public | Displays/resends email verification for the address passed in the route. |
| `forgot-password` | Both; public | Requests an email password-reset link. |
| `reset-password` | Both; public | Sets a new password and confirmation after an auth recovery redirect. |
| `session-expired` | Both; public | Session-expiry information/action screen. |
| `guest-report` | Both; public | Guest issue-report form with contact preference, map pin, and CAPTCHA. |
| `guest-confirmation` | Both; public | Generic “Guest Action Confirmation” page; no report data is rendered. |
| `report-submitted` | Both; guest allowed | Shows the route-provided reference and links to report detail or guest tracking. |
| `track-report` | Both; public | Guest lookup form using reference number and the contact submitted with the report. |
| `home` | Resident and guest | Greeting and shortcuts to reporting, area/community content, news, surveys, and notifications. |
| `my-reports` | Resident only | Search/filter report list and Snap & Say shortcut. Current list is fixture/store-backed. |
| `report-new` | Resident and guest | Typed issue-report form with organisation/branch/category, description, evidence selection, and location. |
| `report-detail` | Resident and guest | Report summary, status timeline, conversation entry, add-information/evidence-kind controls, withdrawal, escalation, satisfaction, and reopen actions; currently reads the in-memory reports store. |
| `report-thread` | Resident and guest | Report conversation and message composer; current message mutation is in-memory. |
| `report-duplicate-check` | Resident and guest | Intended duplicate interstitial; currently shows a default sample cluster and offers “View existing report” or “Submit mine anyway.” No duplicate-detection call from `report-new` was found. |
| `report-satisfaction` | Resident and guest | Yes/no satisfaction response after a report is resolved. |
| `report-reopen-escalate` | Resident and guest | Text details for disputing/reopening a resolved issue. |
| `empty-state` | Resident and guest | Empty-list/status presentation; no form. |
| `error-state` | Resident and guest | Error presentation; no form. |
| `offline-queued` | Resident and guest | Intended queued-report screen, but there is no `pages/offline-queued/offline-queued.js`; route import fails in this checkout. A separate reusable `cn-offline-queued` component exists. |
| `alerts` | Resident and guest; redirected | Redirects to `notifications`. |
| `notifications` | Resident and guest | Inbox with All/Reports/Community filters and read actions; currently fixture/store-backed. |
| `lifeline-home` | Resident and guest | Emergency-call groups and entry to call/create/edit flows. Saving groups is resident-only. |
| `lifeline-call-countdown` | Resident and guest | Call countdown before initiating a group call. |
| `lifeline-calling-status` | Resident and guest | Group-call progress/status. |
| `lifeline-card-create` | Resident only | Create a named emergency contact group with icon, colour, and 1–4 contacts. |
| `lifeline-card-edit` | Resident only | Edit group contacts and save the group. |
| `lifeline-contacts-picker` | Resident only | Device contact selection flow for a Lifeline group. |
| `contacts-permission` | Resident and guest | Device contacts permission explanation/flow; route context identifies Beacon callers. |
| `beacon-home` | Resident only | Beacon circle/map and sharing mode entry; obtains live device location when requested. |
| `beacon-safety-notice` | Resident only | Beacon sharing safety notice. |
| `beacon-add-to-circle` | Resident only | Search/add contacts and accept/decline/send circle requests. |
| `beacon-requests` | Resident only | Review incoming and outgoing Beacon requests. |
| `beacon-find-contacts` | Resident only | Select device contacts or type a contact name and phone to add/invite. |
| `beacon-chat` | Resident only | Circle-member conversation, message composer, and live-location share shortcut. |
| `beacon-share-session` | Resident only | Live sharing status, update/stop controls. |
| `beacon-draw-path` | Resident only | Draw/edit a route on a map and search for a place/destination. |
| `beacon-start-confirm` | Resident only | Select circle members and confirm starting a Beacon sharing/route session. |
| `snap-and-say` | Resident and guest | Captures an audio description, optional photo, and one-time GPS point; submits to the Snap & Say Edge Function. The current Edge Function rejects requests without a valid Bearer token, so the guest-allowed UI cannot complete this server submission. |
| `your-area` | Resident and guest | Area/community information screen; no user-entered form found. |
| `polls` | Resident and guest | Poll listing. |
| `poll-detail` | Resident and guest | Select one poll option and submit a vote. |
| `community-pulse` | Resident and guest | Community summary screen; home display includes static summary copy. |
| `trending-issues` | Resident and guest | Trending issue list/summary screen; home display includes static copy. |
| `news` | Resident and guest | News listing, currently supplied by the functions-client mock data. |
| `news-article` | Resident and guest | News article detail. |
| `survey` | Resident and guest | Survey screen; current page submits a hard-coded answer rather than rendering answer controls. |
| `survey-submitted` | Resident and guest | Survey completion confirmation. |
| `safety-info` | Resident and guest | Safety/emergency information. |
| `help-and-safety` | Resident and guest | Help/FAQ information. |
| `menu` | Resident and guest | Menu and sign-out action. Guest profile tile returns to Welcome; resident tile opens Account. |
| `account` | Resident only | Profile/settings hub. |
| `profile-edit` | Resident only | Edit name, phone, email, and address; current Save action only shows a toast and returns to Account. |
| `badges-edit` | Resident only | Badge preference/display screen; no database write found. |
| `notification-settings` | Resident only | Four notification checkboxes; currently not saved. |
| `privacy-policy` | Resident and guest | Privacy information. |
| `terms` | Resident and guest | Terms information. |
| `contacts` | Resident and guest | Organisation/contact directory with client-side search. |
| `language` | Resident and guest | Language selection; current preference is in the in-memory session store. |
| `data-export` | Resident only | Request account data export. |
| `delete-account` | Resident only | Requires typing `DELETE` (maximum six characters), then shows confirmation; current final action only signs out/navigates and does not invoke account deletion. |
| `pilot-org-select` | Resident and guest | Placeholder headed “Pilot Municipality Selection”; no options or selection controls are implemented. |

The resident route set does not itself expose org-dashboard or platform-admin pages. Those separate apps and their staff/platform auth are present in the repository; their user/role schema cannot be reconstructed from the zero-byte early migration and policy files. The checked-in product concepts include organisation users and platform staff, but a live role inventory remains unverified.

## 2. Input inventory and current destinations

No `maxlength`/`minlength` is set on the shared `cn-input` component unless a page explicitly passes one. Required inputs often carry an HTML `required` attribute, but pages commonly handle button clicks manually rather than relying on browser form submission validation. “No limit found” means no enforced client/server limit was found in the inspected source, not that the deployed service has no limit.

| Screen / input | Type and origin | Required and observed validation / limit | Current destination | Gap / disposition |
|---|---|---|---|---|
| Sign in: “Email address” | Typed text/email; UI label says email, auth client also accepts phone | Required in click handler; no length cap; phone is normalized to South African `+27` format when recognized | Supabase Auth password grant | Auth state is in memory only; not a report input. |
| Sign in: “Password” | Typed password | Required; no client length rule | Supabase Auth password grant | No further local constraints found. |
| Registration: Full name | Typed text | Required/nonempty; no max length | Auth signup metadata, then `resident_profiles.full_name` via auth-user trigger | Existing profile schema is `resident_profiles`, not proposed `profiles`. |
| Registration: Email | Typed email | Required/nonempty; browser email type, but click handler only checks nonempty | Supabase Auth signup and profile trigger | No page-level email format validation found. |
| Registration: Cellphone number | Typed tel | Required/nonempty; normalized by auth client; no max length | Signup metadata, then `resident_profiles.phone` | No fixed-country/contact verification evidenced in this path. |
| Registration: Address | Typed street address | Required/nonempty; no max length | Signup metadata, then `resident_profiles.address` | Address is profile data only; no report copy should be inferred. |
| Registration: Password + confirmation | Typed password twice | Both required/nonempty; exact match; no page-level minimum length | Supabase Auth signup | Backend Auth policy is not available from the empty migrations. |
| Registration: privacy/terms consent | Checkbox/custom consent component | Required to enable submit | `privacy_consent_at` in auth metadata; trigger writes profile consent timestamp | No versioned policy document/version is sent here. |
| Registration: “Send me push notifications…” | Optional checkbox | Optional; boolean | `notification_consent` signup metadata and `resident_profiles.notification_consent` | Does not create a push token or establish SMS consent semantics. |
| Verify email: Email address | Typed email, initially route-provided | Required attribute; resend path | Supabase Auth resend signup verification | No profile/report write. |
| Forgot password: Email address | Typed email | Required; client rejects values without `@` | Supabase Auth password recovery | No report data. |
| Reset password: New Password / Confirm Password | Typed passwords | New password must be at least 8 characters; confirmation must match | Supabase Auth user update | No password is persisted in app tables. |
| Guest report: update method | Pick one: SMS (default) or Email | Required selection, default SMS | Sent as `contactMethod` in guest submit payload | Current Edge handler for `report-guest-submit` is absent; no known persisted destination. |
| Guest report: contact value | Typed tel or email, label changes with method | Required/nonempty only in handler; no format/size check found | Sent as `guestContact` to `report-guest-submit` | No guest-contact table/path in current code; current UI requires contact even though the requested design says optional. |
| Guest report: Organisation | Pick list: unsure, eThekwini, other | Optional/default unsure | Sent as `organisation` | No working production handler found. |
| Guest report: Branch | Pick list: auto, Berea; hidden if organisation is unsure | Optional | Sent as `branch` | No working production handler found. |
| Guest report: Type of issue | Pick list (water/sanitation, roads, electricity, waste, other) | Optional; defaults to first option | Sent as `category` | No working production handler found; vocabulary differs from the resident form. |
| Guest report: Description | Typed textarea | Required/nonempty; no max length found | Sent as `description` | No working production handler found. |
| Guest report: Location/pin | Device GPS or map tap/drag; nearby landmark typed in map picker | A coordinate pin is required; map picker restricts points to roughly South Africa bounds (lat −35..−22, lon 16..33); landmark optional | Sent as latitude, longitude, address | No accuracy, source-quality, or report-time geography column in current reports schema. |
| Guest report: CAPTCHA | CAPTCHA widget/device response | Widget is shown; client does not check a nonempty token before submit | Token sent as `captchaToken` | No handler to prove validation. Track-report also shows CAPTCHA but does not send its token. |
| Report an issue: Organisation | Pick list (unsure, eThekwini, Johannesburg, Cape Town) | Optional | **Not included** in `submitReport` payload | Collected and dropped. |
| Report an issue: Branch | Pick list, “auto-detected from pin” placeholder | Optional | **Not included** in `submitReport` payload | Collected/presented but not dynamically resolved or sent. |
| Report an issue: Type of issue | Pick list: water/sanitation, electricity, roads/traffic, refuse, safety, parks/environment, other | Optional; defaults to `other` on submission | `category` sent to `report-submit` or `report-guest-submit` | The receiving handler is absent in the checkout; no persisted selected-category column. |
| Report an issue: Description | Typed textarea | Required/nonempty after trim; no max length found | `description` sent to report endpoint | Endpoint absent; no form-specific report column in the checked-in reports migration. |
| Report an issue: Photo | Device/file picker, `image/*` | Optional; no client size limit | **Not passed** to `submitReport` | Collected then dropped. |
| Report an issue: Video | Device/file picker, `video/*` | Optional; no client size limit | **Not passed** to `submitReport` | Collected then dropped. |
| Report an issue: Location/address | Typed street/area or map/GPS pin | Page requires either nonempty address or a selected location; map coordinates constrained to South Africa; no text length cap | Address, latitude, longitude sent to report endpoint | Endpoint absent. Pin accuracy and source are not passed. Text address may be sent without coordinates. |
| Snap & Say: audio | Microphone recording (MediaRecorder) | Required; at least 1 second, auto-stops at 60 seconds; server permits up to 8 MiB and allowlists audio MIME types | Multipart request to `functions/v1/snap-and-say`; uploaded to private `audio-reports`; AI output and URL written to `reports` | Requires a valid signed-in Bearer token; guest UI allowed but server rejects tokenless guest. No reference/tracking number or idempotency key. |
| Snap & Say: photo | Rear-camera/device image picker (`image/*`, `capture=environment`) | Optional; Edge permits up to 8 MiB and JPEG/PNG/WebP/HEIC/HEIF | Uploaded to private `image-reports`; image URL written to report; image passed to Gemini | Current row stores URL text, not a bucket/path reference. |
| Snap & Say: location | GPS captured on permission screen and again before submit | Optional; high accuracy requested, timeout 10–20 sec; denied/unavailable maps to `no_gps`; accuracy recorded | Multipart latitude, longitude, accuracy, GPS status inferred in Edge, and device timestamp | Single report-time location is captured. No `geography(Point,4326)` or GiST index in current report migration. |
| Snap & Say: AI-derived fields | Gemini-produced transcription, language, translation, visual summary, category/urgency, routing, confidence/review flags | Structured response requires fixed keys; urgency accepted only as `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | Mapped into legacy `reports` text/JSON/numeric columns (`original_transcription`, `english_translation`, `urgency`, etc.) | No `ai_runs`, prompt/model audit, distinct user-selected vs AI category/level, or `report_level` column. |
| Track report: reference number | Typed text, may be prefilled from confirmation | Required/nonempty; no format/length check | Sent to `report-track` | No handler directory for that slug; no lookup-code field. |
| Track report: phone/email | Typed text | Required/nonempty; no format validation | Sent as contact to `report-track` | Uses contact as proof rather than the requested short secret; CAPTCHA widget token is not sent. |
| My Reports: search | Typed free text | Optional; trimmed after 250ms debounce; no cap | Filters in-memory report fixture/store | No persisted query or real report listing. |
| My Reports: filter chips | Pick one: All, Active, Resolved, Escalated | One active filter; counts derived from in-memory fixture/store | Filters the local report list | No query to persisted reports. |
| Report detail: “Add information” | Typed textarea plus optional evidence-kind toggles for photo, video, and audio (the toggles do not select actual files) | Submit enabled if details are nonempty or at least one evidence kind is selected; no max length | `reportsStore` via `addInformationToReport(details, evidenceKinds)` | Nothing durable; evidence is only a list of selected kinds, not an uploaded object. |
| Report detail: “Reason” for withdrawal | Optional typed text | No max length; blank becomes “Resident requested withdrawal” | `reportsStore` | No durable write shown. |
| Report detail: “Details” for reopen | Typed textarea | Required/nonempty after trim; no max length | `reportsStore` via `reopenReportById` | No durable write shown. |
| Report thread: message | Typed text | Trimmed; empty messages ignored; no max length | `reportsStore` message array | Not persisted; no `report_updates`/message write. |
| Reopen/escalate: details | Typed textarea | Nonempty after trim; no max length | Local reports store | No durable update; endpoint not used by this page path. |
| Satisfaction | Pick Yes/No | One choice; no free text | Local reports store | No durable response. |
| Badges: displayed badges | Pick from six badge cards | Maximum of three; defaults to three selected | Local component state; Save only shows a toast | Not persisted to profile or a badge table. |
| Lifeline group: group name | Typed text | Required; max 100 enforced by current `lifeline_cards` table | `lifeline_cards.name` through Supabase client for signed-in residents | Existing table supports this feature. |
| Lifeline group: icon and colour | Pick lists | Required by table check; icon allowlist and hex colour regex | `lifeline_cards.icon`, `.color` | Existing schema supports this feature. |
| Lifeline group: 1–4 member names and phone numbers | Typed or picked from device contacts | UI requires at least one complete name/phone and caps at four; table checks member array count 1–4, but not nested member field format | `lifeline_cards.members` JSONB | Device contact choice is copied into saved member details; no separate contacts table for Lifeline. |
| Beacon: circle contact name/phone | Device contact selection or typed name and tel | Typed name max 100 and required; phone max 24 and required, then normalized and validated to 7–15 digits | `beacon_contacts` via Supabase contact client; circle members also reside in Beacon browser state | Unlike guest reporting, these contacts are resident's private Beacon contacts. |
| Beacon: circle/contact search | Typed search query | Optional; no cap found | Filters client-side contact/member list | Not a report input. |
| Beacon: circle-member selection, share duration, off-path alert | Pick one or more contacts; choose duration; optional route-only off-path switch | At least one member required; duration options are Until I arrive/Until I stop, 30 min, 1 hour, or 2 hours; route alert is boolean | Beacon sharing/session flow and local client state | Do not treat these as report inputs. Share/session persistence is unverified in this checkout. |
| Beacon: message | Typed text | Trimmed; empty ignored; no length cap found | Beacon client writes chats to localStorage-backed Beacon state | No durable server chat table is evidenced; local device copy is not cross-device sync. |
| Beacon: place/destination | Typed place search; map tap/path drawing | Search text 2–120 characters; server route limit is 100–10,000m and max 500 simplified points | `beacon-route` function and configured routing/geocoding providers; an unfinished route is held in sessionStorage | Route computation is not a report submission and the handler does not insert into `reports`. |
| Beacon: live location | Device GPS | Permission-gated; quality thresholds enforced in Beacon feature; can be watched/shared while active | Beacon sharing/session flow; `activeSession` is explicitly excluded from its localStorage snapshot, but server persistence is unverified | Separate live-sharing location must not be reused as report location history. |
| Poll detail: answer | Pick exactly one displayed option | Required before voting | `polls-vote` function endpoint / mock adapter | No matching real function handler or non-empty poll migration found; vote not shown to be durable. |
| Survey: answers | No actual answer control in current page | Current button submits hard-coded `[{ q1: 'Daily' }]` | `surveys-submit` function endpoint / mock adapter | No resident input is actually captured; no verified persistent answer destination. |
| Contacts directory: search | Typed search | Optional; client-side filter | In-memory directory data | No report/contact persistence shown. |
| Notifications: category filter | Pick one: All, Reports, Community | One active filter | Filters in-memory notification fixture/store | No persisted inbox/filter preference. |
| Notification settings | Four checkboxes (SMS report updates, community safety alerts, ward bulletins, Beacon requests) | All rendered checked; no save action | Nowhere (not persisted) | No preference or push-token wiring from this screen. |
| Profile edit: name, phone, email, address | Typed fields | Name/phone/address nonempty; email regex; save enabled only for changes; phone normalized for display | Nowhere (save only shows toast) | Does not update `resident_profiles`. |
| Language | Pick language | Available locales include English, Afrikaans, isiZulu | Session/i18n state only | No durable preference/profile update shown. |
| Delete account: confirmation | Typed `DELETE` | Exact match; max 6 characters | Nowhere; confirmation dialog ends with toast/navigation | Does not call account-delete/privacy-delete endpoint. |
| Data export | Button, no user-entered fields | N/A | UI says export arrives by email; currently toast only | Does not call account-export/privacy-export in the page. |

### Reporting entry points and other ingestion paths

| Entry path | Checked-in path and behavior | Current write/destination |
|---|---|---|
| Snap & Say | Resident PWA sends multipart directly to `snap-and-say`; Edge validates audio/image, resolves a bearer-token user, uploads evidence with service credentials, calls Gemini, and POSTs one `reports` row. | The only non-empty current report writer found. It writes `resident_id`, `audio_url`/`image_url`, coordinates/accuracy/timestamp, transcription/language/translation, AI category, `urgency`, routing fields, confidence/review flags, GPS status, and status. It does not create a tracking number, event, evidence row, or idempotency record. |
| Report an issue (resident) | `reports.client.submitReport` calls endpoint slug `report-submit`; sends selected category, description, address, latitude, longitude. | In mock mode creates an in-memory report. In configured live mode it POSTs `/functions/v1/report-submit`; no matching function folder/handler is present. Photo, video, organisation, and branch are dropped before the call. |
| Guest report | Same client with `isGuest=true` calls `report-guest-submit`, passing contact, preference, organisation/branch, category, description, coordinates, CAPTCHA token. | Mock mode creates an in-memory report. No matching function handler or guest persistence table is present. |
| Guest tracking | `track-report` sends reference and contact to endpoint slug `report-track`. | Mock implementation finds by reference only; there is no real handler found, and contact is not checked by that mock. CAPTCHA token and secret lookup code are not sent. Opening this route from Welcome does not call `startGuestSession`; on a successful lookup the router's authenticated `report-detail` guard can send that unauthenticated visitor back to Welcome. |
| Offline report replay | IndexedDB queue stores payload plus generated idempotency key. Typed reports replay through `report-submit` and include key in JSON. Snap replay posts multipart but does not add key to the form. | No database idempotency column/unique constraint is in migration 0031. Queue replay is not yet end-to-end exactly-once. Guest typed submissions replay through the resident `report-submit` endpoint, not guest endpoint. |
| Beacon route / share / location | Beacon route function validates a route and calls external routing/geocoding services; resident UI separately requests/watch-shares GPS. | Route function is not a report writer. Beacon sharing is separate from issue reporting. Other Beacon client endpoints are not backed by non-empty migrations in this checkout; verify deployed integration. |
| WhatsApp reporting | Paused until a registered business is available for the WhatsApp Business API. The existing `whatsapp-webhook` function and WhatsApp tables are explicitly out of Stage 1 scope and must remain unchanged. | Do not add a WhatsApp report source or modify the webhook/tables. Preserve the existing report columns, including `wa_id`, for a later resumption; make `reports.wa_id` nullable for app reports. |
| Other form actions | Poll voting, survey submission, account export/delete, message/report updates use mock adapter or client-store mutation in the resident app. | No verified reports-table insert from these paths. |

## 3. Where current report data lands and what is missing

The current `reports` schema is created/extended only in [`supabase/migrations/0031_snap_and_say_reports.sql`](../supabase/migrations/0031_snap_and_say_reports.sql). It is tailored to Snap & Say: `id`, non-null `resident_id`, `audio_url`, `image_url`, latitude/longitude/accuracy, `device_timestamp`, `original_transcription`, `detected_language`, `english_translation`, `visual_evidence_summary`, `photo_matches_report`, `issue_category`, `urgency`, `requires_immediate_dispatch`, `extracted_location`, `recommended_organization` JSONB, `alternative_organizations` JSONB, classification/routing confidence, human-review fields, `gps_status`, `status`, and `created_at`.

No current report columns were found for `source`, `tracking_number`, user-selected category/level, typed-form description, guest contact reference, a private lookup-code hash, report evidence bucket/path, geography, organization FK, `updated_at`, duplicate/incident/idempotency links, dispatch, report events, reporter type, or timestamps for resolution. The typed-form and guest request shapes do not currently reach a real handler. The `reports.client` list/detail paths read fixtures/store first; `listMyReports()` returns only the in-memory store and the My Reports page does not fetch a Supabase report list.

The report RLS policy in migration 0031 allows a resident to insert when `auth.uid() = resident_id`, select own rows, and update own rows. The update policy is row-level only: it does not stop the owner changing `status`, `urgency`, assignment/routing, confidence, or other protected columns. There is no staff/organisation policy in that non-empty migration. The report table has no guest/anonymous row support because `resident_id` is non-null.

## 4. Authentication and guest identity

- **Signed-in resident:** Supabase Auth email/password. Registration metadata includes full name, phone, address, notification consent, and a privacy-consent timestamp. Migration 0028's `auth.users` trigger copies those values to `resident_profiles`. The custom Supabase client keeps access and refresh tokens in module memory; it does not write browser storage. A page reload therefore does not restore this custom client session automatically.
- **Guest:** `startGuestSession()` sets `{isAuthenticated:true,isGuest:true,user:{fullName:'Guest Resident',role:'guest'}}` in the in-memory app store and clears the Supabase token state. No Supabase anonymous sign-in, device ID, guest session ID, or localStorage identity is created in that flow. The guest is identified only by transient app state, which disappears on reload. `guest-report` is public and the guest UI calls the separate guest submit slug, but there is no checked-in server handler. The current guest form collects phone/email plus a CAPTCHA; Snap & Say has no guest-specific contact entry and its server requires a bearer token. Guests cannot open My Reports, Beacon, Lifeline editing, profile, or other `guest:false` routes. They can access guest report tracking, but lookup presently uses reference + contact, not a short secret code.
- **Staff/platform users:** separate org dashboard and platform admin apps exist; the shared RBAC package names `org_employee`, `org_admin`, `platform_employee`, and `platform_admin` (alongside `resident` and `guest`). These are not resident router states. Early migration files describing staff/org users are empty. Check actual deployed Auth claims, `org_users`/platform staff state, and role policies before using the dashboard scope in Stage 1.
- **Recommended guest design for Stage 1 (not implemented):** Supabase anonymous sign-in fits the requested `auth.uid()`-based RLS and lets guest-owned evidence use a user folder. It does require the client to persist/refresh the anonymous session safely across reloads and to handle account linking/claiming. A device token avoids creating an Auth user but requires custom server-side authorization for every report/evidence/lookup, has weaker cross-device recovery, and cannot directly rely on `auth.uid()`. With the stated preference, anonymous sign-in is the better starting proposal; do not treat current in-memory guest state as anonymous Auth.

## 5. Device storage and sync

| Storage | Use and sync behavior |
|---|---|
| JavaScript memory | Auth session, resident/guest state, language, report fixtures and mutations, notification fixtures, mock function database, temporary report-form fields and device contacts. Cleared by refresh/restart. |
| IndexedDB | `civicneuro-offline-reports`, object store `reports`, keyed by generated `idempotencyKey`; stores queued payload, retry count, time, and Blob/File values. Queue is replayed on startup (when online) and on the `online` event. The queue code stores payload values directly; the separate `encrypt-at-rest.js` helper is not used by the queue path inspected. |
| Service Worker Cache API | `cn-shell-v11` caches the static shell list only; API/functions/REST requests are not cached. Offline GET fallback may return `offline.html`. |
| `localStorage` | Beacon state under `civicneuro_beacon_state_v1`: circle members, pending requests, chats, and contacts-permission state. `activeSession` is explicitly excluded when saving. Member objects may include per-member `lastLocation` fields. This is separate from memory-only Auth tokens. |
| `sessionStorage` | Pending Beacon route coordinates under `civicneuro_beacon_pending_path_v1`, with a creation time; expired after 30 minutes and removed when invalid/cleared. |
| Browser persistent storage | No other resident-app localStorage/sessionStorage use found. The custom Auth client does not write tokens to either store. |
| Temporary browser device access | GPS, microphone, camera, and contact chooser are permission-mediated. Snap & Say clears object URLs/media streams on exit. Beacon is designed to use live GPS while sharing; this is distinct from one-time report location. |

## 6. Existing database source state

### Migration files and checked-in schema

The repository has migration filenames `0001`–`0034`, but **0001–0027 are zero-byte files**: `0001_extensions_postgis_pgcron`, `0002_enums`, `0003_residents_and_platform_staff`, `0004_organisations_branches_departments_categories`, `0005_org_users`, `0006_reports`, `0007_report_media`, `0008_surveys_and_posts`, `0009_chat_messages`, `0010_beacon_connections_location_shares`, `0011_lifeline_cards`, `0012_audit_log_append_only`, `0013_invites_tokens`, `0014_consent_records`, `0015_quotas_and_rate_limits`, `0016_whatsapp_sessions`, `0017_ai_intake_sessions`, `0018_indexes`, `0019_rls_enable_deny_all`, `0020_retention_functions`, `0021_custom_access_token_hook`, `0022_mfa_aal2_enforcement`, `0023_storage_buckets_and_policies`, `0024_realtime_private_channels`, `0025_rpc_security_definer_functions`, `0026_pg_cron_schedules`, and `0027_revoke_public_grants`. At the time of the original discovery, only 0028–0031 contained SQL; Stage 1 drafts 0032–0034 are listed below and are not applied. The older filenames (PostGIS, reports, surveys, chat, WhatsApp, retention, storage, and other concepts) are not evidence that those objects exist in the database. All checked-in files under `supabase/policies/` are also zero bytes.

| Non-empty migration | Objects and observed columns/constraints | RLS / trigger notes |
|---|---|---|
| `0028_resident_profiles.sql` | `resident_profiles(id → auth.users, full_name, email, phone, address, notification_consent, privacy_consent_at, created_at, updated_at)` | RLS; own select/update only; grants authenticated select/update; auth-user trigger and backfill copy signup metadata. |
| `0029_beacon_contacts.sql` | `beacon_contacts(id, owner_id → auth.users, name, phone, phone_normalized, invitation_status, message_prepared_at, created_at, updated_at)`; unique owner/normalized phone; name 1–100; normalized phone 7–15 digits; invitation status `saved` or `message_prepared` | RLS own select/insert/update/delete; updated-at trigger. |
| `0030_lifeline_cards.sql` | `lifeline_cards(owner_id, id, name, icon, color, members JSONB, created_at, updated_at)`; composite primary key; name/id 1–100; icon allowlist; hex colour check; members array count 1–4 | RLS own select/insert/update/delete; updated-at trigger. |
| `0031_snap_and_say_reports.sql` | `reports` columns listed above | RLS resident insert/select/update own row; adds two private buckets, `audio-reports` and `image-reports`; authenticated owner-folder SELECT policies. |

The non-empty migration policies are `resident_profiles_select_own`, `resident_profiles_update_own`; `beacon_contacts_select_own`, `beacon_contacts_insert_own`, `beacon_contacts_update_own`, `beacon_contacts_delete_own`; `lifeline_cards_select_own`, `lifeline_cards_insert_own`, `lifeline_cards_update_own`, `lifeline_cards_delete_own`; and three policies on reports (resident own-row INSERT, SELECT, UPDATE). Storage has two policies: authenticated owner-folder SELECT on `audio-reports` and `image-reports`. The external `supabase/policies/` SQL files have names for audit log, branches, categories, chat, connections, consents, departments, invites, Lifeline, location shares, organisations, org users, platform staff, posts, quotas/rate limits, realtime, report media/reports, residents, storage, surveys, and survey responses, but are all empty and define no policy in this checkout.

Migration 0031 defines URL columns (`audio_url`, `image_url`) while the report-evidence requirement calls for private bucket plus object path. It writes object paths under the resident UUID for Snap & Say uploads and stores private storage URLs in the report row. Only SELECT policies for authenticated owners are present for those buckets in this migration; no resident storage insert policy is defined there because uploads use the service role.

No migration in the checked-in non-empty set creates `organizations`, staff/dashboard access, polls, surveys, posts, report updates, dispatch, push tokens, AI audit, consent history, abuse/rate-limit controls, incidents, or retention jobs. No migration creates or verifies PostGIS/pg_cron extensions despite filenames and architecture documentation suggesting those capabilities.

### Verified staging schema snapshot

On 11 October 2026, the linked project ref was verified as `gnwaaedtofazlkjkurea` (`civicneuro-staging`). `supabase db dump --schema public` was attempted but could not run because neither Docker nor Podman is available. The following inventory was instead queried read-only through the Supabase CLI's linked-project SQL API. No migration or schema change was applied.

All eight listed public tables had RLS enabled. Columns below include their deployed type; `!` means NOT NULL:

| Staging table | Deployed columns |
|---|---|
| `beacon_contacts` | `id: uuid!`, `owner_id: uuid!`, `name: text!`, `phone: text!`, `phone_normalized: text!`, `invitation_status: text!`, `message_prepared_at: timestamptz`, `created_at: timestamptz!`, `updated_at: timestamptz!` |
| `beacon_location_points` | `id: uuid!`, `session_id: uuid!`, `wa_id: varchar!`, `lat: numeric!`, `lng: numeric!`, `recorded_at: timestamptz!` |
| `beacon_sessions` | `id: uuid!`, `wa_id: varchar!`, `duration_minutes: integer!`, `status: varchar!`, `started_at: timestamptz!`, `expires_at: timestamptz!`, `stopped_at: timestamptz` |
| `lifeline_cards` | `owner_id: uuid!`, `id: text!`, `name: text!`, `icon: text!`, `color: text!`, `members: jsonb!`, `created_at: timestamptz!`, `updated_at: timestamptz!` |
| `reports` | `id: uuid!`, `wa_id: varchar!`, `reporter_name: varchar`, `organization_id: varchar`, `category: varchar!`, `description: text`, `location_lat: numeric`, `location_lng: numeric`, `location_name: text`, `media_url: text`, `source: varchar!`, `status: varchar!`, `created_at: timestamptz!` |
| `resident_profiles` | `id: uuid!`, `full_name: text!`, `email: text!`, `phone: text!`, `address: text!`, `notification_consent: boolean!`, `privacy_consent_at: timestamptz!`, `created_at: timestamptz!`, `updated_at: timestamptz!` |
| `whatsapp_conversations` | `wa_id: varchar!`, `state: varchar!`, `step_data: jsonb`, `updated_at: timestamptz!` |
| `whatsapp_messages_log` | `id: uuid!`, `wa_id: varchar`, `direction: varchar!`, `message_type: varchar`, `payload: jsonb`, `created_at: timestamptz!` |

There were no public views. The 18 observed policies were:

- `beacon_contacts`: own-row SELECT/INSERT/UPDATE/DELETE policies for `authenticated`.
- `beacon_location_points`: broad authenticated SELECT; service-role ALL.
- `beacon_sessions`: broad authenticated SELECT; service-role ALL.
- `lifeline_cards`: own-row SELECT/INSERT/UPDATE/DELETE policies for `authenticated`.
- `reports`: authenticated SELECT when `auth.role() = 'authenticated'`; service-role ALL.
- `resident_profiles`: own-row SELECT/UPDATE for `authenticated`.
- `whatsapp_conversations` and `whatsapp_messages_log`: service-role ALL.

One private bucket was returned: `callitin`, max file size 2 MiB, no MIME allowlist reported. The query found no storage policies.

**Beacon access proposal only — no table or policy changes drafted/applied:** the resident Beacon code has no direct query to `beacon_sessions` or `beacon_location_points`. Its live-share session is transient client state, its pending route is in `sessionStorage`, persisted circle/chat state is in `localStorage`, saved contacts use `beacon_contacts`, and route lookup uses `beacon-route`. Checked-in `beacon-share-session` and `beacon-connection` function files are zero bytes. The sessions/location tables are keyed by `wa_id`; they appear disconnected from in-app Beacon but cannot be proven WhatsApp-only from the checked-in code.

**Reports compatibility requirement:** the deployed `reports.wa_id` is NOT NULL. Stage 1 must alter it to nullable so app-originated reports can omit it, retain all existing report columns, and avoid modifying WhatsApp tables or the `whatsapp-webhook` function. A read-only count found one existing row (`source = 'WhatsApp'`, `status = 'New'`), one row with category, one with coordinates, and one with `media_url`. Preserve the old values, flag it `legacy`, and backfill available values into the new columns. Its non-empty `media_url` does not match any `storage.objects` path or supported Supabase Storage URL, so no safe `report_evidence` bucket/path can be derived; do not fabricate one or fetch an unknown external reference. Resolve this row's media pointer before applying the migration, or explicitly approve leaving it only in the retained legacy column.

## 7. Screen-to-data gap summary

| Screen / source | Inputs | Current destination | Main gap |
|---|---|---|---|
| Snap & Say | Required microphone audio; optional photo; GPS/accuracy/time; AI outputs | `snap-and-say` Edge → private audio/image buckets → `public.reports` | Signed-in only; no source/tracking/idempotency/evidence relation; private URLs in row; no shared report-form route. |
| Report an issue | Category, description, address/coordinates; also organisation, branch, photo, video in UI | `report-submit` endpoint (mock in mock mode) | No matching server function; media/org/branch dropped; only Snap & Say persists in checked-in code. |
| Guest report | Contact/method, org/branch/category/description, pin, CAPTCHA | `report-guest-submit` endpoint (mock in mock mode) | No matching server function or guest table; required contact is not durably saved; guest has no stable auth identity. |
| Track report | Reference, contact, CAPTCHA widget | `report-track` endpoint (mock by reference only) | No real handler, contact/CAPTCHA not verified in mock; no short secret code. |
| My reports/detail/thread | Search; text messages; optional action/reopen details; satisfaction | `reportsStore` fixtures in memory; some client wrappers make endpoint calls | Not a real resident-specific read/write path; optimistic changes may appear successful without server persistence. |
| Registration/account/profile | PII, credentials, consent and settings | Auth; `resident_profiles` registration trigger | Profile edit and notification settings do not save; preferences and consent versions incomplete. |
| Lifeline groups | Group name/icon/colour; member names/phones | `lifeline_cards` (direct Supabase CRUD) | Working current table; preserve/extend rather than replace blindly. |
| Beacon contacts | Contact name/phone; device contact picker | `beacon_contacts` (direct Supabase CRUD) and browser Beacon state | Working current table; confirm whether keeping duplicate local contact details is intended. |
| Beacon location and route | GPS, selected members, route search/path, chat text | `beacon-route` computes routes; pending drawn path in sessionStorage; circle/chat state in localStorage. `beacon_contacts` is direct Supabase CRUD. | The in-app Beacon client does not query `beacon_sessions` or `beacon_location_points`. Live-share state is kept in memory/localStorage and the checked-in `beacon-share-session`/`beacon-connection` function files are empty; the deployed table rows are not currently read by the resident feature. |
| Polls/surveys/news/community | Selected poll option; survey currently hard-coded answer; content | functions-client mock adapter | No durable schema/real function handler verified. Determine which UI features are real product scope before adding tables. |
| Notifications/settings | Filter/read actions; four checkboxes | in-memory notification fixture; settings controls are inert | No durable notifications/preferences/push token path found. |
| Account export/delete | Buttons and `DELETE` text confirmation | UI toast/navigation | No verified request reaches the account/privacy endpoints. |

## 8. Open questions before Stage 1

1. **Guest lookup policy:** confirmed: lookup codes do not expire and lock after five failed attempts. The hash is server-only; tracking-number-only lookup returns no report details.
2. **Applied/deployed state:** the staging tables, columns, policies, bucket, report source/status values, and migration history were queried on 11 October 2026 and are recorded above. The `db dump` could not run without Docker/Podman, and deployed Edge Function versions were not verified.
3. **Paused channel:** WhatsApp reporting is paused until business registration for the WhatsApp Business API. It is excluded from Stage 1; leave its tables and webhook unchanged. Revisit it only when the business registration is complete. QR reporting remains unverified and is not included without evidence of a wired-up flow.
4. **Other navigation persistence:** polls, surveys, community pulse, trending, news, and notifications currently use fixtures or inert controls rather than a verified persisted backend. They are not included in Stage 1 under the instruction to add only wired features. Beacon session/location tables are already present in staging but are not read by the resident Beacon code; no policy changes will be made until the owner/share proposal is approved.
5. **Staging verification limits:** staging ref `gnwaaedtofazlkjkurea` was linked and queried read-only. No migration has been applied. The complete `pg_dump` output and deployed Edge Function versions remain unverified. `supabase migration list --linked` shows remote migration `20260918000000` with no matching local migration, while local migrations `0001`–`0031` have no corresponding remote entries; resolve this history drift before applying a migration.

## 9. Stage 1 table inventory

These are grounded in explicit requirements in the request plus checked-in navigation. Existing names are noted to avoid destructive replacement.

`0032_core_reporting.sql` and `0033_guest_reporting.sql` are local drafts; neither is applied. No Beacon policy migration is drafted pending approval of the owner/share design. All later phase tables below remain proposed and unbuilt.

**Required reporting, identity, and staff workflow**

- `profiles` (migration/backfill from current `resident_profiles`, subject to the naming decision above)
- `reports`
- `report_evidence`
- `organizations`
- `report_events`
- `guest_contacts`
- `guest_report_lookup_secrets` (hash-only lookup credential, no expiry, lock after five failures)
- `staff_members`
- `report_updates`
- `dispatch_log`
- `notifications`
- `push_tokens`

**Required AI routing, privacy, and abuse controls**

- `issue_categories`
- `routing_rules`
- `ai_runs`
- `routing_corrections`
- `consents`
- `audit_log`
- `rate_limits`
- `user_flags`
- `incidents`
- `guest_contacts`

For `reports.source`, the observed resident inputs support `snap_and_say`, `report_form`, and `guest_report` as distinct source values. Beacon route/location sharing is not a report submission in the checked-in code, so it is not proposed as a report source unless an external intake is confirmed.

Guest claim and secret lookup can initially be represented by appropriately protected/hash-only report fields and authenticated ownership transitions unless discovery of the deployed system shows a separate claim table is required; no separate claim table is proposed without that evidence.

**Existing resident feature tables to retain**

- `beacon_contacts`
- `lifeline_cards`

**Existing tables and paths explicitly outside Stage 1**

- `whatsapp_conversations`, `whatsapp_messages_log`, and `whatsapp-webhook` (paused: awaiting business registration; leave unchanged).

**Other visible features excluded because persistence is not wired**

- Polls, poll votes, surveys, survey responses, news/content, and Beacon chat/session tables. Their screens are visible, but the checked-in client uses fixtures or local state and the corresponding write handlers are stubs. Existing staging Beacon session/location tables are retained unchanged; only the proposed broad read-policy removal is under consideration.

Stage 1 migrations are numbered and phase-scoped. Migrations 0032–0033 are drafts, not validated against a local PostgreSQL instance or applied. Do not apply them until the media reference is resolved, staging migration-history drift is reconciled, and the core SQL is reviewed.
