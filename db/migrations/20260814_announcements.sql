-- ══════════════════════════════════════════════════════════════════════════
--  Notices — the club noticeboard, in-app only
--  14 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- Phase 1 of claude/plans/2026-08-14-notices.md. Jay, 14 Aug 2026: "ship 1",
-- meaning the in-app half of the comms brainstorm — a board, read receipts, and
-- the two safety controls in place BEFORE anything can send email.
--
-- ⚠️ THERE IS NO EMAIL IN THIS MIGRATION AND THAT IS THE POINT. The club moved
-- to Resend Pro on 13 Aug and the 100/day ceiling went with it — which removed a
-- brake nobody designed. Notice email waits for `email_outbox` and a
-- preferences/unsubscribe table (phase 2), so that the first feature capable of
-- mailing the whole club is built after the thing that can stop it. Do not add
-- a notify trigger here.
--
-- ⚠️ NO REALTIME EITHER. `events` joined the publication on 13 Aug and its
-- full-refetch-per-subscriber behaviour is explicitly the least-tested thing in
-- the app at the size Jay expects. A noticeboard does not need sub-second
-- delivery; adding it here would double an untested risk to buy nothing.
--
-- ⚠️ apply_migration STRIPS `--` COMMENTS BEFORE EXECUTING, so none of this
-- reasoning reaches the database. This file is the only copy.
--
-- ══ ⚠️ SCOPE IS A COLUMN, NEVER A SQUAD'S NAME ════════════════════════════
--
-- `team_id is null` means the whole club; a team id means that squad. The same
-- rule `teams.is_senior`, `teams.self_registration_allowed` and
-- `teams.scoring_kinds` already carry, and for the same reason: renaming a squad
-- must never change who receives something.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),

  -- ⚠️ Stamped by the trigger below, never sent by the client.
  club_id uuid not null references public.clubs(id) on delete cascade,

  -- ⚠️ NULL IS THE WHOLE CLUB — see the header. `on delete cascade` rather than
  -- `set null`: a squad notice whose squad has been deleted has no audience, and
  -- silently promoting it to a club-wide announcement is the worst of the three
  -- available outcomes.
  team_id uuid references public.teams(id) on delete cascade,

  -- ⚠️ Stamped by the trigger below, never sent by the client.
  author_id uuid not null references public.profiles(id) on delete cascade,

  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),

  -- Shown on the Home screen. The list screen shows everything.
  pinned boolean not null default false,

  -- ⚠️ NULLABLE, AND NULL MEANS FOREVER. Expiry is the thing that stops a
  -- noticeboard becoming a wall of stale paper, but a fixed default would
  -- silently delete-by-timeout a notice somebody meant to leave up.
  --
  -- ⚠️ EXPIRY IS NOT A POLICY CONCERN AND MUST NOT BECOME ONE. An expired notice
  -- stays readable — the author and every admin need to see what was sent, and a
  -- read receipt on a row nobody can select is a screen that renders nothing.
  -- The CLIENT hides expired notices from the board. If that ever moves into the
  -- read policy, the receipts screen breaks and it will look like a data loss.
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz
);

alter table public.announcements enable row level security;

-- ⚠️ NO `(club_id, created_at)` INDEX, DELIBERATELY, AND THE REASON IS ON FILE.
-- `events_club_starts_idx` was added on 13 Aug for exactly this shape and does
-- NOT serve the path it was added for: the client sends no `club_id` predicate
-- (one club), and the read policy filters on team membership rather than on
-- `club_id`, so the index's leading column is unconstrained and Postgres cannot
-- use it. `db/migrations/20260813_events_starts_index.sql` is the fix and this
-- is the same shape — so the ordering index leads on `created_at`.
create index if not exists announcements_created_idx
  on public.announcements (created_at desc, id);

-- The squad-scoped read, which DOES carry a predicate on the leading column.
create index if not exists announcements_team_created_idx
  on public.announcements (team_id, created_at desc);

