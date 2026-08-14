-- Match lineups — a coach picks a team before the match.
-- Phase 1 of claude/plans/2026-08-14-match-lineups.md.
--
-- ⚠️ THIS IS NOT THE RCM MATCH SHEET AND MUST NEVER BE MERGED WITH IT (Jay,
-- 14 Aug 2026, in as many words). `match_sheets` is a DOCUMENT FILED WITH THE
-- GOVERNING BODY after the match: it has `status`, `submitted_at`, a 1–22 slot
-- convention taken from the paper form, and a `full_name` snapshot so a filed
-- sheet still says what was filed. A lineup is a PLAN made before the match,
-- changes until kick-off, and is disposable afterwards.
--
-- ⚠️ AND SEPARATING THEM REMOVES THIS FEATURE'S HARDEST CONSTRAINT FOR FREE.
-- `match_sheets.event_id` is UNIQUE by design — "a second sheet is not a second
-- document, it is the same one filed twice". A squad fielding TWO teams at a
-- tournament, or playing four short games in one day, cannot be expressed
-- against that. ⚠️ **THERE IS DELIBERATELY NO UNIQUE INDEX ON
-- `lineups.event_id`.** Adding one would import the problem we just avoided.

create table if not exists public.lineups (
  id         uuid        not null default gen_random_uuid(),
  event_id   uuid        not null,
  -- Which lineup this is, when there is more than one for a fixture: "Game 2",
  -- "ADHQ2". NULL for the ordinary case of a single lineup, so the screen does
  -- not have to invent a name nobody asked for.
  label      text,
  -- ⚠️ THE COACH'S CHOICE, NOT THE SQUAD'S (Jay). A squad plays 10s at one
  -- tournament and 7s at the next, so deriving this from the age group would be
  -- wrong on exactly the day it matters. It also means no formation table has to
  -- exist and no age-group mapping has to be maintained.
  --
  -- ⚠️ IT IS A GUIDE, NOT A GATE. The screen shows "8 of 10 picked" and warns
  -- when over; it must never refuse the 11th. Coaches over-pick and then cut, and
  -- a form that blocks mid-thought gets worked around. The CHECK below is a
  -- sanity bound on the NUMBER ITSELF, not a limit on how many players are in the
  -- lineup — there is no constraint tying the two together, on purpose.
  players_per_side smallint,
  -- "Meet 8:15 at the gate." Goes on the shared image, so it reaches a parent who
  -- never opens the app.
  notes      text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lineups_pkey primary key (id),
  constraint lineups_event_id_fkey  foreign key (event_id)   references public.events(id)   on delete cascade,
  constraint lineups_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null,
  constraint lineups_updated_by_fkey foreign key (updated_by) references public.profiles(id) on delete set null,
  constraint lineups_players_per_side_check
    check (players_per_side is null or (players_per_side between 1 and 30))
);

create table if not exists public.lineup_players (
  id         uuid     not null default gen_random_uuid(),
  lineup_id  uuid     not null,
  -- ⚠️ ON DELETE CASCADE, AND THE ASYMMETRY WITH match_sheet_slots IS THE POINT.
  -- That table keeps a `full_name` and sets `player_id` NULL on delete, because a
  -- FILED sheet must survive the player leaving the club. A lineup is a plan for
  -- a match that has not happened: a player who has left should VANISH from it,
  -- not linger as a name nobody can act on.
  --
  -- ⚠️ SO THERE IS NO full_name SNAPSHOT HERE EITHER, deliberately. The name
  -- always comes from `players`, which means a correction to a child's spelling
  -- is reflected rather than frozen — the opposite of what the match sheet needs.
  player_id  uuid     not null,
  role       text     not null default 'starter',
  -- ⚠️ FREE TEXT, NOT A CHECK CONSTRAINT. The offerable list lives in
  -- src/lib/positions.js and the club changes it without a migration; a CHECK
  -- here would be a second copy that drifts the first time somebody adds one.
  -- It is a LABEL on a lineup, and nothing reasons about it.
  -- ⚠️ The club deliberately holds no squad numbers — see the comment on
  -- match_sheet_slots.slot. This must not invent them.
  position   text,
  sort_order smallint not null default 0,
  constraint lineup_players_pkey primary key (id),
  constraint lineup_players_lineup_id_fkey foreign key (lineup_id) references public.lineups(id)  on delete cascade,
  constraint lineup_players_player_id_fkey foreign key (player_id) references public.players(id)  on delete cascade,
  -- One row per player per lineup. Picking somebody twice is always a mistake.
  constraint lineup_players_lineup_player_key unique (lineup_id, player_id),
  constraint lineup_players_role_check check (role in ('starter', 'replacement'))
);

create index if not exists lineups_event_idx         on public.lineups(event_id);
create index if not exists lineup_players_lineup_idx on public.lineup_players(lineup_id, sort_order);

