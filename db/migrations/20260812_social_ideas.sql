-- ══════════════════════════════════════════════════════════════════════════
--  Social post ideas — any member submits, the manager marks and removes
--  12 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 12 Aug 2026: "give club members the ability to submit potential social
-- post ideas to the social manager, they would click something that would open
-- a form they could fill out with details and drop a photo into themselves",
-- and then "give the manager the ability to mark things and remove them".
--
-- ⚠️ WHAT THIS IS NOT. It does NOT touch `player-photos`. The obvious build —
-- offer the roster photos every admin can already see — was ruled out by Jay
-- before it was proposed. Seeing a child's photo on the roster and putting it
-- on Instagram are different acts needing different consent. Everything here is
-- submitter-chosen. See claude/decisions/2026-08-12-social-media-management.md.
--
-- ⚠️ SHAPED ON public.pitch_requests DELIBERATELY, including its reasoning, so
-- this club has one workflow pattern rather than two. Read that migration
-- before changing this one.
--
-- ⚠️ NO UNIQUE CONSTRAINT, and that is the one place it deliberately DIFFERS
-- from pitch_requests. One request per fixture is right for a pitch — a second
-- is the same question asked twice. Ideas are the opposite: five people sending
-- photos of the same match is the feature working.
--
-- ⚠️ apply_migration STRIPS `--` COMMENTS BEFORE EXECUTING, so none of this
-- reasoning reaches the database. This file is the only copy.

-- ---------------------------------------------------------------------
-- The owner of a submitted image, parsed from its object key.
-- Keys are `<profile_id>/<uuid>.<ext>`, so the first segment is the submitter.
--
-- ⚠️ Mirrors private.photo_player/photo_team, which do the same job for
-- `player-photos`. A storage policy has nothing but the key to work with.
-- ---------------------------------------------------------------------
create or replace function private.social_idea_owner(_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(_name, '/', 1), '')::uuid
$$;

grant execute on function private.social_idea_owner(text) to authenticated;

create table if not exists public.social_ideas (
  id uuid primary key default gen_random_uuid(),

  -- ⚠️ Set by the trigger below, never by the client.
  club_id uuid not null references public.clubs(id) on delete cascade,

  -- ⚠️ NULLABLE, and `set null` rather than `cascade`. The event link is
  -- OPTIONAL (Jay's ruling: "either"), and an idea outlives the fixture it was
  -- about — deleting a cancelled match must not silently destroy the photo
  -- somebody sent in.
  event_id uuid references public.events(id) on delete set null,

  submitted_by uuid not null references public.profiles(id) on delete cascade,

  -- What they want said. Free text on purpose: the whole point is the things a
  -- form cannot anticipate.
  body text not null check (length(btrim(body)) > 0),

  -- Object key in the PRIVATE `social-ideas` bucket. Null is normal — an idea
  -- without a picture is still an idea.
  photo_path text,

  -- ⚠️ COMPUTED BY THE TRIGGER FROM THE SUBMITTER'S OWN MEMBERSHIP, NEVER SENT
  -- BY THE CLIENT. A policy authorises a ROW; it does not stop a caller putting
  -- `from_staff: true` in the payload. Same class of hole as memberships.is_super,
  -- which needed a column grant plus an RPC for exactly this reason.
  from_staff boolean not null default false,

  -- ⚠️ A CHECK rather than an enum, matching memberships.status and
  -- pitch_requests.status — adding a state stays a one-line migration.
  status text not null default 'new'
    check (status in ('new', 'used', 'dismissed')),

  decision_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.social_ideas enable row level security;

create index if not exists social_ideas_status_idx
  on public.social_ideas (club_id, status, created_at desc);

create index if not exists social_ideas_event_idx
  on public.social_ideas (event_id);

-- ---------------------------------------------------------------------
-- Provenance: who sent it, from which club, and whether they are staff.
--
-- ⚠️ SECURITY DEFINER because it reads `memberships` to classify the submitter.
-- A parent can read their own membership row, so INVOKER would mostly work —
-- but "mostly" is the wrong guarantee for the value that decides how the
-- manager triages, and a pending or oddly-scoped row should not be able to
-- change the answer by being unreadable.
--
-- ⚠️ IT OVERWRITES RATHER THAN DEFAULTS. Assigning from NEW.* only when null
-- would leave a caller able to supply their own — which is the entire hole this
-- exists to close.
-- ---------------------------------------------------------------------
create or replace function private.set_social_idea_provenance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _club uuid;
  _staff boolean;
begin
  select m.club_id,
         bool_or(m.role in ('admin', 'coach', 'manager', 'medic'))
    into _club, _staff
    from memberships m
   where m.profile_id = auth.uid()
     and m.status = 'active'
   group by m.club_id
   limit 1;

  if _club is null then
    raise exception 'no active membership' using errcode = '42501';
  end if;

  new.submitted_by := auth.uid();
  new.club_id      := _club;
  new.from_staff   := coalesce(_staff, false);

  -- A submission always starts new, whatever was sent.
  new.status       := 'new';
  new.decided_by   := null;
  new.decided_at   := null;
  new.decision_note := null;

  return new;
end;
$$;

drop trigger if exists social_ideas_provenance on public.social_ideas;
create trigger social_ideas_provenance
  before insert on public.social_ideas
  for each row execute function private.set_social_idea_provenance();

-- ══════════════════════════════════════════════════════════════════════════
--  RLS
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ READING IS `is_admin`, NOT THE `media` RIGHT. Those rights gate SCREENS,
-- not data (claude/decisions/2026-08-10-role-dashboards.md). The right decides
-- who is SHOWN the inbox.
--
-- ⚠️ OBSERVED, NOT ASSUMED: private.is_admin(club) tests `role = 'admin'` and
-- does NOT test status, unlike private.can_edit_team which was made
-- status-aware on 10 Aug. Every admin-gated table already relies on it, so this
-- one stays consistent rather than quietly diverging. If is_admin is ever
-- status-gated, this table comes along for free.

-- The submitter sees their own, an admin sees the club's.
-- ⚠️ THE SUBMITTER ARM IS A REQUIREMENT, NOT A COURTESY. Without it the
-- feature is a black hole: you submit into silence and never learn whether it
-- was used. Same reasoning as "pitch request read".
drop policy if exists "social idea read" on public.social_ideas;
create policy "social idea read" on public.social_ideas
  for select using (
    submitted_by = auth.uid()
    or private.is_admin(club_id)
  );

-- ⚠️ ANY ACTIVE MEMBER, which is wider than pitch_requests on purpose: a
-- parent with a good photo is exactly who this is for. The trigger has already
-- forced submitted_by, club_id and from_staff by the time this runs, so the
-- check below is a belt to that braces — it cannot pass for a row the trigger
-- did not stamp.
drop policy if exists "social idea create" on public.social_ideas;
create policy "social idea create" on public.social_ideas
  for insert with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from memberships m
       where m.profile_id = auth.uid()
         and m.club_id = social_ideas.club_id
         and m.status = 'active'
    )
  );

