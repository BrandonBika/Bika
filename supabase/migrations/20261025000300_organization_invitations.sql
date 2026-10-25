create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invited_user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  constraint organization_invitations_email_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint organization_invitations_expiry_check
    check (expires_at > created_at),
  constraint organization_invitations_user_id_key unique (invited_user_id)
);

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from public, anon, authenticated;
grant all on public.organization_invitations to service_role;

create or replace function public.accept_organization_invitation(
  p_user_id uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_organization_id uuid;
begin
  if p_user_id is null or p_email is null or btrim(p_email) = '' then
    raise exception 'Invitation identity is invalid'
      using errcode = '22023';
  end if;

  select invitation.organization_id
    into v_organization_id
  from public.organization_invitations as invitation
  where invitation.invited_user_id = p_user_id
    and invitation.email = lower(btrim(p_email))
    and invitation.accepted_at is null
    and invitation.expires_at > pg_catalog.clock_timestamp()
  for update;

  if not found then
    raise exception 'Invitation is invalid or expired'
      using errcode = '22023';
  end if;

  if not public.organization_is_approved(v_organization_id) then
    raise exception 'Organisation is not currently approved and active'
      using errcode = '42501';
  end if;

  insert into public.organization_members (user_id, organization_id, role, is_active)
  values (p_user_id, v_organization_id, 'org_employee', true);

  update public.organization_invitations
  set accepted_at = pg_catalog.clock_timestamp()
  where invited_user_id = p_user_id;

  return v_organization_id;
end;
$$;

revoke all on function public.accept_organization_invitation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
