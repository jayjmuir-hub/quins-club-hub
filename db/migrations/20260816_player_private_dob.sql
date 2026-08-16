-- public.player_private — a child's date of birth, and the shape every later
-- sensitive per-player field should copy.
--
-- Jay, 16 Aug 2026: "i think we need to have date of birth".
--
-- ⚠️ THIS OVERTURNS A STANDING RULING, DELIBERATELY, AND THE RULING IS WORTH
-- KNOWING. src/lib/ageGroup.js says: "the club does not hold DOBs in this app,
-- and `teams` has no age column — the squad names are the only age signal there
-- is". That was argued for and correct while nothing needed a real age. Jay's
-- call reverses it. Recorded here so nobody re-argues a settled question, and so
-- the next person understands the ageGroup.js header is now HISTORY plus a
-- pointer, not current instruction.
--
-- ⛔ WHY THIS IS NOT A COLUMN ON `players`, WHICH IS THE OBVIOUS THING TO DO
--
-- `player read` is `can_see_team(team_id) OR is_own_player(id)`, and
-- can_see_team is SQUAD-WIDE. So a `date_of_birth` column on `players` is
-- readable by EVERY PARENT IN THE SQUAD — a directory of every child's birthday,
-- published as a side effect of adding a form field.
--
-- ⚠️ RLS GRANTS ROWS, NOT COLUMNS, AND A PARENT AND A COACH ARE THE SAME
-- `authenticated` ROLE. There is no policy that can hide one column of `players`
-- from a parent while showing them the rest of their team-mate's row. The
-- schema has already met this once and solved it the same way: see the table
-- comment on public.player_grades, which exists as a separate table for exactly
-- this reason and says so.
--
-- So: its own table, its own policies, and the pair is the one `player_parents`
-- already runs — staff for the squad, or the child's own family. Nobody else.
--
-- ⚠️ A PARENT MAY WRITE IT, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT.
-- The family is the source of truth for a birthday and the club is not; making
-- it staff-write-only would mean every correction goes through a volunteer.
-- The consequence is faced squarely in the note on allowsOwnContact below.

begin;

create table if not exists public.player_private (
  -- ⚠️ THE PRIMARY KEY IS THE PLAYER. One row per child, so there is no way to
  -- hold two contradictory birthdays and no ordering question to get wrong.
  player_id     uuid primary key references public.players(id) on delete cascade,
  date_of_birth date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  -- Bounds rather than a format check. A future birthday and a 120-year-old
  -- under-12 are both typos, and both are worth refusing at the database rather
  -- than in a form that a second writer could bypass.
  constraint player_private_dob_sane
    check (date_of_birth is null
           or (date_of_birth > date '1900-01-01' and date_of_birth <= current_date))
);

comment on table public.player_private is
  'Per-player fields that must NOT be squad-readable. Separate from public.players '
  'because `player read` is squad-wide and RLS grants ROWS not COLUMNS, so a column '
  'here would show every parent in a squad every child''s date of birth. Admission '
  'rule: a field belongs in this table if a PARENT OF A TEAM-MATE must not see it. '
  'Anything they may see stays on public.players. Same reasoning as public.player_grades.';

alter table public.player_private enable row level security;

-- ⚠️ THE SAME PAIR AS player_parents, AND THE SYMMETRY IS THE POINT: the people
-- who may see a child's parents' phone numbers are exactly the people who may
-- see that child's birthday.
--
-- ⚠️ `is_own_player` COVERS BOTH A PARENT AND THE PLAYER THEMSELVES — it is
-- membership-based, so a self-registered 16-year-old reads their own row. That
-- is correct and is not a special case.
create policy "player private read" on public.player_private
  as permissive for select to public
  using (private.can_edit_team((select p.team_id from public.players p where p.id = player_private.player_id))
         or private.is_own_player(player_id));

-- WITH CHECK repeats the predicate deliberately. Without it an owner could
-- UPDATE their row and set player_id to another child, moving a birthday onto
-- somebody else's record — the exact trap `contact edit own` documents.
create policy "player private edit own" on public.player_private
  as permissive for all to public
  using (private.is_own_player(player_id))
  with check (private.is_own_player(player_id));

create policy "player private edit" on public.player_private
  as permissive for all to public
  using (private.can_edit_team((select p.team_id from public.players p where p.id = player_private.player_id)))
  with check (private.can_edit_team((select p.team_id from public.players p where p.id = player_private.player_id)));

-- ⚠️ NO TABLE-LEVEL GRANT IS WRITTEN HERE AND ONE IS STILL NEEDED. Supabase's
-- default privileges give `authenticated` SELECT/INSERT/UPDATE/DELETE on new
-- tables in `public`, which is why every other table in this schema carries no
-- explicit grant either. ⚠️ **VERIFY IT RATHER THAN ASSUMING IT** — read
-- information_schema.role_table_grants back after applying. A missing grant here
-- fails exactly like an RLS refusal on a policy that is working correctly, which
-- is the failure this project has now met three times.

commit;
