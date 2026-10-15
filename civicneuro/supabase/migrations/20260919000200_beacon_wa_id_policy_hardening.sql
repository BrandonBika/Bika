drop policy if exists "Authenticated users view beacon sessions"
  on public.beacon_sessions;

drop policy if exists "Authenticated users view beacon location points"
  on public.beacon_location_points;

notify pgrst, 'reload schema';
