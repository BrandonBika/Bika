begin;

create temp table organization_invitation_test_results (
  test_name text primary key,
  passed boolean not null
);
create temp table organization_invitation_test_ids (
  label text primary key,
  id uuid not null
);
grant select on organization_invitation_test_ids to service_role;
grant insert on organization_invitation_test_results to service_role;

insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  (gen_random_uuid(), 'authenticated', 'authenticated', 'invited-employee@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  (gen_random_uuid(), 'authenticated', 'authenticated', 'expired-employee@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into organization_invitation_test_ids
select 'accepted_user', id from auth.users where email = 'invited-employee@example.invalid';
insert into organization_invitation_test_ids
select 'expired_user', id from auth.users where email = 'expired-employee@example.invalid';

insert into public.organizations (name, type, jurisdiction_level, status, is_active)
values ('Invitation Test Org', 'municipality', 'local', 'approved', true);

insert into organization_invitation_test_ids
select 'organization', id from public.organizations where name = 'Invitation Test Org';

insert into public.organization_invitations (
  organization_id, invited_user_id, email, invited_by, created_at, expires_at
)
select
  (select id from organization_invitation_test_ids where label = 'organization'),
  (select id from organization_invitation_test_ids where label = 'accepted_user'),
  'invited-employee@example.invalid',
  (select id from organization_invitation_test_ids where label = 'accepted_user'),
  now(),
  now() + interval '7 days';

insert into public.organization_invitations (
  organization_id, invited_user_id, email, invited_by, created_at, expires_at
)
select
  (select id from organization_invitation_test_ids where label = 'organization'),
  (select id from organization_invitation_test_ids where label = 'expired_user'),
  'expired-employee@example.invalid',
  (select id from organization_invitation_test_ids where label = 'accepted_user'),
  now() - interval '8 days',
  now() - interval '1 day';

set local role service_role;
select public.accept_organization_invitation(
  (select id from organization_invitation_test_ids where label = 'accepted_user'),
  'invited-employee@example.invalid'
);

do $$
declare
  denied boolean := false;
begin
  begin
    perform public.accept_organization_invitation(
      (select id from organization_invitation_test_ids where label = 'expired_user'),
      'expired-employee@example.invalid'
    );
  exception when invalid_parameter_value then
    denied := true;
  end;
  insert into organization_invitation_test_results
  values ('expired invitation cannot create a membership', denied);
end;
$$;
reset role;

insert into organization_invitation_test_results
select
  'valid invitation creates an employee membership and is single-use',
  exists (
    select 1 from public.organization_members
    where user_id = (select id from organization_invitation_test_ids where label = 'accepted_user')
      and organization_id = (select id from organization_invitation_test_ids where label = 'organization')
      and role = 'org_employee'
      and is_active
  )
  and exists (
    select 1 from public.organization_invitations
    where invited_user_id = (select id from organization_invitation_test_ids where label = 'accepted_user')
      and accepted_at is not null
  );

select test_name, passed
from organization_invitation_test_results
order by test_name;

rollback;
