-- 26 Aug 2026 — trim four tables' grant ceilings to what their migrations
-- actually granted.
--
-- The 25 Aug re-capture measured `authenticated` holding MORE than the
-- migrations said on four chat-era tables (claude/open-items.md, "Four
-- tables' grant ceilings"): notification_opt_outs carried UPDATE despite
-- the "complete vocabulary is SELECT/INSERT/DELETE" ruling;
-- conversation_members carried the full default 7 verbs where "SELECT
-- only" was the design; message_reactions and message_stars carried
-- UPDATE. Mechanism, same in all four: the migrations' REVOKE lines
-- targeted PUBLIC/anon and never trimmed authenticated's birth defaults
-- (Supabase's ALTER DEFAULT PRIVILEGES grants the works at CREATE TABLE).
--
-- Inert today — every one of these tables is owner-scoped by RLS and the
-- write paths hold through policies — but protection this repo relies on
-- must come from the GRANT, not only from the policy behind it: the same
-- reasoning as the 14 Aug anon revoke and the 19 Aug TRUNCATE revoke.
--
-- REVOKE ALL then re-grant, rather than revoking the named excess: it
-- also clears MAINTAIN/REFERENCES/TRIGGER (and keeps TRUNCATE gone), and
-- states the intended ceiling in the same breath so the file cannot be
-- half right.

begin;

revoke all on public.notification_opt_outs from authenticated;
grant select, insert, delete on public.notification_opt_outs to authenticated;

revoke all on public.conversation_members from authenticated;
grant select on public.conversation_members to authenticated;

revoke all on public.message_reactions from authenticated;
grant select, insert, delete on public.message_reactions to authenticated;

revoke all on public.message_stars from authenticated;
grant select, insert, delete on public.message_stars to authenticated;

commit;
