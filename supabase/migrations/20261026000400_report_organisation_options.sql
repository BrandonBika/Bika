alter table public.reports
  add column if not exists user_selected_organization_id uuid
    references public.organizations (id) on delete set null;

create or replace function public.list_report_organisations()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select organization.id, organization.name
  from public.organizations as organization
  where organization.status = 'approved'
    and organization.is_active
  order by organization.name asc;
$$;

revoke all on function public.list_report_organisations() from public, anon, authenticated;
grant execute on function public.list_report_organisations() to anon, authenticated;
