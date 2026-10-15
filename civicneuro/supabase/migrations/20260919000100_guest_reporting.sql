create table if not exists public.guest_contacts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  phone text,
  email text,
  contact_preference text not null check (contact_preference in ('sms', 'email')),
  consent_to_updates boolean not null default true,
  consented_at timestamptz not null,
  consent_policy_version text not null,
  consent_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_contacts_requires_contact
    check (phone is not null or email is not null),
  constraint guest_contacts_method_matches_contact
    check (
      (contact_preference = 'sms' and phone is not null)
      or (contact_preference = 'email' and email is not null)
    ),
  constraint guest_contacts_consent_state
    check (
      (consent_to_updates and consent_revoked_at is null)
      or (not consent_to_updates and consent_revoked_at is not null)
    )
);

create table if not exists public.guest_report_lookup_secrets (
  report_id uuid primary key references public.reports (id) on delete cascade,
  lookup_code_hash text not null check (lookup_code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.guest_report_lookup_secrets.lookup_code_hash is
  'Lowercase hex HMAC-SHA-256 using the Edge Function GUEST_LOOKUP_HMAC_KEY secret, of a lookup code generated with at least 8 characters from a 32-character alphabet; never store the plaintext code. No default key is provided.';

create table if not exists public.guest_report_lookup_attempts (
  report_id uuid not null references public.guest_report_lookup_secrets (report_id) on delete cascade,
  requester_key_hash text not null,
  ip_key_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (report_id, requester_key_hash)
);

create table if not exists public.guest_report_lookup_report_counters (
  report_id uuid primary key references public.guest_report_lookup_secrets (report_id) on delete cascade,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  captcha_required boolean not null default false,
  slow_down_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.guest_report_lookup_ip_counters (
  ip_key_hash text primary key,
  failed_attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  captcha_required boolean not null default false,
  slow_down_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key_hash text not null,
  request_count integer not null default 0 check (request_count >= 0),
  window_started_at timestamptz not null default now(),
  slow_down_until timestamptz,
  captcha_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key_hash)
);

alter table public.guest_contacts enable row level security;
alter table public.guest_report_lookup_secrets enable row level security;
alter table public.guest_report_lookup_attempts enable row level security;
alter table public.guest_report_lookup_report_counters enable row level security;
alter table public.guest_report_lookup_ip_counters enable row level security;
alter table public.rate_limits enable row level security;

revoke all on public.guest_contacts, public.guest_report_lookup_secrets,
  public.guest_report_lookup_attempts, public.guest_report_lookup_report_counters,
  public.guest_report_lookup_ip_counters, public.rate_limits from anon, authenticated;
grant select, delete on public.guest_contacts to authenticated;
grant update (phone, email, contact_preference, consent_to_updates, consent_revoked_at)
  on public.guest_contacts to authenticated;
grant all on public.guest_contacts, public.guest_report_lookup_secrets,
  public.guest_report_lookup_attempts, public.guest_report_lookup_report_counters,
  public.guest_report_lookup_ip_counters, public.rate_limits to service_role;

drop policy if exists guest_contacts_select_own on public.guest_contacts;
create policy guest_contacts_select_own
  on public.guest_contacts for select to authenticated
  using (reporter_id = auth.uid());

drop policy if exists guest_contacts_update_own on public.guest_contacts;
create policy guest_contacts_update_own
  on public.guest_contacts for update to authenticated
  using (reporter_id = auth.uid())
  with check (reporter_id = auth.uid());

drop policy if exists guest_contacts_delete_own on public.guest_contacts;
create policy guest_contacts_delete_own
  on public.guest_contacts for delete to authenticated
  using (reporter_id = auth.uid());

drop policy if exists guest_contacts_service_role_all on public.guest_contacts;
create policy guest_contacts_service_role_all
  on public.guest_contacts for all to service_role
  using (true)
  with check (true);

drop policy if exists guest_report_lookup_secrets_service_role_all on public.guest_report_lookup_secrets;
create policy guest_report_lookup_secrets_service_role_all
  on public.guest_report_lookup_secrets for all to service_role
  using (true)
  with check (true);

drop policy if exists guest_report_lookup_attempts_service_role_all on public.guest_report_lookup_attempts;
create policy guest_report_lookup_attempts_service_role_all
  on public.guest_report_lookup_attempts for all to service_role
  using (true)
  with check (true);

drop policy if exists guest_report_lookup_report_counters_service_role_all on public.guest_report_lookup_report_counters;
create policy guest_report_lookup_report_counters_service_role_all
  on public.guest_report_lookup_report_counters for all to service_role
  using (true)
  with check (true);

drop policy if exists guest_report_lookup_ip_counters_service_role_all on public.guest_report_lookup_ip_counters;
create policy guest_report_lookup_ip_counters_service_role_all
  on public.guest_report_lookup_ip_counters for all to service_role
  using (true)
  with check (true);

drop policy if exists rate_limits_service_role_all on public.rate_limits;
create policy rate_limits_service_role_all
  on public.rate_limits for all to service_role
  using (true)
  with check (true);

create index if not exists guest_contacts_reporter_idx
  on public.guest_contacts (reporter_id, created_at desc);

create or replace function public.record_guest_lookup_failure_for_requester(
  p_report_id uuid,
  p_requester_key_hash text,
  p_ip_key_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked_until timestamptz;
  v_report_failures integer;
  v_ip_failures integer;
  v_captcha_required boolean;
  v_slow_down_until timestamptz;
  v_report_window_started_at timestamptz;
  v_ip_captcha_required boolean;
  v_ip_slow_down_until timestamptz;
  v_ip_window_started_at timestamptz;
begin
  if p_requester_key_hash is null or btrim(p_requester_key_hash) = ''
     or p_ip_key_hash is null or btrim(p_ip_key_hash) = '' then
    raise exception 'Requester and IP key hashes are required';
  end if;

  insert into public.guest_report_lookup_attempts (
    report_id,
    requester_key_hash,
    ip_key_hash,
    failed_attempts
  )
  values (p_report_id, p_requester_key_hash, p_ip_key_hash, 1)
  on conflict (report_id, requester_key_hash) do update
  set failed_attempts = case
        when guest_report_lookup_attempts.locked_until > now()
          then guest_report_lookup_attempts.failed_attempts
        when guest_report_lookup_attempts.locked_until is not null then 1
        else least(guest_report_lookup_attempts.failed_attempts + 1, 5)
      end,
      locked_until = case
        when guest_report_lookup_attempts.locked_until > now()
          then guest_report_lookup_attempts.locked_until
        when guest_report_lookup_attempts.locked_until is not null
          then null
        when guest_report_lookup_attempts.failed_attempts >= 4
          then now() + interval '15 minutes'
        else null
      end,
      updated_at = now()
  returning locked_until into v_locked_until;

  insert into public.guest_report_lookup_report_counters (report_id, failed_attempts)
  values (p_report_id, 1)
  on conflict (report_id) do update
  set failed_attempts = case
        when guest_report_lookup_report_counters.window_started_at < now() - interval '15 minutes' then 1
        else guest_report_lookup_report_counters.failed_attempts + 1
      end,
      window_started_at = case
        when guest_report_lookup_report_counters.window_started_at < now() - interval '15 minutes' then now()
        else guest_report_lookup_report_counters.window_started_at
      end,
      captcha_required = case
        when guest_report_lookup_report_counters.window_started_at < now() - interval '15 minutes' then false
        else guest_report_lookup_report_counters.captcha_required
      end,
      slow_down_until = case
        when guest_report_lookup_report_counters.window_started_at < now() - interval '15 minutes' then null
        else guest_report_lookup_report_counters.slow_down_until
      end,
      updated_at = now()
  returning failed_attempts, captcha_required, slow_down_until, window_started_at
    into v_report_failures, v_captcha_required, v_slow_down_until, v_report_window_started_at;

  if v_report_failures >= 5 then
    v_captcha_required := true;
    v_slow_down_until := now() + interval '30 seconds';
    update public.guest_report_lookup_report_counters
    set captcha_required = true,
        slow_down_until = v_slow_down_until,
        updated_at = now()
    where report_id = p_report_id;
  end if;

  insert into public.guest_report_lookup_ip_counters (ip_key_hash, failed_attempts)
  values (p_ip_key_hash, 1)
  on conflict (ip_key_hash) do update
  set failed_attempts = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then 1
        else guest_report_lookup_ip_counters.failed_attempts + 1
      end,
      window_started_at = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then now()
        else guest_report_lookup_ip_counters.window_started_at
      end,
      captcha_required = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then false
        when guest_report_lookup_ip_counters.failed_attempts + 1 >= 20 then true
        else guest_report_lookup_ip_counters.captcha_required
      end,
      slow_down_until = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then null
        when guest_report_lookup_ip_counters.failed_attempts + 1 >= 20
          then now() + interval '30 seconds'
        else guest_report_lookup_ip_counters.slow_down_until
      end,
      updated_at = now()
  returning failed_attempts, captcha_required, slow_down_until, window_started_at
    into v_ip_failures, v_ip_captcha_required, v_ip_slow_down_until, v_ip_window_started_at;

  return jsonb_build_object(
    'report_requester_locked_until', v_locked_until,
    'report_failure_count', v_report_failures,
    'report_window_started_at', v_report_window_started_at,
    'captcha_required', v_captcha_required,
    'slow_down_until', v_slow_down_until,
    'ip_failure_count', v_ip_failures,
    'ip_window_started_at', v_ip_window_started_at,
    'ip_captcha_required', v_ip_captcha_required,
    'ip_slow_down_until', v_ip_slow_down_until
  );
end;
$$;

revoke all on function public.record_guest_lookup_failure_for_requester(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_guest_lookup_failure_for_requester(uuid, text, text)
  to service_role;

create or replace function public.clear_guest_lookup_attempt_on_success(
  p_report_id uuid,
  p_requester_key_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.guest_report_lookup_attempts
  where report_id = p_report_id
    and requester_key_hash = p_requester_key_hash;
$$;

revoke all on function public.clear_guest_lookup_attempt_on_success(uuid, text)
  from public, anon, authenticated;
grant execute on function public.clear_guest_lookup_attempt_on_success(uuid, text)
  to service_role;

drop trigger if exists rate_limits_updated_at on public.rate_limits;
create trigger rate_limits_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();

create or replace function public.record_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.report_events (
      report_id,
      event_type,
      actor_id,
      to_status,
      to_organization_id,
      to_reporter_id,
      to_reporter_type
    )
    values (
      new.id,
      'report_created',
      auth.uid(),
      new.status,
      new.assigned_organization_id,
      new.reporter_id,
      new.reporter_type
    );
    return new;
  end if;

  if old.status is distinct from new.status
     or old.assigned_organization_id is distinct from new.assigned_organization_id
     or old.reporter_id is distinct from new.reporter_id
     or old.reporter_type is distinct from new.reporter_type then
    event_name := case
      when old.reporter_type = 'guest' and new.reporter_type = 'resident' then 'guest_report_claimed'
      when old.status is distinct from new.status
       and old.assigned_organization_id is distinct from new.assigned_organization_id
        then 'status_and_assignment_changed'
      when old.status is distinct from new.status then 'status_changed'
      when old.assigned_organization_id is distinct from new.assigned_organization_id
        then 'assignment_changed'
      else 'reporter_changed'
    end;
    insert into public.report_events (
      report_id,
      event_type,
      actor_id,
      from_status,
      to_status,
      from_organization_id,
      to_organization_id,
      from_reporter_id,
      to_reporter_id,
      from_reporter_type,
      to_reporter_type
    )
    values (
      new.id,
      event_name,
      auth.uid(),
      old.status,
      new.status,
      old.assigned_organization_id,
      new.assigned_organization_id,
      old.reporter_id,
      new.reporter_id,
      old.reporter_type,
      new.reporter_type
    );
  end if;
  return new;
end;
$$;

alter table public.report_events
  add column if not exists from_reporter_id uuid references auth.users (id) on delete set null,
  add column if not exists to_reporter_id uuid references auth.users (id) on delete set null,
  add column if not exists from_reporter_type text,
  add column if not exists to_reporter_type text;

drop trigger if exists reports_record_events on public.reports;
create trigger reports_record_events
  after insert or update of status, assigned_organization_id, reporter_id, reporter_type
  on public.reports
  for each row execute function public.record_report_event();

drop trigger if exists guest_contacts_updated_at on public.guest_contacts;
create trigger guest_contacts_updated_at
  before update on public.guest_contacts
  for each row execute function public.set_updated_at();

drop trigger if exists guest_report_lookup_secrets_updated_at on public.guest_report_lookup_secrets;
create trigger guest_report_lookup_secrets_updated_at
  before update on public.guest_report_lookup_secrets
  for each row execute function public.set_updated_at();

drop trigger if exists guest_report_lookup_attempts_updated_at on public.guest_report_lookup_attempts;
create trigger guest_report_lookup_attempts_updated_at
  before update on public.guest_report_lookup_attempts
  for each row execute function public.set_updated_at();

drop trigger if exists guest_report_lookup_report_counters_updated_at on public.guest_report_lookup_report_counters;
create trigger guest_report_lookup_report_counters_updated_at
  before update on public.guest_report_lookup_report_counters
  for each row execute function public.set_updated_at();

drop trigger if exists guest_report_lookup_ip_counters_updated_at on public.guest_report_lookup_ip_counters;
create trigger guest_report_lookup_ip_counters_updated_at
  before update on public.guest_report_lookup_ip_counters
  for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
