-- The club's LEAGUE TEAMS, which are not its squads.
--
-- Jay, 11 Aug 2026: "each age group has 3 divisions in the league, a, b, and c,
-- clubs can have multiple teams at an age group".
--
-- ══ TWO THINGS HERE ARE BOTH CALLED "TEAM" ══════════════════════════════
--   SQUAD        public.teams      "U14B Contact"   a training group. What
--                                                   players.team_id and
--                                                   events.team_id point at.
--   LEAGUE TEAM  this table        "ADHQ2"          a competing entity in one
--                                                   division. What Rugby Club
--                                                   Management knows.
--
-- One squad can enter several league teams. Until now the app could not say
-- which of them played a fixture, and the RCM match result sheet's TEAM: field
-- had nothing to read.
--
-- ⚠️ THE LETTER IN A SQUAD NAME IS GENDER, NOT DIVISION. "U14B Contact" is U14
-- BOYS; "U14G QR" is Girls. private.squad_expects_gender parses exactly that
-- suffix and src/lib/gender.js depends on it. Anything that tries to read a
-- division out of teams.name will read the gender instead. That is the whole
-- reason division is a column here and not a parse.
--
-- ⚠️ WHY NOT A COLUMN ON teams. That was the first design and it was agreed
-- before Jay said the sentence above. One rcm_name per squad cannot hold three
-- league teams, so the column would have quietly forced the club to pick one.

create table if not exists public.league_teams (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  rcm_name   text not null,
  division   text check (division in ('A','B','C')),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint league_teams_club_id_rcm_name_key unique (club_id, rcm_name)
);

alter table public.league_teams enable row level security;

create index if not exists league_teams_team_idx
  on public.league_teams (team_id, sort_order, rcm_name);

comment on column public.league_teams.rcm_name is
  'What Rugby Club Management calls this team, e.g. ADHQ2. NOT the squad name: '
  'teams.name is the training group (U14B Contact) and the letter in it is '
  'GENDER, not division.';

comment on column public.league_teams.division is
  'League division A, B or C. NULLABLE on purpose - a club can enter a team '
  'that is not in a lettered division, and forcing a letter would invent data. '
  'Display only; never a gate.';

comment on column public.league_teams.is_active is
  'Retire without deleting. Deleting would leave last season''s fixtures '
  'pointing at nothing - the same reasoning public.pitches records.';

-- ── Policies ────────────────────────────────────────────────────────────
-- ⚠️ READ IS WIDE ON PURPOSE. A coach filling a match sheet has to pick their
-- league team, so this is any signed-in member rather than a membership check.
-- Nothing here is sensitive: it is the club's own team names, which the
-- opposition already knows.
create policy "league team read" on public.league_teams
  for select using (auth.uid() is not null);

-- ⚠️ WRITE IS ADMIN-ONLY, AND THAT IS THE SECURITY BOUNDARY. rcm_name is the
-- field that tells the league whose result a match sheet is. A coach who could
-- rename a league team could file a result against another team's name, and the
-- club would learn about it from the league table rather than from the app.
create policy "league team manage" on public.league_teams
  for all using (private.is_admin(club_id)) with check (private.is_admin(club_id));

-- ⚠️ THE `youth` ADMIN RIGHT GATES THE SCREEN, NOT THIS TABLE. Same ruling as
-- pitches: a right decides which dashboard somebody is SHOWN. It is a "not your
-- job" message and must never be described as a security boundary.

-- ── THE GUARD. Reads the result back, inside the transaction. ───────────
do $$
declare
  n_policies int;
  n_rls      int;
begin
  select count(*) into n_policies from pg_policies
   where schemaname = 'public' and tablename = 'league_teams';
  if n_policies <> 2 then
    raise exception 'ABORTING: expected exactly 2 policies on league_teams, found %.', n_policies;
  end if;

  select count(*) into n_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'league_teams' and c.relrowsecurity;
  if n_rls <> 1 then
    raise exception 'ABORTING: row level security is not enabled on league_teams.';
  end if;

  -- ⚠️ Supabase default privileges grant anon full rights on every new table in
  -- public, so a table without RLS is not merely unhardened, it is open to
  -- anyone holding the project URL. That is why the check above exists.
  raise notice 'guard passed: 2 policies, RLS on';
end $$;
