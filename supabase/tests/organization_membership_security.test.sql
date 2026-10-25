begin;

create temp table organization_membership_test_users (
  label text primary key,
  id uuid not null,
  email text not null
);
create temp table organization_membership_test_results (
  test_name text primary key,
  passed boolean not null
);
create temp table organization_membership_test_orgs (
  label text primary key,
  id uuid not null
);
create temp table organization_membership_test_reports (
  label text primary key,
  id uuid not null
);

grant all on organization_membership_test_users,
  organization_membership_test_results,
  organization_membership_test_orgs,
  organization_membership_test_reports
  to anon, authenticated, service_role;

insert into organization_membership_test_users (label, id, email)
values
  ('admin_a', gen_random_uuid(), 'org-admin-a@example.invalid'),
  ('employee_a', gen_random_uuid(), 'org-employee-a@example.invalid'),
  ('admin_b', gen_random_uuid(), 'org-admin-b@example.invalid'),
  ('pending_admin', gen_random_uuid(), 'org-pending-admin@example.invalid'),
  ('registrant', gen_random_uuid(), 'org-registrant@example.invalid');

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb
from organization_membership_test_users;

insert into public.organizations (name, type, jurisdiction_level, status, is_active)
values
  ('Membership Org A', 'municipality', 'local', 'approved', true),
  ('Membership Org B', 'municipality', 'local', 'approved', true),
  ('Membership Pending Org', 'municipality', 'local', 'pending', false);

insert into organization_membership_test_orgs (label, id)
select 'org_a', id from public.organizations where name = 'Membership Org A';
insert into organization_membership_test_orgs (label, id)
select 'org_b', id from public.organizations where name = 'Membership Org B';
insert into organization_membership_test_orgs (label, id)
select 'pending_org', id from public.organizations where name = 'Membership Pending Org';

insert into public.organization_members (user_id, organization_id, role)
select test_user.id, test_org.id, membership.role
from (values
  ('admin_a', 'org_a', 'org_admin'),
  ('employee_a', 'org_a', 'org_employee'),
  ('admin_b', 'org_b', 'org_admin'),
  ('pending_admin', 'pending_org', 'org_admin')
) as membership(user_label, org_label, role)
join organization_membership_test_users as test_user
  on test_user.label = membership.user_label
join organization_membership_test_orgs as test_org
  on test_org.label = membership.org_label;

insert into public.reports (source, assigned_organization_id)
select 'report_form', id
from organization_membership_test_orgs
where label in ('org_a', 'org_b');

insert into organization_membership_test_reports (label, id)
select
  case organization.name
    when 'Membership Org A' then 'report_a'
    else 'report_b'
  end,
  report.id
from public.reports as report
join public.organizations as organization
  on organization.id = report.assigned_organization_id
where organization.name in ('Membership Org A', 'Membership Org B');

create function pg_temp.set_organization_membership_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id
  from organization_membership_test_users
  where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.set_organization_membership_claims('employee_a');

insert into organization_membership_test_results
select
  'employee reads only reports for their organization',
  (select count(*) = 1 from public.reports
    where id = (select id from organization_membership_test_reports where label = 'report_a'))
  and
  (select count(*) = 0 from public.reports
    where id = (select id from organization_membership_test_reports where label = 'report_b'));

insert into organization_membership_test_results
select
  'employee reads their membership but not other members',
  (select count(*) = 1 from public.organization_members
    where user_id = (select id from organization_membership_test_users where label = 'employee_a'))
  and
  (select count(*) = 0 from public.organization_members
    where user_id = (select id from organization_membership_test_users where label = 'admin_a'));

select pg_temp.set_organization_membership_claims('pending_admin');
insert into organization_membership_test_results
select 'pending organization members receive no report data',
  (select count(*) = 0 from public.reports);

do $$
declare
  denied boolean := false;
begin
  begin
    perform public.organization_reassign_report(
      (select id from organization_membership_test_reports where label = 'report_a'),
      (select id from organization_membership_test_orgs where label = 'org_b'),
      'employee reassign attempt'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into organization_membership_test_results
  values ('employee cannot reassign a report', denied);
end;
$$;

select public.organization_update_report(
  (select id from organization_membership_test_reports where label = 'report_a'),
  'In Progress',
  'Work started'
);

insert into organization_membership_test_results
select
  'employee can update report status with an internal note',
  exists (
    select 1 from public.reports
    where id = (select id from organization_membership_test_reports where label = 'report_a')
      and status = 'In Progress'
  )
  and exists (
    select 1 from public.report_events
    where report_id = (select id from organization_membership_test_reports where label = 'report_a')
      and note = 'Work started'
  );

select pg_temp.set_organization_membership_claims('admin_a');
select public.organization_reassign_report(
  (select id from organization_membership_test_reports where label = 'report_a'),
  (select id from organization_membership_test_orgs where label = 'org_b'),
  'Administrator reassignment'
);

insert into organization_membership_test_results
select
  'org admin can reassign a report with an audit note',
  exists (
    select 1 from public.reports
    where id = (select id from organization_membership_test_reports where label = 'report_a')
      and assigned_organization_id = (
        select id from organization_membership_test_orgs where label = 'org_b'
      )
  )
  and exists (
    select 1 from public.report_events
    where report_id = (select id from organization_membership_test_reports where label = 'report_a')
      and note = 'Administrator reassignment'
  );

select pg_temp.set_organization_membership_claims('registrant');
create temp table registration_result as
select * from public.register_organization(
  'New Registered Organization',
  'municipality',
  'local',
  'KwaZulu-Natal',
  'eThekwini'
);

insert into organization_membership_test_results
select
  'registration creates a pending organization and org admin membership',
  registration_result.status = 'pending'
  and exists (
    select 1 from public.organizations
    where id = registration_result.id and not is_active
  )
  and exists (
    select 1 from public.organization_members
    where user_id = (select id from organization_membership_test_users where label = 'registrant')
      and organization_id = registration_result.id
      and role = 'org_admin'
      and is_active
  )
from registration_result;

insert into organization_membership_test_results
select
  'registration is idempotent for an existing admin account',
  (select id from public.register_organization(
    'Ignored Duplicate Name',
    'municipality',
    'local',
    null,
    null
  )) = (select id from registration_result);

reset role;
select test_name, passed
from organization_membership_test_results
order by test_name;

rollback;
