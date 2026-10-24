begin;

create temp table cn_lifeline_lookup_users (
  label text primary key,
  id uuid not null,
  email text not null,
  phone text not null
);
create temp table cn_lifeline_lookup_results (
  test_name text primary key,
  passed boolean not null
);
grant all on cn_lifeline_lookup_users, cn_lifeline_lookup_results
  to anon, authenticated, service_role;

insert into cn_lifeline_lookup_users (label, id, email, phone)
values
  ('A', gen_random_uuid(), 'lifeline-a@example.invalid', '082 000 0001'),
  ('B', gen_random_uuid(), 'lifeline-b@example.invalid', '082 000 0002'),
  ('C', gen_random_uuid(), 'lifeline-c@example.invalid', '0820000002'),
  ('D', gen_random_uuid(), 'lifeline-d@example.invalid', '082 000 0004'),
  ('E', gen_random_uuid(), 'lifeline-e@example.invalid', '082 000 0005');

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb
from pg_temp.cn_lifeline_lookup_users;
insert into public.resident_profiles (id, full_name, email, phone, address, privacy_consent_at)
select id, 'Lookup Test ' || label, email, phone, '', now()
from pg_temp.cn_lifeline_lookup_users;

insert into public.beacon_connections (requester_id, addressee_id, status, responded_at)
select
  (select id from pg_temp.cn_lifeline_lookup_users where label = 'A'),
  targets.id,
  case when targets.label = 'E' then 'pending' else 'accepted' end,
  now()
from pg_temp.cn_lifeline_lookup_users as targets
where targets.label in ('B', 'D', 'E');
insert into public.beacon_blocks (blocker_id, blocked_id)
values (
  (select id from pg_temp.cn_lifeline_lookup_users where label = 'A'),
  (select id from pg_temp.cn_lifeline_lookup_users where label = 'D')
);

create function pg_temp.set_lifeline_lookup_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id
  from pg_temp.cn_lifeline_lookup_users where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.set_lifeline_lookup_claims('A');
insert into pg_temp.cn_lifeline_lookup_results
select 'Only accepted unblocked circle resident is resolved',
  count(*) = 1
  and bool_and(found.user_id = (select id from pg_temp.cn_lifeline_lookup_users where label = 'B'))
  and bool_and(found.display_name = 'Lookup Test B')
  and bool_and(found.phone = '0820000002')
from public.resolve_lifeline_circle_members(array[
  '082 000 0002',
  '082 000 0004',
  '082 000 0005'
]) as found;

insert into pg_temp.cn_lifeline_lookup_results
select 'A stranger with the same normalized phone is not returned',
  count(*) = 0
from public.resolve_lifeline_circle_members(array['0820000002']) as found
where found.user_id = (select id from pg_temp.cn_lifeline_lookup_users where label = 'C');

insert into pg_temp.cn_lifeline_lookup_results
select 'Blocked resident is not returned',
  count(*) = 0
from public.resolve_lifeline_circle_members(array['0820000004']) as found;

insert into pg_temp.cn_lifeline_lookup_results
select 'Non-accepted resident is not returned',
  count(*) = 0
from public.resolve_lifeline_circle_members(array['0820000005']) as found;

reset role;
insert into pg_temp.cn_lifeline_lookup_results
select 'Anonymous role cannot execute circle phone lookup',
  not pg_catalog.has_function_privilege(
    'anon',
    'public.resolve_lifeline_circle_members(text[])',
    'EXECUTE'
  );

select test_name, passed from pg_temp.cn_lifeline_lookup_results;
rollback;
