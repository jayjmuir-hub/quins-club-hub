-- A/B/C tiers: on the fixture, and on the player.
-- Phase 2 of claude/plans/2026-08-14-tiers-and-game-time.md.
--
-- Jay, 14 Aug 2026: A/B/C are LEAGUE TIERS, and they are NOT the same thing as
-- ADHQ1/2/3 — "an age group might have their ADHQ1 team in the B or C league…
-- if they only have 1 team they might decide that team should not be in the A
-- league". Tournaments carry the same tiers. Only coaches and managers see the
-- player grading.
--
-- ══ WHY events.tier IS NOT DERIVED FROM league_team_id ═══════════════════════
--
-- ⚠️ THE OBVIOUS SHORTCUT IS WRONG, AND IT IS WRONG IN THE DIRECTION THAT
-- MATTERS. "tier = the division of the league team we entered" holds for a
-- league fixture by definition. It breaks for a tournament, which is exactly the
-- case Jay asked for: we may send our B team (ADHQ2) to an A-tier tournament.
-- Deriving would then record a B appearance for a match played at A level —
-- backwards for the eligibility the player grade exists to police.
--
-- So the tier is a column on the EVENT. The form PREFILLS it from the chosen
-- league team's division, because for a league fixture they agree and typing it
-- twice invites them to disagree; it stays editable because for a tournament
-- they need not agree. One column, one truth, a convenience prefill.
--
-- ⚠️ NULL IS A REAL ANSWER — a friendly has no tier and must not be counted as
-- one. The same rule competition_type's NULL already carries.

alter table public.events
  add column if not exists tier text;

alter table public.events
  drop constraint if exists events_tier_check;

alter table public.events
  add constraint events_tier_check
  check (tier is null or tier in ('A', 'B', 'C'));

-- The stored column comment (applied; reproduced here because apply_migration
-- strips `--` comments and this file is the reasoning, not the record).
comment on column public.events.tier is
  'A | B | C - the tier of the COMPETITION this fixture was played in, or NULL for a friendly and anything untiered. NOT DERIVED from league_team_id: for a league fixture the two agree and the form prefills this from the league team division, but we may send our B team (ADHQ2) to an A-tier tournament, and deriving would then record a B appearance for a match played at A level - exactly backwards for the eligibility the player grade exists to police.';

-- ══ WHY THE GRADE IS A TABLE AND NOT A COLUMN ON players ════════════════════
--
-- ⚠️ RLS GRANTS ROWS, NOT COLUMNS, AND A PARENT AND A COACH ARE THE SAME
-- `authenticated` ROLE. `player read` already lets a parent read their own child
-- and their squad, so a `tier` column on `public.players` could not be hidden
-- from parents by ANY mechanism this schema has — not a policy, and not a
-- column-level GRANT, because those are per-role and both are `authenticated`.
--
-- This is a judgement about a CHILD'S ABILITY, recorded in an app their parents
-- use. Jay: "only the coaches and managers would see tier grading". So it lives
-- in its own table with a coach-only policy, and ⚠️ IT MUST NEVER REACH THE
-- SHARED LINEUP IMAGE, which leaves the app entirely and can be forwarded on.
--
-- ⚠️ CONTRAST WITH players.unit, ADDED THE SAME DAY: forward-or-back IS a column
-- on players, and correctly so — it is the same class of information as
-- `position`, which parents already read on the roster. Do not reason from one
-- to the other.

create table if not exists public.player_grades (
  player_id  uuid        not null,
  tier       text        not null,
  -- Why, in the coach's words. Optional, and coach-only like the rest of the row.
  note       text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  -- One grade per player. A per-season history was considered and deferred:
  -- nothing yet asks "what was he graded last year", and a second key now would
  -- be a guess at how this club identifies a season.
  constraint player_grades_pkey primary key (player_id),
  constraint player_grades_player_id_fkey foreign key (player_id) references public.players(id) on delete cascade,
  constraint player_grades_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null,
  constraint player_grades_tier_check check (tier in ('A', 'B', 'C'))
);

comment on table public.player_grades is
  'Which tier a player is graded for, set by a coach. A SEPARATE TABLE AND NOT A COLUMN ON players, because RLS grants ROWS not COLUMNS and a parent and a coach are the same authenticated role - so a column on players could not be hidden from parents by any mechanism this schema has. This is a judgement about a CHILD ABILITY in an app their parents use: coach and manager only, and it must never reach the shared lineup image.';

alter table public.player_grades enable row level security;

-- ⚠️ ONE POLICY, FOR ALL, COACH-ONLY ON BOTH SIDES. There is deliberately NO
-- wider read arm: a parent must not be able to read their own child's grade
-- either, which is the entire point of the separate table.
drop policy if exists "player grade manage" on public.player_grades;
create policy "player grade manage" on public.player_grades
  for all
  using (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_grades.player_id))
  )
  with check (
    private.can_edit_team((select p.team_id from public.players p where p.id = player_grades.player_id))
  );

-- ⚠️ THE REVOKE IS LOAD-BEARING. Supabase's DEFAULT PRIVILEGES still grant anon
-- on a NEW table depending on which role creates it — measured in pg_default_acl
-- on 14 Aug 2026 — and the 14 Aug grants sweep only revoked EXISTING tables.
-- Fault-injected after applying: anon gets 42501, and an authenticated caller
-- with no membership gets zero rows from the policy and 42501 on a write.
revoke all on public.player_grades from anon;
grant select, insert, update, delete on public.player_grades to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='events' and column_name='tier') then
    raise exception 'FAILED: events.tier missing';
  end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='player_grades') then
    raise exception 'FAILED: player_grades missing';
  end if;
  if has_table_privilege('anon','public.player_grades','SELECT') then
    raise exception 'FAILED: anon can read player_grades';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='player_grades') <> 1 then
    raise exception 'FAILED: expected exactly one policy on player_grades';
  end if;
  raise notice 'guard passed';
end $$;
