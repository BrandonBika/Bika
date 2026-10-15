revoke all privileges on table public.beacon_sessions
  from public, anon, authenticated;
revoke all privileges on table public.beacon_location_points
  from public, anon, authenticated;

revoke update on table public.resident_profiles
  from public, anon, authenticated;
revoke update (
  id,
  full_name,
  email,
  phone,
  address,
  notification_consent,
  privacy_consent_at,
  created_at,
  updated_at
) on table public.resident_profiles
  from public, anon, authenticated;

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
