-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — training-diagrams bucket: who may read a schematic, who may
--  upload one. Inlines db/migrations/20260827_drill_diagram_url.sql (minus
--  begin/commit) so it is runnable before that migration is applied. SAFE ON
--  PRODUCTION: one transaction, rolled back. Invented people only.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS.
--   READ  — any signed-in person (the bucket is public; diagrams are cones
--     and letters, never a child's face). A parent can SELECT an object.
--   WRITE — matches drill manage: admin of the club, or squad staff of a
--     SQUAD-OWNED drill. A parent cannot upload. A coach cannot upload
--     under a club-library drill (team_id null).
--
-- ⚠️ THE SELF-TEST REPLACES the write helper with `select true` and the
-- parent INSERT must then succeed. Without that, "parent cannot upload" is
-- equally explained by "nobody can insert into this bucket".

begin;

create temporary table _r (seq int, detail text) on commit drop;
grant select, insert on _r to authenticated;

alter table public.drills
  add column if not exists diagram_url text;
comment on column public.drills.diagram_url is
  'Public URL of a schematic pitch drawing (cones, letters, arrows). NULL means no diagram. Never a photograph of a person. Not stored in drills.body.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'training-diagrams',
  'training-diagrams',
  true,
  2097152,
  array['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']
)
on conflict (id) do nothing;

create or replace function private.training_diagram_drill(_key text)
returns uuid
language sql
immutable
set search_path to ''
as $function$
  select case
    when split_part(_key, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
    else null
  end;
$function$;

revoke execute on function private.training_diagram_drill(text) from public;
revoke execute on function private.training_diagram_drill(text) from anon;
grant execute on function private.training_diagram_drill(text) to authenticated;

create or replace function private.can_write_training_diagram(_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.drills d
    where d.id = private.training_diagram_drill(_key)
      and (
        private.is_admin(d.club_id)
        or (d.team_id is not null and private.can_edit_team(d.team_id))
      )
  );
$function$;

revoke execute on function private.can_write_training_diagram(text) from public;
revoke execute on function private.can_write_training_diagram(text) from anon;
grant execute on function private.can_write_training_diagram(text) to authenticated;

drop policy if exists "training diagram read" on storage.objects;
create policy "training diagram read" on storage.objects
  for select
  using (bucket_id = 'training-diagrams');

drop policy if exists "training diagram write" on storage.objects;
create policy "training diagram write" on storage.objects
  for all
  using (
    bucket_id = 'training-diagrams'
    and private.can_write_training_diagram(name)
  )
  with check (
    bucket_id = 'training-diagrams'
    and private.can_write_training_diagram(name)
  );

-- ── Fixture: throwaway club, two squads, coach / parent / admin ───────────
insert into public.clubs (id, name) values
  ('d1000000-0000-4000-8000-000000000001', 'Harness Diagram Club');
insert into public.teams (id, club_id, name) values
  ('d1000000-0000-4000-8000-000000000010', 'd1000000-0000-4000-8000-000000000001', 'ZZ Diagram U13'),
  ('d1000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000001', 'ZZ Diagram U15');
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('d1000000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.diagram.coach@example.invalid', now(), now()),
  ('d1000000-0000-4000-8000-000000000023','00000000-0000-0000-0000-000000000000','authenticated','authenticated','h.diagram.parent@example.invalid', now(), now()),
  ('d1000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000000','authenticated','authenticated','h.diagram.admin@example.invalid', now(), now());
insert into public.profiles (id, full_name, email) values
  ('d1000000-0000-4000-8000-000000000021','H Diagram Coach','h.diagram.coach@example.invalid'),
  ('d1000000-0000-4000-8000-000000000023','H Diagram Parent','h.diagram.parent@example.invalid'),
  ('d1000000-0000-4000-8000-000000000024','H Diagram Admin','h.diagram.admin@example.invalid')
on conflict (id) do nothing;
insert into public.players (id, club_id, team_id, full_name) values
  ('d1000000-0000-4000-8000-000000000061','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010','H Diagram Child');
insert into public.memberships (profile_id, club_id, team_id, role, status, player_id) values
  ('d1000000-0000-4000-8000-000000000021','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010','coach','active',null),
  ('d1000000-0000-4000-8000-000000000023','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010','parent','active','d1000000-0000-4000-8000-000000000061'),
  ('d1000000-0000-4000-8000-000000000024','d1000000-0000-4000-8000-000000000001',null,'admin','active',null);

-- Club-library drill (Director) and a squad-owned drill (the coach).
insert into public.drills (id, club_id, team_id, title, category) values
  ('d1000000-0000-4000-8000-000000000041','d1000000-0000-4000-8000-000000000001',null,'H club angle track','skill'),
  ('d1000000-0000-4000-8000-000000000042','d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000010','H squad angle track','skill');

-- Seed one object as owner so the parent READ has something to find.
insert into storage.objects (bucket_id, name)
values ('training-diagrams','d1000000-0000-4000-8000-000000000041/seed.svg');

-- 1  parent READ of a diagram (expect 1)
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000023","role":"authenticated"}', true);
set local role authenticated;
insert into _r
select 1, count(*)::text
from storage.objects
where bucket_id = 'training-diagrams'
  and name = 'd1000000-0000-4000-8000-000000000041/seed.svg';

-- 2  parent WRITE under the club drill (expect refused)
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('training-diagrams','d1000000-0000-4000-8000-000000000041/parent.svg');
  insert into _r values (2, 'allowed');
exception when others then
  insert into _r values (2, 'refused ('||sqlstate||')');
end $$;

-- 3  coach WRITE under their squad drill (expect allowed)
reset role;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000021","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('training-diagrams','d1000000-0000-4000-8000-000000000042/coach.svg');
  insert into _r values (3, 'allowed');
exception when others then
  insert into _r values (3, 'refused ('||sqlstate||')');
end $$;

-- 4  coach WRITE under a club-library drill (expect refused)
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('training-diagrams','d1000000-0000-4000-8000-000000000041/coach-club.svg');
  insert into _r values (4, 'allowed');
exception when others then
  insert into _r values (4, 'refused ('||sqlstate||')');
end $$;

-- 5  admin WRITE under the club drill (expect allowed)
reset role;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000024","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('training-diagrams','d1000000-0000-4000-8000-000000000041/admin.svg');
  insert into _r values (5, 'allowed');
exception when others then
  insert into _r values (5, 'refused ('||sqlstate||')');
end $$;

-- 6  malformed key (expect refused — fail closed, not a 500)
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('training-diagrams','not-a-drill/x.svg');
  insert into _r values (6, 'allowed');
exception when others then
  insert into _r values (6, 'refused ('||sqlstate||')');
end $$;

-- ── SELF-TEST: if the helper always returns true, the parent INSERT that
-- failed in (2) must now succeed. Otherwise (2) proved nothing.
reset role;
create or replace function private.can_write_training_diagram(_key text)
returns boolean
language sql
stable
as $function$
  select true;
$function$;
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000023","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name)
  values ('training-diagrams','d1000000-0000-4000-8000-000000000041/parent-selftest.svg');
  insert into _r values (7, 'allowed');
