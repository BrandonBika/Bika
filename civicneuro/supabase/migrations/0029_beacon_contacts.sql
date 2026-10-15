create table if not exists public.beacon_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  phone text not null,
  phone_normalized text not null check (phone_normalized ~ '^[0-9]{7,15}$'),
  invitation_status text not null default 'saved'
    check (invitation_status in ('saved', 'message_prepared')),
  message_prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beacon_contacts_owner_phone_unique unique (owner_id, phone_normalized)
);

alter table public.beacon_contacts enable row level security;

revoke all on public.beacon_contacts from anon, authenticated;
grant select, insert, update, delete on public.beacon_contacts to authenticated;

drop policy if exists beacon_contacts_select_own on public.beacon_contacts;
create policy beacon_contacts_select_own
  on public.beacon_contacts
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists beacon_contacts_insert_own on public.beacon_contacts;
create policy beacon_contacts_insert_own
  on public.beacon_contacts
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists beacon_contacts_update_own on public.beacon_contacts;
create policy beacon_contacts_update_own
  on public.beacon_contacts
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists beacon_contacts_delete_own on public.beacon_contacts;
create policy beacon_contacts_delete_own
  on public.beacon_contacts
  for delete
  to authenticated
  using (auth.uid() = owner_id);

create or replace function public.set_beacon_contacts_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_beacon_contacts_updated_at() from public, anon, authenticated;

drop trigger if exists set_beacon_contacts_updated_at on public.beacon_contacts;
create trigger set_beacon_contacts_updated_at
  before update on public.beacon_contacts
  for each row execute function public.set_beacon_contacts_updated_at();

notify pgrst, 'reload schema';
