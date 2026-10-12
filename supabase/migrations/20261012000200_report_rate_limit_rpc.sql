create or replace function public.consume_report_rate_limit(
  p_scope text,
  p_key_hash text,
  p_request_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_window_started_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_scope is null or btrim(p_scope) = ''
     or p_key_hash is null or btrim(p_key_hash) = ''
     or p_request_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  insert into public.rate_limits (
    scope, key_hash, request_count, window_started_at
  )
  values (p_scope, p_key_hash, 1, now())
  on conflict (scope, key_hash) do update
  set request_count = case
        when rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
        else rate_limits.request_count + 1
      end,
      window_started_at = case
        when rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
        else rate_limits.window_started_at
      end,
      updated_at = now()
  returning request_count, window_started_at
    into v_count, v_window_started_at;

  return jsonb_build_object(
    'allowed', v_count <= p_request_limit,
    'request_count', v_count,
    'window_started_at', v_window_started_at
  );
end;
$$;

revoke all on function public.consume_report_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_report_rate_limit(text, text, integer, integer)
  to service_role;
