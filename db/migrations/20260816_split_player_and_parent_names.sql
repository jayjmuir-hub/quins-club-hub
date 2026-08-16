-- first_name / last_name on players and player_parents, kept in step with
-- full_name BOTH WAYS by a trigger — so nothing that reads full_name changes.
--
-- Jay, 16 Aug 2026: "children name and any other name should be two blocks
-- First Name and Last Name, this will stop people only putting a first name".
--
-- ⚠️ THE PROBLEM IS THE INPUT, NOT THE COLUMN. `players.full_name` is one column
-- behind one text box, and a single box gets a single word — which is how a
-- child reached the live roster with a first name and nothing else. Splitting
-- the column is what lets the FORM ask twice; the form is where the fix
-- actually happens.
--
-- ⚠️ WHY A TRIGGER RATHER THAN A COLUMN RENAME OR A GENERATED COLUMN. Around
-- thirty files read `players.full_name` — the roster, the lineup builder, match
-- sheets, the photo backup, the importer, PlayerDetail, the notice composer.
-- The `profiles` split of 6 Aug 2026 faced exactly this and solved it with
-- private.sync_profile_name: write either side and the trigger reconciles, so
-- every existing reader carries on untouched. This is that function, twice,
-- and deliberately not a re-invention of it.
--
-- ⚠️ full_name MUST NOT BECOME A GENERATED COLUMN. tables.sql already records
-- why for profiles: things write to it directly and would break on first save.
-- The same is true here — register_my_player writes full_name, the importer
-- writes full_name, and PlayerForm writes full_name.
--
-- ⚠️ THE SINGLE-WORD RULE IS COPIED DELIBERATELY, INCLUDING ITS BUG HISTORY.
-- 20260808 sync_profile_name_single_word fixed a case where a one-word name was
-- split into a LAST name with no first — the split has to be decided BEFORE
-- either side is derived. A one-word name is a FIRST name. Getting this
-- backwards is invisible until somebody sorts a roster.
--
-- ⚠️ NOTHING IS BACKFILLED BY AN UPDATE STATEMENT, AND THAT IS NOT LAZINESS.
-- The 6 Aug profiles backfill ran `update profiles set full_name = full_name`
-- and did NOTHING, because the trigger guards on `is distinct from` and a value
-- is never distinct from itself. It reported success. The backfill below writes
-- the split columns DIRECTLY instead, computed in SQL, so there is no trigger
-- and no self-assignment involved — and the verification at the end reads the
-- rows back rather than trusting the row count.

begin;

alter table public.players
  add column if not exists first_name text,
  add column if not exists last_name  text;

alter table public.player_parents
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- ── the reconciler ─────────────────────────────────────────────────────────
-- ONE function for BOTH tables. `new` is a record either way and only the three
-- name columns are touched, so the same body is correct for each — and a second
-- copy is a second thing to drift.
--
-- ⚠️ search_path TO '' matches sync_profile_name, which was pinned that way by
-- 20260807 sync_profile_name_pin_search_path. Everything it touches is on the
-- NEW record, so it needs no schema at all.
create or replace function private.sync_person_name()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  fn      text := nullif(btrim(new.first_name), '');
  ln      text := nullif(btrim(new.last_name), '');
  full_in text := nullif(btrim(new.full_name), '');
  names_changed boolean;
  full_changed  boolean;
begin
  if tg_op = 'INSERT' then
    names_changed := (fn is not null or ln is not null);
    full_changed  := (full_in is not null);
  else
    names_changed := (new.first_name is distinct from old.first_name)
                  or (new.last_name  is distinct from old.last_name);
    full_changed  := (new.full_name  is distinct from old.full_name);
  end if;

  -- first/last win when both changed in one statement: they are the explicit
  -- input, full_name is the derived display value.
  if names_changed and (fn is not null or ln is not null) then
    new.full_name  := btrim(concat_ws(' ', fn, ln));
    new.first_name := fn;
    new.last_name  := ln;
  elsif full_changed and full_in is not null then
    new.full_name := full_in;

    -- Decide the split BEFORE deriving either name. A single word is a FIRST
    -- name with no family name, never the other way round.
    if position(' ' in full_in) = 0 then
      new.first_name := full_in;
      new.last_name  := null;
    else
      new.first_name := nullif(btrim(regexp_replace(full_in, '\s+\S+$', '')), '');
      new.last_name  := nullif(btrim(regexp_replace(full_in, '^.*\s', '')), '');
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists players_sync_name on public.players;
create trigger players_sync_name
  before insert or update on public.players
  for each row execute function private.sync_person_name();

drop trigger if exists player_parents_sync_name on public.player_parents;
create trigger player_parents_sync_name
  before insert or update on public.player_parents
  for each row execute function private.sync_person_name();

-- ── backfill, written directly rather than through the trigger ─────────────
update public.players
   set first_name = case when position(' ' in btrim(full_name)) = 0
                         then nullif(btrim(full_name), '')
                         else nullif(btrim(regexp_replace(btrim(full_name), '\s+\S+$', '')), '') end,
       last_name  = case when position(' ' in btrim(full_name)) = 0
                         then null
                         else nullif(btrim(regexp_replace(btrim(full_name), '^.*\s', '')), '') end
 where nullif(btrim(full_name), '') is not null
   and first_name is null;

update public.player_parents
   set first_name = case when position(' ' in btrim(full_name)) = 0
                         then nullif(btrim(full_name), '')
                         else nullif(btrim(regexp_replace(btrim(full_name), '\s+\S+$', '')), '') end,
       last_name  = case when position(' ' in btrim(full_name)) = 0
                         then null
                         else nullif(btrim(regexp_replace(btrim(full_name), '^.*\s', '')), '') end
 where nullif(btrim(full_name), '') is not null
   and first_name is null;

-- ⚠️ ABORT IF THE BACKFILL DID NOT ACTUALLY LAND. The 6 Aug lesson: a migration
-- that reports success and changes nothing is the expensive failure, because
-- everything downstream then reasons about columns that are silently null.
do $$
declare
  bad_players int;
  bad_parents int;
begin
  select count(*) into bad_players from public.players
   where nullif(btrim(full_name), '') is not null and first_name is null;
  select count(*) into bad_parents from public.player_parents
   where nullif(btrim(full_name), '') is not null and first_name is null;

  if bad_players > 0 or bad_parents > 0 then
    raise exception 'backfill did not land: % players and % parents still have a full_name and no first_name',
      bad_players, bad_parents;
  end if;
end $$;

-- ⚠️ NO COLUMN GRANTS NEEDED, and this is worth stating because the two
-- migrations before it needed them. `authenticated` holds table-level UPDATE on
-- neither of these tables through a column carve-out — writes go through RLS
-- policies (`player edit`, `parent edit own`, `parent edit`) and the
-- register_my_player function, all of which act on whole rows. The profiles
-- carve-out exists because table-level UPDATE was revoked there specifically.
-- Verified against information_schema.column_privileges before writing this.

commit;
