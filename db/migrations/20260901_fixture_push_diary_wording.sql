-- ══════════════════════════════════════════════════════════════════════════
--  A Club Diary entry must not be pushed as a "fixture"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Feature: claude/plans/2026-08-31-club-diary.md
-- Harness: db/tests/club-diary-push.sql (written FIRST and watched failing)
--
-- ⚠️ THE BUG, AND IT SHIPPED IN THE CLUB DIARY PHASE 1 MERGE. Adding an event
-- fires a squad push whose headline was the hard-coded literal 'New fixture'
-- (db/migrations/20260819_fixture_push.sql). A Club Diary entry — a kit
-- collection, a shop opening, a ball collection — is not a fixture, so every
-- parent in the squad would have been told a fixture had been added:
--
--     New fixture — U16
--     Kit collection · Thu 17 Sep, 17:00
--
-- ⚠️ NEITHER THE SPEC NOR THE IMPLEMENTATION PLAN CONSIDERED THE PUSH PATH AT
-- ALL. Both traced the READ paths exhaustively — chip, detail, schedule filter,
-- calendar feed — and neither asked what happens when the row is WRITTEN. Found
-- by checking, before creating a test entry on production, whether doing so
-- would notify real members. It would have.
--
-- ⚠️ THE PUSH IS NOT SUPPRESSED, DELIBERATELY. A kit collection is exactly the
-- sort of thing parents want told about; only the wording was wrong. Silencing
-- diary entries would trade a misleading notification for a missing one.
--
-- ⚠️ WHY A SEPARATE PURE FUNCTION RATHER THAN A CASE INSIDE send_fixture_push.
-- That function ends in net.http_post, so anything asserting its behaviour from
-- a harness would send a REAL push to REAL members — and a rollback does not
-- un-send a notification. Splitting the wording decision into an IMMUTABLE
-- helper makes it freely testable and leaves the sending path untouched.
--
-- ⚠️ RECLASSIFYING AN EXISTING SOCIAL SENDS NOTHING, AND THAT IS ALREADY
-- CORRECT. notify_fixture_changed fires only when starts_at, time_tbd, venue,
-- pitch, opponent, home or team_id change; info_only is deliberately not in
-- that list, so flipping the flag is silent. Nothing here changes that.

-- ── 1. The wording, as a pure function ─────────────────────────────────────
create or replace function private.fixture_push_headline(_kind text, _info_only boolean)
 returns text
 language sql
 immutable
as $function$
  select case when coalesce(_info_only, false) then
           case _kind
             when 'added'     then 'New in the club diary'
             when 'changed'   then 'Diary entry changed'
             when 'cancelled' then 'Diary entry cancelled'
           end
         else
           case _kind
             when 'added'     then 'New fixture'
             when 'changed'   then 'Fixture changed'
             when 'cancelled' then 'Fixture cancelled'
           end
         end;
$function$;

comment on function private.fixture_push_headline(text, boolean) is
  'Push headline for a fixture-category notification. A Club Diary entry (info_only) is not a fixture and must never be announced as one. Pure and immutable so it can be asserted without sending a real push.';

-- ⚠️ coalesce ON _info_only IS LOAD-BEARING. A null would make the CASE fall to
-- the else branch anyway, but stating it means the function cannot return null
-- for a null input — and a null headline would reach the push body as SQL null,
-- producing a notification with no title rather than a wrong one.

-- ── 2. The three triggers, replaced to call it ─────────────────────────────
--
-- Bodies are otherwise IDENTICAL to what is live (captured from
-- pg_get_functiondef before writing this, not from the original migration
-- file, in case anything had been changed since).

create or replace function private.notify_fixture_added()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare e public.events;
begin
  if (select count(*) from inserted) <> 1 then return null; end if;
  select * into e from inserted;
  if e.series_id is not null then return null; end if;
  perform private.send_fixture_push(
    e.club_id, e.team_id, auth.uid(),
    private.fixture_push_headline('added', e.info_only), e);
  return null;
end;
$function$;

create or replace function private.notify_fixture_changed()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare o public.events; n public.events;
begin
  if (select count(*) from updated_new) <> 1 then return null; end if;
  select * into n from updated_new;
  select * into o from updated_old;
  if o.starts_at is distinct from n.starts_at
     or o.time_tbd is distinct from n.time_tbd
     or o.venue    is distinct from n.venue
     or o.pitch    is distinct from n.pitch
     or o.opponent is distinct from n.opponent
     or o.home     is distinct from n.home
     or o.team_id  is distinct from n.team_id
  then
    perform private.send_fixture_push(
      n.club_id, n.team_id, auth.uid(),
      private.fixture_push_headline('changed', n.info_only), n);
  end if;
  return null;
end;
$function$;

create or replace function private.notify_fixture_cancelled()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare e public.events;
begin
  if (select count(*) from deleted) <> 1 then return null; end if;
  select * into e from deleted;
  perform private.send_fixture_push(
    e.club_id, e.team_id, auth.uid(),
    private.fixture_push_headline('cancelled', e.info_only), e);
  return null;
end;
$function$;

-- ── 3. Assert it landed, and that nothing is half-applied ─────────────────
--
-- ⚠️ THE SECOND CHECK IS THE ONE WORTH HAVING. A helper that exists while the
-- triggers still pass the literal is the exact shape of a half-applied version
-- of this migration, and every wording assertion would still pass.
do $$
declare fn text;
begin
  if private.fixture_push_headline('added', true) <> 'New in the club diary'
     or private.fixture_push_headline('added', false) <> 'New fixture' then
    raise exception 'fixture_push_headline did not land as specified';
  end if;

  foreach fn in array array['notify_fixture_added', 'notify_fixture_changed', 'notify_fixture_cancelled'] loop
    if pg_get_functiondef(('private.' || fn)::regproc) not like '%fixture_push_headline%' then
      raise exception 'private.% was not replaced — it still does not call the helper', fn;
    end if;
  end loop;
end $$;
