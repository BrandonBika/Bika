create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  jurisdiction_level text not null,
  province text,
  municipality text,
  boundary extensions.geography(MultiPolygon, 4326),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizations
  add column if not exists type text,
  add column if not exists jurisdiction_level text,
  add column if not exists province text,
  add column if not exists municipality text,
  add column if not exists boundary extensions.geography(MultiPolygon, 4326),
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.organizations
  drop column if exists dispatch_contact_name,
  drop column if exists dispatch_contact_phone,
  drop column if exists dispatch_contact_email,
  drop column if exists verification_status;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  title text,
  first_name text,
  last_name text,
  email text,
  phone text,
  preferred_language text,
  address text,
  address_line_2 text,
  suburb text,
  municipality text,
  province text,
  postal_code text,
  home_location extensions.geography(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists title text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists preferred_language text,
  add column if not exists address text,
  add column if not exists address_line_2 text,
  add column if not exists suburb text,
  add column if not exists municipality text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists home_location extensions.geography(Point, 4326),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

insert into public.profiles (id, full_name, first_name, last_name, email, phone, address, created_at, updated_at)
select
  rp.id,
  rp.full_name,
  nullif(split_part(trim(rp.full_name), ' ', 1), ''),
  nullif(trim(substr(trim(rp.full_name), length(split_part(trim(rp.full_name), ' ', 1)) + 1)), ''),
  rp.email,
  rp.phone,
  rp.address,
  rp.created_at,
  rp.updated_at
from public.resident_profiles rp
on conflict (id) do update
set full_name = excluded.full_name,
    first_name = coalesce(nullif(public.profiles.first_name, ''), excluded.first_name),
    last_name = coalesce(nullif(public.profiles.last_name, ''), excluded.last_name),
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    updated_at = greatest(public.profiles.updated_at, excluded.updated_at);

create or replace function public.sync_resident_profile_to_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, first_name, last_name, email, phone, address)
  values (
    new.id,
    new.full_name,
    nullif(split_part(trim(new.full_name), ' ', 1), ''),
    nullif(trim(substr(trim(new.full_name), length(split_part(trim(new.full_name), ' ', 1)) + 1)), ''),
    new.email,
    new.phone,
    new.address
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      first_name = coalesce(nullif(public.profiles.first_name, ''), excluded.first_name),
      last_name = coalesce(nullif(public.profiles.last_name, ''), excluded.last_name),
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      updated_at = now();
  return new;
end;
$$;

revoke all on function public.sync_resident_profile_to_profiles() from public, anon, authenticated;

drop trigger if exists resident_profiles_sync_profiles on public.resident_profiles;
create trigger resident_profiles_sync_profiles
  after insert or update of full_name, email, phone, address
  on public.resident_profiles
  for each row execute function public.sync_resident_profile_to_profiles();

drop trigger if exists profiles_sync_resident_profile on public.profiles;

create sequence if not exists public.report_tracking_number_seq;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  wa_id text,
  reporter_name text,
  organization_id text default 'unassigned',
  category text,
  description text,
  location_lat numeric,
  location_lng numeric,
  location_name text,
  media_url text,
  audio_url text,
  image_url text,
  original_transcription text,
  english_translation text,
  photo_matches_report boolean default true,
  issue_category text,
  urgency text,
  recommended_organization jsonb,
  source text not null,
  legacy boolean not null default false,
  reporter_id uuid references auth.users (id) on delete set null,
  reporter_type text not null default 'anonymous',
  tracking_number text,
  user_selected_category text,
  user_selected_level text,
  ai_category text,
  report_level text not null default 'MEDIUM',
  description_original text,
  description_english text,
  detected_language text,
  user_reported_address text,
  user_selected_organization text,
  user_selected_branch text,
  recommended_organization_text text,
  contact_preference text,
  status text not null default 'Pending Dispatch',
  location extensions.geography(Point, 4326),
  latitude double precision,
  longitude double precision,
  location_accuracy double precision,
  gps_status text,
  extracted_location text,
  visual_evidence_summary text,
  requires_immediate_dispatch boolean not null default false,
  recommended_organization_id uuid references public.organizations (id) on delete set null,
  assigned_organization_id uuid references public.organizations (id) on delete set null,
  alternative_organizations jsonb not null default '[]'::jsonb,
  classification_confidence double precision,
  routing_confidence double precision,
  needs_human_review boolean not null default false,
  review_reason text,
  device_timestamp timestamptz,
  resolved_at timestamptz,
  duplicate_of uuid references public.reports (id) on delete set null,
  incident_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_reporter_type_check
    check (reporter_type in ('resident', 'guest', 'anonymous')),
  constraint reports_source_check
    check (source in ('snap_and_say', 'report_form', 'guest_report') or legacy),
  constraint reports_report_level_check
    check (report_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  constraint reports_user_selected_level_check
    check (user_selected_level is null or user_selected_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  constraint reports_status_check
    check (
      status in (
        'Pending Dispatch',
        'Needs Review',
        'Dispatched',
        'Acknowledged',
        'In Progress',
        'Resolved',
        'Rejected',
        'Duplicate'
      )
      or (legacy and status = 'New')
    )
);

alter table public.reports
  add column if not exists wa_id text,
  add column if not exists reporter_name text,
  add column if not exists organization_id text default 'unassigned',
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists location_lat numeric,
  add column if not exists location_lng numeric,
  add column if not exists location_name text,
  add column if not exists media_url text,
  add column if not exists audio_url text,
  add column if not exists image_url text,
  add column if not exists location_accuracy double precision,
  add column if not exists device_timestamp timestamptz,
  add column if not exists original_transcription text,
  add column if not exists detected_language text,
  add column if not exists english_translation text,
  add column if not exists visual_evidence_summary text,
  add column if not exists photo_matches_report boolean default true,
  add column if not exists issue_category text,
  add column if not exists urgency text,
  add column if not exists requires_immediate_dispatch boolean not null default false,
  add column if not exists extracted_location text,
  add column if not exists recommended_organization jsonb,
  add column if not exists alternative_organizations jsonb not null default '[]'::jsonb,
  add column if not exists classification_confidence double precision,
  add column if not exists routing_confidence double precision,
  add column if not exists needs_human_review boolean not null default false,
  add column if not exists review_reason text,
  add column if not exists gps_status text,
  add column if not exists source text,
  add column if not exists legacy boolean not null default false,
  add column if not exists reporter_id uuid references auth.users (id) on delete set null,
  add column if not exists reporter_type text not null default 'anonymous',
  add column if not exists tracking_number text,
  add column if not exists user_selected_category text,
  add column if not exists user_selected_level text,
  add column if not exists ai_category text,
  add column if not exists report_level text not null default 'MEDIUM',
  add column if not exists description_original text,
  add column if not exists description_english text,
  add column if not exists user_reported_address text,
  add column if not exists user_selected_organization text,
  add column if not exists user_selected_branch text,
  add column if not exists recommended_organization_text text,
  add column if not exists contact_preference text,
  add column if not exists status text not null default 'Pending Dispatch',
  add column if not exists location extensions.geography(Point, 4326),
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists recommended_organization_id uuid references public.organizations (id) on delete set null,
  add column if not exists assigned_organization_id uuid references public.organizations (id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists duplicate_of uuid references public.reports (id) on delete set null,
  add column if not exists incident_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.reports alter column wa_id drop not null;
alter table public.reports alter column category drop not null;
alter table public.reports alter column source set default 'report_form';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'resident_id'
  ) then
    execute 'update public.reports set reporter_id = coalesce(reporter_id, resident_id) where resident_id is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'location_lat'
  ) then
    execute 'update public.reports set latitude = coalesce(latitude, location_lat) where location_lat is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'location_lng'
  ) then
    execute 'update public.reports set longitude = coalesce(longitude, location_lng) where location_lng is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'category'
  ) then
    execute 'update public.reports set user_selected_category = coalesce(user_selected_category, category) where category is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'location_name'
  ) then
    execute 'update public.reports set user_reported_address = coalesce(user_reported_address, location_name) where location_name is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'organization_id'
  ) then
    execute $backfill$
      update public.reports
      set user_selected_organization = coalesce(
        user_selected_organization,
        nullif(organization_id, 'unassigned')
      )
      where organization_id is not null
    $backfill$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'description'
  ) then
    execute 'update public.reports set description_original = coalesce(description_original, description) where description is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'original_transcription'
  ) then
    execute 'update public.reports set description_original = coalesce(description_original, original_transcription) where original_transcription is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'english_translation'
  ) then
    execute 'update public.reports set description_english = coalesce(description_english, english_translation) where english_translation is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'issue_category'
  ) then
    execute 'update public.reports set ai_category = coalesce(ai_category, issue_category) where issue_category is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'recommended_organization'
  ) then
    execute $backfill$
      update public.reports
      set recommended_organization_text = coalesce(
        recommended_organization_text,
        recommended_organization ->> 'organization_name'
      )
      where jsonb_typeof(recommended_organization) = 'object'
    $backfill$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'urgency'
  ) then
    execute $backfill$
      update public.reports
      set report_level = case upper(urgency)
        when 'LOW' then 'LOW'
        when 'MEDIUM' then 'MEDIUM'
        when 'HIGH' then 'HIGH'
        when 'CRITICAL' then 'CRITICAL'
        else 'MEDIUM'
      end
      where report_level = 'MEDIUM'
    $backfill$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reports' and column_name = 'source'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reports' and column_name = 'audio_url'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'reports' and column_name = 'image_url'
    ) then
      execute $backfill$
        update public.reports
        set source = case
          when coalesce(audio_url, '') <> '' or coalesce(image_url, '') <> '' then 'snap_and_say'
          else 'report_form'
        end
        where source is null
      $backfill$;
    else
      execute 'update public.reports set source = ''report_form'' where source is null';
    end if;
  end if;
