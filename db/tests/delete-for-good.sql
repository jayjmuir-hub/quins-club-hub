-- Harness for db/migrations/20260824_delete_for_good.sql.
-- Run with `npm run db:check -- delete-for-good`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below. Cast borrowed from squad-chat-phase3.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. the author hard-deletes their own post; its reply and read receipt go with it
--  2. a parent cannot delete the coach's post (0 rows); the coach can delete the parent's
--  3. a REPORTED post: the author's delete does nothing; an admin's removes it
--  4. a post whose REPLY is reported is protected the same way
--  5. a participant deletes a DM: gone for both sides
--  6. a reported DM: participant refused, admin allowed
--  7. the welfare access log survives the conversation it recorded (conversation_id null)
--  8. clear_channel: coach empties squad A (reported post stays); a parent is refused;
--     an admin empties the club channel

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c5','ZZ Delete Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000044','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-unknown@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000046','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000047','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-delete-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000c5','U16B ZZ Probe', 1001),
 ('f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000c5','U10 ZZ Probe', 1002);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000d1','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Sixteen'),
 ('f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Nodob'),
 ('f0000000-0000-4000-8000-0000000000d3','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Childseven'),
 ('f0000000-0000-4000-8000-0000000000d4','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','Zz Probe Childeight');

insert into player_private (player_id, date_of_birth) values
 ('f0000000-0000-4000-8000-0000000000d1', current_date - interval '16 years');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000041','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000042','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','parent','active'),
 ('f0000000-0000-4000-8000-000000000043','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d3','parent','active'),
 ('f0000000-0000-4000-8000-000000000044','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','player','active'),
 ('f0000000-0000-4000-8000-000000000045','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d2','player','active'),
 ('f0000000-0000-4000-8000-000000000046','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000d4','parent','active'),
 ('f0000000-0000-4000-8000-000000000047','f0000000-0000-4000-8000-0000000000c5', null, null, 'admin','active');

insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000041','https://push.example.invalid/zz-delete-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000042','https://push.example.invalid/zz-delete-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000043','https://push.example.invalid/zz-delete-parent2','k','a'),
 ('f0000000-0000-4000-8000-000000000047','https://push.example.invalid/zz-delete-admin','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── The audit log survives the conversation ────────────────────────────────

alter table public.welfare_access_log
  alter column conversation_id drop not null,
  drop constraint welfare_access_log_conversation_id_fkey,
  add constraint welfare_access_log_conversation_id_fkey
    foreign key (conversation_id) references public.conversations(id) on delete set null;

-- ── Who may delete a message ───────────────────────────────────────────────

create or replace function private.message_reported(_message uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- the message itself, OR any reply under it: deleting a post cascades its
  -- replies, and a reported reply must not vanish with an innocent parent
  select exists (select 1 from message_reports r
                   join messages x on x.id = r.message_id
                  where x.id = _message or x.parent_id = _message)
$$;
revoke all on function private.message_reported(uuid) from public, anon;
grant execute on function private.message_reported(uuid) to authenticated;

create or replace function private.conversation_reported(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from message_reports r join messages x on x.id = r.message_id
                  where x.conversation_id = _conversation)
$$;
revoke all on function private.conversation_reported(uuid) from public, anon;
grant execute on function private.conversation_reported(uuid) to authenticated;

grant delete on public.messages to authenticated;

-- if exists: first created here, so a replay (the harness inlines this
-- file verbatim) must be legal against a database that has it.
drop policy if exists "message delete" on public.messages;
create policy "message delete" on public.messages
  for delete using (
    case
      -- a reported message is evidence: admins only
      when private.message_reported(id) then
        case channel
          when 'dm' then private.admin_may_review(conversation_id)
          else private.is_admin(club_id)
        end
      else
        author_id = (select auth.uid())
        or (channel in ('squad', 'staff') and team_id is not null and private.can_edit_team(team_id))
        or (channel = 'squad' and team_id is null and private.is_admin(club_id))
        or (channel = 'dm' and private.admin_may_review(conversation_id))
    end
  );

-- ── Who may delete a conversation ──────────────────────────────────────────

grant delete on public.conversations to authenticated;

-- if exists: first created here, so a replay (the harness inlines this
-- file verbatim) must be legal against a database that has it.
drop policy if exists "conversation delete" on public.conversations;
create policy "conversation delete" on public.conversations
  for delete using (
    case
      when private.conversation_reported(id) then private.admin_may_review(id)
      else (select auth.uid()) in (profile_a, profile_b) or private.admin_may_review(id)
    end
  );

-- ── Clear a channel ────────────────────────────────────────────────────────

create or replace function public.clear_channel(_team uuid, _channel text default 'squad')
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  n integer;
  my_club uuid;
begin
  if _channel not in ('squad', 'staff') then
    raise exception 'no such channel' using errcode = '22023';
  end if;
  if _team is null then
    -- the club channel: admins only
    select m.club_id into my_club from memberships m
     where m.profile_id = auth.uid() and m.status = 'active' order by m.created_at limit 1;
    if my_club is null or not private.is_admin(my_club) then
      raise exception 'not an admin' using errcode = '42501';
    end if;
    delete from messages where club_id = my_club and channel = 'squad' and team_id is null
       and parent_id is null and not private.message_reported(id);
  else
    if not private.can_edit_team(_team) then
      raise exception 'not this squad''s staff' using errcode = '42501';
    end if;
    delete from messages where team_id = _team and channel = _channel
       and parent_id is null and not private.message_reported(id);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.clear_channel(uuid, text) from public, anon;
grant execute on function public.clear_channel(uuid, text) to authenticated;

comment on function public.clear_channel(uuid, text) is
  'Deletes every post (and, by cascade, reply) in a squad, staff or club channel. Reported posts stay. Staff / admins only. See db/migrations/20260824_delete_for_good.sql.';


create function pg_temp.assert_delete() returns void language plpgsql as $fn$
declare
  n int; caught text; post_id uuid; reply_id uuid; conv uuid; conv_minor uuid; msg uuid; log_id uuid;
  coach constant uuid := 'f0000000-0000-4000-8000-000000000041';
  parent constant uuid := 'f0000000-0000-4000-8000-000000000042';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000043';
  minor constant uuid := 'f0000000-0000-4000-8000-000000000044';
  admin constant uuid := 'f0000000-0000-4000-8000-000000000047';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fe';
begin
  -- open chat so the parent may post
  insert into channel_settings (team_id, club_id, announce_only, updated_by) values (squad_a, 'f0000000-0000-4000-8000-0000000000c5', false, coach);

  -- 1
  perform pg_temp.as_user(parent::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Anyone need a lift?') returning id into post_id;
  reset role;
  perform pg_temp.as_user(parent2::text);
  insert into messages (parent_id, channel, body) values (post_id, 'squad', 'Yes please') returning id into reply_id;
  insert into message_reads (message_id, profile_id) values (post_id, parent2);
  reset role;
  perform pg_temp.as_user(parent::text);
  delete from messages where id = post_id;
  reset role;
  select count(*) into n from messages where id in (post_id, reply_id);
  if n <> 0 then raise exception 'ASSERT 1 FAILED: % row(s) left', n; end if;
  select count(*) into n from message_reads where message_id = post_id;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: read receipt left'; end if;
  insert into _log(line) values ('1 the author deletes their post; reply and read receipt go with it');

  -- 2
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Training at 5') returning id into post_id;
  reset role;
  perform pg_temp.as_user(parent::text);
  delete from messages where id = post_id;
  get diagnostics n = row_count;
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Spare boots size 4?') returning id into msg;
  reset role;
  if n <> 0 then raise exception 'ASSERT 2 FAILED: parent deleted the coach''s post'; end if;
  perform pg_temp.as_user(coach::text);
  delete from messages where id = msg;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: coach could not delete a parent''s post'; end if;
  insert into _log(line) values ('2 a parent cannot delete the coach''s post; the coach can delete the parent''s');

  -- 3
  perform pg_temp.as_user(parent::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Something rude') returning id into msg;
  reset role;
  perform pg_temp.as_user(parent2::text);
  insert into message_reports (message_id, reason) values (msg, 'Rude');
  reset role;
  perform pg_temp.as_user(parent::text);
  delete from messages where id = msg;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: author deleted a reported post'; end if;
  perform pg_temp.as_user(coach::text);
  delete from messages where id = msg;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: coach deleted a reported post'; end if;
  perform pg_temp.as_user(admin::text);
  delete from messages where id = msg;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: admin could not delete a reported post'; end if;
  insert into _log(line) values ('3 a reported post: author and coach refused, admin deletes it');

  -- 4
  perform pg_temp.as_user(parent::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Innocent post') returning id into post_id;
  reset role;
  perform pg_temp.as_user(parent2::text);
  insert into messages (parent_id, channel, body) values (post_id, 'squad', 'rude reply') returning id into reply_id;
  reset role;
  perform pg_temp.as_user(coach::text);
  insert into message_reports (message_id, reason) values (reply_id, 'Rude');
  reset role;
  perform pg_temp.as_user(parent::text);
  delete from messages where id = post_id;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: a post with a reported reply was deleted'; end if;
  insert into _log(line) values ('4 a post whose reply is reported is protected too');

  -- 5
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(parent2);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Two seats held');
  reset role;
  perform pg_temp.as_user(parent2::text);
  delete from conversations where id = conv;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 5 FAILED: participant could not delete the DM'; end if;
  select count(*) into n from messages where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: % message(s) survived', n; end if;
  insert into _log(line) values ('5 a participant deletes a DM: conversation and messages gone for both');

  -- 6
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(parent2);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Not nice') returning id into msg;
  reset role;
  perform pg_temp.as_user(parent2::text);
  insert into message_reports (message_id, reason) values (msg, 'Not nice');
  delete from conversations where id = conv;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then raise exception 'ASSERT 6 FAILED: participant deleted a reported DM'; end if;
  perform pg_temp.as_user(admin::text);
  delete from conversations where id = conv;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 6 FAILED: admin could not delete a reported DM'; end if;
  insert into _log(line) values ('6 a reported DM: participant refused, admin deletes it');

  -- 7
  perform pg_temp.as_user(parent::text);
  conv_minor := public.open_conversation(minor);
  insert into messages (conversation_id, channel, body) values (conv_minor, 'dm', 'Boots in the bag');
  reset role;
  perform pg_temp.as_user(admin::text);
  perform public.log_welfare_access(conv_minor);
  reset role;
  select id into log_id from welfare_access_log where conversation_id = conv_minor;
  perform pg_temp.as_user(parent::text);
  delete from conversations where id = conv_minor;
  get diagnostics n = row_count;
  reset role;
  if n <> 1 then raise exception 'ASSERT 7 FAILED: guardian could not delete the DM'; end if;
  select count(*) into n from welfare_access_log where id = log_id and conversation_id is null and admin_id = admin;
  if n <> 1 then raise exception 'ASSERT 7 FAILED: the access log did not survive'; end if;
  insert into _log(line) values ('7 the welfare access log outlives the conversation: admin and time kept, conversation null');

  -- 8
  perform pg_temp.as_user(parent::text);
  begin perform public.clear_channel(squad_a); caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 8 FAILED: a parent cleared the channel'; end if;
  perform pg_temp.as_user(coach::text);
  n := public.clear_channel(squad_a);
  reset role;
  if n < 1 then raise exception 'ASSERT 8 FAILED: coach cleared % posts', n; end if;
  select count(*) into n from messages where team_id = squad_a and channel = 'squad' and parent_id is null;
  if n <> 1 then raise exception 'ASSERT 8 FAILED: % post(s) left (want exactly the one with the reported reply)', n; end if;
  perform pg_temp.as_user(admin::text);
  insert into messages (channel, body) values ('squad', 'Registration closes Friday');
  n := public.clear_channel(null);
  reset role;
  if n <> 1 then raise exception 'ASSERT 8 FAILED: admin cleared % club posts', n; end if;
  insert into _log(line) values ('8 clear_channel: parent refused; coach empties squad A but the reported one stays; admin empties the club');
end $fn$;

select pg_temp.assert_delete();
select line from _log order by seq;

rollback;
