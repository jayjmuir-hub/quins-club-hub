-- Drop the trailing " Contact" from squad names.
--
-- Jay, 16 Aug 2026: "we need to remove the word contact from age groups that
-- have it, its implied already". He is right that it is implied: every squad
-- from U9 up plays contact rugby, so the word distinguishes nothing. What it
-- DOES distinguish is Tag — U6/U7/U8 — and those names are untouched here, as
-- are the two QR squads.
--
-- ⚠️ THIS IS A DATA CHANGE, NOT A DISPLAY ONE, AND THAT WAS THE DECISION.
-- `teams.name` is the single source: information_schema shows no other text
-- column in `public` holding a team or squad name, and every screen renders this
-- one. Stripping it in the UI instead would have left the database saying
-- "U14B Contact" while every human saw "U14B" — a trap for whoever next reads a
-- row and does not know why it disagrees with the app.
--
-- ⚠️ THE CLASSIFIERS WERE PROVED UNCHANGED BEFORE THIS RAN, not reasoned about.
-- Every squad-name predicate in src/lib was run against all fifteen names before
-- and after the strip:
--   ageBandFromTeamName, allowsOwnContact, isMinisTeam, recordsScores,
--   squadFormat, scoringForTeam, matchSheetDeadline,
--   squadExpects, squadRequiresGender, squadMismatch
-- All identical. They read the LEADING "U" + digits for the band, and the letter
-- TOUCHING those digits for gender ("U14B" -> B) — never the words "Contact" or
-- "Tag". The only differences were the squad name embedded in user-facing
-- message text, which is the point of the change.
--
-- ⚠️ THE ANCHOR IS `\s+Contact$`, NOT `replace(name, 'Contact', '')`. A blanket
-- replace would also strip the word from a squad that acquired it mid-name, and
-- would silently do nothing visible if a name ever gained a suffix. Anchored to
-- the end, with the whitespace, so it can only do the one thing it says.
--
-- Reversing it, should that ever be wanted, is the inverse and is NOT provided
-- as a script on purpose: the names it would restore are listed above in full,
-- and a generated "add Contact back" would put it on the Tag squads too.

begin;

update public.teams
   set name = btrim(regexp_replace(name, '\s+Contact$', ''))
 where name ~ '\s+Contact$';

-- ⚠️ FAILS THE TRANSACTION IF THE COUNT IS WRONG. Ten squads carried the suffix
-- when this was written and measured. If a future run touches a different
-- number, the assumption behind it has changed and the right outcome is a
-- rollback rather than a quiet partial rename.
do $$
declare
  remaining int;
begin
  select count(*) into remaining from public.teams where name ~ '\s+Contact$';
  if remaining <> 0 then
    raise exception 'squad rename incomplete: % still carry a Contact suffix', remaining;
  end if;
end $$;

commit;
