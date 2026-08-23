-- ══════════════════════════════════════════════════════════════════════════
--  SQUAD CHAT HARNESS — who may post, who may reply, who gets pushed
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  net.http_post is a transactional INSERT into net.http_request_queue, so a
--  push queued here never survives to the worker.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260823_squad_chat.sql, claude/plans/2026-08-23-squad-chat.md.
--
-- WHAT THIS ASSERTS
--
--   1. a coach posts to their squad; club_id/author_id are stamped     <- baseline
--   2. a parent CANNOT post top-level while announce-only (default)    <- the default
--   3. the same parent CAN reply to the coach's post                    <- the point of announce-only
--   4. a parent in ANOTHER squad sees nothing                           <- the boundary
--   5. staff turn announce-only OFF; the parent can now post            <- the switch
--   6. a reply to a reply is refused                                    <- one level
--   7. the coach's post queued ONE push; the parent's reply queued NONE <- who buzzes
--   8. the push audience excludes the author and an opted-out parent   <- the audience RPC
--   9. soft delete blanks the body and survives as a row               <- no hard delete
--  9b. a parent cannot UPDATE team_id — the column grant, not the policy <- the Supabase-defaults trap
--  10. message_read_stats: staff see reads/audience; a parent gets 0 rows <- receipts are staff-only
--  11. anon holds nothing on any of the three tables                    <- control
--
-- ⚠️ A SYNTHETIC CLUB, NOT A REAL ONE, AND EVERY NAME IS INVENTED — rule 9.

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   COACH    coach of squad A
--   PARENT   parent in squad A (child P1)
--   PARENT2  parent in squad A (child P2), opted out of squad_chat
--   OUTSIDER parent in squad B

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c3','ZZ Chat Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000022','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000023','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000024','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chat-outsider@example.invalid',now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000fa','f0000000-0000-4000-8000-0000000000c3','ZZ Chat Squad A', 996),
 ('f0000000-0000-4000-8000-0000000000fb','f0000000-0000-4000-8000-0000000000c3','ZZ Chat Squad B', 997);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000a1','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fa','Zz Probe Childone'),
 ('f0000000-0000-4000-8000-0000000000a2','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fa','Zz Probe Childtwo'),
 ('f0000000-0000-4000-8000-0000000000a3','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fb','Zz Probe Childthree');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000021','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fa', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000022','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fa','f0000000-0000-4000-8000-0000000000a1','parent','active'),
 ('f0000000-0000-4000-8000-000000000023','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fa','f0000000-0000-4000-8000-0000000000a2','parent','active'),
 ('f0000000-0000-4000-8000-000000000024','f0000000-0000-4000-8000-0000000000c3','f0000000-0000-4000-8000-0000000000fb','f0000000-0000-4000-8000-0000000000a3','parent','active');

-- Everybody in squad A has a device; PARENT2 has opted out of squad_chat.
insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000021','https://push.example.invalid/zz-chat-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000022','https://push.example.invalid/zz-chat-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000023','https://push.example.invalid/zz-chat-parent2','k','a');
insert into notification_opt_outs (profile_id, category) values
 ('f0000000-0000-4000-8000-000000000023','squad_chat');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.assert_chat() returns void language plpgsql as $fn$
declare
  post_id uuid; reply_id uuid; n int; caught text; q_before int; q_after int; body_now text;
  coach constant text := 'f0000000-0000-4000-8000-000000000021';
  parent constant text := 'f0000000-0000-4000-8000-000000000022';
  parent2 constant text := 'f0000000-0000-4000-8000-000000000023';
  outsider constant text := 'f0000000-0000-4000-8000-000000000024';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fa';
