-- ══════════════════════════════════════════════════════════════════════════
--  ATTENDANCE — who actually turned up
--  10 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS EXISTS. Nothing in this database recorded whether a player attended
-- anything. `availability.status` is `in`/`out`/`maybe` — INTENT, collected
-- before the event — and it is the only thing resembling attendance data.
--
-- ⚠️ THAT DISTINCTION IS THE WHOLE POINT, and it was about to be blurred. The
-- brainstormed features — "17% attendance", "consecutive absences", "U14
-- forwards with lowest attendance", "everyone gets ≥20 minutes" — all read as
-- though the data exists. Built on `availability` they would report WHO SAID
-- THEY WOULD COME as WHO CAME, which is worse than not reporting it: it is a
-- confident number about a child's commitment, derived from a tickbox their
-- parent filled in a week earlier.
--
-- ⚠️ AND RSVP IS SWITCHED OFF. `FEATURES.availability` is false (29 Jul 2026 —
-- the club was not ready to rely on digital RSVP), so in practice the
-- `availability` table is empty of real intent anyway. Jay's ruling on 10 Aug
-- was to skip RSVP and go straight to attendance: ticking who turned up is
-- something coaches already do on paper, where RSVP asks several hundred
-- parents to change their behaviour first.
--
-- ⚠️ SO WHY A NEW TABLE RATHER THAN A COLUMN ON `availability`? The grain is
-- identical — (event, player) — and reusing it would inherit four working
-- policies. It is still wrong, because THE TWO FACTS HAVE DIFFERENT WRITE
-- AUTHORITIES:
--
--     availability   the player or their parent sets it     is_own_player
--     attendance     only a coach may set it                can_edit_team
--
-- One row with two different write authorities on different columns is a
-- column-level grant problem. This session spent an afternoon proving how
-- invisible those are: `profiles.email` is protected by a five-column
-- allow-list that appears in no policy, was captured by nothing until today,
-- and which the Supabase dashboard offers to delete in one click while calling
-- it an inconsistency (see db/schema/grants.sql §4). Choosing a second table
-- keeps this at ROW level, where the policies say what they mean and
-- `db/schema/policies.sql` can show you.
--
-- Separating them also means turning `FEATURES.availability` back on later
-- cannot disturb attendance, and vice versa.
--
-- ⚠️ `apply_migration` STRIPS `--` COMMENTS BEFORE EXECUTING, so none of this
-- reasoning reaches the database. This file is its only home — see
-- db/schema/README.md.

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id)  on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,

  -- present / absent / excused, and the third one is load-bearing rather than
  -- pastoral politeness. An attendance percentage is only honest if a player
  -- away on holiday, injured, or sitting an exam is not counted as having
  -- chosen not to come. Every downstream feature divides by
  -- present + absent and ignores excused; without this column the first
  -- "lowest attendance" list would rank the recently injured at the bottom.
  --
  -- Deliberately NOT 'late'. It is a fourth state everyone wants and nobody
  -- can define — is ten minutes late present? — and it complicates the
  -- percentage for no gain in the first season. Widening a CHECK is a
  -- one-line migration this repo has done before (roles_manager_and_medic
  -- widened two of them).
  status      text not null check (status in ('present','absent','excused')),

  -- Who took the register, for the "a coach says X, a parent disputes it"
  -- conversation. Null-able because a row could later be created by an import
  -- or an RPC rather than a person.
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),

  -- One record per player per event. Taking the register twice must correct
  -- the first answer, not append a second one — which is what makes the
  -- upsert in src/data/attendance.js safe.
  unique (event_id, player_id)
);

-- ⚠️ WIPE ORDER: both foreign keys CASCADE, deliberately. `invites` and
-- `invite_targets` are ON DELETE NO ACTION against `teams` and `players`, and
-- claude/state-of-play.md carries a wipe-order note because of it. Attendance
-- has no such requirement — a deleted event or player should take its register
-- rows with it — so cascading keeps it out of that ordering problem entirely.

-- Both are read paths that will exist from day one: the register loads every
-- row for ONE event, and a player's history loads every row for ONE player.
-- Added with the table rather than later: claude/state-of-play.md's note that
-- "an index on an empty table is pointless" is about re-measuring the UNUSED
-- ones, not about shipping a table with no index on its only two access paths.
create index if not exists attendance_event_id_idx  on public.attendance (event_id);
create index if not exists attendance_player_id_idx on public.attendance (player_id);

alter table public.attendance enable row level security;

-- ── READ ───────────────────────────────────────────────────────────────────
--
-- ⚠️ NOT `can_see_team`, AND THAT IS THE DELIBERATE PART. Every other read
-- policy on a team-scoped table uses it, so a parent sees the whole squad. For
-- attendance that would mean any parent could read which children miss
-- training and how often — a safeguarding-adjacent fact about someone else's
-- child, and the sort of thing that becomes touchline gossip.
--
-- So: staff see the squad, a parent sees their own child, and nobody else sees
-- anything. `is_own_player` is the same helper the player_contacts policy uses
-- for the same reason.
create policy "attendance read" on public.attendance
  for select using (
    private.can_edit_team((select e.team_id from public.events e where e.id = attendance.event_id))
    or private.is_own_player(player_id)
  );

-- ── WRITE ──────────────────────────────────────────────────────────────────
--
-- Coaches, managers, medics and admins only. A parent must never mark their
-- own child present: the whole value of the number is that somebody else
-- recorded it.
--
-- ⚠️ `private.can_edit_team` DOES NOT CHECK `status`, so a PENDING coach,
-- manager or medic would pass this. claude/state-of-play.md records it as
-- latent — no path currently creates a pending staff membership — and says it
-- belongs in its own change with its own harness. This policy inherits that
-- and does not fix it here; doing so quietly would change the meaning of every
-- other policy built on the same helper.
--
-- Split into three rather than FOR ALL, following the shape the availability
-- policy merge settled on 9 Aug: FOR ALL on a table a coach can write is how
-- you accidentally grant deletion alongside insertion.
create policy "attendance write insert" on public.attendance
  for insert with check (
    private.can_edit_team((select e.team_id from public.events e where e.id = attendance.event_id))
  );

create policy "attendance write update" on public.attendance
  for update using (
    private.can_edit_team((select e.team_id from public.events e where e.id = attendance.event_id))
  ) with check (
    private.can_edit_team((select e.team_id from public.events e where e.id = attendance.event_id))
  );

create policy "attendance write delete" on public.attendance
  for delete using (
    private.can_edit_team((select e.team_id from public.events e where e.id = attendance.event_id))
  );

-- ⚠️ NO EXPLICIT GRANTS HERE, AND THAT IS NOT AN OVERSIGHT. Supabase's default
-- privileges on `public` already hand `anon` and `authenticated` full table
-- rights on every table created in this schema — see db/schema/grants.sql §1.
-- Writing GRANT statements would add nothing except a second, drifting copy of
-- a fact the defaults already state. RLS above is the gate, which is exactly
-- why `enable row level security` on the line above is load-bearing and not
-- hygiene: without it this table is readable by anyone holding the project URL.
