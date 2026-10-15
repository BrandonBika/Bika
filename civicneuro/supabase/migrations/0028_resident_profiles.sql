create table if not exists public.resident_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  notification_consent boolean not null default false,
  privacy_consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.resident_profiles enable row level security;

revoke all on public.resident_profiles from anon, authenticated;
grant select, update on public.resident_profiles to authenticated;

drop policy if exists resident_profiles_select_own on public.resident_profiles;
create policy resident_profiles_select_own
  on public.resident_profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists resident_profiles_update_own on public.resident_profiles;
create policy resident_profiles_update_own
  on public.resident_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.create_resident_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(new.raw_user_meta_data ? 'privacy_consent_at', false) then
    return new;
  end if;

  insert into public.resident_profiles (
    id,
    full_name,
    email,
    phone,
    address,
    notification_consent,
    privacy_consent_at
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    coalesce((new.raw_user_meta_data ->> 'notification_consent')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'privacy_consent_at')::timestamptz, now())
  );
  return new;
end;
$$;

revoke all on function public.create_resident_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_resident_profile on auth.users;
create trigger on_auth_user_created_resident_profile
  after insert on auth.users
  for each row execute function public.create_resident_profile();

insert into public.resident_profiles (
  id,
  full_name,
  email,
  phone,
  address,
  notification_consent,
  privacy_consent_at
)
select
  users.id,
  coalesce(nullif(users.raw_user_meta_data ->> 'full_name', ''), split_part(users.email, '@', 1)),
  users.email,
  coalesce(users.raw_user_meta_data ->> 'phone', ''),
  coalesce(users.raw_user_meta_data ->> 'address', ''),
  coalesce((users.raw_user_meta_data ->> 'notification_consent')::boolean, false),
  coalesce((users.raw_user_meta_data ->> 'privacy_consent_at')::timestamptz, now())
from auth.users as users
where users.raw_user_meta_data ? 'privacy_consent_at'
on conflict (id) do nothing;

notify pgrst, 'reload schema';
