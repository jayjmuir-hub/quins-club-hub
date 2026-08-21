# Rugby Performance Director dashboard — implementation plan

**STATUS: NOT SHIPPED.** Written 21 Aug 2026 from
`claude/specs/2026-08-21-training-plans-dashboard-design.md` (approved by Jay
the same day). Set this line to SHIPPED in the commit that ships it.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/admin/training` dashboard behind a new `training` admin right,
where the Rugby Performance Director keeps a drill library, builds 60-minute
session templates, and publishes one to the training events of any squads he
selects — with coaches seeing (and adjusting) the plan on the event sheet.

**Architecture:** Five new tables plus one column on `teams`, all behind RLS;
one SECURITY DEFINER function `publish_training` that both previews and
performs a publish so the two cannot disagree; pure decision logic in
`src/lib/trainingPlans.js` (tested without a DOM); a thin data layer in
`src/data/trainingPlans.js`; three tab screens under the existing admin portal
shell; and a `SessionPlan` card in `EventDetail`.

**Tech Stack:** Vite + React 18, Tailwind, Supabase (Postgres 17 via
PostgREST + RPC), vitest + Testing Library, `db/tests/` rolled-back SQL
harnesses run by `npm run db:check`.

## Global constraints

Copied from the spec and `CLAUDE.md`; every task implicitly includes them.

- ⛔ **Nothing may key on a weekday.** Publish targets `events` rows where
  `type = 'training'` in a date range.
- ⛔ **`requires_contact` is a column on `teams`; never parsed from the name,
  never inferred from age.** Default `false` (tag) fails safe.
- ⛔ **`ageBandFromTeamName()` returning `null` means "no guidance"**, never a
  default band. An unparseable squad is shown disabled with the reason.
- **Retire, never delete.** `is_active` on drills and templates; blocks FK
  `on delete restrict`.
- **Publish never overwrites a coach's edit** (`coach_edited_at` set) and
  reports how many it skipped.
- **60 minutes is a default, not a constraint.** Confirm a non-60 total;
  never refuse it.
- **A right gates the screen, not the data.** The "not your job" card copies
  `YouthDashboard.jsx` word for word in shape.
- **No real person's name anywhere** — fixtures use invented squads/people.
- **Stage explicit paths. Never `git add -A`.** Every commit below names its
  files.
- **`npm run test:related -- <file>` while working; `npm test` before the
  PR.** `npm run docs:check` after any `claude/` or `db/` edit.
- **Label copy:** the right is `training`, the label is exactly
  **"Rugby Performance Director"**.
- **`main` is production.** Nothing here pushes to `main`; the branch is
  `claude/rugby-performance-dashboard-001473` and the PR is the hand-off.

## File map

| File | Responsibility |
|---|---|
| `db/migrations/20260821_training_plans.sql` | Create: column, five tables, RLS, `publish_training`, comments |
| `db/schema/tables.sql`, `policies.sql`, `functions.sql`, `grants.sql` | Modify: capture what the migration made |
| `db/tests/training-plans.sql` | Create: rolled-back harness — restrict FK, UNIQUE, skip-on-edit, preview writes nothing |
| `src/lib/scope.js` | Modify: `training` right + label |
| `src/lib/portals.js` | Modify: the portal card and its three tabs |
| `src/App.jsx` | Modify: three routes |
| `src/lib/trainingPlans.js` | Create: pure logic — totals, fit rules, publish-row shaping |
| `src/data/teams.js` | Modify: `setTeamRequiresContact` |
| `src/data/trainingPlans.js` | Create: drills, templates, focus, sessions, publish RPC |
| `src/screens/AdminClub.jsx` | Modify: contact/tag toggle in the scoring panel |
| `src/screens/TrainingLibrary.jsx` | Create: Library tab |
| `src/screens/TrainingTemplates.jsx` | Create: Templates tab and the hour builder |
| `src/screens/TrainingPublish.jsx` | Create: Publish tab and the focus section |
| `src/screens/TrainingGate.jsx` | Create: the shared "not your job" guard the three tabs wrap themselves in |
| `src/components/SessionPlan.jsx` | Create: the coach's card on a training event |
| `src/screens/EventDetail.jsx` | Modify: mount `SessionPlan` |
| `tests/training-plans-lib.test.js`, `tests/training-*.test.jsx`, `tests/scope.test.js`, `tests/admin-portals.test.jsx`, `tests/admin-club-scoring.test.jsx`, `tests/session-plan.test.jsx` | Tests |
| `claude/changelog.md`, `claude/state-of-play.md`, `claude/schema-history.md`, `claude/plans/2026-08-12-training-session-plans.md`, this file | Docs |

---

### Task 1: Migration, schema capture and harness

**Files:**
- Create: `db/migrations/20260821_training_plans.sql`
- Create: `db/tests/training-plans.sql`
- Modify: `db/schema/tables.sql` (append), `db/schema/policies.sql` (append), `db/schema/functions.sql` (append), `db/schema/grants.sql` (the table-privilege list near line 163)

**Interfaces:**
- Produces: tables `drills`, `session_templates`, `session_template_blocks`, `training_focus`, `training_sessions`, `training_session_blocks`; column `teams.requires_contact`; RPC `publish_training(_template uuid, _teams uuid[], _from date, _to date, _preview boolean) returns table(team_id uuid, will_write int, skipped_coach_edited int, no_events int)`.

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Write the harness, asserting against injected faults**

`db/tests/training-plans.sql` — same skeleton as `db/tests/rls-pitch-requests.sql` (temporary `_r`, `begin` … `rollback`, the self-test block at the end copied verbatim). Body:

```sql
begin;
create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- One invented coach on the first squad; the admin is the production admin
-- profile the other harnesses use (a PROFILE id, not a membership id).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-00000000d001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coach-tp@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values ('c0000000-0000-4000-8000-00000000d001','Coach TP','coach-tp@example.invalid') on conflict (id) do nothing;
insert into memberships (profile_id, club_id, team_id, role, status)
select 'c0000000-0000-4000-8000-00000000d001', club_id, id, 'coach','active' from teams order by sort_order limit 1;

-- Two training events and one MATCH in the window, for the first squad.
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d1', club_id, id, 'training','HARNESS train 1', now() + interval '2 days' from teams order by sort_order limit 1;
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d2', club_id, id, 'training','HARNESS train 2', now() + interval '5 days' from teams order by sort_order limit 1;
insert into events (id, club_id, team_id, type, title, starts_at)
select 'eee00000-0000-4000-8000-0000000000d3', club_id, id, 'match','HARNESS match', now() + interval '3 days' from teams order by sort_order limit 1;

