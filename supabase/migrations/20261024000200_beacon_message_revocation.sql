create or replace function public.can_read_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.conversations as conversations
    where conversations.id = p_conversation_id
      and exists (
        select 1
        from public.conversation_members as members
        where members.conversation_id = conversations.id
          and members.user_id = (select auth.uid())
      )
      and (
        conversations.kind <> 'direct'
        or (
          public.beacon_pair_is_connected(
            conversations.direct_user_low,
            conversations.direct_user_high
          )
          and not public.beacon_pair_is_blocked(
            conversations.direct_user_low,
            conversations.direct_user_high
          )
        )
      )
  );
$$;

revoke all on function public.can_read_conversation(uuid) from public, anon;
grant execute on function public.can_read_conversation(uuid) to authenticated;

drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (public.can_read_conversation(id));

drop policy if exists conversation_members_select_member on public.conversation_members;
create policy conversation_members_select_member
  on public.conversation_members
  for select
  to authenticated
  using (public.can_read_conversation(conversation_id));

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member
  on public.messages
  for select
  to authenticated
  using (public.can_read_conversation(conversation_id));

create or replace function public.remove_connection(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_pair_key text;
  v_low uuid;
  v_high uuid;
begin
  if v_user_id is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_user_id then
    raise exception 'another resident is required' using errcode = '22023';
  end if;

  v_low := least(v_user_id, p_other_user_id);
  v_high := greatest(v_user_id, p_other_user_id);
  v_pair_key := v_low::text || ':' || v_high::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);

  update public.beacon_connections
  set status = 'cancelled', responded_at = pg_catalog.clock_timestamp()
  where pair_key = v_pair_key
    and status in ('pending', 'accepted');

  delete from public.conversation_members as members
  using public.conversations as conversations
  where conversations.id = members.conversation_id
    and conversations.kind = 'direct'
    and conversations.direct_user_low = v_low
    and conversations.direct_user_high = v_high;
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
  v_low uuid;
  v_high uuid;
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

  v_low := least(v_user_id, p_other_user_id);
  v_high := greatest(v_user_id, p_other_user_id);
  v_pair_key := v_low::text || ':' || v_high::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);

  insert into public.beacon_blocks (blocker_id, blocked_id)
  values (v_user_id, p_other_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  update public.beacon_connections
  set status = 'cancelled', responded_at = pg_catalog.clock_timestamp()
  where pair_key = v_pair_key
    and status in ('pending', 'accepted');

  delete from public.conversation_members as members
  using public.conversations as conversations
  where conversations.id = members.conversation_id
    and conversations.kind = 'direct'
    and conversations.direct_user_low = v_low
    and conversations.direct_user_high = v_high;
end;
$$;

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
  v_pair_key text;
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
  v_pair_key := v_low::text || ':' || v_high::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);

  if public.beacon_pair_is_blocked(v_user_id, p_other_user_id)
     or not public.beacon_pair_is_connected(v_user_id, p_other_user_id) then
    raise exception 'direct conversations require an unblocked accepted circle connection' using errcode = '42501';
  end if;

  insert into public.conversations (kind, created_by, direct_user_low, direct_user_high)
  values ('direct', v_user_id, v_low, v_high)
  on conflict (direct_pair_key) where kind = 'direct' do nothing
  returning id into v_conversation_id;

  if v_conversation_id is null then
    select id into v_conversation_id
    from public.conversations
    where direct_pair_key = v_pair_key;
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (v_conversation_id, v_low, 'member'),
    (v_conversation_id, v_high, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;
