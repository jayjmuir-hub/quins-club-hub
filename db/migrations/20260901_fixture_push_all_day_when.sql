-- ══════════════════════════════════════════════════════════════════════════
--  The push when-line must not invent a time for an all-day event
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/plans/2026-08-31-club-diary.md ([PHASE 2])
-- Plan:    claude/plans/2026-09-01-club-diary-phase-2-implementation.md
-- Harness: db/tests/club-diary-push.sql steps 5-9 (extended FIRST, watched failing)
--
-- ⚠️ FOUND BEFORE IT WAS WRITTEN, by asking what the WRITE path does with a new
-- column rather than only where it is displayed. That question is the one this
-- session got wrong in phase 1 — which shipped a push announcing a kit
-- collection as a "New fixture" — so it was asked first this time, before any
-- of the all-day feature existed.
--
-- THE BUG IT PREVENTS. send_fixture_push built its when-line as
--     'Dy DD Mon' || case when time_tbd then ', time TBC'
--                         else ', ' || 'HH24:MI' end
-- with the else branch unconditional. An all-day event is stored at
-- club-midnight, so the push would have read "Thu 17 Sep, 00:00" — an INVENTED
-- time, which is precisely what the time_tbd branch was written to avoid. Same
-- class of error, in the same function, one column later.
--
-- ⚠️ SEQUENCING: THIS LANDS BEFORE THE UI THAT CAN SET all_day. Production
-- already has the column (events_all_day) and nothing can write true to it
-- until the three-way time control ships. Fixing the push first means the
-- window in which the bug is reachable never opens. If the order were reversed
-- it would be safe only while both changes stayed in one deploy, and the app
-- bundle and this database are deployed separately.
--
-- ⚠️ A PURE HELPER, NOT AN INLINE CASE, for the same reason as
-- fixture_push_headline: send_fixture_push ends in net.http_post, so asserting
-- its behaviour from a harness would send a REAL push to REAL members, and a
-- rollback does not un-send a notification. This one is IMMUTABLE and can be
-- called freely.
--
-- ⚠️ PINNED IN THIS MIGRATION, NOT A FOLLOW-UP. fixture_push_headline shipped
-- unpinned earlier today and turned db/tests/search-path.sql RED against
-- production. A new function is a new obligation to an existing harness.
--
-- ⚠️ send_fixture_push's BODY BELOW WAS CAPTURED FROM pg_get_functiondef ON
-- LIVE, NOT FROM 20260819_fixture_push.sql — and this time they DIFFERED. The
-- live version writes to public.push_outbox and posts only {outbox_id}, which
-- 20260830_push_hardening introduced. Editing from the old file would have
-- silently reverted that.

-- ── 1. The when-line, as a pure function ──────────────────────────────────
create or replace function private.fixture_push_when(_event public.events)
 returns text
 language sql
 immutable
 set search_path = ''
as $function$
  select to_char(_event.starts_at at time zone 'Asia/Dubai', 'Dy DD Mon')
      || case
           -- ⚠️ ALL-DAY FIRST. The two flags are mutually exclusive by
           -- constraint, so the order is belt-and-braces — but stating it means
           -- a row that somehow held both could not produce ", time TBC" for
           -- something that has no time.
           when _event.all_day and _event.ends_at is not null
             then ' – ' || to_char(_event.ends_at at time zone 'Asia/Dubai', 'Dy DD Mon')
           when _event.all_day  then ''
           when _event.time_tbd then ', time TBC'
           else ', ' || to_char(_event.starts_at at time zone 'Asia/Dubai', 'HH24:MI')
         end;
$function$;

comment on function private.fixture_push_when(public.events) is
  'The "when" line of a fixture push. An all-day event gets a date and NO clock time — a midnight starts_at is a placeholder, not 00:00 — and a multi-day one names both days. Pure and immutable so it can be asserted without sending a real push.';

-- ── 2. send_fixture_push, replaced to call it ─────────────────────────────
--
-- Body otherwise IDENTICAL to what is live, captured from pg_get_functiondef
-- immediately before writing this.
create or replace function private.send_fixture_push(
  _club uuid, _team uuid, _actor uuid, _headline text, _event public.events
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare endpoint text; secret text; squad text; detail text; whenish text; outbox uuid;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_fixture_push: vault secrets missing, no push sent';
    return;
  end if;

  select t.name into squad from teams t where t.id = _team;

  whenish := private.fixture_push_when(_event);

  detail := coalesce(
    case when _event.type = 'match' and _event.opponent is not null then 'v ' || _event.opponent end,
    nullif(_event.title, ''), initcap(_event.type));

  insert into public.push_outbox (club_id, team_id, actor_id, category, title, body, path, tag)
  values (_club, _team, _actor, 'fixture',
          _headline || coalesce(' — ' || squad, ''),
          detail || ' · ' || whenish,
          '/schedule',
          'fixture-' || _event.id)
  returning id into outbox;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('squad_push', jsonb_build_object('outbox_id', outbox)));
exception when others then
  raise warning 'send_fixture_push: %', sqlerrm;
end;
$function$;

-- ── 3. Assert it landed, including the caller and the pin ─────────────────
do $$
declare e public.events; cfg text[];
begin
  e := null::public.events;
  e.starts_at := timestamptz '2026-09-16 20:00:00+00';   -- 00:00 17 Sep Asia/Dubai
  e.all_day := true; e.time_tbd := false;
  if private.fixture_push_when(e) <> 'Thu 17 Sep' then
    raise exception 'all-day when-line wrong: %', private.fixture_push_when(e);
  end if;

  e.all_day := false;
  e.starts_at := timestamptz '2026-09-17 13:00:00+00';   -- 17:00 Asia/Dubai
  if private.fixture_push_when(e) <> 'Thu 17 Sep, 17:00' then
    raise exception 'timed when-line changed: %', private.fixture_push_when(e);
  end if;

  if pg_get_functiondef('private.send_fixture_push(uuid,uuid,uuid,text,public.events)'::regprocedure)
     not like '%fixture_push_when%' then
    raise exception 'send_fixture_push was not replaced — it does not call the helper';
  end if;

  select proconfig into cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'fixture_push_when';
  if cfg is null then
    raise exception 'fixture_push_when shipped unpinned';
  end if;
end $$;
