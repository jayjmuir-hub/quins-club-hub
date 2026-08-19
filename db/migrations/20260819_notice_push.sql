-- 19 Aug 2026 — a push notification when a notice is posted, and the per-
-- category opt-out the other three categories will reuse.
--
-- Jay, 19 Aug 2026: "we need more notification categories not just the help
-- tickets", then "do the notices notifications next".
-- claude/plans/2026-08-19-notifications-v2.md.
--
-- ══ ⚠️ THE ONE INVARIANT THIS FILE EXISTS TO KEEP ════════════════════════
--
--     NEVER NOTIFY ANYBODY WHO COULD NOT READ THE NOTICE.
--
-- A notification carries the notice's TITLE in the OS tray, on a locked
-- screen, to somebody who may not be allowed to see it. Under-notifying is a
-- product decision. Over-notifying is a disclosure. They are not symmetrical
-- and this file is written around that asymmetry.
--
-- ══ WHO GETS ONE — AND IT IS DELIBERATELY NARROWER THAN WHO MAY READ ═════
--
-- `announcement read` is:
--
--     case when team_id is null
--          then <an active membership in the club>
--          else private.can_see_team(team_id)
--     end
--
-- and `can_see_team` admits **any club admin, for every squad**. Sending on
-- that basis is safe but miserable: measured 19 Aug 2026, it is 126
-- (squad, member) pairs against 51 — **5 people would be buzzed for every
-- notice any coach posts for any squad in the club.** Jay chose squad-only.
--
-- ⚠️ SO THERE ARE NOW TWO RULES WHERE THERE WAS ONE, AND THE SECOND CAN DRIFT.
-- That is the real cost of this decision and it is not hypothetical — it is
-- how the audience quietly becomes wrong after somebody edits `can_see_team`.
-- The defence is `db/tests/notice-push.sql`, which asserts the
-- SUBSET relationship against live data rather than the exact set: everyone we
-- would notify must be somebody `can_see_team` admits. Measured before this
-- file was written: **0 violations across every team and every active member.**
--
-- ⛔ **THE AUTHOR IS NOT NOTIFIED OF THEIR OWN NOTICE.** Obvious, easy to
-- forget, and impossible to un-send.
--
-- ⚠️ **A TRAP FOUND WHILE VERIFYING THIS, AND IT MADE THE FIRST TEST LIE.**
-- `private.touch_announcement` (BEFORE UPDATE) pins `author_id`, `club_id`,
-- `team_id` and `created_at` back to their OLD values on every update — a
-- deliberate immutability guard. So a test that creates a notice and then
-- UPDATES the author to check "the author is not notified" changes nothing,
-- and the assertion passes or fails for reasons that have nothing to do with
-- the code. **The author case has to be a second INSERT, made as that person.**
-- The first run of this verification reported the author exclusion broken; it
-- was the test that was broken. `db/tests/notice-push.sql` inserts twice.
--
-- ⛔ **AN ALREADY-EXPIRED NOTICE SENDS NOTHING.** `expires_at` is in the past
-- means it is not on the board, and a notification for something nobody can
-- then find is worse than silence.
--
-- ⛔ **INSERT ONLY, NOT UPDATE.** Editing a typo in a notice must not buzz the
-- squad a second time. `announcement edit` exists precisely so people fix
-- things; re-notifying would teach them not to.

-- ══ 1. THE OPT-OUT TABLE ═════════════════════════════════════════════════
--
-- ⚠️ A ROW MEANS **OFF**. NO ROW MEANS ON. This is what makes "categories
-- default to on" true rather than merely intended:
--
--   * no backfill, ever — every member today, and everyone who joins next
--     season, is opted in with no migration and no row;
--   * the default lives in ONE place (the absence of a row) rather than in a
--     column default AND an application constant AND a backfill script, which
--     is three places to disagree.
--
-- ⚠️ THE ARGUMENT AGAINST, WHICH IS REAL. A full preferences row per person
-- per category is more discoverable — "who wants notice alerts" is then a
-- query rather than an absence joined against the membership list. Rejected
-- because the discoverability is worth less than never backfilling a default
-- across a growing club. **Revisit if an admin screen ever has to SHOW
-- everyone's preferences**; that is the one thing this shape makes awkward.

create table if not exists public.notification_opt_outs (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- ⚠️ CONSTRAINED ON PURPOSE, AND THE FAILURE IT PREVENTS IS SILENT. A
  -- typo'd category is a row that opts you out of nothing: you keep getting
  -- the notifications, the UI shows the switch as off, and nothing anywhere
  -- reports a problem. Adding a category is then a deliberate one-line change
  -- to this constraint, which is the right amount of friction.
  category   text not null check (category in ('feedback_reply', 'notice')),
  created_at timestamptz not null default now(),
  primary key (profile_id, category)
);

