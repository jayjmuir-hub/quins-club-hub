-- 2 Sep 2026 — a member may read the NAME of anyone whose post they can read.
--
-- ══ THE BUG ═══════════════════════════════════════════════════════════════
-- Jay, 2 Sep 2026, a screenshot from a team manager in the club-wide managers
-- channel: every author reads "Someone", including the admin's welcome. The
-- member list in the header showed names; the messages did not.
--
-- Measured on production, as a real non-admin manager and then as a real
-- parent, inside a rolled-back transaction: each could read exactly ONE
-- profiles row — their own. profiles has had four SELECT policies since the
-- admin rework (own, club admin, pending-for-admin, pending-for-squad-staff)
-- and NOT ONE lets an ordinary member read another member's row. So the
-- `author:profiles!messages_author_id_fkey(full_name)` embed comes back null
-- for every post not their own, and src/components/MessageRow.jsx prints its
-- fallback. The manager saw 9 of 10 posts as "Someone"; the parent saw the
-- coach's squad post the same way. ⚠️ THIS IS AS OLD AS CHAT (23 Aug 2026),
-- not as old as the role channels. Nobody reported it because coaches and
-- admins, who use chat most, pass the admin policy or share a squad view that
-- goes through definer RPCs; a parent reading a coach's post never had a
-- path. The same null lands on the announcement author embed and on the
-- officers card for a parent.
--
-- ══ THE RULE ══════════════════════════════════════════════════════════════
-- You may read a profile's name if you can already read something that
-- person wrote to you: a message, a notice, a poll vote, or their club
-- officer row. Evaluated under YOUR OWN row policies — the function is
-- SECURITY INVOKER on purpose — so "a post you can read" means exactly what
-- the messages and announcements policies already decide, and nothing here
-- widens them. A feed is not a directory: a parent still cannot list the
-- club (the Privacy screen's "who can see what" promise), because a profile
-- only becomes readable through a post that was addressed to them.
--
-- ⚠️ NOT SECURITY DEFINER, AND THE DIFFERENCE IS THE WHOLE POLICY. Definer
-- would bypass the messages policies and make readable every adult who has
-- ever posted anywhere — most of the club's adults, by uuid, to any parent
-- with a REST client. Invoker keeps the messages policies in the loop.
--
-- ⚠️ NO RECURSION: the SELECT policies on messages, announcements,
-- poll_votes and club_officers reference memberships and private helpers,
-- never profiles (checked in pg_policies before writing this).
--
-- ⚠️ COLUMNS: authenticated's column grants on profiles are names, photo
-- fields and a few flags (20260828_profiles_contact_revoke.sql); email and
-- phone are not among them, so this policy cannot disclose contact details.
--
-- ⚠️ TWO INDEXES ADDED so the per-author EXISTS is a lookup, not a scan:
-- messages(author_id) already had one; announcements(author_id) and
-- poll_votes(voter_id) did not.

begin;

create index if not exists announcements_author_idx on public.announcements (author_id);
create index if not exists poll_votes_voter_idx on public.poll_votes (voter_id);

create or replace function private.can_read_profile_name(_profile uuid)
 returns boolean
 language sql
 stable
 security invoker
 set search_path to 'public'
as $function$
  select
    _profile = (select auth.uid())
    or exists (select 1 from messages m where m.author_id = _profile)
    or exists (select 1 from announcements a where a.author_id = _profile)
    or exists (select 1 from poll_votes v where v.voter_id = _profile)
    or exists (select 1 from club_officers o where o.profile_id = _profile);
$function$;

-- Callable by members: it is a policy predicate and carries no rights of its
-- own (invoker), so granting execute discloses nothing.
revoke all on function private.can_read_profile_name(uuid) from public, anon;
grant execute on function private.can_read_profile_name(uuid) to authenticated, service_role;

drop policy if exists "profile read named author" on public.profiles;
create policy "profile read named author" on public.profiles
  for select
  using (private.can_read_profile_name(id));

commit;

-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--   npm run db:check -- profile-names
-- Then the real thing: a parent opens their squad chat and the coach's name
-- is beside the post; the manager in the screenshot opens the managers
-- channel and sees who wrote what. Nobody's Accounts list grows.
