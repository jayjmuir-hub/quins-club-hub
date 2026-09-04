-- Harness for db/migrations/20260910_role_channel_pill.sql — THE CHANNEL'S OWN ROLE.
-- Run with `npm run db:check -- role-channel-pill`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- WHAT IT GUARDS. In a role channel the author wears the membership that
-- qualifies them for it: an admin who also manages U11 posts to Age Group
-- Managers as "U11 · Team Manager", not "Admin". Everywhere else, unchanged.
--
--  0. BASELINE: before the migration the admin-manager's managers-channel
--     post is stamped 'admin' with no squad (the bug, reproduced)
--  1. after it, a NEW managers-channel post is 'manager' with the squad
--  2. the pre-migration post was backfilled the same way
--  3. CONTROL: her post in the SQUAD chat is still 'admin' — the order is
--     unchanged outside role channels
--  4. CONTROL: a plain admin (no manager row) in the managers channel stays
--     'admin' — nothing to prefer
--  5. FAULT: a backfill whose channel list is broken restores nothing
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-000000000500','ZZ Chanpill Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select ('f0000000-0000-4000-8000-0000000005' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'zz-chanpill-' || n || '@example.invalid', now(), '{}'::jsonb, now(), now()
  from generate_series(10, 11) n;

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-000000000501','f0000000-0000-4000-8000-000000000500','U11 ZZ Chanpill', 1101);

-- personas: 10 admin AND manager of U11 (with the chat-managers right) · 11 plain admin with the right
insert into memberships (profile_id, club_id, team_id, role, title, status, is_super, admin_rights) values
 ('f0000000-0000-4000-8000-000000000510','f0000000-0000-4000-8000-000000000500', null, 'admin', 'Club Secretary','active', false, array['chat-managers']),
 ('f0000000-0000-4000-8000-000000000510','f0000000-0000-4000-8000-000000000500','f0000000-0000-4000-8000-000000000501','manager','Team Manager','active', false, array[]::text[]),
 ('f0000000-0000-4000-8000-000000000511','f0000000-0000-4000-8000-000000000500', null, 'admin', 'Treasurer','active', false, array['chat-managers']);

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.pill(_body text) returns text language sql as $$
  select coalesce(author_role, '-') || '/' || coalesce(author_title, '-') || '/' || coalesce(author_team_id::text, '-')
    from public.messages where body = _body;
$$;

-- ── 0: BASELINE — the bug, reproduced ────────────────────────────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000510');
insert into messages (club_id, channel, body) values ('f0000000-0000-4000-8000-000000000500','managers','zz chanpill before');
reset role;
do $a$
begin
  if pg_temp.pill('zz chanpill before') <> 'admin/Club Secretary/-' then
    raise exception 'BASELINE FAILED: expected the admin-manager stamped admin with no squad before the migration, got %', pg_temp.pill('zz chanpill before');
  end if;
  insert into _log(line) values ('0 baseline: before the migration the admin-manager''s managers post reads admin/Club Secretary/no squad');
end $a$;

-- ── migration under test: db/migrations/20260910_role_channel_pill.sql,
--    verbatim (begin/commit stripped) ────────────────────────────────────────

-- Captured live 4 Sep 2026 after 20260908; the only change is the first
-- ORDER BY term and its comment.
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

  -- The author's badge: role, title AND SQUAD (20260908), from one membership.
  -- ROLE CHANNELS: the best role ANYWHERE in the club — a head coach posting in
  -- Club Head Coaches has only a team-scoped coach row, which the
  -- (team_id = new.team_id) arm would miss for a team-less message.
  -- 20260910: in a role channel the membership that QUALIFIES the author for
  -- it comes first, so an admin-who-manages posts to Age Group Managers as
  -- "U11 · Team Manager", not "Admin". Elsewhere the order is unchanged.
  -- Deterministic since 20260908: role rank, team-scoped first, squad name.
  select m.role, m.title, m.team_id
    into new.author_role, new.author_title, new.author_team_id
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
   order by case
              when new.channel = 'managers'    and m.role = 'manager' then 0
              when new.channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach then 0
              when new.channel = 'medics'      and m.role = 'medic' then 0
              else 1 end,
            case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
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

-- Backfill: role-channel messages stamped 'admin' whose author holds the
-- channel's role get that membership's role, title and squad. messages_touch
-- would copy the old values back (20260908's lesson) — off for the statement.
alter table public.messages disable trigger messages_touch;
update public.messages x
   set (author_role, author_title, author_team_id) = (
     select m.role, m.title, m.team_id
       from public.memberships m
       left join public.teams t on t.id = m.team_id
      where m.profile_id = x.author_id and m.status = 'active'
        and ((x.channel = 'managers'    and m.role = 'manager')
          or (x.channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach)
          or (x.channel = 'medics'      and m.role = 'medic'))
      order by (m.team_id is null), t.name
      limit 1)
 where x.channel in ('managers','headcoaches','medics')
   and x.author_role = 'admin'
   and exists (select 1 from public.memberships m
                where m.profile_id = x.author_id and m.status = 'active'
                  and ((x.channel = 'managers'    and m.role = 'manager')
                    or (x.channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach)
                    or (x.channel = 'medics'      and m.role = 'medic')));
alter table public.messages enable trigger messages_touch;

-- ── end of migration ─────────────────────────────────────────────────────────

-- ── 1: a new managers post wears the manager row ─────────────────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000510');
insert into messages (club_id, channel, body) values ('f0000000-0000-4000-8000-000000000500','managers','zz chanpill after');
reset role;
do $a$
begin
  if pg_temp.pill('zz chanpill after') <> 'manager/Team Manager/f0000000-0000-4000-8000-000000000501' then
    raise exception 'ASSERT 1 FAILED: expected manager/Team Manager/U11, got %', pg_temp.pill('zz chanpill after');
  end if;
  insert into _log(line) values ('1 trigger: a new managers-channel post reads manager/Team Manager/U11');
end $a$;

-- ── 2: the old post was backfilled ───────────────────────────────────────────
do $a$
begin
  if pg_temp.pill('zz chanpill before') <> 'manager/Team Manager/f0000000-0000-4000-8000-000000000501' then
    raise exception 'ASSERT 2 FAILED: the pre-migration post should be backfilled, got %', pg_temp.pill('zz chanpill before');
  end if;
  insert into _log(line) values ('2 backfill: the pre-migration post now reads manager/Team Manager/U11');
end $a$;

-- ── 3: CONTROL — in the squad chat she is still the admin ───────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000510');
insert into messages (club_id, team_id, channel, body) values ('f0000000-0000-4000-8000-000000000500','f0000000-0000-4000-8000-000000000501','squad','zz chanpill squad');
reset role;
do $a$
begin
  if pg_temp.pill('zz chanpill squad') <> 'admin/Club Secretary/-' then
    raise exception 'ASSERT 3 FAILED: in the squad chat the order is unchanged (admin first), got %', pg_temp.pill('zz chanpill squad');
  end if;
  insert into _log(line) values ('3 control: her squad-chat post still reads admin/Club Secretary — order unchanged outside role channels');
end $a$;

-- ── 4: CONTROL — a plain admin has nothing to prefer ─────────────────────────
select pg_temp.as_user('f0000000-0000-4000-8000-000000000511');
insert into messages (club_id, channel, body) values ('f0000000-0000-4000-8000-000000000500','managers','zz chanpill plain admin');
reset role;
do $a$
begin
  if pg_temp.pill('zz chanpill plain admin') <> 'admin/Treasurer/-' then
    raise exception 'ASSERT 4 FAILED: a plain admin in the managers channel stays admin, got %', pg_temp.pill('zz chanpill plain admin');
  end if;
  insert into _log(line) values ('4 control: a plain admin in the managers channel still reads admin/Treasurer');
end $a$;

-- ── 5: FAULT — a backfill with a broken channel list restores nothing ────────
alter table public.messages disable trigger messages_touch;
update public.messages set author_role = 'admin', author_title = 'Club Secretary', author_team_id = null where body = 'zz chanpill before';
update public.messages x
   set (author_role, author_title, author_team_id) = (
     select m.role, m.title, m.team_id from public.memberships m
      where m.profile_id = x.author_id and m.status = 'active' and m.role = 'manager' limit 1)
 where x.channel in ('nowhere') and x.author_role = 'admin';   -- the injected fault
alter table public.messages enable trigger messages_touch;
do $a$
begin
  if pg_temp.pill('zz chanpill before') <> 'admin/Club Secretary/-' then
    raise exception 'ASSERT 5 FAILED: the broken backfill should have restored nothing, got %', pg_temp.pill('zz chanpill before');
  end if;
  insert into _log(line) values ('5 fault: a backfill with its channel list broken restores nothing (the real one, above, restored it)');
end $a$;

select line from _log order by seq;
rollback;
