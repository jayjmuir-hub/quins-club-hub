-- public.feedback — "something's broken" / "I've got a suggestion", from any
-- member, on any screen.
--
-- Design and reasoning: claude/plans/2026-08-18-help-and-feedback.md.
--
-- ══ ⚠️ THE SCREEN IS THE RECORD. THE E-MAIL IS A PROMPT TO GO AND LOOK ════
--
-- An earlier draft of the plan had no `status` column at all: the notification
-- would carry `Reply-To: <reporter>`, an admin would answer from their inbox,
-- and the mail client would be the triage tool. Jay, 18 Aug 2026: *"keep
-- everything in one place instead of emails"*.
--
-- He is right, and this app had already decided it once —
-- supabase/functions/notify-approval/index.ts says the screen is the source of
-- truth and the e-mail is a prompt. An inbox is a bad database: within a month
-- there is no reliable answer to "which of these have I actually dealt with",
-- because the only record of that is whether somebody remembers replying.
--
-- ══ ⚠️ WHY `kind` AND NOT `type` ═════════════════════════════════════════
--
-- `type` is not reserved in Postgres, but `events.type` already exists and
-- reads as "what sort of fixture is this". A second, unrelated `type` on a
-- second table is the kind of near-collision that makes a join condition wrong
-- in a way that still compiles.
--
-- ══ ⚠️ WHAT THE CLIENT MAY SET, AND WHAT IT MAY NOT ══════════════════════
--
-- `club_id`, `submitted_by` and `status` are stamped by the BEFORE INSERT
-- trigger below, exactly as social_ideas does. A policy authorises a ROW; it
-- does not stop a browser putting `status: 'done'` in the payload, and a
-- self-marked-done report is a report nobody ever reads.

begin;

-- ══ THE TABLE ════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),

  -- ⚠️ A HUMAN-QUOTABLE REFERENCE, AND IT IS NOT THE UUID. The acknowledgement
  -- e-mail tells the reporter "QCH-0041" so they can refer to it later, and a
  -- uuid is not something anyone reads down a phone. `generated always as
  -- identity` because it must never be settable and never be reused.
  ref bigint generated always as identity,

  -- ⚠️ Stamped by the trigger, never by the client.
  club_id uuid not null references public.clubs(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,

  -- Which of the two doors they came through. A sorting hint for whoever
  -- triages, not a claim about what the report turns out to be.
  kind text not null check (kind in ('bug', 'idea')),

  -- What they actually said. The only thing the form requires.
  body text not null check (length(btrim(body)) > 0),

  -- ⚠️ THE ROUTE IS A COLUMN AND THE REST IS JSONB, AND THAT SPLIT IS THE
  -- POINT. "Which screen" is the one thing that gets grouped, counted and
  -- filtered — three reports from /roster in a week is a signal. Device
  -- strings and viewport sizes are read once by a human and never queried, so
  -- they do not earn columns.
  route text,
  context jsonb not null default '{}'::jsonb,

  -- ⚠️ A CHECK rather than an enum, matching memberships.status,
  -- pitch_requests.status and social_ideas.status — adding a state stays a
  -- one-line migration instead of a type alteration.
  status text not null default 'new'
    check (status in ('new', 'in-progress', 'done', 'wontfix')),

  admin_note text,
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,

  created_at timestamptz not null default now()
);

-- The admin screen reads "everything not yet finished, newest first". Without
-- this it is a sequential scan that gets slower every time somebody reports
-- something, which is the wrong direction for a table that only grows.
create index if not exists feedback_club_status_created_idx
  on public.feedback (club_id, status, created_at desc);

-- The reporter's own view, and the ACK e-mail's lookup.
create index if not exists feedback_submitted_by_idx
  on public.feedback (submitted_by, created_at desc);

-- ══ THE STAMPING TRIGGER ═════════════════════════════════════════════════
--
-- ⚠️ SECURITY DEFINER, and it reads `memberships` for the CALLER. A member
-- belongs to one club here; if that ever stops being true this needs a
-- club_id argument rather than a guess.

create or replace function private.stamp_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _club uuid;
begin
  select m.club_id into _club
    from public.memberships m
   where m.profile_id = auth.uid()
     and m.status = 'active'
   order by m.created_at
   limit 1;

  if _club is null then
    -- ⚠️ RAISE, DO NOT DEFAULT. A report with no club cannot be shown on any
    -- admin screen, so accepting it would be a silent black hole — the exact
    -- failure this feature exists to stop.
    raise exception 'no active membership: cannot file feedback'
      using errcode = '42501';
  end if;

  new.club_id      := _club;
  new.submitted_by := auth.uid();
  new.status       := 'new';
  new.handled_by   := null;
  new.handled_at   := null;
  new.created_at   := now();

  return new;
end;
$$;

drop trigger if exists stamp_feedback on public.feedback;
create trigger stamp_feedback
  before insert on public.feedback
  for each row execute function private.stamp_feedback();

-- ══ ROW LEVEL SECURITY ═══════════════════════════════════════════════════

alter table public.feedback enable row level security;

-- ⚠️ THE SUBMITTER ARM IS A REQUIREMENT, NOT A COURTESY — same reasoning as
-- "social idea read" and "pitch request read". Without it you report into
-- silence and never learn whether anybody looked.
drop policy if exists "feedback read" on public.feedback;
create policy "feedback read" on public.feedback
  for select using (
    submitted_by = auth.uid()
    or private.is_admin(club_id)
  );

-- ⚠️ ANY ACTIVE MEMBER. This is the widest door in the app after the social
-- idea form, and deliberately so: the person best placed to notice a bug is a
-- parent on a phone, and a permission check is one more reason not to bother.
-- The trigger has already forced club_id, submitted_by and status, so the
-- check below cannot pass for a row it did not stamp.
drop policy if exists "feedback create" on public.feedback;
create policy "feedback create" on public.feedback
  for insert with check (
    submitted_by = auth.uid()
    and exists (
      select 1 from public.memberships m
       where m.profile_id = auth.uid()
         and m.club_id = feedback.club_id
         and m.status = 'active'
    )
  );

-- ⚠️ TRIAGE IS ADMIN-ONLY, AND THE COLUMN GRANTS BELOW ARE HALF OF THAT.
-- This policy authorises the ROW; without the REVOKE it would also authorise
-- an admin rewriting the reporter's words, which would make the record a
-- record of what the admin remembers rather than what was said.
drop policy if exists "feedback triage" on public.feedback;
create policy "feedback triage" on public.feedback
  for update using (private.is_admin(club_id))
  with check (private.is_admin(club_id));

-- ⚠️ NO DELETE POLICY, ON PURPOSE. `wontfix` is the answer to a report nobody
-- will act on. A deletable report is a findings list that can be tidied into
-- agreement with itself, which is the same failure `claude/open-items.md`
-- warns about: "an item deleted from it is a finding that ceases to exist".

-- ══ COLUMN GRANTS ════════════════════════════════════════════════════════
--
-- ⚠️ CAPTURED IN db/schema/grants.sql. `npm run docs:check` fails if a table
-- named in a GRANT here is missing from that file — see checkGrantCapture.

revoke update on public.feedback from authenticated;
grant update (status, admin_note, handled_by, handled_at)
  on public.feedback to authenticated;

commit;
