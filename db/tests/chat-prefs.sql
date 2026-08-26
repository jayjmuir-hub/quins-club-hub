-- Harness for db/migrations/20260824_chat_prefs.sql and
-- db/migrations/20260826_chat_background.sql (the wallpaper column).
-- Run with `npm run db:check -- chat-prefs`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything ROLLS BACK.
-- The migrations are INLINED VERBATIM below (regenerate if they change; the
-- begin/commit pairs are stripped — the harness owns the transaction).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. an owner pins, archives, flips back, and clears their own pref rows
--  2. prefs are INVISIBLE across accounts (with a seeing control)
--  3. writing a pref AS somebody else is refused
--  4. the wallpaper: set, clear back to default, over-long value refused
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000d4','ZZ Prefprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-0000000000d5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-pref-one@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000d6','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-pref-two@example.invalid', now(),'{}'::jsonb, now(), now());

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260824_chat_prefs.sql, verbatim ──
-- (begin/commit stripped — the harness owns the transaction)

create table if not exists public.chat_prefs (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  chat_key    text not null check (length(chat_key) between 1 and 80),
  pinned      boolean not null default false,
  archived    boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (owner_id, chat_key)
);

alter table public.chat_prefs enable row level security;
grant select, insert, update, delete on public.chat_prefs to authenticated;
revoke all on public.chat_prefs from public, anon;

drop policy if exists "chat pref read own" on public.chat_prefs;
create policy "chat pref read own" on public.chat_prefs
  for select using (owner_id = (select auth.uid()));

drop policy if exists "chat pref write own" on public.chat_prefs;
create policy "chat pref write own" on public.chat_prefs
  for insert with check (owner_id = (select auth.uid()));

drop policy if exists "chat pref edit own" on public.chat_prefs;
create policy "chat pref edit own" on public.chat_prefs
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "chat pref remove own" on public.chat_prefs;
create policy "chat pref remove own" on public.chat_prefs
  for delete using (owner_id = (select auth.uid()));

-- ── migration under test: db/migrations/20260826_chat_background.sql, verbatim ──
-- (begin/commit stripped — the harness owns the transaction)

alter table public.chat_prefs
  add column if not exists background text
    check (background is null or length(background) between 1 and 40);

-- ── end of inlined migrations ───────────────────────────────────────────────

create function pg_temp.assert_prefs() returns void language plpgsql as $fn$
declare
  n int; caught text; pin boolean; arc boolean;
  one constant uuid := 'f0000000-0000-4000-8000-0000000000d5';
  two constant uuid := 'f0000000-0000-4000-8000-0000000000d6';
begin
  -- 1: own CRUD
  perform pg_temp.as_user(one::text);
  insert into chat_prefs (owner_id, chat_key, pinned) values (one, 'dm-zz1', true);
  update chat_prefs set archived = true, pinned = false where owner_id = one and chat_key = 'dm-zz1';
  select pinned, archived into pin, arc from chat_prefs where owner_id = one and chat_key = 'dm-zz1';
  if pin or not arc then raise exception 'ASSERT 1 FAILED: pin=% archived=%', pin, arc; end if;
  delete from chat_prefs where owner_id = one and chat_key = 'dm-zz1';
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: could not clear own pref'; end if;
  insert into _log(line) values ('1 own pref: pin, archive, flip, clear');

  -- 2: invisible across accounts (with a seeing control)
  perform pg_temp.as_user(one::text);
  insert into chat_prefs (owner_id, chat_key, pinned) values (one, 'squad-zz2', true);
  select count(*) into n from chat_prefs;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: control — owner sees % row(s)', n; end if;
  reset role;
  perform pg_temp.as_user(two::text);
  select count(*) into n from chat_prefs;
  reset role;
  if n <> 0 then raise exception 'ASSERT 2 FAILED: somebody else sees % pref(s)', n; end if;
  insert into _log(line) values ('2 prefs invisible across accounts (owner-sees control passed)');

  -- 3: writing as somebody else is refused
  perform pg_temp.as_user(two::text);
  begin
    insert into chat_prefs (owner_id, chat_key, archived) values (one, 'dm-zz3', true);
    caught := null;
  exception when others then caught := 'forged'; end;
  reset role;
  if caught is distinct from 'forged' then raise exception 'ASSERT 3 FAILED: wrote a pref as somebody else'; end if;
  insert into _log(line) values ('3 a pref in somebody else''s name is refused');

  -- 4: the wallpaper column (26 Aug 2026) — own write/read/clear, an
  --    over-long key refused by the check, and NULL (the default) accepted
  perform pg_temp.as_user(one::text);
  insert into chat_prefs (owner_id, chat_key, background) values (one, 'dm-zz4', 'doodle');
  select background into caught from chat_prefs where owner_id = one and chat_key = 'dm-zz4';
  if caught is distinct from 'doodle' then raise exception 'ASSERT 4 FAILED: background read back %', caught; end if;
  update chat_prefs set background = null where owner_id = one and chat_key = 'dm-zz4';
  select count(*) into n from chat_prefs where owner_id = one and chat_key = 'dm-zz4' and background is null;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: could not clear the background'; end if;
  begin
    update chat_prefs set background = repeat('x', 41) where owner_id = one and chat_key = 'dm-zz4';
    caught := null;
  exception when check_violation then caught := 'refused'; end;
  reset role;
  if caught is distinct from 'refused' then raise exception 'ASSERT 4 FAILED: a 41-char background was accepted'; end if;
  insert into _log(line) values ('4 wallpaper: set, clear to default, over-long key refused');
end $fn$;

select pg_temp.assert_prefs();

select line from _log order by seq;

rollback;
