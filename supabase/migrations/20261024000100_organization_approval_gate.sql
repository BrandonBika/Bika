alter table public.organizations
  add column if not exists status text not null default 'pending',
  add column if not exists submitted_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_status_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

update public.organizations
set status = 'approved'
where is_active
  and status = 'pending';

alter table public.organizations
  alter column is_active set default false;

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

create table if not exists public.organization_status_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  old_status text not null check (old_status in ('pending', 'approved', 'rejected')),
  new_status text not null check (new_status in ('pending', 'approved', 'rejected')),
  changed_at timestamptz not null default now()
);

alter table public.organization_status_audit enable row level security;
revoke all on public.organization_status_audit from public, anon, authenticated;
grant select on public.organization_status_audit to authenticated;

drop policy if exists organization_status_audit_select_admin on public.organization_status_audit;
create policy organization_status_audit_select_admin
  on public.organization_status_audit for select to authenticated
  using (public.is_platform_admin());

create or replace function public.approve_organization(
  p_organization_id uuid,
  p_new_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status text;
  v_audit_id uuid;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Platform Admin access is required'
      using errcode = '42501';
  end if;

  if p_new_status is null or p_new_status not in ('approved', 'rejected') then
    raise exception 'Organization status must be approved or rejected'
      using errcode = '22023';
  end if;

  select organization.status
    into v_old_status
  from public.organizations as organization
  where organization.id = p_organization_id
  for update;

  if not found then
    raise exception 'Organization not found'
      using errcode = 'P0002';
  end if;

  if v_old_status <> 'pending' then
    raise exception 'Only pending organizations can be reviewed'
      using errcode = '22023';
  end if;

  update public.organizations
  set status = p_new_status,
      is_active = (p_new_status = 'approved')
  where id = p_organization_id;

  insert into public.organization_status_audit (
    organization_id,
    actor_id,
    old_status,
    new_status
  )
  values (
    p_organization_id,
    (select auth.uid()),
    v_old_status,
    p_new_status
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.approve_organization(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_organization(uuid, text) to authenticated;

create or replace function public.organization_is_approved(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations as organization
    where organization.id = p_organization_id
      and organization.status = 'approved'
      and organization.is_active
  );
$$;

revoke all on function public.organization_is_approved(uuid) from public, anon, authenticated;
grant execute on function public.organization_is_approved(uuid) to authenticated, service_role;

create or replace function public.organization_name_is_approved(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations as organization
    where lower(btrim(organization.name)) = lower(btrim(p_name))
      and organization.status = 'approved'
      and organization.is_active
  );
$$;

revoke all on function public.organization_name_is_approved(text) from public, anon, authenticated;
grant execute on function public.organization_name_is_approved(text) to service_role;

create or replace function public.enforce_approved_report_organizations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_organization_id is not null
     and not public.organization_is_approved(new.assigned_organization_id) then
    raise exception 'Assigned organization must be approved and active'
      using errcode = '23514';
  end if;

  if new.recommended_organization_id is not null
     and not public.organization_is_approved(new.recommended_organization_id) then
    raise exception 'Recommended organization must be approved and active'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_approved_report_organizations() from public, anon, authenticated;

drop trigger if exists reports_require_approved_organizations on public.reports;
create trigger reports_require_approved_organizations
  before insert or update of assigned_organization_id, recommended_organization_id
  on public.reports
  for each row execute function public.enforce_approved_report_organizations();

drop policy if exists organizations_select_active on public.organizations;
create policy organizations_select_active
  on public.organizations for select to anon, authenticated
  using (is_active and status = 'approved');

drop policy if exists organizations_select_own_pending on public.organizations;
create policy organizations_select_own_pending
  on public.organizations for select to authenticated
  using (status = 'pending' and submitted_by = (select auth.uid()));

drop policy if exists organizations_insert_pending on public.organizations;
create policy organizations_insert_pending
  on public.organizations for insert to authenticated
  with check (
    status = 'pending'
    and not is_active
    and submitted_by = (select auth.uid())
  );

revoke insert, update, delete on public.organizations from anon, authenticated;
grant insert (name, type, jurisdiction_level, province, municipality, submitted_by)
  on public.organizations to authenticated;

alter table public.report_events
  add column if not exists note text;

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
  v_event_id uuid;
begin
  if not public.is_platform_staff() then
    raise exception 'Platform staff access is required'
      using errcode = '42501';
  end if;

  if not public.organization_is_approved(p_organization_id) then
    raise exception 'Organization must be approved and active'
      using errcode = '22023';
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
    raise exception 'Assignment event was not recorded'
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

revoke all on function public.staff_reassign_report(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.staff_reassign_report(uuid, uuid, text)
  to authenticated;

drop policy if exists reports_update_approved_organization on public.reports;
create policy reports_update_approved_organization
  on public.reports for update to authenticated
  using (public.is_platform_staff())
  with check (
    public.is_platform_staff()
    and (
      assigned_organization_id is null
      or public.organization_is_approved(assigned_organization_id)
    )
    and (
      recommended_organization_id is null
      or public.organization_is_approved(recommended_organization_id)
    )
  );
