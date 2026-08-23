-- ══════════════════════════════════════════════════════════════════════════
--  SQUAD CHAT PHASE 2 HARNESS — fixture threads and @mentions
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260823_squad_chat_phase2.sql.
--
-- WHAT THIS ASSERTS
--
--   1. a PARENT can open a fixture thread while announce-only          <- the fixture's discussion is the squad's
--   2. a second open thread for the same fixture is refused            <- one per fixture
--   3. a thread on ANOTHER squad's fixture is refused                   <- the boundary
--   4. mentions are filtered: an outsider and the author are dropped   <- server-side, silently
--   5. a parent's REPLY that mentions the coach queues ONE push …       <- mentions push
--   6. … whose audience is the coach alone, not the squad              <- only the mentioned
--   7. a parent's reply with NO mention queues nothing                 <- phase-1 quiet rule holds
--   8. chat_mentionables for a parent lists squad-mates, not outsiders, not self
--   9. chat_mentionables for an outsider returns no rows
--  10. soft-deleting the thread frees the fixture for a new one        <- the partial index
--
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c4','ZZ Chat2 Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000031','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat2-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000032','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat2-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000033','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat2-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000034','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat2-outsider@example.invalid',now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000fc','f0000000-0000-4000-8000-0000000000c4','ZZ Chat2 Squad A', 998),
 ('f0000000-0000-4000-8000-0000000000fd','f0000000-0000-4000-8000-0000000000c4','ZZ Chat2 Squad B', 999);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000b1','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fc','Zz Probe Childfour'),
 ('f0000000-0000-4000-8000-0000000000b2','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fc','Zz Probe Childfive'),
 ('f0000000-0000-4000-8000-0000000000b3','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fd','Zz Probe Childsix');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000031','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fc', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000032','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fc','f0000000-0000-4000-8000-0000000000b1','parent','active'),
 ('f0000000-0000-4000-8000-000000000033','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fc','f0000000-0000-4000-8000-0000000000b2','parent','active'),
 ('f0000000-0000-4000-8000-000000000034','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fd','f0000000-0000-4000-8000-0000000000b3','parent','active');

insert into events (id, club_id, team_id, type, starts_at, opponent) values
 ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fc','match', now() + interval '3 days', 'ZZ Probe Opponents'),
 ('f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000c4','f0000000-0000-4000-8000-0000000000fd','match', now() + interval '4 days', 'ZZ Probe Others');

insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000031','https://push.example.invalid/zz-chat2-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000032','https://push.example.invalid/zz-chat2-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000033','https://push.example.invalid/zz-chat2-parent2','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.assert_chat2() returns void language plpgsql as $fn$
declare
  thread_id uuid; reply_id uuid; n int; caught text; q_before int; q_after int; kept uuid[];
  coach constant uuid := 'f0000000-0000-4000-8000-000000000031';
  parent constant uuid := 'f0000000-0000-4000-8000-000000000032';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000033';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000034';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fc';
  ev_a constant uuid := 'f0000000-0000-4000-8000-0000000000e1';
  ev_b constant uuid := 'f0000000-0000-4000-8000-0000000000e2';
begin
  -- 1. a parent opens the fixture thread (announce-only is the default)
  select count(*) into q_before from net.http_request_queue;
  perform pg_temp.as_user(parent::text);
  insert into messages (event_id, body) values (ev_a, 'Who needs a lift on Saturday?') returning id into thread_id;
  reset role;
  select count(*) into n from messages where id = thread_id and team_id = squad_a and event_id = ev_a and parent_id is null;
  if n <> 1 then raise exception 'ASSERT 1 FAILED'; end if;
  insert into _log(line) values ('1 parent opened the fixture thread under announce-only; team_id set from the fixture');

  -- 2. a second thread for the same fixture is refused
  perform pg_temp.as_user(coach::text);
  begin
    insert into messages (event_id, body) values (ev_a, 'Another thread'); caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 2 FAILED: second thread accepted'; end if;
  insert into _log(line) values ('2 second open thread for the same fixture refused (' || left(caught, 60) || ')');

  -- 3. a thread on another squad's fixture is refused
  perform pg_temp.as_user(parent::text);
  begin
    insert into messages (event_id, body) values (ev_b, 'Wrong squad'); caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 3 FAILED'; end if;
  insert into _log(line) values ('3 thread on another squad''s fixture refused (' || left(caught, 60) || ')');

  -- 4. mentions filtered: outsider and self dropped, coach kept
  perform pg_temp.as_user(parent::text);
  insert into messages (parent_id, body, mentions)
  values (thread_id, '@Coach can we bring two extra?', array[coach, outsider, parent])
  returning id, mentions into reply_id, kept;
  reset role;
  if kept <> array[coach] then raise exception 'ASSERT 4 FAILED: mentions kept = %', kept; end if;
  insert into _log(line) values ('4 mentions filtered server-side: coach kept, outsider and author dropped');

  -- 5. that reply queued exactly one push (the thread-open by a parent queued none)
  select count(*) into q_after from net.http_request_queue;
  if q_after - q_before <> 1 then raise exception 'ASSERT 5 FAILED: % queued', q_after - q_before; end if;
  insert into _log(line) values ('5 one push queued: the parent''s reply with a mention (the parent''s thread-open queued none)');

  -- 6. its audience is the coach alone
  select count(*) into n from public.message_push_subscriptions(reply_id);
  if n <> 1 then raise exception 'ASSERT 6 FAILED: audience %', n; end if;
  select count(*) into n from public.message_push_subscriptions(reply_id) s
   where s.endpoint = 'https://push.example.invalid/zz-chat2-coach';
  if n <> 1 then raise exception 'ASSERT 6 FAILED: audience is not the coach'; end if;
  insert into _log(line) values ('6 push audience for a mention: the coach only, not the squad');

  -- 7. a reply with no mention queues nothing
  select count(*) into q_before from net.http_request_queue;
  perform pg_temp.as_user(parent2::text);
  insert into messages (parent_id, body) values (thread_id, 'We can too.');
  reset role;
  select count(*) into q_after from net.http_request_queue;
  if q_after <> q_before then raise exception 'ASSERT 7 FAILED'; end if;
  insert into _log(line) values ('7 a reply with no mention queues nothing');

  -- 8. mentionables for a parent
  perform pg_temp.as_user(parent::text);
  select count(*) into n from public.chat_mentionables(squad_a);
  if n <> 2 then raise exception 'ASSERT 8 FAILED: % mentionable(s), want 2', n; end if;
  select count(*) into n from public.chat_mentionables(squad_a) where profile_id in (parent, outsider);
  reset role;
  if n <> 0 then raise exception 'ASSERT 8 FAILED: self or outsider listed'; end if;
  insert into _log(line) values ('8 chat_mentionables for a parent: coach and the other parent; not self, not the outsider');

  -- 9. an outsider gets nothing
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from public.chat_mentionables(squad_a);
  reset role;
  if n <> 0 then raise exception 'ASSERT 9 FAILED: outsider got % row(s)', n; end if;
  insert into _log(line) values ('9 chat_mentionables for an outsider: no rows');

  -- 10. soft delete frees the fixture
  perform pg_temp.as_user(coach::text);
  update messages set deleted_at = now() where id = thread_id;
  insert into messages (event_id, body) values (ev_a, 'Fresh thread');
  reset role;
  insert into _log(line) values ('10 after soft-deleting the thread, a new one for the fixture is accepted');
end $fn$;

select pg_temp.assert_chat2();

select line from _log order by seq;

-- ⚠️ NOT OPTIONAL. A club, four people, three players, two fixtures,
-- messages and a queued push all went into production above.
rollback;
