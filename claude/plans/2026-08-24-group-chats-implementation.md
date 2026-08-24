# Group Chats Implementation Plan

**Status: EXECUTED 24 Aug 2026 (all seven tasks), NOT MERGED — awaiting Jay's
push/merge decision and post-deploy live verification.** Two deliberate
deviations from the written plan, both recorded in commits: the pencil keeps
its one-tap DM flow (the "New group" entry is a row inside the DM picker, not
a two-item pencil menu), and `leave_group` never auto-deletes a REPORTED
group — evidence outlives the floor.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Member-created group chats with custom names, per `claude/plans/2026-08-24-group-chats.md`.

**Architecture:** Extend `public.conversations` with `kind`/`title` and a `conversation_members` table; groups reuse `channel = 'dm'` messages keyed by `conversation_id`, so send/read/delete/clear/push plumbing carries over. All rules live in the database (RPCs + policies), proven by a rolled-back harness BEFORE the migration is applied to production.

**Tech Stack:** Postgres 17 (Supabase, RLS), Vite + React, vitest.

## Global Constraints

- The rulings: groups are open (no minor gates, NO safeguarding copy anywhere in group UI), ≥3 people, welfare/admin review of a group only when it involves a minor AND a message was reported. `claude/decisions/2026-08-24-groups-open-no-warnings.md`.
- DM rules are UNCHANGED. Any diff that alters DM behaviour is a bug.
- Never `git add -A`; stage explicit paths. Never `[skip ci]`. Work stays on branch `claude/chat-feature-ee511a`; pushing/merging is Jay's call at the end.
- Invented names only, everywhere including SQL comments (CLAUDE.md rule 9). Harness names follow the `Zz Probe …` / `zz-…@example.invalid` house pattern.
- `npm run test:watch` while editing; full `npm test` only before commit. `npm run docs:check` after any `claude/` edit AND after each commit.
- The spec says "the `welfare` right" loosely; the LIVE mechanism for DM review is `private.admin_may_review` (`is_admin` + reviewable). Groups reuse it — code wins over the spec's shorthand.
- Migration must be IDEMPOTENT (`if not exists` / `drop … if exists` / `create or replace`) because the harness inlines it verbatim and re-runs against a database where it is already applied.

---

### Task 1: The migration

**Files:**
- Create: `db/migrations/20260824_group_chats.sql`

**Interfaces:**
- Produces (used by Tasks 2, 4): RPCs `public.create_group(_title text, _members uuid[]) returns uuid`, `public.add_group_members(_conversation uuid, _members uuid[])`, `public.leave_group(_conversation uuid)`, `public.remove_group_member(_conversation uuid, _member uuid)`, `public.group_candidates() returns table (profile_id uuid, full_name text, role text, via_team text)`; table `public.conversation_members (conversation_id, profile_id, is_owner, joined_at)`; `conversations.kind`, `conversations.title`; rename = plain `update conversations set title` (owner-only policy).

- [ ] **Step 1: Write the migration file.** Complete content:

```sql
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
-- longest-standing member.
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
  if remaining < 3 then
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
-- Full replacement of private.set_message_provenance; only the
-- conversation branch changed (the kind fork). Everything else verbatim
-- from db/migrations/20260823_squad_chat_phase3.sql.
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

commit;
```

- [ ] **Step 2: Two surgical edits to DM-only RPCs, appended to the SAME migration file before `commit;`.** In `public.my_conversations()` and `public.welfare_overview()` (bodies in `db/migrations/20260823_squad_chat_phase3.sql`), copy each function verbatim into the migration as a `create or replace`, adding `and c.kind = 'dm'` to the `where` clause that selects from `conversations c`. They are DM inboxes; a group row with null `profile_a` would otherwise join to nothing and silently vanish — make it explicit instead of accidental.

- [ ] **Step 3: Replace `public.my_chats()`** — append to the same migration a `create or replace` copied verbatim from `db/migrations/20260824_chat_list.sql:150-236` with TWO changes: (a) the DM arm's final `where` gains `and c.kind = 'dm'`; (b) a new arm between the DM arm and the closing `)`:

