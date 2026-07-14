-- =============================================================================
-- Organization invitations + team management.
--
-- WHY A NEW TABLE: an invitation exists BEFORE the invitee has a profile, and
-- carries its own lifecycle (token, expiry, revocation, acceptance audit), so
-- it cannot live on profiles or orgs. Membership itself stays on
-- profiles.org_id — no join table, one org per user.
--
-- TOKEN MODEL: the app generates a 256-bit random token and stores ONLY its
-- sha256 hash. The raw token appears once in the invite URL the admin shares
-- (WhatsApp / SMS / email). A database leak reveals nothing usable. Possession
-- of the raw token is the authorization to preview the invite; accepting also
-- requires a signed-in user. Invites are single-use (accepted_at) and expire.
--
-- EMAIL IS A HINT, NOT A LOCK: share-links are the primary channel, and the
-- recipient may sign in with a different address (e.g. their Google account).
-- The email column only powers the "pending invite" banner after a plain
-- signup with the invited address.
--
-- ADDITIVE: no existing table, function or policy is modified.
-- =============================================================================

create table org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs (id) on delete cascade,
  email       text,
  role        text not null default 'caretaker'
              check (role in ('admin', 'caretaker', 'viewer')),
  token_hash  text not null unique,
  invited_by  uuid references auth.users (id) on delete set null,
  expires_at  timestamptz not null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index org_invites_org_idx on org_invites (org_id);
create index org_invites_pending_email_idx
  on org_invites (lower(email))
  where accepted_at is null and revoked_at is null;

alter table org_invites enable row level security;

-- Managers see their org's invites in the settings UI. All writes go through
-- the SECURITY DEFINER functions below — no insert/update/delete policies.
create policy invites_select on org_invites
  for select using (org_id = rf_org_id() and rf_is_admin());

