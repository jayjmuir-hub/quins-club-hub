-- Replacing a child's parent/carer list must be all-or-nothing.
--
-- Apply as migration `20260818xxxxxx save_player_parents_atomically`.
--
-- ══ WHAT WAS WRONG, STATED ACCURATELY ═══════════════════════════════════
-- `claude/open-items.md` recorded this as "saveParents is delete-then-write,
-- so a failure between the two loses a child's parent records". That is the
-- right worry and the wrong sentence, and the difference decides what to fix.
--
-- src/data/parents.js issues up to N+2 separate PostgREST requests: one DELETE
-- of every row NOT in the submitted set, then one UPDATE per existing row,
-- then one INSERT for the new ones. PostgREST has no client-side transaction,
-- so each lands on its own. Walking the cases:
--
--   * a plain edit — every kept row carries an id, so the DELETE removes
--     nothing and a later failure loses nothing. THE COMMON CASE IS SAFE, and
--     an account that says otherwise will be disbelieved by the first person
--     who tests it.
--   * a row REMOVED in the same sitting — the DELETE applies, then an UPDATE
--     or the INSERT fails. The removal has happened, the edits have not, and
--     **the screen says the save failed.** The club's record is now a state
--     the user never asked for and has been told does not exist.
--   * several existing rows edited — the UPDATEs run in a loop, so a failure
--     on the third leaves the first two applied.
--
-- So the defect is not usually LOSS. It is a partial apply reported as a total
-- failure, and the record left behind is one nobody chose. On a table holding
-- how a club reaches a child's parents, that is worth closing properly.
--
-- ⚠️ THE ONE CASE THAT REALLY IS LOSS is a submitted set whose rows carry no
-- ids at all: the DELETE then removes every parent the child has, and a failed
-- INSERT leaves none. src/screens/PlayerForm.jsx already guards the way that
-- would happen by accident — a failed prefill read sets `parentsStatus` to
-- 'error' and the submit handler skips the parent write entirely, with a
-- comment saying why. **That guard is load-bearing and must stay** even now
-- that this function exists; it stops an EMPTY editor being saved over rows
-- that were never loaded, which is a correct-but-unwanted write rather than a
-- failed one, and no amount of atomicity helps with it.
--
-- ══ WHAT THIS DOES ══════════════════════════════════════════════════════
-- One function, one statement, one transaction. Delete, update and insert all
-- happen inside `public.save_player_parents`, so either the child's list ends
-- up exactly as submitted or it is untouched. There is no third outcome.
--
-- ⚠️ SECURITY INVOKER — NOT `SECURITY DEFINER`, AND THAT IS THE POINT.
-- Every other RPC in this schema is definer-rights with a hand-written guard
-- at the top, because it needs to do something the caller may not. This one
-- does exactly what the caller could already do, in a better order. Left as
-- invoker, the two existing policies on `public.player_parents` keep deciding
-- who may write, unchanged and untested-against-anew:
--
--     parent edit      ALL  private.can_edit_team((select p.team_id from
--                                players p where p.id = player_id))
--     parent edit own  ALL  private.is_own_player(player_id)
--
-- A definer version would have had to reimplement both, and a reimplementation
-- of an authorisation rule is a second copy of it. **This migration adds no
-- authorisation surface at all** — which is why it does not come with the
-- "every mutating function enforces its own authorisation" paperwork the
-- 15 Aug advisor walk records for the definer functions.
--
-- ⚠️ CONSEQUENCE WORTH KNOWING: RLS refuses a row the caller may not write by
-- filtering it, not by erroring. That is why the claimed-vs-updated count
-- below is a real check and not defensive noise — without it, an id belonging
-- to a player the caller cannot edit would simply update nothing and the call
-- would report success.
--
-- ══ WHAT IT DELIBERATELY DOES NOT TOUCH ═════════════════════════════════
-- `created_at`, `invited_at` and `profile_id` are never written on an UPDATE.
-- The first keeps a row's identity across an edit, and the other two are the
-- link to a parent's actual ACCOUNT — `invite_parent` sets them. An UPDATE
-- that named every column would silently un-invite a parent every time a coach
-- fixed a typo in their phone number. src/data/parents.js `toRow` already
-- names its columns for this reason; this function keeps that list identical.
--
-- ⚠️ BLANK ROWS ARE DROPPED HERE AS WELL AS IN THE CLIENT, on purpose. Adding
-- a parent and changing your mind is not an error, and the
-- `player_parents_name_not_blank` CHECK would otherwise abort the whole save
-- with a message about a constraint. The client filter stays because it also
-- decides what the FORM shows; this one makes the function correct on its own.

begin;

create or replace function public.save_player_parents(_player uuid, _rows jsonb)
 returns setof public.player_parents
 language plpgsql
 set search_path to 'public'
as $function$
declare
  kept    jsonb;
  claimed int;
  updated int;
