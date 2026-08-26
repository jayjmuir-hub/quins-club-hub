-- 27 Aug 2026 — coaches build their own training plans.
--
-- Extends the Rugby Performance Director's admin-only training feature
-- (20260821_training_plans.sql) so a coach or team manager can: build a
-- session plan for their own squad (freestyle or seeded from a template),
-- choose who sees it (draft/staff/squad), keep their own squad-private
-- drills and templates, and SUGGEST one to the club library for the
-- Director to approve. Plan: claude/plans/2026-08-27-coach-training-plans.md.
-- Rulings: claude/decisions/2026-08-27-coach-training-plans.md.
--
-- ⚠️ SAFE ON THE EXISTING DATA. Every new column is nullable or carries a
-- default that reproduces today's behaviour: drills/templates keep team_id
-- NULL (the club library), and training_sessions.visibility defaults to
-- 'squad' — so every Director-published plan a family sees today keeps being
-- seen. Nothing is backfilled.

begin;

-- ── new columns ─────────────────────────────────────────────────────────
-- team_id NULL = the club library (the Director's). Set = one squad's own,
-- built by its coach. submitted_at is a coach's request to promote a
-- squad-owned row into the club library; the Director approves by nulling
-- team_id (see the manage policy) or dismisses by clearing submitted_at.
alter table public.drills
  add column if not exists team_id uuid references public.teams(id) on delete cascade,
  add column if not exists submitted_at timestamptz;
comment on column public.drills.team_id is
  'NULL = the club-wide library (Rugby Performance Director). Set = one squad''s own drill, managed by its coaches. Only an admin may null it (approve a suggestion).';

alter table public.session_templates
  add column if not exists team_id uuid references public.teams(id) on delete cascade,
  add column if not exists submitted_at timestamptz;
comment on column public.session_templates.team_id is
  'NULL = a club template. Set = one squad''s own, managed by its coaches. Same approve-by-nulling rule as drills.team_id.';

-- visibility DEFAULT 'squad' so every existing row and every future
-- publish_training insert is family-visible exactly as before. created_by is
-- the author, and it is what makes 'draft' mean "only me".
alter table public.training_sessions
  add column if not exists visibility text not null default 'squad'
    check (visibility in ('draft','staff','squad')),
  add column if not exists created_by uuid references public.profiles(id);
-- ⚠️ DEFAULT auth.uid() so the CLIENT never has to send the author. Postgres
-- applies column defaults BEFORE the RLS WITH CHECK, so a coach's draft insert
-- satisfies `created_by = auth.uid()` without the app knowing its own id — and
-- SessionPlan needs no auth provider to build a plan. publish_training is
-- SECURITY DEFINER (owner), so its inserts default to the calling Director,
-- which is harmless on a squad-visible row.
alter table public.training_sessions
  alter column created_by set default auth.uid();
comment on column public.training_sessions.visibility is
  'draft = the created_by author only; staff = can_edit_team (coaches/managers/admin); squad = is_attached_to_team (the squad and its families). publish_training writes the default squad.';

-- ── drills: a coach manages their OWN squad's drills ────────────────────
-- Read stays open (a drill holds no personal data, and a squad-owned drill
-- appears inside a family-visible session plan, so its row must be readable —
-- see the plan). Manage widens: the Director (is_admin) manages club drills
-- AND can null a team_id to approve a suggestion; a coach manages a drill
-- that belongs to a squad they can edit. A coach cannot null team_id (the
-- WITH CHECK's is_admin arm is the only one true for a null-team row), so a
-- coach cannot self-promote into the club library.
drop policy if exists "drill manage" on public.drills;
create policy "drill manage" on public.drills for all
  using (
    private.is_admin(club_id)
    or (team_id is not null and private.can_edit_team(team_id))
  )
  with check (
    private.is_admin(club_id)
    or (team_id is not null and private.can_edit_team(team_id))
  );

drop policy if exists "template manage" on public.session_templates;
create policy "template manage" on public.session_templates for all
  using (
    private.is_admin(club_id)
    or (team_id is not null and private.can_edit_team(team_id))
  )
  with check (
    private.is_admin(club_id)
    or (team_id is not null and private.can_edit_team(team_id))
  );

drop policy if exists "template block manage" on public.session_template_blocks;
create policy "template block manage" on public.session_template_blocks for all
  using (exists (
    select 1 from public.session_templates t
     where t.id = template_id
       and (private.is_admin(t.club_id)
            or (t.team_id is not null and private.can_edit_team(t.team_id)))))
  with check (exists (
    select 1 from public.session_templates t
     where t.id = template_id
       and (private.is_admin(t.club_id)
            or (t.team_id is not null and private.can_edit_team(t.team_id)))));

-- ── training_sessions: visibility-aware read and manage ─────────────────
-- Read: a family sees a 'squad' session (unchanged for every existing row);
-- staff of the squad see 'staff' too; the author alone sees their 'draft'.
-- Manage: you must be able to edit the squad, and a draft is the author's
-- alone until they promote it. publish_training is SECURITY DEFINER owned by
-- postgres and bypasses all of this.
-- ⚠️ THE SESSION'S OWN COLUMNS ARE QUALIFIED `training_sessions.*`. `events`
-- carries a `created_by` of its own, so an UNQUALIFIED `created_by` inside
-- this subquery binds to the EVENT's creator, not the session's — a draft
-- would then be readable by nobody and creatable by nobody (measured 27 Aug
-- 2026, a refused insert with every part apparently true). Qualify to bind to
-- the row the policy is actually about.
drop policy if exists "session read" on public.training_sessions;
create policy "session read" on public.training_sessions for select
  using (exists (
    select 1 from public.events e
     where e.id = training_sessions.event_id
       and (
         (training_sessions.visibility = 'squad' and private.is_attached_to_team(e.team_id))
         or (training_sessions.visibility = 'staff' and private.can_edit_team(e.team_id))
         or (training_sessions.visibility = 'draft' and training_sessions.created_by = (select auth.uid()))
       )));

drop policy if exists "session manage" on public.training_sessions;
create policy "session manage" on public.training_sessions for all
  using (exists (
    select 1 from public.events e
     where e.id = training_sessions.event_id
       and private.can_edit_team(e.team_id)
       and (training_sessions.visibility <> 'draft' or training_sessions.created_by = (select auth.uid()))))
  with check (exists (
    select 1 from public.events e
     where e.id = training_sessions.event_id
       and private.can_edit_team(e.team_id)
       and (training_sessions.visibility <> 'draft' or training_sessions.created_by = (select auth.uid()))));

drop policy if exists "session block read" on public.training_session_blocks;
create policy "session block read" on public.training_session_blocks for select
  using (exists (
    select 1 from public.training_sessions s
      join public.events e on e.id = s.event_id
     where s.id = session_id
       and (
         (s.visibility = 'squad' and private.is_attached_to_team(e.team_id))
         or (s.visibility = 'staff' and private.can_edit_team(e.team_id))
         or (s.visibility = 'draft' and s.created_by = (select auth.uid()))
       )));

drop policy if exists "session block manage" on public.training_session_blocks;
create policy "session block manage" on public.training_session_blocks for all
  using (exists (
    select 1 from public.training_sessions s
      join public.events e on e.id = s.event_id
     where s.id = session_id
       and private.can_edit_team(e.team_id)
       and (s.visibility <> 'draft' or s.created_by = (select auth.uid()))))
  with check (exists (
    select 1 from public.training_sessions s
      join public.events e on e.id = s.event_id
     where s.id = session_id
       and private.can_edit_team(e.team_id)
       and (s.visibility <> 'draft' or s.created_by = (select auth.uid()))));

commit;
