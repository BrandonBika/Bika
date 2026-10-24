begin;

create temp table cn_circle_users (
  label text primary key,
  id uuid not null,
  email text not null,
  phone text not null
);
create temp table cn_circle_results (
  test_name text primary key,
  passed boolean not null
);
create temp table cn_circle_request (
  id uuid not null
);
create temp table cn_circle_conversation (
  id uuid not null
);
grant all on cn_circle_users, cn_circle_results, cn_circle_request,
  cn_circle_conversation to anon, authenticated, service_role;

insert into cn_circle_users (label, id, email, phone)
values
  ('A', gen_random_uuid(), 'circle-a@example.invalid', '15550000001'),
  ('B', gen_random_uuid(), 'circle-b@example.invalid', '15550000002'),
  ('C', gen_random_uuid(), 'circle-c@example.invalid', '15550000003'),
  ('D', gen_random_uuid(), 'circle-d@example.invalid', '15550000004'),
  ('E', gen_random_uuid(), 'circle-e@example.invalid', '15550000005'),
  ('F', gen_random_uuid(), 'circle-f@example.invalid', '15550000006'),
  ('G', gen_random_uuid(), 'circle-g@example.invalid', '15550000007'),
  ('H', gen_random_uuid(), 'circle-h@example.invalid', '15550000008'),
  ('I', gen_random_uuid(), 'circle-i@example.invalid', '15550000009'),
  ('J', gen_random_uuid(), 'circle-j@example.invalid', '15550000010'),
  ('K', gen_random_uuid(), 'circle-k@example.invalid', '15550000011'),
  ('L', gen_random_uuid(), 'circle-l@example.invalid', '15550000012'),
  ('M', gen_random_uuid(), 'circle-m@example.invalid', '15550000013'),
  ('N', gen_random_uuid(), 'circle-n@example.invalid', '15550000014'),
  ('O', gen_random_uuid(), 'circle-o@example.invalid', '15550000015');

reset role;
insert into auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', email, '', '{}'::jsonb, '{}'::jsonb
from pg_temp.cn_circle_users;
insert into public.resident_profiles (id, full_name, email, phone, address, privacy_consent_at)
select id, 'Circle Test ' || label, email, phone, 'Private address', now()
from pg_temp.cn_circle_users;

create function pg_temp.set_circle_claims(test_label text)
returns void
language plpgsql
as $$
declare
  test_user_id uuid;
begin
  select id into test_user_id
  from pg_temp.cn_circle_users where label = test_label;
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', test_user_id::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

update public.beacon_rate_limit_config
set requests_per_hour = 10, searches_per_hour = 60
where singleton;

set local role authenticated;
select pg_temp.set_circle_claims('A');

do $$
declare
  short_rejected boolean := false;
  broad_rejected boolean := false;
  direct_rejected boolean := false;
begin
  begin
    perform * from public.search_residents('Ci');
  exception when invalid_parameter_value then
    short_rejected := true;
  end;
  begin
    perform * from public.search_residents('%%%');
  exception when invalid_parameter_value then
    broad_rejected := true;
  end;
  begin
    perform public.create_direct_conversation(
      (select id from pg_temp.cn_circle_users where label = 'B')
    );
  exception when insufficient_privilege then
    direct_rejected := true;
  end;
  insert into pg_temp.cn_circle_results
  values
    ('Short resident search is rejected', short_rejected),
    ('Broad wildcard resident search is rejected', broad_rejected),
    ('Direct conversation is rejected before connection acceptance', direct_rejected);
end;
$$;

select pg_temp.set_circle_claims('B');
select public.set_beacon_discoverable(false);
select pg_temp.set_circle_claims('A');
insert into pg_temp.cn_circle_results
select 'Search excludes opted-out residents', count(*) = 0
from public.search_residents('Circle Test B');
select pg_temp.set_circle_claims('B');
select public.set_beacon_discoverable(true);
select pg_temp.set_circle_claims('A');

select pg_temp.set_circle_claims('D');
insert into pg_temp.cn_circle_results
select 'Phone search matches the exact normalized full number',
  count(*) = 1
from public.search_residents('+1 (555) 000-0002')
where user_id = (select id from pg_temp.cn_circle_users where label = 'B')
  and display_name = 'Circle Test B';
insert into pg_temp.cn_circle_results
select 'Phone search rejects a partial number',
  count(*) = 0
from public.search_residents('5550000002');
insert into pg_temp.cn_circle_results
select 'Name search returns no more than ten results',
  count(*) = 10
from public.search_residents('Circle Test');
select pg_temp.set_circle_claims('A');
insert into pg_temp.cn_circle_results
select 'Name search excludes the current resident',
  count(*) = 0
from public.search_residents('Circle Test A')
where user_id = (select id from pg_temp.cn_circle_users where label = 'A');

reset role;
delete from public.beacon_rate_limit_events
where user_id = (select id from pg_temp.cn_circle_users where label = 'A');
update public.beacon_rate_limit_config
set requests_per_hour = 1, searches_per_hour = 1
where singleton;

