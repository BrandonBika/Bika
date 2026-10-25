create or replace function public.is_valid_live_share_path(p_path jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_point jsonb;
  v_lat numeric;
  v_lng numeric;
begin
  if p_path is null then
    return true;
  end if;
  if pg_catalog.jsonb_typeof(p_path) <> 'array'
     or pg_catalog.jsonb_array_length(p_path) < 2
     or pg_catalog.jsonb_array_length(p_path) > 50
     or pg_catalog.pg_column_size(p_path) >= 8192 then
    return false;
  end if;

  for v_point in select value from pg_catalog.jsonb_array_elements(p_path)
  loop
    if pg_catalog.jsonb_typeof(v_point) = 'array' then
      if pg_catalog.jsonb_array_length(v_point) <> 2
         or pg_catalog.jsonb_typeof(v_point -> 0) <> 'number'
         or pg_catalog.jsonb_typeof(v_point -> 1) <> 'number' then
        return false;
      end if;
      v_lat := (v_point ->> 0)::numeric;
      v_lng := (v_point ->> 1)::numeric;
    elsif pg_catalog.jsonb_typeof(v_point) = 'object' then
      if pg_catalog.jsonb_typeof(v_point -> 'lat') <> 'number'
         or pg_catalog.jsonb_typeof(v_point -> 'lng') <> 'number' then
        return false;
      end if;
      v_lat := (v_point ->> 'lat')::numeric;
      v_lng := (v_point ->> 'lng')::numeric;
    else
      return false;
    end if;

    if v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function public.is_valid_live_share_path(jsonb) from public, anon;
grant execute on function public.is_valid_live_share_path(jsonb) to authenticated, service_role;

alter table public.live_location_shares
  add column if not exists planned_path jsonb;

alter table public.live_location_shares
  drop constraint if exists live_location_shares_planned_path_check;
alter table public.live_location_shares
  add constraint live_location_shares_planned_path_check
  check (public.is_valid_live_share_path(planned_path));

create or replace function public.stop_live_shares_for_pair(p_user_a uuid, p_user_b uuid)
returns void
language sql
security definer
set search_path = ''
set row_security = off
as $$
  update public.live_location_shares
  set stopped_at = coalesce(stopped_at, pg_catalog.clock_timestamp()),
      last_lat = null,
      last_lng = null,
      last_accuracy_m = null,
      last_at = null,
      planned_path = null
  where stopped_at is null
    and (
      (sharer_id = p_user_a and recipient_id = p_user_b)
      or (sharer_id = p_user_b and recipient_id = p_user_a)
    );
$$;

create or replace function public.start_live_share(p_recipient uuid, p_minutes integer)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_sharer uuid := auth.uid();
  v_pair_key text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_share_id uuid;
  v_minutes integer;
begin
  if v_sharer is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_recipient is null or p_recipient = v_sharer or p_minutes is null then
    raise exception 'another resident and a duration are required' using errcode = '22023';
  end if;

  v_pair_key := least(v_sharer, p_recipient)::text || ':' || greatest(v_sharer, p_recipient)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);
  if public.beacon_pair_is_blocked(v_sharer, p_recipient)
     or not public.beacon_pair_is_connected(v_sharer, p_recipient) then
    raise exception 'live sharing requires an unblocked accepted circle connection'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_sharer::text), 651120);
  update public.live_location_shares
  set stopped_at = v_now,
      last_lat = null,
      last_lng = null,
      last_accuracy_m = null,
      last_at = null,
      planned_path = null
  where sharer_id = v_sharer
    and stopped_at is null;

  v_minutes := greatest(5, least(p_minutes, 60));
  insert into public.live_location_shares (
    sharer_id, recipient_id, started_at, expires_at
  ) values (
    v_sharer, p_recipient, v_now, v_now + pg_catalog.make_interval(mins => v_minutes)
  )
  returning id into v_share_id;
  return v_share_id;
end;
$$;

create or replace function public.stop_live_share(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_sharer uuid := auth.uid();
begin
  if v_sharer is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.live_location_shares
  set stopped_at = coalesce(stopped_at, pg_catalog.clock_timestamp()),
      last_lat = null,
      last_lng = null,
      last_accuracy_m = null,
      last_at = null,
      planned_path = null
  where id = p_id and sharer_id = v_sharer;
  if not found then
    raise exception 'live share not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.purge_live_location_shares()
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_deleted integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update public.live_location_shares
  set last_lat = null,
      last_lng = null,
      last_accuracy_m = null,
      last_at = null,
      planned_path = null
  where expires_at <= v_now
    and (last_lat is not null or last_lng is not null
      or last_accuracy_m is not null or last_at is not null or planned_path is not null);

  delete from public.live_location_shares
  where coalesce(stopped_at, expires_at) <= v_now - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.set_live_share_path(p_id uuid, p_path jsonb)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_sharer uuid := auth.uid();
  v_recipient uuid;
  v_pair_key text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_share public.live_location_shares%rowtype;
begin
  if v_sharer is null or auth.role() <> 'authenticated' then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_path is not null and not public.is_valid_live_share_path(p_path) then
    raise exception 'invalid planned live-share path' using errcode = '22023';
  end if;

  select shares.recipient_id into v_recipient
  from public.live_location_shares as shares
  where shares.id = p_id and shares.sharer_id = v_sharer;
  if not found then
    raise exception 'live share not found' using errcode = '42501';
  end if;
  v_pair_key := least(v_sharer, v_recipient)::text || ':' || greatest(v_sharer, v_recipient)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_pair_key), 651100);

  select shares.* into v_share
  from public.live_location_shares as shares
  where shares.id = p_id and shares.sharer_id = v_sharer
  for update;
  if not found then
    raise exception 'live share not found' using errcode = '42501';
  end if;
  if v_share.stopped_at is not null or v_share.expires_at <= v_now then
    raise exception 'live share has ended' using errcode = '42501';
  end if;
  if public.beacon_pair_is_blocked(v_sharer, v_recipient)
     or not public.beacon_pair_is_connected(v_sharer, v_recipient) then
    raise exception 'live sharing requires an unblocked accepted circle connection'
      using errcode = '42501';
  end if;

  update public.live_location_shares
  set planned_path = p_path
  where id = p_id;
end;
$$;

revoke all on function public.set_live_share_path(uuid, jsonb) from public, anon;
grant execute on function public.set_live_share_path(uuid, jsonb) to authenticated;
