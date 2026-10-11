# Beacon implementation status

Assessment date: 2026-10-10

## Summary

The original task was to inspect the partially completed Beacon feature against
`beacon-tab-build-prompt.txt` and `beacon-tab-layout-map.html`, determine where
the previous agent stopped, and continue from there.

The Beacon feature has progressed beyond the original UI handoff: the main
screens, Leaflet maps, route drawing/search, location handling, and off-path
state logic are implemented. It is not production-complete. Most circle,
request, chat, session-sharing, contacts, and notification behavior still uses
local mock data; there is no real multi-user live-location backend or push
delivery. The acceptance checklist in the build prompt has not been marked
complete, and the required device/viewport accessibility verification has not
been performed.

## What has been implemented

- Beacon main screen, circle/live tabs, add/search, requests, chat, share-mode
  chooser, draw-path, share confirmation, live-session, and contacts-flow
  screens exist.
- Leaflet/OpenStreetMap maps are used for Beacon. Route search and walking
  routes go through an authenticated `beacon-route` Edge Function, configured
  for self-hosted Nominatim-compatible and OSRM-compatible services. Mock
  routes are marked as demo data and cannot be shared.
- Path drawing supports undo/clear, route extension, distance/time estimates,
  and an accessible destination-search/map-selection alternative.
- Browser geolocation uses a high-accuracy watch, reports permission/errors,
  exposes retry guidance, and displays freshness/accuracy status during a
  session.
- Off-path state uses the specified thresholds: more than 100 m from the path,
  accuracy under 50 m, 20 seconds of sustained evidence, and 30 seconds inside
  before re-arming. Repeated evaluations of one cached fix do not count as
  multiple observations.
- Arrival handling checks a fresh fix with accuracy under 50 m within 50 m of
  the final path coordinate for "Until I arrive" sessions.
- Active session data (including its path) is no longer saved to
  `localStorage`; pending drawn paths use `sessionStorage` with a 30-minute
  expiry.
- The live screen no longer starts a mock session when opened without one, and
  its simulation controls were removed.
- Recent accessibility work added keyboard operation/focus treatment and
  enlarged targets on the share confirmation and Beacon main screens. Mobile
  page zoom is enabled in the PWA HTML and build template.

## What is incomplete or needs fixing

| Priority | Area | Current status / remaining work |
|---|---|---|
| Blocker for production | Real live sharing | Session creation, selected-member sharing, and location delivery are local client state. Implement authenticated server-side session APIs and real-time position delivery restricted to selected, accepted members. |
| Blocker for production | Circle requests | Search/request/accept/decline currently mutate local fixture state. Implement server-backed discoverable-profile search and request lifecycle, with authorization and cross-user behavior. |
| Blocker for production | Chat | Messages are local mock chat data. Implement persistent, authorized, real-time message delivery and read state. |
| Blocker for production | Safety verification | Off-path checks run only on the sharer's device. The prompt calls for server-side verification; implement that verification and server-owned off-path event/session state before treating alerts as production safety signals. |
| High | Location accuracy UX | Off-path alerts correctly pause unless accuracy is under 50 m, but session start currently accepts fixes up to the shared 1,000 m maximum. The live marker can still display a coarse fix. Decide whether start should require a tighter threshold or clearly confirm degraded sharing accuracy. Test outdoors/indoors and on supported devices. |
| High | Arrival robustness | Arrival currently ends on a single qualifying fix. Consider requiring sustained/confirmed arrival to reduce GPS jitter false positives. Verify that routes always end at the actual selected destination coordinate. |
| High | Background/OS behavior | The PWA watches location while the page is active; no Android foreground service/notification or iOS native background-location integration exists. Define a supported foreground-only behavior or implement platform-native support; do not promise background sharing from the current web implementation. |
| High | Notifications and alert feedback | Push notifications/deep links, haptic/sound alert feedback, and cross-device notifications are not implemented. Off-path notices are local chat entries only. |
| High | Device contacts | Contacts permission explainer/allow/deny screens and contact lists are simulated. There is no native device-contact picker, real permission API integration, or hashed contact-matching service. Keep name/phone search available without contacts permission. |
| Medium | Outgoing request destinations | The share-confirm member list uses current circle members. Confirm the originating "share with this member" flow only offers accepted members and handles removed or stale members safely on the server. |
| Medium | Session end behavior | Stop, timer, and arrival have local end messages, but server session closure, cross-device notification, route/session cleanup, and authoritative end reasons are not wired. |
| Medium | Network/offline behavior | Starting while offline is blocked, but queued/retried requests and messages and recovery for an active sharing session are not implemented as specified. |
| Medium | Accessibility coverage | Keyboard support and target sizing were improved on a subset of Beacon screens. Audit all controls (requests, contacts, chat cards, drawing tools, map alternatives, navigation), labels, focus order, screen-reader announcements, and reduced-motion behavior. |
| Medium | Visual/viewport verification | Required checks at 320 px, 430 px, and 130% text scaling, plus light-map visual review, have not been completed. Design-token/color/size compliance has not been systematically measured. |
| Medium | Product/privacy decisions | Confirm concurrent-session policy, location/path retention, and whether any alert escalation is ever intended. Do not add emergency escalation without product/legal approval. |

## Beacon page-specific fixes still needed

These are the remaining user-facing Beacon screen and flow issues, separate
from replacing the mock backend:

