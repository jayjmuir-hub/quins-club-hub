-- ══════════════════════════════════════════════════════════════════════════
--  The availability nudge builds the same when-line — one implementation
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/plans/2026-08-31-club-diary.md ([PHASE 2])
-- Harness: db/tests/club-diary-push.sql steps 10-13 (extended FIRST, watched failing)
--
-- ⚠️ A SECOND SURFACE FOR THE BUG FIXED IN 20260901_fixture_push_all_day_when.
-- private.send_availability_nudges carried its OWN inline copy of the when-line
-- expression, so fixing send_fixture_push alone left "Thu 17 Sep, 00:00"
-- reachable — from a different function, for the same reason, with no test
-- anywhere that would have said so.
--
-- ⚠️ FOUND BY READING THE SCHEMA CAPTURE WHILE UPDATING IT, not by looking for
-- it. Two functions had the same four lines. That duplication is the actual
-- defect; the midnight is a symptom of it, and this migration removes the
-- duplication rather than patching the second copy.
--
-- ⚠️ THE NUDGE IS MATCH-ONLY AND STAYS THAT WAY. `where e.type = 'match'` means
-- a Club Diary entry can never be nudged — measured before writing this, which
-- is how we know phase 1 did NOT ship a bug here. Harness step 13 asserts the
-- filter survives this replacement, because replacing a function is exactly the
-- moment its selection criteria can change silently, and a nudge that stopped
-- being match-only would start chasing parents to RSVP to a kit collection.
--
-- ⚠️ THE OVERLOAD EXISTS BECAUSE `ev` IS A record, NOT public.events. The loop
-- selects `e.*, t.name as team_name`, so the row-typed helper cannot take it.
-- The row form now DELEGATES to the scalar one, so there is a single
-- implementation and the two cannot drift — which is the failure this whole
-- migration is correcting.
--
-- ⚠️ coalesce ON BOTH FLAGS. The nudge passes columns straight out of a record;
-- a null flag reaching an un-coalesced CASE returns NULL, and a null when-line
-- concatenated into the push body makes the WHOLE body null — a notification
-- with no text, which is worse than one with a wrong time.
--
-- ⚠️ send_availability_nudges' BODY BELOW WAS CAPTURED FROM pg_get_functiondef
-- ON LIVE, not from 20260819_availability_nudge.sql. Same rule that caught the
-- push_hardening drift an hour ago: a migration file records an edit, only the
-- database records the present.

-- ── 1. The scalar form — the single implementation ────────────────────────
create or replace function private.fixture_push_when(
  _starts_at timestamptz, _ends_at timestamptz, _all_day boolean, _time_tbd boolean
)
 returns text
 language sql
 immutable
 set search_path = ''
as $function$
  select to_char(_starts_at at time zone 'Asia/Dubai', 'Dy DD Mon')
      || case
           when coalesce(_all_day, false) and _ends_at is not null
             then ' – ' || to_char(_ends_at at time zone 'Asia/Dubai', 'Dy DD Mon')
           when coalesce(_all_day, false)  then ''
           when coalesce(_time_tbd, false) then ', time TBC'
           else ', ' || to_char(_starts_at at time zone 'Asia/Dubai', 'HH24:MI')
         end;
$function$;

comment on function private.fixture_push_when(timestamptz, timestamptz, boolean, boolean) is
  'The "when" line of a fixture push, from scalars. THE single implementation — the public.events overload delegates here so the two cannot drift. An all-day event gets a date and NO clock time; a multi-day one names both days.';

-- ── 2. The row form now DELEGATES ─────────────────────────────────────────
create or replace function private.fixture_push_when(_event public.events)
 returns text
 language sql
 immutable
 set search_path = ''
as $function$
  select private.fixture_push_when(_event.starts_at, _event.ends_at, _event.all_day, _event.time_tbd);
$function$;

-- ── 3. The nudge calls it ─────────────────────────────────────────────────
--
-- Body otherwise IDENTICAL to live, including `where e.type = 'match'` and the
-- 48-hour window.
create or replace function private.send_availability_nudges()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text; secret text; ev record; v_batch uuid;
  n_people int; n_sent int := 0; squad text; detail text; whenish text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_availability_nudges: vault secrets missing, nothing sent';
    return 0;
  end if;

  for ev in
    select e.*, t.name as team_name
      from events e join teams t on t.id = e.team_id
     where e.type = 'match'
       and e.starts_at > now()
       and e.starts_at <= now() + interval '48 hours'
  loop
    v_batch := gen_random_uuid();

    insert into availability_nudges (event_id, profile_id, batch_id)
    select ev.id, c.profile_id, v_batch
      from private.availability_nudge_candidates(ev.id) as c(profile_id)
    on conflict (event_id, profile_id) do nothing;

    get diagnostics n_people = row_count;
    if n_people = 0 then continue; end if;

    squad   := ev.team_name;
    whenish := private.fixture_push_when(ev.starts_at, ev.ends_at, ev.all_day, ev.time_tbd);
    detail  := coalesce(
      case when ev.opponent is not null then 'v ' || ev.opponent end,
      nullif(ev.title, ''), 'Match');

    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-approval-secret', secret),
      body    := jsonb_build_object('availability_nudge', jsonb_build_object(
                   'event_id', ev.id,
                   'batch_id', v_batch,
                   'title', 'Availability needed' || coalesce(' — ' || squad, ''),
                   'body',  detail || ' · ' || whenish,
                   'path',  '/schedule',
                   'tag',   'availability-' || ev.id)));

    n_sent := n_sent + n_people;
  end loop;

  return n_sent;
exception when others then
  raise warning 'send_availability_nudges: %', sqlerrm;
  return n_sent;
end;
$function$;

-- ── 4. Assert: both forms agree, the nudge is wired, and still match-only ─
do $$
declare e public.events; def text;
begin
  e := null::public.events;
  e.starts_at := timestamptz '2026-09-16 20:00:00+00';
  e.all_day := true; e.time_tbd := false;
  if private.fixture_push_when(e)
     is distinct from private.fixture_push_when(e.starts_at, e.ends_at, e.all_day, e.time_tbd) then
    raise exception 'the row and scalar when-line forms disagree';
  end if;

  if private.fixture_push_when(timestamptz '2026-09-17 13:00:00+00', null, null, null)
     <> 'Thu 17 Sep, 17:00' then
    raise exception 'null flags do not fall back to the timed form';
  end if;

  def := pg_get_functiondef('private.send_availability_nudges()'::regprocedure);
  if def not like '%fixture_push_when%' then
    raise exception 'send_availability_nudges was not replaced';
  end if;
  if def not like '%e.type = ''match''%' then
    raise exception 'send_availability_nudges is no longer match-only';
  end if;
end $$;