end;
$$;

update public.reports set reporter_type = 'resident' where reporter_id is not null;
update public.reports
set legacy = true
where source is null
   or source not in ('snap_and_say', 'report_form', 'guest_report');
alter table public.reports alter column source set not null;
update public.reports
set location = extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
where location is null
  and latitude between -90 and 90
  and longitude between -180 and 180;

select setval(
  'public.report_tracking_number_seq',
  greatest(
    coalesce((
      select max((regexp_match(tracking_number, '^CN-[0-9]{4}-([0-9]+)$'))[1]::bigint)
      from public.reports
      where tracking_number ~ '^CN-[0-9]{4}-[0-9]+$'
    ), 0) + 1,
    (select last_value + case when is_called then 1 else 0 end from public.report_tracking_number_seq)
  ),
  false
);

update public.reports
set tracking_number = 'CN-'
  || to_char(coalesce(created_at, now()), 'YYYY')
  || '-'
  || lpad(nextval('public.report_tracking_number_seq')::text, 6, '0')
where tracking_number is null;

alter table public.reports alter column tracking_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass and conname = 'reports_reporter_type_check'
  ) then
    alter table public.reports
      add constraint reports_reporter_type_check
      check (reporter_type in ('resident', 'guest', 'anonymous'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass and conname = 'reports_source_check'
  ) then
    alter table public.reports
      add constraint reports_source_check
      check (source in ('snap_and_say', 'report_form', 'guest_report') or legacy);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass and conname = 'reports_report_level_check'
  ) then
    alter table public.reports
      add constraint reports_report_level_check
      check (report_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass and conname = 'reports_user_selected_level_check'
  ) then
    alter table public.reports
      add constraint reports_user_selected_level_check
      check (user_selected_level is null or user_selected_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass and conname = 'reports_status_check'
  ) then
    alter table public.reports
      add constraint reports_status_check
      check (
        status in (
          'Pending Dispatch',
          'Needs Review',
          'Dispatched',
          'Acknowledged',
          'In Progress',
          'Resolved',
          'Rejected',
          'Duplicate'
        )
        or (legacy and status = 'New')
      );
  end if;
