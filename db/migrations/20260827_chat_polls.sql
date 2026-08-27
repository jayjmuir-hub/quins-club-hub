-- Chat polls — WhatsApp-style, Jay 27 Aug 2026 ("A, drive it until it's live").
-- Spec: claude/plans/2026-08-27-chat-polls.md. Rulings (open posting; votes
-- visible to the whole chat): claude/decisions/2026-08-27-chat-polls-open-visible.md.
--
-- A poll IS a message: the QUESTION lives in messages.body (already not-null,
-- 1..2000) so notifications, chat-list previews and forwarding reuse it. Three
-- tables hang off that message and cascade with it.
--
-- WRITES:
--   • polls / poll_options — created ONLY by create_poll() (security definer),
--     which re-checks the caller may post to the target because a definer insert
--     bypasses the "message create" RLS policy. The check mirrors that policy's
--     parent_id-null arms verbatim (db/migrations/20260823_squad_chat_phase3.sql).
--   • poll_votes — DIRECT inserts/deletes by the voter under RLS, exactly like
--     message_reactions: the read predicate runs as the caller so the messages
--     read policy scopes it. A BEFORE INSERT trigger stamps voter_id + message_id
--     (so neither can be spoofed) and, for a single-choice poll, clears the
--     voter's other votes first — atomic replacement without a definer RPC.
--
-- READS: all three defer to the message's own read policy (the message_reactions
-- pattern), which is what makes votes visible to precisely the people in the
-- chat — the 27 Aug parity ruling.
--
-- IDEMPOTENT: the harness (db/tests/chat-polls.sql) inlines this file verbatim
-- against a database that may already carry it.
begin;

-- ── tables ────────────────────────────────────────────────────────────────
create table if not exists public.polls (
  message_id     uuid primary key references public.messages(id) on delete cascade,
  allow_multiple boolean not null default false,
  created_at     timestamptz not null default now()
);

create table if not exists public.poll_options (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.polls(message_id) on delete cascade,
  position   int  not null,
  label      text not null check (length(btrim(label)) between 1 and 100),
  unique (message_id, position)
);
create index if not exists poll_options_message_idx on public.poll_options (message_id);

create table if not exists public.poll_votes (
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id)     on delete cascade,
  -- denormalised from the option so single-choice replacement and per-poll
  -- reads are one predicate, not a join. Stamped by the trigger, never trusted
  -- from the client.
  message_id uuid not null references public.polls(message_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, voter_id)
);
create index if not exists poll_votes_message_idx on public.poll_votes (message_id);

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes   enable row level security;

grant select on public.polls        to authenticated;
grant select on public.poll_options to authenticated;
grant select, insert, delete on public.poll_votes to authenticated;

-- ── read policies: defer to the message's read policy ───────────────────────
drop policy if exists "poll read" on public.polls;
create policy "poll read" on public.polls
  for select using (exists (select 1 from messages x where x.id = message_id));

drop policy if exists "poll option read" on public.poll_options;
create policy "poll option read" on public.poll_options
  for select using (exists (select 1 from messages x where x.id = message_id));

drop policy if exists "poll vote read" on public.poll_votes;
create policy "poll vote read" on public.poll_votes
  for select using (exists (select 1 from messages x where x.id = message_id));

-- ── vote writes: your own row, on a live message you can read ────────────────
-- The exists() runs as the caller, so the messages read policy decides scope.
-- voter_id / message_id are forced by the trigger below, so the check is a
-- backstop, not the only guard.
drop policy if exists "poll vote create" on public.poll_votes;
create policy "poll vote create" on public.poll_votes
  for insert with check (
    voter_id = (select auth.uid())
    and exists (select 1 from messages x where x.id = message_id and x.deleted_at is null));

drop policy if exists "poll vote delete" on public.poll_votes;
create policy "poll vote delete" on public.poll_votes
  for delete using (voter_id = (select auth.uid()));

-- ── vote trigger: stamp identity, enforce single-choice ─────────────────────
create or replace function private.poll_vote_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  multi boolean;
  msg   uuid;
