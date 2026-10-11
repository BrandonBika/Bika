create table if not exists public.lifeline_cards (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (char_length(trim(id)) between 1 and 100),
  name text not null check (char_length(trim(name)) between 1 and 100),
  icon text not null check (icon in ('custom', 'police', 'home', 'gbv', 'ambulance', 'fire')),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  members jsonb not null check (
    jsonb_typeof(members) = 'array'
    and jsonb_array_length(members) between 1 and 4
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

alter table public.lifeline_cards enable row level security;

revoke all on public.lifeline_cards from anon, authenticated;
grant select, insert, update, delete on public.lifeline_cards to authenticated;

drop policy if exists lifeline_cards_select_own on public.lifeline_cards;
create policy lifeline_cards_select_own
  on public.lifeline_cards
  for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists lifeline_cards_insert_own on public.lifeline_cards;
create policy lifeline_cards_insert_own
  on public.lifeline_cards
  for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists lifeline_cards_update_own on public.lifeline_cards;
create policy lifeline_cards_update_own
  on public.lifeline_cards
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists lifeline_cards_delete_own on public.lifeline_cards;
create policy lifeline_cards_delete_own
  on public.lifeline_cards
  for delete
  to authenticated
  using (auth.uid() = owner_id);

create or replace function public.set_lifeline_cards_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_lifeline_cards_updated_at() from public, anon, authenticated;

drop trigger if exists set_lifeline_cards_updated_at on public.lifeline_cards;
create trigger set_lifeline_cards_updated_at
  before update on public.lifeline_cards
  for each row execute function public.set_lifeline_cards_updated_at();

notify pgrst, 'reload schema';