```sql
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
```

- [ ] **Step 4: Commit** (the file only; nothing runs yet — Task 2 is its test):

```bash
git add db/migrations/20260824_group_chats.sql
git commit -m "feat(chat): group-chats migration — kind/title, members, RPCs, policies"
```

---

### Task 2: The harness — run BEFORE anything is applied

**Files:**
- Create: `db/tests/group-chats.sql`

**Interfaces:**
- Consumes: the migration file from Task 1, inlined verbatim.

- [ ] **Step 1: Write the harness.** Copy the exact scaffolding pattern of `db/tests/adult-dms-private.sql`: header comment, `begin;`, temp `_log` table, synthetic club `'ZZ Groupchat Probe Club'` with uuids in a fresh `f0000000-0000-4000-8000-00000000006x` range, `zz-groupchat-…@example.invalid` users, invented player names, an `impersonate(_id uuid)` helper using `set_config('request.jwt.claims', …, true)` + `set local role authenticated`, then THE MIGRATION INLINED VERBATIM (copy `db/migrations/20260824_group_chats.sql` between `-- ── migration under test` markers, minus its own `begin;`/`commit;`), then a `pg_temp.assert_groupchats()` function raising `ASSERT n FAILED: …` per check, `select pg_temp.assert_groupchats();`, and `rollback;` as the last line. Cast: OWNER (parent, U10), MEMB2 (parent, U10), MEMB3 (parent, U10), COACH (coach, U16 squad), MINOR (player profile linked to a U16 player row with `date_of_birth = current_date - interval '15 years'`, member of the U16 squad which COACH also coaches and OWNER also parents a player in), OUTSIDER (parent in a squad shared with nobody above), ADMIN (club admin). The asserts, in order — each one names the rule it discriminates:

1. OWNER `create_group('Zz Probe Carpool', [MEMB2, MEMB3])` succeeds; `conversation_members` has 3 rows; OWNER `is_owner`.
2. `create_group` with one other → raises `a group is three people or more` (floor at birth).
3. OUTSIDER (no shared squad with OWNER) in the members array → raises; and `group_candidates()` as OWNER does NOT list OUTSIDER but DOES list MINOR (control pair — the search can find something known-present).
4. **The ruling's discriminating test:** OWNER `add_group_members(conv, [MINOR])` SUCCEEDS with `staff_dm_opt_in` unset — the same MINOR that `dm_candidates()` (as COACH) does NOT offer. Both measured in one assert.
5. OUTSIDER impersonated: sees no conversation row, no member rows, no messages; `conversation_involves_minor` returns null. MEMB2 (control) sees all of it.
6. MEMB2 posts a message (insert into `messages (conversation_id, body)`) — succeeds; OUTSIDER's identical insert raises `not your conversation`.
7. ADMIN impersonated: with MINOR in the group and NO report, conversation and messages invisible, `admin_may_review` false (a DM with a minor would already be reviewable — this is the group fork). MEMB3 reports MEMB2's message via `insert into message_reports`; NOW admin reads both. Then re-run the same check on a second, adults-only group with a reported message: still NOT reviewable (minor AND report, not OR).
8. Rename: MEMB2's `update conversations set title` touches 0 rows; OWNER's touches 1.
9. `leave_group`: MEMB3 leaves the 4-person group (post-MINOR count 4) → 3 remain, group survives; MEMB2 leaves → below 3, conversation row GONE (delete cascades members and messages).
10. `my_chats()` as OWNER (on a fresh 3-person group) lists kind `group`, label `Zz Probe Carpool 2`, detail `3 people`; as OUTSIDER, no group rows.
11. Push: insert `push_subscriptions` for all members; `message_push_subscriptions(<group message id>)` run as superuser returns the OTHER members' endpoints and not the author's.
12. Clear-for-me: MEMB2 runs `select clear_conversation(conv)`; MEMB2's `my_chats()` no longer lists the group and MEMB2 sees 0 of its messages, while OWNER (control) still sees both; OWNER posts a new message and the group reappears for MEMB2 with only the new message — the spec's "conversation_clears works unchanged", measured.

