-- ✅ APPLIED. Written 8 Aug 2026, applied the same day as `20260808164111`.
--
-- ⚠️ THIS HEADER SAID "NOT APPLIED. WAITING ON JAY" UNTIL 9 Aug 2026, and it
-- was a lie to the next reader for a day. The policy is live and matches this
-- file; the re-capture in `db/schema/policies.sql` confirmed it against
-- `pg_policies`. Corrected rather than deleted, because a status line that
-- rotted is worth seeing: this directory's headers are written at the moment of
-- writing and nothing updates them when the migration lands.
--
-- ⚠️ AND ONE STATEMENT IN THIS FILE DID NOT LAND: the `comment on policy
-- "team read"` at the end. `obj_description` is null for every policy in the
-- database, so what ran was not byte-identical to what is committed here.
-- No security difference — a comment is documentation — but it means this file
-- and the live database are not the same text.
--
-- The original header follows, kept because the reasoning in it is still good:
--
-- Every other file in this directory records something that IS in the live
-- database. This one did not, when it was written. Nothing in the app depends on it having been
-- run, and the "add your player" screen degrades honestly without it — but
-- that degraded state is the screen refusing to work, so this is a blocker,
-- not a nicety.
--
-- ══ THE PROBLEM ═════════════════════════════════════════════════════════
-- Parent self-registration (claude/decisions/2026-08-08-parent-self-registration.md)
-- asks a signed-in person with NO access to pick their child's age group.
-- The spec lists `teams` under "unchanged and correct as-is", reasoning that
-- team names are not sensitive and a pending parent needs to see them.
--
-- The first half is right. The second half misses WHO is doing the picking.
-- The `team read` policy, read from the live database on 8 Aug 2026 (not from
-- the schema capture, which is from the 7th) is:
--
--   EXISTS (SELECT 1 FROM memberships m
--            WHERE m.profile_id = auth.uid() AND m.club_id = teams.club_id)
--
-- A PENDING parent satisfies that — they hold a membership row, whatever its
-- status. But the person filling in the registration form does NOT: they have
-- zero memberships, because the row they are about to create is the first one
-- they will ever have. So `select * from teams` returns zero rows for exactly
-- the user the age-group dropdown exists for, and the dropdown is empty.
--
-- This is the same fact RequestAccess.jsx has recorded in its header comment
-- since 4 Aug — "this user reads zero rows from every table including teams.
-- That is also why the note below is free text rather than a squad picker" —
-- seen from the other side. It did not change; the new screen just walked into
-- it.
--
-- ══ WHY WIDENING THE POLICY, RATHER THAN AN RPC ═════════════════════════
-- The alternative is a SECURITY DEFINER `list_teams_for_registration()`
-- returning id and name only. It was considered and is worse here:
--
--   * it adds a second, differently-shaped way to read teams, so every future
--     change to what a team row contains has two places to land;
--   * the app would then hold teams from two sources depending on who is
--     signed in, and the membership provider is where teams are loaded for
--     everything else — a screen-specific fetch would be the only exception;
--   * it protects nothing. `teams` is (id, club_id, name, sort_order,
--     is_senior). "U13", "U16", "Colts" is the club's fixture list, printed on
--     the website. There is no secret here to be definer-protected FROM.
--
-- What this DOES widen: any signed-in account — and anyone can create one —
-- can list the club's age-group names. That is the whole exposure, it is
-- already public information, and it is the exposure the spec assumed was
-- already accepted.
--
-- ⚠️ `anon` is NOT granted anything here. The policy still requires
-- auth.uid() to be non-null, so a signed-OUT visitor reads nothing. Dropping
-- that check to make the form work before sign-in would turn this into a
-- genuinely public endpoint, and the registration RPC refuses an anonymous
-- caller anyway, so it would buy nothing.

begin;

drop policy if exists "team read" on public.teams;

create policy "team read" on public.teams
  for select using (auth.uid() is not null);

comment on policy "team read" on public.teams is
  'Any signed-in account may read team names. Widened 8 Aug 2026 from '
  '"has a membership in this club" so that a person with NO access can pick '
  'an age group when self-registering their player — the previous policy '
  'returned zero rows for exactly that user. Team names are not sensitive; '
  'everything that exposes PEOPLE is gated on can_see_team, which is '
  'unchanged and still requires status = ''active''.';

commit;

-- ── VERIFY (run these; do not assume) ────────────────────────────────────
-- In a transaction that ROLLS BACK, as `set local role authenticated` with a
-- jwt claim for a user holding NO memberships:
--   * select count(*) from public.teams   -> the real team count, was 0
--   * select count(*) from public.players -> still 0
--   * select count(*) from public.events  -> still 0
-- and as `anon` (no sub claim):
--   * select count(*) from public.teams   -> 0