alter table public.lineups        enable row level security;
alter table public.lineup_players enable row level security;

-- ══ RLS ═════════════════════════════════════════════════════════════════════
--
-- ⚠️ PHASE 1 IS COACH-ONLY, AND THAT IS A DELIBERATE PRODUCT DECISION (Jay,
-- 14 Aug 2026), not a stub. The WhatsApp image is how a lineup reaches parents.
-- Coach-only adds NO new place in the app where one family can read another
-- family's child; making it member-visible later is additive, and taking it away
-- again would not be.
--
-- ⚠️ `private.can_edit_team` IS THE SAME GATE `event edit` USES — active
-- membership, and either admin of the team's club or coach/manager/medic of that
-- team. Reusing it means a squad's staff list is defined in exactly one place.
--
-- ⚠️ NOT WRAPPED IN `(select ...)`, unlike the auth.uid() calls that
-- 20260814 rls wrapping fixed. That optimisation applies to expressions which are
-- CONSTANT for the whole scan and can be hoisted to an initplan. This one takes
-- the row's own event, so it genuinely varies per row and cannot be hoisted —
-- exactly like the existing "event edit" policy it copies.
drop policy if exists "lineup manage" on public.lineups;
create policy "lineup manage" on public.lineups
  for all
  using (
    private.can_edit_team((select e.team_id from public.events e where e.id = lineups.event_id))
  )
  with check (
    private.can_edit_team((select e.team_id from public.events e where e.id = lineups.event_id))
  );

drop policy if exists "lineup player manage" on public.lineup_players;
create policy "lineup player manage" on public.lineup_players
  for all
  using (
    exists (
      select 1 from public.lineups l
       join public.events e on e.id = l.event_id
      where l.id = lineup_players.lineup_id
        and private.can_edit_team(e.team_id)
    )
  )
  with check (
    exists (
      select 1 from public.lineups l
       join public.events e on e.id = l.event_id
      where l.id = lineup_players.lineup_id
        and private.can_edit_team(e.team_id)
    )
  );

-- ══ GRANTS ══════════════════════════════════════════════════════════════════
--
-- ⚠️ THE REVOKE IS THE LOAD-BEARING HALF, AND WITHOUT IT THIS MIGRATION COULD
-- SILENTLY HAND `anon` FULL PRIVILEGES ON A TABLE OF CHILDREN'S NAMES.
-- `20260814 grants` took table privileges away from anon across `public`, but
-- that revoked EXISTING tables — it did not change the DEFAULT PRIVILEGES that
-- decide what a NEW one gets.
--
-- ✅ MEASURED 14 Aug 2026, not assumed: `pg_default_acl` for schema `public`,
-- objtype `r`, holds TWO entries —
--   granter supabase_admin : postgres | anon | authenticated | service_role
--   granter postgres       : postgres |      | authenticated | service_role
-- So whether `anon` is granted on a brand-new table depends on WHICH ROLE
-- CREATES IT. Revoking explicitly makes the outcome independent of that, which
-- is the only version of this that is safe to rely on.
revoke all on public.lineups        from anon;
revoke all on public.lineup_players from anon;

grant select, insert, update, delete on public.lineups        to authenticated;
grant select, insert, update, delete on public.lineup_players to authenticated;

-- ══ updated_at ══════════════════════════════════════════════════════════════
--
-- Written by the trigger, never by the client, so an edit cannot claim not to
-- have happened — the same reason `announcements.updated_at` is not
-- column-granted. Its own function rather than a shared one, matching
-- private.touch_announcement's precedent.
create or replace function private.touch_lineup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists lineups_touch on public.lineups;
create trigger lineups_touch before update on public.lineups
  for each row execute function private.touch_lineup();

-- ══ GUARD ═══════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='lineups') then
    raise exception 'FAILED: public.lineups was not created';
  end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='lineup_players') then
    raise exception 'FAILED: public.lineup_players was not created';
  end if;
  if exists (
    select 1 from pg_indexes
     where schemaname='public' and tablename='lineups' and indexdef ilike '%unique%event_id%'
  ) then
    raise exception 'FAILED: a UNIQUE index on lineups.event_id exists — see the header, that is the constraint this feature exists to avoid';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename in ('lineups','lineup_players')) <> 2 then
    raise exception 'FAILED: expected exactly 2 policies across the two lineup tables';
  end if;
  if has_table_privilege('anon', 'public.lineups', 'SELECT')
     or has_table_privilege('anon', 'public.lineup_players', 'SELECT') then
    raise exception 'FAILED: anon can still read a lineup table';
  end if;
  if not has_table_privilege('authenticated', 'public.lineups', 'INSERT') then
    raise exception 'FAILED: authenticated cannot insert a lineup';
  end if;
  raise notice 'guard passed: both tables, no unique event_id, 2 policies, anon revoked, authenticated granted';
end $$;
