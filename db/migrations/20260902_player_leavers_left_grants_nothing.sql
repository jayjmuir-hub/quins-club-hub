-- ══════════════════════════════════════════════════════════════════════════
--  private.is_own_player / private.is_attached_to_team: a 'left' membership
--  now satisfies neither predicate
-- ══════════════════════════════════════════════════════════════════════════
--
-- Harness: db/tests/player-leavers.sql, steps 12-14 (12a-c)
-- Follows: db/migrations/20260902_player_leavers.sql (Task 1 — the 'left'
--          status itself, mark_player_left/restore_player)
--
-- WHAT IT IS FOR. Task 1's migration header claimed "every predicate in this
-- schema tests status = 'active' … so a 'left' row grants exactly nothing".
-- That claim was checked live, once, on 2 Sep 2026, and it was wrong for two
-- predicates: neither tests status at all.
--
--   private.is_own_player(_player)        -- guards: player read,
--                                          --   player_contacts, player_parents,
--                                          --   player_private, availability,
--                                          --   attendance, the player-photo
--                                          --   storage policy
--   private.is_attached_to_team(_team)     -- guards: event read, training
--                                          --   session reads
--
-- Every OTHER membership predicate in the schema already requires
-- status = 'active' (db/schema/functions.sql, db/schema/policies.sql). These
-- two are — were — the exceptions, and a 'left' row satisfied both exactly
-- as well as an 'active' one: a family whose only link to a squad is a
-- membership marked 'left' could still read the roster, the fixture list,
-- and their former child's contact and availability rows.
--
-- ⚠️ THE ADDED CONDITION IS `<> 'left'`, NOT `= 'active'`. A PENDING parent
-- must keep seeing exactly what they see today. db/schema/policies.sql's
-- "player read" comment (~L688) is explicit about why is_own_player exists
-- at all: can_see_team requires status='active' and would leave a pending
-- parent seeing nothing, "including the player they had just registered,
-- which reads as the app having lost them" — is_own_player is what restores
-- that one row. Testing `= 'active'` here would silently re-break that,
-- three weeks after it was fixed. `<> 'left'` passes 'pending' and 'active'
-- alike and excludes only the one status this migration is about.
--
-- REVERSIBLE: the OLD bodies, captured live via pg_get_functiondef on
-- 2 Sep 2026, before this migration:
--
--   CREATE OR REPLACE FUNCTION private.is_own_player(_player uuid) RETURNS boolean
--    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
--     select exists (select 1 from memberships m
--       where m.profile_id = auth.uid() and m.player_id = _player
--         and m.role in ('parent','player'));
--   $function$
--
--   CREATE OR REPLACE FUNCTION private.is_attached_to_team(_team uuid) RETURNS boolean
--    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
--     select exists (select 1 from memberships m
--       where m.profile_id = auth.uid()
--         and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
--              or m.team_id = _team));
--   $function$
--
-- Grants are untouched — the live definitions carried none beyond what
-- db/schema/functions.sql already records (authenticated + anon, anon inert
-- for lack of USAGE on `private`; is_attached_to_team additionally revokes
-- from PUBLIC), so this migration does not repeat them.

create or replace function private.is_own_player(_player uuid) returns boolean
 language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid() and m.player_id = _player
      and m.role in ('parent','player')
      and m.status <> 'left');
$function$;

create or replace function private.is_attached_to_team(_team uuid) returns boolean
 language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status <> 'left'
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or m.team_id = _team));
$function$;
