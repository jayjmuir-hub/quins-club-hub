-- 14 Aug 2026 — a roster email match no longer grants squad access by itself.
--
-- Jay, 14 Aug 2026, on being shown that this function was the one path that
-- opened an age group with no human involved: **nothing should get squad access
-- without an admin approving it.**
--
-- ══ ⚠️ THIS OVERTURNS A DELIBERATE RULING, AND THE OLD ONE IS WORTH KEEPING ══
--
-- `20260809_notify_pending_membership.sql` states the previous position
-- plainly, as the reason its trigger fires only on pending rows:
--
--     "claim_roster_access inserts ACTIVE rows (a roster email match IS the
--      verification) ... Neither is waiting for anybody, and emailing four
--      volunteers about work that does not exist is how a notification becomes
--      something people filter out."
--
-- That reasoning was sound when the club expected to IMPORT a roster: an email
-- already on a child's record had been put there by the club, so matching it
-- proved something. **Two things have changed since.**
--
-- 1. ⚠️ **THERE IS NO ROSTER IMPORT AND THERE WILL NOT BE** (ruling, 10 Aug —
--    `claude/decisions/2026-08-10-no-roster-import.md`). Every
--    `player_contacts.email` in the database was put there by whoever
--    registered that child, not by the club. So the match no longer proves the
--    club vouched for anybody — it proves two accounts share an address.
--
-- 2. ⚠️ **AND IT IS REACHABLE.** Several children carry their OWN email on
--    their contact record rather than the registering parent's, so when that
--    child later signs up they were being handed the entire squad — every other
--    child's name, photo and parent contact details — with no coach or admin
--    ever seeing it happen.
--
-- ══ WHAT CHANGES, AND WHAT DOES NOT ═══════════════════════════════════════
--
-- ⚠️ **THE MATCHING IS UNCHANGED.** Identifying WHICH child an account belongs
-- to is still automatic, still on a confirmed email, and still saves an admin
-- the detective work. What changes is that identifying somebody no longer
-- grants them anything. Those are two different jobs and this function was
-- doing both.
--
-- So a claimed row now lands exactly where a self-registered one does:
--   * `status = 'pending'` — `private.can_see_team` requires 'active', so the
--     squad stays hidden;
--   * their OWN child is visible (`player read` has an `is_own_player` arm) and
--     so are the squad's fixtures (`event read` is deliberately status-blind);
--   * it appears in the approval queue on the Accounts screen.
--
-- ✅ **AND ADMINS NOW GET TOLD, WHICH THEY DID NOT BEFORE.** The
-- `notify_pending_membership` trigger fires `when (new.status = 'pending')`, so
-- this insert previously slipped past it silently. It will now email the
-- squad's staff like any other registration. ⚠️ **That is a behaviour change
-- with a cost** — the trigger's own comment warns that emailing volunteers
-- about work that does not exist is how a notification gets filtered out. The
-- difference is that this work now DOES exist: somebody has to approve it.
--
-- ⚠️ **THE TRIGGER ITSELF IS NOT TOUCHED.** Its `when` clause is already right;
-- only the sentence explaining it has gone stale, and that is corrected in
-- db/schema/triggers.sql rather than by rewriting a historical migration.

create or replace function public.claim_roster_access()
returns setof memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships m where m.profile_id = auth.uid()) then
    return;
  end if;

  return query
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select auth.uid(),
         p.club_id,
         p.team_id,
         case when t.is_senior then 'player' else 'parent' end,
         p.id,
         -- ⚠️ 'pending', NOT 'active' — 14 Aug 2026. This single word is the
         -- whole migration. An email match identifies somebody; it does not
         -- vouch for them, and since the no-roster-import ruling there is
         -- nobody it could be vouching on behalf of.
         'pending'
  from public.player_contacts c
  join public.players p on p.id = c.player_id
  join public.teams   t on t.id = p.team_id
  where lower(btrim(c.email)) = lower(btrim(caller_email))
  on conflict do nothing
  returning *;
end;
$function$;

revoke execute on function public.claim_roster_access() from public;
revoke execute on function public.claim_roster_access() from anon;
grant execute on function public.claim_roster_access() to authenticated;

-- ══ WHAT IS NOT DONE HERE ═════════════════════════════════════════════════
--
-- ⚠️ NO EXISTING MEMBERSHIP IS DOWNGRADED. Anybody already active stays active.
-- Retroactively suspending real families over a rule that changed today would
-- be a worse failure than the one this fixes, and there is no way to tell which
-- active rows came from this function anyway — `memberships` records no
-- provenance.
--
-- ⚠️ NOTHING IS ADDED TO THE MATCHER. Widening it (a `player_parents.email` or
-- phone signal, or re-checking when a PLAYER is created rather than only when
-- the person signs in) was proposed on 14 Aug and is NOT built: it is the same
-- question as this one and Jay has answered only the granting half. Identifying
-- is safe to automate; granting is not. Do not add signals here without
-- checking that distinction still holds.
