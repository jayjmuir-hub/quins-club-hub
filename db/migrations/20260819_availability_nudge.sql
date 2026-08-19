-- 19 Aug 2026 — the availability nudge. The fifth and LAST notification
-- category, and the only one that is not a row-change trigger.
--
-- Design: claude/plans/2026-08-19-notifications-v2.md, which called this "the
-- most expensive of the four" and said it should ship last. It has.
--
-- ⚠️ `apply_migration` STRIPS `--` COMMENTS, so none of the reasoning below
-- reaches the database. This file is the record. (Learned from
-- db/migrations/20260813_photo_backup_schedule.sql, which says the same.)
--
-- ══ ⚠️ MATCHES ONLY, AND THE NUMBER IS WHY ═══════════════════════════════
--
-- Measured 19 Aug 2026, against the live club, BEFORE this was designed:
--
--   nudging every upcoming event ....... 338 notifications
--   nudging upcoming MATCHES only ......   6 notifications, to 4 people
--
-- **Fifty-six times.** There are 62 upcoming events and 2 of them are matches;
-- the other 60 are training. A nudge for every event is not a noisier version
-- of this feature, it is a different and much worse one — people do not turn
-- off "too many notifications", they turn off notifications. That is the same
-- reasoning the fixture triggers rest on, with a bigger multiplier.
--
-- ⚠️ THE ARGUMENT AGAINST, WHICH IS REAL: coaches want to know who is coming to
-- TRAINING too, and this tells them nothing. Rejected because a nudge that
-- fires 338 times gets the whole feature muted, taking the match nudge with it.
-- **Revisit only with a per-squad setting**, so a squad that genuinely runs
-- availability for training can opt IN — never by widening this default.
--
-- ══ ⛔ NOBODY IS EVER NUDGED TWICE ABOUT THE SAME MATCH ═══════════════════
--
-- The hard requirement, and the reason there is a ledger table below rather
-- than a clever time window. A window keyed to "the cron runs daily" gives
-- exactly one nudge per match — until somebody runs the job by hand, or the
-- schedule is changed, or a squad's membership changes mid-window. Then it
-- double-buzzes a family, which is the one failure this feature cannot have.
--
-- ⚠️ AND THE LEDGER IS CLAIMED IN A BATCH, WHICH IS NOT DECORATION. The claim
-- (insert the rows) happens BEFORE the push is queued, and the push carries the
-- batch id so that `availability_push_subscriptions` sends to exactly the
-- people this run claimed — not to "everyone who has not answered", which would
-- re-buzz anybody claimed on an earlier run when a squad gains a new member.
--
-- ⛔ SO A FAILED SEND LOSES THE NUDGE RATHER THAN RETRYING IT. Deliberate:
-- claimed-then-failed is silent, claimed-after-sending would double-buzz on any
-- retry. **Losing a nudge costs one prompt; sending it twice costs the
-- category.** The email is not a backstop here — there isn't one — so this is a
-- real cost and it is chosen with open eyes.
--
-- ══ WHO ══════════════════════════════════════════════════════════════════
--
-- People with an ACTIVE family membership (`parent` or `player`, carrying a
-- player) on that squad, whose player has NO availability row for that match.
--
-- ⛔ ONE PER PERSON, NOT ONE PER CHILD. The ledger is keyed on
-- (event_id, profile_id), so a parent with two children in the same squad is
-- nudged once about that match, not twice. The notification does not name a
-- child for the same reason: it would have to name both.
-- ⛔ NOT COACHES OR MANAGERS. They are not being asked whether they are
-- available; they are the people who will read the answers.

-- ══ 1. THE CATEGORY ══════════════════════════════════════════════════════
--
-- ⚠️ MUST MATCH src/data/notificationPreferences.js — a category the constraint
-- rejects is refused on INSERT, the switch still moves, and the notifications
-- keep arriving. tests/notification-categories.test.js is what now catches it.

alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply', 'notice', 'fixture', 'approval', 'availability'));


-- ══ 2. THE LEDGER ════════════════════════════════════════════════════════
--
-- ⚠️ NOT RLS-READABLE BY ANYBODY. Nothing in the app reads this; it exists so
-- the scheduler can tell what it has already done. A member has no use for it
-- and it records who has not answered, which is nobody else's business.

create table if not exists public.availability_nudges (
  event_id   uuid not null references public.events(id)   on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Which run claimed this row. The push carries it so the send goes to
  -- exactly this batch. See the header.
  batch_id   uuid not null,
  sent_at    timestamptz not null default now(),
  primary key (event_id, profile_id)
);

alter table public.availability_nudges enable row level security;

-- ⚠️ NO POLICY AT ALL, DELIBERATELY. RLS is on and nothing grants access, so
-- `authenticated` and `anon` see nothing. The scheduler and the edge function
-- reach it as SECURITY DEFINER / service_role. A table with RLS enabled and no
-- policy is not an oversight here — it is the tightest possible statement.
revoke all on public.availability_nudges from anon;
revoke all on public.availability_nudges from authenticated;


-- ══ 3. WHO STILL OWES AN ANSWER ══════════════════════════════════════════

