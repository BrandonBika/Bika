begin;

create temp table cn_live_users (
  label text primary key,
  id uuid not null,
  email text not null,
  phone text not null
);
create temp table cn_live_shares (
  label text primary key,
  id uuid not null
);
create temp table cn_live_results (
  test_name text primary key,
  passed boolean not null
);
grant all on cn_live_users, cn_live_shares, cn_live_results to anon, authenticated, service_role;

insert into cn_live_users (label, id, email, phone)
values
  ('A', gen_random_uuid(), 'live-a@example.invalid', '15551000001'),
  ('B', gen_random_uuid(), 'live-b@example.invalid', '15551000002'),
  ('C', gen_random_uuid(), 'live-c@example.invalid', '15551000003'),
  ('D', gen_random_uuid(), 'live-d@example.invalid', '15551000004'),
  ('E', gen_random_uuid(), 'live-e@example.invalid', '15551000005'),
  ('F', gen_random_uuid(), 'live-f@example.invalid', '15551000006'),
  ('G', gen_random_uuid(), 'live-g@example.invalid', '15551000007');

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb
from pg_temp.cn_live_users;
insert into public.resident_profiles (id, full_name, email, phone, address, privacy_consent_at)
select id, 'Live Test ' || label, email, phone, 'Private address', now()
from pg_temp.cn_live_users;
insert into public.beacon_connections (requester_id, addressee_id, status)
select
  (select id from pg_temp.cn_live_users where label = pairs.sharer),
  (select id from pg_temp.cn_live_users where label = pairs.recipient),
  'accepted'
from (values ('A', 'B'), ('A', 'C'), ('A', 'D'), ('E', 'F')) as pairs(sharer, recipient);

create function pg_temp.set_live_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id from pg_temp.cn_live_users where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.set_live_claims('A');
insert into pg_temp.cn_live_shares
values ('A-B', public.start_live_share(
  (select id from pg_temp.cn_live_users where label = 'B'), 15
));
select public.update_live_share(
  (select id from pg_temp.cn_live_shares where label = 'A-B'),
  -29.86, 31.02, 20
);

select pg_temp.set_live_claims('B');
insert into pg_temp.cn_live_results
select 'Recipient reads active share', count(*) = 1
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-B');

select pg_temp.set_live_claims('G');
insert into pg_temp.cn_live_results
select 'Stranger cannot read active share', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-B');

select pg_temp.set_live_claims('A');
select public.remove_connection((select id from pg_temp.cn_live_users where label = 'B'));
reset role;
insert into pg_temp.cn_live_results
select 'Removing connection stops share and clears coordinates',
  count(*) = 1
    and bool_and(stopped_at is not null and last_lat is null and last_lng is null
      and last_accuracy_m is null and last_at is null)
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-B');

set local role authenticated;
select pg_temp.set_live_claims('B');
insert into pg_temp.cn_live_results
select 'Recipient cannot read share after removal', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-B');

select pg_temp.set_live_claims('A');
insert into pg_temp.cn_live_shares
values ('A-C', public.start_live_share(
  (select id from pg_temp.cn_live_users where label = 'C'), 15
));
select public.update_live_share(
  (select id from pg_temp.cn_live_shares where label = 'A-C'),
  -29.86, 31.02, 20
);
select public.block_user((select id from pg_temp.cn_live_users where label = 'C'));
reset role;
insert into pg_temp.cn_live_results
select 'Blocking stops share and clears coordinates',
  count(*) = 1
    and bool_and(stopped_at is not null and last_lat is null and last_lng is null
      and last_accuracy_m is null and last_at is null)
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-C');

set local role authenticated;
select pg_temp.set_live_claims('C');
insert into pg_temp.cn_live_results
select 'Recipient cannot read share after block', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-C');

