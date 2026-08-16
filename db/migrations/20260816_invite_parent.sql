-- public.invite_parent(parent_row) — offer an account to an adult the club
-- already holds a name, an email and a phone number for.
--
-- Jay, 16 Aug 2026: "when parent is added to a player account then there should
-- be an invite button that the coaches, managers, and admin can click to send
-- that person an email invitation" — and then, narrowing it to the case that
-- matters most: "if the father adds the mother for example".
--
-- A player_parents row IS the club's knowledge of a person, written in the wrong
-- table: a name and an address pointing at nothing. This turns it into an offer.
--
-- ⚠️ READ 20260816_invite_grant_status.sql FIRST. This function is the reason
-- that one exists. Without it accept_invite granted every invite 'active', and
-- a parent typing an address into the contacts box would have handed the whole
-- squad's children to it.
--
-- == ONE ARGUMENT, AND EVERYTHING ELSE DERIVED ==
--
-- The caller supplies a parent ROW ID and nothing else. Email, player, squad,
-- club and role all come off that row. ⚠️ THE EMAIL IS READ FROM THE ROW AND IS
-- NEVER A PARAMETER — the same property that makes claim_roster_access safe. If
-- it were a parameter, "invite this row" would become "invite anyone, and
-- attach them to this row's child".
--
-- == WHO MAY PRESS IT: EXACTLY WHO MAY ALREADY EDIT THE ROW ==
--
--   parent edit own   is_own_player(player_id)        -- the child's own parent
--   parent edit       can_edit_team(player's team)    -- coach, manager, medic,
--                                                        and club admins
--
-- No new permission is created. ⚠️ src/data/parents.js's header claimed the edit
-- policy was can_edit_team ONLY; that is STALE — `parent edit own` has existed
-- since 4 Aug and is why a parent can add the other parent at all.
--
-- == AND WHAT THE INVITE IS WORTH: ONLY WHAT THE CALLER COULD ALREADY APPROVE ==
--
-- grant_status is 'active' if and only if private.can_approve_team is true for
-- the caller, otherwise 'pending'. That rule is the whole safety argument, and
-- it is deliberately NOT "is the caller staff":
--
--   * can_approve_team is admin + coach + manager of that squad. Those people
--     can flip a pending row to active a second after it arrives, so letting
--     their invite land active is not an escalation — it saves a click.
--   * ⚠️ MEDIC IS IN can_edit_team AND NOT IN can_approve_team. A medic may
--     press the button (they may edit the row) but their invite lands PENDING,
--     because a medic cannot approve and must not be able to grant by the back
--     door what they cannot grant by the front one.
--   * a PARENT can approve nothing, so a parent's invite lands pending. The
--     invitee gets their own child and the squad's fixtures — `player read` is
--     `can_see_team OR is_own_player` — and not one other family's details.
--
-- ⚠️ THE INVARIANT TO KEEP: **nobody can mint an invite worth more than they
-- could approve.** If a fourth role is ever added, that sentence is the test.

begin;

alter table public.player_parents
  add column if not exists invited_at timestamptz;

comment on column public.player_parents.invited_at is
  'When public.invite_parent last created an invite for this row. Drives the '
  'button''s Invite / Sent / Joined states. NOT proof of delivery — the send is '
  'a separate edge function and can fail after this is stamped.';

create or replace function public.invite_parent(p_parent_row uuid)
 returns public.invites
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  row_p     public.player_parents%rowtype;
  ply       public.players%rowtype;
  clean     text;
  may_edit  boolean;
  may_grant boolean;
  existing  public.invites;
  made      public.invites;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select * into row_p from public.player_parents where id = p_parent_row;
  if row_p.id is null then
    raise exception 'That contact no longer exists.' using errcode = '22023';
  end if;

  select * into ply from public.players where id = row_p.player_id;
  if ply.id is null then
    raise exception 'That contact is not attached to a player.' using errcode = '22023';
  end if;

  -- ⚠️ AUTHORISATION BEFORE ANYTHING ELSE IS READ BACK TO THE CALLER. Ordering
  -- this after the email check would turn the error messages into an oracle for
  -- whether a given contact row has an address on file.
  may_edit := private.is_own_player(row_p.player_id)
              or private.can_edit_team(ply.team_id);
  if not may_edit then
    raise exception 'You cannot invite that person.' using errcode = '42501';
  end if;

  clean := lower(nullif(btrim(row_p.email), ''));
  if clean is null then
    raise exception 'There is no email address on that contact yet. Add one first.'
      using errcode = '22023';
  end if;
  -- Deliberately weak: a real address check is impossible and a strict pattern
  -- refuses valid addresses. This only catches the obvious typo before an email
  -- is spent on it.
  if position('@' in clean) = 0 then
    raise exception 'That contact''s email address does not look right.' using errcode = '22023';
  end if;

  -- ⚠️ SOMEBODY WITH AN ACCOUNT MUST NOT BE "INVITED". accept_invite would
  -- create a SECOND membership for a person who already has one, and the button
  -- would be offering a duplicate account to someone who simply needs linking.
  if exists (select 1 from public.profiles pr where lower(pr.email) = clean) then
    raise exception 'That person already has an account. Ask an admin to connect them instead.'
      using errcode = '42710';
  end if;

  -- Idempotent: a second press returns the invite already outstanding rather
  -- than minting a second token. Two live tokens for one address is two ways in
  -- and one of them is untracked.
  select * into existing
    from public.invites i
   where lower(i.email) = clean
     and i.player_id    = row_p.player_id
     and i.accepted_at is null
   limit 1;
  if existing.id is not null then
    return existing;
  end if;

  -- THE RULE. See the header: only what the caller could already approve.
  may_grant := private.can_approve_team(ply.team_id);

  insert into public.invites (club_id, email, role, team_id, player_id, created_by, grant_status)
  values (ply.club_id, clean, 'parent', ply.team_id, row_p.player_id, auth.uid(),
          case when may_grant then 'active' else 'pending' end)
  returning * into made;

  update public.player_parents set invited_at = now() where id = row_p.id;

  return made;
end;
$function$
;

-- ⚠️ `revoke ... from public` DOES NOT REMOVE anon ON SUPABASE — its default
-- privileges grant EXECUTE explicitly on creation. Measured on 16 Aug 2026 with
-- request_staff_role; see that migration's header.
revoke all on function public.invite_parent(uuid) from public;
revoke execute on function public.invite_parent(uuid) from anon;
grant execute on function public.invite_parent(uuid) to authenticated;

commit;