end;
$$;

alter table public.reports validate constraint reports_reporter_type_check;
alter table public.reports validate constraint reports_source_check;
alter table public.reports validate constraint reports_report_level_check;
alter table public.reports validate constraint reports_user_selected_level_check;
alter table public.reports validate constraint reports_status_check;

create table if not exists public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  kind text not null check (kind in ('audio', 'image', 'video')),
  bucket text not null,
  path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  duration_seconds numeric,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

insert into public.report_evidence (
  report_id,
  kind,
  bucket,
  path,
  mime_type,
  size_bytes
)
select
  r.id,
  case
    when media.kind = 'audio' then 'audio'
    when media.kind = 'image' then 'image'
    when o.metadata ->> 'mimetype' like 'audio/%' then 'audio'
    when o.metadata ->> 'mimetype' like 'video/%' then 'video'
    else 'image'
  end,
  o.bucket_id,
  o.name,
  o.metadata ->> 'mimetype',
  case
    when o.metadata ->> 'size' ~ '^[0-9]{1,18}$'
      then (o.metadata ->> 'size')::bigint
    else 0
  end
from public.reports r
cross join lateral (values
  ('media'::text, r.media_url),
  ('audio'::text, r.audio_url),
  ('image'::text, r.image_url)
) as media(kind, reference)
join storage.objects o
  on media.reference = o.name
  or right(media.reference, length('/storage/v1/object/' || o.bucket_id || '/' || o.name))
    = '/storage/v1/object/' || o.bucket_id || '/' || o.name
  or right(media.reference, length('/storage/v1/object/public/' || o.bucket_id || '/' || o.name))
    = '/storage/v1/object/public/' || o.bucket_id || '/' || o.name
  or right(media.reference, length('/storage/v1/object/sign/' || o.bucket_id || '/' || o.name))
    = '/storage/v1/object/sign/' || o.bucket_id || '/' || o.name