begin
  -- 1. coach posts
  select count(*) into q_before from net.http_request_queue;
  perform pg_temp.as_user(coach);
  insert into messages (team_id, body) values (squad_a, 'Training moves to pitch 3.') returning id into post_id;
  reset role;
  select count(*) into n from messages where id = post_id and author_id = coach::uuid
     and club_id = 'f0000000-0000-4000-8000-0000000000c3' and author_role = 'coach';
  if n <> 1 then raise exception 'ASSERT 1 FAILED: provenance not stamped'; end if;
  insert into _log(line) values ('1 coach posts; club_id, author_id and author_role=coach stamped by trigger');

  -- 2. parent cannot post top-level (announce-only default)
  perform pg_temp.as_user(parent);
  begin
    insert into messages (team_id, body) values (squad_a, 'Is there a bus?'); caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null or caught not like '%row-level security%' then raise exception 'ASSERT 2 FAILED: parent posted top-level under announce-only (%)', coalesce(caught,'no error'); end if;
  insert into _log(line) values ('2 parent top-level post refused while announce-only (default)');

  -- 3. parent can reply
  perform pg_temp.as_user(parent);
  insert into messages (parent_id, body) values (post_id, 'Is there a bus?') returning id into reply_id;
  reset role;
  select count(*) into n from messages where id = reply_id and team_id = squad_a and parent_id = post_id;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: reply missing or not inheriting team'; end if;
  insert into _log(line) values ('3 parent reply accepted, inherits the post''s squad');

  -- 4. outsider sees nothing
  perform pg_temp.as_user(outsider);
  select count(*) into n from messages;
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: outsider sees % message(s)', n; end if;
  insert into _log(line) values ('4 a parent in another squad sees 0 messages');

  -- 5. staff open the channel; parent can post
  perform pg_temp.as_user(coach);
  insert into channel_settings (team_id, club_id, announce_only, updated_by)
  values (squad_a, 'f0000000-0000-4000-8000-0000000000c3', false, coach::uuid);
  reset role;
  perform pg_temp.as_user(parent);
  insert into messages (team_id, body) values (squad_a, 'Anyone need a lift?');
  reset role;
  insert into _log(line) values ('5 announce-only off: parent top-level post accepted');

  -- 6. reply to a reply refused
  perform pg_temp.as_user(parent2);
  begin
    insert into messages (parent_id, body) values (reply_id, 'me too'); caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 6 FAILED: reply to a reply accepted'; end if;
  insert into _log(line) values ('6 reply to a reply refused (' || caught || ')');

  -- 7. pushes queued: coach post = 1, everything else = 0
  select count(*) into q_after from net.http_request_queue;
  if q_after - q_before <> 1 then raise exception 'ASSERT 7 FAILED: % push(es) queued, want 1 (coach post only)', q_after - q_before; end if;
  insert into _log(line) values ('7 exactly one push queued: the coach''s post; replies and the parent''s post queued none');

  -- 8. audience excludes author and the opted-out parent
  select count(*) into n from public.message_push_subscriptions(post_id);
  if n <> 1 then raise exception 'ASSERT 8 FAILED: audience is % device(s), want 1 (PARENT only)', n; end if;
  insert into _log(line) values ('8 push audience: 1 device — not the author, not the opted-out parent');

  -- 9. soft delete
  perform pg_temp.as_user(parent);
  update messages set deleted_at = now() where id = reply_id;
  reset role;
  select body into body_now from messages where id = reply_id;
  if body_now <> '(removed)' then raise exception 'ASSERT 9 FAILED: body after soft delete is %', body_now; end if;
  insert into _log(line) values ('9 soft delete: row survives, body blanked');

  -- 9b. the column grant. Supabase's default privileges would have handed
  -- authenticated table-level UPDATE; the migration revokes first. Without
  -- that, this UPDATE would SUCCEED — "message edit"'s WITH CHECK pins only
  -- channel — and an author could move their post to another squad.
  perform pg_temp.as_user(parent);
  begin
    update messages set team_id = 'f0000000-0000-4000-8000-0000000000fb' where id = reply_id; caught := null;
  exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 9b FAILED: a parent could UPDATE team_id'; end if;
  insert into _log(line) values ('9b column grant holds: UPDATE team_id refused (' || caught || ')');

  -- 10. read stats staff-only
  perform pg_temp.as_user(parent);
  insert into message_reads (message_id, profile_id) values (post_id, parent::uuid);
  select count(*) into n from public.message_read_stats(squad_a);
  reset role;
  if n <> 0 then raise exception 'ASSERT 10 FAILED: parent got % stat row(s)', n; end if;
  perform pg_temp.as_user(coach);
  select reads into n from public.message_read_stats(squad_a) where message_id = post_id;
  reset role;
  if n <> 1 then raise exception 'ASSERT 10 FAILED: coach sees % read(s), want 1', n; end if;
  insert into _log(line) values ('10 read stats: parent gets no rows; coach sees 1 read on the post');

  -- 11. anon
  if has_table_privilege('anon','public.messages','select') or has_table_privilege('anon','public.message_reads','select')
     or has_table_privilege('anon','public.channel_settings','select') then
    raise exception 'ASSERT 11 FAILED: anon holds a privilege';
  end if;
  insert into _log(line) values ('11 anon holds nothing on messages, message_reads, channel_settings');
end $fn$;

select pg_temp.assert_chat();

select line from _log order by seq;

-- ⚠️ NOT OPTIONAL. A club, four people, three players, messages and a queued
-- push all went into production above. The rollback is what makes that fine.
rollback;
