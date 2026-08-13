-- 13 Aug 2026 — a member can see who staffs their own squads.
--
-- Phase 3 of claude/plans/2026-08-13-squad-staff-on-home.md. Phase 1 (the admin
-- directory, /admin/staff) and phase 2 (memberships.title) shipped earlier the
-- same day; this is the member-facing half.
--
-- ══ ⚠️ WHY A FUNCTION AND NOT AN RLS POLICY ON `profiles` ══════════════════
--
-- The plan's own gap 2 asks for "a policy letting a member read the profile of
-- someone who holds a staff role on a squad they are attached to". That is the
-- WRONG MECHANISM and the plan header already corrects itself on it. Keeping
-- the reasoning here, where the code is:
--
--   **RLS authorises ROWS, not COLUMNS.** A `profiles` row carries `email` and
--   `phone`. A policy wide enough to draw a coach's NAME on a parent's home
--   screen is a policy wide enough to hand that parent every column of that
--   coach's profile row — whatever the card chooses to render. This repo's own
--   rule: *a screen that hides a row is not security.*
--
--   **And a column grant cannot rescue it.** Grants apply to the whole
--   `authenticated` role, which includes the admins who legitimately need
--   `email` and `phone` on the Accounts screen. Revoking them club-wide to
--   protect this one screen would break that one.
--
-- So the answer is a `SECURITY DEFINER` function with a FIXED column list. No
-- policy on `profiles` changes at all, and everything not named below is
-- structurally unreachable rather than merely unrendered.
--
-- ⚠️ `is_super` AND `admin_rights` ARE DELIBERATELY ABSENT. This function reads
-- `memberships`, which carries both. Neither is any of a parent's business, and
-- adding a column to the RETURNS TABLE below is the only way one could ever
-- appear — which is the property that makes this shape safe.
--
-- ══ ⚠️ CONTACT DETAILS ARE IN, AND THAT IS A RULING ════════════════════════
--
-- Jay, 13 Aug 2026: *"the staff automatically opts in when accepting the
-- position"*. The plan listed four privacy options and recommended an explicit
-- per-person opt-in toggle; **that recommendation was overruled and the reason
-- is consent-at-acceptance** — taking a coaching, manager or medic role on a
-- children's squad carries an expectation that the families of that squad can
-- reach you.
--
-- ⚠️ DO NOT "FIX" THIS BACK TO NAME-AND-TITLE-ONLY. It looks like an oversight
-- against the plan and it is a decision that overrides it. If it is ever
-- reopened, it is reopened with Jay and not by narrowing the column list here.
--
-- ══ ⚠️ THE GATE IS `can_see_team`, NOT `is_attached_to_team` ═══════════════
--
-- The two differ in exactly one way and it is the one that matters here:
-- **`can_see_team` requires `status = 'active'` and `is_attached_to_team` does
-- not.** `event read` deliberately uses the loose one, because
-- 20260808_membership_pending_status.sql ruled that "fixtures are not sensitive,
-- and a pending parent needs them to be worth signing in at all".
--
-- A volunteer's personal mobile number is not a fixture. A PENDING member is
-- somebody who has asked to join and whom nobody has yet approved, so they get
-- no staff card until they are — the same line `player read` and `avail read`
-- already draw for a child's own record.
--
-- ⚠️ SO A PENDING PARENT SEES AN EMPTY CARD, NOT A REFUSAL. That is correct and
-- it is why the client renders an empty state rather than an error.
--
-- ══ STAFF THEMSELVES MUST BE ACTIVE TOO ════════════════════════════════════
--
-- `m.status = 'active'` appears twice over: once inside `can_see_team` (about
-- the CALLER) and once in the body below (about the PERSON BEING LISTED). They
-- are different people and the check is not redundant. A pending coach has not
-- been approved by anyone, and publishing their phone number to thirty families
-- on the strength of a request they made themselves would be the exact hole
-- `20260809_squad_staff_approval.sql` was written to close.

create or replace function public.my_squad_staff()
returns table (
  team_id uuid,
  membership_id uuid,
  full_name text,
  title text,
  role text,
  email text,
  phone text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    m.team_id,
    m.id,
    p.full_name,
    m.title,
    m.role,
    p.email,
    p.phone
  from memberships m
  join profiles p on p.id = m.profile_id
  where m.role in ('coach', 'manager', 'medic')
    and m.status = 'active'
    and m.team_id is not null
    and private.can_see_team(m.team_id);
$function$;

-- ══ ⚠️ `revoke … from public` DOES NOT KEEP `anon` OUT. MEASURED. ══════════
--
-- The house pattern in this schema is `revoke execute … from public; grant
-- execute … to authenticated;` and it is repeated across nine migrations. It
-- reads like it shuts `anon` out. **It does not**, and this was measured live
-- on 13 Aug 2026 rather than reasoned about:
--
--     approve_membership       anon_can_execute  t
--     register_my_player       anon_can_execute  t
--     reset_my_calendar_token  anon_can_execute  t
--     set_admin_rights         anon_can_execute  t
--     set_own_player_photo     anon_can_execute  t
--     set_series_time_from     anon_can_execute  t
--     delete_my_account        anon_can_execute  f   <-- the only one
--
-- **Supabase ships `alter default privileges in schema public grant all on
-- functions to anon, authenticated, service_role`.** That is a grant to `anon`
-- BY NAME, and revoking from the `PUBLIC` pseudo-role does not touch it. So the
-- revoke above removes a grant that was never the one letting `anon` in.
--
-- Every one of those six is safe today only because it derives everything from
-- `auth.uid()`, which is null for `anon` — i.e. **safe by the function body, not
-- by the grant.** That is exactly the thing this repo's rules say not to rely
-- on, and `delete_my_account` is the one place somebody already noticed.
--
-- ⚠️ THE EXPLICIT `from anon` BELOW IS THEREFORE LOAD-BEARING, not belt-and-
-- braces. Without it an unauthenticated caller can invoke this function; it
-- would return zero rows, but the boundary would be the body rather than the
-- grant. Do not delete it to "match the house pattern" — the house pattern is
-- the thing that is wrong.
revoke execute on function public.my_squad_staff() from public;
revoke execute on function public.my_squad_staff() from anon;
grant execute on function public.my_squad_staff() to authenticated;

-- ══ WHAT IS NOT DONE HERE ═════════════════════════════════════════════════
--
-- ⚠️ NO POLICY CHANGE ANYWHERE, and no new grant on any TABLE. The four SELECT
-- policies on `profiles` are untouched. If a future session finds a member
-- reading a `profiles` row directly, that is a different bug and this function
-- is not where it came from.
--
-- ⚠️ NO INDEX. This reads staff memberships — bounded by the number of coaches,
-- managers and medics in the club, not by the number of members — and the club's
-- fully-staffed ceiling is fifteen squads times two or three people. The ruling
-- already recorded for the ~24 unindexed audit columns applies: an index would
-- cost write throughput to buy nothing.
--
-- ⚠️ NO PHOTO. `profiles` has no photo column and there is no staff bucket;
-- that is phase 4 of the plan and it is roughly half the work of the whole
-- feature. `players.photo_path` is head shots of CHILDREN and must not be
-- reached for here.
