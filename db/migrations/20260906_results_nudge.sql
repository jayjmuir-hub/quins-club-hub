-- ══════════════════════════════════════════════════════════════════════════
--  The Monday results nudge — "3 results missing for Division 1" to the
--  people who keep that division's table
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-02-standings-and-results.md ("Who does what": the
-- keeper "gets a push on Monday"). Built 4 Sep 2026 on the tables from
-- 20260905_competitions_and_standings.sql.
--
-- Two pieces, the same shape as the availability nudge
-- (20260819_availability_nudge.sql):
--   results_push_subscriptions(_competition)  the subscriptions to send to —
--       the division's keepers plus every active super admin, minus anyone
--       who switched the `results` category off. SECURITY DEFINER, called by
--       the push-send edge function with the service role.
--   private.send_results_nudges()  Monday morning, per competition with
--       fixtures in the last seven days that have no live result: one
--       net.http_post to push-send carrying the count, the division's name and
--       the path to its table. pg_cron at 01:30 UTC (05:30 Dubai).
--
-- ⚠️ "MISSING" IS EXACT BECAUSE THE GRID WAS IMPORTED. A fixture whose day has
-- passed and which has no unsuperseded confirmed result is missing; a division
-- with no fixtures imported never nudges anybody about nothing.
--
-- ⚠️ ONE PUSH PER DIVISION PER WEEK, TAGGED `results-<competition>`, so a
-- second Monday's nudge replaces last week's in the tray rather than stacking.
--
-- ⚠️ NO NEW TABLE, NO GRANT. The function grants are explicit below.

-- ── The category ───────────────────────────────────────────────────────────
-- `results` joins the opt-out list. tests/notification-categories.test.js
-- requires SOME migration to state exactly the app's categories, so the full
-- list is restated here, as 20260902_training_suggestion_push.sql did.
alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply','notice','fixture','approval',
                      'availability','squad_chat','direct_messages',
                      'document','training','results'));

create or replace function public.results_push_subscriptions(_competition uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable security definer
set search_path = public
as $$
  with audience as (
    select k.profile_id from public.competition_keepers k where k.competition_id = _competition
    union
    select m.profile_id
      from public.memberships m
      join public.competitions c on c.id = _competition and c.club_id = m.club_id
     where m.role = 'admin' and m.status = 'active' and m.is_super
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from audience a
    join public.push_subscriptions s on s.profile_id = a.profile_id
   where not exists (
     select 1 from public.notification_opt_outs o
      where o.profile_id = a.profile_id and o.category = 'results');
$$;
revoke execute on function public.results_push_subscriptions(uuid) from public;
grant execute on function public.results_push_subscriptions(uuid) to service_role;

create or replace function private.send_results_nudges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  endpoint text;
  secret   text;
  comp     record;
  missing  integer;
  n_sent   integer := 0;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_results_nudges: vault secrets missing, nothing sent';
    return 0;
  end if;

  for comp in select c.id, c.name, c.season from public.competitions c loop
    select count(*) into missing
      from public.competition_fixtures f
     where f.competition_id = comp.id
       and f.played_on is not null
       and f.played_on < current_date
       and f.played_on >= current_date - 7
       and not exists (
         select 1 from public.competition_results r
          where r.fixture_id = f.id and r.confirmed_at is not null and r.superseded_at is null);
    if missing = 0 then
      continue;
    end if;
    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
      body    := jsonb_build_object('results_nudge', jsonb_build_object(
                   'competition_id', comp.id,
                   'title', 'Results missing — ' || comp.name,
                   'body',  missing || ' result' || case when missing = 1 then '' else 's' end
                            || ' from last week still to enter.',
                   'path',  '/standings/' || comp.id,
                   'tag',   'results-' || comp.id)));
    n_sent := n_sent + 1;
  end loop;
  return n_sent;
exception when others then
  raise warning 'send_results_nudges: %', sqlerrm;
  return n_sent;
end;
$$;
revoke execute on function private.send_results_nudges() from public;

select cron.unschedule('results-nudge')
 where exists (select 1 from cron.job where jobname = 'results-nudge');
select cron.schedule(
  'results-nudge',
  '30 1 * * 1',
  $job$ select private.send_results_nudges(); $job$
);

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'results-nudge') then
    raise exception 'results-nudge was not scheduled';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'results_push_subscriptions') then
    raise exception 'results_push_subscriptions was not created';
  end if;
end $$;
