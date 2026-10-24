alter table public.resident_profiles
  add column if not exists beacon_discoverable boolean not null default true;

create table if not exists public.beacon_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.resident_profiles (id) on delete cascade,
  addressee_id uuid not null references public.resident_profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  pair_key text generated always as (
    least(requester_id, addressee_id)::text || ':' || greatest(requester_id, addressee_id)::text
  ) stored,
  constraint beacon_connections_not_self check (requester_id <> addressee_id)
);

create unique index if not exists beacon_connections_pair_key_uidx
  on public.beacon_connections (pair_key);
create index if not exists beacon_connections_requester_status_idx
  on public.beacon_connections (requester_id, status);
create index if not exists beacon_connections_addressee_status_idx
  on public.beacon_connections (addressee_id, status);

create table if not exists public.beacon_blocks (
  blocker_id uuid not null references public.resident_profiles (id) on delete cascade,
  blocked_id uuid not null references public.resident_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint beacon_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.beacon_rate_limit_config (
  singleton boolean primary key default true check (singleton),
  requests_per_hour integer not null default 10 check (requests_per_hour > 0),
  searches_per_hour integer not null default 60 check (searches_per_hour > 0)
);
insert into public.beacon_rate_limit_config (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.beacon_rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('request', 'search')),
  created_at timestamptz not null default now()
);
create index if not exists beacon_rate_limit_events_user_action_created_idx
  on public.beacon_rate_limit_events (user_id, action, created_at desc);

alter table public.beacon_connections enable row level security;
alter table public.beacon_blocks enable row level security;
alter table public.beacon_rate_limit_config enable row level security;
alter table public.beacon_rate_limit_events enable row level security;

revoke all on public.beacon_connections from public, anon, authenticated;
revoke all on public.beacon_blocks from public, anon, authenticated;
revoke all on public.beacon_rate_limit_config from public, anon, authenticated;
revoke all on public.beacon_rate_limit_events from public, anon, authenticated;
grant select on public.beacon_connections, public.beacon_blocks to authenticated;
grant all on public.beacon_connections, public.beacon_blocks,
  public.beacon_rate_limit_config, public.beacon_rate_limit_events to service_role;

drop policy if exists beacon_connections_select_involved on public.beacon_connections;
create policy beacon_connections_select_involved
  on public.beacon_connections
  for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

drop policy if exists beacon_blocks_select_involved on public.beacon_blocks;
create policy beacon_blocks_select_involved
  on public.beacon_blocks
  for select
  to authenticated
  using ((select auth.uid()) in (blocker_id, blocked_id));

create or replace function public.beacon_take_rate_limit(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_count integer;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_action not in ('request', 'search') then
    raise exception 'invalid rate limit action' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_user_id::text),
    case when p_action = 'request' then 651101 else 651102 end
  );

  select case p_action
    when 'request' then config.requests_per_hour
    else config.searches_per_hour
  end into v_limit
  from public.beacon_rate_limit_config as config
  where config.singleton;
  if v_limit is null then
    raise exception 'Beacon rate limit configuration is missing' using errcode = '55000';
  end if;

  delete from public.beacon_rate_limit_events as events
  where events.user_id = v_user_id
    and events.action = p_action
    and events.created_at < pg_catalog.clock_timestamp() - interval '1 hour';

  select count(*)::integer into v_count
  from public.beacon_rate_limit_events as events
  where events.user_id = v_user_id
    and events.action = p_action
    and events.created_at >= pg_catalog.clock_timestamp() - interval '1 hour';

  if v_count >= v_limit then
    raise exception 'Beacon % rate limit exceeded', p_action using errcode = 'P0001';
  end if;

  insert into public.beacon_rate_limit_events (user_id, action)
  values (v_user_id, p_action);
end;
$$;

create or replace function public.beacon_pair_is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.beacon_blocks as blocks
    where (blocks.blocker_id = p_user_a and blocks.blocked_id = p_user_b)
       or (blocks.blocker_id = p_user_b and blocks.blocked_id = p_user_a)
  );
$$;

create or replace function public.beacon_pair_is_connected(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.beacon_connections as connections
    where connections.pair_key =
      least(p_user_a, p_user_b)::text || ':' || greatest(p_user_a, p_user_b)::text
      and connections.status = 'accepted'
  );
$$;

