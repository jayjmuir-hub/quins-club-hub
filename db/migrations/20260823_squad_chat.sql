-- Squad chat, phase 1 — a channel per squad that a WhatsApp group could move
-- into. claude/plans/2026-08-23-squad-chat.md.
--
-- WHAT THIS CREATES
--   public.messages          one row per post or reply; team_id is the boundary
--   public.channel_settings  announce-only per squad (DEFAULT ON)
--   public.message_reads     first-read receipts, same shape as announcement_reads
--   public.message_push_subscriptions(uuid)  the audience for one message's push
--   public.message_read_stats(uuid)          reads-per-post for a squad's staff
--   triggers: provenance stamp, soft-delete blanking, push on a staff post
--
-- THE RULINGS INSIDE IT, IN ONE PLACE
--
-- ⚠️ ANNOUNCE-ONLY DEFAULTS ON. A squad that wants open chatter turns it on; a
-- squad that never does never has to moderate anything. In announce-only mode
-- a parent may still REPLY (parent_id set) — that is the whole point of the
-- mode: staff start threads, families answer inside them.
--
-- ⚠️ `team_id` IS THE SECURITY BOUNDARY, exactly as for announcements — NULL
-- means the whole club. `channel` exists for phases 3 ('staff', 'dm') and is
-- constrained to 'squad' here by the policies, not only by the check, so a
-- later phase has to write a policy to open it rather than finding it open.
--
-- ⚠️ A PARENT'S REPLY DOES NOT PUSH, IN PHASE 1. Only a post by somebody
-- `private.can_edit_team` allows (coach / manager / medic / admin) fires the
-- trigger. @mentions are phase 2. An app that buzzes for every "thanks!" is
-- uninstalled by Saturday.
--
-- ⚠️ NO HARD DELETE FROM THE CLIENT. `deleted_at` is set and a trigger blanks
-- the body, so "there was a message here" survives while the words do not.
-- Same for edits: 15 minutes, own row, body only.
--
-- ⚠️ THE PUSH PAYLOAD CARRIES THE SQUAD AND THE FIRST LINE, NEVER A CHILD'S
-- NAME BY CONSTRUCTION — the body is the author's responsibility; the payload
-- shape is ours. claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md.
--
-- Harness: db/tests/squad-chat.sql.

begin;

-- ── Tables ────────────────────────────────────────────────────────────────

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  -- ⚠️ Stamped by trigger, never sent by the client.
  club_id         uuid not null references public.clubs(id) on delete cascade,
  -- NULL = the whole club. `on delete cascade`, as for announcements: a
  -- message whose squad is gone has no audience.
  team_id         uuid references public.teams(id) on delete cascade,
  channel         text not null default 'squad'
                  check (channel in ('squad', 'staff', 'dm')),
  -- A reply. ONE level: a reply's parent must itself be a top-level post —
  -- enforced by the trigger below, not by a self-referencing check.
  parent_id       uuid references public.messages(id) on delete cascade,
  -- A fixture thread (phase 2). Reserved, nullable, set null if the fixture
  -- goes — the thread outlives a cancelled match as a record.
  event_id        uuid references public.events(id) on delete set null,
  -- ⚠️ Stamped by trigger, never sent by the client.
  author_id       uuid not null references public.profiles(id) on delete cascade,
  -- ⚠️ ALSO STAMPED, AND DENORMALISED ON PURPOSE. The author's role on this
  -- squad AT THE TIME OF POSTING, and their membership title ("Head Coach").
  -- A coach's post stays a coach's post after they leave; and the client
  -- cannot work it out itself — `memberships` is own-row-or-admin under RLS,
  -- so a parent cannot see that the author is the manager.
  author_role     text,
  author_title    text,
  body            text not null check (length(btrim(body)) between 1 and 2000),
  pinned          boolean not null default false,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  -- 'staff' and 'dm' rows need what they need; 'squad' needs nothing extra.
  constraint messages_staff_needs_team check (channel <> 'staff' or team_id is not null)
);

create index messages_stream_idx on public.messages (team_id, channel, created_at desc);
create index messages_parent_idx on public.messages (parent_id) where parent_id is not null;
create index messages_event_idx  on public.messages (event_id)  where event_id is not null;
create index messages_author_idx on public.messages (author_id);

create table public.channel_settings (
  team_id        uuid primary key references public.teams(id) on delete cascade,
  club_id        uuid not null references public.clubs(id) on delete cascade,
  -- ⚠️ DEFAULT ON. See the header.
  announce_only  boolean not null default true,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

create table public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, profile_id)
);
create index message_reads_profile_idx on public.message_reads (profile_id);

