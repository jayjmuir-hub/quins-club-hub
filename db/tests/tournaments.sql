-- ══════════════════════════════════════════════════════════════════════════
--  TOURNAMENTS HARNESS — a tournament's games hang off it, and deleting the
--  tournament takes the games (and their sheets) with it, while an ordinary
--  fixture beside them survives. And the calendar feed shows the tournament but
--  NOT its games.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is one it created itself.
-- ══════════════════════════════════════════════════════════════════════════
--
--  Phase 1 of claude/plans/2026-08-29-tournaments-as-containers.md. This file
--  APPLIES the phase-1 DDL itself, idempotently (`add column if not exists`,
--  and the FK / feed only if absent), so it proves the migration is sound
--  against real production data BEFORE the migration is applied — and keeps
--  passing unchanged once it has been. The rollback un-applies it either way.
--
--  ⚠️ THE CASCADE IS THE POINT AND THE DANGER. events_tournament_id_fkey is
--  ON DELETE CASCADE, so a tournament delete is not recoverable. The control
--  fixture below is not decoration: without it, an FK that deleted EVERYTHING
--  for the team would satisfy the "games gone" assertion just as well as the
--  correct one.

begin;

-- ── The phase-1 DDL, idempotent. Once the migration is applied this whole
--    block is a no-op; until then it is what makes the harness runnable. ──────
-- ⚠️ `placing` is a RESERVED WORD — quoted here as in the migration. Separate
-- ALTERs, not one comma-separated statement, for the same reason.
alter table public.events add column if not exists tournament_id uuid;
alter table public.events add column if not exists "placing"    text;
alter table public.events add column if not exists stage        text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.events'::regclass
       and conname  = 'events_tournament_id_fkey'
  ) then
    alter table public.events
      add constraint events_tournament_id_fkey
      foreign key (tournament_id) references public.events(id) on delete cascade;
  end if;
end $$;

create index if not exists events_tournament_id_idx
  on public.events using btree (tournament_id) where (tournament_id is not null);

create or replace function public.calendar_events_for_token(_token uuid)
returns table (
  id uuid, type text, title text, opponent text, home boolean, venue text,
  pitch text, competition text, starts_at timestamptz, ends_at timestamptz,
  notes text, team_name text, league_team_name text, league_division text,
  round smallint, time_tbd boolean, competition_type text
)
language sql stable security definer set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd, e.competition_type
  from public.events e
  join public.teams t on t.id = e.team_id
  left join public.league_teams lt on lt.id = e.league_team_id
  where exists (
    select 1 from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and ((m.role = 'admin' and m.club_id = t.club_id) or m.team_id = e.team_id)
  )
  and e.starts_at > now() - interval '6 months'
  and e.tournament_id is null
  order by e.starts_at;
$function$;


create function pg_temp.check_tournaments() returns void language plpgsql as $fn$
declare
  v_club uuid; v_team uuid; v_profile uuid;
  v_tourn uuid; v_g1 uuid; v_g2 uuid; v_control uuid;
  v_token uuid;
  n int;