begin
  new.voter_id := auth.uid();
  if new.voter_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- message_id is the poll, resolved from the option — never trusted from the
  -- client, so a caller cannot point a vote at a different poll than the option.
  select po.message_id, pl.allow_multiple into msg, multi
    from poll_options po join polls pl on pl.message_id = po.message_id
   where po.id = new.option_id;
  if msg is null then
    raise exception 'no such poll option' using errcode = 'P0002';
  end if;
  new.message_id := msg;
  -- single-choice: this vote replaces any I already cast in the same poll.
  if not multi then
    delete from poll_votes v where v.message_id = msg and v.voter_id = new.voter_id;
  end if;
  return new;
end;
$function$;
revoke all on function private.poll_vote_before_insert() from public, anon;

drop trigger if exists poll_vote_before_insert on public.poll_votes;
create trigger poll_vote_before_insert
  before insert on public.poll_votes
  for each row execute function private.poll_vote_before_insert();

-- ── create_poll: message + poll + options, atomically ───────────────────────
-- _channel is 'squad' or 'staff' (ignored when _conversation is set — a DM/group
-- poll passes _conversation and the trigger forces channel='dm'). Mirrors the
-- three client post paths: squad/club (team_id, maybe null), staff (team_id),
-- dm/group (conversation_id).
create or replace function public.create_poll(
  _team uuid, _channel text, _conversation uuid, _event uuid,
  _question text, _options text[], _allow_multiple boolean)
returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  me    uuid := auth.uid();
  club  uuid;
  ok    boolean;
  clean text[];
  msg   uuid;
  opt   text;
  i     int := 0;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if _question is null or length(btrim(_question)) not between 1 and 2000 then
    raise exception 'a poll needs a question' using errcode = '23514';
  end if;
  -- drop blank options, keep order, cap the length; 2..12 must remain.
  select array_agg(btrim(o) order by ord) into clean
    from unnest(coalesce(_options, '{}'::text[])) with ordinality as t(o, ord)
   where length(btrim(o)) between 1 and 100;
  if coalesce(array_length(clean, 1), 0) < 2 then
    raise exception 'a poll needs at least two options' using errcode = '23514';
  end if;
  if array_length(clean, 1) > 12 then
    raise exception 'a poll has at most twelve options' using errcode = '23514';
  end if;

  select mm.club_id into club from memberships mm
   where mm.profile_id = me and mm.status = 'active' order by mm.created_at limit 1;
  if club is null then raise exception 'not a club member' using errcode = '42501'; end if;

  -- May the caller post a top-level message to this target? Mirrors the
  -- "message create" RLS policy (parent_id-null arms), which a definer insert
  -- would otherwise skip.
  ok := case
    when _conversation is not null then private.in_conversation(_conversation)
    when _channel = 'staff'        then private.can_edit_team(_team)
    when _team is null             then private.is_admin(club)
    else private.can_edit_team(_team)
      or (not private.channel_announce_only(_team) and private.can_see_team(_team))
      or (_event is not null and private.can_see_team(_team))
  end;
  if not ok then
    raise exception 'you cannot post here' using errcode = '42501';
  end if;

  -- The message. The set_message_provenance trigger fills author/club/role and
  -- forces channel='dm' when _conversation is set.
  insert into messages (team_id, channel, conversation_id, event_id, body)
  values (
    case when _conversation is not null then null else _team end,
    case when _conversation is not null then 'dm'
         when _channel = 'staff'        then 'staff'
         else 'squad' end,
    _conversation,
    case when _conversation is not null then null else _event end,
    btrim(_question))
  returning id into msg;

  insert into polls (message_id, allow_multiple) values (msg, coalesce(_allow_multiple, false));
  foreach opt in array clean loop
    insert into poll_options (message_id, position, label) values (msg, i, opt);
    i := i + 1;
  end loop;

  return msg;
end;
$function$;
revoke all on function public.create_poll(uuid, text, uuid, uuid, text, text[], boolean) from public, anon;
grant execute on function public.create_poll(uuid, text, uuid, uuid, text, text[], boolean) to authenticated;

commit;
