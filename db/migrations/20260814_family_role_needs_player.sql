-- 14 Aug 2026 — a `parent` or `player` membership must point at a player.
--
-- Jay's ruling, 14 Aug 2026: *"nobody outside staff should be able to create an
-- account without a player"*.
--
-- ══ ⚠️ WHAT THIS DOES AND DOES NOT PREVENT ════════════════════════════════
--
-- ⛔ **IT DOES NOT STOP ANYBODY CREATING A LOGIN, AND NOTHING CAN.** Signing up
-- is Supabase auth, it is open by design, and the app REQUIRES it before
-- registration — the order is sign up, confirm the email, then add your player.
-- An account with no membership at all is therefore a normal, expected,
-- temporary state, and there were three of them on the day this was written
-- (people whose child had already been registered by someone else). They are
-- visible to an admin in "waiting for access" on the Accounts screen, and the
-- 14 Aug duplicate guard now tells them what to do instead.
--
-- ✅ **WHAT IT STOPS is a `parent` or `player` MEMBERSHIP that points at no
-- player** — an account that has been let into a squad and can see every child
-- in it while being unable to touch its own. That row is never useful:
-- `private.is_own_player` needs a real `player_id`, so availability, the photo
-- and the gender are all unreachable for the one child the account exists for.
--
-- ══ ⚠️ WHY A CONSTRAINT AND NOT A FIX IN THE SCREEN ═══════════════════════
--
-- The screen already refuses it. `AccessBuilder` returns "Choose a child" and
-- will not submit. **Three other ways in did not:**
--
--   1. `public.accept_invite` — an invite carrying role `parent` with no
--      player, or an invite_target row with a null `player_id`, inserted the
--      broken membership with no complaint. Fixed below, because a constraint
--      alone would turn that into a raw 23514 in the face of whoever clicked
--      the invite link.
--   2. `grantMemberships` in src/data/members.js — `player_id: playerId ?? null`
--      straight into an INSERT. The guard is in the component above it, so any
--      future caller of the data function inherits nothing.
--   3. Hand-written SQL.
--
-- One row existed when this was written and it came from one of those routes:
-- an active `parent` on U18B with no player. She could see all four boys in the
-- squad and could not set her own son's availability.
--
-- ══ ⚠️ STAFF KEEP A NULL player_id, AND THAT IS THE POINT OF THE ROLE LIST ══
--
-- `admin`, `coach`, `manager` and `medic` legitimately have none — 11 such rows
-- live. The constraint names the two family roles rather than saying "player_id
-- is not null", which would break every staff membership in the club.
--
-- ⚠️ A COACH OR MANAGER *MAY* CARRY ONE and two do: the grant screen sets it
-- when the same person is also that child's parent. Allowed, not required.

alter table public.memberships
  add constraint memberships_family_role_needs_player
  check (role not in ('parent', 'player') or player_id is not null);

-- ── The invite path ────────────────────────────────────────────────────────
--
-- ⚠️ THE GUARD GOES BEFORE `update invites set accepted_at`, so a refused
-- invite is NOT burned. Putting it after would mark the invite used, refuse the
-- membership, and leave the person holding a link that now reports "already
-- used" — the worst of both.
--
-- Only the two family roles are checked, and only against the player the insert
-- would actually use: `invite_targets.player_id` when there are targets,
-- `invites.player_id` when there are not. Those are the two branches below, and
-- checking the wrong one would let the other through.
create or replace function public.accept_invite(_token uuid)
returns setof memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inv public.invites%rowtype;
  caller_email text;
  target_count int;
  missing_player int;
begin
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'You must be signed in to accept an invite.';
  end if;

  select * into inv from public.invites where token = _token for update;
  if not found then
    raise exception 'This invite link is not valid.';
  end if;

  if inv.accepted_at is not null then
    raise exception 'This invite has already been used.';
  end if;

  if lower(inv.email) <> lower(caller_email) then
    raise exception 'This invite was sent to a different email address than the one you signed in with.';
  end if;

  select count(*) into target_count
  from public.invite_targets t where t.invite_id = inv.id;

  -- Replaces the dropped invites_team_required_unless_admin CHECK.
  if inv.role <> 'admin' and target_count = 0 and inv.team_id is null then
    raise exception 'This invite is incomplete — it has no age group. Ask an admin to send a new one.';
  end if;

  -- ⚠️ ADDED 14 Aug 2026. Without this the insert below violates
  -- memberships_family_role_needs_player and the person accepting a perfectly
  -- ordinary-looking invite gets a raw constraint error naming a table.
  if inv.role in ('parent', 'player') then
    if target_count > 0 then
      select count(*) into missing_player
        from public.invite_targets t
       where t.invite_id = inv.id and t.player_id is null;
    else
      missing_player := case when inv.player_id is null then 1 else 0 end;
    end if;

    if missing_player > 0 then
      raise exception 'This invite is incomplete — it does not say which player it is for. Ask an admin to send a new one.';
    end if;
  end if;

  update public.invites set accepted_at = now() where id = inv.id;

  if target_count > 0 then
    return query
    insert into public.memberships (profile_id, club_id, team_id, role, player_id)
    select distinct auth.uid(), inv.club_id, t.team_id, inv.role, t.player_id
    from public.invite_targets t
    where t.invite_id = inv.id
    returning *;
  else
    return query
    insert into public.memberships (profile_id, club_id, team_id, role, player_id)
    values (auth.uid(), inv.club_id, inv.team_id, inv.role, inv.player_id)
    returning *;
  end if;
end;
$function$;

-- ⚠️ RESTATED BECAUSE `create or replace` ON A FUNCTION WHOSE SIGNATURE IS
-- UNCHANGED KEEPS ITS GRANTS — but this one is worth stating anyway, since the
-- anon note in 20260813_revoke_anon_execute.sql means a future DROP here would
-- silently hand `anon` EXECUTE back. accept_invite is authenticated-only.
revoke execute on function public.accept_invite(uuid) from public;
revoke execute on function public.accept_invite(uuid) from anon;
grant execute on function public.accept_invite(uuid) to authenticated;

-- ══ WHAT IS NOT DONE HERE ═════════════════════════════════════════════════
--
-- ⚠️ NOTHING IS DELETED. The three logins with no membership are left exactly
-- as they are: they are not broken, they are people part-way through, and the
-- Accounts screen already lists them.
--
-- ⚠️ AND `register_my_player` NEEDED NO CHANGE. It creates the player and the
-- membership in one transaction and has always linked them, which is why
-- self-registration never produced one of these rows.