exception when others then
  insert into _r values (7, 'refused ('||sqlstate||')');
end $$;

reset role;
select seq, detail from _r order by seq;

do $$
declare
  d text;
begin
  select detail into d from _r where seq=1; if d <> '1' then raise exception 'FAIL 1 parent read: %', d; end if;
  select detail into d from _r where seq=2; if d not like 'refused%' then raise exception 'FAIL 2 parent write: %', d; end if;
  select detail into d from _r where seq=3; if d <> 'allowed' then raise exception 'FAIL 3 coach squad write: %', d; end if;
  select detail into d from _r where seq=4; if d not like 'refused%' then raise exception 'FAIL 4 coach club write: %', d; end if;
  select detail into d from _r where seq=5; if d <> 'allowed' then raise exception 'FAIL 5 admin club write: %', d; end if;
  select detail into d from _r where seq=6; if d not like 'refused%' then raise exception 'FAIL 6 malformed key: %', d; end if;
  select detail into d from _r where seq=7; if d <> 'allowed' then raise exception 'FAIL SELF-TEST: parent insert still refused after helper always-true (%). The write policy is not consulting can_write_training_diagram, so check 2 is vacuous.', d; end if;
  raise notice 'SELF-TEST PASSED — training-diagrams: parent reads, cannot upload; coach uploads a squad drill not a club drill; admin uploads a club drill; malformed key fails closed.';
end $$;

rollback;
