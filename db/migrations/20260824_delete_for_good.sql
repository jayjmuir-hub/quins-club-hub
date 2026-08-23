-- Delete for good — 24 Aug 2026. claude/plans/2026-08-24-chat-list.md.
--
-- Jay, after the Chats list shipped: "i still can't completely delete
-- messages or chats". The soft delete ("Message removed" placeholder) and
-- the clear-for-me were not what he meant. COMPLETELY means the row is gone.
--
--   A MESSAGE: hard DELETE, for everyone. Your own, any time. Staff in their
--   squad's channels; an admin in the club channel and in a DM they may
--   review. Replies, read receipts and reports cascade with it.
--   ⚠️ THE ONE EXCEPTION: a REPORTED message can only be deleted by an admin.
--   A report is evidence until somebody resolves it; letting the author
--   delete the evidence would make the report system decorative.
--
--   A CHAT: a DM may be deleted by either participant — gone for BOTH —
--   unless a message in it has been reported, in which case admin only. A
--   squad, staff or club channel is cleared (every message deleted) by the
--   squad's staff / an admin; the channel itself stays, because it IS the
--   squad. public.clear_channel() does that; it is a SECURITY DEFINER
--   function because `authenticated` holds no DELETE on messages beyond the
--   policy below, and clearing is a staff act, not a per-row right.
--
--   The welfare access log must OUTLIVE the conversation it records — it is
--   the audit of who looked. Its FK becomes SET NULL; admin and time stay.
--
-- The soft-delete path (deleted_at) and conversation_clears stay in the
-- schema — nothing writes them from the app any more, and removing them is
-- a separate, destructive migration nobody has asked for.

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