alter table public.notification_opt_outs enable row level security;

-- ⚠️ OWNER-ONLY, THE SAME SHAPE AS push_subscriptions. Nobody needs to read
-- anybody else's preferences — not even an admin. An admin who could see them
-- would eventually be asked to change them.
create policy "opt out is mine" on public.notification_opt_outs
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ⚠️ NO UPDATE GRANT, DELIBERATELY. The row carries no editable state — it
-- exists or it does not — so UPDATE would only ever be a way to move somebody
-- else's opt-out onto your own id, or vice versa.
grant select, insert, delete on public.notification_opt_outs to authenticated;
revoke all on public.notification_opt_outs from anon;

-- ⚠️ NOT GRANTED TRUNCATE, AND THAT NOW HAPPENS BY ITSELF. Until 19 Aug 2026
-- every new table arrived with TRUNCATE for `authenticated` via Supabase's
-- default privileges; 20260819_revoke_truncate_from_authenticated.sql altered
-- that default. **This table is the first one created since, so it is also the
-- proof that the change works on a real new table** — asserted in
-- db/tests/truncate-grants.sql, which walks every table.


-- ══ 2. WHO A NOTICE GOES TO ══════════════════════════════════════════════
--
-- ⚠️ THE AUDIENCE LIVES IN THE DATABASE, NOT IN THE EDGE FUNCTION. The edge
-- function asks one question and gets rows back. Splitting this rule across
-- SQL and TypeScript would put half of a disclosure-sensitive decision in a
-- file that deploys separately from the other half — which this project has
-- already been bitten by once today, when push-send and push-sw.js each held
-- half of a fix and neither worked alone.

create or replace function private.notice_audience(_club uuid, _team uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  -- A club-wide notice (_team is null) goes to every active member.
  -- A squad notice goes to the people attached to that squad — and NOT to
  -- admins of other squads, which is where this deliberately stops short of
  -- `can_see_team`. See the header.
  select distinct m.profile_id
    from memberships m
   where m.status = 'active'
     and m.club_id = _club
     and (_team is null or m.team_id = _team);
$function$;


-- ══ 3. THE SUBSCRIPTIONS TO ACTUALLY SEND TO ═════════════════════════════
--
-- One call, returning rows the edge function can send to directly. `public`
-- rather than `private` only because PostgREST cannot reach the `private`
-- schema; the grants below are what make it not-public in any real sense.

create or replace function public.notice_push_subscriptions(_announcement uuid)
 returns table (id uuid, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from announcements a
    cross join lateral private.notice_audience(a.club_id, a.team_id) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where a.id = _announcement
     and aud.profile_id <> a.author_id
     and (a.expires_at is null or a.expires_at > now())
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = aud.profile_id
          and o.category = 'notice');
$function$;

-- ⚠️ SERVICE ROLE ALONE. This returns other people's push endpoints — the
-- exact strings needed to send a notification to their phone. `revoke from
-- public` does NOT remove the named grants Supabase's default privileges hand
-- to anon and authenticated, which is the lesson 20260813_revoke_anon_execute
-- paid for: both routes have to be named.
revoke all on function public.notice_push_subscriptions(uuid) from public;
revoke all on function public.notice_push_subscriptions(uuid) from anon;
revoke all on function public.notice_push_subscriptions(uuid) from authenticated;
grant execute on function public.notice_push_subscriptions(uuid) to service_role;


-- ══ 4. THE TRIGGER ═══════════════════════════════════════════════════════
--
-- Same shape as private.notify_feedback_reply_push, and reusing the SAME two
-- vault secrets — `push_notify_url` and `approval_notify_secret`. A second URL
-- secret pointing at the same function would be a second thing to rotate.

create or replace function private.notify_notice_push()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
begin
  -- Nothing to announce if it is already off the board.
  if new.expires_at is not null and new.expires_at <= now() then
    return new;
  end if;

  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_notice_push: vault secrets missing, no push sent for notice %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('announcement_id', new.id)
  );

  return new;
-- ⚠️ SWALLOWS ITS OWN FAILURE, LIKE THE FEEDBACK ONE. A push that cannot be
-- sent must never stop the notice being POSTED. The noticeboard is the
-- feature; the notification is the accelerant.
exception when others then
  raise warning 'notify_notice_push: % (notice %)', sqlerrm, new.id;
  return new;
end;
$function$;

drop trigger if exists notice_push on public.announcements;
create trigger notice_push
  after insert on public.announcements
  for each row execute function private.notify_notice_push();


-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--
--   npm run db:check -- notice-push
--
-- and the assertion that matters, which is about disclosure rather than
-- delivery — every (team, person) pair we would notify must be one that
-- `can_see_team` admits. Expected 0. Measured 0 before this file was written,
-- across every team and every active member.
