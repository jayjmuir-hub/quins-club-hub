-- A league team's name is unique within its SQUAD, not within the club.
--
-- ⚠️ THIS FIXES A DESIGN ERROR SHIPPED THE SAME DAY, AND IT WAS FOUND BY JAY
-- USING THE APP, NOT BY ANY TEST. He added ADHQ1 to U16B in division A, then
-- tried to add ADHQ1 to U14B in division A and was refused.
--
-- The original constraint was `unique (club_id, rcm_name)`, which says a club
-- may have exactly ONE team called ADHQ1 anywhere. That is not how Rugby Club
-- Management names them: **every age group has its own ADHQ1, ADHQ2, ADHQ3**,
-- one per division. The name only identifies a team WITHIN an age group.
--
-- ⚠️ THE ORIGINAL DESIGN NOTE WAS RIGHT ABOUT THE THING IT CHECKED AND WRONG
-- ABOUT THE THING IT DID NOT. It reasoned carefully that a column on `teams`
-- could not hold three league teams for one squad — true, and why this is a
-- table — and then assumed without asking that the names were club-unique.
-- Jay's own sentence on 11 Aug was "each age group has 3 divisions in the
-- league, a, b, and c, clubs can have multiple teams at an age group". It says
-- multiple teams PER AGE GROUP. Nothing in it says the names do not repeat
-- between age groups, and the constraint assumed they did not.
--
-- ⚠️ `(team_id, rcm_name)` AND NOT `(club_id, team_id, rcm_name)`. A squad
-- belongs to exactly one club (`teams.club_id`, NOT NULL), so team_id already
-- implies the club and adding it back would be a wider index that cannot
-- refuse anything the narrower one allows.
--
-- ⚠️ WHAT THIS STILL REFUSES, deliberately: the same name twice in ONE squad.
-- Two rows called ADHQ1 under U14B are indistinguishable on the event form's
-- picker, and picking the wrong one files a fixture under the wrong team —
-- which the governing body receives as a wrong result.
--
-- ⚠️ WHAT IT DELIBERATELY DOES NOT REFUSE: two teams from one squad in the
-- SAME division. A club entering two sides in division A is a real thing, and
-- a constraint on (team_id, division) would forbid it for no reason. Division
-- is display, never a gate — see the column comment.
--
-- Safe to apply against live data: nothing violates the new constraint, and
-- the new one is strictly weaker than the old, so no existing row can fail it.

alter table public.league_teams
  drop constraint if exists league_teams_club_id_rcm_name_key;

alter table public.league_teams
  add constraint league_teams_team_id_rcm_name_key unique (team_id, rcm_name);
