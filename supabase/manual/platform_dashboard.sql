-- Platform dashboard staff access and narrowly scoped staff RPCs.
-- Apply manually in the Supabase SQL Editor after reviewing the target project.

create table if not exists public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('platform_admin', 'platform_employee')),
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.platform_staff enable row level security;

revoke all on public.platform_staff from public, anon, authenticated;
grant select on public.platform_staff to authenticated;

drop policy if exists platform_staff_select_own on public.platform_staff;
create policy platform_staff_select_own
  on public.platform_staff for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff as staff
    where staff.user_id = (select auth.uid())
      and staff.is_active
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff as staff
    where staff.user_id = (select auth.uid())
      and staff.is_active
      and staff.role = 'platform_admin'
  );
$$;

revoke all on function public.is_platform_staff() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from public, anon, authenticated;
grant execute on function public.is_platform_staff() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists platform_staff_select_all_for_admins on public.platform_staff;
create policy platform_staff_select_all_for_admins
  on public.platform_staff for select to authenticated
  using (public.is_platform_admin());

-- Table grants permit PostgREST SELECT; the policies below restrict which rows
-- staff can read. No direct staff UPDATE grant or broad write policy is added.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.reports',
    'public.report_evidence',
    'public.report_events',
    'public.organizations',
    'public.guest_contacts'
  ]
  loop
    if to_regclass(v_table) is not null then
      execute format('grant select on table %s to authenticated', v_table);
    end if;
  end loop;
end;
$$;

drop policy if exists platform_staff_select_reports on public.reports;
create policy platform_staff_select_reports
  on public.reports for select to authenticated
  using (public.is_platform_staff());

drop policy if exists platform_staff_select_report_evidence on public.report_evidence;
create policy platform_staff_select_report_evidence
  on public.report_evidence for select to authenticated
  using (public.is_platform_staff());

drop policy if exists platform_staff_select_report_events on public.report_events;
create policy platform_staff_select_report_events
  on public.report_events for select to authenticated
  using (public.is_platform_staff());

drop policy if exists platform_staff_select_organizations on public.organizations;
create policy platform_staff_select_organizations
  on public.organizations for select to authenticated
  using (public.is_platform_staff());

drop policy if exists platform_staff_select_guest_contacts on public.guest_contacts;
create policy platform_staff_select_guest_contacts
  on public.guest_contacts for select to authenticated
  using (public.is_platform_staff());

do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists platform_staff_select_profiles on public.profiles';
    execute 'create policy platform_staff_select_profiles
      on public.profiles for select to authenticated
      using (public.is_platform_staff())';
  end if;

  if to_regclass('public.resident_profiles') is not null then
    execute 'drop policy if exists platform_staff_select_resident_profiles on public.resident_profiles';
    execute 'create policy platform_staff_select_resident_profiles
      on public.resident_profiles for select to authenticated
      using (public.is_platform_staff())';
  end if;
end;
$$;

drop policy if exists platform_staff_select_report_evidence_objects on storage.objects;
create policy platform_staff_select_report_evidence_objects
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-evidence'
    and public.is_platform_staff()
  );

-- Relies on trigger record_report_event(); event_type assignment_changed.
create or replace function public.staff_reassign_report(
  p_report_id uuid,
  p_organization_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_organization_id uuid;
  v_organization_active boolean;
  v_event_id uuid;
begin
  if not public.is_platform_staff() then
    raise exception 'Platform staff access is required'
      using errcode = '42501';
  end if;

  select report.assigned_organization_id
    into v_from_organization_id
  from public.reports as report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found'
      using errcode = 'P0002';
  end if;

  select organization.is_active
    into v_organization_active
  from public.organizations as organization
  where organization.id = p_organization_id
  for share;

  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;

  if not v_organization_active then
    raise exception 'Organization is inactive'
      using errcode = '22023';
  end if;

  if v_from_organization_id is not distinct from p_organization_id then
    raise exception 'Report is already assigned to this organization'
      using errcode = '22023';
  end if;

  update public.reports
  set assigned_organization_id = p_organization_id
  where id = p_report_id;

  select event.id
    into v_event_id
  from public.report_events as event
  where event.report_id = p_report_id
    and event.event_type = 'assignment_changed'
    and event.actor_id = (select auth.uid())
  order by event.created_at desc, event.id desc
  limit 1;

  if v_event_id is null then
    raise exception 'Assignment event was not recorded; trigger record_report_event() may be missing'
      using errcode = 'P0001';
  end if;

  if p_note is not null and btrim(p_note) <> '' then
    update public.report_events
    set note = btrim(p_note)
    where id = v_event_id;
  end if;

  return v_event_id;
end;
$$;

create or replace function public.staff_set_organization_active(
  p_organization_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_organizations integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access is required'
      using errcode = '42501';
  end if;

  update public.organizations
  set is_active = p_active
  where id = p_organization_id;

  get diagnostics v_updated_organizations = row_count;
  if v_updated_organizations = 0 then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.staff_reassign_report(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.staff_set_organization_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.staff_reassign_report(uuid, uuid, text)
  to authenticated;
grant execute on function public.staff_set_organization_active(uuid, boolean)
  to authenticated;

-- Staff account setup:
-- 1. Create each staff account in Supabase Auth.
-- 2. Copy each Auth user's UUID, then run one INSERT per person, for example:
--    insert into public.platform_staff (user_id, role, full_name)
--    values ('<AUTH_USER_UUID>', 'platform_admin', '<ADMIN_NAME>');
--    insert into public.platform_staff (user_id, role, full_name)
--    values ('<AUTH_USER_UUID>', 'platform_employee', '<EMPLOYEE_NAME>');
-- 3. Keep the UUIDs unique; only active rows with these roles can access staff
--    data. Do not put a service-role key in browser configuration.
