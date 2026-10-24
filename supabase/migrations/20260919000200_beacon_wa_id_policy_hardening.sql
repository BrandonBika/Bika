do $$
begin
  if to_regclass('public.beacon_sessions') is not null then
    execute 'drop policy if exists "Authenticated users view beacon sessions" on public.beacon_sessions';
  end if;

  if to_regclass('public.beacon_location_points') is not null then
    execute 'drop policy if exists "Authenticated users view beacon location points" on public.beacon_location_points';
  end if;
end;
$$;

notify pgrst, 'reload schema';