-- A drill, and a template using it.
insert into drills (id, club_id, title, category, minutes)
select 'd0000000-0000-4000-8000-0000000000a1', club_id, 'HARNESS passing lines', 'skill', 15 from teams limit 1;
insert into session_templates (id, club_id, name, total_minutes)
select 't0000000-0000-4000-8000-0000000000a1', club_id, 'HARNESS hour', 15 from teams limit 1;
insert into session_template_blocks (template_id, position, drill_id, minutes)
values ('t0000000-0000-4000-8000-0000000000a1', 1, 'd0000000-0000-4000-8000-0000000000a1', 15);

-- 1. The restrict FK. A drill in use cannot be deleted.
do $$ begin
  delete from drills where id = 'd0000000-0000-4000-8000-0000000000a1';
  insert into _r values ('delete a drill in use','FAIL — allowed');
exception when foreign_key_violation then insert into _r values ('delete a drill in use','PASS — refused 23503'); end $$;

-- 2. UNIQUE on event_id.
insert into training_sessions (event_id) values ('eee00000-0000-4000-8000-0000000000d1');
do $$ begin
  insert into training_sessions (event_id) values ('eee00000-0000-4000-8000-0000000000d1');
  insert into _r values ('second session on one event','FAIL — allowed');
exception when unique_violation then insert into _r values ('second session on one event','PASS — refused 23505'); end $$;
delete from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000d1';

