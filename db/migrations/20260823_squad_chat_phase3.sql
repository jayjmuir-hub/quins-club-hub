-- Squad chat, phase 3 — the staff channel, direct messages, reports, and the
-- welfare view. claude/plans/2026-08-23-squad-chat.md. Builds on phases 1–2.
--
-- WHAT THIS ADDS
--   channel = 'staff'        a second stream per squad, coach/manager/medic only
--   channel = 'dm'           one-to-one, in public.conversations
--   private.can_dm(other)    THE rule for who may message whom (below)
--   player_private.staff_dm_opt_in   a guardian's consent for a U16+ player
--   public.dm_blocks         "don't message me" — own rows, never shown
--   public.message_reports   "report this message" — anyone who can see it
--   public.welfare_access_log  every admin open of a DM, readable by admins
--   public.dm_candidates()   who I may start a DM with (the picker)
--   public.open_conversation(other)  find-or-create, both directions
--   public.welfare_overview()        channels + DMs + reports, for the dashboard
--
-- ⚠️ THE RULING THAT SHAPED THIS (Jay, 23 Aug 2026): ANY CLUB ADMIN CAN READ A
-- DM. The plan's first draft reserved that for a `welfare` right and said
-- "not admins". The existing admin rights gate SCREENS, not data
-- (claude/decisions/2026-08-10-role-dashboards.md), and making `welfare` the
-- first right enforced by RLS is a different decision. Jay chose consistency:
-- admins read, `welfare` decides who sees the Welfare dashboard, and the
-- permanent notice in every DM says "club admins can review". Every open is
-- logged and the log is readable by admins — the reviewer is reviewed.
--
-- ⚠️ WHO MAY DM WHOM — private.can_dm(_other), SECURITY DEFINER, the only
-- place the rule lives:
--   1. both hold an active membership in the club
--   2. they share an audience: the same squad (as parent, player or staff),
--      or one is staff of a squad the other is in, or one is an admin
--   3. a MINOR is reachable only by their own guardian, or — when the squad
--      is U16 or above AND a guardian has opted in — by that squad's coach
--      or manager. Minor ↔ minor never. A minor is a profile holding a
--      `player` membership whose player's date of birth makes them under 18
--      today, OR WHOSE DATE OF BIRTH IS UNKNOWN. Unknown is a minor.
--   4. neither has blocked the other
--
-- ⚠️ U16 IS THE SQUAD'S AGE BAND, NOT BIRTHDAY ARITHMETIC. `U16B` → 16; a
-- senior squad (is_senior) is adult. A playing-up U15 in the U16s is still a
-- minor but is on a U16 squad, so the opt-in applies — the guardian decides.
--
-- ⚠️ THE OPT-IN IS SET BY A GUARDIAN OR AN ADMIN, NEVER THE PLAYER. It records
-- who and when. `player private edit own` already lets a guardian write
-- player_private; a self-registered player also matches is_own_player, so the
-- trigger below refuses the write when the caller IS the player.
--
-- Harness: db/tests/squad-chat-phase3.sql.

begin;

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  -- ⚠️ ORDERED PAIR, smaller uuid first, so one row serves both directions.
  profile_a   uuid not null references public.profiles(id) on delete cascade,
  profile_b   uuid not null references public.profiles(id) on delete cascade,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  check (profile_a < profile_b),
  unique (profile_a, profile_b)
);
create index conversations_a_idx on public.conversations (profile_a, last_at desc);
create index conversations_b_idx on public.conversations (profile_b, last_at desc);

alter table public.messages
  add column conversation_id uuid references public.conversations(id) on delete cascade;
create index messages_conversation_idx on public.messages (conversation_id, created_at) where conversation_id is not null;
alter table public.messages
  add constraint messages_dm_shape check ((channel = 'dm') = (conversation_id is not null));

create table public.dm_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table public.message_reports (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  message_id   uuid not null references public.messages(id) on delete cascade,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  reason       text not null check (length(btrim(reason)) between 1 and 500),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null,
  unique (message_id, reporter_id)
);
create index message_reports_open_idx on public.message_reports (club_id, created_at desc) where resolved_at is null;

