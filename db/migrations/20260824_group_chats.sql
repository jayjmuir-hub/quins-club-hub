-- Group chats: member-created conversations with a title and 3+ members.
-- Spec: claude/plans/2026-08-24-group-chats.md. Rulings (Jay, 24 Aug 2026):
-- groups are OPEN — the adult arms of can_dm with the minor arm deliberately
-- removed (claude/decisions/2026-08-24-groups-open-no-warnings.md); a group
-- is >= 3 people; review of a group needs a minor AND a report (a DM stays
-- minor OR report). Groups reuse channel='dm' messages via conversation_id so
-- delete/clear/read plumbing is unchanged. IDEMPOTENT on purpose: the harness
-- (db/tests/group-chats.sql) inlines this file verbatim against a database
-- that may already carry it.
begin;

-- ── conversations grow a kind and a title ─────────────────────────────────
alter table public.conversations add column if not exists kind text not null default 'dm';
alter table public.conversations add column if not exists title text;
alter table public.conversations alter column profile_a drop not null;
alter table public.conversations alter column profile_b drop not null;
-- the inline pair check and unique from phase 3 become DM-only
alter table public.conversations drop constraint if exists conversations_check;
alter table public.conversations drop constraint if exists conversations_profile_a_profile_b_key;
alter table public.conversations drop constraint if exists conversations_shape;
alter table public.conversations add constraint conversations_shape check (
  (kind = 'dm' and profile_a is not null and profile_b is not null
     and profile_a < profile_b and title is null)
  or
  (kind = 'group' and profile_a is null and profile_b is null
     and title is not null and length(btrim(title)) between 1 and 80));
create unique index if not exists conversations_dm_pair
  on public.conversations (profile_a, profile_b) where kind = 'dm';

-- ── membership of a group ─────────────────────────────────────────────────
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  is_owner        boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
alter table public.conversation_members enable row level security;
grant select on public.conversation_members to authenticated;
drop policy if exists "member read" on public.conversation_members;
create policy "member read" on public.conversation_members
  for select using (private.in_conversation(conversation_id));
-- writes go through the RPCs below only — no insert/update/delete policies.

-- ── helpers ───────────────────────────────────────────────────────────────
-- in_conversation now also answers for group members.
create or replace function private.in_conversation(_conversation uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and ((select auth.uid()) in (c.profile_a, c.profile_b)
         or exists (select 1 from conversation_members gm
                     where gm.conversation_id = c.id
                       and gm.profile_id = (select auth.uid()))));
$function$;
revoke all on function private.in_conversation(uuid) from public, anon;
grant execute on function private.in_conversation(uuid) to authenticated;

