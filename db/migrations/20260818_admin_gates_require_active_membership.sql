-- A PENDING admin membership must not confer admin powers.
--
-- Apply as migration `20260818xxxxxx admin_gates_require_active_membership`.
--
-- ══ WHAT THIS IS, AND WHY IT IS NOT NEWS ════════════════════════════════
-- The deferral recorded in 20260817_approve_requires_active_membership, taken.
-- That migration added `and m.status = 'active'` to private.can_approve_team
-- and said, in its own header, why private.is_admin was left alone:
--
--     * nothing can currently create a non-active admin row;
--     * is_admin backs most admin RLS policy in the schema, so adding a
--       condition to it changes the blast radius from one function to the
--       whole admin surface, on a live site with real families on it.
--
-- Both are still true. Jay asked for it anyway, 18 Aug 2026, having been shown
-- the blast radius measured rather than described. **The first reason is why
-- this is safe to apply today; it is not a reason to keep waiting.** The row
-- count that makes it unreachable is a fact about the club this morning, and
-- the fix wants to be in place BEFORE something makes a pending admin row
-- possible — which is precisely the order the 17 Aug bug did not happen in.
--
-- ══ IT IS FOUR FUNCTIONS, NOT ONE, AND THAT IS THE FINDING ══════════════
-- `is_admin` is one of FOUR spellings of "is the caller an admin", and not one
-- of them tested status. Measured 18 Aug 2026 against production by asking
-- every private/public function whose body mentions `memberships` whether it
-- also mentions `status`:
--
--     private.is_admin(uuid)              15 policies, 9 tables
--     private.is_admin_anywhere()          2 policies  (access_requests,
--                                                       photo_backup_runs)
--     private.shares_admin_club(uuid)      2 policies  (profiles)
--     private.can_admin_see_pending(uuid)  1 policy    (profiles)
--
-- Fixing only the first would have left a pending admin row conferring admin
-- reads of every member's PROFILE — name and e-mail — through the other three,
-- while the item in claude/open-items.md read as closed. That is the same
-- failure the 17 Aug bug was: **a new writer was added and the old readers were
-- not audited.** The audit is the reason this migration is four statements.
--
-- ⚠️ MEASURED BEFORE, INSIDE A ROLLED-BACK TRANSACTION ON PRODUCTION, with an
-- invented club so no live row took part. A pending admin, an active admin and
-- an ordinary parent, against all four functions:
--
--                            pending admin   active admin   plain parent
--     is_admin(club)              true           true           false
--     is_admin_anywhere()         true           true           false
--     shares_admin_club()         true           true           false
--     can_admin_see_pending()     true           true           false
--
-- The parent column is the control: without it, "true" would be what everybody
-- got and the first column would prove nothing. db/tests/admin-status-gate.sql
-- is that measurement, kept, and it injects the old body back to prove it can
-- still fail.
--
-- ══ WHAT IS DELIBERATELY NOT CHANGED ════════════════════════════════════
-- Three more functions omit the status test and are LEFT ALONE. They are not
-- oversights and they are not this migration's question:
--
--   * private.is_attached_to_team and private.is_own_player answer for PARENTS
--     and PLAYERS as well as staff, and a pending parent row is the ordinary
--     registration state — reachable today, unlike a pending admin. Whether a
--     parent awaiting approval should see their child's squad is a DESIGN
--     question with a real answer either way, not a hole. Changing it here
--     would alter what live families see mid-registration, under cover of a
--     security fix.
--   * private.may_set_staff_photo delegates its authorisation to is_admin and
--     can_edit_team, so the caller side is fixed by this migration. The
--     membership row it looks up is the TARGET's, and the target's status is a
--     different question.
--
-- ⚠️ AND THE TARGET SIDE OF THE TWO FUNCTIONS BELOW STAYS UNTESTED ON PURPOSE.
-- shares_admin_club and can_admin_see_pending both look at somebody ELSE's
-- rows, and an admin must be able to see a PENDING registrant — that is the
-- approval queue. Only `mine` gains the test. Adding it to `target` would hide
-- exactly the people the screen exists to show.

begin;

-- ── 1. private.is_admin(uuid) — 15 policies across 9 tables ───────────────

create or replace function private.is_admin(_club uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      -- ⚠️ THE LINE THIS MIGRATION EXISTS FOR, and the same line
      -- 20260817 added to can_approve_team. A request for admin is not admin.
      and m.status = 'active'
      and m.club_id = _club and m.role = 'admin');
$function$;


-- ── 2. private.is_admin_anywhere() — access_requests, photo_backup_runs ───
-- Club-blind on purpose; see db/schema/functions.sql for why. That is
-- unchanged here — this adds the status test and nothing else.

create or replace function private.is_admin_anywhere()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
       and m.role = 'admin'
  );
$function$;


-- ── 3. private.shares_admin_club(uuid) — profiles, 2 policies ────────────
-- `mine` gains the test. `target` deliberately does not: an admin reads a
-- pending registrant's profile, which is the approval queue working.

create or replace function private.shares_admin_club(_profile uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from memberships target
    join memberships mine on mine.club_id = target.club_id
    where target.profile_id = _profile
      and mine.profile_id = auth.uid()
      and mine.status = 'active'
      and mine.role = 'admin'
  );
$function$;


-- ── 4. private.can_admin_see_pending(uuid) — profiles, 1 policy ──────────
-- Same shape: `mine` gains the test, and the second clause — the target having
-- NO membership rows at all — is untouched.

create or replace function private.can_admin_see_pending(_profile uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
           select 1 from memberships mine
           where mine.profile_id = auth.uid()
             and mine.status = 'active'
             and mine.role = 'admin'
         )
     and not exists (
           select 1 from memberships m where m.profile_id = _profile
         );
$function$;

commit;
