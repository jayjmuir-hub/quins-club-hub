-- Harness for db/migrations/20260824_chat_list.sql.
-- Run with `npm run db:check -- chat-list`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below. Cast borrowed from squad-chat-phase3.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. PARENT (squad A only) sees exactly: squad A, Whole club, and no staff row
--  2. COACH sees squad A, squad A · staff, Whole club — and NOT squad B
--  3. a coach post in squad A: PARENT's squad row shows it as last, unread 1;
--     COACH's own row shows unread 0 (own post); a read row clears PARENT's
--  4. a DM PARENT -> PARENT2: both get a dm row; PARENT2 unread 1, PARENT 0;
--     nobody else sees it
--  5. newest first: after the DM, PARENT's first row is the dm
--  6. the author removes an hour-old message (no 15-minute limit on delete)
--  7. words cannot be edited after 15 minutes (the trigger refuses)
--  8. delete chat: cleared for the one who cleared it, intact for the other,
--     relisted with only the new message when the other writes again
--  9. an outsider cannot clear somebody else's conversation

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c5','ZZ Chats Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000044','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-unknown@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000046','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000047','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-chats-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

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
 ('f0000000-0000-4000-8000-000000000041','https://push.example.invalid/zz-chats-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000042','https://push.example.invalid/zz-chats-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000043','https://push.example.invalid/zz-chats-parent2','k','a'),
 ('f0000000-0000-4000-8000-000000000047','https://push.example.invalid/zz-chats-admin','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── Delete a message: the author, any time ─────────────────────────────────

drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (
    author_id = (select auth.uid())
    or (channel in ('squad', 'staff') and team_id is not null and private.can_edit_team(team_id))
    or (channel = 'squad' and team_id is null and private.is_admin(club_id))
    or (channel = 'dm' and private.admin_may_review(conversation_id))
  ) with check (channel in ('squad','staff','dm'));

create or replace function private.touch_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  new.club_id    := old.club_id;
  new.team_id    := old.team_id;
  new.channel    := old.channel;
  new.parent_id  := old.parent_id;
  new.event_id   := old.event_id;
  new.conversation_id := old.conversation_id;
  new.author_id  := old.author_id;
  new.author_role  := old.author_role;
  new.author_title := old.author_title;
  new.mentions   := old.mentions;
  new.created_at := old.created_at;

  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '(removed)';
    new.pinned := false;
  elsif old.deleted_at is not null then
    new.body := old.body;
    new.deleted_at := old.deleted_at;
    new.pinned := false;
  elsif new.body is distinct from old.body then
    -- Only the author edits words, and only for 15 minutes (24 Aug 2026:
    -- the limit used to sit in the policy, which also blocked a late
    -- delete). An admin reviewing a DM may remove; rewriting is not a review.
    if auth.uid() <> old.author_id then
      raise exception 'only the author can edit a message' using errcode = '42501';
    end if;
    if old.created_at < now() - interval '15 minutes' then
      raise exception 'a message can be edited for 15 minutes' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$function$;

-- ── Delete a chat: clear a DM for me ───────────────────────────────────────

create table if not exists public.conversation_clears (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  cleared_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
comment on table public.conversation_clears is
  'When a participant last cleared a DM for themselves. Reads before cleared_at are hidden from them. See db/migrations/20260824_chat_list.sql.';
alter table public.conversation_clears enable row level security;
revoke all on public.conversation_clears from public, anon, authenticated;
grant select on public.conversation_clears to authenticated;
-- if exists: this migration created the policy, so a replay (the harness
-- inlines this file verbatim) must be legal against a database that has it.
drop policy if exists "clear own" on public.conversation_clears;
create policy "clear own" on public.conversation_clears
  for select using (profile_id = (select auth.uid()));

create or replace function private.cleared_before(_conversation uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select cleared_at from conversation_clears
   where conversation_id = _conversation and profile_id = auth.uid()
$$;
revoke all on function private.cleared_before(uuid) from public, anon;
grant execute on function private.cleared_before(uuid) to authenticated;

create or replace function public.clear_conversation(_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not private.in_conversation(_conversation) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  insert into conversation_clears (conversation_id, profile_id, cleared_at)
  values (_conversation, auth.uid(), now())
  on conflict (conversation_id, profile_id) do update set cleared_at = excluded.cleared_at;
end;
$function$;
revoke all on function public.clear_conversation(uuid) from public, anon;
grant execute on function public.clear_conversation(uuid) to authenticated;

drop policy "message read" on public.messages;
create policy "message read" on public.messages
  for select using (
    case channel
      when 'squad' then
        case when team_id is null then exists (
               select 1 from memberships m
                where m.profile_id = (select auth.uid())
                  and m.club_id = messages.club_id and m.status = 'active')
             else private.can_see_team(team_id) end
      when 'staff' then private.can_edit_team(team_id)
      when 'dm' then
        (private.in_conversation(conversation_id)
          and created_at > coalesce(private.cleared_before(conversation_id), '-infinity'::timestamptz))
        or private.admin_may_review(conversation_id)
      else false
    end
  );

-- ── The list ───────────────────────────────────────────────────────────────

create or replace function public.my_chats()
returns table (
  kind text, team_id uuid, conversation_id uuid, label text, detail text,
  last_at timestamptz, last_body text, last_author_id uuid, last_author_name text, unread bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  rows as (
    -- squad channels
    select 'squad'::text as kind, t.id as team_id, null::uuid as conversation_id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           lm.created_at as last_at, lm.body as last_body, lm.author_id as last_author_id,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id)) as unread
      from teams t cross join club
      left join lateral (select created_at, body, author_id from messages x
                          where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_see_team(t.id)
    union all
    -- staff channels, for the squad's staff
    select 'staff', t.id, null, t.name || ' · staff', 'Staff only',
           lm.created_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from teams t cross join club
      left join lateral (select created_at, body, author_id from messages x
                          where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_edit_team(t.id)
    union all
    -- the club channel
    select 'club', null, null, 'Whole club', 'Club-wide · admins post',
           lm.created_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from club
      left join lateral (select created_at, body, author_id from messages x
                          where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
    union all
    -- direct messages I am in
    select 'dm', null, c.id, pr.full_name,
           coalesce((select labelled.l from (
               select case m.role when 'admin' then 'Club admin' when 'coach' then 'Coach'
                                  when 'manager' then 'Team Manager' when 'medic' then 'Medic' else null end as l,
                      case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end as o
                 from memberships m where m.profile_id = pr.id and m.status = 'active') labelled
               where labelled.l is not null order by labelled.o limit 1), 'Direct message'),
           c.last_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null
               and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where me.id in (c.profile_a, c.profile_b)
       -- cleared, and nothing since: not listed (WhatsApp's "delete chat")
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
  )
  select r.kind, r.team_id, r.conversation_id, r.label, r.detail,
         r.last_at, r.last_body, r.last_author_id, p.full_name, r.unread
    from rows r
    left join profiles p on p.id = r.last_author_id
   order by r.last_at desc nulls last, r.label;
$function$;

revoke all on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

comment on function public.my_chats() is
  'The Chats list: every channel and DM the caller may read, newest first, with unread counts. See db/migrations/20260824_my_chats.sql.';


create function pg_temp.assert_chats() returns void language plpgsql as $fn$
declare
  n int; post_id uuid; conv uuid; r record; caught text;
  coach constant uuid := 'f0000000-0000-4000-8000-000000000041';
  parent constant uuid := 'f0000000-0000-4000-8000-000000000042';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000043';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000046';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000fe';
  squad_b constant uuid := 'f0000000-0000-4000-8000-0000000000ff';
begin
  -- 1
  perform pg_temp.as_user(parent::text);
  select count(*) into n from public.my_chats() where kind = 'squad' and team_id = squad_a;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: parent squad rows = %', n; end if;
  select count(*) into n from public.my_chats() where kind = 'club';
  if n <> 1 then raise exception 'ASSERT 1 FAILED: club rows = %', n; end if;
  select count(*) into n from public.my_chats() where kind = 'staff' or team_id = squad_b;
  reset role;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: parent sees % staff/other rows', n; end if;
  insert into _log(line) values ('1 parent: squad A, Whole club, nothing else');

  -- 2
  perform pg_temp.as_user(coach::text);
  select count(*) into n from public.my_chats() where kind = 'staff' and team_id = squad_a;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: coach staff rows = %', n; end if;
  select count(*) into n from public.my_chats() where team_id = squad_b;
  reset role;
  if n <> 0 then raise exception 'ASSERT 2 FAILED: coach sees squad B'; end if;
  insert into _log(line) values ('2 coach: squad A, its staff channel, the club; not squad B');

  -- 3
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Kick-off moved to 10:30') returning id into post_id;
  select unread into n from public.my_chats() where kind = 'squad' and team_id = squad_a;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: author unread = %', n; end if;
  perform pg_temp.as_user(parent::text);
  select * into r from public.my_chats() where kind = 'squad' and team_id = squad_a;
  if r.unread <> 1 or r.last_body <> 'Kick-off moved to 10:30' then raise exception 'ASSERT 3 FAILED: parent unread % last %', r.unread, r.last_body; end if;
  insert into message_reads (message_id, profile_id) values (post_id, parent);
  select unread into n from public.my_chats() where kind = 'squad' and team_id = squad_a;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: after read unread = %', n; end if;
  insert into _log(line) values ('3 a coach post: last line and unread 1 for the parent, 0 for the author, 0 once read');

  -- 4
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(parent2);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Two seats held');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  reset role;
  if r.unread <> 0 then raise exception 'ASSERT 4 FAILED: sender unread = %', r.unread; end if;
  perform pg_temp.as_user(parent2::text);
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  reset role;
  if r.unread <> 1 or r.last_body <> 'Two seats held' then raise exception 'ASSERT 4 FAILED: recipient unread % last %', r.unread, r.last_body; end if;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from public.my_chats() where kind = 'dm';
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: outsider sees % dm rows', n; end if;
  insert into _log(line) values ('4 a DM: a row for each side, unread for the recipient only, invisible to anyone else');

  -- 5
  perform pg_temp.as_user(parent::text);
  select kind into r from public.my_chats() limit 1;
  reset role;
  if r.kind <> 'dm' then raise exception 'ASSERT 5 FAILED: first row is %', r.kind; end if;
  insert into _log(line) values ('5 newest first: the DM just sent is at the top');

  -- 6. the author removes an OLD message (older than 15 minutes)
  select id into post_id from messages where conversation_id = conv limit 1;
  -- backdate as postgres; touch_message freezes created_at, so step round it
  alter table messages disable trigger messages_touch;
  update messages set created_at = now() - interval '1 hour' where id = post_id;
  alter table messages enable trigger messages_touch;
  perform pg_temp.as_user(parent::text);
  update messages set deleted_at = now() where id = post_id;
  reset role;
  select count(*) into n from messages where id = post_id and deleted_at is not null and body = '(removed)';
  if n <> 1 then raise exception 'ASSERT 6 FAILED: author could not remove an hour-old message'; end if;
  insert into _log(line) values ('6 the author removes their own hour-old message');

  -- 7. ...but cannot EDIT words after 15 minutes (the limit moved into the trigger)
  perform pg_temp.as_user(parent::text);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Second thought') returning id into post_id;
  reset role;
  alter table messages disable trigger messages_touch;
  update messages set created_at = now() - interval '1 hour' where id = post_id;
  alter table messages enable trigger messages_touch;
  perform pg_temp.as_user(parent::text);
  begin update messages set body = 'Rewritten' where id = post_id; caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 7 FAILED: an hour-old message was edited'; end if;
  insert into _log(line) values ('7 words cannot be edited after 15 minutes: ' || caught);

  -- 8. PARENT2 deletes the chat for themselves: hidden from them, not from PARENT, back on a new message
  perform pg_temp.as_user(parent2::text);
  perform public.clear_conversation(conv);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 8 FAILED: after clearing, parent2 still reads % message(s)', n; end if;
  select count(*) into n from public.my_chats() where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 8 FAILED: cleared chat still listed'; end if;
  reset role;
  -- one transaction, one now(): nudge the clear back so the next message is after it
  update conversation_clears set cleared_at = cleared_at - interval '1 millisecond' where conversation_id = conv;
  perform pg_temp.as_user(parent::text);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 2 then raise exception 'ASSERT 8 FAILED: the other side lost messages (% left)', n; end if;
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Still on for Saturday?');
  reset role;
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from messages where conversation_id = conv;
  select * into r from public.my_chats() where conversation_id = conv;
  reset role;
  if n <> 1 then raise exception 'ASSERT 8 FAILED: after a new message parent2 reads % (want only the new one)', n; end if;
  if r.unread <> 1 or r.last_body <> 'Still on for Saturday?' then raise exception 'ASSERT 8 FAILED: relisted row unread % last %', r.unread, r.last_body; end if;
  insert into _log(line) values ('8 delete chat: gone for the one who deleted it, intact for the other, back from the next message');

  -- 9. an outsider cannot clear somebody else''s conversation
  perform pg_temp.as_user(outsider::text);
  begin perform public.clear_conversation(conv); caught := null; exception when others then caught := sqlerrm; end;
  reset role;
  if caught is null then raise exception 'ASSERT 9 FAILED: outsider cleared a conversation'; end if;
  insert into _log(line) values ('9 only a participant can clear a conversation');
end $fn$;

select pg_temp.assert_chats();
select line from _log order by seq;

rollback;
