-- 21 Aug 2026 — training plans: the Rugby Performance Director's tables
--
-- WHY. claude/specs/2026-08-21-training-plans-dashboard-design.md, pieces 1-3
-- of claude/plans/2026-08-12-training-session-plans.md. A drill library, hour
-- templates built from it, and a publish that attaches a template to a squad's
-- EXISTING training events. No new calendar: `events` already knows when every
-- squad trains, on whichever nights it trains.
--
-- ══ ⚠️ requires_contact IS A COLUMN, NOT A PARSE ═══════════════════════════
-- Measured 20 Aug 2026: three squad names carry "Tag", two carry "QR", five say
-- nothing. And the club runs tag sides ABOVE the age contact begins, so age
-- cannot be used either. DEFAULT false means every squad is tag until somebody
-- says otherwise — a tackle drill cannot reach a squad by accident.
--
-- ══ ⚠️ SESSION BLOCKS ARE COPIED FROM THE TEMPLATE, NOT REFERENCED ═════════
-- Otherwise a coach shortening one night's warm-up would be editing the
-- template for fifteen squads. The template is the mould; the session is the
-- casting. coach_edited_at is what publish reads to leave a casting alone.
--
-- ══ ⚠️ on delete restrict ON drill_id, NOT set null ═════════════════════════
-- A block that loses its drill is a fifteen-minute hole discovered on a pitch.
-- Retiring via is_active is the supported route and this constraint is what
-- makes that true rather than recommended. Proved by db/tests/training-plans.sql.
--
-- ⚠️ apply_migration strips `--` comments, so the COMMENT ON statements below
-- are the only comments that reach the database.

begin;

alter table public.teams
  add column if not exists requires_contact boolean not null default false;
comment on column public.teams.requires_contact is
  'Whether this squad plays contact rugby. Set per squad on /admin/club, NEVER parsed from teams.name and NEVER inferred from age — the club runs tag sides above the age contact begins. Default false fails safe: a tackle drill cannot be published to a squad nobody has marked contact.';

-- ── drills ────────────────────────────────────────────────────────────────
create table public.drills (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  title            text not null,
  summary          text,
  body             text,
  source_name      text,
  source_url       text,
  minutes          smallint not null default 10 check (minutes between 1 and 120),
  category         text not null check (category in ('warm_up','skill','game','conditioning','cool_down')),
  min_age          smallint check (min_age between 4 and 19),
  max_age          smallint check (max_age between 4 and 19),
  requires_contact boolean not null default false,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint drills_age_order check (min_age is null or max_age is null or min_age <= max_age)
);
comment on table public.drills is
  'The Rugby Performance Director''s library. Retire with is_active = false, never delete: session_template_blocks.drill_id is ON DELETE RESTRICT.';
alter table public.drills enable row level security;

-- ── session_templates + blocks ────────────────────────────────────────────
create table public.session_templates (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  name             text not null,
  min_age          smallint check (min_age between 4 and 19),
  max_age          smallint check (max_age between 4 and 19),
  requires_contact boolean not null default false,
  total_minutes    smallint not null default 0,
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint session_templates_age_order check (min_age is null or max_age is null or min_age <= max_age)
);
comment on column public.session_templates.total_minutes is
  'Derived: the sum of its blocks, stored for the list view. 60 is the club''s default hour and a DEFAULT, not a constraint — the app confirms a 50, it never refuses one.';
alter table public.session_templates enable row level security;

create table public.session_template_blocks (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.session_templates(id) on delete cascade,
  position    smallint not null,
  drill_id    uuid not null references public.drills(id) on delete restrict,
  minutes     smallint not null check (minutes between 1 and 120),
  coach_note  text,
  unique (template_id, position)
);
alter table public.session_template_blocks enable row level security;

-- ── training_focus ────────────────────────────────────────────────────────
create table public.training_focus (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  title      text not null,
  starts_on  date not null,
  ends_on    date not null,
  notes      text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint training_focus_dates check (ends_on >= starts_on)
);
comment on table public.training_focus is
  'A theme spanning weeks for one squad ("weeks 1-4: tackle technique"). A LABEL. It gates nothing: a session outside every focus window is perfectly valid.';
alter table public.training_focus enable row level security;

-- ── training_sessions + blocks ────────────────────────────────────────────
create table public.training_sessions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null unique references public.events(id) on delete cascade,
  template_id     uuid references public.session_templates(id) on delete set null,
  published_at    timestamptz not null default now(),
  coach_edited_at timestamptz,
  notes           text
);
comment on column public.training_sessions.coach_edited_at is
  'Set when a coach saves a change to this session. publish_training SKIPS any row where this is set and counts it — a coach''s own plan is never silently replaced. Publish never writes this column.';
alter table public.training_sessions enable row level security;