set local role authenticated;
select pg_temp.set_circle_claims('A');
insert into pg_temp.cn_circle_request
select public.send_circle_request((select id from pg_temp.cn_circle_users where label = 'B'));

insert into pg_temp.cn_circle_results
select 'Search returns user id and display name only',
  count(*) = 1
  and bool_and(found.user_id = (select id from pg_temp.cn_circle_users where label = 'B'))
  and bool_and(found.display_name = 'Circle Test B')
from public.search_residents('Circle Test B') as found;
insert into pg_temp.cn_circle_results
select 'Search RPC output schema excludes phone and email',
  p.proargnames = array['p_query', 'user_id', 'display_name']::text[]
from pg_catalog.pg_proc as p
join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'search_residents';

do $$
declare
  search_limited boolean := false;
  request_limited boolean := false;
begin
  begin
    perform * from public.search_residents('Circle Test C');
  exception when raise_exception then
    search_limited := sqlerrm like '%rate limit exceeded';
  end;
  begin
    perform public.send_circle_request(
      (select id from pg_temp.cn_circle_users where label = 'C')
    );
  exception when raise_exception then
    request_limited := sqlerrm like '%rate limit exceeded';
  end;
  insert into pg_temp.cn_circle_results
  values
    ('Resident search rate limit is enforced', search_limited),
    ('Circle request rate limit is enforced', request_limited);
end;
$$;

select pg_temp.set_circle_claims('C');
insert into pg_temp.cn_circle_results
select 'Stranger cannot read another pair connection', count(*) = 0
from public.beacon_connections
where id = (select id from pg_temp.cn_circle_request);

do $$
declare
  non_addressee_denied boolean := false;
  error_code text;
  error_message text;
begin
  begin
    perform public.respond_circle_request(
      (select id from pg_temp.cn_circle_request),
      true
    );
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate, error_message = message_text;
    non_addressee_denied :=
      error_code = '42501'
      and error_message = 'pending circle request not found';
  end;
  insert into pg_temp.cn_circle_results
  values ('Non-addressee gets 42501 pending-request denial from RPC', non_addressee_denied);
end;
$$;

select pg_temp.set_circle_claims('A');
do $$
declare
  requester_denied boolean := false;
  error_code text;
  error_message text;
begin
  begin
    perform public.respond_circle_request(
      (select id from pg_temp.cn_circle_request),
      true
    );
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate, error_message = message_text;
    requester_denied :=
      error_code = '42501'
      and error_message = 'pending circle request not found';
  end;
  insert into pg_temp.cn_circle_results
  values ('Requester gets 42501 denial when accepting own request', requester_denied);
end;
$$;

select pg_temp.set_circle_claims('C');
do $$
declare
  update_denied boolean := false;
begin
  begin
    update public.beacon_connections
    set status = 'accepted'
    where id = (select id from pg_temp.cn_circle_request);
  exception when insufficient_privilege then
    update_denied := true;
  end;
  insert into pg_temp.cn_circle_results
  values ('Client cannot update a request directly', update_denied);
end;
$$;

select pg_temp.set_circle_claims('B');
insert into pg_temp.cn_circle_results
select 'Addressee receives pending request', count(*) = 1
from public.list_circle_requests()
where request_id = (select id from pg_temp.cn_circle_request)
  and direction = 'incoming'
  and display_name = 'Circle Test A';
select public.respond_circle_request((select id from pg_temp.cn_circle_request), true);

insert into pg_temp.cn_circle_results
select 'Accepted connection appears in circle list', count(*) = 1
from public.list_circle()
where user_id = (select id from pg_temp.cn_circle_users where label = 'A')
  and display_name = 'Circle Test A';

select pg_temp.set_circle_claims('A');
insert into pg_temp.cn_circle_conversation
select public.create_direct_conversation(
  (select id from pg_temp.cn_circle_users where label = 'B')
);
insert into public.messages (conversation_id, type, body)
values ((select id from pg_temp.cn_circle_conversation), 'text', 'Before block');

insert into pg_temp.cn_circle_results
select 'Direct conversation is allowed after acceptance', count(*) = 1
from public.conversations
where id = (select id from pg_temp.cn_circle_conversation);

select pg_temp.set_circle_claims('A');
select public.remove_connection((select id from pg_temp.cn_circle_users where label = 'B'));
do $$
declare
  create_denied boolean := false;
  removed_pair_message_denied boolean := false;
  error_code text;
  error_message text;
begin
  begin
    perform public.create_direct_conversation(
      (select id from pg_temp.cn_circle_users where label = 'B')
    );
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate, error_message = message_text;
    create_denied :=
      error_code = '42501'
      and error_message = 'direct conversations require an unblocked accepted circle connection';
  end;
  begin
    insert into public.messages (conversation_id, type, body)
    values ((select id from pg_temp.cn_circle_conversation), 'text', 'After remove');
  exception when others then
    get stacked diagnostics error_code = returned_sqlstate, error_message = message_text;
    removed_pair_message_denied :=
      error_code = '42501'
      and error_message = 'direct messages require an unblocked accepted circle connection';
  end;
  insert into pg_temp.cn_circle_results
  values
    ('remove_connection rejects opening a new direct conversation with 42501', create_denied),
    ('remove_connection rejects direct message with 42501', removed_pair_message_denied);
