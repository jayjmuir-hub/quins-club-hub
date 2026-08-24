-- Harness for db/migrations/20260824_nicknames.sql.
-- Run with `npm run db:check -- nicknames`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes; the
-- begin/commit pair is stripped — the harness owns the transaction).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. an owner sets, edits and clears their own label; the length check bites
--  2. labels are INVISIBLE across accounts (with a seeing control)
--  3. writing a label AS somebody else is refused
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000d1','ZZ Nickprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-nick-one@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-nick-two@example.invalid', now(),'{}'::jsonb, now(), now());

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260824_nicknames.sql, verbatim ──
-- (begin/commit stripped — the harness owns the transaction)

create table if not exists public.nicknames (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 1 and 40),
  created_at  timestamptz not null default now(),
  primary key (owner_id, profile_id)
);

alter table public.nicknames enable row level security;
grant select, insert, update, delete on public.nicknames to authenticated;
-- Supabase's default privileges can hand anon a grant on new tables;
-- revoke by name so the capture in db/schema/grants.sql states a fact.
revoke all on public.nicknames from public, anon;

drop policy if exists "nickname read own" on public.nicknames;
create policy "nickname read own" on public.nicknames
  for select using (owner_id = (select auth.uid()));

drop policy if exists "nickname write own" on public.nicknames;
create policy "nickname write own" on public.nicknames
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "nickname edit own" on public.nicknames;
create policy "nickname edit own" on public.nicknames
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "nickname remove own" on public.nicknames;
create policy "nickname remove own" on public.nicknames
  for delete using (owner_id = (select auth.uid()));

-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_nicknames() returns void language plpgsql as $fn$
declare
  n int; caught text; lbl text;
  one constant uuid := 'f0000000-0000-4000-8000-0000000000a1';
  two constant uuid := 'f0000000-0000-4000-8000-0000000000a2';
begin
  -- 1: own label CRUD, and the length check
  perform pg_temp.as_user(one::text);
  insert into nicknames (owner_id, profile_id, label) values (one, two, 'Zz Coach Probe');
  update nicknames set label = 'Zz Skipper' where owner_id = one and profile_id = two;
  select label into lbl from nicknames where owner_id = one and profile_id = two;
  if lbl <> 'Zz Skipper' then raise exception 'ASSERT 1 FAILED: label reads %', lbl; end if;
  begin
    insert into nicknames (owner_id, profile_id, label) values (one, one, repeat('x', 41));
    caught := null;
  exception when check_violation then caught := 'len'; end;
  if caught is distinct from 'len' then raise exception 'ASSERT 1 FAILED: a 41-char label was accepted'; end if;
  delete from nicknames where owner_id = one and profile_id = two;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: could not clear own label'; end if;
  insert into _log(line) values ('1 own label: set, edit, clear; 41 chars refused');

  -- 2: invisible across accounts (with a seeing control)
  perform pg_temp.as_user(one::text);
  insert into nicknames (owner_id, profile_id, label) values (one, two, 'Zz Skipper');
  select count(*) into n from nicknames;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: control — owner sees % row(s)', n; end if;
  reset role;
  perform pg_temp.as_user(two::text);
  select count(*) into n from nicknames;
  reset role;
  if n <> 0 then raise exception 'ASSERT 2 FAILED: somebody else sees % label(s)', n; end if;
  insert into _log(line) values ('2 labels invisible across accounts (owner-sees control passed)');

  -- 3: writing as somebody else is refused
  perform pg_temp.as_user(two::text);
  begin
    insert into nicknames (owner_id, profile_id, label) values (one, two, 'Zz Forged');
    caught := null;
  exception when others then caught := 'forged'; end;
  reset role;
  if caught is distinct from 'forged' then raise exception 'ASSERT 3 FAILED: wrote a label as somebody else'; end if;
  insert into _log(line) values ('3 a label in somebody else''s name is refused');
end $fn$;

select pg_temp.assert_nicknames();

select line from _log order by seq;

rollback;