create table public.training_session_blocks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  position   smallint not null,
  drill_id   uuid not null references public.drills(id) on delete restrict,
  minutes    smallint not null check (minutes between 1 and 120),
  coach_note text,
  unique (session_id, position)
);
alter table public.training_session_blocks enable row level security;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Library objects: any signed-in person may read (same as `team read`), an
-- ACTIVE club admin may manage (private.is_admin checks status = 'active').
create policy "drill read"   on public.drills for select using (auth.uid() is not null);
create policy "drill manage" on public.drills for all
  using (private.is_admin(club_id)) with check (private.is_admin(club_id));

create policy "template read"   on public.session_templates for select using (auth.uid() is not null);
create policy "template manage" on public.session_templates for all
  using (private.is_admin(club_id)) with check (private.is_admin(club_id));

create policy "template block read" on public.session_template_blocks for select using (auth.uid() is not null);
create policy "template block manage" on public.session_template_blocks for all
  using (exists (select 1 from public.session_templates t where t.id = template_id and private.is_admin(t.club_id)))
  with check (exists (select 1 from public.session_templates t where t.id = template_id and private.is_admin(t.club_id)));

create policy "focus read"   on public.training_focus for select using (auth.uid() is not null);
create policy "focus manage" on public.training_focus for all
  using (private.is_admin(club_id)) with check (private.is_admin(club_id));

-- Sessions: read follows the EVENT (a parent may see tonight's plan — it holds
-- no children's data); write is can_edit_team via the event, the match-sheet
-- pattern. can_edit_team already carries a status-aware admin arm.
create policy "session read" on public.training_sessions for select
  using (exists (select 1 from public.events e where e.id = event_id and private.is_attached_to_team(e.team_id)));
create policy "session manage" on public.training_sessions for all
  using (exists (select 1 from public.events e where e.id = event_id and private.can_edit_team(e.team_id)))
  with check (exists (select 1 from public.events e where e.id = event_id and private.can_edit_team(e.team_id)));

create policy "session block read" on public.training_session_blocks for select
  using (exists (select 1 from public.training_sessions s join public.events e on e.id = s.event_id
                 where s.id = session_id and private.is_attached_to_team(e.team_id)));
create policy "session block manage" on public.training_session_blocks for all
  using (exists (select 1 from public.training_sessions s join public.events e on e.id = s.event_id
                 where s.id = session_id and private.can_edit_team(e.team_id)))
  with check (exists (select 1 from public.training_sessions s join public.events e on e.id = s.event_id
                      where s.id = session_id and private.can_edit_team(e.team_id)));

-- ── publish_training ──────────────────────────────────────────────────────
-- ONE function for preview and for real, switched by _preview, so the table
-- the Director confirms is computed by the code that then acts on it.
-- ⛔ DATE RANGE ON type = 'training'. No weekday anywhere.
create or replace function public.publish_training(
  _template uuid, _teams uuid[], _from date, _to date, _preview boolean default true)
returns table (team_id uuid, will_write int, skipped_coach_edited int, no_events int)
language plpgsql security definer set search_path to 'public'
as $$
declare
  _club uuid;
  _team uuid;
  _ev record;
  _session uuid;
begin
  select club_id into _club from session_templates where id = _template and is_active;
  if _club is null then
    raise exception 'template not found or retired' using errcode = 'P0002';
  end if;
  if not private.is_admin(_club) then
    raise exception 'not an active admin of this club' using errcode = '42501';
  end if;
  if _to < _from then
    raise exception 'date range is backwards' using errcode = '22007';
  end if;

  foreach _team in array _teams loop
    team_id := _team; will_write := 0; skipped_coach_edited := 0; no_events := 0;

    for _ev in
      select e.id, s.id as session_id, s.coach_edited_at
        from events e
        left join training_sessions s on s.event_id = e.id
       where e.team_id = _team
         and e.type = 'training'
         and (e.starts_at at time zone 'Asia/Dubai')::date between _from and _to
    loop
      if _ev.coach_edited_at is not null then
        skipped_coach_edited := skipped_coach_edited + 1;
        continue;
      end if;
      will_write := will_write + 1;
      if _preview then continue; end if;

      if _ev.session_id is null then
        insert into training_sessions (event_id, template_id)
        values (_ev.id, _template) returning id into _session;
      else
        _session := _ev.session_id;
        update training_sessions set template_id = _template, published_at = now()
         where id = _session;
        delete from training_session_blocks where session_id = _session;
      end if;

      insert into training_session_blocks (session_id, position, drill_id, minutes, coach_note)
      select _session, b.position, b.drill_id, b.minutes, b.coach_note
        from session_template_blocks b where b.template_id = _template;
    end loop;

    if will_write = 0 and skipped_coach_edited = 0 then no_events := 1; end if;
    return next;
  end loop;
end $$;

revoke execute on function public.publish_training(uuid, uuid[], date, date, boolean) from public, anon;
grant  execute on function public.publish_training(uuid, uuid[], date, date, boolean) to authenticated, service_role;

commit;