- [ ] **Step 2: Run it and make it fail first.** Before writing the final asserts, put in one deliberately wrong assert (expect OUTSIDER to see the group) and run:

```bash
npm run db:check -- group-chats
```

Expected: `ASSERT 5 FAILED` — proves the harness discriminates. Then fix the assert to the true expectation.

- [ ] **Step 3: Run to green.**

```bash
npm run db:check -- group-chats
```

Expected: pass, and the trailing `rollback;` means production is untouched. If `SUPABASE_DB_URL` is missing, stop and ask Jay per `claude/runbooks/db-harnesses.md` — never paste the string anywhere.

- [ ] **Step 4: Confirm the rollback protects DM behaviour too** — run the neighbours, which exercise DMs against the same inlined `create or replace` functions this migration changes:

```bash
npm run db:check -- adult-dms
npm run db:check -- chat-list
npm run db:check -- delete-for-good
```

Expected: all pass. ⚠️ These inline THEIR OWN migrations, so they prove the live DB, not this branch's changes — the DM regression proof against the new code is harness asserts 5–7's control halves. If any fails here, the live DB drifted: stop and tell Jay.

- [ ] **Step 5: Commit**

```bash
git add db/tests/group-chats.sql
git commit -m "test(db): group-chats harness — floor, openness, review fork, my_chats"
```

---

### Task 3: Apply to production, then re-prove

**⚠️ CHECKPOINT: applying a migration changes the live database. Tell Jay the harness is green and get his explicit yes before this task.**

**Files:**
- Modify: `db/schema/grants.sql` (capture), `db/schema/tables.sql` and `db/schema/functions.sql` or equivalent — match however the last capture was done; see the capture note in `claude/runbooks/db-harnesses.md` and copy the house pattern.

- [ ] **Step 1: Apply** `db/migrations/20260824_group_chats.sql` via the Supabase MCP `apply_migration` (name `group_chats`), content identical to the file.
- [ ] **Step 2: Re-run the harness against the now-migrated database:** `npm run db:check -- group-chats` — green proves the file is idempotent AND the applied state matches the tested state. Also re-run the three neighbour harnesses from Task 2 Step 4 — they now prove the LIVE changed functions keep DM behaviour.
- [ ] **Step 3: Capture grants.** Add to `db/schema/grants.sql`: `grant select on public.conversation_members to authenticated` and `grant update (title) on public.conversations to authenticated` in the file's existing format (docs:check rule 7 fails the build otherwise). Re-capture any other `db/schema/` file the house pattern refreshes after a migration.
- [ ] **Step 4: Run** `npm run docs:check` — expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add db/schema/grants.sql
git commit -m "chore(db): capture group-chat grants after applying 20260824_group_chats"
```

(Stage any other re-captured `db/schema/` files explicitly by name.)

---

### Task 4: Data layer

**Files:**
- Modify: `src/data/messages.js`
- Test: `tests/group-chat-data.test.js`

**Interfaces:**
- Produces (used by Tasks 5–6): `createGroup(title, memberIds) → conversationId`, `renameGroup(conversationId, title)`, `addGroupMembers(conversationId, memberIds)`, `leaveGroup(conversationId)`, `removeGroupMember(conversationId, memberId)`, `listGroupMembers(conversationId) → [{profile_id, is_owner, full_name}]`, `listGroupCandidates()` (same row shape as `listDmCandidates`). `chatPath({kind:'group', conversation_id})` → `/chat/dm/<id>`. `getConversation` rows gain `kind` and `title`.

- [ ] **Step 1: Write the failing test** (`tests/group-chat-data.test.js`):

```js
import { describe, expect, it } from 'vitest'
import { chatPath } from '../src/data/messages.js'