begin
  -- ── A squad with an active, team-attached member: needed for the feed test,
  --    and a fixture with no audience would make the counts meaningless. ──────
  select m.club_id, m.team_id, m.profile_id into v_club, v_team, v_profile
    from public.memberships m
   where m.status = 'active' and m.team_id is not null
   limit 1;

  if v_team is null then
    raise exception
      'TOURNAMENTS: no active membership with a team_id. The feed test needs a '
      'member who can see the fixtures, and there is none to borrow.';
  end if;

  -- ── The tournament (a container), two games under it, a match sheet on one,
  --    and a CONTROL ordinary fixture for the same squad. ─────────────────────
  insert into public.events (club_id, team_id, type, competition_type, competition,
                             starts_at, time_tbd, "placing")
       values (v_club, v_team, 'match', 'tournament', 'db:check Cup',
               now() + interval '10 days', false, 'Runners-up')
    returning id into v_tourn;

  insert into public.events (club_id, team_id, type, competition_type, competition,
                             opponent, stage, tournament_id, starts_at, time_tbd)
       values (v_club, v_team, 'match', 'tournament', 'db:check Cup',
               'db:check Rovers', 'Pool A', v_tourn, now() + interval '10 days', false)
    returning id into v_g1;

  insert into public.events (club_id, team_id, type, competition_type, competition,
                             opponent, stage, tournament_id, starts_at, time_tbd)
       values (v_club, v_team, 'match', 'tournament', 'db:check Cup',
               'db:check Wanderers', 'Semi-final', v_tourn, now() + interval '10 days', false)
    returning id into v_g2;

  insert into public.match_sheets (event_id, status) values (v_g1, 'draft');

  insert into public.events (club_id, team_id, type, starts_at, opponent, time_tbd)
       values (v_club, v_team, 'match', now() + interval '11 days', 'db:check Control FC', false)
    returning id into v_control;

  -- ── 1. THE FEED SHOWS THE TOURNAMENT BUT NOT ITS GAMES ──────────────────────
  --
  -- ⚠️ THE CONTAINER MUST APPEAR (control for the exclusion). If it does not,
  -- the "games absent" assertion below is free — an empty feed passes it.
  insert into public.calendar_tokens (profile_id) values (v_profile)
    on conflict (profile_id) do update set token = gen_random_uuid()
    returning token into v_token;

  select count(*) into n from public.calendar_events_for_token(v_token) where id = v_tourn;
  if n <> 1 then
    raise exception
      'TOURNAMENTS: the tournament itself is missing from the feed (found %), so '
      'the games-absent check below proves nothing.', n;
  end if;

  select count(*) into n from public.calendar_events_for_token(v_token)
   where id in (v_g1, v_g2);
  if n <> 0 then
    raise exception
      'TOURNAMENTS: % of a tournament''s games leaked into the calendar feed. '
      'Games are shown inside the tournament, never as their own entries - the '
      'feed must filter tournament_id is null.', n;
  end if;

  -- ── 2. DELETING THE TOURNAMENT CASCADES TO ITS GAMES AND THEIR SHEETS ───────
  delete from public.events where id = v_tourn;

  select count(*) into n from public.events where id in (v_g1, v_g2);
  if n <> 0 then
    raise exception
      'TOURNAMENTS: % game(s) survived deleting their tournament. '
      'events_tournament_id_fkey must be ON DELETE CASCADE.', n;
  end if;

  select count(*) into n from public.match_sheets where event_id in (v_g1, v_g2);
  if n <> 0 then
    raise exception
      'TOURNAMENTS: a game''s match sheet survived the cascade (% row(s)). '
      'match_sheets_event_id_fkey should have taken it.', n;
  end if;

  -- ── 3. ⚠️ THE CONTROL FIXTURE SURVIVES — the cascade took the games, not the
  --    squad''s whole schedule. ────────────────────────────────────────────────
  select count(*) into n from public.events where id = v_control;
  if n <> 1 then
    raise exception
      'TOURNAMENTS: the control fixture was deleted by the tournament cascade. '
      'The FK is reaching rows it must not - tournament_id, not team_id.';
  end if;

  raise notice 'TOURNAMENTS: all checks passed.';
end
$fn$;


-- ── Run it against live, unmodified ────────────────────────────────────────
-- Expected: NOTICE  TOURNAMENTS: all checks passed.
select pg_temp.check_tournaments();


-- ── ⚠️ THE SELF-TEST — make the FK ON DELETE SET NULL and prove it is caught ─
--
-- SET NULL is the plausible wrong choice: it keeps the games "for safety" and
-- silently orphans them under a tournament that no longer exists. The cascade
-- assertion must fail when the FK does this, or it is not testing the cascade.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: TOURNAMENTS: …
alter table public.events drop constraint events_tournament_id_fkey;
alter table public.events
  add constraint events_tournament_id_fkey
  foreign key (tournament_id) references public.events(id) on delete set null;

do $$
begin
  begin
    perform pg_temp.check_tournaments();
    raise exception 'SELF-TEST FAILED: check_tournaments() passed while the FK was ON DELETE SET NULL. The cascade assertion is vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end $$;


-- ── Undo everything ─────────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This file really did ADD three columns, an FK, an index and
-- replace the feed function on production, and really did insert fixtures. All
-- of it is transactional and goes back here — but only if this runs.
-- scripts/db-check.mjs refuses any file in db/tests/ that could commit.
rollback;
