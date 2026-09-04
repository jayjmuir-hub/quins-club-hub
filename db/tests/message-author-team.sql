-- Harness for db/migrations/20260908_message_author_team.sql — THE PILL'S SQUAD.
-- Run with `npm run db:check -- message-author-team`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- WHAT IT GUARDS. messages.author_team_id names the squad whose membership
-- gave the author the role on their pill, so a manager in the club-wide
-- Age Group Managers channel reads "U11 · Team Manager" and not just
-- "Team Manager" (Jay, 4 Sep 2026).
--
--  0. BASELINE: before the migration a manager writes a squad post and a
--     managers-channel post. The column does not exist yet; step 2 proves the
--     backfill reached them.
--  1. after the migration the trigger stamps a NEW managers-channel post from
--     the same manager with her squad
--  2. the two pre-migration posts were BACKFILLED with the same squad
--  3. CONTROL: a parent's squad post is stamped NULL — the column is not
--     "the message's team", it is "the squad behind the author's role"
--  4. DETERMINISM: give the manager a second squad whose name sorts FIRST;
--     her next managers-channel post wears that one — squad name is the
--     tie-break, so a two-squad manager never flips between posts
--  5. FAULT: null the column on the manager's posts and re-run the backfill
--     statement with the role filter broken (author_role = 'nobody') — it must
--     restore NOTHING. Then the real backfill restores all three. The
--     assertion is live, not a restatement of the schema.
--  6. touch_message keeps it: editing the post's body leaves author_team_id
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-000000000300','ZZ Pillprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select ('f0000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'zz-pill-' || n || '@example.invalid', now(), '{}'::jsonb, now(), now()
  from generate_series(10, 12) n;

-- Two squads. 'ZZ A Pillprobe' sorts before 'ZZ U11 Pillprobe' — step 4.
insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-000000000301','f0000000-0000-4000-8000-000000000300','ZZ U11 Pillprobe', 1101),
 ('f0000000-0000-4000-8000-000000000302','f0000000-0000-4000-8000-000000000300','ZZ A Pillprobe',   1102);

-- personas: 10 manager of U11 · 11 parent on U11 (a parent row needs a
-- player — memberships_family_role_needs_player) · 12 spare
insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-000000000320','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301','ZZ Pillprobe Player');
insert into memberships (profile_id, club_id, team_id, role, title, status, player_id) values
 ('f0000000-0000-4000-8000-000000000310','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301','manager','Team Manager','active', null),
 ('f0000000-0000-4000-8000-000000000311','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301','parent', null,'active','f0000000-0000-4000-8000-000000000320');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── 0: BASELINE, before the migration ────────────────────────────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000310');
insert into messages (club_id, team_id, channel, body) values
 ('f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000301','squad','zz pill squad before');
insert into messages (club_id, channel, body) values
 ('f0000000-0000-4000-8000-000000000300','managers','zz pill managers before');
reset role;
insert into _log(line) values ('0 baseline: manager wrote a squad post and a managers-channel post BEFORE the migration');

-- ── migration under test: db/migrations/20260908_message_author_team.sql,
--    verbatim (begin/commit stripped) ────────────────────────────────────────

alter table public.messages
  add column if not exists author_team_id uuid references public.teams(id) on delete set null;

comment on column public.messages.author_team_id is
  'The squad whose membership gave the author their author_role/author_title, stamped by messages_provenance. Null for a club-wide role or a non-staff author.';

create or replace function private.set_message_provenance()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  parent public.messages;
  ev public.events;
  conv public.conversations;
begin
  new.author_id := auth.uid();
  if new.author_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if new.parent_id is not null then
    select * into parent from messages where id = new.parent_id;
    if parent.id is null then
      raise exception 'no such message to reply to' using errcode = 'P0002';
    end if;
    if parent.parent_id is not null then
      raise exception 'replies are one level deep' using errcode = '23514';
    end if;
    if parent.deleted_at is not null then
      raise exception 'that message was removed' using errcode = '23514';
    end if;
    if parent.channel = 'dm' then
      raise exception 'a direct message has no threads' using errcode = '23514';
    end if;
    new.team_id  := parent.team_id;
    new.channel  := parent.channel;
    new.event_id := parent.event_id;
    new.conversation_id := null;
    new.pinned   := false;
  elsif new.conversation_id is not null then
    select * into conv from conversations where id = new.conversation_id;
    if conv.id is null then
      raise exception 'no such conversation' using errcode = 'P0002';
    end if;
    if conv.kind = 'group' then
      if not exists (select 1 from conversation_members gm
                      where gm.conversation_id = conv.id
                        and gm.profile_id = new.author_id) then
        raise exception 'not your conversation' using errcode = '42501';
      end if;
    else
      if new.author_id not in (conv.profile_a, conv.profile_b) then
        raise exception 'not your conversation' using errcode = '42501';
      end if;
      if not private.can_dm(case when conv.profile_a = new.author_id then conv.profile_b else conv.profile_a end) then
        raise exception 'you cannot message this person' using errcode = '42501';
      end if;
    end if;
    new.channel  := 'dm';
    new.team_id  := null;
    new.event_id := null;
    new.pinned   := false;
    if conv.kind <> 'group' then
      new.mentions := '{}';
    end if;
    update conversations set last_at = now() where id = conv.id;
  elsif new.event_id is not null then
    select * into ev from events where id = new.event_id;
    if ev.id is null then
      raise exception 'no such fixture' using errcode = 'P0002';
    end if;
    if new.team_id is null then
      new.team_id := ev.team_id;
    elsif new.team_id is distinct from ev.team_id then
      raise exception 'that fixture belongs to another squad' using errcode = '23514';
    end if;
  end if;

  if new.channel = 'staff' and new.team_id is null then
    raise exception 'a staff channel belongs to a squad' using errcode = '23514';
  end if;

  select m.role, m.title, m.team_id
    into new.author_role, new.author_title, new.author_team_id
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
   order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                        when 'medic' then 3 else 9 end,
            (m.team_id is null),
            t.name
   limit 1;
  -- The squad is for the STAFF pill. A parent's row also has a team, and
  -- stamping it would make the column mean two things (caught by the
  -- harness's control, 4 Sep 2026).
  if new.author_role is null or new.author_role not in ('admin','coach','manager','medic') then
    new.author_team_id := null;
  end if;

  new.club_id := coalesce(
    conv.club_id,
    (select club_id from teams where id = new.team_id),
    (select m.club_id from memberships m
      where m.profile_id = new.author_id and m.status = 'active'
      order by m.created_at limit 1));
  if new.club_id is null then
    raise exception 'no club for this message' using errcode = '23502';
  end if;

  if coalesce(array_length(new.mentions, 1), 0) > 0 then
    select coalesce(array_agg(distinct m), '{}') into new.mentions
      from unnest(new.mentions) as m
     where m <> new.author_id
       and m in (
         select profile_id from private.notice_audience(new.club_id, new.team_id) as aud(profile_id)
          where new.channel = 'squad'
         union
         select profile_id from private.staff_audience(new.team_id) where new.channel = 'staff'
         union
         select rca.profile_id from private.role_channel_audience(new.channel, new.club_id) rca
          where new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee')
         union
         select gm.profile_id from conversation_members gm
          where new.conversation_id is not null
            and gm.conversation_id = new.conversation_id);
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$;

create or replace function private.touch_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
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
  new.author_team_id := old.author_team_id;
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

-- ⚠️ messages_touch (BEFORE UPDATE) copies OLD.author_team_id over NEW, which
-- is right for an edit and wrong for this one backfill — with it on, the
-- update wrote nothing (caught by the harness, 4 Sep 2026). Off for the
-- statement, on again straight after; the migration runs in one transaction.
alter table public.messages disable trigger messages_touch;
update public.messages x
   set author_team_id = (
     select m.team_id
       from public.memberships m
       left join public.teams t on t.id = m.team_id
      where m.profile_id = x.author_id and m.status = 'active'
        and (m.team_id = x.team_id or m.team_id is null
             or x.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
      order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                           when 'medic' then 3 else 9 end,
               (m.team_id is null),
               t.name
      limit 1)
 where x.author_role in ('admin','coach','manager','medic')
   and x.channel <> 'dm'
   and x.author_team_id is null;
alter table public.messages enable trigger messages_touch;

-- ── end of migration ─────────────────────────────────────────────────────────

-- Created AFTER the migration: a SQL-language body is checked at creation,
-- and the column it reads did not exist before this point.
create function pg_temp.squad_of(_body text) returns uuid language sql as $$
  select author_team_id from public.messages where body = _body;
$$;


-- ── 1: the trigger stamps a new post ─────────────────────────────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000310');
insert into messages (club_id, channel, body) values
 ('f0000000-0000-4000-8000-000000000300','managers','zz pill managers after');
reset role;
do $a$
begin
  if pg_temp.squad_of('zz pill managers after') is distinct from 'f0000000-0000-4000-8000-000000000301' then
    raise exception 'ASSERT 1 FAILED: a managers-channel post should be stamped with the manager''s squad, got %', pg_temp.squad_of('zz pill managers after');
  end if;
  insert into _log(line) values ('1 trigger: a new managers-channel post wears the U11 squad');
end $a$;

-- ── 2: the backfill reached the pre-migration posts ──────────────────────────
do $a$
begin
  if pg_temp.squad_of('zz pill squad before') is distinct from 'f0000000-0000-4000-8000-000000000301'
     or pg_temp.squad_of('zz pill managers before') is distinct from 'f0000000-0000-4000-8000-000000000301' then
    raise exception 'ASSERT 2 FAILED: both pre-migration posts should be backfilled with U11, got % and %',
      pg_temp.squad_of('zz pill squad before'), pg_temp.squad_of('zz pill managers before');
  end if;
  insert into _log(line) values ('2 backfill: both posts written before the migration now wear U11');
end $a$;

-- ── 3: CONTROL — a parent is stamped null ────────────────────────────────────
-- A squad is announce-only by default, so the parent REPLIES to the manager's
-- post (the one door a parent has there); the reply is stamped like any row.
select pg_temp.as_user('f0000000-0000-4000-8000-000000000311');
insert into messages (parent_id, body)
select id, 'zz pill parent post' from messages where body = 'zz pill squad before';
reset role;
do $a$
begin
  if pg_temp.squad_of('zz pill parent post') is not null then
    raise exception 'ASSERT 3 FAILED: a parent''s post must carry no author squad, got %', pg_temp.squad_of('zz pill parent post');
  end if;
  insert into _log(line) values ('3 control: a parent''s squad post is stamped null — the column is the squad behind the ROLE, not the message''s team');
end $a$;

-- ── 4: DETERMINISM — two squads, the name decides ────────────────────────────
insert into memberships (profile_id, club_id, team_id, role, title, status) values
 ('f0000000-0000-4000-8000-000000000310','f0000000-0000-4000-8000-000000000300','f0000000-0000-4000-8000-000000000302','manager','Team Manager','active');
select pg_temp.as_user('f0000000-0000-4000-8000-000000000310');
insert into messages (club_id, channel, body) values
 ('f0000000-0000-4000-8000-000000000300','managers','zz pill two squads');
reset role;
do $a$
begin
  if pg_temp.squad_of('zz pill two squads') is distinct from 'f0000000-0000-4000-8000-000000000302' then
    raise exception 'ASSERT 4 FAILED: with two manager rows the squad whose name sorts first (ZZ A) should win, got %', pg_temp.squad_of('zz pill two squads');
  end if;
  insert into _log(line) values ('4 determinism: a manager on two squads wears the one whose name sorts first, every time');
end $a$;

-- ── 5: FAULT — the backfill with a broken filter restores nothing ────────────
-- (touch_message would put the value straight back — off for the null-out, as
-- for the backfill itself)
alter table public.messages disable trigger messages_touch;
update public.messages set author_team_id = null where body like 'zz pill %';
alter table public.messages enable trigger messages_touch;
-- ⚠️ messages_touch (BEFORE UPDATE) copies OLD.author_team_id over NEW, which
-- is right for an edit and wrong for this one backfill — with it on, the
-- update wrote nothing (caught by the harness, 4 Sep 2026). Off for the
-- statement, on again straight after; the migration runs in one transaction.
alter table public.messages disable trigger messages_touch;
update public.messages x
   set author_team_id = (
     select m.team_id from public.memberships m left join public.teams t on t.id = m.team_id
      where m.profile_id = x.author_id and m.status = 'active'
        and (m.team_id = x.team_id or m.team_id is null
             or x.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
      order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end,
               (m.team_id is null), t.name
      limit 1)
 where x.author_role = 'nobody'   -- the injected fault
   and x.channel <> 'dm' and x.author_team_id is null;
alter table public.messages enable trigger messages_touch;
do $a$
declare n int;
begin
  select count(*) into n from public.messages where body like 'zz pill %' and author_team_id is not null;
  if n <> 0 then
    raise exception 'ASSERT 5a FAILED: the broken backfill should restore nothing, restored %', n;
  end if;
end $a$;
-- ⚠️ messages_touch (BEFORE UPDATE) copies OLD.author_team_id over NEW, which
-- is right for an edit and wrong for this one backfill — with it on, the
-- update wrote nothing (caught by the harness, 4 Sep 2026). Off for the
-- statement, on again straight after; the migration runs in one transaction.
alter table public.messages disable trigger messages_touch;
update public.messages x
   set author_team_id = (
     select m.team_id from public.memberships m left join public.teams t on t.id = m.team_id
      where m.profile_id = x.author_id and m.status = 'active'
        and (m.team_id = x.team_id or m.team_id is null
             or x.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
      order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end,
               (m.team_id is null), t.name
      limit 1)
 where x.author_role in ('admin','coach','manager','medic')
   and x.channel <> 'dm' and x.author_team_id is null;
alter table public.messages enable trigger messages_touch;
do $a$
declare n int;
begin
  select count(*) into n from public.messages where body like 'zz pill %' and author_role = 'manager' and author_team_id is not null;
  if n <> 4 then
    raise exception 'ASSERT 5b FAILED: the real backfill should restore the manager''s four posts, restored %', n;
  end if;
  insert into _log(line) values ('5 fault: a backfill with its role filter broken restores 0; the real one restores 4');
end $a$;

-- ── 6: an edit keeps the squad ───────────────────────────────────────────────
-- As the OWNER, trigger on: a client cannot even name this column in an
-- UPDATE (column grants — 'permission denied for table messages', found by
-- this step's first draft), so the trigger is the guard for everything else.
update messages set body = 'zz pill managers after (edited)', author_team_id = null where body = 'zz pill managers after';
do $a$
begin
  if pg_temp.squad_of('zz pill managers after (edited)') is null then
    raise exception 'ASSERT 6 FAILED: touch_message should keep author_team_id through an edit that tried to null it';
  end if;
  insert into _log(line) values ('6 touch: an edit that tried to null the squad left it in place');
end $a$;

select line from _log order by seq;
rollback;
