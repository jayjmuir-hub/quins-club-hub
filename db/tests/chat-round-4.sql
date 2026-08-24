-- Harness for db/migrations/20260824_chat_round_4.sql.
-- Run with `npm run db:check -- chat-round-4`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes; the
-- begin/commit pair is stripped — the harness owns the transaction).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. a DM participant pins ANOTHER PERSON'S message and unpins it; an
--     outsider is refused (with the participant control)
--  2. channels keep the staff rule: a parent is refused, the coach pins
--  3. a removed message takes no pin
--  4. stars: own star on a readable message; an unreadable one refused;
--     invisible across accounts (with a seeing control); unstar own only
--  5. the relaxed quote guard: reply-privately (readable, cross-
--     conversation) accepted; an unreadable quoted id still refused
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000d2','ZZ Roundfour Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r4-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r4-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000b3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r4-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000b4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r4-parent2@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000e9','f0000000-0000-4000-8000-0000000000d2','U8 ZZ Roundfour', 1051),
 ('f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000d2','U9 ZZ Roundfour', 1052);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000e9','Zz Probe Fourone'),
 ('f0000000-0000-4000-8000-0000000000e3','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000ea','Zz Probe Fourtwo'),
 ('f0000000-0000-4000-8000-0000000000e4','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000e9','Zz Probe Fourthree');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-0000000000b1','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000e9', null, 'coach','active'),
 ('f0000000-0000-4000-8000-0000000000b2','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000e9','f0000000-0000-4000-8000-0000000000e2','parent','active'),
 ('f0000000-0000-4000-8000-0000000000b3','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000e3','parent','active'),
 ('f0000000-0000-4000-8000-0000000000b4','f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000e9','f0000000-0000-4000-8000-0000000000e4','parent','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260824_chat_round_4.sql, verbatim ──
-- (begin/commit stripped — the harness owns the transaction)

create or replace function public.set_message_pinned(_message uuid, _pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m record;
begin
  select id, channel, team_id, club_id, conversation_id, deleted_at
    into m from public.messages where id = _message;
  if m.id is null then
    raise exception 'no such message';
  end if;
  if m.deleted_at is not null then
    raise exception 'a removed message cannot be pinned';
  end if;
  if m.channel = 'dm' then
    if not (private.in_conversation(m.conversation_id)
            or private.conversation_reviewable(m.conversation_id)) then
      raise exception 'only people in this chat may pin';
    end if;
  elsif m.channel in ('squad', 'staff') then
    if not ((m.team_id is not null and private.can_edit_team(m.team_id))
            or (m.team_id is null and private.is_admin(m.club_id))) then
      raise exception 'only squad staff may pin here';
    end if;
  else
    raise exception 'unknown channel';
  end if;
  update public.messages set pinned = _pinned where id = _message;
end $$;

revoke all on function public.set_message_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

create table if not exists public.message_stars (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid not null references public.messages(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (owner_id, message_id)
);

alter table public.message_stars enable row level security;
grant select, insert, delete on public.message_stars to authenticated;
revoke all on public.message_stars from public, anon;

drop policy if exists "star read own" on public.message_stars;
create policy "star read own" on public.message_stars
  for select using (owner_id = (select auth.uid()));

drop policy if exists "star create own" on public.message_stars;
create policy "star create own" on public.message_stars
  for insert with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.messages x where x.id = message_id and x.deleted_at is null));

drop policy if exists "star remove own" on public.message_stars;
create policy "star remove own" on public.message_stars
  for delete using (owner_id = (select auth.uid()));

create or replace function private.messages_quote_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare q record;
begin
  if new.quoted_id is null then return new; end if;
  if new.channel <> 'dm' or new.conversation_id is null then
    raise exception 'quotes are for direct and group chats only';
  end if;
  select id into q from public.messages where id = new.quoted_id;
  if q.id is null then
    raise exception 'quoted message is not one you can read';
  end if;
  return new;
end $$;

-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_round4() returns void language plpgsql as $fn$
declare
  n int; caught text; conv uuid; dm_msg uuid; squad_msg uuid; hidden uuid; priv uuid;
  coach    constant uuid := 'f0000000-0000-4000-8000-0000000000b1';
  parent   constant uuid := 'f0000000-0000-4000-8000-0000000000b2';
  outsider constant uuid := 'f0000000-0000-4000-8000-0000000000b3';
  parent2  constant uuid := 'f0000000-0000-4000-8000-0000000000b4';
begin
  -- 1: a participant pins another person's DM message; an outsider cannot
  perform pg_temp.as_user(coach::text);
  conv := public.open_conversation(parent);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Zz probe: pin me') returning id into dm_msg;
  reset role;
  perform pg_temp.as_user(parent::text);
  perform public.set_message_pinned(dm_msg, true);
  select count(*) into n from messages where id = dm_msg and pinned;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: participant pin did not stick'; end if;
  perform public.set_message_pinned(dm_msg, false);
  select count(*) into n from messages where id = dm_msg and pinned;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: participant unpin did not stick'; end if;
  reset role;
  perform pg_temp.as_user(outsider::text);
  begin
    perform public.set_message_pinned(dm_msg, true);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 1 FAILED: an outsider pinned a DM'; end if;
  insert into _log(line) values ('1 DM pin: any participant, both ways; outsider refused');

  -- 2: channels keep the staff rule
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values ('f0000000-0000-4000-8000-0000000000e9','squad','Zz probe: channel post') returning id into squad_msg;
  reset role;
  perform pg_temp.as_user(parent::text);
  begin
    perform public.set_message_pinned(squad_msg, true);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 2 FAILED: a parent pinned a channel post'; end if;
  perform pg_temp.as_user(coach::text);
  perform public.set_message_pinned(squad_msg, true);
  select count(*) into n from messages where id = squad_msg and pinned;
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: control — the coach could not pin'; end if;
  insert into _log(line) values ('2 channel pin: parent refused, coach pins (control)');

  -- 3: a removed message takes no pin
  perform pg_temp.as_user(coach::text);
  update messages set deleted_at = now() where id = dm_msg;
  begin
    perform public.set_message_pinned(dm_msg, true);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 3 FAILED: pinned a removed message'; end if;
  insert into _log(line) values ('3 a removed message takes no pin');

  -- 4: stars — own, readable, invisible across accounts
  perform pg_temp.as_user(coach::text);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Zz probe: star me') returning id into hidden;
  reset role;
  perform pg_temp.as_user(parent::text);
  insert into message_stars (owner_id, message_id) values (parent, hidden);
  select count(*) into n from message_stars;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: control — owner sees % star(s)', n; end if;
  begin
    insert into message_stars (owner_id, message_id) values (coach, hidden);
    caught := null;
  exception when others then caught := 'forged'; end;
  if caught is distinct from 'forged' then raise exception 'ASSERT 4 FAILED: starred as somebody else'; end if;
  reset role;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from message_stars;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: somebody else sees % star(s)', n; end if;
  begin
    insert into message_stars (owner_id, message_id) values (outsider, hidden);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 4 FAILED: starred an unreadable message'; end if;
  perform pg_temp.as_user(parent::text);
  delete from message_stars where owner_id = parent and message_id = hidden;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: could not unstar own'; end if;
  insert into _log(line) values ('4 stars: own and readable only, invisible across accounts, unstar own');

  -- 5: the relaxed guard — reply-privately allowed, unreadable refused.
  -- Pairs chosen from what can_dm demonstrably permits (the round-2
  -- harness's precedent: squad adults with their squad's coach).
  perform pg_temp.as_user(parent2::text);
  priv := public.open_conversation(coach);
  if priv = conv then raise exception 'ASSERT 5 SETUP BROKEN: same conversation'; end if;
  begin
    -- `hidden` lives in parent↔coach, which parent2 cannot read
    insert into messages (conversation_id, channel, body, quoted_id) values (priv, 'dm', 'Zz probe: blind', hidden);
    caught := null;
  exception when others then caught := 'blind'; end;
  reset role;
  if caught is distinct from 'blind' then raise exception 'ASSERT 5 FAILED: quoted an unreadable message'; end if;
  -- The coach CAN read `hidden` (their own conversation with parent) and
  -- quotes it into coach↔parent2 — reply-privately's exact shape:
  -- readable by the SENDER, different conversation.
  perform pg_temp.as_user(coach::text);
  insert into messages (conversation_id, channel, body, quoted_id) values (priv, 'dm', 'Zz probe: reply-privately', hidden);
  reset role;
  insert into _log(line) values ('5 quote guard: reply-privately accepted, unreadable still refused');
end $fn$;

select pg_temp.assert_round4();

select line from _log order by seq;

rollback;