begin
  if _player is null then
    raise exception 'save_player_parents needs a player id.' using errcode = '22004';
  end if;

  -- A row the user started and abandoned. Dropped before anything else, so it
  -- cannot delete a real row by being absent from the kept set later.
  select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb)
    into kept
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb))
         with ordinality as e(value, ordinality)
   where btrim(coalesce(e.value->>'full_name', '')) <> '';

  -- 1. Remove whatever this player has that the submitted set does not.
  --
  -- ⚠️ `not in` OVER AN EMPTY SUBQUERY IS TRUE, which is what makes "the user
  -- deleted every parent" work without a special case. It is also why the id
  -- list must never contain a NULL — a NULL would make the whole predicate
  -- UNKNOWN and delete nothing at all, silently.
  delete from public.player_parents pp
   where pp.player_id = _player
     and pp.id not in (
           select (r.value->>'id')::uuid
             from jsonb_array_elements(kept) as r(value)
            where nullif(btrim(coalesce(r.value->>'id', '')), '') is not null
         );

  select count(*)
    into claimed
    from jsonb_array_elements(kept) as r(value)
   where nullif(btrim(coalesce(r.value->>'id', '')), '') is not null;

  -- 2. Update the rows that already exist, keeping their identity.
  with incoming as (
    select (r.value->>'id')::uuid                                       as id,
           btrim(r.value->>'full_name')                                 as full_name,
           nullif(btrim(coalesce(r.value->>'first_name',   '')), '')    as first_name,
           nullif(btrim(coalesce(r.value->>'last_name',    '')), '')    as last_name,
           nullif(btrim(coalesce(r.value->>'relationship', '')), '')    as relationship,
           nullif(btrim(coalesce(r.value->>'email',        '')), '')    as email,
           nullif(btrim(coalesce(r.value->>'phone',        '')), '')    as phone,
           coalesce((r.value->>'is_primary')::boolean, false)           as is_primary,
           coalesce((r.value->>'sort_order')::int, (r.ordinality - 1)::int) as sort_order
      from jsonb_array_elements(kept) with ordinality as r(value, ordinality)
     where nullif(btrim(coalesce(r.value->>'id', '')), '') is not null
  )
  update public.player_parents pp
     set full_name    = i.full_name,
         first_name   = i.first_name,
         last_name    = i.last_name,
         relationship = i.relationship,
         email        = i.email,
         phone        = i.phone,
         is_primary   = i.is_primary,
         sort_order   = i.sort_order
    from incoming i
   where pp.id = i.id
     and pp.player_id = _player;

  get diagnostics updated = row_count;

  -- ⚠️ THE COUNT IS THE AUTHORISATION CHECK, and it replaces the client's
  -- `maybeSingle()`-returned-nothing test. An id that belongs to another
  -- player, or to a player this caller may not edit, updates zero rows and
  -- would otherwise pass as a success.
  if updated <> claimed then
    raise exception
      'That parent record does not belong to this player, or you may not edit it.'
      using errcode = '42501';
  end if;

  -- 3. Add the new ones.
  insert into public.player_parents
        (player_id, full_name, first_name, last_name, relationship, email, phone,
         is_primary, sort_order)
  select _player,
         btrim(r.value->>'full_name'),
         nullif(btrim(coalesce(r.value->>'first_name',   '')), ''),
         nullif(btrim(coalesce(r.value->>'last_name',    '')), ''),
         nullif(btrim(coalesce(r.value->>'relationship', '')), ''),
         nullif(btrim(coalesce(r.value->>'email',        '')), ''),
         nullif(btrim(coalesce(r.value->>'phone',        '')), ''),
         coalesce((r.value->>'is_primary')::boolean, false),
         coalesce((r.value->>'sort_order')::int, (r.ordinality - 1)::int)
    from jsonb_array_elements(kept) with ordinality as r(value, ordinality)
   where nullif(btrim(coalesce(r.value->>'id', '')), '') is null;

  return query
    select pp.*
      from public.player_parents pp
     where pp.player_id = _player
     order by pp.sort_order, pp.created_at;
end
$function$;

-- ⚠️ THE `anon` GRANT IS REVOKED EXPLICITLY, AND IT HAS TO BE SAID OUT LOUD.
-- Supabase ships `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated, service_role`, so a new function ARRIVES with an
-- explicit anon grant and `revoke all … from public` does not remove it — it
-- only clears the implicit PUBLIC entry. That asymmetry is the whole content
-- of the `register_my_player` item in claude/open-items.md: three comparable
-- RPCs carry the revoke, one does not, and the difference reads as a decision.
-- This one is tightened at creation so it never joins that list.
--
-- Being invoker-rights, an anon caller would gain nothing anyway — RLS
-- refuses. The revoke is about the ACLs telling the truth to whoever reads
-- them next.
revoke all on function public.save_player_parents(uuid, jsonb) from public;
revoke all on function public.save_player_parents(uuid, jsonb) from anon;
grant execute on function public.save_player_parents(uuid, jsonb) to authenticated;

commit;
