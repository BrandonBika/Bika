create or replace function public.set_home_location(
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception 'valid coordinates are required' using errcode = '22023';
  end if;

  update public.profiles
  set home_location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  where id = auth.uid();

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.clear_home_location()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.profiles
  set home_location = null
  where id = auth.uid();

  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.get_area_insights(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
set row_security = off
as $$
declare
  c_radius_m constant integer := 5000;
  c_min_trending_total constant integer := 5;
  c_min_top_category constant integer := 3;
  c_min_pulse_total constant integer := 10;
  c_pulse_days constant integer := 30;
  v_days integer := coalesce(p_days, 7);
  v_home_location extensions.geography(Point, 4326);
  v_trending_total bigint;
  v_top_category text;
  v_top_count bigint;
  v_pulse_total bigint;
  v_pulse_resolved bigint;
  v_trending jsonb;
  v_pulse jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_days < 1 or v_days > 90 then
    raise exception 'window days must be between 1 and 90' using errcode = '22023';
  end if;

  select profile.home_location
  into v_home_location
  from public.profiles as profile
  where profile.id = auth.uid();

  if v_home_location is null then
    return jsonb_build_object(
      'state', 'no_area',
      'window_days', v_days,
      'radius_m', c_radius_m,
      'trending', null,
      'pulse', null
    );
  end if;

  with area_reports as (
    select nullif(lower(trim(report.category)), '') as category
    from public.reports as report
    where report.reporter_type = 'resident'
      and report.location is not null
      and st_dwithin(report.location, v_home_location, c_radius_m)
      and report.created_at >= now() - make_interval(days => v_days)
      and report.created_at <= now()
      and report.status not in ('Rejected', 'Duplicate')
  ),
  category_counts as (
    select area_reports.category, count(*) as report_count
    from area_reports
    where area_reports.category is not null
    group by area_reports.category
  )
  select
    (select count(*) from area_reports),
    category_counts.category,
    category_counts.report_count
  into v_trending_total, v_top_category, v_top_count
  from category_counts
  order by category_counts.report_count desc, category_counts.category asc
  limit 1;

  v_trending_total := coalesce(v_trending_total, 0);
  if v_trending_total >= c_min_trending_total
     and coalesce(v_top_count, 0) >= c_min_top_category then
    v_trending := jsonb_build_object('category', v_top_category, 'count', v_top_count);
  end if;

  select count(*),
         count(*) filter (where report.status = 'Resolved')
  into v_pulse_total, v_pulse_resolved
  from public.reports as report
  where report.reporter_type = 'resident'
    and report.location is not null
    and st_dwithin(report.location, v_home_location, c_radius_m)
    and report.created_at >= now() - make_interval(days => c_pulse_days)
    and report.created_at <= now()
    and report.status not in ('Rejected', 'Duplicate');

  if v_pulse_total >= c_min_pulse_total then
    v_pulse := jsonb_build_object(
      'resolved_pct',
      round(100.0 * v_pulse_resolved / v_pulse_total)::integer,
      'total',
      v_pulse_total
    );
  end if;

  return jsonb_build_object(
    'state', case when v_trending is null and v_pulse is null then 'insufficient' else 'ok' end,
    'window_days', v_days,
    'radius_m', c_radius_m,
    'trending', v_trending,
    'pulse', v_pulse
  );
end;
$$;

revoke all on function public.set_home_location(double precision, double precision) from public, anon;
revoke all on function public.clear_home_location() from public, anon;
revoke all on function public.get_area_insights(integer) from public, anon;
grant execute on function public.set_home_location(double precision, double precision) to authenticated;
grant execute on function public.clear_home_location() to authenticated;
grant execute on function public.get_area_insights(integer) to authenticated;