create or replace function public.send_circle_request(p_target_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_pair_key text;
  v_request_id uuid;
  v_status text;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_target_id is null or p_target_id = v_user_id then
    raise exception 'a circle request requires another resident' using errcode = '22023';
  end if;
  if not exists (select 1 from public.resident_profiles where id = v_user_id)
     or not exists (select 1 from public.resident_profiles where id = p_target_id) then
    raise exception 'resident not found' using errcode = '22023';
  end if;
  if public.beacon_pair_is_blocked(v_user_id, p_target_id) then
    raise exception 'circle requests are unavailable' using errcode = '42501';
  end if;

  v_pair_key := least(v_user_id, p_target_id)::text || ':' || greatest(v_user_id, p_target_id)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);
  select id, status into v_request_id, v_status
  from public.beacon_connections
  where pair_key = v_pair_key
  for update;

  if v_status = 'pending' or v_status = 'accepted' then
    raise exception 'a circle request or connection already exists' using errcode = '23505';
  end if;

  perform public.beacon_take_rate_limit('request');
  if v_request_id is null then
    insert into public.beacon_connections (requester_id, addressee_id, status)
    values (v_user_id, p_target_id, 'pending')
    returning id into v_request_id;
  else
    update public.beacon_connections
    set requester_id = v_user_id,
        addressee_id = p_target_id,
        status = 'pending',
        created_at = pg_catalog.clock_timestamp(),
        responded_at = null
    where id = v_request_id;
  end if;
  return v_request_id;
end;
$$;

create or replace function public.respond_circle_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_request_id is null or p_accept is null then
    raise exception 'request id and response are required' using errcode = '22023';
  end if;
  update public.beacon_connections
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = pg_catalog.clock_timestamp()
  where id = p_request_id
    and addressee_id = v_user_id
    and status = 'pending';
  if not found then
    raise exception 'pending circle request not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.cancel_circle_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.beacon_connections
  set status = 'cancelled', responded_at = pg_catalog.clock_timestamp()
  where id = p_request_id
    and requester_id = v_user_id
    and status = 'pending';
  if not found then
    raise exception 'pending circle request not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.remove_connection(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'another resident is required' using errcode = '22023';
  end if;
  update public.beacon_connections
  set status = 'cancelled', responded_at = pg_catalog.clock_timestamp()
  where pair_key = least(v_user_id, p_other_user_id)::text || ':' || greatest(v_user_id, p_other_user_id)::text
    and status in ('pending', 'accepted');
end;
$$;

create or replace function public.block_user(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_pair_key text;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'another resident is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.resident_profiles where id = p_other_user_id) then
    raise exception 'resident not found' using errcode = '22023';
  end if;
  v_pair_key := least(v_user_id, p_other_user_id)::text || ':' || greatest(v_user_id, p_other_user_id)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);
  insert into public.beacon_blocks (blocker_id, blocked_id)
  values (v_user_id, p_other_user_id)
  on conflict (blocker_id, blocked_id) do nothing;
  update public.beacon_connections
  set status = 'cancelled', responded_at = pg_catalog.clock_timestamp()
  where pair_key = v_pair_key
    and status in ('pending', 'accepted');
end;
$$;