-- 3. Preview writes nothing. Run as the admin.
set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare w int; n int; begin
  select will_write into w from publish_training('t0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, true);
  select count(*) into n from training_sessions where event_id in ('eee00000-0000-4000-8000-0000000000d1','eee00000-0000-4000-8000-0000000000d2');
  insert into _r values ('preview counts 2 and writes 0', case when w = 2 and n = 0 then 'PASS' else 'FAIL w='||w||' n='||n end);
end $$;

-- 4. Real publish writes 2 sessions, 2 blocks, and not the match.
do $$ declare n int; m int; begin
  perform publish_training('t0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, false);
  select count(*) into n from training_sessions where event_id in ('eee00000-0000-4000-8000-0000000000d1','eee00000-0000-4000-8000-0000000000d2');
  select count(*) into m from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000d3';
  insert into _r values ('publish writes both trainings, not the match', case when n = 2 and m = 0 then 'PASS' else 'FAIL n='||n||' m='||m end);
end $$;

-- 5. A coach-edited session is skipped and COUNTED. Inject the edit as the coach.
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000d001","role":"authenticated"}';
update training_sessions set coach_edited_at = now(), notes = 'coach changed it'
 where event_id = 'eee00000-0000-4000-8000-0000000000d1';

reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"df730ef7-dce2-4962-babe-96d9999b0173","role":"authenticated"}';
do $$ declare s int; w int; kept text; begin
  select skipped_coach_edited, will_write into s, w from publish_training('t0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, false);
  select notes into kept from training_sessions where event_id = 'eee00000-0000-4000-8000-0000000000d1';
  insert into _r values ('publish skips the coach edit and reports it',
    case when s = 1 and w = 1 and kept = 'coach changed it' then 'PASS' else 'FAIL s='||s||' w='||w||' kept='||coalesce(kept,'null') end);
end $$;

-- 6. A coach cannot call publish at all.
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-4000-8000-00000000d001","role":"authenticated"}';
do $$ begin
  perform publish_training('t0000000-0000-4000-8000-0000000000a1',
    array[(select id from teams order by sort_order limit 1)], current_date, current_date + 10, true);
  insert into _r values ('coach calls publish','FAIL — allowed');
exception when insufficient_privilege then insert into _r values ('coach calls publish','PASS — refused 42501'); end $$;

reset role;
select * from _r;
-- (self-test block from rls-pitch-requests.sql here, verbatim)
rollback;
```

- [ ] **Step 3: Run the harness BEFORE applying the migration and confirm it fails**

Run: `npm run db:check -- training-plans`
Expected: a SQL error — `relation "drills" does not exist`. That is the fault-injection for the whole harness: it cannot pass against a database without the tables.

- [ ] **Step 4: Apply the migration**

Through the Supabase MCP `apply_migration` tool, name `training_plans`, body = the file without its leading `--` block (the tool strips comments anyway; the `COMMENT ON` statements carry what matters). Then `list_migrations` and confirm `training_plans` is listed. ⚠️ This is a production change; it is additive (one nullable-defaulted column, six new tables) and was approved in the spec. Say so in the commit message.

- [ ] **Step 5: Run the harness and confirm it passes**

Run: `npm run db:check -- training-plans`
Expected: `SELF-TEST PASSED — 6 step(s), none reported FAIL.` Paste the six lines into the `EXPECTED — measured live` footer of the harness, as the others do.

- [ ] **Step 6: Capture into `db/schema/`**

Append the six `CREATE TABLE`s and the `ALTER TABLE teams` to `tables.sql`, the policies to `policies.sql`, the function with its grant lines to `functions.sql`, and add six rows to the table-privilege list in `grants.sql` (the `league_teams` row is the model: `anon, authenticated, postgres, service_role   ALL 8`, with the note that the `anon` row is Supabase's default privileges and RLS is what keeps anon out). Run: `npm run docs:check` — expected `All documentation checks passed.`

- [ ] **Step 7: Commit**

```bash
git add db/migrations/20260821_training_plans.sql db/tests/training-plans.sql db/schema/tables.sql db/schema/policies.sql db/schema/functions.sql db/schema/grants.sql
git commit -m "feat(db): training plans — drills, templates, sessions, focus, publish_training

Applied to production through the Supabase MCP as training_plans; additive only.
Harness db/tests/training-plans.sql: 6 steps, measured live."
```

---

### Task 2: The `training` right, the portal and the routes

**Files:**
- Modify: `src/lib/scope.js:201` and `:244-248`
- Modify: `src/lib/portals.js` (the `PORTALS` array)
- Modify: `src/App.jsx` (the `/admin` route block, after the `social/ideas` route)
- Create: `src/screens/TrainingGate.jsx`
- Test: `tests/scope.test.js`, `tests/admin-portals.test.jsx`

**Interfaces:**
- Produces: `ADMIN_RIGHTS` includes `'training'`; `adminRightLabel('training') === 'Rugby Performance Director'`; `<TrainingGate>{children}</TrainingGate>` renders children only when `hasAdminRight(memberships, 'training')`, else the "not your job" card.

- [ ] **Step 1: Write the failing tests**

Append to `tests/scope.test.js`:

```js
describe('training right', () => {
  it('is the fourth right and is labelled by the job', () => {
    expect(ADMIN_RIGHTS).toEqual(['youth', 'media', 'pitches', 'training'])
    expect(adminRightLabel('training')).toBe('Rugby Performance Director')
  })
})
```

Append to `tests/admin-portals.test.jsx` (inside the existing describe, using its `admin()`/`memberships()`/`renderAt()` helpers, and add a `<Route path="training" element={<div>Library marker</div>} />` to `renderAt`):

```js
it('offers the Rugby Performance Director card to an admin holding training', () => {
  useMembershipsMock.mockReturnValue(memberships(admin(['training'])))
  renderAt('/admin')
  const card = screen.getByRole('link', { name: /Rugby Performance Director/ })
  expect(card).toHaveAttribute('href', '/admin/training')
})

it('greys the card for an admin without the right, in words', () => {
  useMembershipsMock.mockReturnValue(memberships(admin(['youth'])))
  renderAt('/admin')
  expect(screen.queryByRole('link', { name: /Rugby Performance Director/ })).toBeNull()
  expect(screen.getByText(/Rugby Performance Director/).closest('[data-testid]')).toHaveTextContent(/not been added/i)
})
```

(Check the exact closed-card markup in `PortalChooser.jsx` and match its `data-testid`/wording; the assertion is that the card exists, is not a link, and states the reason.)

- [ ] **Step 2: Run and see them fail**

Run: `npm run test:related -- src/lib/scope.js src/lib/portals.js`
Expected: FAIL — `ADMIN_RIGHTS` has three entries; no card rendered.

- [ ] **Step 3: Implement**

`src/lib/scope.js`:

```js
export const ADMIN_RIGHTS = ['youth', 'media', 'pitches', 'training']
// …
const ADMIN_RIGHT_LABELS = {
  youth: 'Club Youth Manager',
  media: 'Social Media Management',
  pitches: 'Pitch Management',
  // ⚠️ PERSON-SHAPED, AND JAY CHOSE IT ANYWAY (20 Aug 2026) — see
  // claude/plans/2026-08-12-training-session-plans.md §4. The jobs-not-people
  // ruling stands for the other three; this wording is his.
  training: 'Rugby Performance Director',
}
```

`src/lib/portals.js`, appended to `PORTALS`:

```js
  {
    key: 'training',
    right: 'training',
    blurb: 'Drills, session templates, and publishing them to squads.',
    // ⚠️ NESTED LIKE `media`: /admin/training/templates sits under
    // /admin/training, which is why the tab row passes `end` to NavLink.
    tabs: [
      { to: '/admin/training', label: 'Library' },
      { to: '/admin/training/templates', label: 'Templates' },
      { to: '/admin/training/publish', label: 'Publish' },
    ],
  },
```

`src/screens/TrainingGate.jsx`:

```jsx
import Card from '../components/Card.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { adminRightLabel, hasAdminRight } from '../lib/scope.js'

// The "not your job" card the three training tabs wrap themselves in.
//
// ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA. RLS on every training table is
// private.is_admin / can_edit_team; this is a message, never a boundary.
// Repeated per screen because a route is linkable and somebody will paste it.
export default function TrainingGate({ children }) {
  const { memberships } = useMemberships()
  if (hasAdminRight(memberships, 'training')) return children
  const label = adminRightLabel('training')
  return (
    <Card role="alert" className="p-6 text-center">
      <h3 className="text-base font-extrabold text-ink">{label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {label} hasn&apos;t been added to your account. A super admin can add it on the Accounts
        screen.
      </p>
    </Card>
  )
}
```

`src/App.jsx`, after the `social/ideas` route — three routes pointing at screens created in Tasks 6–8. Until those exist, point all three at a placeholder `<TrainingGate><Card>Coming in this branch</Card></TrainingGate>` so the app builds; replace per task.

```jsx
            {/* Rugby Performance Director. Nested like /admin/social. */}
            <Route path="training" element={<TrainingLibrary />} />
            <Route path="training/templates" element={<TrainingTemplates />} />
            <Route path="training/publish" element={<TrainingPublish />} />
```

- [ ] **Step 4: Run tests**

Run: `npm run test:related -- src/lib/scope.js src/lib/portals.js src/App.jsx`
Expected: PASS. ⚠️ Also run `npm run test:related -- tests/admin-rights-editor.test.jsx` — the Accounts rights editor enumerates `ADMIN_RIGHTS` and a test there may count three chips; update the expectation to four with the new label rather than weakening it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scope.js src/lib/portals.js src/App.jsx src/screens/TrainingGate.jsx tests/scope.test.js tests/admin-portals.test.jsx tests/admin-rights-editor.test.jsx
git commit -m "feat(training): the training right, its portal card and routes"
```

---

### Task 3: The contact/tag flag on `/admin/club`

**Files:**
- Modify: `src/data/teams.js` (after `setTeamScoringKinds`)
- Modify: `src/screens/AdminClub.jsx` (the scoring panel, ~line 562–650)
- Test: `tests/admin-club-scoring.test.jsx`

**Interfaces:**
- Produces: `setTeamRequiresContact(teamId, value: boolean) → Promise<team row>`, throws `REFUSED` when RLS filters the write to zero rows (same shape as `setTeamScoringKinds`).

- [ ] **Step 1: Write the failing test**

In `tests/admin-club-scoring.test.jsx`, alongside the existing scoring tests (reuse its mocks; add `setTeamRequiresContact: (...a) => setRequiresContactMock(...a)` to the `../src/data/teams.js` mock):

```js
it('offers a contact/tag switch in the scoring panel and saves the column', async () => {
  const user = userEvent.setup()
  setRequiresContactMock.mockResolvedValue({ id: 't-u12', requires_contact: true })
  renderClub() // the file's existing render helper
  await user.click(screen.getByTestId('scoring-chip-t-u12'))
  const toggle = screen.getByRole('switch', { name: /contact rugby/i })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  await user.click(toggle)
  expect(setRequiresContactMock).toHaveBeenCalledWith('t-u12', true)
})
```

- [ ] **Step 2: Run, see it fail**

Run: `npm run test:related -- src/screens/AdminClub.jsx`
Expected: FAIL — no element with role `switch`.

- [ ] **Step 3: Implement**

`src/data/teams.js`:

```js
/**
 * Marks a squad as contact (true) or tag (false).
 *
 * ⚠️ A COLUMN, NEVER THE NAME AND NEVER THE AGE. Measured 20 Aug 2026: five
 * squad names say nothing either way, and the club runs tag sides above the
 * age contact begins. This flag is the ONLY thing that lets a contact drill be
 * published to a squad. Default false: every squad is tag until somebody here
 * says otherwise. Same zero-row guard as setTeamScoringKinds.
 */
export async function setTeamRequiresContact(teamId, value) {
  if (!teamId) throw new Error(REFUSED)
  const { data, error } = await supabase
    .from('teams')
    .update({ requires_contact: value === true })
    .eq('id', teamId)
    .select()
    .maybeSingle()
  if (error) throw new Error(error.message || REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}
```

`src/screens/AdminClub.jsx` — import `setTeamRequiresContact`; inside the `{scoringTeam && (` card, after the scoring chips `<div>` and before the buttons row:

```jsx
          {/* ⚠️ CONTACT OR TAG IS A FACT ABOUT THE SQUAD, set here beside its
              scoring for the same reason scoring is here: this is the panel
              for "what applies to this squad". It decides which drills may be
              PUBLISHED to it — a tackle drill never reaches a tag squad. Not
              in the name, not from the age: claude/specs/2026-08-21-training-plans-dashboard-design.md §1. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink">Contact rugby</span>
            <button
              type="button"
              role="switch"
              aria-label="Contact rugby"
              aria-checked={scoringTeam.requires_contact === true}
              disabled={saving}
              onClick={() =>
                run(async () => {
                  await setTeamRequiresContact(scoringTeam.id, scoringTeam.requires_contact !== true)
                  await reloadTeams()
                })
              }
              className={[
                CHIP,
                scoringTeam.requires_contact === true
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink hover:border-brand hover:text-brand',
              ].join(' ')}
            >
              {scoringTeam.requires_contact === true ? 'Contact' : 'Tag'}
            </button>
          </div>
```

Also retitle the panel's intro sentence to say "What a coach can record against this squad's fixtures, and whether it plays contact." — the heading `Scoring for …` stays so existing tests hold.

- [ ] **Step 4: Run tests**

Run: `npm run test:related -- src/screens/AdminClub.jsx src/data/teams.js`
Expected: PASS, including the existing scoring tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/teams.js src/screens/AdminClub.jsx tests/admin-club-scoring.test.jsx
git commit -m "feat(club): contact/tag switch per squad — teams.requires_contact"
```

---

### Task 4: Pure logic — `src/lib/trainingPlans.js`

**Files:**
- Create: `src/lib/trainingPlans.js`
- Test: `tests/training-plans-lib.test.js`

**Interfaces:**
- Produces:
  - `DEFAULT_MINUTES = 60`
  - `CATEGORIES = ['warm_up','skill','game','conditioning','cool_down']`, `CATEGORY_LABELS`
  - `totalMinutes(blocks) → number` (sum of `block.minutes`, ignoring non-numbers)
  - `totalWarning(blocks) → string|null` — `null` at exactly 60, else `"This is 65 minutes, not 60. Save anyway?"`
  - `drillFitsTemplate(drill, template) → { ok: boolean, reason: string|null }` — age overlap and contact
  - `squadFitsTemplate(team, template) → { ok, reason }` — uses `ageBandFromTeamName(team.name)`; `null` band → `{ ok:false, reason:"Can't tell this squad's age group from its name" }`; template `requires_contact && !team.requires_contact` → `{ ok:false, reason:'Contact template; this squad is tag' }`; age outside `[min_age, max_age]` → reason naming the band
  - `describePublishRow(row) → string` — `"3 sessions will get the plan · 1 kept (coach edited)"` / `"No training in this range"`

- [ ] **Step 1: Write the failing tests**

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  totalMinutes, totalWarning, drillFitsTemplate, squadFitsTemplate, describePublishRow,
} from '../src/lib/trainingPlans.js'

const T = { min_age: 9, max_age: 13, requires_contact: true }

describe('totals', () => {
  it('sums block minutes and ignores junk', () => {
    expect(totalMinutes([{ minutes: 15 }, { minutes: 20 }, { minutes: 'x' }, {}])).toBe(35)
  })
  it('is silent at 60 and names the arithmetic otherwise', () => {
    expect(totalWarning([{ minutes: 30 }, { minutes: 30 }])).toBeNull()
    expect(totalWarning([{ minutes: 15 }, { minutes: 20 }, { minutes: 30 }])).toBe('This is 65 minutes, not 60. Save anyway?')
    expect(totalWarning([{ minutes: 50 }])).toBe('This is 50 minutes, not 60. Save anyway?')
  })
})

describe('drillFitsTemplate', () => {
  it('accepts a drill whose band overlaps and whose contact matches', () => {
    expect(drillFitsTemplate({ min_age: 10, max_age: null, requires_contact: false }, T).ok).toBe(true)
  })
  it('refuses a contact drill on a tag template, with the reason', () => {
    const r = drillFitsTemplate({ requires_contact: true }, { ...T, requires_contact: false })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/contact/i)
  })
  it('refuses a drill whose minimum age is above the template band', () => {
    expect(drillFitsTemplate({ min_age: 14 }, T).ok).toBe(false)
  })
})

describe('squadFitsTemplate', () => {
  it('refuses an unparseable squad name and SAYS SO — never a default band', () => {
    const r = squadFitsTemplate({ name: 'Senior Men', requires_contact: true }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/can.t tell/i)
  })
  it('refuses a tag squad for a contact template', () => {
    const r = squadFitsTemplate({ name: 'U12 Mixed', requires_contact: false }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/tag/i)
  })
  it('allows a tag template on a contact squad', () => {
    expect(squadFitsTemplate({ name: 'U12 Mixed', requires_contact: true }, { ...T, requires_contact: false }).ok).toBe(true)
  })
  it('refuses a squad outside the band, naming it', () => {
    const r = squadFitsTemplate({ name: 'U16B', requires_contact: true }, T)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/U9.*U13/)
  })
  it('does not read the B in U14B as anything but a squad', () => {
    expect(squadFitsTemplate({ name: 'U12B', requires_contact: true }, T).ok).toBe(true)
  })
})

describe('describePublishRow', () => {
  it('reads the three outcomes', () => {
    expect(describePublishRow({ will_write: 3, skipped_coach_edited: 1, no_events: 0 })).toBe('3 sessions will get the plan · 1 kept (coach edited)')
    expect(describePublishRow({ will_write: 1, skipped_coach_edited: 0, no_events: 0 })).toBe('1 session will get the plan')
    expect(describePublishRow({ will_write: 0, skipped_coach_edited: 0, no_events: 1 })).toBe('No training in this range')
  })
})
```

- [ ] **Step 2: Run, see it fail**

Run: `npm run test:related -- tests/training-plans-lib.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
import { ageBandFromTeamName } from './ageGroup.js'

// Pure decisions for the training-plans feature. No Supabase, no React, so the
// rules that keep a tackle drill off a tag squad are tested in isolation.
// claude/specs/2026-08-21-training-plans-dashboard-design.md

/** The club's hour. A DEFAULT the builder aims at, not a constraint it enforces. */
export const DEFAULT_MINUTES = 60

export const CATEGORIES = ['warm_up', 'skill', 'game', 'conditioning', 'cool_down']
export const CATEGORY_LABELS = {
  warm_up: 'Warm-up',
  skill: 'Skill',
  game: 'Game',
  conditioning: 'Conditioning',
  cool_down: 'Cool-down',
}

/** Sum of block minutes. Non-numbers count as zero rather than poisoning the total. */
export function totalMinutes(blocks) {
  return (blocks ?? []).reduce((sum, block) => sum + (Number.isFinite(block?.minutes) ? block.minutes : 0), 0)
}

/**
 * Null when the blocks make exactly the default hour; otherwise the sentence
 * the builder shows before saving. ⚠️ A QUESTION, NOT A REFUSAL — a wet-night
 * 40 is deliberate; a 65 is the arithmetic slip this exists to catch.
 */
export function totalWarning(blocks) {
  const total = totalMinutes(blocks)
  if (total === DEFAULT_MINUTES) return null
  return `This is ${total} minutes, not ${DEFAULT_MINUTES}. Save anyway?`
}

function bandLabel(min, max) {
  if (min != null && max != null) return `U${min}–U${max}`
  if (min != null) return `U${min} and up`
  if (max != null) return `up to U${max}`
  return 'any age'
}

/** Whether a drill may be offered inside a template: contact, then age overlap. */
export function drillFitsTemplate(drill, template) {
  if (drill?.requires_contact && !template?.requires_contact) {
    return { ok: false, reason: 'Contact drill; this template is tag' }
  }
  const dMin = drill?.min_age ?? null
  const dMax = drill?.max_age ?? null
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if (dMin != null && tMax != null && dMin > tMax) {
    return { ok: false, reason: `Drill is for ${bandLabel(dMin, dMax)}; template is ${bandLabel(tMin, tMax)}` }
  }
  if (dMax != null && tMin != null && dMax < tMin) {
    return { ok: false, reason: `Drill is for ${bandLabel(dMin, dMax)}; template is ${bandLabel(tMin, tMax)}` }
  }
  return { ok: true, reason: null }
}

/**
 * Whether a template may be published to a squad.
 *
 * ⚠️ THE NULL-BAND RULE. ageBandFromTeamName returns null for a name it cannot
 * parse, and null here means "no guidance" — the squad is refused WITH THE
 * REASON, never given a default band. That null once offered a twelve-year-old
 * girls' squad an adult contact form; this is the place it would recur.
 * ⚠️ Contact is read from teams.requires_contact, never from the name.
 */
export function squadFitsTemplate(team, template) {
  const band = ageBandFromTeamName(team?.name)
  if (band === null) {
    return { ok: false, reason: "Can't tell this squad's age group from its name" }
  }
  if (template?.requires_contact && team?.requires_contact !== true) {
    return { ok: false, reason: 'Contact template; this squad is tag' }
  }
  const tMin = template?.min_age ?? null
  const tMax = template?.max_age ?? null
  if ((tMin != null && band < tMin) || (tMax != null && band > tMax)) {
    return { ok: false, reason: `U${band} is outside this template's ${bandLabel(tMin, tMax)}` }
  }
  return { ok: true, reason: null }
}

/** One line per squad on the publish preview. */
export function describePublishRow(row) {
  if (!row || row.no_events) return 'No training in this range'
  const n = row.will_write ?? 0
  const parts = [`${n} ${n === 1 ? 'session' : 'sessions'} will get the plan`]
  if (row.skipped_coach_edited > 0) parts.push(`${row.skipped_coach_edited} kept (coach edited)`)
  return parts.join(' · ')
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:related -- tests/training-plans-lib.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trainingPlans.js tests/training-plans-lib.test.js
git commit -m "feat(training): pure rules — totals, drill/squad fit, preview wording"
```

---

### Task 5: Data layer — `src/data/trainingPlans.js`

**Files:**
- Create: `src/data/trainingPlans.js`
- Test: `tests/training-plans-data.test.js`

**Interfaces:**
- Produces (all async, all throw on `error`, writes throw `REFUSED` on a zero-row RLS result):
  - `listDrills({ includeRetired = false })`, `upsertDrill(drill)`, `setDrillActive(id, active)`
  - `listTemplates({ includeRetired = false })` → each with `blocks` ordered by `position`, each block with `drill:drills(id,title,summary,minutes,category,requires_contact,min_age,max_age)`
  - `saveTemplate(template, blocks)` — upserts the template with `total_minutes = totalMinutes(blocks)`, then replaces its blocks (delete then insert, positions 1..n)
  - `setTemplateActive(id, active)`
  - `listFocus()`, `upsertFocus(focus)`, `deleteFocus(id)` (a focus is a label; deleting it loses nothing)
  - `previewPublish({ templateId, teamIds, from, to })` → rows; `publish({ … })` → rows — both `supabase.rpc('publish_training', { _template, _teams, _from, _to, _preview })`
  - `getSession(eventId)` → `{ …session, blocks:[…with drill] }` or `null`
  - `saveSessionBlocks(sessionId, blocks, notes)` — replaces blocks and sets `coach_edited_at = now()`

- [ ] **Step 1: Write the failing tests**

Mock `../src/lib/supabase` with a chainable builder (copy the helper from `tests/staff-data.test.js`). Assert:

```js
it('previewPublish calls the RPC with _preview true and publish with false', async () => { … })
it('saveTemplate writes total_minutes from the blocks and renumbers positions from 1', async () => { … })
it('saveSessionBlocks stamps coach_edited_at', async () => { … })
it('setDrillActive throws REFUSED when RLS filters the write to zero rows', async () => { … })
```

- [ ] **Step 2: Run, see it fail**

Run: `npm run test:related -- tests/training-plans-data.test.js` → FAIL, module not found.

- [ ] **Step 3: Implement**

```js
import { supabase } from '../lib/supabase'
import { totalMinutes } from '../lib/trainingPlans.js'

// Training plans — read and write. claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ EVERY WRITE CHECKS FOR THE ZERO-ROW RLS RESULT. A non-admin's update
// arrives as data === null, error === null — a successful nothing — and the
// screen would report a save that never happened. Same guard as teams.js.

const REFUSED = "We couldn't save that — you may not have the Rugby Performance Director right."
const DRILL_EMBED = 'drill:drills(id,title,summary,body,source_name,source_url,minutes,category,requires_contact,min_age,max_age,is_active)'

function must(data, error) {
  if (error) throw new Error(error.message || REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}

export async function listDrills({ includeRetired = false } = {}) {
  let q = supabase.from('drills').select('*').order('title')
  if (!includeRetired) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function upsertDrill(drill) {
  const { data, error } = await supabase.from('drills').upsert(drill).select().maybeSingle()
  return must(data, error)
}

export async function setDrillActive(id, active) {
  const { data, error } = await supabase.from('drills').update({ is_active: active }).eq('id', id).select().maybeSingle()
  return must(data, error)
}

export async function listTemplates({ includeRetired = false } = {}) {
  let q = supabase
    .from('session_templates')
    .select(`*, blocks:session_template_blocks(id,position,drill_id,minutes,coach_note,${DRILL_EMBED})`)
    .order('name')
  if (!includeRetired) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  // PostgREST cannot order an embed independently; sort the handful here.
  return (data ?? []).map((t) => ({ ...t, blocks: [...(t.blocks ?? [])].sort((a, b) => a.position - b.position) }))
}

/**
 * Saves a template and REPLACES its blocks. Positions are renumbered 1..n
 * from the order given, so a reorder in the builder is the only source of
 * truth and no gap or duplicate can reach the UNIQUE (template_id, position).
 */
export async function saveTemplate(template, blocks) {
  const row = { ...template, total_minutes: totalMinutes(blocks) }
  const { data, error } = await supabase.from('session_templates').upsert(row).select().maybeSingle()
  const saved = must(data, error)
  const del = await supabase.from('session_template_blocks').delete().eq('template_id', saved.id)
  if (del.error) throw del.error
  if (blocks.length > 0) {
    const ins = await supabase.from('session_template_blocks').insert(
      blocks.map((b, i) => ({
        template_id: saved.id,
        position: i + 1,
        drill_id: b.drill_id,
        minutes: b.minutes,
        coach_note: b.coach_note ?? null,
      })),
    )
    if (ins.error) throw ins.error
  }
  return saved
}

export async function setTemplateActive(id, active) {
  const { data, error } = await supabase.from('session_templates').update({ is_active: active }).eq('id', id).select().maybeSingle()
  return must(data, error)
}

export async function listFocus() {
  const { data, error } = await supabase.from('training_focus').select('*').order('starts_on', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function upsertFocus(focus) {
  const { data, error } = await supabase.from('training_focus').upsert(focus).select().maybeSingle()
  return must(data, error)
}

export async function deleteFocus(id) {
  const { error } = await supabase.from('training_focus').delete().eq('id', id)
  if (error) throw error
}

async function callPublish({ templateId, teamIds, from, to }, preview) {
  const { data, error } = await supabase.rpc('publish_training', {
    _template: templateId,
    _teams: teamIds,
    _from: from,
    _to: to,
    _preview: preview,
  })
  if (error) throw new Error(error.message || REFUSED)
  return data ?? []
}

/** Per-squad counts, writing nothing. The SAME function as publish(). */
export function previewPublish(args) {
  return callPublish(args, true)
}

export function publish(args) {
  return callPublish(args, false)
}

export async function getSession(eventId) {
  if (!eventId) return null
  const { data, error } = await supabase
    .from('training_sessions')
    .select(`*, blocks:training_session_blocks(id,position,drill_id,minutes,coach_note,${DRILL_EMBED})`)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...data, blocks: [...(data.blocks ?? [])].sort((a, b) => a.position - b.position) }
}

/**
 * A coach's adjustment. Replaces the blocks and STAMPS coach_edited_at — the
 * column publish_training reads to leave this session alone from now on.
 */
export async function saveSessionBlocks(sessionId, blocks, notes) {
  const upd = await supabase
    .from('training_sessions')
    .update({ coach_edited_at: new Date().toISOString(), notes: notes ?? null })
    .eq('id', sessionId)
    .select()
    .maybeSingle()
  must(upd.data, upd.error)
  const del = await supabase.from('training_session_blocks').delete().eq('session_id', sessionId)
  if (del.error) throw del.error
  if (blocks.length > 0) {
    const ins = await supabase.from('training_session_blocks').insert(
      blocks.map((b, i) => ({
        session_id: sessionId,
        position: i + 1,
        drill_id: b.drill_id,
        minutes: b.minutes,
        coach_note: b.coach_note ?? null,
      })),
    )
    if (ins.error) throw ins.error
  }
}
```

- [ ] **Step 4: Run tests** → `npm run test:related -- tests/training-plans-data.test.js` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/trainingPlans.js tests/training-plans-data.test.js
git commit -m "feat(training): data layer — drills, templates, focus, sessions, publish RPC"
```

---

### Task 6: Library tab — `TrainingLibrary.jsx`

**Files:**
- Create: `src/screens/TrainingLibrary.jsx`
- Modify: `src/App.jsx` (point the `training` route at it)
- Test: `tests/training-library.test.jsx`

**Interfaces:**
- Consumes: `listDrills`, `upsertDrill`, `setDrillActive`; `CATEGORIES`, `CATEGORY_LABELS`; `TrainingGate`.

- [ ] **Step 1: Write the failing tests** (mock `../src/lib/memberships.jsx` as `admin-portals.test.jsx` does and `../src/data/trainingPlans.js`)

```js
it('shows the not-your-job card without the training right', () => { … expect(screen.getByRole('alert')).toHaveTextContent(/Rugby Performance Director hasn't been added/) })
it('lists drills with category and band, and filters by contact', async () => { … })
it('adds a drill: title, category, minutes, body, contact flag', async () => {
  // fill the form, click Save, expect upsertDrillMock called with { title:'Tackle tech', category:'skill', minutes:15, requires_contact:true, min_age:13, max_age:null, … }
})
it('offers Retire and never Delete', async () => {
  // open a drill; expect a button named /retire/i; expect no button named /delete/i
})
```

- [ ] **Step 2: Run, see fail.**

- [ ] **Step 3: Implement** — one screen, `<TrainingGate>` wrapping: a filter row (category select, "Contact / Tag / Any" chips, "Show retired" toggle), a `Card` list of drills (title, `CATEGORY_LABELS`, `U9–U13` band label, a `Chip` reading Contact when `requires_contact`), and an inline edit `Card` (same layout as AdminClub's league-team panel) with inputs: `title` (required), `summary`, `body` (textarea, 6 rows), `source_name`, `source_url` (type url), `minutes` (number 1–120), `category` (select over `CATEGORIES`), `min_age`/`max_age` (number 4–19, blank = null), `requires_contact` (role=switch as Task 3). Buttons: Save (disabled until title non-empty), Retire/Bring back when editing, Cancel. Errors render with `role="alert"`. The file comment states: library is club-wide, the right is a message, RLS decides.

- [ ] **Step 4: Run tests** → PASS. Then `npm run test:related -- src/App.jsx` still green.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TrainingLibrary.jsx src/App.jsx tests/training-library.test.jsx
git commit -m "feat(training): Library tab — the drill library"
```

---

### Task 7: Templates tab — the hour builder

**Files:**
- Create: `src/screens/TrainingTemplates.jsx`
- Modify: `src/App.jsx`
- Test: `tests/training-templates.test.jsx`

**Interfaces:**
- Consumes: `listTemplates`, `saveTemplate`, `setTemplateActive`, `listDrills`; `totalMinutes`, `totalWarning`, `drillFitsTemplate`.

- [ ] **Step 1: Write the failing tests**

```js
it('shows the running total as blocks are added and marks 60', async () => {
  // add a 30 drill twice; expect text "60 / 60 min" and no warning
})
it('asks before saving 65 and saves on confirm; saves 60 straight away', async () => {
  // 15 + 20 + 30 → click Save → expect dialog text "This is 65 minutes, not 60. Save anyway?" → click "Save anyway" → saveTemplateMock called
  // 30 + 30 → click Save → saveTemplateMock called with no dialog
})
it('offers only drills that fit the template band and contact, and says why for the rest', async () => {
  // template tag U9–U13; library has a contact drill and a U14+ drill; both appear disabled with their reason text
})
it('renumbers positions after a move up', async () => { … })
```

- [ ] **Step 2: Run, see fail.**

- [ ] **Step 3: Implement** — list of templates (name, `total_minutes` min, band, Contact chip, retired dashed) and a builder `Card`: name, min/max age, contact switch, notes; then the block list — each row: drill title, minutes input, ▲/▼ buttons (aria-label "Move up"/"Move down"), coach-note input, Remove; under it "Add a drill" select listing `drills.filter(is_active)` with `drillFitsTemplate` — unfit ones rendered as `<option disabled>` with `— reason` appended; a sticky total line `"{total} / 60 min"` (`aria-live="polite"`), `text-brand` when ≠ 60. Save: if `totalWarning(blocks)` is non-null, show an inline confirm row (`role="alertdialog"`) with the sentence, "Save anyway" and "Keep editing"; else call `saveTemplate` directly. Retire/Bring back. No Delete.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TrainingTemplates.jsx src/App.jsx tests/training-templates.test.jsx
git commit -m "feat(training): Templates tab — the hour builder with a running total"
```

---

### Task 8: Publish tab, with the focus section

**Files:**
- Create: `src/screens/TrainingPublish.jsx`
- Modify: `src/App.jsx`
- Test: `tests/training-publish.test.jsx`

**Interfaces:**
- Consumes: `listTemplates`, `previewPublish`, `publish`, `listFocus`, `upsertFocus`, `deleteFocus`; `squadFitsTemplate`, `describePublishRow`; `useMemberships().teams`.

- [ ] **Step 1: Write the failing tests**

```js
it('disables an unparseable squad and a tag squad for a contact template, with reasons', async () => {
  // teams: U12 Mixed (tag), U14B (contact), Senior Men; template contact U9–U16
  // expect checkbox U12 Mixed disabled + text "Contact template; this squad is tag"
  // expect checkbox Senior Men disabled + text "Can't tell this squad's age group from its name"
  // expect checkbox U14B enabled
})
it('previews before it publishes, and the confirm button carries the counts', async () => {
  // pick template, tick U14B, dates → click Preview → previewPublishMock called with _preview semantics (previewPublish) → row text "3 sessions will get the plan · 1 kept (coach edited)"
  // click "Publish to 1 squad" → publishMock called with same args
})
it('never calls publish without a preview first', async () => { /* Publish button absent until preview rows exist */ })
it('adds a focus for a squad and a date range', async () => { … upsertFocusMock called with { team_id, title, starts_on, ends_on } })
```

- [ ] **Step 2: Run, see fail.**

- [ ] **Step 3: Implement** — Section "Publish a template": template select (active only); squad checklist from `useMemberships().teams` sorted by `sort_order`, each a `role="checkbox"` chip, `disabled` with the `squadFitsTemplate` reason rendered beside it when `!ok`; from/to `<input type="date">` defaulting to today → +28 days (club date via `clubToday()` from `src/lib/eventFormat.js`); "Preview" button → table of `team name | describePublishRow(row)`; "Publish to N squads" button only after a preview exists and the inputs have not changed since (clear rows on any change). Success line: "Published to N squads — M sessions updated, K kept." Section "Focus": list of focus rows (squad, title, dates) with Edit/Remove, and an add form (squad select, title, starts_on, ends_on, notes). ⛔ No weekday anywhere in this file.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/TrainingPublish.jsx src/App.jsx tests/training-publish.test.jsx
git commit -m "feat(training): Publish tab — preview per squad, then publish; focus periods"
```

---

### Task 9: The coach's card — `SessionPlan` on a training event

**Files:**
- Create: `src/components/SessionPlan.jsx`
- Modify: `src/screens/EventDetail.jsx` (import; mount after `<PitchRequest … />` at ~line 646, only when `event.type === 'training'`)
- Test: `tests/session-plan.test.jsx`; add `vi.mock('../src/data/trainingPlans.js', …)` to `tests/event-detail-series.test.jsx` (⚠️ the setup note: an unmocked data module makes a real request in CI and the sheet sits in `loading`)

**Interfaces:**
- Consumes: `getSession`, `saveSessionBlocks`, `listFocus`, `listDrills`; `totalMinutes`.
- Produces: `<SessionPlan event={event} team={team} canEdit={bool} />`, self-contained like `PitchRequest` — decides for itself whether to render (nothing when no session and no focus).

- [ ] **Step 1: Write the failing tests**

```js
it('renders nothing for a training event with no plan', async () => { … })
it('shows the focus, then the blocks in order with minutes, and the body on tap', async () => { … })
it('says "Edited by the coach" when coach_edited_at is set', async () => { … })
it('lets a coach change minutes and save, which stamps the edit', async () => {
  // canEdit; click Adjust; change block 1 minutes 15→10; Save → saveSessionBlocksMock called with (sessionId, [{drill_id, minutes:10, …}, …], notes)
})
it('offers no Adjust without canEdit', async () => { … })
```

- [ ] **Step 2: Run, see fail.**

- [ ] **Step 3: Implement** — `useEffect` loads `getSession(event.id)` and `listFocus()` (filter to `team_id === event.team_id` and the event's club date within `[starts_on, ends_on]`), swallowing read errors into "no plan" the way `PitchRequest` does. Render: `<h4>` "Session plan" in the sheet's section style; focus line `Focus: {title}`; an `<ol>` of blocks — `{minutes} min · {drill.title}` with `CATEGORY_LABELS`, a `<details>` holding `summary`/`body`/source link (`target="_blank" rel="noreferrer"`); total line; "Edited by the coach" `Chip` when set. With `canEdit`: an "Adjust" button toggling edit mode — minutes inputs, move up/down, remove, add-a-drill select (`listDrills`, active only; ⚠️ here the fit check is against the SQUAD via `squadFitsTemplate(team, { requires_contact: drill.requires_contact, min_age: drill.min_age, max_age: drill.max_age })` — the same null-band rule), a notes textarea, Save/Cancel.

- [ ] **Step 4: Run tests** → `npm run test:related -- src/components/SessionPlan.jsx src/screens/EventDetail.jsx` PASS, including the existing series tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionPlan.jsx src/screens/EventDetail.jsx tests/session-plan.test.jsx tests/event-detail-series.test.jsx
git commit -m "feat(training): the session plan on a training event, adjustable by the coach"
```

---

### Task 10: Docs, full suite, live check, PR

**Files:**
- Modify: `claude/plans/2026-08-12-training-session-plans.md` (status line → `SHIPPED (pieces 1–3) — see claude/specs/2026-08-21-training-plans-dashboard-design.md`), this file's status line, `claude/specs/2026-08-21-training-plans-dashboard-design.md` (§1: the flag lives on `/admin/club`, not `/admin/staff`), `claude/changelog.md` (new top entry, **no branch SHA** — the next PR cites the squash), `claude/state-of-play.md` (move training plans from tabled/reopened to shipped; note pieces 4–5 outstanding), `claude/schema-history.md` (a `20260821_training_plans` section: what was measured after applying)

- [ ] **Step 1: Edit the docs as listed.** Run `npm run docs:check` → `All documentation checks passed.` (⚠️ the changelog one-behind rule: leave the new entry unSHA'd.)

- [ ] **Step 2: Full suite**

Run: `npm test`
Expected: every file green. Paste the summary line into the PR description.

- [ ] **Step 3: Build**

Run: `npm run build` → succeeds. (A Netlify deploy preview builds on the PR anyway; this catches an import typo before it costs 15 credits.)

- [ ] **Step 4: Commit and open the PR**

```bash
git add claude/plans/2026-08-12-training-session-plans.md claude/plans/2026-08-21-training-plans-implementation.md claude/specs/2026-08-21-training-plans-dashboard-design.md claude/changelog.md claude/state-of-play.md claude/schema-history.md
git commit -m "docs(training): mark pieces 1-3 shipped; changelog, state-of-play, schema-history"
git push -u origin claude/rugby-performance-dashboard-001473
gh pr create --base main --title "feat(training): Rugby Performance Director dashboard (pieces 1–3)" --body-file <the description>
```

⚠️ **Do not merge.** `main` is production; Jay merges after reading the diff. The PR body lists: the migration already applied to production (and the `list_migrations` proof), the harness's six lines, the full-suite line, and what is out of scope (notification, AI, first/second pair).

- [ ] **Step 5: After Jay merges — verify live**, per rule 6: sign in as a super admin on https://adhquins-clubhub.com, confirm the portal card, add one drill, one template, publish to one squad for one week with the preview, open that squad's training event and see the plan. Record the outcome in the next handoff.

## Self-review

- **Spec coverage:** §1 schema → Task 1 (+ Task 3 for the UI of the column); §2 right → Task 2; §3 three tabs → Tasks 6–8; §4 coach side → Task 9; §5 testing → each task's tests + Task 1's harness; out-of-scope list → restated in Task 10's PR body.
- **Correction to the spec found while planning:** the spec says `requires_contact` is set on `/admin/staff`; per-squad rules actually live on `/admin/club` (the scoring panel). Task 10 fixes the spec; Task 3 builds it in the right place.
- **Type consistency:** `publish_training` returns `team_id, will_write, skipped_coach_edited, no_events` in SQL, the harness, `describePublishRow` and the Publish screen. `coach_edited_at` is the column name in the migration, `saveSessionBlocks`, the harness and `SessionPlan`. `requires_contact` is the name on `teams`, `drills`, `session_templates` and in `squadFitsTemplate`/`drillFitsTemplate`.
- **Placeholders:** Tasks 6–9 describe screens in prose plus test code rather than full JSX, deliberately — the JSX follows `AdminClub.jsx`'s panel pattern, which the implementer is told to copy, and a 400-line listing here would drift from it. Every behaviour is pinned by a named test.
