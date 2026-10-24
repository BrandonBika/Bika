create or replace function public.is_valid_message_location(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lat numeric;
  v_lng numeric;
  v_accuracy numeric;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or (p_payload - 'lat' - 'lng' - 'accuracy') <> '{}'::jsonb
     or jsonb_typeof(p_payload -> 'lat') is distinct from 'number'
     or jsonb_typeof(p_payload -> 'lng') is distinct from 'number' then
    return false;
  end if;

  v_lat := (p_payload ->> 'lat')::numeric;
  v_lng := (p_payload ->> 'lng')::numeric;
  if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
    return false;
  end if;

  if p_payload ? 'accuracy' then
    if jsonb_typeof(p_payload -> 'accuracy') is distinct from 'number' then
      return false;
    end if;
    v_accuracy := (p_payload ->> 'accuracy')::numeric;
    if v_accuracy < 0 then
      return false;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.is_valid_message_path(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_point jsonb;
  v_lat numeric;
  v_lng numeric;
  v_count integer;
begin
  if p_payload is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or (p_payload - 'points') <> '{}'::jsonb
     or jsonb_typeof(p_payload -> 'points') is distinct from 'array' then
    return false;
  end if;

  v_count := jsonb_array_length(p_payload -> 'points');
  if v_count < 2 or v_count > 1000 then
    return false;
  end if;

  for v_point in select value from jsonb_array_elements(p_payload -> 'points')
  loop
    if jsonb_typeof(v_point) is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(v_point) <> 2 then
      return false;
    end if;
    if jsonb_typeof(v_point -> 0) is distinct from 'number'
       or jsonb_typeof(v_point -> 1) is distinct from 'number' then
      return false;
    end if;
    v_lat := (v_point ->> 0)::numeric;
    v_lng := (v_point ->> 1)::numeric;
    if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  direct_user_low uuid references auth.users (id) on delete cascade,
  direct_user_high uuid references auth.users (id) on delete cascade,
  direct_pair_key text generated always as (
    case
      when kind = 'direct' then direct_user_low::text || ':' || direct_user_high::text
      else null
    end
  ) stored,
  constraint conversations_kind_fields_check check (
    (kind = 'direct'
      and title is null
      and direct_user_low is not null
      and direct_user_high is not null
      and direct_user_low < direct_user_high)
    or
    (kind = 'group'
      and title is not null
      and char_length(trim(title)) between 1 and 100
      and direct_user_low is null
      and direct_user_high is null)
  )
);

create unique index if not exists conversations_direct_pair_key_uidx
  on public.conversations (direct_pair_key)
  where kind = 'direct';

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_id_idx
  on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('text', 'location', 'path', 'system', 'alert')),
  body text,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint messages_body_length_check check (body is null or char_length(body) <= 4000),
  constraint messages_type_content_check check (
    (type = 'text' and body is not null and char_length(trim(body)) > 0 and payload is null)
    or
    (type = 'location' and body is null and public.is_valid_message_location(payload))
    or
    (type = 'path' and body is null and public.is_valid_message_path(payload))
    or
    (type in ('system', 'alert') and (body is not null or payload is not null))
  )
);

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_sender_created_at_idx
  on public.messages (sender_id, created_at desc);

create table if not exists public.messaging_rate_limit_config (
  singleton boolean primary key default true check (singleton),
  max_messages integer not null default 5 check (max_messages > 0),
  window_seconds integer not null default 10 check (window_seconds > 0)
);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.messaging_rate_limit_config enable row level security;

revoke all on public.conversations from public, anon, authenticated;
revoke all on public.conversation_members from public, anon, authenticated;
revoke all on public.messages from public, anon, authenticated;
revoke all on public.messaging_rate_limit_config from public, anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant insert on public.messages to authenticated;
grant all on public.conversations, public.conversation_members, public.messages,
  public.messaging_rate_limit_config to service_role;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.conversation_members as members
    where members.conversation_id = p_conversation_id
      and members.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
revoke all on function public.is_valid_message_location(jsonb) from public, anon;
revoke all on function public.is_valid_message_path(jsonb) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.is_valid_message_location(jsonb) to authenticated;
grant execute on function public.is_valid_message_path(jsonb) to authenticated;

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (public.is_conversation_member(id));

drop policy if exists conversation_members_select_member on public.conversation_members;
create policy conversation_members_select_member
  on public.conversation_members
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member
  on public.messages
  for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member
  on public.messages
  for insert
  to authenticated
  with check (
    public.is_conversation_member(conversation_id)
    and sender_id = (select auth.uid())
    and type <> 'system'
  );

insert into public.messaging_rate_limit_config (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_max_messages integer;
  v_window_seconds integer;
  v_recent_count integer;
begin
  if auth.role() = 'authenticated' and new.sender_id is distinct from auth.uid() then
    raise exception 'message sender must be the authenticated user' using errcode = '42501';
  end if;
  if new.sender_id is null then
    raise exception 'message sender is required' using errcode = '23502';
  end if;

  new.created_at := pg_catalog.clock_timestamp();
  perform pg_advisory_xact_lock(hashtext(new.sender_id::text), 652341);

  select config.max_messages, config.window_seconds
    into v_max_messages, v_window_seconds
  from public.messaging_rate_limit_config as config
  where config.singleton = true;

  if v_max_messages is null or v_window_seconds is null then
    raise exception 'messaging rate limit configuration is missing' using errcode = '55000';
  end if;

  select count(*)::integer
    into v_recent_count
  from public.messages as recent
  where recent.sender_id = new.sender_id
    and recent.created_at > pg_catalog.clock_timestamp()
      - pg_catalog.make_interval(secs => v_window_seconds);

  if v_recent_count >= v_max_messages then
    raise exception 'message rate limit exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_message_rate_limit() from public, anon, authenticated;

drop trigger if exists messages_enforce_rate_limit on public.messages;
create trigger messages_enforce_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

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
  loop
    if not exists (select 1 from public.resident_profiles where id = v_member_id) then
      raise exception 'resident not found' using errcode = '22023';
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
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_user_id is null
     or not exists (select 1 from public.resident_profiles where id = p_user_id) then
    raise exception 'resident not found' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.conversations as conversations
    join public.conversation_members as members
      on members.conversation_id = conversations.id
    where conversations.id = p_conversation_id
      and conversations.kind = 'group'
      and members.user_id = v_user_id
      and members.role = 'admin'
  ) then
    raise exception 'group administrator access required' using errcode = '42501';
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (p_conversation_id, p_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

create or replace function public.leave_conversation(p_conversation_id uuid)
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
  delete from public.conversation_members
  where conversation_id = p_conversation_id
    and user_id = v_user_id;
  if not found then
    raise exception 'conversation membership not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
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
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = v_user_id;
  if not found then
    raise exception 'conversation membership not found' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_direct_conversation(uuid) from public, anon;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke all on function public.add_group_member(uuid, uuid) from public, anon;
revoke all on function public.leave_conversation(uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.leave_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime publication does not exist';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_members';
  end if;
end;
$$;

notify pgrst, 'reload schema';