create table public.welfare_access_log (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  admin_id         uuid not null references public.profiles(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  opened_at        timestamptz not null default now()
);
create index welfare_access_log_idx on public.welfare_access_log (club_id, opened_at desc);

alter table public.player_private
  add column staff_dm_opt_in    boolean not null default false,
  add column staff_dm_opt_in_by uuid references public.profiles(id) on delete set null,
  add column staff_dm_opt_in_at timestamptz;

alter table public.conversations     enable row level security;
alter table public.dm_blocks         enable row level security;
alter table public.message_reports   enable row level security;
alter table public.welfare_access_log enable row level security;

-- New push category.
alter table public.notification_opt_outs drop constraint notification_opt_outs_category_check;
alter table public.notification_opt_outs add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply', 'notice', 'fixture', 'approval', 'availability', 'squad_chat', 'direct_messages'));

-- ── Helpers ───────────────────────────────────────────────────────────────

-- The squad's age band: U16B -> 16, senior -> 99, anything unparseable -> 0
-- (treated as YOUNGER than 16 — the safe direction).
create or replace function private.team_age_band(_team uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $function$
  select case
    when t.is_senior then 99
    else coalesce((regexp_match(t.name, '^U(\d{1,2})'))[1]::int, 0)
  end
  from teams t where t.id = _team;
$function$;

-- Is this profile a minor? A `player` membership whose player is under 18
-- today, or whose date of birth is unknown. A profile with no player row of
-- its own (a parent, a coach) is an adult.
create or replace function private.is_minor_profile(_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
      from memberships m
      left join player_private pp on pp.player_id = m.player_id
     where m.profile_id = _profile
       and m.role = 'player'
       and m.status = 'active'
       and (pp.date_of_birth is null
            or pp.date_of_birth > (current_date - interval '18 years')));
$function$;

-- Is `_guardian` a linked parent of the player that `_minor` signs in as?
create or replace function private.is_guardian_of(_guardian uuid, _minor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
      from memberships mp
      join memberships mg on mg.player_id = mp.player_id
     where mp.profile_id = _minor and mp.role = 'player' and mp.status = 'active'
       and mg.profile_id = _guardian and mg.role = 'parent' and mg.status = 'active');
$function$;

-- May the CALLER open or continue a DM with `_other`? The whole rule.
create or replace function private.can_dm(_other uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  club uuid;
  me_minor boolean;
  other_minor boolean;
begin
  if me is null or _other is null or me = _other then return false; end if;

  -- 1. both active in the same club
  select m.club_id into club from memberships m
   where m.profile_id = me and m.status = 'active' order by m.created_at limit 1;
  if club is null then return false; end if;
  if not exists (select 1 from memberships m where m.profile_id = _other and m.club_id = club and m.status = 'active') then
    return false;
  end if;

  -- 4. blocks (checked early: a block beats every other arm)
  if exists (select 1 from dm_blocks b where (b.blocker_id = me and b.blocked_id = _other)
                                          or (b.blocker_id = _other and b.blocked_id = me)) then
    return false;
  end if;

  me_minor := private.is_minor_profile(me);
  other_minor := private.is_minor_profile(_other);

  -- 3. minors
  if me_minor and other_minor then return false; end if;
  if me_minor or other_minor then
    declare
      minor uuid := case when me_minor then me else _other end;
      adult uuid := case when me_minor then _other else me end;
    begin
      if private.is_guardian_of(adult, minor) then return true; end if;
      -- coach or manager of a U16+ squad the minor plays in, with a guardian's opt-in
      return exists (
        select 1
          from memberships pm                       -- the minor's player row
          join players p on p.id = pm.player_id
          join player_private pp on pp.player_id = p.id
          join memberships sm on sm.team_id = p.team_id and sm.profile_id = adult
                              and sm.role in ('coach','manager') and sm.status = 'active'
         where pm.profile_id = minor and pm.role = 'player' and pm.status = 'active'
           and pp.staff_dm_opt_in
           and private.team_age_band(p.team_id) >= 16);
    end;
  end if;

  -- 2. adults: a shared audience
  if private.is_admin(club) then return true; end if;
  if exists (select 1 from memberships m where m.profile_id = _other and m.club_id = club
              and m.status = 'active' and m.role = 'admin') then return true; end if;
  return exists (
    select 1
      from memberships a
      join memberships b on b.team_id = a.team_id
     where a.profile_id = me and a.status = 'active' and a.team_id is not null
       and b.profile_id = _other and b.status = 'active');
end;
$function$;

revoke all on function private.can_dm(uuid) from public, anon;
grant execute on function private.can_dm(uuid) to authenticated;
revoke all on function private.team_age_band(uuid), private.is_minor_profile(uuid), private.is_guardian_of(uuid, uuid) from public, anon;
grant execute on function private.team_age_band(uuid), private.is_minor_profile(uuid), private.is_guardian_of(uuid, uuid) to authenticated;

-- Am I a participant of this conversation?
create or replace function private.in_conversation(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (select 1 from conversations c
                  where c.id = _conversation and (select auth.uid()) in (c.profile_a, c.profile_b));
$function$;
revoke all on function private.in_conversation(uuid) from public, anon;
grant execute on function private.in_conversation(uuid) to authenticated;

-- The other side of a conversation, for the caller.
create or replace function private.conversation_other(_conversation uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select case when c.profile_a = (select auth.uid()) then c.profile_b else c.profile_a end
    from conversations c where c.id = _conversation;
$function$;
revoke all on function private.conversation_other(uuid) from public, anon;
grant execute on function private.conversation_other(uuid) to authenticated;

-- Squad staff with a device: the audience for a staff-channel post.
create or replace function private.staff_audience(_team uuid)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = public
as $function$
  select distinct m.profile_id from memberships m
   where m.team_id = _team and m.status = 'active' and m.role in ('coach','manager','medic');
$function$;
revoke all on function private.staff_audience(uuid) from public, anon;

-- A report carries the message's club, stamped — never sent.
create or replace function private.set_report_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  new.reporter_id := auth.uid();
  select club_id into new.club_id from messages where id = new.message_id;
  if new.club_id is null then
    raise exception 'no such message' using errcode = 'P0002';
  end if;
  new.resolved_at := null;
  new.resolved_by := null;
  return new;
end;
$function$;

create trigger message_reports_provenance
  before insert on public.message_reports
  for each row execute function private.set_report_provenance();

-- Resolving stamps the resolver.
create or replace function private.touch_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  new.club_id := old.club_id; new.message_id := old.message_id;
  new.reporter_id := old.reporter_id; new.reason := old.reason; new.created_at := old.created_at;
  if new.resolved_at is not null and old.resolved_at is null then
    new.resolved_by := auth.uid();
  end if;
  return new;
end;
$function$;

create trigger message_reports_touch
  before update on public.message_reports
  for each row execute function private.touch_report();

-- ── The opt-in: guardian or admin, never the player ───────────────────────

create or replace function private.guard_staff_dm_opt_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  club uuid;
begin
  if new.staff_dm_opt_in is distinct from old.staff_dm_opt_in then
    select p.club_id into club from players p where p.id = new.player_id;
    if private.is_admin(club)
       or exists (select 1 from memberships m where m.profile_id = me and m.player_id = new.player_id
                   and m.role = 'parent' and m.status = 'active') then
      new.staff_dm_opt_in_by := me;
      new.staff_dm_opt_in_at := now();
    else
      raise exception 'only a guardian or an admin can change this' using errcode = '42501';
    end if;
  else
    new.staff_dm_opt_in_by := old.staff_dm_opt_in_by;
    new.staff_dm_opt_in_at := old.staff_dm_opt_in_at;
  end if;
  return new;
end;
$function$;

create trigger player_private_staff_dm_opt_in
  before update on public.player_private
  for each row execute function private.guard_staff_dm_opt_in();

-- ── Provenance: staff channel and DMs ─────────────────────────────────────

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
    -- A direct message. The conversation decides everything else, and the
    -- rule is re-checked on EVERY message — a DM that was allowed stops
    -- accepting messages the day it is not.
    select * into conv from conversations where id = new.conversation_id;
    if conv.id is null then
      raise exception 'no such conversation' using errcode = 'P0002';
    end if;
    if new.author_id not in (conv.profile_a, conv.profile_b) then
      raise exception 'not your conversation' using errcode = '42501';
    end if;
    if not private.can_dm(case when conv.profile_a = new.author_id then conv.profile_b else conv.profile_a end) then
      raise exception 'you cannot message this person' using errcode = '42501';
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
    -- Only the author edits words. An admin reviewing a DM may remove a
    -- message (above); rewriting somebody's words is not a review.
    if auth.uid() <> old.author_id then
      raise exception 'only the author can edit a message' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$function$;

-- ── Policies ──────────────────────────────────────────────────────────────

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
      when 'dm' then private.in_conversation(conversation_id) or private.is_admin(club_id)
      else false
    end
  );

drop policy "message create" on public.messages;
create policy "message create" on public.messages
  for insert with check (
    case channel
      when 'squad' then
        (parent_id is not null and private.can_reply_to(parent_id))
        or (parent_id is null and case
              when team_id is null then private.is_admin(
                (select m.club_id from memberships m
                  where m.profile_id = (select auth.uid()) and m.status = 'active'
                  order by m.created_at limit 1))
              else private.can_edit_team(team_id)
                or (not private.channel_announce_only(team_id) and private.can_see_team(team_id))
                or (event_id is not null and private.can_see_team(team_id))
            end)
      when 'staff' then private.can_edit_team(team_id)
      -- dm: the trigger has already refused a non-participant and a pair
      -- can_dm forbids; this arm only has to agree.
      when 'dm' then private.in_conversation(conversation_id)
      else false
    end
  );

drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (
    (author_id = (select auth.uid()) and created_at > now() - interval '15 minutes')
    or (channel in ('squad','staff') and team_id is not null and private.can_edit_team(team_id))
    or (channel = 'squad' and team_id is null and private.is_admin(club_id))
    -- an admin may REMOVE a DM message (the welfare case); the trigger
    -- blanks it. They cannot edit its words — body is frozen once deleted.
    or (channel = 'dm' and private.is_admin(club_id))
  ) with check (channel in ('squad','staff','dm'));

-- can_reply_to: staff-channel replies too.
create or replace function private.can_reply_to(_parent uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from messages p
     where p.id = _parent
       and p.parent_id is null
       and p.deleted_at is null
       and case p.channel
         when 'squad' then
           case when p.team_id is null then exists (
                  select 1 from memberships m
                   where m.profile_id = (select auth.uid())
                     and m.club_id = p.club_id and m.status = 'active')
                else private.can_see_team(p.team_id) end
         when 'staff' then private.can_edit_team(p.team_id)
         else false
       end);
$function$;

-- conversations
create policy "conversation read" on public.conversations
  for select using ((select auth.uid()) in (profile_a, profile_b) or private.is_admin(club_id));
-- insert only through open_conversation() below — no direct policy.

-- dm_blocks: own rows, invisible to the blocked party
create policy "dm block own" on public.dm_blocks
  for all using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

-- reports: anyone who can see the message may report it; admins read
create policy "report create" on public.message_reports
  for insert with check (exists (select 1 from messages m where m.id = message_id));
create policy "report read" on public.message_reports
  for select using (reporter_id = (select auth.uid()) or private.is_admin(club_id));
create policy "report resolve" on public.message_reports
  for update using (private.is_admin(club_id)) with check (private.is_admin(club_id));

-- access log: admins read; writes only through log_welfare_access()
create policy "welfare log read" on public.welfare_access_log
  for select using (private.is_admin(club_id));

-- ── Grants ────────────────────────────────────────────────────────────────

revoke all on public.conversations, public.dm_blocks, public.message_reports, public.welfare_access_log
  from public, anon, authenticated;
grant select on public.conversations to authenticated;
grant select, insert, delete on public.dm_blocks to authenticated;
grant select, insert on public.message_reports to authenticated;
grant update (resolved_at, resolved_by) on public.message_reports to authenticated;
grant select on public.welfare_access_log to authenticated;
grant update (staff_dm_opt_in) on public.player_private to authenticated;

-- ── RPCs ──────────────────────────────────────────────────────────────────

-- Who may I start a DM with? The people can_dm allows, with the best role
-- they hold and which squad connects us. No search across the club.
create or replace function public.dm_candidates()
returns table (profile_id uuid, full_name text, role text, via_team text)
language sql
stable
security definer
set search_path = public
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
   where private.can_dm(p.profile_id)
   order by pr.full_name;
$function$;
revoke all on function public.dm_candidates() from public, anon;
grant execute on function public.dm_candidates() to authenticated;

-- Find or create the conversation with `_other`. Refuses if can_dm says no.
create or replace function public.open_conversation(_other uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  a uuid; b uuid; conv uuid; club uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not private.can_dm(_other) then
    raise exception 'you cannot message this person' using errcode = '42501';
  end if;
  a := least(me, _other); b := greatest(me, _other);
  select id into conv from conversations where profile_a = a and profile_b = b;
  if conv is not null then return conv; end if;
  select m.club_id into club from memberships m where m.profile_id = me and m.status = 'active' order by m.created_at limit 1;
  insert into conversations (club_id, profile_a, profile_b, created_by) values (club, a, b, me) returning id into conv;
  return conv;
end;
$function$;
revoke all on function public.open_conversation(uuid) from public, anon;
grant execute on function public.open_conversation(uuid) to authenticated;

-- An admin opening a DM records it. Returns nothing. Refuses a non-admin
-- and a participant (opening your own conversation is not a review).
create or replace function public.log_welfare_access(_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  conv public.conversations;
begin
  select * into conv from conversations where id = _conversation;
  if conv.id is null then raise exception 'no such conversation' using errcode = 'P0002'; end if;
  if me in (conv.profile_a, conv.profile_b) then return; end if;
  if not private.is_admin(conv.club_id) then raise exception 'not an admin' using errcode = '42501'; end if;
  insert into welfare_access_log (club_id, admin_id, conversation_id) values (conv.club_id, me, _conversation);
end;
$function$;
revoke all on function public.log_welfare_access(uuid) from public, anon;
grant execute on function public.log_welfare_access(uuid) to authenticated;

-- My DM inbox: conversations with the other person's name, role, the last
-- line, and whether the last message is unread by me.
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
   order by c.last_at desc;
$function$;
revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

-- The Welfare dashboard: every channel and every DM, newest activity first,
-- plus open reports. Admins only (the SCREEN is gated on the `welfare`
-- right; the DATA is admin-readable — the 23 Aug ruling).
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
    -- direct messages
    select 'dm', c.id, pa.full_name || ' · ' || pb.full_name,
           case when private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
                then 'Direct message · involves a minor' else 'Direct message' end,
           2::bigint, c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
      join profiles pa on pa.id = c.profile_a
      join profiles pb on pb.id = c.profile_b
     where c.club_id = club.id
  ) rows, ok
  where ok.yes
  order by last_at desc nulls last;
$function$;
revoke all on function public.welfare_overview() from public, anon;
grant execute on function public.welfare_overview() to authenticated;

-- ── Push ──────────────────────────────────────────────────────────────────

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
    -- a staff-channel top-level post reaches the squad's staff
    select s.profile_id, 'squad_chat'
      from asked a cross join lateral private.staff_audience(a.team_id) s
     where a.channel = 'staff' and a.parent_id is null
    union
    -- a DM reaches the other side
    select case when c.profile_a = a.author_id then c.profile_b else c.profile_a end, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
     where a.channel = 'dm'
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

create or replace function private.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  endpoint text;
  secret   text;
  fires boolean;
begin
  fires := new.channel = 'dm'
    or (new.channel = 'staff' and new.parent_id is null)
    or (new.channel = 'squad' and new.parent_id is null
        and ((new.team_id is not null and new.author_role in ('admin','coach','manager','medic'))
             or (new.team_id is null and new.author_role = 'admin')))
    or coalesce(array_length(new.mentions, 1), 0) > 0;
  if not fires then return null; end if;

  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'notify_message_push: vault secrets missing, no push sent';
    return null;
  end if;

  begin
    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
      body    := jsonb_build_object('message_id', new.id));
  exception when others then
    raise warning 'notify_message_push: % (message %)', sqlerrm, new.id;
  end;
  return null;
end;
$function$;

-- chat_mentionables: a channel argument, so the staff channel offers staff.
drop function public.chat_mentionables(uuid);
create or replace function public.chat_mentionables(_team uuid, _channel text default 'squad')
returns table (profile_id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (
    select coalesce((select t.club_id from teams t where t.id = _team),
                    (select m.club_id from memberships m, me
                      where m.profile_id = me.id and m.status = 'active'
                      order by m.created_at limit 1)) as id
  ),
  allowed as (
    select case
      when _channel = 'staff' then _team is not null and private.can_edit_team(_team)
      when _team is null then exists (select 1 from memberships m, me, club
                    where m.profile_id = me.id and m.club_id = club.id and m.status = 'active')
      else private.can_see_team(_team) end as ok
  ),
  aud as (
    select profile_id from private.notice_audience((select id from club), _team) as a(profile_id) where _channel = 'squad'
    union
    select profile_id from private.staff_audience(_team) where _channel = 'staff'
  )
  select aud.profile_id, p.full_name,
         (select m.role from memberships m
           where m.profile_id = aud.profile_id and m.status = 'active'
             and (m.team_id = _team or m.team_id is null)
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end
           limit 1) as role
    from allowed
    cross join aud
    join profiles p on p.id = aud.profile_id
   where allowed.ok
     and aud.profile_id <> (select id from me)
   order by p.full_name;
$function$;
revoke all on function public.chat_mentionables(uuid, text) from public, anon;
grant execute on function public.chat_mentionables(uuid, text) to authenticated;

-- Realtime for the new tables the client watches.
alter publication supabase_realtime add table public.conversations;

commit;
