-- 30 Aug 2026 — the duplicate-registration guard is now ACCENT-BLIND.
--
-- ══ ⚠️ WHAT ACTUALLY HAPPENED, MEASURED ON THE LIVE ROSTER ════════════════
--
-- Reported by a parent via WhatsApp, 30 Aug 2026: both parents of one U10
-- child registered separately and the roster showed the child twice. The
-- 20260814 duplicate guard — built for exactly this — stayed silent.
--
-- ⚠️ THE NAMES BELOW ARE INVENTED — this repo is public, and a worked example
-- never needs a real one. The spellings reproduce the real case exactly, which
-- is the only thing the example was ever for.
--
--   'Bianca Concalves'  registered by one parent
--   'Bianca Conçalves'  registered by the other — a cedilla apart
--
-- Measured against private.name_match_key on the live rows before writing this
-- migration: the keys came back 'bianca concalves' vs 'bianca conçalves'. The
-- 20260814 key is case-folded and punctuation-blind, but `ç` IS alphanumeric
-- ([[:alnum:]] keeps it — deliberately, so non-Latin names survive), so the
-- two keys differ by the one character and the guard never fired.
--
-- ══ THE FIX: FOLD DIACRITICS WITH unaccent ════════════════════════════════
--
-- `extensions.unaccent` strips Latin/Greek/Cyrillic diacritics and LEAVES
-- OTHER SCRIPTS ALONE. Measured on live before writing this down (rule 8's
-- spirit — measure, don't assume):
--
--   'Bianca Conçalves' -> 'Bianca Concalves'  (the failure case's shape, folded)
--   'José García'      -> 'Jose Garcia'
--   'يوسف'              -> 'يوسف'               (untouched)
--   'Müller-Ødegaard'  -> 'Muller-Odegaard'
--
-- ⚠️ THIS CHANGES THE 20260814 COMMENT'S 'José' EXAMPLE ON PURPOSE. That file
-- prized 'josé' NOT collapsing to 'jose'; this migration decides the opposite:
-- 'José' and 'Jose' in one squad are overwhelmingly the same child typed by two
-- different parents, which is precisely the mistake the guard exists to catch.
-- A genuine second child who really shares the folded name goes through the
-- p_confirm_duplicate tick, same as any other same-name pair — the guard is a
-- speed bump with an override, not a wall, which is what makes widening it safe.
--
-- ⚠️ THE EXPLICIT-DICTIONARY FORM, NOT BARE unaccent(_text). The bare form
-- resolves its dictionary through search_path, which name_match_key pins to ''
-- (empty) — it would throw at runtime. `extensions.unaccent('extensions.unaccent',
-- _name)` names both the function and the dictionary in full, and works under
-- an empty search_path.
--
-- ⚠️ name_match_key STAYS DECLARED IMMUTABLE while unaccent is formally STABLE
-- (its dictionary is in principle editable). Accepted: the dictionary never
-- changes here, the function backs no index (verified — its only callers are
-- the three registration guards, all run-time checks), and keeping the
-- declaration avoids churning every dependent capture.
--
-- ⚠️ ONE FUNCTION, THREE GUARDS FIXED AT ONCE. register_my_player's duplicate
-- and self-name guards (20260814) and the pre-signup duplicate check
-- (20260825_signup_before_confirm) all call private.name_match_key, so folding
-- here covers every path without touching any of them.
--
-- ⚠️ IT DOES NOT CLEAN UP THE TWO ROWS ALREADY ON THE ROSTER. They are real
-- rows attached to real accounts, and merging a child's records is a decision
-- for the club, not a side effect of a migration.

create extension if not exists unaccent with schema extensions;

create or replace function private.name_match_key(_name text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
           when parts is null or cardinality(parts) = 0 then null
           when parts[1] = '' then null
           when cardinality(parts) = 1 then parts[1]
           else parts[1] || ' ' || parts[cardinality(parts)]
         end
  from (
    select nullif(
             regexp_split_to_array(
               btrim(regexp_replace(
                 lower(extensions.unaccent('extensions.unaccent', coalesce(_name, ''))),
                 '[^[:alnum:]]+', ' ', 'g')),
               ' '
             ),
             array[]::text[]
           ) as parts
  ) t;
$function$;

-- create or replace keeps the existing grants (20260814: authenticated only),
-- but restate them so this file stands alone if ever replayed.
revoke execute on function private.name_match_key(text) from public;
revoke execute on function private.name_match_key(text) from anon;
grant execute on function private.name_match_key(text) to authenticated;
