do $$
begin
  if to_regclass('public.beacon_sessions') is not null then
    execute 'revoke all privileges on table public.beacon_sessions from public, anon, authenticated';
  end if;
  if to_regclass('public.beacon_location_points') is not null then
    execute 'revoke all privileges on table public.beacon_location_points from public, anon, authenticated';
  end if;
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

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

notify pgrst, 'reload schema';
