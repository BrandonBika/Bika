alter table public.resident_profiles
  add column if not exists report_status_updates_sms boolean not null default false,
  add column if not exists community_safety_alerts boolean not null default false,
  add column if not exists ward_councillor_bulletins boolean not null default false,
  add column if not exists beacon_circle_requests boolean not null default false;

update public.resident_profiles
set report_status_updates_sms = notification_consent,
    community_safety_alerts = notification_consent,
    ward_councillor_bulletins = notification_consent,
    beacon_circle_requests = notification_consent;

create or replace function public.create_resident_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_consent boolean;
begin
  if not coalesce(new.raw_user_meta_data ? 'privacy_consent_at', false) then
    return new;
  end if;

  v_notification_consent := coalesce((new.raw_user_meta_data ->> 'notification_consent')::boolean, false);

  insert into public.resident_profiles (
    id,
    full_name,
    email,
    phone,
    address,
    notification_consent,
    privacy_consent_at,
    report_status_updates_sms,
    community_safety_alerts,
    ward_councillor_bulletins,
    beacon_circle_requests
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    v_notification_consent,
    coalesce((new.raw_user_meta_data ->> 'privacy_consent_at')::timestamptz, now()),
    v_notification_consent,
    v_notification_consent,
    v_notification_consent,
    v_notification_consent
  );
  return new;
end;
$$;

revoke all on function public.create_resident_profile() from public, anon, authenticated;

create or replace function public.sync_auth_email_to_resident_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.resident_profiles
    set email = new.email
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_auth_email_to_resident_profile() from public, anon, authenticated;

drop trigger if exists auth_user_email_sync_resident_profile on auth.users;
create trigger auth_user_email_sync_resident_profile
  after update of email on auth.users
  for each row execute function public.sync_auth_email_to_resident_profile();

revoke update on public.resident_profiles from public, anon, authenticated;
revoke update (
  id,
  full_name,
  email,
  phone,
  address,
  notification_consent,
  privacy_consent_at,
  created_at,
  updated_at,
  report_status_updates_sms,
  community_safety_alerts,
  ward_councillor_bulletins,
  beacon_circle_requests
) on public.resident_profiles from public, anon, authenticated;

grant update (
  full_name,
  phone,
  address,
  report_status_updates_sms,
  community_safety_alerts,
  ward_councillor_bulletins,
  beacon_circle_requests
) on public.resident_profiles to authenticated;

notify pgrst, 'reload schema';