-- ⚠️ MARKING IS ADMIN-ONLY. The submitter must not be able to mark their own
-- idea used — the manager decides what gets posted. Column grants below stop
-- this policy from also authorising a rewrite of the submitter's words.
drop policy if exists "social idea decide" on public.social_ideas;
create policy "social idea decide" on public.social_ideas
  for update using (private.is_admin(club_id))
  with check (private.is_admin(club_id));

-- ⚠️ TWO DELETERS, AND THEY ARE DIFFERENT POWERS.
--   * the submitter, while still `new` — withdrawing something they sent. A
--     DELETE rather than a status write because widening UPDATE to them would
--     also let them write `status = 'used'`. Once actioned this stops applying.
--   * an ADMIN, always — Jay, 12 Aug: "give the manager the ability to mark
--     things and remove them". This is the only real control over an
--     inappropriate photo: the consent line on the form is a prompt, and
--     merely declining to post leaves the image in club storage forever.
--
-- ⚠️ DELETING THE ROW DOES NOT DELETE THE IMAGE. `delete from storage.objects`
-- raises 42501 — storage cannot be cleared by SQL. The app removes the object
-- FIRST and deletes the row only if that succeeded; row-first leaves an
-- orphaned image nobody can reach, which is the exact file being removed.
drop policy if exists "social idea remove" on public.social_ideas;
create policy "social idea remove" on public.social_ideas
  for delete using (
    (submitted_by = auth.uid() and status = 'new')
    or private.is_admin(club_id)
  );

-- ══════════════════════════════════════════════════════════════════════════
--  Column grants
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POLICIES AUTHORISE THE ROW; GRANTS AUTHORISE THE COLUMN. "social idea
-- decide" is FOR UPDATE over the whole row, so without this an admin marking an
-- idea is also authorised to rewrite the submitter's words and swap their
-- photo. The precedent is profiles.email, protected the same way and for the
-- same reason — and db/schema/grants.sql §4 records how readily the Supabase
-- dashboard offers to undo exactly this.
revoke update on public.social_ideas from authenticated;
grant update (status, decision_note, decided_by, decided_at)
  on public.social_ideas to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
--  Storage — a NEW private bucket
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NOT `player-photos`. See the top of this file. Mixing submitted images
-- into the roster bucket would put publication-bound photos behind policies
-- written for recognising a child on a pitch.
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-ideas', 'social-ideas', false, 5242880)
on conflict (id) do nothing;

-- ⚠️ CLUB-BLIND, like private.is_admin_anywhere() itself and for the same
-- reason: an object key carries no club. That is the documented single-club
-- assumption this schema already makes in can_admin_see_pending and
-- is_admin_anywhere. If a second club ever appears, all three are revisited
-- together.
drop policy if exists "social idea image read" on storage.objects;
create policy "social idea image read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'social-ideas'
    and (
      private.social_idea_owner(name) = auth.uid()
      or private.is_admin_anywhere()
    )
  );

-- A member writes only under their own prefix.
drop policy if exists "social idea image write" on storage.objects;
create policy "social idea image write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'social-ideas'
    and private.social_idea_owner(name) = auth.uid()
  );

-- ⚠️ THE ADMIN ARM HERE IS WHAT MAKES "remove them" REAL. Without it the
-- manager can delete the row and the image survives in the bucket.
drop policy if exists "social idea image remove" on storage.objects;
create policy "social idea image remove" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'social-ideas'
    and (
      private.social_idea_owner(name) = auth.uid()
      or private.is_admin_anywhere()
    )
  );
