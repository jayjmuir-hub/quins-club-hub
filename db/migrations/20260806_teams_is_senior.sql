-- Applied to Supabase as migration `teams_is_senior`, 6 Aug 2026.
--
-- Drives the role a roster-matched account receives: 'player' for adult squads,
-- 'parent' for juniors.
--
-- A COLUMN, deliberately, and not a test on teams.name. Deriving the role from
-- the squad name would work today and break silently the day someone renames a
-- squad -- an adult would be handed a 'parent' role, i.e. listed as their own
-- parent, and nothing would fail loudly enough to notice. The name is a label
-- for humans; this is the fact the code keys on.
alter table public.teams
  add column is_senior boolean not null default false;

comment on column public.teams.is_senior is
  'Adult squad. Drives role selection in public.claim_roster_access(): true -> player, false -> parent. Set this, never test teams.name.';

update public.teams
set is_senior = true
where name in ('Senior Men 1st XV', 'Senior Men 2nd XV', 'Women''s XV');

-- Verified after applying: exactly 3 squads true (36 players), 12 false.
-- U18 Colts is deliberately FALSE -- they are under 18.
