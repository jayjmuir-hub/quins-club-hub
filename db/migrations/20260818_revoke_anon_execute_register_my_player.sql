-- `register_my_player` does not need `anon` EXECUTE, and the grant existing
-- was never a decision.
--
-- Apply as migration `20260818xxxxxx revoke_anon_execute_register_my_player`.
--
-- ══ WHY THIS WAS OPEN, AND WHY IT LOOKED SETTLED WHEN IT WASN'T ═══════════
-- `claude/open-items.md` recorded, 16 Aug 2026: "public.register_my_player is
-- executable by anon, and it looks deliberate when it is not." The measurement
-- behind it — three comparable RPCs carry an explicit `revoke ... from anon`,
-- this one does not — was correct, but the item was left alone on 16 Aug
-- because tidying a live registration path felt like the wrong moment.
--
-- ⚠️ AND A SEPARATE FILE HAD ALREADY REACHED THE OPPOSITE CONCLUSION, IN THE
-- SAME LANGUAGE THE FIRST ONE WARNS ABOUT. `db/tests/grants.sql` §3b, written
-- 13 Aug — three days earlier — names `register_my_player` as one of two
-- "DELIBERATE" `anon` grants that "MUST NOT BE TIDIED", citing the two
-- migrations that re-granted it explicitly (20260809_register_my_player_gender,
-- 20260811_self_registration) as evidence of a decision.
--
-- Reading those two migrations settles it: both re-grants are the DROP/CREATE
-- side-effect this repo's own rules describe elsewhere — `DROP FUNCTION` does
-- not carry a signature's old ACLs to the new one, so each migration restates
-- the prior proacl to avoid an outage, and each SAYS SO IN ITS OWN COMMENT
-- ("On 8 Aug a revoke with no matching grant broke every events query in
-- production for about a minute"). Neither migration gives a reason `anon`
-- itself needs to call this function. **An explicit grant in a migration is
-- evidence someone typed it, not evidence someone decided it should be there**
-- — the exact distinction claude/open-items.md drew about this same function
-- and grants.sql's 13 Aug author did not.
--
-- ══ AND THE GRANT WAS FUNCTIONALLY INERT ═══════════════════════════════════
-- register_my_player's first statement is:
--
--     if auth.uid() is null then
--       raise exception 'You must be signed in.' using errcode = '42501';
--     end if;
--
-- A PostgREST request only executes as the `anon` DATABASE ROLE when it
-- carries no valid session — the publishable key alone, or an expired/absent
-- JWT. A signed-in user's calls run as `authenticated`, whatever this grant
-- says. So the only caller who could ever reach this function AS anon is one
-- `auth.uid()` will find null, and the very first line refuses them. The grant
-- did not let anything through; it only let an anonymous caller be refused one
-- line later than the door.
--
-- ⚠️ MEASURED 15 Aug 2026, IN THE SUPABASE SECURITY ADVISOR WALK, ALREADY:
-- `public.register_my_player` via REST with the anon key returned
-- **42501 "You must be signed in."** — the guard firing, not the grant working.
-- That measurement was on record for three days before this migration used it.
--
-- ══ WHAT STAYS, AND WHY IT IS NOT THE SAME QUESTION ═══════════════════════
-- `calendar_events_for_token` keeps its `anon` grant. It is called by
-- `supabase/functions/calendar` with the publishable key ON BEHALF OF Google
-- and Apple's calendar clients, which carry no session and never will — unlike
-- register_my_player, there is no signed-in path that makes the anon grant
-- redundant. `netlify.toml` records that a subscribed calendar URL cannot be
-- repaired remotely, so revoking that one would break every subscription in
-- the club with no way to warn anyone. db/tests/grants.sql §3b still refuses
-- to let that grant be removed, on purpose.
--
-- Harness: db/tests/grants.sql §3b, updated in the same commit to expect this
-- grant GONE rather than present — a check that still demanded the old grant
-- would go red the moment this migration ran.

begin;

revoke execute on function public.register_my_player(
  text, uuid, text, boolean, boolean, boolean
) from anon;

commit;
