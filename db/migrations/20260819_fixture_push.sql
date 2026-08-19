-- 19 Aug 2026 — a push notification when a fixture is added, changed or
-- cancelled for your squad.
--
-- Jay, 19 Aug 2026: "do the fixture notifications next."
-- claude/plans/2026-08-19-notifications-v2.md, category 2.
--
-- ══ ⚠️ THE RULE THAT MAKES THIS SAFE, AND IT IS ONE SENTENCE ══════════════
--
--     ONLY A STATEMENT THAT TOUCHES EXACTLY ONE FIXTURE EVER NOTIFIES.
--
-- Anything touching more than one is an administrative act — setting up a
-- term, clearing a series — and not news. **This is enforced by the mechanism,
-- not by a heuristic**: every trigger below is STATEMENT-level with a
-- transition table, and returns early unless that table holds exactly one row.
--
-- ══ WHY, MEASURED RATHER THAN IMAGINED ═══════════════════════════════════
--
-- On 19 Aug 2026, of 63 events in the club: **50 were created as part of a
-- repeating series, the biggest series was 18 events, and 18 rows were created
-- inside a single minute.** A row-level INSERT trigger would have sent
-- **eighteen notifications to every family in that squad, in one minute**, the
-- first time somebody set up a term of training.
--
-- ⚠️ THAT IS NOT A TUNING PROBLEM, IT IS THE FEATURE FAILING. People do not
-- turn off "too many notifications"; they turn off notifications. One burst
-- costs the club every future fixture alert, permanently, and no amount of
-- being right afterwards gets it back.
--
-- ⛔ **A SERIES INSERT NEVER NOTIFIES AT ALL** (Jay's call): a whole term of
-- training appearing is planning, not news. A single new fixture does.
-- ⛔ **A BULK DELETE NEVER NOTIFIES** — `deleteSeriesFrom` removes the rest of
-- a term, which is the same act in reverse.
--
-- ══ ⚠️ SCORES MUST NEVER NOTIFY, AND THIS TABLE IS FULL OF THEM ══════════
--
-- `events` carries `result_us`, `result_them`, `tries_us`, `conversions_us`,
-- `penalties_us`, `drops_us` and the four `_them` equivalents. **Entering a
-- score after the match is an UPDATE on the fixture row.** A change trigger
-- that watched the whole row would buzz the entire squad every time somebody
-- typed a conversion in on a Saturday afternoon.
--
-- So the UPDATE trigger names the fields a PARENT needs — when it is, where it
-- is, who it is against — and nothing else. **Adding a column to this table
-- does not silently add it to the notification.**

-- ══ 1. WHO A FIXTURE CHANGE GOES TO ══════════════════════════════════════
--
-- ⚠️ REUSES `private.notice_audience`, WHICH IS THE POINT. A fixture and a
-- squad notice have exactly the same audience question — "the people attached
-- to this squad" — and 20260819_notice_push.sql already answers it, is already
-- harnessed, and is already asserted never to exceed who may READ. A second
-- audience function would be a second thing to keep in step with
-- `can_see_team`, which is the drift this repo keeps paying for.

create or replace function public.squad_push_subscriptions(
  _club uuid, _team uuid, _actor uuid, _category text
)
 returns table (id uuid, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from private.notice_audience(_club, _team) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where (_actor is null or aud.profile_id <> _actor)
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = aud.profile_id
          and o.category = _category);
$function$;

-- ⚠️ SERVICE ROLE ALONE. This returns other people's push endpoints. `revoke
-- from public` does not remove the named anon/authenticated grants Supabase's
-- default privileges hand out, so both routes are named — the lesson
-- 20260813_revoke_anon_execute.sql paid for.
revoke all on function public.squad_push_subscriptions(uuid, uuid, uuid, text) from public;
revoke all on function public.squad_push_subscriptions(uuid, uuid, uuid, text) from anon;
revoke all on function public.squad_push_subscriptions(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.squad_push_subscriptions(uuid, uuid, uuid, text) to service_role;


-- ══ 2. THE CATEGORY ══════════════════════════════════════════════════════
--
-- ⚠️ THE CHECK CONSTRAINT IS THE POINT OF FAILURE IF THIS IS FORGOTTEN. A
-- category the constraint does not know is an opt-out row that cannot be
-- written: the switch appears to move and the notifications keep coming, with
-- nothing anywhere reporting a problem.

alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply', 'notice', 'fixture'));


-- ══ 3. THE SENDER ════════════════════════════════════════════════════════
--
-- ⚠️ THE TRIGGER BUILDS THE TEXT, NOT THE EDGE FUNCTION, AND A CANCELLATION IS
-- WHY. By the time push-send runs, a cancelled fixture no longer exists —
-- there is nothing left to read. So the whole notification travels in the
-- payload, and the edge function only resolves the audience and encrypts.
--
-- ⚠️ Asia/Dubai, HARD-CODED. This is one club, in one city. A `timezone`
-- column nobody sets would be a lie with more moving parts.

create or replace function private.send_fixture_push(
  _club uuid, _team uuid, _actor uuid, _headline text, _event public.events
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
  squad    text;
  detail   text;
  whenish  text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_fixture_push: vault secrets missing, no push sent';
    return;
  end if;

  select t.name into squad from teams t where t.id = _team;

  -- ⚠️ `time_tbd` IS A REAL STATE, NOT A MISSING VALUE. Printing 00:00 for a
  -- fixture whose time is genuinely not known yet would be worse than saying
  -- so — see 20260814_competition_tbd_and_time_tbd.sql.
  whenish := to_char(_event.starts_at at time zone 'Asia/Dubai', 'Dy DD Mon')
             || case when _event.time_tbd then ', time TBC'
                     else ', ' || to_char(_event.starts_at at time zone 'Asia/Dubai', 'HH24:MI')
                end;

  detail := coalesce(
    case when _event.type = 'match' and _event.opponent is not null
         then 'v ' || _event.opponent end,
    nullif(_event.title, ''),
    initcap(_event.type));

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-approval-secret', secret),
    body    := jsonb_build_object(
                 'squad_push', jsonb_build_object(
                   'club_id',  _club,
                   'team_id',  _team,
                   'actor_id', _actor,
                   'category', 'fixture',
                   'title',    _headline || coalesce(' — ' || squad, ''),
                   'body',     detail || ' · ' || whenish,
                   'path',     '/schedule',
                   -- ⚠️ PER EVENT, so three edits to the same fixture collapse
                   -- into one notification in the tray rather than stacking.
                   'tag',      'fixture-' || _event.id))
  );
exception when others then
  -- ⚠️ A PUSH THAT CANNOT BE SENT MUST NEVER STOP THE FIXTURE BEING SAVED.
  -- The schedule is the feature; the notification is the accelerant.
  raise warning 'send_fixture_push: %', sqlerrm;
end;
$function$;


-- ══ 4. THE THREE TRIGGERS — ALL STATEMENT-LEVEL, ALL ONE-ROW-ONLY ════════

create or replace function private.notify_fixture_added()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare e public.events;
begin
  -- Exactly one row, and not part of a series. Both halves are Jay's call:
  -- a term of repeating training appearing is planning, not news.
  if (select count(*) from inserted) <> 1 then return null; end if;
  select * into e from inserted;
  if e.series_id is not null then return null; end if;
  perform private.send_fixture_push(e.club_id, e.team_id, auth.uid(), 'New fixture', e);
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

  -- ⚠️ THE NAMED LIST IS THE WHOLE SAFETY OF THIS TRIGGER. Scores, notes and
  -- everything else on this wide table are deliberately absent: entering a
  -- result is an UPDATE, and it must not buzz the squad.
  if o.starts_at is distinct from n.starts_at
     or o.time_tbd is distinct from n.time_tbd
     or o.venue    is distinct from n.venue
     or o.pitch    is distinct from n.pitch
     or o.opponent is distinct from n.opponent
     or o.home     is distinct from n.home
     or o.team_id  is distinct from n.team_id
  then
    perform private.send_fixture_push(n.club_id, n.team_id, auth.uid(), 'Fixture changed', n);
  end if;
  return null;
end;
$function$;

create or replace function private.notify_fixture_cancelled()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare e public.events;
begin
  -- ⚠️ ONE ROW ONLY, WHICH IS WHAT SEPARATES A CANCELLATION FROM CLEARING A
  -- TERM. `deleteSeriesFrom` removes the rest of a series in one statement;
  -- that is administration and must stay silent.
  if (select count(*) from deleted) <> 1 then return null; end if;
  select * into e from deleted;
  perform private.send_fixture_push(e.club_id, e.team_id, auth.uid(), 'Fixture cancelled', e);
  return null;
end;
$function$;

drop trigger if exists fixture_added_push     on public.events;
drop trigger if exists fixture_changed_push   on public.events;
drop trigger if exists fixture_cancelled_push on public.events;

create trigger fixture_added_push
  after insert on public.events
  referencing new table as inserted
  for each statement execute function private.notify_fixture_added();

create trigger fixture_changed_push
  after update on public.events
  referencing old table as updated_old new table as updated_new
  for each statement execute function private.notify_fixture_changed();

create trigger fixture_cancelled_push
  after delete on public.events
  referencing old table as deleted
  for each statement execute function private.notify_fixture_cancelled();


-- ══ HOW TO VERIFY ════════════════════════════════════════════════════════
--
--   npm run db:check -- fixture-push
--
-- The assertions that matter are the ones about SILENCE: a series insert, a
-- bulk delete and a score entry must each send nothing, and the harness proves
-- each by showing the same statement DOES send when it touches one row or a
-- parent-facing field.
