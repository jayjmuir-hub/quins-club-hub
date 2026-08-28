-- Harness for db/migrations/20260827_chat_polls.sql.
-- Run with `npm run db:check -- chat-polls`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. the posting gate: an announce-only channel refuses a parent's poll and
--     accepts a coach's; opening the channel lets the parent post (control)
--  2. a created poll is a message (body = question) with its options in order
--  3. parity: a squadmate sees who voted; an outsider sees no poll, no option,
--     no vote, and cannot vote (each with a seeing/voting control)
--  4. single-choice replaces; multiple-choice accumulates
--  5. voter_id and message_id are stamped, not trusted — impersonation is
--     silently corrected to the caller and the option's real poll
--  6. un-vote removes your row and only yours
--  7. deleting the poll message cascades its options and votes away, and a
--     removed message takes no new votes
--  8. create_poll validates: blank question, one option, thirteen options
--  9. a DM poll follows the DM's audience
begin;

create temporary table _log(seq serial, line text) on commit drop;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000ca','ZZ Pollprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-poll-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000092','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-poll-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000093','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-poll-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000095','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-poll-parent2@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000f1','f0000000-0000-4000-8000-0000000000ca','U8 ZZ Pollprobe', 1041),
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000ca','U9 ZZ Pollprobe', 1042);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f1','Zz Probe Pollone'),
 ('f0000000-0000-4000-8000-0000000000eb','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f1','Zz Probe Polltwo'),
 ('f0000000-0000-4000-8000-0000000000ec','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f2','Zz Probe Pollthree');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000091','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f1', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000092','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f1','f0000000-0000-4000-8000-0000000000ea','parent','active'),
 ('f0000000-0000-4000-8000-000000000095','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f1','f0000000-0000-4000-8000-0000000000eb','parent','active'),
 ('f0000000-0000-4000-8000-000000000093','f0000000-0000-4000-8000-0000000000ca','f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000ec','parent','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260827_chat_polls.sql, verbatim ─────
create table if not exists public.polls (
  message_id     uuid primary key references public.messages(id) on delete cascade,
  allow_multiple boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.polls(message_id) on delete cascade,
  position   int  not null,
  label      text not null check (length(btrim(label)) between 1 and 100),
  unique (message_id, position)
);
create index if not exists poll_options_message_idx on public.poll_options (message_id);

create table if not exists public.poll_votes (
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id)     on delete cascade,
  message_id uuid not null references public.polls(message_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, voter_id)
);
create index if not exists poll_votes_message_idx on public.poll_votes (message_id);

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

grant select on public.polls        to authenticated;
grant select on public.poll_options to authenticated;
grant select, insert, delete on public.poll_votes to authenticated;

drop policy if exists "poll read" on public.polls;
create policy "poll read" on public.polls
  for select using (exists (select 1 from messages x where x.id = message_id));

drop policy if exists "poll option read" on public.poll_options;
create policy "poll option read" on public.poll_options
  for select using (exists (select 1 from messages x where x.id = message_id));

drop policy if exists "poll vote read" on public.poll_votes;
create policy "poll vote read" on public.poll_votes
  for select using (exists (select 1 from messages x where x.id = message_id));

drop policy if exists "poll vote create" on public.poll_votes;
create policy "poll vote create" on public.poll_votes
  for insert with check (
    voter_id = (select auth.uid())
    and exists (select 1 from messages x where x.id = message_id and x.deleted_at is null));

drop policy if exists "poll vote delete" on public.poll_votes;
create policy "poll vote delete" on public.poll_votes
  for delete using (voter_id = (select auth.uid()));

create or replace function private.poll_vote_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  multi boolean;
  msg   uuid;
begin
  new.voter_id := auth.uid();
  if new.voter_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select po.message_id, pl.allow_multiple into msg, multi
    from poll_options po join polls pl on pl.message_id = po.message_id
   where po.id = new.option_id;
  if msg is null then
    raise exception 'no such poll option' using errcode = 'P0002';
  end if;
  new.message_id := msg;
  if not multi then
    delete from poll_votes v where v.message_id = msg and v.voter_id = new.voter_id;
  end if;
  return new;
end;
$function$;
revoke all on function private.poll_vote_before_insert() from public, anon;