alter table public.messages         enable row level security;
alter table public.channel_settings enable row level security;
alter table public.message_reads    enable row level security;

-- ── Helpers ───────────────────────────────────────────────────────────────

-- Is this squad announce-only? Absent row = the default = yes.
create or replace function private.channel_announce_only(_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce((select announce_only from channel_settings where team_id = _team), true);
$function$;

revoke all on function private.channel_announce_only(uuid) from public, anon;

-- May the caller reply to this post? SECURITY DEFINER because a policy on
-- `messages` cannot itself select from `messages` — Postgres reports
-- "infinite recursion detected in policy" (measured, first run of the
-- harness). The helper reads the parent outside RLS and applies the same
-- visibility rule the read policy does.
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
       and p.channel = 'squad'
       and case
         when p.team_id is null then exists (
           select 1 from memberships m
            where m.profile_id = (select auth.uid())
              and m.club_id = p.club_id and m.status = 'active')
         else private.can_see_team(p.team_id)
       end);
$function$;

revoke all on function private.can_reply_to(uuid) from public, anon;

-- ── Triggers ──────────────────────────────────────────────────────────────

-- Stamp club_id and author_id from the session; refuse a reply to a reply;
-- inherit team_id/channel from the parent so a reply can never land in a
-- different squad from its post.
create or replace function private.set_message_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  parent public.messages;
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
    new.team_id  := parent.team_id;
    new.channel  := parent.channel;
    new.event_id := parent.event_id;
    new.pinned   := false;
  end if;

  -- The author's standing on this squad, best role first. A club admin with
  -- no squad row is 'admin'; a parent is 'parent'.
  select m.role, m.title into new.author_role, new.author_title
    from memberships m
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null)
   order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                        when 'medic' then 3 else 9 end,
            m.team_id nulls last
   limit 1;

  new.club_id := coalesce(
    (select club_id from teams where id = new.team_id),
    (select m.club_id from memberships m
      where m.profile_id = new.author_id and m.status = 'active'
      order by m.created_at limit 1));
  if new.club_id is null then
    raise exception 'no club for this message' using errcode = '23502';
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$;

create trigger messages_provenance
  before insert on public.messages
  for each row execute function private.set_message_provenance();

-- On update: the body may change (edit) or the row may be soft-deleted. A
-- soft delete blanks the body so the words are gone but the row is not.
-- Everything else is frozen — team, author, parent, created_at.
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
  new.author_id  := old.author_id;
  new.author_role  := old.author_role;
  new.author_title := old.author_title;
  new.created_at := old.created_at;

  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '(removed)';
    new.pinned := false;
  elsif old.deleted_at is not null then
    -- Nothing about a removed message changes again.
    new.body := old.body;
    new.deleted_at := old.deleted_at;
    new.pinned := false;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$function$;

create trigger messages_touch
  before update on public.messages
  for each row execute function private.touch_message();

-- ── Policies ──────────────────────────────────────────────────────────────

-- read: the squad (or the club). Phase 1 opens 'squad' only — 'staff' and
-- 'dm' rows are unreadable until a later phase writes their policy.
create policy "message read" on public.messages
  for select using (
    channel = 'squad'
    and case
      when team_id is null then exists (
        select 1 from memberships m
         where m.profile_id = (select auth.uid())
           and m.club_id = messages.club_id
           and m.status = 'active')
      else private.can_see_team(team_id)
    end
  );

-- insert: a top-level post needs can_edit_team (or is_admin club-wide), OR
-- the squad is open (announce_only = false) and the caller can see it. A
-- REPLY needs only can_see_team — announce-only never blocks replying.
-- ⚠️ author_id is stamped by the trigger; the check here is on the boundary.
create policy "message create" on public.messages
  for insert with check (
    channel = 'squad'
    and (
      (parent_id is not null and private.can_reply_to(parent_id))
      or (
        parent_id is null
        and case
          when team_id is null then private.is_admin(
            (select m.club_id from memberships m
              where m.profile_id = (select auth.uid()) and m.status = 'active'
              order by m.created_at limit 1))
          else private.can_edit_team(team_id)
            or (not private.channel_announce_only(team_id) and private.can_see_team(team_id))
        end
      )
    )
  );

-- update: own row within 15 minutes (edit or remove), or squad staff
-- (remove, pin). `with check` keeps the row in the same squad — the trigger
-- freezes the rest.
create policy "message edit" on public.messages
  for update using (
    (author_id = (select auth.uid()) and created_at > now() - interval '15 minutes')
    or (team_id is not null and private.can_edit_team(team_id))
    or (team_id is null and private.is_admin(club_id))
  ) with check (
    channel = 'squad'
  );