select pg_temp.set_live_claims('A');
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.start_live_share(
      (select id from pg_temp.cn_live_users where label = 'G'), 15
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_live_results
  values ('Sharing to a non-connected resident is rejected', denied);
end;
$$;

insert into pg_temp.cn_live_shares
values ('A-D', public.start_live_share(
  (select id from pg_temp.cn_live_users where label = 'D'), 15
));
select public.update_live_share(
  (select id from pg_temp.cn_live_shares where label = 'A-D'),
  -29.86, 31.02, 20
);
reset role;
update public.live_location_shares
set expires_at = clock_timestamp() - interval '1 minute'
where id = (select id from pg_temp.cn_live_shares where label = 'A-D');

set local role authenticated;
select pg_temp.set_live_claims('D');
insert into pg_temp.cn_live_results
select 'Recipient cannot read expired share', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'A-D');
select pg_temp.set_live_claims('A');
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.update_live_share(
      (select id from pg_temp.cn_live_shares where label = 'A-D'),
      -29.86, 31.02, 20
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_live_results
  values ('Updating expired share is rejected', denied);
end;
$$;

select pg_temp.set_live_claims('E');
insert into pg_temp.cn_live_shares
values ('E-F', public.start_live_share(
  (select id from pg_temp.cn_live_users where label = 'F'), 15
));
select pg_temp.set_live_claims('F');
do $$
declare
  update_denied boolean := false;
  stop_denied boolean := false;
begin
  begin
    perform public.update_live_share(
      (select id from pg_temp.cn_live_shares where label = 'E-F'),
      -29.86, 31.02, 20
    );
  exception when insufficient_privilege then
    update_denied := true;
  end;
  begin
    perform public.stop_live_share(
      (select id from pg_temp.cn_live_shares where label = 'E-F')
    );
  exception when insufficient_privilege then
    stop_denied := true;
  end;
  insert into pg_temp.cn_live_results
  values ('Non-sharer cannot update share', update_denied),
         ('Non-sharer cannot stop share', stop_denied);
end;
$$;

select pg_temp.set_live_claims('E');
do $$
declare
  invalid_coordinates_denied boolean := false;
  invalid_accuracy_denied boolean := false;
  fast_update_denied boolean := false;
begin
  begin
    perform public.update_live_share(
      (select id from pg_temp.cn_live_shares where label = 'E-F'),
      91, 31.02, 20
    );
  exception when invalid_parameter_value then
    invalid_coordinates_denied := true;
  end;
  begin
    perform public.update_live_share(
      (select id from pg_temp.cn_live_shares where label = 'E-F'),
      -29.86, 31.02, 5001
    );
  exception when invalid_parameter_value then
    invalid_accuracy_denied := true;
  end;
  perform public.update_live_share(
    (select id from pg_temp.cn_live_shares where label = 'E-F'),
    -29.86, 31.02, 20
  );
  begin
    perform public.update_live_share(
      (select id from pg_temp.cn_live_shares where label = 'E-F'),
      -29.87, 31.03, 20
    );
  exception when invalid_parameter_value then
    fast_update_denied := true;
  end;
  insert into pg_temp.cn_live_results
  values ('Invalid coordinates are rejected', invalid_coordinates_denied),
         ('Invalid accuracy is rejected', invalid_accuracy_denied),
         ('Updates less than 5 seconds apart are rejected', fast_update_denied);
end;
$$;

do $$
declare
  insert_denied boolean := false;
  update_denied boolean := false;
  delete_denied boolean := false;
begin
  begin
    insert into public.live_location_shares (sharer_id, recipient_id, expires_at)
    values (
      (select id from pg_temp.cn_live_users where label = 'E'),
      (select id from pg_temp.cn_live_users where label = 'F'),
      clock_timestamp() + interval '15 minutes'
    );
  exception when insufficient_privilege then
    insert_denied := true;
  end;
  begin
    update public.live_location_shares
    set last_lat = 0, last_lng = 0, last_accuracy_m = 1, last_at = clock_timestamp()
    where id = (select id from pg_temp.cn_live_shares where label = 'E-F');
  exception when insufficient_privilege then
    update_denied := true;
  end;
  begin
    delete from public.live_location_shares
    where id = (select id from pg_temp.cn_live_shares where label = 'E-F');
  exception when insufficient_privilege then
    delete_denied := true;
  end;
  insert into pg_temp.cn_live_results
  values ('Authenticated direct insert is denied', insert_denied),
         ('Authenticated direct update is denied', update_denied),
         ('Authenticated direct delete is denied', delete_denied);
end;
$$;

select pg_temp.set_live_claims('F');
insert into pg_temp.cn_live_results
select 'Unrelated third pair remains active and readable',
  count(*) = 1
from public.live_location_shares
where id = (select id from pg_temp.cn_live_shares where label = 'E-F');

reset role;
select test_name, passed
from pg_temp.cn_live_results
order by test_name;
do $$
begin
  if exists (select 1 from pg_temp.cn_live_results where not passed) then
    raise exception 'Beacon live location security test failed';
  end if;
end;
$$;
rollback;
