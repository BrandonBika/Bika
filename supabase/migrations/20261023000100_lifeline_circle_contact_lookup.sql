create or replace function public.resolve_lifeline_circle_members(p_phones text[])
returns table (phone text, user_id uuid, display_name text)
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
  if p_phones is null or cardinality(p_phones) > 4
     or exists (
       select 1
       from pg_catalog.unnest(p_phones) as supplied(value)
       where pg_catalog.char_length(pg_catalog.regexp_replace(coalesce(supplied.value, ''), '[^0-9]', '', 'g')) not between 7 and 15
     ) then
    raise exception 'one to four valid phone numbers are required' using errcode = '22023';
  end if;

  return query
  select distinct
    pg_catalog.regexp_replace(supplied.value, '[^0-9]', '', 'g'),
    profiles.id,
    profiles.full_name
  from pg_catalog.unnest(p_phones) as supplied(value)
  join public.resident_profiles as profiles
    on pg_catalog.regexp_replace(profiles.phone, '[^0-9]', '', 'g')
       = pg_catalog.regexp_replace(supplied.value, '[^0-9]', '', 'g')
  join public.beacon_connections as connections
    on connections.pair_key =
       least(v_user_id, profiles.id)::text || ':' ||
       greatest(v_user_id, profiles.id)::text
   and connections.status = 'accepted'
  where profiles.id <> v_user_id
    and not public.beacon_pair_is_blocked(v_user_id, profiles.id);
end;
$$;

revoke all on function public.resolve_lifeline_circle_members(text[]) from public, anon, authenticated;
grant execute on function public.resolve_lifeline_circle_members(text[]) to authenticated;

notify pgrst, 'reload schema';