join storage.buckets b on b.id = o.bucket_id and b.public = false
where media.reference is not null
  and btrim(media.reference) <> ''
  and (o.metadata ->> 'mimetype' like 'audio/%'
    or o.metadata ->> 'mimetype' like 'video/%'
    or o.metadata ->> 'mimetype' like 'image/%')
on conflict (bucket, path) do nothing;

create table if not exists public.report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  event_type text not null,
  note text,
  actor_id uuid references auth.users (id) on delete set null,
  from_status text,
  to_status text,
  from_organization_id uuid references public.organizations (id) on delete set null,
  to_organization_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.report_events
  add column if not exists note text;

create table if not exists public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  model text not null,
  prompt_version text not null,
  raw_output jsonb,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  tokens jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null,
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_location_gist_idx
  on public.reports using gist (location);
create index if not exists organizations_boundary_gist_idx
  on public.organizations using gist (boundary)
  where boundary is not null;
create unique index if not exists reports_tracking_number_uidx
  on public.reports (tracking_number);
create unique index if not exists reports_idempotency_key_uidx
  on public.reports (idempotency_key)
  where idempotency_key is not null;
create index if not exists reports_reporter_created_at_idx
  on public.reports (reporter_id, created_at desc);
create index if not exists report_evidence_report_id_idx
  on public.report_evidence (report_id, created_at);
