# Bika demo handoff

## Page status by profile

“Partial” means the page is implemented but has a documented capability gap or still requires the pending database/deployment setup below. No page uses mock rows.

| Page / flow | Platform Admin | Platform Employee | Org Admin | Org Employee |
|---|---|---|---|---|
| Sign-in, session guard, sign-out | Done | Done | Done | Done |
| Forgot / reset password | Done | Done | Done | Done |
| Dashboard and report map | Done | Done | Partial | Partial |
| Report sheet | Done | Done | Partial | Partial |
| Report detail and status/history | Done | Done | Partial | Partial |
| Organisation approvals | Done | Not available | Not available | Not available |
| Posts | Not available | Not available | Not available | Not available |
| Chat | Not available | Not available | Partial | Partial |
| Surveys / polls | Not available | Not available | Not available | Not available |
| Analytics | Partial | Partial | Partial | Partial |
| Export data | Partial | Partial | Partial | Partial |
| My profile | Done | Done | Partial | Partial |
| Platform activity | Done | Not available | Not available | Not available |
| Pilot mode | Not available | Not available | Not available | Not available |
| Manage profiles / members | Not available | Not available | Partial | Not available |
| System settings | Not available | Not available | Partial | Not available |
| Platform team | Not available | Not available | Not available | Not available |
| Organisation registration and pending page | Not available | Not available | Partial | Not available |
| Employee invitation / accept / create password | Not available | Not available | Partial | Partial |
| Invitation expired page | Not available | Not available | Done | Done |
| Session-expired page | Not available | Not available | Done | Done |

### Honest gaps

- Platform Posts, Surveys, Chat, Pilot mode, Manage profiles, System settings, and Platform team have no backing data/workflow; they show “Not available yet” and have no fake controls. Platform survey/poll exports are similarly unavailable. Report CSV/GeoJSON/print exports use real report queries.
- Platform Analytics is real report data; active-user count is unavailable. Export is Partial because only report/map exports are real.
- Org Posts and Surveys have no backing tables and remain unavailable/view-only. Org Chat queries signed-in conversation membership and allows replies, but no organisation-to-conversation assignment exists, so an organisation may have no threads.
- Org Analytics, Report sheet/detail, profile/member lists, and CSV/GeoJSON exports query Supabase through the signed-in client. Report visibility and mutations rely on migrations 002/003 below; these database paths have not been exercised against live Supabase.
- Manage profiles lists real `organization_members` rows and can invite an employee; editing/deactivation is unavailable. Profile details are read-only. System settings shows a real read-only organisation profile; services, departments, and boundary configuration are unavailable.
- Employees have eight sidebar pages. UI route guards hide Manage profiles and System settings; database policy/RPC authorization restricts member listing and report reassignment. Employees can update report status and internal notes but cannot reassign.
- Registration creates an Auth account in the browser, then calls `orgs-register` with the signed-in token. With Confirm email enabled, the applicant must confirm and sign in before the pending organisation row is created. Disable Confirm email for the immediate live demo path.
- Invitation rows expire after seven days in the database. Supabase Auth’s own invite-link expiry and email delivery are project settings; links may expire sooner. A real SMTP/Auth email configuration and the invitation redirect URL are required.

## Database changes to apply

The already-applied `20261024000100_organization_approval_gate.sql` is not repeated. Paste these new additive migrations into the live SQL Editor, in order:

1. `../supabase/migrations/20261025000100_organization_status_active_consistency.sql`
2. `../supabase/migrations/20261025000200_organization_membership_rbac.sql`
3. `../supabase/migrations/20261025000300_organization_invitations.sql`

Migration effects and risk:

