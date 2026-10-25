# Platform Admin dashboard handoff

- Organisation approvals — done. Reads organizations through the signed-in Supabase client; Approve/Reject invoke the existing `orgs-approve` Edge Function with the current session token. No application contact field is present in the current schema, so contact displays as unavailable.
