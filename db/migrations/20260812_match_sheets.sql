-- RCM Official Match Result Sheets — Project 2 of 2.
-- claude/plans/2026-08-11-match-sheets.md, with the 12 Aug decisions at its head.
--
-- ⚠️ THIS IS A GOVERNING-BODY FORM, NOT A CLUB REPORT. One sheet per team per
-- game, filled by the coach or team manager who was there, submitted to Rugby
-- Club Management through a WhatsApp group. Nothing here automates that
-- submission; the form's own instructions describe it as a manual step.
--
-- ⚠️ BUILT FOR A LOADED CLUB, NOT FOR TODAY'S ROWS — Jay, 12 Aug 2026: "build
-- the system for the end result not what data is already loaded". Nothing below
-- is shaped by the fact that the database currently holds 7 players.

-- ══ match_sheets ═════════════════════════════════════════════════════════
create table if not exists public.match_sheets (
  id             uuid primary key default gen_random_uuid(),
  -- ⚠️ UNIQUE, the same reasoning pitch_requests records: a second sheet for one
  -- fixture is not a second document, it is the same one filed twice — and two
  -- would mean two submissions to RCM and a race over which is real.
  event_id       uuid not null unique references public.events(id) on delete cascade,
  -- ⚠️ ON DELETE SET NULL, never cascade. Deleting a league team must cost the
  -- sheet its TEAM: line, which is recoverable, and never the SHEET, which is a
  -- filed record. Same rule events.league_team_id follows.
  league_team_id uuid references public.league_teams(id) on delete set null,
  captain_name   text,
  manager_name   text,
  score_us       smallint,
  tries_us       smallint,
  score_them     smallint,
  tries_them     smallint,
  medical_notes  text,
  -- draft → complete. ⚠️ `complete` is what the coach means by "Submit"; it is
  -- NOT a claim that RCM has received it, because nothing in this app can know
  -- that. The dashboard reads it as "ready to send", never as "sent".
  status         text not null default 'draft',
  submitted_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint match_sheets_status_check check (status in ('draft', 'complete'))
);

comment on column public.match_sheets.status is
  'draft | complete. "complete" means the coach pressed Submit and the sheet is '
  'ready to send to RCM. It does NOT mean RCM received it - nothing in this app '
  'can know that, and the dashboard must never imply otherwise.';

-- ══ match_sheet_slots ════════════════════════════════════════════════════
-- ⚠️ `slot` IS THE POSITION, NOT A SHIRT NUMBER. 1 is loosehead, 2 hooker, and
-- 16-22 are the replacements whose front-row cover the FR column identifies —
-- a SAFETY rule on the form, not decoration. The club deliberately holds no
-- squad numbers at all (tests/data.test.js asserts the app never sends
-- jersey_num); do not repurpose players.jersey_num for this.
create table if not exists public.match_sheet_slots (
  id             uuid primary key default gen_random_uuid(),
  match_sheet_id uuid not null references public.match_sheets(id) on delete cascade,
  slot           smallint not null,
  -- ⚠️ ON DELETE SET NULL so a filed sheet survives a player leaving the club.
  player_id      uuid references public.players(id) on delete set null,
  -- ⚠️ STORED AS TEXT EVEN WHEN player_id IS SET, and this is the load-bearing
  -- decision in the whole project. TWO reasons, each sufficient:
  --   1. The form demands "full name as per registration". A rendered join is
  --      not a record of what was submitted — it is a record of what the roster
  --      says today.
  --   2. A filed sheet is HISTORY. If a player is later renamed, moved between
  --      squads or removed, the sheet must still say what was filed.
  -- ⚠️ A THIRD REASON WAS RETIRED ON 12 Aug 2026: "the club only has 7 players
  -- so a 22-man sheet cannot come from the roster". That was an argument about
  -- today, and Jay's ruling is to build for the loaded club. The conclusion
  -- survives on reasons 1 and 2; the retired one must not be cited again.
  full_name      text not null,
  front_row      boolean not null default false,
  constraint match_sheet_slots_slot_check check (slot between 1 and 22),
  constraint match_sheet_slots_sheet_slot_key unique (match_sheet_id, slot)
);

-- ══ match_sheet_cards ════════════════════════════════════════════════════
-- Own team only, as the form specifies.
create table if not exists public.match_sheet_cards (
  id             uuid primary key default gen_random_uuid(),
  match_sheet_id uuid not null references public.match_sheets(id) on delete cascade,
  half           smallint,
  minute         smallint,
  colour         text,
  -- The slot the card was shown to, and the name as filed. Both, for the same
  -- reason the squad rows carry both: the sheet is a record of what was sent.
  slot           smallint,
  full_name      text,
  reason         text,
  created_at     timestamptz not null default now(),
  constraint match_sheet_cards_colour_check check (colour in ('yellow', 'red')),
  constraint match_sheet_cards_half_check check (half is null or half in (1, 2)),
  constraint match_sheet_cards_slot_check check (slot is null or slot between 1 and 22)
);

create index if not exists match_sheet_slots_sheet_idx on public.match_sheet_slots (match_sheet_id, slot);
create index if not exists match_sheet_cards_sheet_idx on public.match_sheet_cards (match_sheet_id);
create index if not exists match_sheets_status_idx on public.match_sheets (status, event_id);

-- ══ RLS ══════════════════════════════════════════════════════════════════
--
-- ⚠️ ONE CONDITION FOR READ AND WRITE, AND NO SEPARATE is_admin ARM.
-- private.can_edit_team ALREADY contains an admin arm — "role = 'admin' and
-- m.club_id = (the squad's club)" — so a club admin reaches every squad's sheet
-- through it. The plan proposed `can_edit_team OR is_admin` for reads; that
-- second arm would be redundant EXCEPT that private.is_admin does not check
-- membership STATUS, so adding it would quietly let a PENDING admin read every
-- sheet in the club. can_edit_team was deliberately made status-aware on
-- 10 Aug 2026 and thirteen policies hang off it. Do not "restore" the is_admin
-- arm to match the house style.
alter table public.match_sheets      enable row level security;
alter table public.match_sheet_slots enable row level security;
alter table public.match_sheet_cards enable row level security;

create policy "match sheet manage" on public.match_sheets
  for all
  using (exists (select 1 from public.events e
                 where e.id = event_id and private.can_edit_team(e.team_id)))
  with check (exists (select 1 from public.events e
                      where e.id = event_id and private.can_edit_team(e.team_id)));

-- ⚠️ A SECURITY DEFINER HELPER FOR THE CHILD TABLES, not an inlined three-hop
-- exists(). Reaching slot → sheet → event → squad inside a policy would make
-- every row read re-plan that join, and — the reason that actually matters —
-- would put the rule in three places, where one of them will eventually be
-- edited alone.
create or replace function private.can_edit_match_sheet(_sheet uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.match_sheets ms
    join public.events e on e.id = ms.event_id
    where ms.id = _sheet and private.can_edit_team(e.team_id)
  );
$function$;

grant execute on function private.can_edit_match_sheet(uuid) to authenticated;

create policy "match sheet slot manage" on public.match_sheet_slots
  for all
  using (private.can_edit_match_sheet(match_sheet_id))
  with check (private.can_edit_match_sheet(match_sheet_id));

create policy "match sheet card manage" on public.match_sheet_cards
  for all
  using (private.can_edit_match_sheet(match_sheet_id))
  with check (private.can_edit_match_sheet(match_sheet_id));
