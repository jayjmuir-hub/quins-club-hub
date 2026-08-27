-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — training shelf RLS: club-hour insert, own-update, featured,
--  likes/favorites, retire-not-delete. Inlines
--  db/migrations/20260827_training_shelf.sql (minus begin/commit) so it is
--  runnable before that migration is applied. SAFE ON PRODUCTION: one
--  transaction, rolled back. Invented people only.
--
--  Existing training-plan proofs live in db/tests/training-plans.sql and
--  db/tests/coach-training-plans.sql and are not replaced by this file.
-- ══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _r (seq int, detail text) on commit drop;
grant select, insert on _r to authenticated;



-- ── columns ──────────────────────────────────────────────────────────────
alter table public.drills
  add column if not exists slug text,
  add column if not exists is_featured boolean not null default false;
comment on column public.drills.slug is
  'Stable identifier unique per club. NULL on rows that have none; uniqueness is on the values that exist.';
comment on column public.drills.is_featured is
  'Director-only pin for the shelf featured row. Default false. A non-admin write that changes this is refused.';

alter table public.session_templates
  add column if not exists slug text,
  add column if not exists chip_label text,
  add column if not exists is_featured boolean not null default false;
comment on column public.session_templates.slug is
  'Stable identifier unique per club. NULL on rows that have none.';
comment on column public.session_templates.chip_label is
  'When set, Squad Training draws a focus chip that applies this hour to tonight. NULL means not a chip.';
comment on column public.session_templates.is_featured is
  'Director-only pin. Default false. A non-admin write that changes this is refused.';

create unique index if not exists drills_club_id_slug_key
  on public.drills (club_id, slug) where slug is not null;
create unique index if not exists session_templates_club_id_slug_key
  on public.session_templates (club_id, slug) where slug is not null;

-- New club-library inserts stamp the author without the client sending it
-- (same default training_sessions.created_by already has).
alter table public.session_templates alter column created_by set default auth.uid();

