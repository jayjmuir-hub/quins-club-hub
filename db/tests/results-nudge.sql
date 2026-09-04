-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — the Monday results nudge: who is told, and what "missing" counts.
--  SAFE ON PRODUCTION: one transaction, rolled back.
--  Run with `npm run db:check -- results-nudge`.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260906_results_nudge.sql. The audience is the division's
-- keepers plus the active super admins, minus `results` opt-outs; the count
-- is fixtures from the last seven days with no live result. Neither step
-- sends anything: private.send_results_nudges is NOT called here, because its
-- net.http_post is a real push that no rollback can recall.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  club constant uuid := '00000000-0000-0000-0000-0000000000ad';
  keeper constant uuid := 'd0000000-0000-4000-8000-000000000011';
  cid uuid; sa uuid; sb uuid; base int; n int; missing int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (keeper, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'results-keeper@example.invalid', now(), '{}'::jsonb, now(), now())
  on conflict (id) do nothing;
  insert into public.profiles (id, full_name, email) values (keeper, 'Results Keeper', 'results-keeper@example.invalid') on conflict (id) do nothing;

  insert into public.competitions (club_id, name, season, is_senior) values (club, 'Nudge Division', 'harness', true) returning id into cid;
  insert into public.competition_sides (competition_id, name, code) values (cid, 'Alpha', 'A') returning id into sa;
  insert into public.competition_sides (competition_id, name, code) values (cid, 'Bravo', 'B') returning id into sb;

  select count(*) into base from public.results_push_subscriptions(cid);
  -- A keeper with a subscription joins the audience.
  insert into public.competition_keepers (competition_id, profile_id) values (cid, keeper);
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (keeper, 'https://push.example.invalid/harness', 'p', 'a');
  select count(*) into n from public.results_push_subscriptions(cid);
  insert into _r values ('1 a keeper with a subscription is in the audience', case when n = base + 1 then 'PASS' else 'FAIL ' || n || ' vs ' || base end);
  -- Opting out of `results` removes them.
  insert into public.notification_opt_outs (profile_id, category) values (keeper, 'results');
  select count(*) into n from public.results_push_subscriptions(cid);
  insert into _r values ('2 a results opt-out removes them', case when n = base then 'PASS' else 'FAIL ' || n end);
  -- CONTROL: the category is accepted by the constraint at all (a typo here would have thrown above).
  insert into _r values ('3 CONTROL: the results category is admitted by the opt-out constraint', 'PASS');

  -- "Missing": last week's fixture with no result counts; one with a result does not; next week's does not.
  insert into public.competition_fixtures (competition_id, round, played_on, home_side_id, away_side_id) values
    (cid, 1, current_date - 3, sa, sb),
    (cid, 2, current_date - 5, sb, sa),
    (cid, 3, current_date + 4, sa, sb);
  insert into public.competition_results (competition_id, fixture_id, round, home_side_id, away_side_id, home_score, away_score, source, confirmed_by, confirmed_at, created_by)
  select cid, f.id, 2, sb, sa, 10, 7, 'typed', keeper, now(), keeper from public.competition_fixtures f where f.competition_id = cid and f.round = 2;
  select count(*) into missing from public.competition_fixtures f
   where f.competition_id = cid and f.played_on < current_date and f.played_on >= current_date - 7
     and not exists (select 1 from public.competition_results r where r.fixture_id = f.id and r.confirmed_at is not null and r.superseded_at is null);
  insert into _r values ('4 missing counts last week''s unrecorded fixture only', case when missing = 1 then 'PASS' else 'FAIL ' || missing end);
end $$;

select * from _r order by step;
rollback;
