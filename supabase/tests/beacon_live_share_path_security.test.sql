begin;

create temp table cn_path_users (
  label text primary key,
  id uuid not null,
  email text not null,
  phone text not null
);
create temp table cn_path_shares (
  label text primary key,
  id uuid not null
);
create temp table cn_path_results (
  test_name text primary key,
  passed boolean not null
);
grant all on cn_path_users, cn_path_shares, cn_path_results to anon, authenticated, service_role;

insert into cn_path_users (label, id, email, phone)
values
  ('A', gen_random_uuid(), 'path-a@example.invalid', '15552000001'),
  ('B', gen_random_uuid(), 'path-b@example.invalid', '15552000002'),
  ('C', gen_random_uuid(), 'path-c@example.invalid', '15552000003'),
  ('D', gen_random_uuid(), 'path-d@example.invalid', '15552000004'),
  ('E', gen_random_uuid(), 'path-e@example.invalid', '15552000005'),
  ('F', gen_random_uuid(), 'path-f@example.invalid', '15552000006'),
  ('G', gen_random_uuid(), 'path-g@example.invalid', '15552000007');

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb
from pg_temp.cn_path_users;
insert into public.resident_profiles (id, full_name, email, phone, address, privacy_consent_at)
select id, 'Path Test ' || label, email, phone, 'Private address', now()
from pg_temp.cn_path_users;
insert into public.beacon_connections (requester_id, addressee_id, status)
select
  (select id from pg_temp.cn_path_users where label = pairs.sharer),
  (select id from pg_temp.cn_path_users where label = pairs.recipient),
  'accepted'
from (values ('A', 'B'), ('A', 'C'), ('A', 'D'), ('A', 'E'), ('F', 'G'))
  as pairs(sharer, recipient);

create function pg_temp.set_path_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id from pg_temp.cn_path_users where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

set local role authenticated;
select pg_temp.set_path_claims('A');
insert into pg_temp.cn_path_shares
values ('A-B', public.start_live_share(
  (select id from pg_temp.cn_path_users where label = 'B'), 15
));
select public.set_live_share_path(
  (select id from pg_temp.cn_path_shares where label = 'A-B'),
  '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
);

select pg_temp.set_path_claims('B');
insert into pg_temp.cn_path_results
select 'Recipient can read active planned path',
  planned_path = '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-B');
select pg_temp.set_path_claims('G');
insert into pg_temp.cn_path_results
select 'Stranger cannot read planned path', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-B');

select pg_temp.set_path_claims('A');
select public.remove_connection((select id from pg_temp.cn_path_users where label = 'B'));
reset role;
insert into pg_temp.cn_path_results
select 'Removing connection stops share and wipes planned path',
  count(*) = 1 and bool_and(stopped_at is not null and planned_path is null)
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-B');
set local role authenticated;
select pg_temp.set_path_claims('B');
insert into pg_temp.cn_path_results
select 'Recipient cannot read removed share path', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-B');

select pg_temp.set_path_claims('A');
insert into pg_temp.cn_path_shares
values ('A-C', public.start_live_share(
  (select id from pg_temp.cn_path_users where label = 'C'), 15
));
select public.set_live_share_path(
  (select id from pg_temp.cn_path_shares where label = 'A-C'),
  '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
);
select public.block_user((select id from pg_temp.cn_path_users where label = 'C'));
reset role;
insert into pg_temp.cn_path_results
select 'Blocking stops share and wipes planned path',
  count(*) = 1 and bool_and(stopped_at is not null and planned_path is null)
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-C');
set local role authenticated;
select pg_temp.set_path_claims('C');
insert into pg_temp.cn_path_results
select 'Recipient cannot read blocked share path', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-C');

select pg_temp.set_path_claims('A');
insert into pg_temp.cn_path_shares
values ('A-D', public.start_live_share(
  (select id from pg_temp.cn_path_users where label = 'D'), 15
));
select public.set_live_share_path(
  (select id from pg_temp.cn_path_shares where label = 'A-D'),
  '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
);

select pg_temp.set_path_claims('B');
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'),
      '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_path_results values ('Non-sharer cannot set planned path', denied);
end;
$$;

select pg_temp.set_path_claims('A');
do $$
declare
  denied boolean := false;
begin
  begin
    update public.live_location_shares
    set planned_path = '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
    where id = (select id from pg_temp.cn_path_shares where label = 'A-D');
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into pg_temp.cn_path_results values ('Authenticated direct path update is denied', denied);
end;
$$;

