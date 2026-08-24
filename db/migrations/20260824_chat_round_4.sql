-- Chat round 4 — pins for participants, private stars, reply-privately.
-- Jay, 24 Aug 2026 (late night), relayed with his WhatsApp screenshots and
-- the ruling: "anyone in the chat may pin; staff/admins can always unpin".
-- Plan: claude/plans/2026-08-24-chat-round-4.md.
--
-- IDEMPOTENT: the harness (db/tests/chat-round-4.sql) inlines this file
-- verbatim against a database that may already carry it.
begin;

-- ── Pinning, without widening "message edit" ──────────────────────────────
--
-- ⚠️ THE OBVIOUS MOVE IS THE TRAP. The UPDATE grant on messages covers
-- (body, pinned, deleted_at) as a SET, so letting a participant's row pass
-- the update policy would also authorise them to rewrite anybody's words —
-- grants.sql §4's exact warning. A SECURITY DEFINER function with a
-- hard-coded single-column UPDATE is the only shape that can say "pinned,
-- and nothing else".
--
-- Who may: in a DM/group, any participant (Jay's WhatsApp-default ruling),
-- and any admin who may already review it; in squad/staff channels the
-- staff rule stands unchanged (announce-only ethos — the ruling was made
-- about groups). Unpin is the same set: WhatsApp's default lets anyone
-- unpin, and staff/admins are inside "the same set" everywhere they act.
create or replace function public.set_message_pinned(_message uuid, _pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare m record;
begin
  select id, channel, team_id, club_id, conversation_id, deleted_at
    into m from public.messages where id = _message;
  if m.id is null then
    raise exception 'no such message';
  end if;
  if m.deleted_at is not null then
    raise exception 'a removed message cannot be pinned';
  end if;
  if m.channel = 'dm' then
    if not (private.in_conversation(m.conversation_id)
            or private.conversation_reviewable(m.conversation_id)) then
      raise exception 'only people in this chat may pin';
    end if;
  elsif m.channel in ('squad', 'staff') then
    if not ((m.team_id is not null and private.can_edit_team(m.team_id))
            or (m.team_id is null and private.is_admin(m.club_id))) then
      raise exception 'only squad staff may pin here';
    end if;
  else
    raise exception 'unknown channel';
  end if;
  update public.messages set pinned = _pinned where id = _message;
end $$;

revoke all on function public.set_message_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_message_pinned(uuid, boolean) to authenticated;

comment on function public.set_message_pinned(uuid, boolean) is
  'Pin/unpin one message. Participants in a DM/group, staff in channels. Single-column by construction — see db/migrations/20260824_chat_round_4.sql.';

-- ── Stars: private bookmarks, the nicknames pattern ───────────────────────
create table if not exists public.message_stars (
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  message_id  uuid not null references public.messages(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (owner_id, message_id)
);

alter table public.message_stars enable row level security;
grant select, insert, delete on public.message_stars to authenticated;
revoke all on public.message_stars from public, anon;

drop policy if exists "star read own" on public.message_stars;
create policy "star read own" on public.message_stars
  for select using (owner_id = (select auth.uid()));

-- Your own star, on a live message you can read (the exists runs as the
-- caller, so messages RLS decides readability — the reactions precedent).
drop policy if exists "star create own" on public.message_stars;
create policy "star create own" on public.message_stars
  for insert with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.messages x where x.id = message_id and x.deleted_at is null));

drop policy if exists "star remove own" on public.message_stars;
create policy "star remove own" on public.message_stars
  for delete using (owner_id = (select auth.uid()));

-- ── Reply-privately: the quote guard relaxes ──────────────────────────────
--
-- Round 2's guard demanded same-conversation, to stop a sender stitching
-- one chat's content into another. Reply-privately IS that act, done
-- legitimately: quote a group message into a DM with its author. The new
-- rule keeps quotes dm-only and demands the quoted message be READABLE BY
-- THE SENDER — the security-invoker SELECT below returns nothing for a
-- message their RLS hides, so an unreadable id still refuses. The
-- recipient-side widening is accepted in the round-4 plan.
create or replace function private.messages_quote_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare q record;
begin
  if new.quoted_id is null then return new; end if;
  if new.channel <> 'dm' or new.conversation_id is null then
    raise exception 'quotes are for direct and group chats only';
  end if;
  select id into q from public.messages where id = new.quoted_id;
  if q.id is null then
    raise exception 'quoted message is not one you can read';
  end if;
  return new;
end $$;

commit;
