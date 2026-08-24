-- Chat round 2 — reply-with-quote, forwarding, photo attachments.
-- Jay, 24 Aug 2026 (evening, second session): the round-2 remainder of
-- claude/plans/2026-08-24-chat-feedback.md, designed in
-- claude/plans/2026-08-24-chat-round-2.md. Photos unblocked by the ruling
-- in claude/decisions/2026-08-24-chat-photos-open.md — open, like WhatsApp:
-- anyone may attach a photo anywhere they can already write, and the safety
-- valve is the machinery chat already has (private bucket, author delete,
-- the report → welfare loop), not consent collection.
--
-- Three columns on messages, one relaxed check, one guard trigger, one
-- private bucket with three policies. The emoji picker and the staff-pill
-- chat button are client-only and appear nowhere in this file.
--
-- IDEMPOTENT: the harness (db/tests/chat-round-2.sql) inlines this file
-- verbatim against a database that may already carry it.
begin;

-- ── messages: quote, forward, attachment ──────────────────────────────────

alter table public.messages add column if not exists quoted_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists forwarded boolean not null default false;
alter table public.messages add column if not exists attachment_path text;

create index if not exists messages_quoted_idx on public.messages (quoted_id) where quoted_id is not null;

-- A photo may travel alone: empty body is legal ONLY alongside an
-- attachment. The 2000 cap is unchanged. Same expression otherwise as the
-- original messages_body_check (db/schema/tables.sql).
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  length(btrim(body)) <= 2000
  and (length(btrim(body)) >= 1 or attachment_path is not null)
);

-- ⚠️ QUOTES ARE DM/GROUP-ONLY AND STAY IN THEIR OWN THREAD. Squad and staff
-- channels already thread via parent_id; a quote there would be a second
-- reply mechanism. And a quote must point INSIDE its own conversation —
-- otherwise a sender could stitch a message from one chat into another,
-- and recipients who happen to be in both would see content the thread
-- never contained. The client never offers either; this refuses them.
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
  select conversation_id into q from public.messages where id = new.quoted_id;
  if q.conversation_id is distinct from new.conversation_id then
    raise exception 'quoted message is not in this conversation';
  end if;
  return new;
end $$;

drop trigger if exists messages_quote_guard on public.messages;
create trigger messages_quote_guard
  before insert on public.messages
  for each row execute function private.messages_quote_guard();

-- ── chat-media: the private bucket ────────────────────────────────────────
--
-- Keys are `<profile_id>/<uuid>.<ext>` — the uploader's own folder, same
-- shape as social-ideas. The mime list is what the client's canvas
-- compression can emit; a HEIC straight off an iPhone is converted before
-- upload, never stored.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The owner of a chat photo, parsed from its object key. Mirrors
-- private.social_idea_owner — a storage policy has nothing but the key.
create or replace function private.chat_media_owner(_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(_name, '/', 1), '')::uuid
$$;

grant execute on function private.chat_media_owner(text) to authenticated;

-- Readable wherever a LIVE message carrying it is readable: the exists()
-- runs as the caller, so the messages read policy decides — squad
-- visibility, DM/group participation, welfare review, all of it, without
-- restating any of it here (the message_reactions precedent). The author
-- keeps sight of their own uploads regardless, which is also what lets
-- them clean up an upload that never became a message.
-- ⚠️ Forwarding re-points at the SAME object, so a forward widens the
-- photo's audience to the destination thread — accepted in the plan: the
-- forwarder could equally have re-uploaded the pixels.
drop policy if exists "chat media read" on storage.objects;
create policy "chat media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      private.chat_media_owner(name) = (select auth.uid())
      or exists (select 1 from public.messages x
                 where x.attachment_path = name and x.deleted_at is null)
    )
  );

-- A member writes only under their own prefix. Upload happens BEFORE the
-- message row exists (WhatsApp order — no broken-image moment), so this
-- cannot lean on messages; the folder is the authorisation.
drop policy if exists "chat media write" on storage.objects;
create policy "chat media write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and private.chat_media_owner(name) = (select auth.uid())
  );

-- Own folder only. The app removes the object after the message soft-delete
-- succeeds; an orphan is unreadable by everyone but its owner meanwhile.
drop policy if exists "chat media remove" on storage.objects;
create policy "chat media remove" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and private.chat_media_owner(name) = (select auth.uid())
  );

commit;