describe('chatPath', () => {
  it('routes a group row to the conversation thread', () => {
    expect(chatPath({ kind: 'group', conversation_id: 'abc' })).toBe('/chat/dm/abc')
  })
  it('still routes a squad row to its channel', () => {
    expect(chatPath({ kind: 'squad', team_id: 't1' })).toBe('/chat/t1')
  })
})
```

- [ ] **Step 2: Run it:** `npm run test:related -- tests/group-chat-data.test.js` — expected: FAIL (`/chat/undefined` from the default arm).
- [ ] **Step 3: Implement.** In `src/data/messages.js`:
  (a) In `chatPath` (`src/data/messages.js:548`), add above `case 'dm':`:

```js
    case 'group':
```

  (so `'group'` falls through to the `'dm'` return).
  (b) In `getConversation` (`src/data/messages.js:400`), change the select string to `'id, club_id, kind, title, profile_a, profile_b, created_at, last_at'`.
  (c) Append a `// ── Groups (claude/plans/2026-08-24-group-chats.md) ──` section:

```js
export async function createGroup(title, memberIds) {
  const { data, error } = await supabase.rpc('create_group', { _title: title, _members: memberIds })
  if (error) throw error
  return data
}

export async function renameGroup(conversationId, title) {
  const { error } = await supabase.from('conversations').update({ title }).eq('id', conversationId)
  if (error) throw error
}

export async function addGroupMembers(conversationId, memberIds) {
  const { error } = await supabase.rpc('add_group_members', { _conversation: conversationId, _members: memberIds })
  if (error) throw error
}

export async function leaveGroup(conversationId) {
  const { error } = await supabase.rpc('leave_group', { _conversation: conversationId })
  if (error) throw error
}

export async function removeGroupMember(conversationId, memberId) {
  const { error } = await supabase.rpc('remove_group_member', { _conversation: conversationId, _member: memberId })
  if (error) throw error
}

export async function listGroupMembers(conversationId) {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('profile_id, is_owner, joined_at, profiles(full_name)')
    .eq('conversation_id', conversationId)
    .order('joined_at')
  if (error) throw error
  return (data ?? []).map((r) => ({
    profile_id: r.profile_id,
    is_owner: r.is_owner,
    full_name: r.profiles?.full_name ?? '',
  }))
}

// The group picker's pool: like listDmCandidates but without the minor gate,
// which is the 24 Aug ruling, not an accident.
export async function listGroupCandidates() {
  const { data, error } = await supabase.rpc('group_candidates')
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 4: Run:** `npm run test:related -- tests/group-chat-data.test.js` — expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/data/messages.js tests/group-chat-data.test.js
git commit -m "feat(chat): group data layer — create/rename/members/leave, group chatPath"
```

---

### Task 5: New-group flow in the list

**Files:**
- Create: `src/components/NewGroupPicker.jsx`
- Modify: `src/screens/ChatList.jsx`
- Test: `tests/new-group-picker.test.jsx`

**Interfaces:**
- Consumes: `listGroupCandidates`, `createGroup` (Task 4).
- Produces: `<NewGroupPicker onCreated={(conversationId) => …} onClose={…} />`.