- `001`: backfills status/active mismatches, replaces the named status/active CHECK constraint, and revokes then re-grants execution on `staff_set_organization_active`. No row deletion/truncation. The backfill and constraint validation take locks on `organizations`; schedule during low write activity. Admin deactivation of an approved organisation moves it to pending, so its members lose access until it is approved again.
- `002`: creates membership/RPCs and organization-scoped RLS. It drops/recreates only these named policies: `organization_members_select_self_or_admin`, `organizations_select_member`, `reports_select_organization_members`, `report_events_select_organization_members`, `report_evidence_select_organization_members`. It revokes broad table/function privileges, then grants the required access. No `DELETE`, `TRUNCATE`, or table drop. The membership foreign keys use `ON DELETE CASCADE`; deleting an auth user or organisation removes its membership rows. Existing org accounts are not automatically backfilled into memberships and will not gain access until linked.
- `003`: creates the invitation table and service-role-only acceptance RPC; it revokes direct client access. No `DELETE`, `TRUNCATE`, or table/policy drop. Invitation rows cascade on deletion of their organisation, invited user, or inviter. No existing membership is changed.

SQL security tests are in `supabase/tests/organization_approval_security.test.sql`, `organization_membership_security.test.sql`, and `organization_invitation_security.test.sql`. They have not been run against a database. No migrations were applied by this work.

## Deployment

`supabase/config.toml` now explicitly maps the JavaScript entrypoints and sets `verify_jwt = false`; each handler validates the bearer token itself. From the repository root, after `supabase login`, deploy with the live project ref:

```powershell
npx supabase link --project-ref <PROJECT_REF>
npx supabase functions deploy orgs-register --project-ref <PROJECT_REF> --no-verify-jwt
npx supabase functions deploy orgs-approve --project-ref <PROJECT_REF> --no-verify-jwt
npx supabase functions deploy orgs-invite --project-ref <PROJECT_REF> --no-verify-jwt
npx supabase functions deploy orgs-invitation-accept --project-ref <PROJECT_REF> --no-verify-jwt
```

`<PROJECT_REF>` is not recorded in this repository; obtain it from the Supabase project settings. No deployment workflow is configured. The invitation function requires `SUPABASE_SERVICE_ROLE_KEY` in the Edge Function runtime (Supabase commonly injects it; verify without exposing the value). Set `ALLOWED_ORIGINS` as an Edge Function secret to the exact production origins, comma-separated. Do not place a service-role key in the browser or host build environment.

## Owner checklist before demo

- [ ] In SQL Editor, apply migrations 001, 002, and 003 in the order above. Verify each completes; do not re-run the already-applied 20261024 migration.
- [ ] Deploy the four functions above; verify `orgs-register`, `orgs-approve`, `orgs-invite`, and `orgs-invitation-accept` are active.
- [ ] In the hosting project’s production environment, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public anon key only), then build with `npm run build` and publish `dist/`.
- [ ] In Supabase Edge Function secrets, set exact `ALLOWED_ORIGINS` for the production app/admin origins. Confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and the service-role runtime secret are available to functions without printing any secret.
- [ ] In Supabase Auth URL Configuration, set the production Site URL and allow `https://<host>/org-dashboard/?page=reset-password` and `https://<host>/org-dashboard/?page=invitation` (or a narrowly scoped `/org-dashboard/*` pattern).
- [ ] For immediate org registration, turn **Confirm email off** in Supabase Auth. If it stays on, confirm the registration email and sign in before the org application is actually submitted. Confirm production SMTP can send reset and invitation emails.
- [ ] Verify Auth invite-link expiry configuration. The database rejects invitations after seven days, but Auth may expire its email token earlier.

## Five-minute demo click-through

1. Open `/org-dashboard/?page=register`; register a fresh organisation/admin account using the three steps. With Confirm email off, show the Application pending page.
2. Sign in as the existing Platform Admin, open Organisation approvals, and approve that pending application.
3. Return to the pending page and choose Check status; sign in as the new org admin. Show Dashboard and its real empty states/map, then Report sheet with Active/Historical tabs.
4. In Platform Admin, assign a real existing report to the approved org (or submit a real resident report first). Open the org Report sheet and detail; update status and add an internal note.
5. From org-admin Manage profiles, invite an employee. Follow the real email link, create a password, then sign in as that employee. Show the reduced eight-page sidebar, employee status update, “Permission denied” reassignment state, and hidden admin-only pages.

If no real reports exist, the dashboard and report sheet should remain honestly empty; do not seed mock rows for the demo.