drop trigger if exists poll_vote_before_insert on public.poll_votes;
create trigger poll_vote_before_insert
  before insert on public.poll_votes
  for each row execute function private.poll_vote_before_insert();

create or replace function public.create_poll(
  _team uuid, _channel text, _conversation uuid, _event uuid,
  _question text, _options text[], _allow_multiple boolean)
returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  me    uuid := auth.uid();
  club  uuid;
  ok    boolean;
  clean text[];
  msg   uuid;
  opt   text;
  i     int := 0;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if _question is null or length(btrim(_question)) not between 1 and 2000 then
    raise exception 'a poll needs a question' using errcode = '23514';
  end if;
  select array_agg(btrim(o) order by ord) into clean
    from unnest(coalesce(_options, '{}'::text[])) with ordinality as t(o, ord)
   where length(btrim(o)) between 1 and 100;
  if coalesce(array_length(clean, 1), 0) < 2 then
    raise exception 'a poll needs at least two options' using errcode = '23514';
  end if;
  if array_length(clean, 1) > 12 then
    raise exception 'a poll has at most twelve options' using errcode = '23514';
  end if;

  select mm.club_id into club from memberships mm
   where mm.profile_id = me and mm.status = 'active' order by mm.created_at limit 1;
  if club is null then raise exception 'not a club member' using errcode = '42501'; end if;

  ok := case
    when _conversation is not null then private.in_conversation(_conversation)
    when _channel = 'staff'        then private.can_edit_team(_team)
    when _team is null             then private.is_admin(club)
    else private.can_edit_team(_team)
      or (not private.channel_announce_only(_team) and private.can_see_team(_team))
      or (_event is not null and private.can_see_team(_team))
  end;
  if not ok then
    raise exception 'you cannot post here' using errcode = '42501';
  end if;

  insert into messages (team_id, channel, conversation_id, event_id, body)
  values (
    case when _conversation is not null then null else _team end,
    case when _conversation is not null then 'dm'
         when _channel = 'staff'        then 'staff'
         else 'squad' end,
    _conversation,
    case when _conversation is not null then null else _event end,
    btrim(_question))
  returning id into msg;

  insert into polls (message_id, allow_multiple) values (msg, coalesce(_allow_multiple, false));
  foreach opt in array clean loop
    insert into poll_options (message_id, position, label) values (msg, i, opt);
    i := i + 1;
  end loop;

  return msg;
end;
$function$;
revoke all on function public.create_poll(uuid, text, uuid, uuid, text, text[], boolean) from public, anon;
grant execute on function public.create_poll(uuid, text, uuid, uuid, text, text[], boolean) to authenticated;
-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_polls() returns void language plpgsql as $fn$
declare
  n int; caught text; msg uuid; msg2 uuid; dmsg uuid; conv uuid;
  opt0 uuid; opt1 uuid; who uuid; poll_of uuid;
  team     constant uuid := 'f0000000-0000-4000-8000-0000000000f1';
  coach    constant uuid := 'f0000000-0000-4000-8000-000000000091';
  parent   constant uuid := 'f0000000-0000-4000-8000-000000000092';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000093';
  parent2  constant uuid := 'f0000000-0000-4000-8000-000000000095';
