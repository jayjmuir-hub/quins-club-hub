-- 27 Aug 2026 — training shelf: chips, likes, favorites, featured.
-- Spec: claude/specs/2026-08-27-training-shelf.md
--
-- Additive. No seed. Empty library stays empty. Does not touch events,
-- memberships, chat, or teams.requires_contact.
--
-- ⚠️ apply_migration strips `--` comments; COMMENT ON is what reaches the DB.
-- IDEMPOTENT so db/tests/training-shelf.sql can inline it inside a
-- transaction that rolls back.

begin;

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

commit;