-- ---------------------------------------------------------------------------
-- create_invite — owner/admin creates an invite for their own org.
-- The caller supplies the sha256 hash; the raw token never reaches the DB.
-- ---------------------------------------------------------------------------
create or replace function create_invite(
  p_token_hash text,
  p_role       text default 'caretaker',
  p_email      text default null,
  p_ttl_hours  int  default 168
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := rf_org_id();
  v_id  uuid;
begin
  if v_org is null or not rf_is_admin() then
    raise exception 'only owners and admins can invite staff';
  end if;
  if p_role not in ('admin', 'caretaker', 'viewer') then
    raise exception 'invalid role %', p_role;
  end if;
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid token hash';
  end if;

  insert into org_invites (org_id, email, role, token_hash, invited_by, expires_at)
  values (
    v_org,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    p_role,
    p_token_hash,
    auth.uid(),
    now() + make_interval(hours => greatest(1, least(p_ttl_hours, 720)))
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_preview — public: what the invite landing page shows. Possessing the
-- 256-bit token IS the authorization to see the org name and inviter.
-- ---------------------------------------------------------------------------
create or replace function invite_preview(p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  select i.*, o.name as org_name, p.full_name as inviter_name
    into v
  from org_invites i
  join orgs o on o.id = i.org_id
  left join profiles p on p.id = i.invited_by
  where i.token_hash = p_token_hash;

  if v.id is null then
    return jsonb_build_object('status', 'not_found');
  elsif v.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  elsif v.accepted_at is not null then
    return jsonb_build_object('status', 'accepted');
  elsif v.expires_at < now() then
    return jsonb_build_object('status', 'expired');
  end if;

  return jsonb_build_object(
    'status',       'valid',
    'org_id',       v.org_id,
    'org_name',     v.org_name,
    'inviter_name', v.inviter_name,
    'role',         v.role,
    'email',        v.email
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite — signed-in user joins the inviting org. Single-use and
-- row-locked, so a replayed or raced acceptance cannot create duplicates.
-- ---------------------------------------------------------------------------
create or replace function accept_invite(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_invite  record;
  v_profile record;
  v_name    text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite
  from org_invites
  where token_hash = p_token_hash
  for update;

  if v_invite.id is null then
    raise exception 'invite not found';
  elsif v_invite.revoked_at is not null then
    raise exception 'invite was revoked';
  elsif v_invite.accepted_at is not null then
    raise exception 'invite was already used';
  elsif v_invite.expires_at < now() then
    raise exception 'invite has expired';
  end if;

  select * into v_profile from profiles where id = v_uid;

  if v_profile.id is not null then
    if v_profile.org_id = v_invite.org_id then
      -- Double-click / refresh after joining: idempotent success.
      update org_invites
         set accepted_by = v_uid, accepted_at = now()
       where id = v_invite.id;
      return jsonb_build_object('org_id', v_invite.org_id, 'already_member', true);
    end if;
    raise exception 'this account already belongs to another organization';
  end if;

  select coalesce(
           nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
           nullif(trim(raw_user_meta_data ->> 'name'), ''),
           ''
         )
    into v_name
  from auth.users where id = v_uid;

  insert into profiles (id, org_id, full_name, role)
  values (v_uid, v_invite.org_id, v_name, v_invite.role);

  update org_invites
     set accepted_by = v_uid, accepted_at = now()
   where id = v_invite.id;

  return jsonb_build_object('org_id', v_invite.org_id, 'role', v_invite.role);
end;
$$;

-- ---------------------------------------------------------------------------
-- pending_invite_for_me — live invite matching the caller's email, for the
-- onboarding "join instead of creating an org" banner. Returns null if none.
-- ---------------------------------------------------------------------------
create or replace function pending_invite_for_me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v record;
begin
  if auth.uid() is null then
    return null;
  end if;

  select i.id, i.role, o.name as org_name
    into v
  from org_invites i
  join orgs o on o.id = i.org_id
  where i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
    and i.email is not null
    and i.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by i.created_at desc
  limit 1;

  if v.id is null then
    return null;
  end if;
  return jsonb_build_object('invite_id', v.id, 'org_name', v.org_name, 'role', v.role);
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_pending_invite — accept the email-matched invite WITHOUT the raw
-- token (used by the onboarding banner; the email match is verified against
-- the caller's authenticated JWT, so this is as strong as the email itself).
-- ---------------------------------------------------------------------------
create or replace function accept_pending_invite()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select token_hash into v_hash
  from org_invites
  where accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and email is not null
    and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by created_at desc
  limit 1;

  if v_hash is null then
    raise exception 'no pending invite for this email';
  end if;

  return accept_invite(v_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- revoke_invite — owner/admin cancels a live invite in their org.
-- ---------------------------------------------------------------------------
create or replace function revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not rf_is_admin() then
    raise exception 'only owners and admins can revoke invites';
  end if;

  update org_invites
     set revoked_at = now()
   where id = p_invite
     and org_id = rf_org_id()
     and accepted_at is null
     and revoked_at is null;

  if not found then
    raise exception 'invite not found or no longer active';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team management. Email lives only in auth.users, hence the definer join.
-- ---------------------------------------------------------------------------
create or replace function list_members()
returns table (
  id         uuid,
  full_name  text,
  email      text,
  role       text,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, u.email::text, p.role, p.created_at
  from profiles p
  join auth.users u on u.id = p.id
  where p.org_id = rf_org_id()
  order by
    case p.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    p.created_at;
$$;

create or replace function set_member_role(p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target record;
begin
  if not rf_is_admin() then
    raise exception 'only owners and admins can change roles';
  end if;
  if p_role not in ('admin', 'caretaker', 'viewer') then
    raise exception 'invalid role % (ownership is transferred, not assigned)', p_role;
  end if;

  select * into v_target from profiles where id = p_member;
  if v_target.id is null or v_target.org_id <> rf_org_id() then
    raise exception 'member not found in your organization';
  end if;
  if v_target.role = 'owner' then
    raise exception 'the owner''s role cannot be changed here';
  end if;

  update profiles set role = p_role where id = p_member;
end;
$$;

create or replace function remove_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target record;
begin
  if not rf_is_admin() then
    raise exception 'only owners and admins can remove members';
  end if;
  if p_member = auth.uid() then
    raise exception 'you cannot remove yourself';
  end if;

  select * into v_target from profiles where id = p_member;
  if v_target.id is null or v_target.org_id <> rf_org_id() then
    raise exception 'member not found in your organization';
  end if;
  if v_target.role = 'owner' then
    raise exception 'the owner cannot be removed';
  end if;

  -- Only the profile goes; the auth user and their recorded_by history stay.
  delete from profiles where id = p_member;
end;
$$;

create or replace function transfer_ownership(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_target record;
begin
  if not rf_is_owner() then
    raise exception 'only the owner can transfer ownership';
  end if;
  if p_member = auth.uid() then
    raise exception 'you already own this organization';
  end if;

  select * into v_target from profiles where id = p_member;
  if v_target.id is null or v_target.org_id <> rf_org_id() then
    raise exception 'member not found in your organization';
  end if;

  update profiles set role = 'admin' where id = auth.uid();
  update profiles set role = 'owner' where id = p_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- Org settings: owners/admins may rename their org (direct table update).
-- ---------------------------------------------------------------------------
create policy orgs_update on orgs
  for update using (id = rf_org_id() and rf_is_admin())
  with check (id = rf_org_id());

-- ---------------------------------------------------------------------------
-- Grants: definer functions are locked down to exactly who needs them.
-- ---------------------------------------------------------------------------
revoke execute on function
  create_invite(text, text, text, int),
  invite_preview(text),
  accept_invite(text),
  pending_invite_for_me(),
  accept_pending_invite(),
  revoke_invite(uuid),
  list_members(),
  set_member_role(uuid, text),
  remove_member(uuid),
  transfer_ownership(uuid)
from public, anon;

grant execute on function
  create_invite(text, text, text, int),
  accept_invite(text),
  pending_invite_for_me(),
  accept_pending_invite(),
  revoke_invite(uuid),
  list_members(),
  set_member_role(uuid, text),
  remove_member(uuid),
  transfer_ownership(uuid)
to authenticated;

-- The landing page must preview an invite before the user signs in.
grant execute on function invite_preview(text) to anon, authenticated;
