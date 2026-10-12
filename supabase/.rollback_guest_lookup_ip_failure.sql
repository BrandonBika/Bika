begin;

create or replace function public.record_guest_lookup_ip_failure(p_ip_key_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failures integer;
  v_window_started_at timestamptz;
  v_captcha_required boolean;
  v_slow_down_until timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_ip_key_hash is null or btrim(p_ip_key_hash) = '' then
    raise exception 'IP key hash is required' using errcode = '22023';
  end if;
  insert into public.guest_report_lookup_ip_counters (ip_key_hash, failed_attempts)
  values (p_ip_key_hash, 1)
  on conflict (ip_key_hash) do update
  set failed_attempts = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then 1
        else guest_report_lookup_ip_counters.failed_attempts + 1
      end,
      window_started_at = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then now()
        else guest_report_lookup_ip_counters.window_started_at
      end,
      captcha_required = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then false
        when guest_report_lookup_ip_counters.failed_attempts + 1 >= 20 then true
        else guest_report_lookup_ip_counters.captcha_required
      end,
      slow_down_until = case
        when guest_report_lookup_ip_counters.window_started_at < now() - interval '15 minutes' then null
        when guest_report_lookup_ip_counters.failed_attempts + 1 >= 20 then now() + interval '30 seconds'
        else guest_report_lookup_ip_counters.slow_down_until
      end,
      updated_at = now()
  returning failed_attempts, window_started_at, captcha_required, slow_down_until
    into v_failures, v_window_started_at, v_captcha_required, v_slow_down_until;
  return jsonb_build_object(
    'ip_failure_count', v_failures,
    'ip_window_started_at', v_window_started_at,
    'ip_captcha_required', v_captcha_required,
    'ip_slow_down_until', v_slow_down_until
  );
end;
$$;
revoke all on function public.record_guest_lookup_ip_failure(text)
  from public, anon, authenticated;
grant execute on function public.record_guest_lookup_ip_failure(text)
  to service_role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  result jsonb;
  attempt integer;
begin
  for attempt in 1..20 loop
    result := public.record_guest_lookup_ip_failure('rollback-test-hash-20261012');
  end loop;
  if (result ->> 'ip_failure_count')::integer <> 20
     or (result ->> 'ip_captcha_required')::boolean is not true
     or (result ->> 'ip_slow_down_until') is null then
    raise exception 'IP failure RPC did not set its temporary CAPTCHA and slow-down flags';
  end if;
end
$$;
reset role;

rollback;