create or replace function public.unblock_user(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'another resident is required' using errcode = '22023';
  end if;
  delete from public.beacon_blocks
  where blocker_id = v_user_id and blocked_id = p_other_user_id;
end;
$$;

create or replace function public.list_circle()
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    case when connections.requester_id = auth.uid() then connections.addressee_id else connections.requester_id end,
    profiles.full_name
  from public.beacon_connections as connections
  join public.resident_profiles as profiles
    on profiles.id = case
      when connections.requester_id = auth.uid() then connections.addressee_id
      else connections.requester_id
    end
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and connections.status = 'accepted'
    and auth.uid() in (connections.requester_id, connections.addressee_id)
    and not public.beacon_pair_is_blocked(connections.requester_id, connections.addressee_id)
  order by profiles.full_name, profiles.id;
$$;

create or replace function public.list_circle_requests()
returns table (
  request_id uuid,
  user_id uuid,
  display_name text,
  status text,
  direction text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select
    connections.id,
    case when connections.requester_id = auth.uid() then connections.addressee_id else connections.requester_id end,
    profiles.full_name,
    connections.status,
    case when connections.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    connections.created_at,
    connections.responded_at
  from public.beacon_connections as connections
  join public.resident_profiles as profiles
    on profiles.id = case
      when connections.requester_id = auth.uid() then connections.addressee_id
      else connections.requester_id
    end
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and auth.uid() in (connections.requester_id, connections.addressee_id)
    and connections.status = 'pending'
    and not public.beacon_pair_is_blocked(connections.requester_id, connections.addressee_id)
  order by connections.created_at desc;
$$;

create or replace function public.search_residents(p_query text)
returns table (user_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_digits text;
  v_is_phone boolean;
  v_escaped_prefix text;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_query = '' then
    raise exception 'search query is required' using errcode = '22023';
  end if;
  v_is_phone := v_query ~ '^[+0-9() .-]+$' and v_query ~ '[0-9]';
  v_digits := regexp_replace(v_query, '[^0-9]', '', 'g');
  if v_is_phone then
    if char_length(v_digits) < 7 or char_length(v_digits) > 15 then
      raise exception 'phone search requires the exact full number' using errcode = '22023';
    end if;
  elsif char_length(v_query) < 3 or v_query !~ '[[:alpha:]]' or v_query ~ '[%_*]' then
    raise exception 'name search must be a specific prefix of at least three characters' using errcode = '22023';
  end if;
  perform public.beacon_take_rate_limit('search');

  if v_is_phone then
    return query
      select profiles.id, profiles.full_name
      from public.resident_profiles as profiles
      where profiles.beacon_discoverable
        and profiles.id <> v_user_id
        and regexp_replace(profiles.phone, '[^0-9]', '', 'g') = v_digits
        and not public.beacon_pair_is_blocked(v_user_id, profiles.id)
      order by profiles.full_name, profiles.id
      limit 10;
  else
    v_escaped_prefix := replace(replace(replace(lower(v_query), E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
    return query
      select profiles.id, profiles.full_name
      from public.resident_profiles as profiles
      where profiles.beacon_discoverable
        and profiles.id <> v_user_id
        and lower(profiles.full_name) like v_escaped_prefix || '%' escape E'\\'
        and not public.beacon_pair_is_blocked(v_user_id, profiles.id)
      order by profiles.full_name, profiles.id
      limit 10;
  end if;
end;
$$;

create or replace function public.set_beacon_discoverable(p_discoverable boolean)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if auth.uid() is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_discoverable is null then
    raise exception 'discoverable setting is required' using errcode = '22023';
  end if;
  update public.resident_profiles
  set beacon_discoverable = p_discoverable
  where id = auth.uid();
  if not found then
    raise exception 'resident not found' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.can_message_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_kind text;
  v_low uuid;
  v_high uuid;
begin
  select conversations.kind, conversations.direct_user_low, conversations.direct_user_high
  into v_kind, v_low, v_high
  from public.conversations as conversations
  where conversations.id = p_conversation_id;
  if not found then return false; end if;
  if v_kind = 'direct' then
    return public.beacon_pair_is_connected(v_low, v_high)
      and not public.beacon_pair_is_blocked(v_low, v_high);
  end if;
  return true;
end;
$$;

create or replace function public.enforce_direct_conversation_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_kind text;
  v_low uuid;
  v_high uuid;
  v_status text;
begin
  select conversations.kind, conversations.direct_user_low, conversations.direct_user_high
  into v_kind, v_low, v_high
  from public.conversations as conversations
  where conversations.id = new.conversation_id;
  if v_kind = 'direct' then
    perform 1
    from public.beacon_connections as connections
    where connections.pair_key = least(v_low, v_high)::text || ':' || greatest(v_low, v_high)::text
    for update;
    select connections.status into v_status
    from public.beacon_connections as connections
    where connections.pair_key = least(v_low, v_high)::text || ':' || greatest(v_low, v_high)::text;
    if v_status is distinct from 'accepted'
       or public.beacon_pair_is_blocked(v_low, v_high) then
      raise exception 'direct messages require an unblocked accepted circle connection' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_require_direct_connection on public.messages;
create trigger messages_require_direct_connection
  before insert on public.messages
  for each row execute function public.enforce_direct_conversation_connection();

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member
  on public.messages
  for insert
  to authenticated
  with check (
    public.is_conversation_member(conversation_id)
    and public.can_message_conversation(conversation_id)
    and sender_id = (select auth.uid())
    and type <> 'system'
  );

create or replace function public.create_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_conversation_id uuid;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'a direct conversation requires another resident' using errcode = '22023';
  end if;
  if not exists (select 1 from public.resident_profiles where id = v_user_id)
     or not exists (select 1 from public.resident_profiles where id = p_other_user_id) then
    raise exception 'resident not found' using errcode = '22023';
  end if;
  if public.beacon_pair_is_blocked(v_user_id, p_other_user_id)
     or not public.beacon_pair_is_connected(v_user_id, p_other_user_id) then
    raise exception 'direct conversations require an unblocked accepted circle connection' using errcode = '42501';
  end if;
  v_low := least(v_user_id, p_other_user_id);
  v_high := greatest(v_user_id, p_other_user_id);
  insert into public.conversations (kind, created_by, direct_user_low, direct_user_high)
  values ('direct', v_user_id, v_low, v_high)
  on conflict (direct_pair_key) where kind = 'direct' do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id into v_conversation_id
    from public.conversations
    where direct_pair_key = v_low::text || ':' || v_high::text;
  else
    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (v_conversation_id, v_low, 'member'),
      (v_conversation_id, v_high, 'member');
  end if;
  return v_conversation_id;
end;
$$;

create or replace function public.create_group_conversation(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_member_id uuid;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.resident_profiles where id = v_user_id) then
    raise exception 'resident not found' using errcode = '22023';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 100 then
    raise exception 'group title must be between 1 and 100 characters' using errcode = '22023';
  end if;
  if p_member_ids is null or array_position(p_member_ids, null) is not null then
    raise exception 'member ids must be a non-null array of residents' using errcode = '22023';
  end if;
  for v_member_id in
    select distinct ids.member_id
    from unnest(p_member_ids) as ids(member_id)
    where ids.member_id <> v_user_id
  loop
    if not exists (select 1 from public.resident_profiles where id = v_member_id) then
      raise exception 'resident not found' using errcode = '22023';
    end if;
    if public.beacon_pair_is_blocked(v_user_id, v_member_id)
       or not public.beacon_pair_is_connected(v_user_id, v_member_id) then
      raise exception 'every group member must be an unblocked circle connection' using errcode = '42501';
    end if;
  end loop;

  insert into public.conversations (kind, title, created_by)
  values ('group', trim(p_title), v_user_id)
  returning id into v_conversation_id;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user_id, 'admin');
  insert into public.conversation_members (conversation_id, user_id, role)
  select v_conversation_id, members.member_id, 'member'
  from (select distinct unnest(p_member_ids) as member_id) as members
  where members.member_id <> v_user_id;
  return v_conversation_id;
end;
$$;

create or replace function public.add_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_creator_id uuid;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_user_id is null
     or not exists (select 1 from public.resident_profiles where id = p_user_id) then
    raise exception 'resident not found' using errcode = '22023';
  end if;
  select conversations.created_by into v_creator_id
  from public.conversations as conversations
  join public.conversation_members as members
    on members.conversation_id = conversations.id
  where conversations.id = p_conversation_id
    and conversations.kind = 'group'
    and members.user_id = v_user_id
    and members.role = 'admin';
  if not found then
    raise exception 'group administrator access required' using errcode = '42501';
  end if;
  if p_user_id <> v_creator_id
     and (public.beacon_pair_is_blocked(v_creator_id, p_user_id)
       or not public.beacon_pair_is_connected(v_creator_id, p_user_id)) then
    raise exception 'every group member must be an unblocked circle connection of the creator' using errcode = '42501';
  end if;
  insert into public.conversation_members (conversation_id, user_id, role)
  values (p_conversation_id, p_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

revoke all on function public.beacon_take_rate_limit(text) from public, anon, authenticated;
revoke all on function public.beacon_pair_is_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.beacon_pair_is_connected(uuid, uuid) from public, anon, authenticated;
revoke all on function public.enforce_direct_conversation_connection() from public, anon, authenticated;
revoke all on function public.can_message_conversation(uuid) from public, anon;
grant execute on function public.can_message_conversation(uuid) to authenticated;

revoke all on function public.send_circle_request(uuid) from public, anon;
revoke all on function public.respond_circle_request(uuid, boolean) from public, anon;
revoke all on function public.cancel_circle_request(uuid) from public, anon;
revoke all on function public.remove_connection(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.list_circle() from public, anon;
revoke all on function public.list_circle_requests() from public, anon;
revoke all on function public.search_residents(text) from public, anon;
revoke all on function public.set_beacon_discoverable(boolean) from public, anon;
grant execute on function public.send_circle_request(uuid) to authenticated;
grant execute on function public.respond_circle_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_circle_request(uuid) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_circle() to authenticated;
grant execute on function public.list_circle_requests() to authenticated;
grant execute on function public.search_residents(text) to authenticated;
grant execute on function public.set_beacon_discoverable(boolean) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime publication does not exist';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beacon_connections'
  ) then
    execute 'alter publication supabase_realtime add table public.beacon_connections';
  end if;
end;
$$;

notify pgrst, 'reload schema';