create index if not exists report_events_report_id_created_at_idx
  on public.report_events (report_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-evidence',
  'report-evidence',
  false,
  25 * 1024 * 1024,
  array[
    'audio/aac', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
    'audio/wav', 'audio/webm', 'audio/x-wav',
    'image/heic', 'image/heif', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'video/3gpp', 'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.reports enable row level security;
alter table public.report_evidence enable row level security;
alter table public.report_events enable row level security;
alter table public.ai_runs enable row level security;
alter table public.consents enable row level security;

revoke all on public.organizations, public.profiles, public.reports,
  public.report_evidence, public.report_events, public.ai_runs, public.consents
  from anon, authenticated;
revoke all on public.organizations from anon, authenticated;
grant select (name, type, jurisdiction_level, province, municipality, is_active)
  on public.organizations to anon, authenticated;
grant select on public.profiles to authenticated;
revoke update (first_name, last_name, email, phone, address)
  on public.profiles from authenticated;
grant update (title, preferred_language, address_line_2, suburb, municipality, province,
  postal_code, home_location)
  on public.profiles to authenticated;
grant select, insert on public.consents to authenticated;
grant update (revoked_at) on public.consents to authenticated;
grant select on public.reports, public.report_evidence to authenticated;
grant all on public.organizations, public.profiles, public.reports,
  public.report_evidence, public.report_events, public.ai_runs, public.consents to service_role;
grant usage, select on sequence public.report_tracking_number_seq to service_role;

drop policy if exists organizations_select_active on public.organizations;
create policy organizations_select_active
  on public.organizations for select to anon, authenticated
  using (is_active);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists consents_select_own on public.consents;
create policy consents_select_own
  on public.consents for select to authenticated
  using (user_id = auth.uid());

drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own
  on public.consents for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists consents_revoke_own on public.consents;
create policy consents_revoke_own
  on public.consents for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reports'
      and policyname not in ('reports_select_own', 'reports_service_role_all')
  loop
    execute format('drop policy %I on public.reports', policy_record.policyname);
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reports'
      and policyname = 'reports_select_own'
  ) then
    create policy reports_select_own
      on public.reports for select to authenticated
      using (reporter_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reports'
      and policyname = 'reports_service_role_all'
  ) then
    create policy reports_service_role_all
      on public.reports for all to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

drop policy if exists report_evidence_select_own on public.report_evidence;
create policy report_evidence_select_own
  on public.report_evidence for select to authenticated
  using (
    exists (
      select 1 from public.reports r
      where r.id = report_id and r.reporter_id = auth.uid()
    )
  );

revoke all on public.report_events from service_role;
grant select on public.report_events to service_role;
revoke all on public.report_events from public, anon, authenticated;
drop policy if exists report_events_select_service_role on public.report_events;
create policy report_events_select_service_role
  on public.report_events for select to service_role
  using (true);

drop policy if exists ai_runs_service_role_all on public.ai_runs;
create policy ai_runs_service_role_all
  on public.ai_runs for all to service_role
  using (true)
  with check (true);

drop policy if exists consents_service_role_all on public.consents;
create policy consents_service_role_all
  on public.consents for all to service_role
  using (true)
  with check (true);

drop policy if exists organizations_service_role_all on public.organizations;
create policy organizations_service_role_all
  on public.organizations for all to service_role
  using (true)
  with check (true);
drop policy if exists profiles_service_role_all on public.profiles;
create policy profiles_service_role_all
  on public.profiles for all to service_role
  using (true)
  with check (true);
drop policy if exists report_evidence_service_role_all on public.report_evidence;
create policy report_evidence_service_role_all
  on public.report_evidence for all to service_role
  using (true)
  with check (true);

create or replace function public.record_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
begin
  if tg_op = 'INSERT' then
    insert into public.report_events (report_id, event_type, actor_id, to_status, to_organization_id)
    values (new.id, 'report_created', auth.uid(), new.status, new.assigned_organization_id);
    return new;
  end if;

  if old.status is distinct from new.status
     or old.assigned_organization_id is distinct from new.assigned_organization_id then
    event_name := case
      when old.status is distinct from new.status
       and old.assigned_organization_id is distinct from new.assigned_organization_id
        then 'status_and_assignment_changed'
      when old.status is distinct from new.status then 'status_changed'
      else 'assignment_changed'
    end;
    insert into public.report_events (
      report_id,
      event_type,
      actor_id,
      from_status,
      to_status,
      from_organization_id,
      to_organization_id
    )
    values (
      new.id,
      event_name,
      auth.uid(),
      old.status,
      new.status,
      old.assigned_organization_id,
      new.assigned_organization_id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_report_event() from public, anon, authenticated;

create or replace function public.log_report_event(
  p_report_id uuid,
  p_event_type text,
  p_note text,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if p_event_type not in ('ai_classified', 'routed', 'human_override') then
    raise exception 'Unsupported report event type';
  end if;

  insert into public.report_events (report_id, event_type, note, actor_id)
  values (p_report_id, p_event_type, p_note, p_actor)
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.log_report_event(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.log_report_event(uuid, text, text, uuid)
  to service_role;

create or replace function public.generate_report_tracking_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tracking_number is null then
    new.tracking_number := 'CN-'
      || to_char(coalesce(new.created_at, now()), 'YYYY')
      || '-'
      || lpad(nextval('public.report_tracking_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

revoke all on function public.generate_report_tracking_number() from public, anon, authenticated;

drop trigger if exists reports_generate_tracking_number on public.reports;
create trigger reports_generate_tracking_number
  before insert on public.reports
  for each row execute function public.generate_report_tracking_number();

drop trigger if exists reports_updated_at on public.reports;
create trigger reports_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();
drop trigger if exists consents_updated_at on public.consents;
create trigger consents_updated_at
  before update on public.consents
  for each row execute function public.set_updated_at();

drop trigger if exists reports_record_events on public.reports;
create trigger reports_record_events
  after insert or update of status, assigned_organization_id on public.reports
  for each row execute function public.record_report_event();

drop policy if exists report_evidence_objects_select_own on storage.objects;
create policy report_evidence_objects_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-evidence'
    and exists (
      select 1 from public.report_evidence e
      join public.reports r on r.id = e.report_id
      where e.bucket = storage.objects.bucket_id
        and e.path = storage.objects.name
        and r.reporter_id = auth.uid()
    )
  );

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'reports'
order by policyname;

notify pgrst, 'reload schema';
