# Staging smoke-test cleanup

Run cleanup only against the staging project and only with the exact test
report, anonymous-user, and storage-object identifiers printed by that test.
Do not use broad timestamp-only deletes for shared IP rate-limit keys.

Remove the single evidence object first:

```powershell
npx supabase --experimental --yes storage rm --linked --project-ref gnwaaedtofazlkjkurea 'ss:///report-evidence/<user-id>/<report-id>/<file-name>'
```

Then remove lookup state and the marked report and anonymous Auth user:

```sql
DO $$
BEGIN
  DELETE FROM public.guest_report_lookup_attempts
  WHERE report_id = '<report-id>';

  DELETE FROM public.guest_report_lookup_report_counters
  WHERE report_id = '<report-id>';

  DELETE FROM public.reports
  WHERE id = '<report-id>'
    AND reporter_id = '<user-id>'
    AND description LIKE '%<unique-CN-STAGING-SMOKE-marker>%';

  DELETE FROM auth.users
  WHERE id = '<user-id>'
    AND is_anonymous = true;
END
$$;
```

Run SQL with:

```powershell
npx supabase db query --linked "<SQL>"
```

Confirm that rows are gone from `reports`, `report_evidence`, `report_events`,
`guest_report_lookup_secrets`, `guest_contacts`, `guest_report_lookup_attempts`,
`guest_report_lookup_report_counters`, and `auth.users`, and confirm that the
specific object path is absent from `storage.objects`.

The reporting rate-limit keys are HMACs, not linked to a report by foreign key.
Delete a `guest-user-15m` or `guest-user-daily` row only when its exact key can
be tied to the test user and test run. IP-scoped rows may be shared by other
users; do not remove them using timestamps alone.
