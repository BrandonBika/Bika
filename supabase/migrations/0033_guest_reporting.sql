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
  lookup_code_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guest_contacts enable row level security;
alter table public.guest_report_lookup_secrets enable row level security;

revoke all on public.guest_contacts, public.guest_report_lookup_secrets from anon, authenticated;
grant select, delete on public.guest_contacts to authenticated;
grant update (phone, email, contact_preference, consent_to_updates, consent_revoked_at)
  on public.guest_contacts to authenticated;
grant all on public.guest_contacts, public.guest_report_lookup_secrets to service_role;
revoke all on public.guest_report_lookup_secrets from anon, authenticated;

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

create index if not exists guest_contacts_reporter_idx
  on public.guest_contacts (reporter_id, created_at desc);

create or replace function public.record_guest_lookup_failure(p_report_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_locked boolean;
begin
  update public.guest_report_lookup_secrets
  set failed_attempts = failed_attempts + 1,
      locked_at = case
        when failed_attempts + 1 >= 5 then coalesce(locked_at, now())
        else locked_at
      end
  where report_id = p_report_id
    and locked_at is null
    and failed_attempts < 5
  returning locked_at is not null into is_locked;

  if not found then
    return true;
  end if;
  return coalesce(is_locked, false);
end;
$$;

revoke all on function public.record_guest_lookup_failure(uuid) from public, anon, authenticated;
grant execute on function public.record_guest_lookup_failure(uuid) to service_role;

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

notify pgrst, 'reload schema';
