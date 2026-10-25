create table if not exists public.organization_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role text not null check (role in ('org_admin', 'org_employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_members_organization_id_idx
  on public.organization_members (organization_id, created_at);

alter table public.organization_members enable row level security;
revoke all on public.organization_members from public, anon, authenticated;
grant select on public.organization_members to authenticated;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as member
    where member.user_id = (select auth.uid())
      and member.organization_id = p_organization_id
      and member.is_active
  );
$$;

create or replace function public.is_organization_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members as member
    where member.user_id = (select auth.uid())
      and member.organization_id = p_organization_id
      and member.role = 'org_admin'
      and member.is_active
  );
$$;

revoke all on function public.is_organization_member(uuid) from public, anon, authenticated;
revoke all on function public.is_organization_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid) to authenticated;

drop policy if exists organization_members_select_self_or_admin on public.organization_members;
create policy organization_members_select_self_or_admin
  on public.organization_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_organization_admin(organization_id)
  );

drop policy if exists organizations_select_member on public.organizations;
grant select on public.organizations to authenticated;
create policy organizations_select_member
  on public.organizations for select to authenticated
  using (public.is_organization_member(id));

drop policy if exists reports_select_organization_members on public.reports;
create policy reports_select_organization_members
  on public.reports for select to authenticated
  using (
    assigned_organization_id is not null
    and public.organization_is_approved(assigned_organization_id)
    and public.is_organization_member(assigned_organization_id)
  );

drop policy if exists report_events_select_organization_members on public.report_events;
grant select on public.report_events to authenticated;
create policy report_events_select_organization_members
  on public.report_events for select to authenticated
  using (
    exists (
      select 1
      from public.reports as report
      where report.id = report_id
        and report.assigned_organization_id is not null
        and public.organization_is_approved(report.assigned_organization_id)
        and public.is_organization_member(report.assigned_organization_id)
    )
    or public.is_platform_staff()
  );

drop policy if exists report_evidence_select_organization_members on public.report_evidence;
create policy report_evidence_select_organization_members
  on public.report_evidence for select to authenticated
  using (
    exists (
      select 1
      from public.reports as report
      where report.id = report_id
        and report.assigned_organization_id is not null
        and public.organization_is_approved(report.assigned_organization_id)
        and public.is_organization_member(report.assigned_organization_id)
    )
  );

create or replace function public.register_organization(
  p_name text,
  p_type text,
  p_jurisdiction_level text,
  p_province text default null,
  p_municipality text default null
)
returns table (id uuid, name text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_org_id uuid;
  v_org_name text;
  v_status text;
  v_member_role text;
  v_member_active boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = ''
     or length(btrim(p_name)) > 120
     or p_type is null or btrim(p_type) = ''
     or length(btrim(p_type)) > 120
     or p_jurisdiction_level is null or btrim(p_jurisdiction_level) = ''
     or length(btrim(p_jurisdiction_level)) > 120
     or (p_province is not null and length(btrim(p_province)) > 120)
     or (p_municipality is not null and length(btrim(p_municipality)) > 120) then
    raise exception 'Organization registration details are invalid'
      using errcode = '22023';
  end if;

  select member.organization_id, member.role, member.is_active
    into v_org_id, v_member_role, v_member_active
  from public.organization_members as member
  where member.user_id = v_user_id
  for update;

  if found then
    if v_member_role <> 'org_admin' or not v_member_active then
      raise exception 'This account already belongs to an organization'
        using errcode = '23505';
    end if;

    return query
    select organization.id, organization.name, organization.status
    from public.organizations as organization
    where organization.id = v_org_id;
    return;
  end if;

  select organization.id, organization.name, organization.status
    into v_org_id, v_org_name, v_status
  from public.organizations as organization
  where organization.submitted_by = v_user_id
  order by organization.created_at desc
  limit 1
  for update;

  if not found then
    insert into public.organizations (
      name,
      type,
      jurisdiction_level,
      province,
      municipality,
      submitted_by,
      status,
      is_active
    )
    values (
      btrim(p_name),
      btrim(p_type),
      btrim(p_jurisdiction_level),
      nullif(btrim(p_province), ''),
      nullif(btrim(p_municipality), ''),
      v_user_id,
      'pending',
      false
    )
    returning organizations.id, organizations.name, organizations.status
      into v_org_id, v_org_name, v_status;
  end if;

  insert into public.organization_members (user_id, organization_id, role)
  values (v_user_id, v_org_id, 'org_admin');

  return query select v_org_id, v_org_name, v_status;
end;
$$;

revoke all on function public.register_organization(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_organization(text, text, text, text, text)
  to authenticated;

create or replace function public.organization_update_report(
  p_report_id uuid,
  p_status text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_current_status text;
  v_event_id uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  if p_status is null or p_status not in (
    'Pending Dispatch', 'Needs Review', 'Dispatched', 'Acknowledged',
    'In Progress', 'Resolved', 'Rejected', 'Duplicate'
  ) then
    raise exception 'Report status is invalid'
      using errcode = '22023';
  end if;

  if v_note is not null and length(v_note) > 2000 then
    raise exception 'Internal note is too long'
      using errcode = '22023';
  end if;

  select report.assigned_organization_id, report.status
    into v_organization_id, v_current_status
  from public.reports as report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found'
      using errcode = 'P0002';
  end if;

  if v_organization_id is null
     or not public.organization_is_approved(v_organization_id)
     or not public.is_organization_member(v_organization_id) then
    raise exception 'Organization membership is required'
      using errcode = '42501';
  end if;

  if v_current_status is distinct from p_status then
    update public.reports
    set status = p_status
    where id = p_report_id;

    select event.id
      into v_event_id
    from public.report_events as event
    where event.report_id = p_report_id
      and event.event_type = 'status_changed'
      and event.actor_id = (select auth.uid())
      and event.to_status = p_status
    order by event.created_at desc, event.id desc
    limit 1;
  elsif v_note is not null then
    insert into public.report_events (report_id, event_type, note, actor_id)
    values (p_report_id, 'internal_note', v_note, (select auth.uid()))
    returning id into v_event_id;
  end if;

  if v_note is not null and v_event_id is not null and v_current_status is distinct from p_status then
    update public.report_events
    set note = v_note
    where id = v_event_id;
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.organization_update_report(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.organization_update_report(uuid, text, text)
  to authenticated;

create or replace function public.organization_reassign_report(
  p_report_id uuid,
  p_organization_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_organization_id uuid;
  v_event_id uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  select report.assigned_organization_id
    into v_from_organization_id
  from public.reports as report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception 'Report not found'
      using errcode = 'P0002';
  end if;

  if v_from_organization_id is null
     or not public.is_organization_admin(v_from_organization_id)
     or not public.organization_is_approved(v_from_organization_id) then
    raise exception 'Organization Admin access is required'
      using errcode = '42501';
  end if;

  if not public.organization_is_approved(p_organization_id) then
    raise exception 'Target organization must be approved and active'
      using errcode = '22023';
  end if;

  if v_from_organization_id = p_organization_id then
    raise exception 'Report is already assigned to this organization'
      using errcode = '22023';
  end if;

  if v_note is not null and length(v_note) > 2000 then
    raise exception 'Internal note is too long'
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

  if v_note is not null then
    update public.report_events
    set note = v_note
    where id = v_event_id;
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.organization_reassign_report(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.organization_reassign_report(uuid, uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
