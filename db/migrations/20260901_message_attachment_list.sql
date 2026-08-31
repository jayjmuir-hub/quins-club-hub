-- 1 Sep 2026 — a message carries a LIST of attachments, not one.
-- Plan: claude/plans/2026-08-31-chat-photo-albums-implementation.md (plan 1 of 4).
-- Spec: claude/plans/2026-08-31-chat-photo-albums.md.
-- Harness: db/tests/chat-album-media.sql — written first, watched failing.
--
-- ══ THE EXPAND HALF OF EXPAND-THEN-CONTRACT ═══════════════════════════════
-- attachment_path STAYS, and a trigger keeps it and attachment_paths[1] in
-- agreement in BOTH directions. That is not belt-and-braces, it is the whole
-- point: this app is a PWA, so after a deploy some phones keep running a
-- cached service-worker bundle that writes the old column. They must keep
-- working. The contract migration that drops attachment_path is deliberately
-- weeks away and must not be merged into this one.
--
-- ══ ⚠️ THE ONE THING A FUTURE TIDY-UP MUST NOT DO ═════════════════════════
-- The `chat media read` policy's EXISTS carries NO conversation-membership
-- condition, and read literally it says "if any live message references this
-- object, any authenticated user may read it". It is safe ONLY because the
-- subquery runs as the CALLER and public.messages has its own RLS, so the
-- caller sees only the message rows they are entitled to. The membership
-- check is INHERITED, never stated.
--
-- ⚠️ SO KEEP THE EXISTS INLINE AND INVOKER. Extracting it into a helper such
-- as private.message_has_attachment(name) and marking it SECURITY DEFINER —
-- as most private.* helpers in this repo are — stops messages' RLS applying,
-- and the policy then means what it literally says: every member reads every
-- chat photo in every squad, children included. It would look tidier and it
-- would pass a naive fixture. db/tests/chat-album-media.sql assertion 3 is
-- the tripwire for exactly that, and it is why an "outsider is refused" arm
-- that looks redundant is not.
--
-- Recorded because it is invisible in the policy text and cost a peer session
-- a full before-state capture to notice.

begin;

alter table public.messages
  add column if not exists attachment_paths text[] not null default '{}';

comment on column public.messages.attachment_paths is
  'Every attachment on this message, in display order, max 10. Photos AND '
  'voice notes — src/data/chatMedia.js tells them apart by inspecting the '
  'path, so an album grid must FILTER voice notes rather than try to render '
  'one. attachment_path is kept in step as element 1 by '
  'private.sync_attachment_paths() until the contract migration drops it.';

-- Backfill BEFORE the constraint and the policy, so no row is ever stranded.
-- ⚠️ A row with attachment_path set and an empty list is unreadable by
-- EVERYONE including its own sender, because `name = any('{}')` is false.
update public.messages
   set attachment_paths = array[attachment_path]
 where attachment_path is not null
   and cardinality(attachment_paths) = 0;

-- ⚠️ THE CAP LIVES HERE AS WELL AS IN THE CLIENT. A client cap is a
-- suggestion; this is the rule. Ten is arbitrary and deliberate: it stops an
-- accidental drop of a folder posting a hundred photographs of children.
alter table public.messages drop constraint if exists messages_attachment_cap;
alter table public.messages add constraint messages_attachment_cap
  check (cardinality(attachment_paths) <= 10);

-- Both directions: an OLD client writing attachment_path and a NEW client
-- writing attachment_paths both end up consistent.
-- INVOKER on purpose — it touches no table, only NEW, so it needs no elevated
-- rights, and SECURITY DEFINER here would be privilege for nothing.
create or replace function private.sync_attachment_paths()
returns trigger language plpgsql set search_path = '' as $$
begin
  if cardinality(new.attachment_paths) > 0 then
    new.attachment_path := new.attachment_paths[1];
  elsif new.attachment_path is not null then
    new.attachment_paths := array[new.attachment_path];
  end if;
  return new;
end $$;

drop trigger if exists sync_attachment_paths on public.messages;
create trigger sync_attachment_paths
  before insert or update on public.messages
  for each row execute function private.sync_attachment_paths();

-- A photo may still travel alone: an empty body is legal alongside ANY
-- attachment, now counted from the list rather than the single column.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  length(btrim(body)) <= 2000
  and (length(btrim(body)) >= 1 or cardinality(attachment_paths) > 0)
);

-- ⚠️ THE SECURITY BOUNDARY. `x.attachment_path = name` becomes membership of
-- the list. Everything else — the bucket test, the owner arm, the
-- `deleted_at is null` arm, the inline invoker EXISTS — is unchanged, and
-- each is asserted by the harness.
drop policy if exists "chat media read" on storage.objects;
create policy "chat media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      private.chat_media_owner(name) = (select auth.uid())
      or exists (select 1 from public.messages x
                 where name = any(x.attachment_paths) and x.deleted_at is null)
    )
  );

-- Guards. Refuse to finish rather than leave a half-applied state.
do $$
declare n int; stranded int;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'messages' and t.tgname = 'sync_attachment_paths'
     and not t.tgisinternal;
  if n <> 1 then
    raise exception 'ABORTING: expected exactly one sync_attachment_paths trigger, found %.', n;
  end if;

  select count(*) into stranded from public.messages
   where attachment_path is not null and cardinality(attachment_paths) = 0;
  if stranded <> 0 then
    raise exception 'ABORTING: % row(s) have attachment_path with an empty list — their photos would be unreadable by everyone.', stranded;
  end if;

  select count(*) into n from pg_policies
   where tablename = 'objects' and policyname = 'chat media read'
     and qual like '%attachment_paths%';
  if n <> 1 then
    raise exception 'ABORTING: chat media read does not reference attachment_paths.';
  end if;

  raise notice 'guards passed: trigger installed, no stranded rows, policy reads the list';
end $$;

commit;
