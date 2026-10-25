# CivicNeuro — Resident Progressive Web App (PWA)

## Overview
CivicNeuro Resident PWA is a secure, mobile-first web application designed for South African residents to report civic issues (potholes, water leaks, power outages, sanitation), participate in ward polls and surveys, access emergency Lifeline services, and safely share live walking routes via Beacon.

## Running Locally
To launch the local development server:
```bash
node tools/dev-server.js
```
Then open [http://localhost:3000/apps/resident-pwa/index.html](http://localhost:3000/apps/resident-pwa/index.html) in your browser.

## Supabase Setup
The resident app reads its public Supabase configuration from
`apps/resident-pwa/runtime-config.js`. Set the project URL and **anon/publishable
key** there for local use and configure the same values in the deployed runtime
config. Never put a `service_role` key in browser code.

```js
const runtimeConfig = {
  env: 'development',
  useMock: false,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};

export default runtimeConfig;
```

Apply `supabase/migrations/0028_resident_profiles.sql` to the project (for
example, with the Supabase CLI or SQL Editor). It creates the resident profile
table, a signup trigger, and row-level policies that restrict profile reads and
updates to the signed-in resident. Signup stores the profile and consent
metadata; Supabase sends the email verification link. In Supabase Auth settings,
enable email confirmations and add the local PWA URL and production PWA URL to
the allowed redirect URLs. The password reset flow also returns to the PWA.
Until the profile migration is applied, sign-in can read the profile fields
saved in Supabase Auth user metadata; all authentication still requires a valid
Supabase account and password.

The app uses Supabase Auth and PostgREST directly for resident authentication
and profile reads. Other resident operations call Edge Functions at the same
configured project URL. The checked-in runtime config uses live mode;
`useMock: true` intentionally enables demo fixtures for non-auth features.
Mock authentication is disabled and never accepts credentials.

## Private Beacon routing services
The `beacon-route` Edge Function keeps place search and route planning behind
the authenticated CivicNeuro endpoint. Configure these server-side environment
variables when deploying it:

- `BEACON_GEOCODER_URL`: base URL for a self-hosted Nominatim-compatible
  geocoder.
- `BEACON_ROUTING_URL`: base URL for a self-hosted OSRM-compatible router.
- `BEACON_ROUTING_PROFILE`: router profile to use; defaults to `foot`.

The route function sends search text and the selected start/destination
coordinates only to these configured services. Do not point these settings at
public providers for production use. With `useMock: true`, the app returns
clearly labelled demo places/routes; demo routes cannot be shared.

## Beacon location accuracy
Beacon requests browser geolocation with high accuracy enabled, no cached fix,
and a 30-second timeout. While Beacon Home is open it keeps a location watch
active and displays the reported accuracy and uncertainty circle; an
approximate fix is never labelled as a verified position. A fix under 50 m
allows sharing normally. A fix from 50 m through 150 m requires explicit
confirmation; off-path alerts and automatic arrival detection remain paused
until a fresh fix is under 50 m. Accuracy over 150 m blocks sharing, but users
can retry or choose a route start on the map. A map-selected start does not
count as verified live GPS or bypass the sharing accuracy gate.

Beacon keeps listening while its page is open, replaces its watch on Retry,
and stops it when leaving the page. If no fix under 50 m arrives for 60 seconds,
Beacon explains that the device may be using network/IP location and suggests
checking precise location and trying near a window or outdoors. For temporary
phone diagnostics in a development build only, add `?geodebug=1` to the app URL
(or `&geodebug=1` to the Beacon hash route). Production builds ignore this flag.
The panel reports permission, accuracy, fix count, and errors, but never includes
coordinates or sends the report to a server.

For real-device testing, open Beacon over HTTPS (localhost is also a secure
context), grant location permission to the browser or installed app being
tested, and check device-level precise-location settings. On Android, check
Location and Google Location Accuracy; on iOS, check Location Services and
Precise Location for the browser. Desktop browsers and DevTools device
emulation do not provide phone GPS; inspect DevTools Sensors for a location
override and disable any VPN when checking IP-based fallback results. If the
app is embedded, check that the iframe permits geolocation and that the
deployment's Permissions-Policy allows it.

## Beacon contacts
Beacon routes currently display a coming-soon notice. Circle requests, chat,
and live location are not delivered to other people or stored on a server, so
their controls are hidden until those features are backed by server storage.
The separate `beacon_contacts` table stores only explicitly selected contact
details when that flow is enabled; it does not store circle requests, chat, or
live location. The contact picker and invite controls are currently
unavailable. If re-enabled, preparing an invite opens the device messaging app
but does not confirm delivery, registration, or circle acceptance. The
owner-scoped table and policies are defined in
`supabase/migrations/0029_beacon_contacts.sql`.

## Lifeline cards and contacts
Lifeline keeps the Crime, Fire, Sickness, and GBV starter cards visible as
examples. Use the edit button on a starter card to customize its saved numbers;
that customization is stored privately for the signed-in resident and does not
change the shared starter example. Create a personal group using **Type a
number** or **Add from contacts**; only the selected people are added to that
group and saved with it to the signed-in resident's account. The full phone
address book is not copied.
Apply `supabase/migrations/0030_lifeline_cards.sql` in the Supabase SQL Editor
to enable owner-scoped card storage. Lifeline card loading and saving use the
authenticated Supabase data API rather than the Lifeline card Edge Functions,
so group creation does not depend on the failing Edge Function CORS setup.

## Route List
- **Welcome & Auth**: `#welcome`, `#sign-in`, `#register`, `#verify-email`, `#forgot-password`, `#reset-password`, `#session-expired`
- **Guest Flows**: `#guest-report`, `#guest-confirmation`, `#track-report`
- **Main Hub**: `#home`, `#menu`, `#notifications` (`#alerts` remains a legacy alias)
- **Report Lifecycle**: `#report-new`, `#report-duplicate-check`, `#report-submitted`, `#my-reports` (Track), `#report-detail`, `#report-thread`, `#report-satisfaction`, `#report-reopen-escalate`
- **Voice / AI**: `#snap-and-say`
- **Safety & Lifeline**: `#lifeline-home`, `#lifeline-call-countdown`, `#lifeline-calling-status`, `#lifeline-card-create`, `#lifeline-card-edit`, `#lifeline-contacts-picker`, `#contacts-permission`
- **Beacon**: `#beacon-home`, `#beacon-add-to-circle`, `#beacon-requests`, `#beacon-find-contacts`, and `#beacon-chat` support the Circle and chat flows. Live-location and route-sharing screens redirect to a prototype notice; location and alerts are not delivered to other people.
- **Ward & Community**: `#your-area`, `#polls`, `#poll-detail`, `#community-pulse`, `#trending-issues`, `#news`, `#news-article`, `#survey`, `#survey-submitted`, `#safety-info`, `#help-and-safety`
- **Account & POPIA**: `#account`, `#profile-edit`, `#badges-edit`, `#notification-settings`, `#language`, `#terms`, `#privacy-policy`, `#contacts`, `#data-export`, `#delete-account`, `#pilot-org-select`

The Notifications feed currently uses in-memory sample data for its UI and
interaction flow. Remote notification loading, read-state persistence, push or
websocket delivery, pull-to-refresh, and server pagination need a notifications
service endpoint before they can be connected.

## Security & POPIA Safeguards
- **Zero innerHTML / outerHTML / eval**: All DOM nodes rendered via `@civicneuro/security-web` helpers.
- **In-Memory Tokens**: Zero tokens, passwords, or live coordinates stored in localStorage or cookies.
- **Log Redaction**: Automatic stripping of phone numbers, emails, coordinates, and tokens before logging.
- **Offline Reports**: Report payloads, including captured media Blobs, are persisted in IndexedDB for reconnect retries.
- **Emergency Protection**: 3-second mandatory countdown before Lifeline dial intents.

## Snap & Say
The Snap & Say flow is available from the resident home screen and follows the quick-report sequence:

- Snap & Say requires a signed-in resident account so the server can attach the report to the authenticated resident.
- Step 1: ask for camera, microphone and location permission with plain-language explanations.
- Step 2: capture or retake a photo as evidence, or choose **Skip photo**.
- Step 3: press and hold the record button to speak in South African languages or a mix; release to submit automatically, slide away to cancel, and discard recordings under 1 second.
- Step 4: upload the media and GPS to the backend. Gemini transcribes and classifies the audio and optional photo in a background request; the confirmation screen polls the saved report and then shows the original transcript, English translation, issue type, urgency, and emergency links when applicable. Whisper is not used by this flow.
- The immediate receipt is explicitly marked as analysing and does not present a placeholder category as the result. If analysis fails or times out, the resident is told that a person will review the report.
- If the device is offline or the endpoint returns a server error, the audio and optional photo Blobs are queued in IndexedDB and retried on reconnect. Validation/client errors are shown without queuing.

Required backend config for the Supabase function includes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`.