-- ---------------------------------------------------------------------
-- Who read what.
--
-- ⚠️ THE PRIMARY KEY IS THE DEDUPLICATION. Marking a notice read twice is the
-- normal case — opening the board again does it — so this must be an upsert
-- target rather than something the client is trusted to call once.
-- ---------------------------------------------------------------------
create table if not exists public.announcement_reads (
  announcement_id uuid not null
    references public.announcements(id) on delete cascade,
  profile_id uuid not null
    references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

alter table public.announcement_reads enable row level security;

-- "Which of these have I read" — the unread badge. The PK already covers
-- (announcement_id, profile_id); this covers the other direction.
create index if not exists announcement_reads_profile_idx
  on public.announcement_reads (profile_id);

-- ══════════════════════════════════════════════════════════════════════════
--  Provenance
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ IT OVERWRITES RATHER THAN DEFAULTS, exactly as
-- private.set_social_idea_provenance does. Assigning only when null leaves a
-- caller able to supply their own author id, which is the entire hole this
-- closes: a policy authorises a ROW, it does not stop a client putting somebody
-- else's uuid in the payload.
--
-- ⚠️ `club_id` COMES FROM THE TEAM WHEN THERE IS ONE, and from the caller's own
-- membership only for a club-wide notice. Deriving it from the caller in both
-- cases would let a person with memberships in two clubs post into the wrong
-- one — not reachable today (one club), and the cheap version is also the
-- correct one.
create or replace function private.set_announcement_provenance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _club uuid;
begin
  if new.team_id is not null then
    select t.club_id into _club from teams t where t.id = new.team_id;
    if _club is null then
      raise exception 'unknown squad' using errcode = '42501';
    end if;
  else
    select m.club_id into _club
      from memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
     group by m.club_id
     limit 1;
    if _club is null then
      raise exception 'no active membership' using errcode = '42501';
    end if;
  end if;

  new.author_id  := auth.uid();
  new.club_id    := _club;
  new.created_at := now();
  new.updated_at := null;

  return new;
end;
$$;

drop trigger if exists announcements_provenance on public.announcements;
create trigger announcements_provenance
  before insert on public.announcements
  for each row execute function private.set_announcement_provenance();

-- ⚠️ A TRIGGER RATHER THAN A GRANTED COLUMN. `updated_at` is deliberately
-- absent from the column grants below, so an edit cannot claim not to have
-- happened — which is the only thing this column is for.
create or replace function private.touch_announcement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  -- Belt to the grant's braces: neither of these is grantable for UPDATE, so
  -- this cannot fire in practice. It is here so that restoring a grant by
  -- accident does not silently make authorship editable.
  new.author_id  := old.author_id;
  new.club_id    := old.club_id;
  new.team_id    := old.team_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch
  before update on public.announcements
  for each row execute function private.touch_announcement();

-- ══════════════════════════════════════════════════════════════════════════
--  RLS — announcements
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ THE READ GATE IS `can_see_team`, NOT `is_attached_to_team` ══════════
--
-- The two differ in exactly one way: `can_see_team` requires `status = 'active'`
-- and `is_attached_to_team` does not. `event read` uses the loose one, because
-- 20260808_membership_pending_status.sql ruled that "fixtures are not sensitive,
-- and a pending parent needs them to be worth signing in at all".
--
-- A notice is not a fixture, and there are TWO reasons — the second is the one
-- that is specific to this feature:
--
--   1. A fixture is a FACT about the squad. A notice is somebody's words,
--      addressed to a group. `my_squad_staff` drew the same line on 13 Aug.
--
--   2. ⚠️ THE AUDIENCE COUNT IS A FEATURE, AND IT HAS TO MEAN SOMETHING. The
--      receipts screen says "18 of 24". If pending members could read notices,
--      the denominator would include accounts nobody has approved — so a coach
--      chasing the six who have not read it would be chasing strangers. The set
--      that can READ a notice and the set counted as its AUDIENCE must be the
--      same set, and `announcement_audience` below is built to match this
--      policy line for line. Change one, change both.
--
-- ⚠️ SO A PENDING PARENT SEES AN EMPTY BOARD, NOT A REFUSAL. Correct, and the
-- client renders an empty state rather than an error.
drop policy if exists "announcement read" on public.announcements;
create policy "announcement read" on public.announcements
  for select using (
    case
      when team_id is null then exists (
        select 1 from memberships m
         where m.profile_id = (select auth.uid())
           and m.club_id = announcements.club_id
           and m.status = 'active'
      )
      else private.can_see_team(team_id)
    end
  );

-- ══ ⚠️ WHO MAY POST, AND WHY IT IS NOT AN ADMIN RIGHT ══════════════════════
--
-- A club-wide notice needs `private.is_admin`. A squad notice needs
-- `private.can_edit_team`, which is admin club-wide OR coach/manager/medic OF
-- THAT SQUAD, and requires `status = 'active'` (made status-aware 11 Aug).
--
-- ⚠️ NOT ONE OF THE THREE ADMIN RIGHTS. Those gate SCREENS, not data
-- (claude/decisions/2026-08-10-role-dashboards.md), and every one of them can
-- only be held by an admin at all. A coach who is not an admin holds none and
-- never can — so gating this on a right would mean the one person who actually
-- needs to tell their squad where to meet on Friday could not.
--
-- ⚠️ MEDIC IS INCLUDED, BY INHERITANCE FROM can_edit_team RATHER THAN BY
-- CHOICE. If that is ever wrong, the fix is `private.can_approve_team` — which
-- exists precisely because Jay excluded medic from approvals on 9 Aug — and NOT
-- a new list here.
drop policy if exists "announcement create" on public.announcements;
create policy "announcement create" on public.announcements
  for insert with check (
    author_id = (select auth.uid())
    and case
      when team_id is null then private.is_admin(club_id)
      else private.can_edit_team(team_id)
    end
  );

-- ⚠️ THE `with check` IS NOT THE SAME AS THE `using`, AND THE DIFFERENCE IS THE
-- WHOLE POINT. `using` decides which rows may be edited; `with check` decides
-- what they may become. Without the second arm an author could edit a row into
-- a shape they were never allowed to create.
drop policy if exists "announcement edit" on public.announcements;
create policy "announcement edit" on public.announcements
  for update using (
    author_id = (select auth.uid())
    or private.is_admin(club_id)
  )
  with check (
    case
      when team_id is null then private.is_admin(club_id)
      else private.can_edit_team(team_id)
    end
  );

-- ⚠️ TWO DELETERS, SAME SHAPE AS `social idea remove`: the author withdrawing
-- their own, and an admin — who is the only real control over something posted
-- to a children's squad that should not have been.
--
-- ⚠️ UNLIKE social_ideas THERE IS NO `status = 'new'` CONDITION on the author
-- arm. An idea stops being withdrawable once the manager has actioned it; a
-- notice has no such state, and an author who posted the wrong thing to thirty
-- families must be able to take it down at 8pm without finding an admin.
drop policy if exists "announcement remove" on public.announcements;
create policy "announcement remove" on public.announcements
  for delete using (
    author_id = (select auth.uid())
    or private.is_admin(club_id)
  );

-- ══════════════════════════════════════════════════════════════════════════
--  Column grants — announcements
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POLICIES AUTHORISE THE ROW; GRANTS AUTHORISE THE COLUMN. "announcement
-- edit" is FOR UPDATE over the whole row, so without this an admin fixing a typo
-- is also authorised to reassign authorship.
--
-- ⚠️ `team_id` IS NOT GRANTABLE FOR UPDATE, AND THAT IS THE IMPORTANT ONE. A
-- notice's audience is fixed when it is posted. Without this, a squad notice
-- that thirty people have already read could be widened to the whole club after
-- the fact — the read receipts would then be counted against an audience that
-- never saw it, and nobody looking at the row afterwards could tell.
revoke update on public.announcements from authenticated;
grant update (title, body, pinned, expires_at)
  on public.announcements to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
--  RLS — announcement_reads
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A MEMBER READS AND WRITES ONLY THEIR OWN ROW. Nobody reads anyone else's
-- through this table at all: the receipts screen goes through
-- `announcement_audience` below, which is SECURITY DEFINER with a fixed column
-- list. That is the same mechanism `my_squad_staff` uses and for the same
-- reason — a policy wide enough to show a coach who has read something is a
-- policy on rows, and the receipts screen needs NAMES, which live on `profiles`
-- alongside `email` and `phone`.
drop policy if exists "announcement read own reads" on public.announcement_reads;
create policy "announcement read own reads" on public.announcement_reads
  for select using (profile_id = (select auth.uid()));

-- ⚠️ NO VISIBILITY CHECK HERE, DELIBERATELY, AND IT IS SAFE FOR A SPECIFIC
-- REASON. A caller could insert a read row for a notice they cannot see. It
-- leaks nothing — they already knew the id they sent — and it cannot inflate a
-- count, because `announcement_stats` counts only read rows belonging to the
-- notice's actual audience. Enforcing it here instead would mean a policy
-- subquery against `announcements`, whose own RLS then applies inside a policy
-- expression: correct today, and a subtlety that is one refactor away from
-- being wrong in a direction nobody would notice.
drop policy if exists "announcement mark read" on public.announcement_reads;
create policy "announcement mark read" on public.announcement_reads
  for insert with check (profile_id = (select auth.uid()));

-- ⚠️ NO UPDATE AND NO DELETE POLICY, so there are none — a read cannot be
-- un-read. `read_at` is therefore first-read, not last-read, which is what the
-- word means. The client upserts with `ignoreDuplicates`.
revoke update on public.announcement_reads from authenticated;

-- ══════════════════════════════════════════════════════════════════════════
--  Read receipts — two SECURITY DEFINER functions
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ AUDIENCE IS NOT READERSHIP ═════════════════════════════════════════
--
-- Both functions define the audience of a notice as:
--
--     club-wide  ->  every ACTIVE membership in the club
--     squad      ->  every ACTIVE membership on that squad
--
-- A club admin can READ a squad notice (`can_see_team` has an admin arm) and is
-- NOT counted in its audience. That is deliberate: "18 of 24" must mean the
-- families the coach was talking to, not everyone with permission to look. The
-- read policy and this definition agree on membership STATUS, which is the half
-- that has to match; they differ on the admin arm, which is the half that must
-- not.
--
-- ══ ⚠️ `distinct m.profile_id` IS LOAD-BEARING ════════════════════════════
--
-- A parent with two children in the same squad holds TWO active membership
-- rows. Counting rows rather than people would report an audience of 26 for a
-- squad of 24 and could report 25 of 26 seen when everybody had read it.
-- db/tests/announcements.sql injects exactly that fault.

-- ---------------------------------------------------------------------
-- Per-notice counts for the list screen. One call, not one per notice.
--
-- ⚠️ THE `where` CLAUSE IS THE GATE. SECURITY DEFINER bypasses RLS, so this
-- line is the only thing standing between any member and the club's whole
-- notice history. Author or admin, nobody else.
-- ---------------------------------------------------------------------
create or replace function public.announcement_stats()
returns table (
  announcement_id uuid,
  audience_count integer,
  seen_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    (select count(distinct m.profile_id)::integer
       from memberships m
      where m.status = 'active'
        and m.club_id = a.club_id
        and (a.team_id is null or m.team_id = a.team_id)),
    (select count(distinct r.profile_id)::integer
       from announcement_reads r
      where r.announcement_id = a.id
        and exists (
          select 1 from memberships m
           where m.profile_id = r.profile_id
             and m.status = 'active'
             and m.club_id = a.club_id
             and (a.team_id is null or m.team_id = a.team_id)
        ))
  from announcements a
  where a.author_id = auth.uid()
     or private.is_admin(a.club_id);
$function$;

-- ---------------------------------------------------------------------
-- Who is in the audience, and when each of them read it.
--
-- ⚠️ THE COLUMN LIST IS THE SECURITY BOUNDARY — NAME ONLY. No email, no phone,
-- no role, no membership id. This is deliberately NARROWER than
-- `my_squad_staff`, which does return contact details, and the difference is
-- consent: Jay ruled on 13 Aug that staff opt in to being contactable when they
-- accept the position. A parent opted into nothing of the kind, and "who has not
-- read my notice" is not a reason to hand their phone number to every coach.
--
-- ⚠️ ADDING A COLUMN TO THE `returns table` BELOW IS THE ONLY WAY ONE COULD EVER
-- APPEAR, which is the property that makes this shape safe. If a future session
-- wants "email the six who haven't", that is phase 2 and it goes through
-- `email_outbox` server-side — it does NOT mean putting addresses in here.
-- ---------------------------------------------------------------------
create or replace function public.announcement_audience(_announcement uuid)
returns table (
  profile_id uuid,
  full_name text,
  read_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.profile_id, s.full_name, s.read_at
  from (
    select distinct on (m.profile_id)
           m.profile_id,
           p.full_name,
           r.read_at
      from announcements a
      join memberships m
        on m.club_id = a.club_id
       and m.status = 'active'
       and (a.team_id is null or m.team_id = a.team_id)
      join profiles p on p.id = m.profile_id
      left join announcement_reads r
        on r.announcement_id = a.id
       and r.profile_id = m.profile_id
     where a.id = _announcement
       and (a.author_id = auth.uid() or private.is_admin(a.club_id))
     -- ⚠️ `nulls last` so that the row kept per person is a READ one when any
     -- exists. Without it a duplicate membership could keep the unread side and
     -- report somebody as not having read something they did.
     order by m.profile_id, r.read_at nulls last
  ) s
  -- Unread first: the whole point of the screen is the people who have not seen
  -- it, and a coach should not have to scroll past the ones who have.
  order by (s.read_at is not null), s.full_name;
$function$;

-- ══ ⚠️ `revoke … from public` DOES NOT KEEP `anon` OUT. MEASURED 13 Aug. ═══
--
-- Supabase ships `alter default privileges in schema public grant all on
-- functions to anon, authenticated, service_role` — a grant to `anon` BY NAME,
-- which revoking from the `PUBLIC` pseudo-role does not touch. Six existing
-- functions in this schema are reachable by `anon` for exactly that reason and
-- are safe only by their bodies. The explicit `from anon` below is therefore
-- load-bearing, not belt-and-braces. See db/migrations/20260813_my_squad_staff.sql.
revoke execute on function public.announcement_stats() from public;
revoke execute on function public.announcement_stats() from anon;
grant execute on function public.announcement_stats() to authenticated;

revoke execute on function public.announcement_audience(uuid) from public;
revoke execute on function public.announcement_audience(uuid) from anon;
grant execute on function public.announcement_audience(uuid) to authenticated;