end;
$$;
reset role;
update public.beacon_rate_limit_config
set requests_per_hour = 10
where singleton;
set local role authenticated;
select pg_temp.set_circle_claims('A');
insert into pg_temp.cn_circle_request
select public.send_circle_request((select id from pg_temp.cn_circle_users where label = 'B'));
select pg_temp.set_circle_claims('B');
select public.respond_circle_request(
  (select id from pg_temp.cn_circle_request order by id desc limit 1),
  true
);
select pg_temp.set_circle_claims('A');

select pg_temp.set_circle_claims('C');
do $$
declare
  group_rejected boolean := false;
  stranger_message_denied boolean := false;
begin
  begin
    perform public.create_group_conversation(
      'Unconnected Circle Test',
      array[(select id from pg_temp.cn_circle_users where label = 'D')]
    );
  exception when insufficient_privilege then
    group_rejected := true;
  end;
  begin
    insert into public.messages (conversation_id, type, body)
    values ((select id from pg_temp.cn_circle_conversation), 'text', 'Stranger attempt');
  exception when insufficient_privilege then
    stranger_message_denied := true;
  end;
  insert into pg_temp.cn_circle_results
  values
    ('Group creation rejects non-connections', group_rejected),
    ('Non-member cannot send a direct message', stranger_message_denied);
end;
$$;

reset role;
delete from public.beacon_rate_limit_events
where user_id = (select id from pg_temp.cn_circle_users where label = 'A')
  and action = 'search';
update public.beacon_rate_limit_config
set searches_per_hour = 60, requests_per_hour = 10
where singleton;
delete from public.beacon_rate_limit_events
where user_id = (select id from pg_temp.cn_circle_users where label = 'A')
  and action = 'request';
set local role authenticated;
select pg_temp.set_circle_claims('B');
select public.block_user((select id from pg_temp.cn_circle_users where label = 'A'));
insert into pg_temp.cn_circle_results
select 'Blocking removes the accepted connection',
  count(*) = 1
    and count(*) filter (where status = 'cancelled') = 1
    and count(*) filter (where status = 'accepted') = 0
from public.beacon_connections
where pair_key =
    least(
      (select id from pg_temp.cn_circle_users where label = 'A'),
      (select id from pg_temp.cn_circle_users where label = 'B')
    )::text
    || ':'
    || greatest(
      (select id from pg_temp.cn_circle_users where label = 'A'),
      (select id from pg_temp.cn_circle_users where label = 'B')
    )::text
  ;

select pg_temp.set_circle_claims('A');
do $$
declare
  blocked_request boolean := false;
  blocked_message boolean := false;
  blocked_search_hidden boolean := false;
begin
  begin
    perform public.send_circle_request(
      (select id from pg_temp.cn_circle_users where label = 'B')
    );
  exception when insufficient_privilege then
    blocked_request := true;
  end;
  begin
    insert into public.messages (conversation_id, type, body)
    values ((select id from pg_temp.cn_circle_conversation), 'text', 'After block');
  exception when insufficient_privilege then
    blocked_message := true;
  end;
  select count(*) = 0 into blocked_search_hidden
  from public.search_residents('Circle Test B');
  insert into pg_temp.cn_circle_results
  values
    ('Blocked pair cannot create another request', blocked_request),
    ('Direct messages stop after block', blocked_message),
    ('Search hides a blocked resident', blocked_search_hidden);
end;
$$;

reset role;

insert into pg_temp.cn_circle_results
select 'Circle RPCs use fixed search paths and are not executable by anon',
  count(*) = 10
    and bool_and(functions.proconfig @> array['search_path=""'])
    and bool_and(not has_function_privilege('anon', functions.oid, 'EXECUTE'))
from pg_catalog.pg_proc as functions
join pg_catalog.pg_namespace as namespaces on namespaces.oid = functions.pronamespace
where namespaces.nspname = 'public'
  and functions.proname in (
    'send_circle_request',
    'respond_circle_request',
    'cancel_circle_request',
    'remove_connection',
    'block_user',
    'unblock_user',
    'list_circle',
    'list_circle_requests',
    'search_residents',
    'set_beacon_discoverable'
  );

insert into pg_temp.cn_circle_results
select 'Beacon connections are in Realtime publication',
  exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beacon_connections'
  );

select test_name, passed
from pg_temp.cn_circle_results
order by test_name;

do $$
declare
  failures text;
begin
  select string_agg(test_name, ', ' order by test_name)
  into failures
  from pg_temp.cn_circle_results
  where not passed;
  if failures is not null then
    raise exception 'Beacon circle security checks failed: %', failures;
  end if;
end;
$$;

rollback;
