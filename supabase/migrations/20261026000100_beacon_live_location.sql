create table if not exists public.live_location_shares (
  id uuid primary key default gen_random_uuid(),
  sharer_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  stopped_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  last_accuracy_m double precision,
  last_at timestamptz,
  constraint live_location_shares_not_self check (sharer_id <> recipient_id),
  constraint live_location_shares_expiry_range check (
    expires_at <= started_at + interval '1 hour'
  ),
  constraint live_location_shares_location_fields check (
    (last_lat is null and last_lng is null and last_accuracy_m is null and last_at is null)
    or (
      last_lat is not null
      and last_lng is not null
      and last_accuracy_m is not null
      and last_at is not null
      and last_lat between -90 and 90
      and last_lng between -180 and 180
      and last_accuracy_m between 0 and 5000
    )
  )
);

alter table public.live_location_shares
  drop constraint if exists live_location_shares_expiry_range;
alter table public.live_location_shares
  add constraint live_location_shares_expiry_range
  check (expires_at <= started_at + interval '1 hour');

create index if not exists live_location_shares_recipient_active_idx
  on public.live_location_shares (recipient_id, expires_at)
  where stopped_at is null;
create unique index if not exists live_location_shares_active_pair_uidx
  on public.live_location_shares (sharer_id, recipient_id)
  where stopped_at is null;
create unique index if not exists live_location_shares_active_sharer_uidx
  on public.live_location_shares (sharer_id)
  where stopped_at is null;

alter table public.live_location_shares enable row level security;
revoke all on public.live_location_shares from public, anon, authenticated;
grant select on public.live_location_shares to authenticated;
grant all on public.live_location_shares to service_role;

create or replace function public.can_read_live_location_share(
  p_sharer_id uuid,
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select p_recipient_id = (select auth.uid())
    and public.beacon_pair_is_connected(p_sharer_id, p_recipient_id)
    and not public.beacon_pair_is_blocked(p_sharer_id, p_recipient_id);
$$;

revoke all on function public.can_read_live_location_share(uuid, uuid)
  from public, anon;
grant execute on function public.can_read_live_location_share(uuid, uuid)
  to authenticated;

drop policy if exists live_location_shares_select_participants
  on public.live_location_shares;
create policy live_location_shares_select_participants
  on public.live_location_shares
  for select
  to authenticated
  using (
    sharer_id = (select auth.uid())
    or (
      recipient_id = (select auth.uid())
      and stopped_at is null
      and expires_at > pg_catalog.statement_timestamp()
      and public.can_read_live_location_share(sharer_id, recipient_id)
    )
  );

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
      last_at = null
  where stopped_at is null
    and (
      (sharer_id = p_user_a and recipient_id = p_user_b)
      or (sharer_id = p_user_b and recipient_id = p_user_a)
    );
$$;

revoke all on function public.stop_live_shares_for_pair(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.stop_live_shares_after_connection_change()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if old.status = 'accepted' and new.status <> 'accepted' then
    perform public.stop_live_shares_for_pair(old.requester_id, old.addressee_id);
  end if;
  return new;
end;
$$;

drop trigger if exists beacon_connection_stops_live_shares
  on public.beacon_connections;
create trigger beacon_connection_stops_live_shares
  after update of status on public.beacon_connections
  for each row
  when (old.status = 'accepted' and new.status <> 'accepted')
  execute function public.stop_live_shares_after_connection_change();

create or replace function public.stop_live_shares_after_block()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  perform public.stop_live_shares_for_pair(new.blocker_id, new.blocked_id);
  return new;
end;
$$;

drop trigger if exists beacon_block_stops_live_shares on public.beacon_blocks;
create trigger beacon_block_stops_live_shares
  after insert on public.beacon_blocks
  for each row
  execute function public.stop_live_shares_after_block();

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
      last_at = null
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

create or replace function public.update_live_share(
  p_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision
)
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
  if p_lat is null or p_lat < -90 or p_lat > 90
     or p_lng is null or p_lng < -180 or p_lng > 180
     or p_accuracy is null or p_accuracy < 0 or p_accuracy > 5000 then
    raise exception 'invalid live location coordinates or accuracy' using errcode = '22023';
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
  if v_share.last_at is not null
     and v_now < v_share.last_at + interval '5 seconds' then
    raise exception 'live location updates must be at least 5 seconds apart'
      using errcode = '22023';
  end if;

  update public.live_location_shares
  set last_lat = p_lat,
      last_lng = p_lng,
      last_accuracy_m = p_accuracy,
      last_at = v_now
  where id = p_id;
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
      last_at = null
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
      last_at = null
  where expires_at <= v_now
    and (last_lat is not null or last_lng is not null
      or last_accuracy_m is not null or last_at is not null);

  delete from public.live_location_shares
  where coalesce(stopped_at, expires_at) <= v_now - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.purge_live_location_shares() is
  'Purges expired or stopped live shares after 24 hours; invoke from an approved maintenance job.';

revoke all on function public.start_live_share(uuid, integer) from public, anon;
revoke all on function public.update_live_share(uuid, double precision, double precision, double precision)
  from public, anon;
revoke all on function public.stop_live_share(uuid) from public, anon;
revoke all on function public.purge_live_location_shares() from public, anon, authenticated;
grant execute on function public.start_live_share(uuid, integer) to authenticated;
grant execute on function public.update_live_share(uuid, double precision, double precision, double precision)
  to authenticated;
grant execute on function public.stop_live_share(uuid) to authenticated;
grant execute on function public.purge_live_location_shares() to service_role;

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
      and tablename = 'live_location_shares'
  ) then
    execute 'alter publication supabase_realtime add table public.live_location_shares';
  end if;
end;
$$;

notify pgrst, 'reload schema';