do $$
declare
  one_point_denied boolean := false;
  too_many_denied boolean := false;
  bad_lat_denied boolean := false;
  bad_lng_denied boolean := false;
  oversize_denied boolean := false;
  non_array_denied boolean := false;
  invalid_path jsonb;
begin
  begin
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'),
      '[[-29.86, 31.02]]'::jsonb
    );
  exception when invalid_parameter_value then one_point_denied := true;
  end;
  begin
    select jsonb_agg(jsonb_build_array(-29.86, 31.02))
      into invalid_path from generate_series(1, 51);
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'), invalid_path
    );
  exception when invalid_parameter_value then too_many_denied := true;
  end;
  begin
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'),
      '[[91, 31.02], [-29.87, 31.03]]'::jsonb
    );
  exception when invalid_parameter_value then bad_lat_denied := true;
  end;
  begin
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'),
      '[[-29.86, 181], [-29.87, 31.03]]'::jsonb
    );
  exception when invalid_parameter_value then bad_lng_denied := true;
  end;
  begin
    invalid_path := jsonb_build_array(
      jsonb_build_object('lat', 0, 'lng', 0, 'extra', repeat('x', 8200)),
      jsonb_build_array(1, 1)
    );
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'), invalid_path
    );
  exception when invalid_parameter_value then oversize_denied := true;
  end;
  begin
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-D'),
      '{"lat": -29.86, "lng": 31.02}'::jsonb
    );
  exception when invalid_parameter_value then non_array_denied := true;
  end;
  insert into pg_temp.cn_path_results
  values ('One-point path is rejected', one_point_denied),
         ('Path over 50 points is rejected', too_many_denied),
         ('Out-of-range latitude is rejected', bad_lat_denied),
         ('Out-of-range longitude is rejected', bad_lng_denied),
         ('Path over 8 kB is rejected', oversize_denied),
         ('Non-array path is rejected', non_array_denied);
end;
$$;

select public.stop_live_share((select id from pg_temp.cn_path_shares where label = 'A-D'));
reset role;
insert into pg_temp.cn_path_results
select 'Stopping share wipes planned path',
  count(*) = 1 and bool_and(stopped_at is not null and planned_path is null)
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-D');

set local role authenticated;
select pg_temp.set_path_claims('A');
insert into pg_temp.cn_path_shares
values ('A-E', public.start_live_share(
  (select id from pg_temp.cn_path_users where label = 'E'), 15
));
select public.set_live_share_path(
  (select id from pg_temp.cn_path_shares where label = 'A-E'),
  '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
);
reset role;
update public.live_location_shares
set expires_at = clock_timestamp() - interval '1 minute'
where id = (select id from pg_temp.cn_path_shares where label = 'A-E');
set local role authenticated;
select pg_temp.set_path_claims('E');
insert into pg_temp.cn_path_results
select 'Recipient cannot read expired planned path', count(*) = 0
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'A-E');
select pg_temp.set_path_claims('A');
do $$
declare
  denied boolean := false;
begin
  begin
    perform public.set_live_share_path(
      (select id from pg_temp.cn_path_shares where label = 'A-E'),
      '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
    );
  exception when insufficient_privilege then denied := true;
  end;
  insert into pg_temp.cn_path_results values ('Expired share path update is rejected', denied);
end;
$$;

select pg_temp.set_path_claims('F');
set local role authenticated;
insert into pg_temp.cn_path_shares
values ('F-G', public.start_live_share(
  (select id from pg_temp.cn_path_users where label = 'G'), 15
));
select public.set_live_share_path(
  (select id from pg_temp.cn_path_shares where label = 'F-G'),
  '[[-29.86, 31.02], [-29.87, 31.03]]'::jsonb
);
select pg_temp.set_path_claims('G');
insert into pg_temp.cn_path_results
select 'Unrelated third pair remains active and reads path',
  count(*) = 1 and bool_and(planned_path is not null and stopped_at is null)
from public.live_location_shares
where id = (select id from pg_temp.cn_path_shares where label = 'F-G');

reset role;
select test_name, passed
from pg_temp.cn_path_results
order by test_name;
do $$
begin
  if exists (select 1 from pg_temp.cn_path_results where not passed) then
    raise exception 'Beacon live share path security test failed';
  end if;
end;
$$;
rollback;