-- ── likes and favorites ──────────────────────────────────────────────────
create table if not exists public.drill_likes (
  drill_id   uuid not null references public.drills(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drill_id, profile_id)
);
create table if not exists public.template_likes (
  template_id uuid not null references public.session_templates(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (template_id, profile_id)
);
create table if not exists public.drill_favorites (
  drill_id   uuid not null references public.drills(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drill_id, profile_id)
);
create table if not exists public.template_favorites (
  template_id uuid not null references public.session_templates(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (template_id, profile_id)
);

comment on table public.drill_likes is
  'Heart on a drill. Public count; owner is profile_id. Cascades off the drill. Does not relax ON DELETE RESTRICT on session blocks.';
comment on table public.drill_favorites is
  'Personal star on a drill. Not a public count. Separate from likes.';

alter table public.drill_likes enable row level security;
alter table public.template_likes enable row level security;
alter table public.drill_favorites enable row level security;
alter table public.template_favorites enable row level security;

revoke all on public.drill_likes from authenticated;
revoke all on public.template_likes from authenticated;
revoke all on public.drill_favorites from authenticated;
revoke all on public.template_favorites from authenticated;
grant select, insert, delete on public.drill_likes to authenticated;
grant select, insert, delete on public.template_likes to authenticated;
grant select, insert, delete on public.drill_favorites to authenticated;
grant select, insert, delete on public.template_favorites to authenticated;

drop policy if exists "drill like read" on public.drill_likes;
drop policy if exists "drill like insert" on public.drill_likes;
drop policy if exists "drill like delete" on public.drill_likes;
create policy "drill like read" on public.drill_likes for select using ((select auth.uid()) is not null);
create policy "drill like insert" on public.drill_likes for insert with check (profile_id = (select auth.uid()));
create policy "drill like delete" on public.drill_likes for delete using (profile_id = (select auth.uid()));

drop policy if exists "template like read" on public.template_likes;
drop policy if exists "template like insert" on public.template_likes;
drop policy if exists "template like delete" on public.template_likes;
create policy "template like read" on public.template_likes for select using ((select auth.uid()) is not null);
create policy "template like insert" on public.template_likes for insert with check (profile_id = (select auth.uid()));
create policy "template like delete" on public.template_likes for delete using (profile_id = (select auth.uid()));

drop policy if exists "drill favorite read" on public.drill_favorites;
drop policy if exists "drill favorite insert" on public.drill_favorites;
drop policy if exists "drill favorite delete" on public.drill_favorites;
create policy "drill favorite read" on public.drill_favorites for select using ((select auth.uid()) is not null);
create policy "drill favorite insert" on public.drill_favorites for insert with check (profile_id = (select auth.uid()));
create policy "drill favorite delete" on public.drill_favorites for delete using (profile_id = (select auth.uid()));

drop policy if exists "template favorite read" on public.template_favorites;
drop policy if exists "template favorite insert" on public.template_favorites;
drop policy if exists "template favorite delete" on public.template_favorites;
create policy "template favorite read" on public.template_favorites for select using ((select auth.uid()) is not null);
create policy "template favorite insert" on public.template_favorites for insert with check (profile_id = (select auth.uid()));
create policy "template favorite delete" on public.template_favorites for delete using (profile_id = (select auth.uid()));

-- ── club-hour insert / own update (templates only) ───────────────────────
-- Existing "template manage" stays: admin, or squad-owned with can_edit_team.
-- Drill INSERT is NOT widened — a coach still cannot insert a club drill.
drop policy if exists "template club insert" on public.session_templates;
create policy "template club insert" on public.session_templates for insert
  with check (
    team_id is null
    and created_by = (select auth.uid())
    and is_featured = false
    and exists (
      select 1
        from public.memberships m
        join public.teams t on t.id = m.team_id
       where m.profile_id = (select auth.uid())
         and m.status = 'active'
         and m.role in ('coach','manager','medic')
         and t.club_id = session_templates.club_id
    )
  );

drop policy if exists "template own write" on public.session_templates;
create policy "template own write" on public.session_templates for update
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- Blocks of a club hour the author just inserted. Squad-owned and admin
-- paths on "template block manage" stay.
drop policy if exists "template block manage" on public.session_template_blocks;
create policy "template block manage" on public.session_template_blocks for all
  using (exists (
    select 1 from public.session_templates t
     where t.id = template_id
       and (
         private.is_admin(t.club_id)
         or (t.team_id is not null and private.can_edit_team(t.team_id))
         or t.created_by = (select auth.uid())
       )
  ))
  with check (exists (
    select 1 from public.session_templates t
     where t.id = template_id
       and (
         private.is_admin(t.club_id)
         or (t.team_id is not null and private.can_edit_team(t.team_id))
         or t.created_by = (select auth.uid())
       )
  ));

-- ── is_featured: admin only ──────────────────────────────────────────────
create or replace function private.guard_training_featured()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.is_featured and not private.is_admin(new.club_id) then
      raise exception 'only an admin may feature a drill or hour' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.is_featured is distinct from old.is_featured and not private.is_admin(new.club_id) then
      raise exception 'only an admin may feature a drill or hour' using errcode = '42501';
    end if;
  end if;
  return new;
end
$fn$;

drop trigger if exists drills_guard_featured on public.drills;
create trigger drills_guard_featured
  before insert or update on public.drills
  for each row execute function private.guard_training_featured();

drop trigger if exists session_templates_guard_featured on public.session_templates;
create trigger session_templates_guard_featured
  before insert or update on public.session_templates
  for each row execute function private.guard_training_featured();


-- ── Fixture: throwaway club, tag + contact squads, coach / parent / admin ──
insert into public.clubs (id, name) values
  ('s0000000-0000-4000-8000-000000000001', 'Harness Shelf Club');
insert into public.teams (id, club_id, name, requires_contact) values
  ('s0000000-0000-4000-8000-000000000010', 's0000000-0000-4000-8000-000000000001', 'ZZ Shelf U12G QR', false),
  ('s0000000-0000-4000-8000-000000000011', 's0000000-0000-4000-8000-000000000001', 'ZZ Shelf U16B', true);
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('s0000000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s.coach@example.invalid', now(), now()),
  ('s0000000-0000-4000-8000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s.coach2@example.invalid', now(), now()),
  ('s0000000-0000-4000-8000-000000000023','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s.parent@example.invalid', now(), now()),
  ('s0000000-0000-4000-8000-000000000024','00000000-0000-0000-0000-000000000000','authenticated','authenticated','s.admin@example.invalid', now(), now());
insert into public.profiles (id, full_name, email) values
  ('s0000000-0000-4000-8000-000000000021','S Coach','s.coach@example.invalid'),
  ('s0000000-0000-4000-8000-000000000022','S Coach Two','s.coach2@example.invalid'),
  ('s0000000-0000-4000-8000-000000000023','S Parent','s.parent@example.invalid'),
  ('s0000000-0000-4000-8000-000000000024','S Admin','s.admin@example.invalid')
on conflict (id) do nothing;
insert into public.players (id, club_id, team_id, full_name) values
  ('s0000000-0000-4000-8000-000000000061','s0000000-0000-4000-8000-000000000001','s0000000-0000-4000-8000-000000000010','S Child');
insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
  ('s0000000-0000-4000-8000-000000000021','s0000000-0000-4000-8000-000000000001','s0000000-0000-4000-8000-000000000010','coach','active',null),
  ('s0000000-0000-4000-8000-000000000022','s0000000-0000-4000-8000-000000000001','s0000000-0000-4000-8000-000000000011','coach','active',null),
  ('s0000000-0000-4000-8000-000000000023','s0000000-0000-4000-8000-000000000001','s0000000-0000-4000-8000-000000000010','parent','active','s0000000-0000-4000-8000-000000000061'),
  ('s0000000-0000-4000-8000-000000000024','s0000000-0000-4000-8000-000000000001',null,'admin','active',null);

-- A drill in a template, for the restrict-FK proof.
insert into public.drills (id, club_id, title, category) values
  ('s0000000-0000-4000-8000-000000000041','s0000000-0000-4000-8000-000000000001','S shelf drill','skill');
insert into public.session_templates (id, club_id, name, total_minutes, created_by) values
  ('s0000000-0000-4000-8000-000000000051','s0000000-0000-4000-8000-000000000001','S other hour', 10, 's0000000-0000-4000-8000-000000000022');
insert into public.session_template_blocks (template_id, position, drill_id, minutes)
values ('s0000000-0000-4000-8000-000000000051', 1, 's0000000-0000-4000-8000-000000000041', 10);

-- 1. squad-staff insert of a club template succeeds
select set_config('request.jwt.claims','{"sub":"s0000000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.session_templates (id, club_id, name, team_id, is_featured)
  values ('s0000000-0000-4000-8000-000000000052','s0000000-0000-4000-8000-000000000001','S coach hour', null, false);
  insert into _r values (1, 'allowed');
exception when others then insert into _r values (1, 'refused ('||sqlstate||')'); end $$;

-- 2. parent insert refused
reset role;
select set_config('request.jwt.claims','{"sub":"s0000000-0000-4000-8000-000000000023","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into public.session_templates (id, club_id, name, team_id)
  values ('s0000000-0000-4000-8000-000000000053','s0000000-0000-4000-8000-000000000001','S parent hour', null);
  insert into _r values (2, 'allowed');
exception when others then insert into _r values (2, 'refused ('||sqlstate||')'); end $$;

-- 3. coach may update own template
reset role;
select set_config('request.jwt.claims','{"sub":"s0000000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin
  update public.session_templates set notes = 'mine' where id = 's0000000-0000-4000-8000-000000000052';
  get diagnostics n = row_count;
  insert into _r values (3, case when n = 1 then 'allowed' else 'refused (0 rows)' end);
exception when others then insert into _r values (3, 'refused ('||sqlstate||')'); end $$;

-- 4. coach may not update someone else's
do $$ declare n int; begin
  update public.session_templates set notes = 'hijack' where id = 's0000000-0000-4000-8000-000000000051';
  get diagnostics n = row_count;
  insert into _r values (4, case when n = 0 then 'refused (0 rows)' else 'allowed' end);
exception when others then insert into _r values (4, 'refused ('||sqlstate||')'); end $$;

-- 5. admin may update either
reset role;
select set_config('request.jwt.claims','{"sub":"s0000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;
do $$ declare n int; begin
  update public.session_templates set notes = 'admin' where id in ('s0000000-0000-4000-8000-000000000051','s0000000-0000-4000-8000-000000000052');
  get diagnostics n = row_count;
  insert into _r values (5, case when n = 2 then 'allowed' else 'refused n='||n end);
exception when others then insert into _r values (5, 'refused ('||sqlstate||')'); end $$;

-- 6. non-admin setting is_featured refused
reset role;
select set_config('request.jwt.claims','{"sub":"s0000000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  update public.session_templates set is_featured = true where id = 's0000000-0000-4000-8000-000000000052';
  insert into _r values (6, 'allowed');
exception when insufficient_privilege then insert into _r values (6, 'refused 42501');
when others then insert into _r values (6, 'refused ('||sqlstate||')'); end $$;

-- 7. like unique (drill_id, profile_id)
do $$ begin
  insert into public.drill_likes (drill_id, profile_id) values ('s0000000-0000-4000-8000-000000000041','s0000000-0000-4000-8000-000000000021');
  insert into public.drill_likes (drill_id, profile_id) values ('s0000000-0000-4000-8000-000000000041','s0000000-0000-4000-8000-000000000021');
  insert into _r values (7, 'allowed duplicate');
exception when unique_violation then insert into _r values (7, 'refused 23505');
when others then insert into _r values (7, 'refused ('||sqlstate||')'); end $$;

-- 8. deleting the like does not touch the drill; favorite is a separate row
do $$ declare n int; f int; begin
  delete from public.drill_likes where drill_id = 's0000000-0000-4000-8000-000000000041' and profile_id = 's0000000-0000-4000-8000-000000000021';
  insert into public.drill_favorites (drill_id, profile_id) values ('s0000000-0000-4000-8000-000000000041','s0000000-0000-4000-8000-000000000021');
  select count(*) into n from public.drills where id = 's0000000-0000-4000-8000-000000000041';
  select count(*) into f from public.drill_favorites where drill_id = 's0000000-0000-4000-8000-000000000041';
  insert into _r values (8, case when n = 1 and f = 1 then 'allowed' else 'fail n='||n||' f='||f end);
exception when others then insert into _r values (8, 'refused ('||sqlstate||')'); end $$;

-- 9. deleting a drill that is in a template is still 23503
reset role;
do $$ begin
  delete from public.drills where id = 's0000000-0000-4000-8000-000000000041';
  insert into _r values (9, 'allowed');
exception when foreign_key_violation then insert into _r values (9, 'refused 23503');
when others then insert into _r values (9, 'refused ('||sqlstate||')'); end $$;

do $$
declare
  d text;
begin
  select detail into d from _r where seq=1; if d <> 'allowed' then raise exception 'FAIL 1 staff insert template: %', d; end if;
  select detail into d from _r where seq=2; if d not like 'refused%' then raise exception 'FAIL 2 parent insert: %', d; end if;
  select detail into d from _r where seq=3; if d <> 'allowed' then raise exception 'FAIL 3 coach update own: %', d; end if;
  select detail into d from _r where seq=4; if d not like 'refused%' then raise exception 'FAIL 4 coach update other: %', d; end if;
  select detail into d from _r where seq=5; if d <> 'allowed' then raise exception 'FAIL 5 admin update either: %', d; end if;
  select detail into d from _r where seq=6; if d not like 'refused%' then raise exception 'FAIL 6 non-admin feature: %', d; end if;
  select detail into d from _r where seq=7; if d <> 'refused 23505' then raise exception 'FAIL 7 like unique: %', d; end if;
  select detail into d from _r where seq=8; if d <> 'allowed' then raise exception 'FAIL 8 like delete vs favorite: %', d; end if;
  select detail into d from _r where seq=9; if d <> 'refused 23503' then raise exception 'FAIL 9 delete drill in template: %', d; end if;
  raise notice 'SELF-TEST PASSED — shelf proofs: staff may insert a club hour, parents may not; own-update holds; featured is admin-only; likes unique; favorites separate; drill-in-template still 23503.';
end $$;

rollback;
