update public.organizations
set status = case
  when is_active then 'approved'
  when status = 'approved' then 'pending'
  else status
end;

alter table public.organizations
  drop constraint if exists organizations_status_active_consistency;

alter table public.organizations
  add constraint organizations_status_active_consistency
  check (
    (status = 'approved' and is_active)
    or (status in ('pending', 'rejected') and not is_active)
  );

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
  v_old_status text;
  v_new_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform admin access is required'
      using errcode = '42501';
  end if;

  if p_active is null then
    raise exception 'Active state is required'
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

  if p_active then
    if v_old_status <> 'approved' then
      raise exception 'Only approved organizations can be activated'
        using errcode = '22023';
    end if;
    update public.organizations
    set is_active = true
    where id = p_organization_id;
    return;
  end if;

  v_new_status := case when v_old_status = 'approved' then 'pending' else v_old_status end;
  update public.organizations
  set status = v_new_status,
      is_active = false
  where id = p_organization_id;

  if v_new_status <> v_old_status then
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
      v_new_status
    );
  end if;
end;
$$;

revoke all on function public.staff_set_organization_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.staff_set_organization_active(uuid, boolean)
  to authenticated;
