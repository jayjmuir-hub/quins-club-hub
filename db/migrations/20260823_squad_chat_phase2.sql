-- Squad chat, phase 2 — fixture threads and @mentions.
-- claude/plans/2026-08-23-squad-chat.md. Builds on 20260823_squad_chat.sql.
--
-- WHAT THIS ADDS
--   messages.mentions uuid[]            who the author named; FILTERED to the
--                                       squad's audience by the trigger
--   one open thread per fixture         partial unique index on event_id
--   a fixture thread may be OPENED by   any squad member, even in
--                                       announce-only — it is the fixture's
--                                       discussion, not an announcement
--   a mention PUSHES the mentioned      whoever wrote it, reply or post;
--                                       everything else stays as phase 1
--   public.chat_mentionables(uuid)      who can be mentioned in this channel
--
-- THE RULINGS
--
-- ⚠️ MENTIONS ARE FILTERED SERVER-SIDE. The client sends an array of profile
-- ids; the trigger keeps only those in private.notice_audience for the
-- message's squad (or club). A mention of somebody outside the squad is
-- silently dropped — not an error, because the picker should never offer one
-- and an error here would only ever be somebody poking the API.
--
-- ⚠️ A MENTION PUSHES ONLY THE MENTIONED. The phase-1 rule — a staff
-- top-level post pushes the squad — is unchanged. A parent's reply that
-- mentions the manager pushes the manager and nobody else. An app that
-- buzzes for every "thanks!" is uninstalled by Saturday; an app that does
-- not buzz when you are asked a direct question is ignored by Sunday.
--
-- ⚠️ ONE THREAD PER FIXTURE, and a removed thread can be replaced. The
-- partial unique index excludes deleted_at rows, so soft-deleting a thread
-- lets the squad start a clean one rather than leaving the fixture
-- un-discussable.
--
-- ⚠️ THE FIXTURE MUST BELONG TO THE SQUAD. The trigger refuses an event_id
-- whose team is not the message's team (and sets team_id from the event
-- when the client sends only event_id). Without this a thread could be hung
-- off another squad's match and read by people who cannot see that match.
--
-- Harness: db/tests/squad-chat-phase2.sql.

begin;

alter table public.messages
  add column mentions uuid[] not null default '{}';

create unique index messages_one_thread_per_event_idx
  on public.messages (event_id)
  where event_id is not null and parent_id is null and deleted_at is null;

create index messages_mentions_idx on public.messages using gin (mentions);

-- ── Provenance: fixture and mentions ──────────────────────────────────────

create or replace function private.set_message_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  parent public.messages;
  ev public.events;
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
  elsif new.event_id is not null then
    -- A fixture thread. The fixture decides the squad; a mismatch is refused.
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

  -- Mentions: keep only people in this channel's audience, never the author.
  if coalesce(array_length(new.mentions, 1), 0) > 0 then
    select coalesce(array_agg(distinct m), '{}') into new.mentions
      from unnest(new.mentions) as m
     where m <> new.author_id
       and m in (select profile_id from private.notice_audience(new.club_id, new.team_id) as aud(profile_id));
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$;

-- touch_message: mentions are frozen too (an edit cannot add a mention that
-- would not have pushed — editing is silent by design).
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
  new.mentions   := old.mentions;
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

-- ── Policy: a fixture thread may be opened by any squad member ────────────

drop policy "message create" on public.messages;
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
            -- Phase 2: the fixture's thread belongs to the squad, not to
            -- the staff. The trigger has already pinned team_id to the
            -- fixture's squad by the time this runs.
            or (event_id is not null and private.can_see_team(team_id))
        end
      )
    )
  );

-- ── Push: a mention reaches the mentioned; a staff post reaches the squad ──

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
     where a.parent_id is null
       and ((a.team_id is not null and a.author_role in ('admin','coach','manager','medic'))
            or (a.team_id is null and a.author_role = 'admin'))
  ),
  people as (
    -- the squad, for a staff top-level post …
    select aud.profile_id
      from staff_post a
      cross join lateral private.notice_audience(a.club_id, a.team_id) as aud(profile_id)
    union
    -- … plus whoever was mentioned, by anybody (already audience-filtered).
    select m from asked a, unnest(a.mentions) as m
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join asked a
   where p.profile_id <> a.author_id
     and a.deleted_at is null
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = p.profile_id and o.category = 'squad_chat');
$function$;

revoke all on function public.message_push_subscriptions(uuid) from public, anon, authenticated;

-- The trigger now fires for a staff top-level post OR any message with a
-- mention. Everything else is still quiet.
create or replace function private.notify_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  endpoint text;
  secret   text;
  staff_post boolean;
begin
  staff_post := new.parent_id is null
    and ((new.team_id is not null and new.author_role in ('admin','coach','manager','medic'))
         or (new.team_id is null and new.author_role = 'admin'));
  if not staff_post and coalesce(array_length(new.mentions, 1), 0) = 0 then
    return null;
  end if;

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

-- ── Who can be mentioned here ─────────────────────────────────────────────
-- The channel's audience, with names and the best role each holds on the
-- squad. Only for somebody who can see the channel. This is the first place
-- a parent sees other families' names as a list — the same names they
-- already see on every reply in the channel.

create or replace function public.chat_mentionables(_team uuid)
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
    select case when _team is null
      then exists (select 1 from memberships m, me, club
                    where m.profile_id = me.id and m.club_id = club.id and m.status = 'active')
      else private.can_see_team(_team) end as ok
  )
  select aud.profile_id, p.full_name,
         (select m.role from memberships m
           where m.profile_id = aud.profile_id and m.status = 'active'
             and (m.team_id = _team or m.team_id is null)
           order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                                when 'medic' then 3 else 9 end
           limit 1) as role
    from club, allowed
    cross join lateral private.notice_audience(club.id, _team) as aud(profile_id)
    join profiles p on p.id = aud.profile_id
   where allowed.ok
     and aud.profile_id <> (select id from me)
   order by p.full_name;
$function$;

revoke all on function public.chat_mentionables(uuid) from public, anon;
grant execute on function public.chat_mentionables(uuid) to authenticated;

commit;
