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
  perform pg_catalog.pg_advisory_xact_lock(hashtext(new.sender_id::text), 652341);

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