-- No DELETE policy. Soft delete is an UPDATE.

-- channel_settings: everybody in the squad may read it (the composer has to
-- know); only squad staff may write it.
create policy "channel settings read" on public.channel_settings
  for select using (private.can_see_team(team_id));
create policy "channel settings write" on public.channel_settings
  for all using (private.can_edit_team(team_id))
  with check (private.can_edit_team(team_id) and updated_by = (select auth.uid()));

-- message_reads: own rows only, insert and read. No update, no delete — a
-- read is first-read and cannot be un-read.
create policy "message read own reads" on public.message_reads
  for select using (profile_id = (select auth.uid()));
create policy "message mark read" on public.message_reads
  for insert with check (
    profile_id = (select auth.uid())
    and exists (select 1 from messages m where m.id = message_id)   -- visible under RLS
  );

-- ── Grants ────────────────────────────────────────────────────────────────

-- ⚠️ `authenticated` TOO, AND FIRST. Supabase's default privileges hand
-- `authenticated` ALL on every new table (db/schema/grants.sql, the
-- announcement_reads note). Without this revoke the column-level UPDATE
-- below would sit on top of a table-level one the defaults already gave,
-- and "message edit"'s WITH CHECK pins only `channel` — an author could
-- re-scope their own post's team_id within the 15-minute window.
revoke all on public.messages, public.channel_settings, public.message_reads from public, anon, authenticated;
grant select, insert on public.messages to authenticated;
grant update (body, pinned, deleted_at) on public.messages to authenticated;
grant select, insert, update on public.channel_settings to authenticated;
grant select, insert on public.message_reads to authenticated;

-- ── Read receipts for staff ───────────────────────────────────────────────

-- reads per top-level post in a squad, and the size of its audience. Staff
-- only: a parent must not be able to see who has read what.
create or replace function public.message_read_stats(_team uuid)
returns table (message_id uuid, reads bigint, audience bigint)
language sql
stable
security definer
set search_path = public
as $function$
  select m.id,
         (select count(*) from message_reads r where r.message_id = m.id),
         (select count(*) from private.notice_audience(m.club_id, m.team_id))
    from messages m
   where m.team_id = _team and m.parent_id is null and m.deleted_at is null
     and private.can_edit_team(_team);
$function$;

revoke all on function public.message_read_stats(uuid) from public, anon;
grant execute on function public.message_read_stats(uuid) to authenticated;

-- ── Push ──────────────────────────────────────────────────────────────────

-- The opt-out category list is a CHECK constraint; a category the client
-- offers that the table refuses is a toggle that fails with 23514.
alter table public.notification_opt_outs drop constraint notification_opt_outs_category_check;
-- ⚠️ `check (category in (...))`, NOT `= any (array[...])` — the form
-- tests/notification-categories.test.js parses to cross-check the app's list.
alter table public.notification_opt_outs add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply', 'notice', 'fixture', 'approval', 'availability', 'squad_chat'));

-- The audience for ONE message's push: the squad (or club), minus the
-- author, minus anybody who has opted out of 'squad_chat'.
create or replace function public.message_push_subscriptions(_message uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $function$
  with asked as (select * from messages where id = _message)
  select s.id, s.endpoint, s.p256dh, s.auth
    from asked a
    cross join lateral private.notice_audience(a.club_id, a.team_id) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where aud.profile_id <> a.author_id
     and a.deleted_at is null
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = aud.profile_id and o.category = 'squad_chat');
$function$;

revoke all on function public.message_push_subscriptions(uuid) from public, anon, authenticated;

-- Fires on a STAFF top-level post only (see header). Same vault secrets and
-- endpoint as the notice trigger; push-send gets `{ message_id }`.
create or replace function private.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  endpoint text;
  secret   text;
begin
  if new.parent_id is not null then return null; end if;
  if new.team_id is not null and not private.can_edit_team(new.team_id) then return null; end if;
  if new.team_id is null and not private.is_admin(new.club_id) then return null; end if;

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

create trigger messages_push
  after insert on public.messages
  for each row execute function private.notify_message_push();

-- ── Realtime ──────────────────────────────────────────────────────────────
-- The publication is the other half; without it the client's subscription is
-- a silent socket (db/migrations/20260816_realtime_publication_announcements.sql).
alter publication supabase_realtime add table public.messages;

commit;
