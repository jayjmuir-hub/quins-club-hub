-- ══════════════════════════════════════════════════════════════════════════
--  private.can_edit_team must check membership STATUS
--  10 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THIS OVERTURNS A DELIBERATE DECISION. IT WAS NOT AN OVERSIGHT.
-- db/migrations/20260808_membership_pending_status.sql says, in as many words:
--
--     ⚠️ can_edit_team is deliberately NOT status-gated here. Staff roles are
--     granted by an admin, never self-registered, so a pending coach cannot
--     exist. Adding the check would be harmless but implies a state that has
--     no way of arising, and an unreachable branch is a lie about the model.
--
-- That reasoning is sound and its premise is still true today. It is
-- overturned on Jay's instruction (10 Aug 2026, "fix the private.can_edit
-- issue"), and on the argument below — not because anybody found it wrong.
-- **The original author's own words are that the check would be harmless**,
-- so the disagreement is narrow: whether an unreachable branch is a lie about
-- the model, or a seatbelt for the day the model changes.
--
-- THE GAP. `private.can_see_team` has always carried `m.status = 'active'`.
-- `private.can_edit_team` never did. So a membership row with
-- status = 'pending' and role in ('coach','manager','medic') — or role
-- 'admin' — passed every policy built on can_edit_team.
--
-- ⚠️ THIRTEEN POLICIES ARE BUILT ON IT, measured 10 Aug 2026 against live:
--
--     events            event edit          ALL
--     players           player edit         ALL
--     player_contacts   contact edit        ALL
--     player_parents    parent edit         ALL
--     attendance        read / insert / update / delete
--     availability      insert / update / delete, and one arm of `avail read`
--     storage.objects   player photo write  ALL
--
-- So a pending coach could create and delete fixtures, edit and delete
-- children, read and rewrite parent contact details, upload and delete player
-- photographs, and write both attendance and availability. The contact and
-- photo ones are the safeguarding-relevant half.
--
-- ⚠️ LATENT, NOT LIVE — AND THAT IS THE ONLY REASON THIS IS NOT AN INCIDENT.
-- No path in the app creates a pending STAFF membership: `request_access`
-- creates pending PARENT rows, and `approve_membership` is what flips a row to
-- active. Measured 10 Aug 2026, every membership in the database is
-- status = 'active' (2 admin, 2 parent) and there has never been a pending
-- staff row. The hole was reachable only by inserting one by hand.
--
-- ⚠️ WHICH IS EXACTLY WHY IT IS WORTH CLOSING NOW RATHER THAN LATER. The
-- moment anything grants staff access through a pending state — an invite
-- flow, a self-service coach signup, an admin queue — this becomes live
-- without anybody editing a policy, and the change that introduces it will
-- look unrelated to access control.
--
-- SAFE: `memberships.status` is NOT NULL DEFAULT 'active' with a CHECK
-- constraint of ('pending','active'), so there is no third state and no null
-- to reason about. Every existing row is active, so no live permission
-- changes today.
--
-- ⚠️ AND ONE CONSEQUENCE WORTH RECORDING, because a previous note says the
-- opposite. `claude/state-of-play.md` warned that the merged `avail read`
-- policy's three arms — can_see_team OR can_edit_team OR is_own_player — only
-- LOOKED redundant, and that dropping the can_edit_team arm would silently
-- remove a pending coach's read. After this migration that is no longer true:
-- can_edit_team now implies active, so it is a strict subset of can_see_team
-- and the arm IS genuinely redundant. It is deliberately LEFT IN PLACE — a
-- redundant arm costs a boolean, and removing it is its own change with its
-- own harness. The note is what needed correcting, not the policy.

create or replace function private.can_edit_team(_team uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or (m.role in ('coach','manager','medic') and m.team_id = _team)));
$$;