begin
  -- 1: the posting gate. Announce-only by default (no channel_settings row).
  perform pg_temp.as_user(parent::text);
  begin
    msg := public.create_poll(team,'squad',null,null,'Zz which weekend?', array['Sat 4th','Sat 11th'], false);
    caught := null;
  exception when insufficient_privilege then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 1 FAILED: parent posted a poll in an announce-only channel'; end if;
  perform pg_temp.as_user(coach::text);
  msg := public.create_poll(team,'squad',null,null,'Zz which weekend?', array['Sat 4th','Sat 11th','Sat 18th'], false);
  reset role;
  if msg is null then raise exception 'ASSERT 1 FAILED: coach could not post a poll'; end if;
  -- open the channel (as the table owner, bypassing RLS) and the parent may post
  insert into channel_settings (team_id, club_id, announce_only)
    values (team, 'f0000000-0000-4000-8000-0000000000ca', false);
  perform pg_temp.as_user(parent::text);
  begin
    perform public.create_poll(team,'squad',null,null,'Zz snack rota?', array['Yes','No'], false);
    caught := 'ok';
  exception when others then caught := SQLERRM; end;
  reset role;
  if caught is distinct from 'ok' then raise exception 'ASSERT 1 FAILED: parent still blocked in an open channel — %', caught; end if;
  insert into _log(line) values ('1 posting gate: announce-only refuses a parent, accepts a coach; opening it lets the parent post');

  -- 2: a poll is a message, options in order
  select body into caught from messages where id = msg;
  if caught is distinct from 'Zz which weekend?' then raise exception 'ASSERT 2 FAILED: question not in message body (%)', caught; end if;
  select count(*) into n from poll_options where message_id = msg;
  if n <> 3 then raise exception 'ASSERT 2 FAILED: % options, expected 3', n; end if;
  select id into opt0 from poll_options where message_id = msg and position = 0;
  select id into opt1 from poll_options where message_id = msg and position = 1;
  select label into caught from poll_options where message_id = msg and position = 0;
  if caught is distinct from 'Sat 4th' then raise exception 'ASSERT 2 FAILED: first option out of order (%)', caught; end if;
  insert into _log(line) values ('2 the poll is a message with its question in the body and options in order');

  -- 3: parity + outsider blindness
  perform pg_temp.as_user(parent::text);
  insert into poll_votes (option_id) values (opt0);
  reset role;
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from poll_votes where message_id = msg and voter_id = parent;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: control — a squadmate cannot see who voted (%)', n; end if;
  reset role;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from polls where message_id = msg;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: outsider sees the poll'; end if;
  select count(*) into n from poll_options where message_id = msg;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: outsider sees the options'; end if;
  select count(*) into n from poll_votes where message_id = msg;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: outsider sees the votes'; end if;
  begin
    insert into poll_votes (option_id) values (opt0);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 3 FAILED: outsider voted on an unreadable poll'; end if;
  insert into _log(line) values ('3 a squadmate sees who voted (parity); an outsider sees nothing and cannot vote');

  -- 4: single-choice replaces; multiple-choice accumulates
  perform pg_temp.as_user(parent::text);
  insert into poll_votes (option_id) values (opt1);        -- was opt0; single-choice
  select count(*) into n from poll_votes where message_id = msg and voter_id = parent;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: single-choice kept % votes', n; end if;
  select option_id into who from poll_votes where message_id = msg and voter_id = parent;
  if who is distinct from opt1 then raise exception 'ASSERT 4 FAILED: single-choice did not switch to the new option'; end if;
  reset role;
  perform pg_temp.as_user(coach::text);
  msg2 := public.create_poll(team,'squad',null,null,'Zz bring which kit?', array['Home','Away','Both'], true);
  reset role;
  select id into opt0 from poll_options where message_id = msg2 and position = 0;
  select id into opt1 from poll_options where message_id = msg2 and position = 1;
  perform pg_temp.as_user(parent::text);
  insert into poll_votes (option_id) values (opt0);
  insert into poll_votes (option_id) values (opt1);
  select count(*) into n from poll_votes where message_id = msg2 and voter_id = parent;
  reset role;
  if n <> 2 then raise exception 'ASSERT 4 FAILED: multiple-choice kept % votes, expected 2', n; end if;
  insert into _log(line) values ('4 single-choice replaces the earlier vote; multiple-choice keeps both');

  -- 5: identity + poll are stamped, not trusted
  perform pg_temp.as_user(parent2::text);
  insert into poll_votes (option_id, voter_id, message_id) values (opt0, coach, msg);  -- lies on both
  select voter_id, message_id into who, poll_of from poll_votes where option_id = opt0 and voter_id = parent2;
  reset role;
  if who is distinct from parent2 then raise exception 'ASSERT 5 FAILED: voter_id was not forced to the caller'; end if;
  if poll_of is distinct from msg2 then raise exception 'ASSERT 5 FAILED: message_id was not resolved from the option'; end if;
  insert into _log(line) values ('5 voter_id and message_id are stamped from the caller and the option, not the client');

  -- 6: un-vote is yours alone
  perform pg_temp.as_user(parent2::text);
  delete from poll_votes where option_id = opt0 and voter_id = parent;   -- someone else's
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ASSERT 6 FAILED: deleted somebody else''s vote'; end if;
  delete from poll_votes where option_id = opt0 and voter_id = parent2;  -- my own
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 6 FAILED: could not un-vote (% row(s))', n; end if;
  insert into _log(line) values ('6 un-vote removes your row and never anyone else''s');

  -- 7a: a HARD delete of the message (delete-for-good) cascades the FK — the
  -- poll, its options and its votes go with the row. Done as the table owner,
  -- which is how a hard delete reaches the row at all.
  delete from messages where id = msg2;
  select count(*) into n from poll_options where message_id = msg2;
  if n <> 0 then raise exception 'ASSERT 7 FAILED: options survived a hard delete (%)', n; end if;
  select count(*) into n from poll_votes where message_id = msg2;
  if n <> 0 then raise exception 'ASSERT 7 FAILED: votes survived a hard delete (%)', n; end if;
  -- 7b: a SOFT-deleted (removed) message keeps its poll rows but takes no NEW
  -- vote — the insert policy's deleted_at guard. Deleted by the author (coach),
  -- so the block below is the guard talking, not a no-op UPDATE.
  perform pg_temp.as_user(coach::text);
  update messages set deleted_at = now() where id = msg;
  reset role;
  select id into opt1 from poll_options where message_id = msg and position = 0;  -- still present
  if opt1 is null then raise exception 'ASSERT 7 FAILED: soft delete wrongly removed the options'; end if;
  perform pg_temp.as_user(parent2::text);
  begin
    insert into poll_votes (option_id) values (opt1);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 7 FAILED: voted on a removed message'; end if;
  insert into _log(line) values ('7 hard delete cascades poll rows away; a soft-removed message keeps them but takes no new vote');

  -- 8: create_poll validates
  perform pg_temp.as_user(coach::text);
  begin perform public.create_poll(team,'squad',null,null,'   ', array['A','B'], false); caught := null;
  exception when check_violation then caught := 'blank'; end;
  if caught is distinct from 'blank' then raise exception 'ASSERT 8 FAILED: blank question accepted'; end if;
  begin perform public.create_poll(team,'squad',null,null,'Zz one?', array['only one'], false); caught := null;
  exception when check_violation then caught := 'few'; end;
  if caught is distinct from 'few' then raise exception 'ASSERT 8 FAILED: one-option poll accepted'; end if;
  begin
    perform public.create_poll(team,'squad',null,null,'Zz many?',
      array['1','2','3','4','5','6','7','8','9','10','11','12','13'], false);
    caught := null;
  exception when check_violation then caught := 'many'; end;
  reset role;
  if caught is distinct from 'many' then raise exception 'ASSERT 8 FAILED: thirteen-option poll accepted'; end if;
  insert into _log(line) values ('8 create_poll refuses a blank question, one option, and thirteen options');

  -- 9: a DM poll follows the DM's audience
  perform pg_temp.as_user(coach::text);
  conv := public.open_conversation(parent2);
  dmsg := public.create_poll(null,'dm',conv,null,'Zz lift on Saturday?', array['Yes please','I''m fine'], false);
  reset role;
  select id into opt0 from poll_options where message_id = dmsg and position = 0;
  perform pg_temp.as_user(parent2::text);
  insert into poll_votes (option_id) values (opt0);        -- the other side of the DM may vote
  select count(*) into n from poll_votes where message_id = dmsg;
  if n <> 1 then raise exception 'ASSERT 9 FAILED: the DM partner could not vote'; end if;
  reset role;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from polls where message_id = dmsg;
  if n <> 0 then raise exception 'ASSERT 9 FAILED: outsider sees a DM poll'; end if;
  begin
    perform public.create_poll(null,'dm',conv,null,'Zz butt in?', array['A','B'], false);
    caught := null;
  exception when others then caught := 'blocked'; end;
  reset role;
  if caught is distinct from 'blocked' then raise exception 'ASSERT 9 FAILED: outsider posted a poll into a DM'; end if;
  insert into _log(line) values ('9 a DM poll lives and dies with the DM''s two-person audience');
end $fn$;

select pg_temp.assert_polls();

select line from _log order by seq;

rollback;
