-- ══════════════════════════════════════════════════════════════════════════
--  Pitch share approvals — "this overload is fine, leave it be"
--  30 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- Pitch portions turned a double booking into a capacity question: a quarter
-- beside a half is a clean share, three halves is a clash (see
-- db/migrations/20260829_pitch_portion.sql and src/data/pitches.js). Portions
-- make the everyday share stop nagging on their own — but a genuine overload is
-- SOMETIMES fine anyway: two small groups really do squeeze onto one quarter, a
-- one-off festival packs a pitch for a morning. This table lets an admin say so,
-- and the clash marker clears.
--
-- ⚠️ KEYED TO THE EXACT SET OF BOOKINGS, NOT TO A PITCH OR A DAY. `share_key` is
-- the involved events' ids, sorted and comma-joined — the same key
-- findPitchClashes' cohort produces. So the approval covers THIS overload and
-- nothing else: add a fourth squad to the pitch and the cohort's id-set changes,
-- the key no longer matches, and the new, larger overload flags again. That
-- re-flag on change is the whole point — an approval must not be a way to switch
-- the detector off, only to say "these ones, right now, are fine".
--
-- ⚠️ THE APPROVAL IS A UI SIGNAL, NOT A PERMISSION. Nothing in the database
-- reads it; it only stops the clash MARKER showing. events.pitch and
-- events.pitch_portion remain the answer, exactly as the pitch_requests header
-- says of its own workflow table.

create table if not exists public.pitch_share_approvals (
  -- The involved event ids, sorted ascending and joined with ',' — computed by
  -- shareKey() in src/data/pitchShareApprovals.js. One row per approved cohort.
  share_key text primary key,

  -- Which club's admin may touch it. Carried on the row so the RLS below can
  -- gate on private.is_admin(club_id) without unpacking the key back into events.
  club_id uuid not null references public.clubs(id) on delete cascade,

  -- Who said it was fine, for the "approved by …" line, kept if they later leave.
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz not null default now()
);

alter table public.pitch_share_approvals enable row level security;

-- READ: the same audience that sees the occupancy view — active pitch staff and
-- admins. An approval clears a warning, so hiding it from the staff who see the
-- clash would leave them looking at one that has been resolved. The EXISTS is
-- the same shape pitch_occupancy inlines, and for the same reason: "staff
-- anywhere" has few enough callers not to earn a private helper yet.
drop policy if exists "share approval read" on public.pitch_share_approvals;
create policy "share approval read" on public.pitch_share_approvals
  for select using (
    exists (
      select 1 from memberships m
      where m.profile_id = auth.uid()
        and m.status = 'active'
        and (m.role = 'admin'
             or (m.role in ('coach','manager','medic') and m.team_id is not null))
    )
  );

-- WRITE: only an active admin of the club may say an overload is fine — and only
-- in their own name (approved_by = auth.uid()), so a row cannot be attributed to
-- someone else. This is private.is_admin, NOT the narrower `pitches` admin right,
-- matching the pitch_requests "decide" policy on purpose: the same people who
-- allocate a pitch are the ones who clear a sharing clash.
drop policy if exists "share approval create" on public.pitch_share_approvals;
create policy "share approval create" on public.pitch_share_approvals
  for insert with check (private.is_admin(club_id) and approved_by = auth.uid());

-- Undoing an approval is the same right as making one.
drop policy if exists "share approval delete" on public.pitch_share_approvals;
create policy "share approval delete" on public.pitch_share_approvals
  for delete using (private.is_admin(club_id));

-- ⚠️ REVOKE anon FIRST, because Supabase's default privileges already GRANTED
-- anon everything at `create table`, and a GRANT cannot take that back — only a
-- REVOKE can (the lesson push_subscriptions and the photo tables learned the
-- hard way; see db/schema/grants.sql). anon has no business here even though RLS
-- would deny it anyway: grants are the ceiling, RLS is the gate, and the ceiling
-- should not be open on a table anon never touches.
revoke all on public.pitch_share_approvals from anon;
grant select, insert, delete on public.pitch_share_approvals to authenticated;
