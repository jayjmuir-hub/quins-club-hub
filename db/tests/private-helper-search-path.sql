-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — private helper search_path
--  (20260830_pin_private_helper_search_path): the two helpers the security
--  advisor flagged carry a pinned search_path, and still answer correctly
--  with it in place. Run via `npm run db:check`. SAFE ON PRODUCTION: one
--  transaction, rolled back. Re-runnable. Touches no member data at all —
--  only pg_proc and two pure functions called on string literals.
-- ══════════════════════════════════════════════════════════════════════════

begin;

-- ── Control: the probe can see an unpinned function ────────────────────────
-- Rule 6: before trusting "no unpinned helpers", prove the query would catch
-- one. A throwaway function with no search_path must show up as unpinned.
create function private._harness_unpinned() returns int
language sql immutable as 'select 1';

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = '_harness_unpinned'
      and p.proconfig is not null
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
  ) then
    raise exception 'CONTROL FAILED: the throwaway function reads as pinned — the probe below proves nothing';
  end if;
  raise notice 'control passed: the probe can see an unpinned function';
end $$;

-- ── The two flagged helpers are pinned ─────────────────────────────────────
do $$
declare
  _unpinned text;
begin
  select string_agg(p.proname, ', ') into _unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('squad_expects_gender', 'chat_media_owner')
    and not (
      p.proconfig is not null
      and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    );
  if _unpinned is not null then
    raise exception 'FAILED: search_path not pinned on: %', _unpinned;
  end if;
  raise notice 'both flagged helpers carry a pinned search_path';
end $$;

-- ── And they still answer correctly with the pin in place ──────────────────
-- The pin would be a regression, not a hardening, if an empty search_path
-- broke resolution inside either body. Invented squad names only.
do $$
begin
  if private.squad_expects_gender('U12G Harness') is distinct from 'female' then
    raise exception 'FAILED: squad_expects_gender no longer classifies U12G as female';
  end if;
  if private.squad_expects_gender('Senior Men') is distinct from 'male' then
    raise exception 'FAILED: squad_expects_gender no longer classifies Senior Men as male';
  end if;
  if private.squad_expects_gender('Touch Mixed') is not null then
    raise exception 'FAILED: squad_expects_gender no longer returns null for a mixed squad';
  end if;
  if private.chat_media_owner('a3a3a3a3-0000-4000-8000-000000000001/x.webp')
       is distinct from 'a3a3a3a3-0000-4000-8000-000000000001'::uuid then
    raise exception 'FAILED: chat_media_owner no longer parses the owner from the key';
  end if;
  if private.chat_media_owner('') is not null then
    raise exception 'FAILED: chat_media_owner no longer returns null for an empty key';
  end if;
  raise notice 'both helpers answer correctly with the pin in place';
end $$;

rollback;
