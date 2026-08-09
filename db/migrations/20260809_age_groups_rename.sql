-- The club's real 2026/27 squad list (Jay, 9 Aug 2026).
--
-- Apply as migration `20260809xxxxxx age_groups_rename`.
--
-- ══ WHY A RENAME AND NOT A DELETE-AND-RECREATE ══════════════════════════
-- players.team_id, events.team_id and memberships.team_id all point at
-- teams.id. Dropping a row and inserting a replacement would either cascade
-- those away or orphan them. So every squad that has an equivalent in the new
-- list keeps its ID and only changes its NAME. Nothing that references a team
-- is touched, and U16 -> "U16B Contact" carries its 6 test players, 26 events
-- and the one parent membership across untouched.
--
-- ══ WHAT CHANGED IN THE NAMES, AND WHY IT MATTERED ══════════════════════
-- The new names carry a B/G suffix with no separator: "U12G QR", "U14B
-- Contact". src/lib/ageGroup.js parses the leading U-number to decide whether
-- a player may hold their OWN email and phone (Jay's rule, 3 Aug 2026: U13 and
-- above may, below U13 may not, and the fields must not render at all).
--
-- ⚠️ Its regex was /^u(\d{1,2})\b/i. `\b` requires a word boundary after the
-- digits; a letter is a word character, so "U12G" produced NO match, the band
-- came back null, and allowsOwnContact reads null as "a senior side: adults"
-- and returned TRUE. Applying this rename against the old regex would have
-- offered a twelve-year-old girls' squad the child's own contact fields.
--
-- Fixed in the same change as /^u(\d{1,2})(?![0-9])/i, with tests over all 18
-- real squad names, fault-injected (old regex restored -> 8 tests red, the
-- U12G one among them). Do not apply this migration to a checkout that does
-- not carry that fix.
--
-- ══ THE SENIOR SIDES ════════════════════════════════════════════════════
-- Jay's list contains no senior teams; asked directly, he confirmed all three
-- stay. They are renumbered to 16-18 and otherwise untouched — is_senior
-- drives the 'player' vs 'parent' role in claim_roster_access and
-- register_my_player, so nothing about them may drift here.

begin;

-- ── 1. Rename in place. Existing IDs, so every reference survives. ───────
update public.teams set name = 'U6 Tag',            sort_order = 1  where name = 'U6';
update public.teams set name = 'U7 Tag',            sort_order = 2  where name = 'U7';
update public.teams set name = 'U8 Tag',            sort_order = 3  where name = 'U8';
update public.teams set name = 'U9 Mixed Contact',  sort_order = 4  where name = 'U9';
update public.teams set name = 'U10 Mixed Contact', sort_order = 5  where name = 'U10';
update public.teams set name = 'U11 Mixed Contact', sort_order = 6  where name = 'U11';
update public.teams set name = 'U12 Mixed Contact', sort_order = 7  where name = 'U12';
update public.teams set name = 'U13 Mixed Contact', sort_order = 9  where name = 'U13';
update public.teams set name = 'U14B Contact',      sort_order = 10 where name = 'U14';
-- ⚠️ This one carries the entire test fixture: 6 players, 26 events, and the
-- one parent membership. db/tests/rls-pending-membership.sql selects the team
-- by the literal name 'U16' and is updated in the same commit.
update public.teams set name = 'U16B Contact',      sort_order = 12 where name = 'U16';
update public.teams set name = 'U18B Contact',      sort_order = 14 where name = 'U18 Colts';

-- Seniors keep their names; only their position in the list moves, so the
-- youth groups occupy an unbroken 1-15.
update public.teams set sort_order = 16 where name = 'Senior Men 1st XV';
update public.teams set sort_order = 17 where name = 'Senior Men 2nd XV';
update public.teams set sort_order = 18 where name = 'Women''s XV';

-- ── 2. The four squads that had no previous equivalent. ─────────────────
-- club_id is derived from an existing team, never typed. There is one club in
-- this database and hardcoding its UUID here would make the file unrunnable
-- against any rebuild (the AWS move is planned).
insert into public.teams (club_id, name, sort_order, is_senior)
select c.club_id, v.name, v.sort_order, false
from (select distinct club_id from public.teams) c,
     (values ('U12G QR', 8), ('U14G QR', 11), ('U16G Contact', 13), ('U18G Contact', 15))
       as v(name, sort_order)
where not exists (select 1 from public.teams t where t.name = v.name);

-- ── 3. THE GUARD. Not a comment asking someone to check — it RAISES, inside
-- the transaction, before commit. A migration on this project has already
-- reported success while changing nothing (6 Aug, a self-assignment that never
-- fired a `distinct from`), so the result is read back rather than assumed.
do $$
declare
  youth   int;
  seniors int;
  total   int;
  stale   int;
begin
  select count(*) into total from public.teams;
  select count(*) into youth from public.teams where is_senior = false;
  select count(*) into seniors from public.teams where is_senior = true;
  -- Any surviving old-style bare name means a rename above matched nothing.
  select count(*) into stale from public.teams
   where name ~ '^U[0-9]{1,2}$' or name = 'U18 Colts';

  if total <> 18 or youth <> 15 or seniors <> 3 then
    raise exception 'ABORTING: expected 18 teams (15 youth + 3 senior), got % (% youth, % senior).',
      total, youth, seniors;
  end if;
  if stale > 0 then
    raise exception 'ABORTING: % team(s) still carry an old bare name — a rename matched nothing.', stale;
  end if;
  raise notice 'guard passed: 15 youth + 3 senior, no stale names';
end $$;

commit;
