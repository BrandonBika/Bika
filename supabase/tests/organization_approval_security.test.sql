begin;

create temp table organization_approval_test_users (
  label text primary key,
  id uuid not null,
  email text not null
);
create temp table organization_approval_test_results (
  test_name text primary key,
  passed boolean not null
);
create temp table organization_approval_test_orgs (
  label text primary key,
  id uuid not null
);
create temp table organization_approval_test_reports (
  id uuid not null
);

grant all on organization_approval_test_users,
  organization_approval_test_results,
  organization_approval_test_orgs,
  organization_approval_test_reports
  to anon, authenticated, service_role;

insert into organization_approval_test_users (label, id, email)
values
  ('admin', gen_random_uuid(), 'approval-admin@example.invalid'),
  ('resident', gen_random_uuid(), 'approval-resident@example.invalid');

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb
from organization_approval_test_users;

insert into public.platform_staff (user_id, role, full_name)
select id, 'platform_admin', 'Approval Test Admin'
from organization_approval_test_users
where label = 'admin';

insert into public.organizations (name, type, jurisdiction_level)
values
  ('Approval Test Approved', 'municipality', 'local'),
  ('Approval Test Pending', 'municipality', 'local');

insert into organization_approval_test_orgs (label, id)
select 'approved', id
from public.organizations
where name = 'Approval Test Approved';

insert into organization_approval_test_orgs (label, id)
select 'pending', id
from public.organizations
where name = 'Approval Test Pending';

insert into public.reports (source)
values ('organization_approval_security_test');

insert into organization_approval_test_reports (id)
select id
from public.reports
where source = 'organization_approval_security_test';

create function pg_temp.set_organization_approval_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id
  from organization_approval_test_users
  where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.set_organization_approval_claims('admin');
select public.approve_organization(
  (select id from organization_approval_test_orgs where label = 'approved'),
  'approved'
);

select pg_temp.set_organization_approval_claims('resident');
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.approve_organization(
      (select id from organization_approval_test_orgs where label = 'pending'),
      'approved'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into organization_approval_test_results
  values ('non-admin cannot approve an organization', denied);

  with registered as (
    insert into public.organizations (name, type, jurisdiction_level, submitted_by)
    values ('Approval Registration Test', 'municipality', 'local', (select auth.uid()))
    returning status, is_active
  )
  insert into organization_approval_test_results
  select
    'new organization registration defaults to pending and inactive',
    status = 'pending' and not is_active
  from registered;
end;
$$;

select pg_temp.set_organization_approval_claims('admin');
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.staff_reassign_report(
      (select id from organization_approval_test_reports limit 1),
      (select id from organization_approval_test_orgs where label = 'pending'),
      null
    );
  exception when invalid_parameter_value then
    denied := true;
  end;
  insert into organization_approval_test_results
  values ('pending organization cannot be assigned a report', denied);
end;
$$;

reset role;
do $$
declare
  denied boolean := false;
begin
  begin
    update public.reports
    set assigned_organization_id = (
      select id from organization_approval_test_orgs where label = 'pending'
    )
    where id = (select id from organization_approval_test_reports limit 1);
  exception when check_violation then
    denied := true;
  end;
  insert into organization_approval_test_results
  values ('database trigger rejects pending organization assignment', denied);
end;
$$;

insert into organization_approval_test_results
select
  'approval writes an actor/status audit row',
  exists (
    select 1
    from public.organization_status_audit as audit
    join organization_approval_test_orgs as test_org
      on test_org.id = audit.organization_id
    where test_org.label = 'approved'
      and audit.old_status = 'pending'
      and audit.new_status = 'approved'
      and audit.actor_id = (
        select id from organization_approval_test_users where label = 'admin'
      )
  );

select test_name, passed
from organization_approval_test_results
order by test_name;

rollback;