| Screen / flow | What still needs fixing |
|---|---|
| Beacon main / location prompt | Location permission and retry UX need device testing for browsers that do not support the Permissions API and for previously denied permission. The map currently keeps/zooms to approximate fixes until they exceed the 1,000 m warning threshold; show the actual accuracy clearly and avoid presenting a coarse position as precise. |
| Beacon main / map and sheet | Replace fixture member pins/statuses with live, authorized positions; verify map fitting and pin-to-member selection/scroll behavior on real coordinate data. Verify sheet collapse/expand/drag and empty states at small screens and text zoom. |
| Add to circle / search | Default empty-query results currently come from local demo profiles. Replace them with the discoverable-profile service, and implement loading, request failure, rate-limit, and retry states. Confirm the user cannot request or share with an undiscoverable, already-pending, or already-accepted profile. |
| Requests / add flow | Incoming/outgoing requests are local fixtures; make accept, decline, duplicate detection, and pending status server-authoritative. Remove fixtures from production and verify both the Requests screen and Add screen update consistently after an action. |
| Contacts permission / find contacts | The Allow/Don't allow dialog only changes an in-app flag; it is not the native contacts permission prompt, and the list is fixture data rather than selected device contacts. Implement a supported native/device contact flow and private matching, or revise the copy so it does not promise behavior the web build cannot provide. |
| Share mode / start confirmation | Validate selected recipients as accepted circle members on the server. Improve low-accuracy start messaging: the current 1,000 m allowance is much coarser than the 50 m needed for off-path alerts and arrival. Explain the effect before starting or require a suitably precise fix. |
| Draw path / accessible alternative | Deploy and configure the private geocoder/router for real destinations; test provider timeouts, no-result and unreachable routes, and ensure the route endpoint exactly matches the selected destination. Demo routes remain non-shareable by design. |
| Chat | Replace local message cards/bubbles with persistent real-time conversations; add sending, failed/retry, offline, and read/unread states. Verify that session cards only open a session the viewer is authorized to see. |
| Live session | The position shown is the sharer's page-local geolocation; no other member receives it. Add authorized real-time delivery, clear sharing status when updates are stale, and verify stopping/timer/arrival ends sharing for everyone. |
| Arrival | Current automatic arrival is based on one fresh fix within 50 m of the final route point. Confirm route endpoint correctness and consider requiring a sustained or repeated fix before automatically ending a safety session. |
| Off-path alert | Client threshold/dwell/re-arm behavior is implemented, but members do not get a real push or server-verified event. Add server verification and real alert delivery; add the specified one-time haptic/sound feedback only where supported and permitted. |
| All Beacon screens | Finish keyboard and screen-reader audit beyond the main and confirmation screens: focus management in dialogs, accessible names/states, target sizes, map alternatives, reduced motion, and recovery/error announcements. |
| All Beacon screens | Complete visual checks at 320 px and 430 px widths and 130% text scaling, including long names, large system fonts, keyboard-open chat, small-height viewports, contrast, and map readability. Record any observed clipping or overlap and fix before marking acceptance. |

## Build-prompt acceptance checklist status

| Acceptance item | Status |
|---|---|
| Beacon main map, title, add action, pins, sheet | Implemented as a UI/demo; real positions are not shared from a server. |
| Sheet tabs/counts/member rows/live state | Implemented against local fixture data. |
| Add-to-circle search, contacts entry, results, pending states | UI implemented; underlying people/requests are mock/local. |
| Request/accept lifecycle and sharing only after acceptance | UI/local flow exists; no cross-user or server enforcement. |
| Chat header, cards, bubbles, share action | UI implemented; delivery is local/mock. |
| Share-mode chooser | Implemented; permission preflight behavior needs device validation. |
| Draw path, distance/time, edit/undo/clear, accessible alternative | Implemented; real routing requires the private services to be deployed/configured. |
| Start confirmation and selection/duration/alert controls | Implemented locally; server-side authorization is absent. |
| Live session, position, stop/timer/arrival | UI and local lifecycle exist; no live multi-user stream/background service. |
| Off-path detection/banner/re-arm/update path | Client logic implemented and unit tested; server verification, push, haptic/sound, and cross-user alert delivery are missing. |
| Contacts explainer/permission/find/denied | Screens exist; native OS permission and real matching are simulated. |
| Bottom navigation visibility by screen | Implemented in app shell; still needs visual verification against all required screens. |
| Design token/color/size compliance | Not comprehensively verified. |
| 320/430 widths, 130% text, light map | Not yet verified on browser/device. |

## Handoff finding

The previous agent's exact stopping point cannot be reconstructed from the
source alone. The repository contains substantial Beacon implementation and
work from later continuation sessions. At the start of the latest work, the
notable gaps included inaccurate/immediate off-path alert behavior and the
fake accessible-route alternative. These have since been addressed at the
client/UI level. The current handoff is therefore: finish production
integrations and verification above, rather than restarting the Beacon UI.

## Validation performed during this work

- Most recent full project test run: 61 tests passed, 0 failed.
- Beacon source-policy checks, secret scan, and CSP checks passed.
- Project-wide lint completed with existing warnings and no errors in the
  targeted changed JavaScript.
- No real device GPS, native contacts prompt, deployed route provider,
  multi-account session, push notification, or 320/430/130% visual run was
  verified in this environment.
