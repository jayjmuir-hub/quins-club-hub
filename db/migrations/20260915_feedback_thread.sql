-- ══════════════════════════════════════════════════════════════════════════
--  A thread of messages on a report — the reporter and the club, in turn
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 4 Sep 2026, on a report he was handling: "if i mark it that i'm
-- working on it and reply, once i'm done i click done but there is no way to
-- send a follow-up message with the done, there is no thread of messages."
--
-- Until now a report carried ONE reply, `feedback.admin_note`, overwritten
-- each time an admin saved. The reporter could not answer it, and a second
-- reply erased the first. This adds `feedback_messages`: any number of
-- messages on a report, from the admin or from the reporter, in order.
--
-- ⚠️ `admin_note` STAYS, AND IS KEPT AS THE LATEST ADMIN MESSAGE BY TRIGGER.
-- Three things read it and all of them keep working unchanged: the reporter's
-- push (`notify_feedback_reply_push` fires on `admin_note` changing and
-- push-send renders it), the edge function's service-role read, and every
-- older client. So an admin message inserts a row here AND, through the
-- trigger below, writes itself into `admin_note` — which is what makes the
-- phone buzz. The reporter's own messages never touch the feedback row: a
-- reporter must not be pushed about what they just typed.
--
-- ⚠️ WHO MAY READ AND WRITE IS THE REPORT'S OWN RULE. Read: the reporter or a
-- club admin, exactly `feedback read`. Write: the same two people, as
-- themselves (`author_id = auth.uid()`). No update, no delete — a thread is a
-- record, and the report's own delete cascades it away.
--
-- ⚠️ BACKFILL: every existing `admin_note` becomes the first message on its
-- report, authored by `handled_by` at `handled_at`, so nothing an admin has
-- already written is lost from the thread view.

create table if not exists public.feedback_messages (
  id          uuid        not null default gen_random_uuid(),
  feedback_id uuid        not null references public.feedback(id) on delete cascade,
  club_id     uuid        not null references public.clubs(id) on delete cascade,
  author_id   uuid        not null references public.profiles(id) on delete cascade,
  body        text        not null,
  created_at  timestamptz not null default now(),
  constraint feedback_messages_pkey primary key (id),
  constraint feedback_messages_body_check check (length(btrim(body)) > 0)
);
create index if not exists feedback_messages_feedback_idx on public.feedback_messages (feedback_id, created_at);

comment on table public.feedback_messages is
  'The thread on a report: messages from the reporter and from club admins, in order. An admin message also becomes feedback.admin_note (trigger), which is what pushes the reporter.';

alter table public.feedback_messages enable row level security;

-- Grants: the same shape as feedback — authenticated may read and insert,
-- nothing else; anon nothing at all.
revoke all on public.feedback_messages from anon;
revoke all on public.feedback_messages from authenticated;
grant select, insert on public.feedback_messages to authenticated;

drop policy if exists "feedback message read" on public.feedback_messages;
create policy "feedback message read" on public.feedback_messages
  for select to authenticated
  using (
    private.is_admin(club_id)
    or exists (select 1 from public.feedback f where f.id = feedback_id and f.submitted_by = (select auth.uid()))
  );

drop policy if exists "feedback message write" on public.feedback_messages;
create policy "feedback message write" on public.feedback_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and club_id = (select f.club_id from public.feedback f where f.id = feedback_id)
    and (
      private.is_admin(club_id)
      or exists (select 1 from public.feedback f where f.id = feedback_id and f.submitted_by = (select auth.uid()))
    )
  );

-- ── An admin message is the latest reply ───────────────────────────────────
create or replace function private.feedback_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only an ADMIN's message becomes the reply the reporter is pushed about.
  -- The reporter's own message leaves the feedback row alone.
  if exists (
    select 1 from public.memberships m
     where m.profile_id = new.author_id
       and m.club_id = new.club_id
       and m.role = 'admin'
       and m.status = 'active'
  ) then
    update public.feedback
       set admin_note = new.body,
           handled_by = new.author_id,
           handled_at = new.created_at
     where id = new.feedback_id;
  end if;
  return new;
end;
$$;
revoke execute on function private.feedback_message_after_insert() from public, anon;

drop trigger if exists feedback_message_after_insert on public.feedback_messages;
create trigger feedback_message_after_insert
  after insert on public.feedback_messages
  for each row
  execute function private.feedback_message_after_insert();

-- ── Backfill the notes already written ─────────────────────────────────────
-- The trigger is not wanted here: admin_note already holds these.
alter table public.feedback_messages disable trigger feedback_message_after_insert;
insert into public.feedback_messages (feedback_id, club_id, author_id, body, created_at)
select f.id, f.club_id, f.handled_by, f.admin_note, coalesce(f.handled_at, f.created_at)
  from public.feedback f
 where f.admin_note is not null
   and length(btrim(f.admin_note)) > 0
   and f.handled_by is not null
   and not exists (select 1 from public.feedback_messages m where m.feedback_id = f.id);
alter table public.feedback_messages enable trigger feedback_message_after_insert;

-- ── Realtime, so a reply appears without a reload ──────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_messages'
  ) then
    alter publication supabase_realtime add table public.feedback_messages;
  end if;
end $$;

-- ── Assert it landed ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'feedback_messages') then
    raise exception 'feedback_messages was not created';
  end if;
  if (select count(*) from pg_policies where tablename = 'feedback_messages') <> 2 then
    raise exception 'feedback_messages should carry exactly two policies';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'feedback_message_after_insert' and not tgisinternal) then
    raise exception 'feedback_message_after_insert trigger missing';
  end if;
  if has_table_privilege('anon', 'public.feedback_messages', 'select') then
    raise exception 'anon can read feedback_messages';
  end if;
end $$;
