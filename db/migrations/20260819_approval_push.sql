-- 19 Aug 2026 — a push notification when somebody is waiting to be approved.
--
-- The fourth notification category, and the last cheap one. Design:
-- claude/plans/2026-08-19-notifications-v2.md.
--
-- ══ THIS DUPLICATES AN AUDIENCE THAT ALREADY EXISTS, AND THAT IS THE RISK ══
--
-- An EMAIL already goes out on exactly this event —
-- supabase/functions/notify-approval/index.ts, via
-- private.notify_pending_membership. Its recipient rule was narrowed on
-- 18 Aug 2026 (Jay: "we don't need to email every single admin every time or
-- all the coaches in an age group") to:
--
--     SUPER admins of the club, PLUS the head coach and team manager(s)
--     of THAT squad — all active.
--
-- ⚠️ THE RULE IS NOW WRITTEN TWICE: once in TypeScript for the email, once in
-- SQL below for the push. That is a genuine cost and it is not hidden here.
-- The alternative — have notify-approval call this SQL function too — is the
-- right long-term shape and was NOT done now, because it means editing the
-- live email path in order to ship a notification, and the email is the
-- backstop that makes everything else safe to get wrong. **If you touch
-- either rule, change both in the same commit.** db/tests/approval-push.sql
-- restates the rule a third time, independently, and asserts the SQL agrees
-- with it — so a drift in THIS file is caught, even though a drift in the
-- TypeScript is not.
--
-- ⚠️ NOT private.can_approve_team, DELIBERATELY, and it is the same
-- distinction the email makes: authority is one question, being TOLD is
-- another. Everyone who could approve before still can. They are simply not
-- all buzzed. An assistant coach keeps the power and loses the interruption.
--
-- ⛔ THE REQUESTER IS NEVER NOTIFIED OF THEIR OWN REQUEST. A super admin who
-- registers their own child is in the audience by every rule above, and would
-- otherwise buzz their own phone about a request they had just made.
--
-- ⛔ NOTHING IS SENT IF IT IS NO LONGER PENDING. pg_net is asynchronous, so an
-- admin who approves within a few seconds would otherwise be told about a
-- queue that is already empty. The email function guards this the same way
-- ("no longer pending"); here it is a where-clause, so it holds however the
-- function is called rather than only on the one path that remembered.
--
-- ⛔ INSERT ONLY, NOT UPDATE. A pending row that is edited — a corrected role,
-- a squad moved — must not re-buzz. Same reasoning as the notice trigger.
--
-- ⚠️ THE SUPER ADMINS ARE THE FLOOR, and that is what makes the narrowing
-- safe. A squad with no head coach and no manager still reaches them, so a
-- request is never lost; the squad simply is not told. A membership with NO
-- team at all (team_id is null) therefore still notifies the super admins
-- rather than nobody.


-- ══ 1. THE CATEGORY ══════════════════════════════════════════════════════
--
-- ⚠️ THE KEY MUST MATCH src/data/notificationPreferences.js. A category the
-- constraint rejects fails SILENTLY in the worst way: the insert is refused,
-- the switch appears to move, and the notifications keep arriving.
--
-- ⚠️ THE ARGUMENT AGAINST MAKING THIS OPT-OUTABLE AT ALL, WHICH IS REAL.
-- The other three categories are things you might not want to hear. This one
-- is a job to do: an admin who switches it off stops seeing that people are
-- waiting, and the symptom is a registration queue that quietly grows. It is
-- opt-outable anyway because (a) the EMAIL is unconditional and remains the
-- backstop — switching this off loses the buzz, not the alert — and (b) a
-- category that cannot be switched off is the reason people switch
-- notifications off ENTIRELY at the OS level, which loses everything.

alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply', 'notice', 'fixture', 'approval'));


-- ══ 2. WHO IS TOLD ═══════════════════════════════════════════════════════
--
-- ⚠️ THE AUDIENCE LIVES IN THE DATABASE, NOT IN THE EDGE FUNCTION — the same
-- ruling as notice_audience, for the same reason. Who may be told that a
-- named person is waiting to join a named squad is a disclosure rule, and it
-- belongs beside the data rather than in a file that deploys separately.

create or replace function private.approval_audience(_club uuid, _team uuid, _requester uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select distinct m.profile_id
    from memberships m
   where m.status = 'active'
     -- ⛔ Never the person who asked. See the header.
     and m.profile_id is distinct from _requester
     and (
       -- Super admins of the club — the floor, always.
       (m.club_id = _club and m.is_super)
       -- ...plus the people actually running that squad.
       --
       -- ⚠️ HEAD COACH IS A COLUMN, NOT A TITLE MATCH. `title` is free text
       -- and already holds 'Assistant Coach/Medic' on production; matching
       -- '%head coach%' would drop a recipient the first time somebody typed
       -- 'HC'. memberships_one_head_coach_per_team means this cannot fan out.
       -- ⚠️ MANAGERS BY ROLE, not by title, and there may be more than one.
       -- ⚠️ NOT medic: a medic cannot approve, so telling them to would be an
       -- instruction they cannot follow.
       or (_team is not null and m.team_id = _team
           and (m.is_head_coach or m.role = 'manager'))
     );
$function$;


-- ══ 3. THE SUBSCRIPTIONS TO SEND TO ══════════════════════════════════════
--
-- `public` rather than `private` only because PostgREST cannot reach the
-- `private` schema; the grants below are what make it not-public in any real
-- sense.

create or replace function public.approval_push_subscriptions(_membership uuid)
 returns table (id uuid, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from memberships req
    cross join lateral
      private.approval_audience(req.club_id, req.team_id, req.profile_id) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where req.id = _membership
     -- ⛔ Already actioned means there is nothing to tell anybody. See header.
     and req.status = 'pending'
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = aud.profile_id
          and o.category = 'approval');
$function$;

-- ⚠️ SERVICE ROLE ALONE. This returns other people's push endpoints — the
-- exact strings needed to send a notification to their phone. `revoke from
-- public` does NOT remove the named grants Supabase's default privileges hand
-- to anon and authenticated: both routes have to be named. That is the lesson
-- 20260813_revoke_anon_execute paid for.
revoke all on function public.approval_push_subscriptions(uuid) from public;
revoke all on function public.approval_push_subscriptions(uuid) from anon;
revoke all on function public.approval_push_subscriptions(uuid) from authenticated;
grant execute on function public.approval_push_subscriptions(uuid) to service_role;


-- ══ 4. THE TRIGGER ═══════════════════════════════════════════════════════
--
-- ⚠️ A SECOND TRIGGER, NOT AN EDIT TO notify_pending_membership. The email
-- path is the backstop for the whole approval flow and it is left untouched:
-- a push that throws must not be able to stop an email that works. The two
-- fire independently on the same event, and reuse the SAME two vault secrets
-- — a second URL secret pointing at the same function would only be another
-- thing to rotate.

create or replace function private.notify_pending_membership_push()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_pending_membership_push: vault secrets missing, no push sent for membership %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('approval_membership_id', new.id)
  );

  return new;
-- ⚠️ SWALLOWS ITS OWN FAILURE. A push that cannot be sent must never stop
-- somebody REGISTERING. The registration is the feature; the notification is
-- the accelerant.
exception when others then
  raise warning 'notify_pending_membership_push: % (membership %)', sqlerrm, new.id;
  return new;
end;
$function$;

drop trigger if exists pending_membership_push on public.memberships;
create trigger pending_membership_push
  after insert on public.memberships
  for each row when (new.status = 'pending')
  execute function private.notify_pending_membership_push();


-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--
--   npm run db:check -- approval-push
--
-- The assertion that matters is disclosure, not delivery: nobody outside the
-- super admins and that squad's head coach and manager(s) may be told that a
-- named person is waiting to join a named squad.