create or replace function private.availability_nudge_candidates(_event uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select distinct m.profile_id
    from events e
    join memberships m
      on m.team_id = e.team_id
     and m.status = 'active'
     and m.role in ('parent', 'player')
     and m.player_id is not null
   where e.id = _event
     -- ⛔ Only people who have not answered FOR THAT CHILD.
     and not exists (
       select 1 from availability a
        where a.event_id = e.id and a.player_id = m.player_id)
     -- ⛔ Never twice about the same match, however often this runs.
     and not exists (
       select 1 from availability_nudges n
        where n.event_id = e.id and n.profile_id = m.profile_id)
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = m.profile_id and o.category = 'availability');
$function$;


-- ══ 4. THE SUBSCRIPTIONS FOR ONE CLAIMED BATCH ═══════════════════════════
--
-- ⚠️ KEYED ON THE BATCH, NOT ON "who has not answered". By the time this runs
-- the ledger rows already exist, so the candidate query above would return
-- nobody. Sending to the batch is also what stops an earlier run's people being
-- swept back in. See the header.

create or replace function public.availability_push_subscriptions(_event uuid, _batch uuid)
 returns table (id uuid, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from availability_nudges n
    join push_subscriptions s on s.profile_id = n.profile_id
   where n.event_id = _event
     and n.batch_id = _batch;
$function$;

-- ⚠️ SERVICE ROLE ALONE — this returns other people's push endpoints. Both the
-- `public` grant and the named anon/authenticated grants have to be revoked;
-- that is the lesson 20260813_revoke_anon_execute paid for.
revoke all on function public.availability_push_subscriptions(uuid, uuid) from public;
revoke all on function public.availability_push_subscriptions(uuid, uuid) from anon;
revoke all on function public.availability_push_subscriptions(uuid, uuid) from authenticated;
grant execute on function public.availability_push_subscriptions(uuid, uuid) to service_role;


-- ══ 5. THE RUN ═══════════════════════════════════════════════════════════
--
-- ⚠️ 48 HOURS, AND THE WINDOW IS OPEN-ENDED ON PURPOSE ("within the next 48h",
-- not "between 47 and 48 hours from now"). A tight window means a single missed
-- run loses the nudge for good. An open window plus the ledger means a missed
-- run simply sends late, which is the right failure: a nudge 20 hours before a
-- match is still useful, and a nudge that never arrives is the thing this
-- feature exists to prevent.

create or replace function private.send_availability_nudges()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
  ev       record;
  v_batch  uuid;
  n_people int;
  n_sent   int := 0;
  squad    text;
  detail   text;
  whenish  text;
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
      from events e
      join teams t on t.id = e.team_id
     where e.type = 'match'
       and e.starts_at > now()
       and e.starts_at <= now() + interval '48 hours'
  loop
    v_batch := gen_random_uuid();

    -- ⚠️ CLAIM FIRST, SEND SECOND. See the header for why this order, and what
    -- it costs.
    insert into availability_nudges (event_id, profile_id, batch_id)
    select ev.id, c.profile_id, v_batch
      from private.availability_nudge_candidates(ev.id) as c(profile_id)
    on conflict (event_id, profile_id) do nothing;

    get diagnostics n_people = row_count;
    if n_people = 0 then
      continue;
    end if;

    squad   := ev.team_name;
    whenish := to_char(ev.starts_at at time zone 'Asia/Dubai', 'Dy DD Mon')
               || case when ev.time_tbd then ', time TBC'
                       else ', ' || to_char(ev.starts_at at time zone 'Asia/Dubai', 'HH24:MI') end;
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
-- ⚠️ SWALLOWS ITS OWN FAILURE, like every other notifier here. A scheduled job
-- that raises is a job pg_cron will keep retrying on its next tick, and there
-- is nothing a failure here should stop.
exception when others then
  raise warning 'send_availability_nudges: %', sqlerrm;
  return n_sent;
end;
$function$;


-- ══ 6. THE SCHEDULE ══════════════════════════════════════════════════════
--
-- ⚠️ 05:23 UTC is 09:23 in the UAE — mid-morning, after the school run and
-- long after the two nightly jobs (22:17 and 22:41 UTC). The odd minute is on
-- purpose and for the same reason the photo backup's is: nothing else runs
-- then, so a coincidence in the logs is not one.
--
-- ⚠️ DAILY, NOT HOURLY, EVEN THOUGH THE LEDGER WOULD MAKE HOURLY SAFE. Hourly
-- would deliver the nudge closer to the 48-hour mark, and would also mean a
-- match added 47 hours ahead gets a nudge within the hour. Rejected because a
-- notification that can arrive at any hour will eventually arrive at 03:00 for
-- somebody, and the ledger makes the daily run's timing the ONLY thing that
-- decides when a family is woken.
--
-- ⚠️ A SCHEDULE THAT HAS NEVER FIRED IS NOT A SCHEDULE — the rule
-- 20260813_photo_backup_schedule.sql states and proved with a temporary
-- every-minute probe job. The same was done for this one.

select cron.unschedule('availability-nudge')
 where exists (select 1 from cron.job where jobname = 'availability-nudge');

select cron.schedule(
  'availability-nudge',
  '23 5 * * *',
  $job$ select private.send_availability_nudges(); $job$
);


-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--
--   npm run db:check -- availability-nudge
--
-- The assertion that matters is that nobody is nudged twice, and that the
-- match-only rule holds: the harness measures both against live data.