create or replace function private.is_group_owner(_conversation uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select exists (select 1 from conversation_members gm
                  where gm.conversation_id = _conversation
                    and gm.profile_id = (select auth.uid()) and gm.is_owner);
$function$;
revoke all on function private.is_group_owner(uuid) from public, anon;
grant execute on function private.is_group_owner(uuid) to authenticated;

-- Who may be PUT IN a group: can_dm's adult arms (same club, no block,
-- admin either side, or a shared squad) with the minor arm removed — the
-- 24 Aug ruling, not an oversight.
create or replace function private.can_group_add(_other uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $function$
declare
  me uuid := auth.uid();
  club uuid;
begin
  if me is null or _other is null or me = _other then return false; end if;
  select m.club_id into club from memberships m
   where m.profile_id = me and m.status = 'active' order by m.created_at limit 1;
  if club is null then return false; end if;
  if not exists (select 1 from memberships m where m.profile_id = _other
                  and m.club_id = club and m.status = 'active') then return false; end if;
  if exists (select 1 from dm_blocks b where (b.blocker_id = me and b.blocked_id = _other)
                                          or (b.blocker_id = _other and b.blocked_id = me)) then
    return false;
  end if;
  if private.is_admin(club) then return true; end if;
  if exists (select 1 from memberships m where m.profile_id = _other and m.club_id = club
              and m.status = 'active' and m.role = 'admin') then return true; end if;
  return exists (
    select 1 from memberships a join memberships b on b.team_id = a.team_id
     where a.profile_id = me and a.status = 'active' and a.team_id is not null
       and b.profile_id = _other and b.status = 'active');
end;
$function$;
revoke all on function private.can_group_add(uuid) from public, anon;
grant execute on function private.can_group_add(uuid) to authenticated;

-- Reviewability forks by kind: a DM is reviewable when a minor is in it OR a
-- message was reported (23 Aug, unchanged); a GROUP only when a minor is in
-- it AND a message was reported (24 Aug ruling 3).
create or replace function private.conversation_reviewable(_conversation uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and case c.kind
             when 'group' then
               exists (select 1 from message_reports r
                         join messages x on x.id = r.message_id
                        where x.conversation_id = c.id)
               and exists (select 1 from conversation_members gm
                            where gm.conversation_id = c.id
                              and private.is_minor_profile(gm.profile_id))
             else
               private.is_minor_profile(c.profile_a)
               or private.is_minor_profile(c.profile_b)
               or exists (select 1 from message_reports r
                            join messages x on x.id = r.message_id
                           where x.conversation_id = c.id)
           end);
$function$;
revoke all on function private.conversation_reviewable(uuid) from public, anon;
grant execute on function private.conversation_reviewable(uuid) to authenticated;

create or replace function public.conversation_involves_minor(_conversation uuid)
returns boolean
language sql stable security definer set search_path = public
as $function$
  select case c.kind
           when 'group' then exists (select 1 from conversation_members gm
                                      where gm.conversation_id = c.id
                                        and private.is_minor_profile(gm.profile_id))
           else private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
         end
    from conversations c
   where c.id = _conversation
     and (private.in_conversation(c.id) or private.admin_may_review(c.id));
$function$;
revoke all on function public.conversation_involves_minor(uuid) from public, anon;
grant execute on function public.conversation_involves_minor(uuid) to authenticated;

-- ── RPCs ──────────────────────────────────────────────────────────────────
create or replace function public.create_group(_title text, _members uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  me uuid := auth.uid();
  club uuid;
  conv uuid;
  m uuid;
  others uuid[];
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select array_agg(distinct x) into others
    from unnest(coalesce(_members, '{}'::uuid[])) as x where x is not null and x <> me;
  -- the >=3 floor holds at birth: creator plus at least two others
  if coalesce(array_length(others, 1), 0) < 2 then
    raise exception 'a group is three people or more' using errcode = '23514';
  end if;
  if _title is null or length(btrim(_title)) not between 1 and 80 then
    raise exception 'a group needs a name' using errcode = '23514';
  end if;
  select mm.club_id into club from memberships mm
   where mm.profile_id = me and mm.status = 'active' order by mm.created_at limit 1;
  if club is null then raise exception 'not a club member' using errcode = '42501'; end if;
  foreach m in array others loop
    if not private.can_group_add(m) then
      raise exception 'someone picked is not in your squads' using errcode = '42501';
    end if;
  end loop;
  insert into conversations (club_id, kind, title, created_by)
       values (club, 'group', btrim(_title), me) returning id into conv;
  insert into conversation_members (conversation_id, profile_id, is_owner) values (conv, me, true);
  insert into conversation_members (conversation_id, profile_id) select conv, unnest(others);
  return conv;
end;
$function$;
revoke all on function public.create_group(text, uuid[]) from public, anon;
grant execute on function public.create_group(text, uuid[]) to authenticated;

create or replace function public.add_group_members(_conversation uuid, _members uuid[])
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  m uuid;
begin
  if not private.is_group_owner(_conversation) then
    raise exception 'only the group''s creator can add people' using errcode = '42501';
  end if;
  foreach m in array coalesce(_members, '{}'::uuid[]) loop
    if not private.can_group_add(m) then
      raise exception 'someone picked is not in your squads' using errcode = '42501';
    end if;
    insert into conversation_members (conversation_id, profile_id)
         values (_conversation, m) on conflict do nothing;
  end loop;
end;
$function$;
revoke all on function public.add_group_members(uuid, uuid[]) from public, anon;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

-- Leaving: the leaver goes; below three the group closes for everyone (the
-- spec's stated lean); a departing owner hands the flag to the
-- longest-standing member. ⚠️ A REPORTED group is never auto-deleted —
-- closing it would cascade the reported message away, and a reported message
-- is evidence (claude/decisions/2026-08-24-delete-for-good-except-reported.md).
-- A reported group left below the floor just carries on with fewer people;
-- that is not the two-person loophole, because can_group_add's arms equal
-- can_dm's adult arms, so two adults could already DM.
create or replace function public.leave_group(_conversation uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  me uuid := auth.uid();
  was_owner boolean;
  remaining int;
begin
  select gm.is_owner into was_owner from conversation_members gm
   where gm.conversation_id = _conversation and gm.profile_id = me;
  if was_owner is null then
    raise exception 'not your group' using errcode = '42501';
  end if;
  delete from conversation_members
   where conversation_id = _conversation and profile_id = me;
  select count(*) into remaining from conversation_members
   where conversation_id = _conversation;
  if remaining < 3 and not private.conversation_reported(_conversation) then
    delete from conversations where id = _conversation;
  elsif was_owner then
    update conversation_members set is_owner = true
     where conversation_id = _conversation
       and profile_id = (select profile_id from conversation_members
                          where conversation_id = _conversation
                          order by joined_at, profile_id limit 1);
  end if;
end;
$function$;
revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;

create or replace function public.remove_group_member(_conversation uuid, _member uuid)
returns void
language plpgsql security definer set search_path = public
as $function$
begin
  if not private.is_group_owner(_conversation) then
    raise exception 'only the group''s creator can remove people' using errcode = '42501';
  end if;
  if _member = auth.uid() then
    raise exception 'leave the group instead' using errcode = '23514';
  end if;
  if (select count(*) from conversation_members where conversation_id = _conversation) <= 3 then
    raise exception 'a group is three people or more — delete the group instead' using errcode = '23514';
  end if;
  delete from conversation_members
   where conversation_id = _conversation and profile_id = _member;
end;
$function$;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

-- The group picker's pool: dm_candidates minus the minor gate.
create or replace function public.group_candidates()
returns table (profile_id uuid, full_name text, role text, via_team text)
language sql stable security definer set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  people as (
    select distinct m.profile_id from memberships m, club
     where m.club_id = club.id and m.status = 'active' and m.profile_id <> (select id from me))
  select p.profile_id, pr.full_name,
         (select m.role from memberships m where m.profile_id = p.profile_id and m.status = 'active'
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end limit 1) as role,
         (select t.name from memberships a join memberships b on b.team_id = a.team_id
            join teams t on t.id = a.team_id
           where a.profile_id = (select id from me) and b.profile_id = p.profile_id
             and a.status = 'active' and b.status = 'active'
           order by t.sort_order limit 1) as via_team
    from people p join profiles pr on pr.id = p.profile_id
   where private.can_group_add(p.profile_id)
   order by pr.full_name;
$function$;
revoke all on function public.group_candidates() from public, anon;
grant execute on function public.group_candidates() to authenticated;

-- ── rename: a plain column update, owner-only ─────────────────────────────
grant update (title) on public.conversations to authenticated;
drop policy if exists "group rename" on public.conversations;
create policy "group rename" on public.conversations
  for update using (kind = 'group' and private.is_group_owner(id))
  with check (kind = 'group');

-- ── policies that must learn about groups ─────────────────────────────────
drop policy if exists "conversation read" on public.conversations;
create policy "conversation read" on public.conversations
  for select using (private.in_conversation(id) or private.admin_may_review(id));

drop policy if exists "conversation delete" on public.conversations;
create policy "conversation delete" on public.conversations
  for delete using (
    case
      when private.conversation_reported(id) then private.admin_may_review(id)
      else (private.in_conversation(id) and (kind = 'dm' or private.is_group_owner(id)))
           or private.admin_may_review(id)
    end
  );

-- ── provenance: a group message needs membership, not can_dm ──────────────
-- Full replacement of private.set_message_provenance; only the conversation
-- branch changed (the kind fork). Everything else verbatim from
-- db/migrations/20260823_squad_chat_phase3.sql.
create or replace function private.set_message_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
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
    -- The conversation decides everything else. For a DM the pair rule is
    -- re-checked on EVERY message; for a group, membership is the whole rule
    -- (24 Aug ruling).
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
    new.mentions := '{}';
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

  select m.role, m.title into new.author_role, new.author_title
    from memberships m
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null)
   order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                        when 'medic' then 3 else 9 end,
            m.team_id nulls last
   limit 1;

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
         select profile_id from private.staff_audience(new.team_id) where new.channel = 'staff');
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$;

-- ── push: a group message reaches every other member ──────────────────────
-- Full replacement; only the DM arm changed (kind guard + group arm).
create or replace function public.message_push_subscriptions(_message uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $function$
  with asked as (select * from messages where id = _message),
  staff_post as (
    select a.* from asked a
     where a.parent_id is null and a.channel = 'squad'
       and ((a.team_id is not null and a.author_role in ('admin','coach','manager','medic'))
            or (a.team_id is null and a.author_role = 'admin'))
  ),
  people as (
    select aud.profile_id, 'squad_chat'::text as category
      from staff_post a
      cross join lateral private.notice_audience(a.club_id, a.team_id) as aud(profile_id)
    union
    select m, 'squad_chat' from asked a, unnest(a.mentions) as m
    union
    select s.profile_id, 'squad_chat'
      from asked a cross join lateral private.staff_audience(a.team_id) s
     where a.channel = 'staff' and a.parent_id is null
    union
    -- a DM reaches the other side
    select case when c.profile_a = a.author_id then c.profile_b else c.profile_a end, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
     where a.channel = 'dm' and c.kind = 'dm'
    union
    -- a group message reaches every other member
    select gm.profile_id, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
      join conversation_members gm on gm.conversation_id = c.id
     where a.channel = 'dm' and c.kind = 'group'
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join asked a
   where p.profile_id <> a.author_id
     and a.deleted_at is null
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = p.profile_id and o.category = p.category);
$function$;
revoke all on function public.message_push_subscriptions(uuid) from public, anon, authenticated;

-- ── my_conversations stays a DM inbox ─────────────────────────────────────
-- Verbatim from db/migrations/20260823_squad_chat_phase3.sql plus an explicit
-- kind filter; a group row (null profile_a/b) would drop out of the joins
-- anyway — explicit beats accidental. welfare_overview below is copied from
-- db/migrations/20260823_adult_dms_private.sql (NOT phase 3 — that version
-- pre-dates the reviewable filter and would regress the 23 Aug ruling) with
-- the kind filter and a groups arm.
create or replace function public.my_conversations()
returns table (conversation_id uuid, other_id uuid, other_name text, other_role text,
               last_at timestamptz, last_body text, last_author_id uuid, unread boolean)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id)
  select c.id,
         case when c.profile_a = me.id then c.profile_b else c.profile_a end as other_id,
         pr.full_name,
         (select m.role from memberships m
           where m.profile_id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
             and m.status = 'active'
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end limit 1),
         c.last_at,
         lm.body, lm.author_id,
         (lm.id is not null and lm.author_id <> me.id
          and not exists (select 1 from message_reads r where r.message_id = lm.id and r.profile_id = me.id))
    from me
    cross join conversations c
    join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
    left join lateral (select id, body, author_id from messages x
                        where x.conversation_id = c.id order by x.created_at desc limit 1) lm on true
   where me.id in (c.profile_a, c.profile_b)
     and c.kind = 'dm'
   order by c.last_at desc;
$function$;
revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

create or replace function public.welfare_overview()
returns table (kind text, id uuid, label text, detail text, members bigint, last_at timestamptz, open_reports bigint)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  ok as (select private.is_admin(club.id) as yes from club)
  select rows.kind, rows.id, rows.label, rows.detail, rows.members, rows.last_at, rows.open_reports from (
    -- squad channels
    select 'squad'::text as kind, t.id as id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           (select count(*) from private.notice_audience(t.club_id, t.id)) as members,
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'squad') as last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'squad' and r.resolved_at is null) as open_reports
      from teams t, club where t.club_id = club.id
    union all
    -- staff channels
    select 'staff', t.id, t.name, 'Staff',
           (select count(*) from private.staff_audience(t.id)),
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'staff'),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'staff' and r.resolved_at is null)
      from teams t, club where t.club_id = club.id
    union all
    -- the club channel
    select 'club', club.id, 'Whole club', 'Club-wide · admins post',
           (select count(distinct profile_id) from memberships m where m.club_id = club.id and m.status = 'active'),
           (select max(created_at) from messages x where x.club_id = club.id and x.channel = 'squad' and x.team_id is null),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and r.resolved_at is null)
      from club
    union all
    -- direct messages — the ADULT-DMS shape (23 Aug): reviewable ones only.
    select 'dm', c.id, pa.full_name || ' · ' || pb.full_name,
           case when private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
                then 'Direct message · involves a minor' else 'Direct message · reported' end,
           2::bigint, c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
      join profiles pa on pa.id = c.profile_a
      join profiles pb on pb.id = c.profile_b
     where c.club_id = club.id
       and c.kind = 'dm'
       and private.conversation_reviewable(c.id)
    union all
    -- groups: listed only when reviewable, which for a group means a minor
    -- AND a report (24 Aug ruling 3)
    select 'group', c.id, c.title, 'Group · reported, involves a minor',
           (select count(*) from conversation_members gm where gm.conversation_id = c.id),
           c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
     where c.club_id = club.id
       and c.kind = 'group'
       and private.conversation_reviewable(c.id)
  ) rows, ok
  where ok.yes
  order by last_at desc nulls last;
$function$;
revoke all on function public.welfare_overview() from public, anon;
grant execute on function public.welfare_overview() to authenticated;

-- ── my_chats grows a groups arm ───────────────────────────────────────────
-- Verbatim from db/migrations/20260824_chat_list.sql with two changes: the
-- DM arm is filtered to kind='dm', and the groups arm is new.
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
       and c.kind = 'dm'
       -- cleared, and nothing since: not listed (WhatsApp's "delete chat")
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
    union all
    -- groups I am in
    select 'group', null, c.id, c.title,
           (select count(*) from conversation_members gm where gm.conversation_id = c.id)::text || ' people',
           c.last_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null
               and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join conversation_members my on my.conversation_id = c.id and my.profile_id = me.id
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where c.kind = 'group'
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

commit;