- [ ] **Step 1: Failing test** (`tests/new-group-picker.test.jsx`; copy the render scaffolding — providers, supabase mock — from `tests/notice-composer.test.jsx`'s pattern):

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const createGroup = vi.fn().mockResolvedValue('conv-1')
vi.mock('../src/data/messages.js', async (orig) => ({
  ...(await orig()),
  listGroupCandidates: vi.fn().mockResolvedValue([
    { profile_id: 'p1', full_name: 'Mira Vantel', role: 'parent', via_team: 'U10 squad' },
    { profile_id: 'p2', full_name: 'Tomas Orrin', role: 'parent', via_team: 'U10 squad' },
    { profile_id: 'p3', full_name: 'Dara Kellen', role: 'coach', via_team: 'U10 squad' },
  ]),
  createGroup,
}))
import NewGroupPicker from '../src/components/NewGroupPicker.jsx'

describe('NewGroupPicker', () => {
  it('keeps Create disabled until a name and two people are picked', async () => {
    const user = userEvent.setup()
    render(<NewGroupPicker onCreated={() => {}} onClose={() => {}} />)
    const button = await screen.findByRole('button', { name: /create group/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Group name'), 'Zz Test Group')
    await user.click(await screen.findByText('Mira Vantel'))
    expect(button).toBeDisabled() // one person is a DM, not a group
    await user.click(screen.getByText('Tomas Orrin'))
    expect(button).toBeEnabled()
  })

  it('creates and reports the conversation id', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NewGroupPicker onCreated={onCreated} onClose={() => {}} />)
    await user.type(screen.getByPlaceholderText('Group name'), 'Zz Test Group')
    await user.click(await screen.findByText('Mira Vantel'))
    await user.click(screen.getByText('Tomas Orrin'))
    await user.click(screen.getByRole('button', { name: /create group/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('conv-1'))
    expect(createGroup).toHaveBeenCalledWith('Zz Test Group', ['p1', 'p2'])
  })
})
```

Adjust the mock scaffolding to the repo's existing provider/mocking pattern (see `tests/notice-composer.test.jsx`) if a bare render is not enough; the assertions stand as written — the disabled state is the ≥3 floor's UI half.

- [ ] **Step 2: Run:** `npm run test:related -- tests/new-group-picker.test.jsx` — expected: FAIL (component missing).
- [ ] **Step 3: Implement `src/components/NewGroupPicker.jsx`.** Structure and classes copied from `src/components/NewChatPicker.jsx:44-129` (Card, header row, search input, `bg-surface-mute` group headers, Avatar + name + RolePill rows) with these differences: header label "New group"; a name input above the search (`h-[38px] rounded-[12px] border-line`, placeholder "Group name", `maxLength={80}`); each person row toggles membership of a `selected` Set and renders a leading checkbox square (`h-5 w-5 rounded-[6px]`, checked = `bg-brand-deep` with the white tick SVG from the design mockup); selected people render as removable `bg-brand-deep` chips in a `flex flex-wrap gap-1.5` strip under the name field; footer button:

```jsx
<button
  type="button"
  disabled={!name.trim() || selected.size < 2 || creating}
  onClick={create}
  className="m-3 h-11 rounded-btn bg-brand text-[14px] font-bold text-ink-invert disabled:opacity-40"
>
  {`Create group · ${selected.size + 1} people`}
</button>
```

with `create` calling `createGroup(name.trim(), [...selected])` then `onCreated(id)`; load errors and create errors render in the picker like NewChatPicker's empty state. NO safeguarding copy anywhere (Global Constraints). Footer line: "Only people from your squads appear here."
- [ ] **Step 4: Wire the pencil.** In `src/screens/ChatList.jsx`: replace the boolean `picking` state with `picking: null | 'dm' | 'group'`. The pencil button now toggles a two-item popover (same visual pattern as the ⋯ menu in `src/components/ChatHeader.jsx`): "New chat" → `setPicking('dm')`, "New group" → `setPicking('group')`. Render `{picking === 'dm' && <NewChatPicker …existing props… />}` and `{picking === 'group' && <NewGroupPicker onCreated={(id) => navigate(`/chat/dm/${id}`)} onClose={() => setPicking(null)} />}`.
- [ ] **Step 5: Run:** `npm run test:related -- tests/new-group-picker.test.jsx` and `npm run test:related -- src/screens/ChatList.jsx` — expected: PASS, including ChatList's existing tests (the `data-testid="new-chat"` button must keep working).
- [ ] **Step 6: Commit**

```bash
git add src/components/NewGroupPicker.jsx src/screens/ChatList.jsx tests/new-group-picker.test.jsx
git commit -m "feat(chat): new-group flow — name, multi-select picker, 3-person floor in the UI"
```

---

### Task 6: The thread screen knows it's a group

**Files:**
- Modify: `src/screens/DirectMessages.jsx` (the `Thread` component, `src/screens/DirectMessages.jsx:57-362`)
- Test: `tests/group-thread.test.jsx`

**Interfaces:**
- Consumes: `getConversation` (now returns `kind`/`title`), `listGroupMembers`, `renameGroup`, `addGroupMembers`, `leaveGroup`, `removeGroupMember` (Task 4).

- [ ] **Step 1: Failing test** (`tests/group-thread.test.jsx`, mocking the data module): render the thread for a mocked group conversation (`kind: 'group'`, `title: 'Zz Test Group'`, three mocked members) and assert: (a) the header shows "Zz Test Group" and subtitle "3 people"; (b) NO welfare/notice sentence is rendered (query for the DM notice text the component renders for DMs and expect null) — this is the ruling's UI half, the discriminating assertion; (c) the ⋯ actions include "Rename group" and "Leave group" for a non-owner-less mock where the viewer is owner, and "Block" is absent.
- [ ] **Step 2: Run:** `npm run test:related -- tests/group-thread.test.jsx` — expected: FAIL.
- [ ] **Step 3: Implement in `Thread`:**
  - `const isGroup = conv?.kind === 'group'`; when group, load members alongside the conversation (`listGroupMembers(conversationId)`) and `const mine = members.find((m) => m.profile_id === selfId)`.
  - Header (`ChatHeader` props): `title = isGroup ? conv.title : otherName`, `subtitle = isGroup ? `${members.length} people` : existing`, avatar = existing Avatar with the group's title initials.
  - The DM welfare-notice line and the `conversation_involves_minor` copy render only when `!isGroup` — groups show nothing there (ruling 1).
  - Actions array: for groups drop Block/Report-person items that assume one other person (message-level report stays); add `{ label: 'Rename group', onClick: rename }` (owner only), `{ label: 'Add people', onClick: () => setAdding(true) }` (owner only; renders `NewGroupPicker` in an add mode: pass optional prop `mode="add"` which hides the name field, relabels the button `Add · N`, and calls `addGroupMembers(conversationId, [...selected])` then `onCreated(conversationId)` — implement the prop in `src/components/NewGroupPicker.jsx` in this task), `{ label: 'Leave group', onClick: leave }` (everyone), `{ label: 'Delete group', onClick: deleteChat }` (owner; `deleteConversation` already works — the new delete policy allows the owner).
  - `rename` uses the repo's existing inline-dialog pattern rather than `window.prompt`: a small Card with one text input prefilled with `conv.title`, Save calls `renameGroup` then reloads. `leave` confirms with the existing confirm pattern, then `leaveGroup` and `navigate('/chat')`; when `members.length === 3` the confirm copy says plainly: "You're one of three — leaving closes this group for everyone."
- [ ] **Step 4: Run:** `npm run test:related -- tests/group-thread.test.jsx` and `npm run test:related -- src/screens/DirectMessages.jsx` — expected: PASS, existing DM thread tests untouched.
- [ ] **Step 5: Commit**

```bash
git add src/screens/DirectMessages.jsx src/components/NewGroupPicker.jsx tests/group-thread.test.jsx
git commit -m "feat(chat): group threads — title header, member count, rename/add/leave, no notice"
```

---

### Task 7: Full proof and handover

- [ ] **Step 1:** `npm test` — expected: whole suite green.
- [ ] **Step 2:** `npm run db:check -- group-chats` once more (the live DB now carries the migration; green = still true).
- [ ] **Step 3:** Changelog entry (`claude/changelog.md`, under today, unSHA'd — next PR cites the squash SHA), and flip `claude/plans/2026-08-24-group-chats.md` + this file's Status lines to reflect reality (built-not-merged until Jay merges).
- [ ] **Step 4:** `npm run docs:check` after the commit, not only after `git add`.
- [ ] **Step 5: Commit**

```bash
git add claude/changelog.md claude/plans/2026-08-24-group-chats.md claude/plans/2026-08-24-group-chats-implementation.md
git commit -m "docs(chat): group chats built — changelog and plan status"
```

- [ ] **Step 6: STOP.** Do not push. Show Jay the branch diff and the runbook step (`claude/runbooks/session-and-push.md`); a PR triggers a Netlify deploy preview and merging `main` is a live release — both are his explicit yes. After deploy: verify LIVE (create a real group of three real adults, rename it, message it, watch a push arrive on a phone that is not the actor's) before anything is called done.
