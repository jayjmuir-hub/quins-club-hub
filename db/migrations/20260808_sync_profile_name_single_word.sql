-- Fix: private.sync_profile_name() mangles a single-word name.
--
-- Apply in the Supabase SQL editor / MCP as migration
-- `20260808xxxxxx sync_profile_name_single_word`.
--
-- ── THE BUG ──────────────────────────────────────────────────────────────
-- The function's own comment states the intent: "a single-word name is a
-- first name with no family name, not the reverse". The guard that was
-- supposed to implement it is DEAD CODE:
--
--   new.first_name := nullif(btrim(regexp_replace(full_in, '\s+\S+$', '')), '');
--   if new.first_name is null then ... end if;
--
-- For a one-word input there is no "whitespace + final word" to strip, so
-- regexp_replace returns the string UNCHANGED rather than empty. first_name
-- is therefore never null and the branch never fires. Meanwhile last_name's
-- expression, regexp_replace(full_in, '^.*\s', ''), also finds no match and
-- also returns the whole string.
--
--   input 'Ahmed'  ->  first_name = 'Ahmed'  AND  last_name = 'Ahmed'
--
-- ── WHY IT MATTERS NOW ───────────────────────────────────────────────────
-- ⚠️ This is NOT a rare edge case reachable only from the name gate.
-- claude/state-of-play.md said it "will fire the first time a parent types
-- one word into the name gate" and that was wrong: NamePrompt.jsx:96 calls
-- updateProfileNames({firstName, lastName}), which takes the FIRST/LAST
-- branch below, where no splitting happens.
--
-- The branch that DOES split is reached by private.handle_new_user(), which
-- on every new auth user inserts:
--     full_name = coalesce(new.raw_user_meta_data->>'full_name','')
-- i.e. the identity provider's display name. Any parent whose Google/OAuth
-- display name is a single word hits this on SIGNUP. With 146 parents still
-- to onboard, that is a live path, not a latent one.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────
-- Test the SPLIT, not the result. `position(' ' in full_in) = 0` is true
-- exactly when there is no space to split on, which is the actual condition
-- the dead guard was reaching for. Everything else is unchanged, including
-- the search_path = '' pin applied on 7 Aug
-- (20260807_sync_profile_name_search_path.sql) — that pin is preserved
-- verbatim below, because CREATE OR REPLACE without it would silently drop
-- it and re-open the advisor warning that migration closed.
--
-- Not idempotent-sensitive: CREATE OR REPLACE, safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function private.sync_profile_name()
 returns trigger
 language plpgsql
 set search_path to ''          -- pinned 7 Aug 2026; do not drop
as $function$
declare
  fn text := nullif(btrim(new.first_name), '');
  ln text := nullif(btrim(new.last_name), '');
  full_in text := nullif(btrim(new.full_name), '');
  names_changed boolean;
  full_changed boolean;
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
    new.full_name := btrim(concat_ws(' ', fn, ln));
    new.first_name := fn;
    new.last_name  := ln;
  elsif full_changed and full_in is not null then
    new.full_name  := full_in;

    -- ⚠️ THE FIX. Decide on the SPLIT before deriving either name. The old
    -- code derived both first, then tested `first_name is null` — which a
    -- one-word input can never satisfy, because stripping a non-existent
    -- final word leaves the string intact rather than empty.
    if position(' ' in full_in) = 0 then
      -- a single-word name is a first name with no family name, not the reverse
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

-- ── VERIFY (run these, do not assume) ────────────────────────────────────
-- A Postgres self-assignment does NOT fire a `distinct from` check, and a
-- migration that reported success while changing nothing has already
-- happened here once (6 Aug). READ THE ROWS BACK.
--
--   create temp table probe (like public.profiles including all);
--   create trigger probe_sync before insert or update on probe
--     for each row execute function private.sync_profile_name();
--   insert into probe (id, full_name) values (gen_random_uuid(), 'Ahmed');
--   insert into probe (id, full_name) values (gen_random_uuid(), 'Ahmed Khan');
--   insert into probe (id, full_name) values (gen_random_uuid(), 'Jan van der Berg');
--   select full_name, first_name, last_name from probe;
--
-- EXPECTED:
--   Ahmed            | Ahmed        | (null)
--   Ahmed Khan       | Ahmed        | Khan
--   Jan van der Berg | Jan van der  | Berg
--
-- Also confirm the pin survived the replace:
--   select proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'private' and p.proname = 'sync_profile_name';
--   -- expected: {"search_path="}
--
-- ⚠️ No backfill included, deliberately. Checked 7 Aug: all 5 existing
-- profiles have two-word names and 0 rows have first_name = last_name, so
-- there is nothing to repair. RE-CHECK before applying, and if any row now
-- has first_name = last_name, decide the repair separately — a blind
-- `update ... set last_name = null where first_name = last_name` would also
-- clobber a legitimately repeated name.
