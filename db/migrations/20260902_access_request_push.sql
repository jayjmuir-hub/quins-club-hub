-- 2 Sep 2026 — a push notification when somebody with NO membership asks for
-- access. Jay: "add a push for plain access requests".
--
-- ══ THE GAP THIS CLOSES ══════════════════════════════════════════════════
-- Two things put a person in the Admin badge's count (countAdminWaiting):
--   * a PENDING MEMBERSHIP — a parent registering a child, a coach claiming a
--     squad. 20260819_approval_push.sql buzzes the super admins and that
--     squad's head coach and managers, and notify-approval emails them.
--   * a PLAIN ACCESS REQUEST — an account that signed in and asked to join,
--     with no squad and no child yet (public.access_requests). Until now this
--     only EMAILED the super admins (20260812_access_request_notify.sql), so
--     the badge moved (since 5216d85, live) and no phone did.
-- The second is the one an admin is least likely to be looking at, because
-- nothing else about that person exists in the app yet.
--
-- ══ WHO IS TOLD — THE SAME RULE AS THE EMAIL, HELD IN SQL ═══════════════
-- SUPER admins of the club, active, never the requester. This is exactly
-- notify-access-request's recipient rule (Jay, 18 Aug 2026: "we don't need to
-- email every single admin every time"), and like the approval rule it is now
-- written twice — TypeScript for the email, SQL here for the push. **If you
-- touch either, change both in the same commit.** db/tests/access-request-push.sql
-- restates it a third time and asserts the SQL agrees.
--
-- ⚠️ NO SQUAD HALF, unlike approval_audience. An access request has no
-- team_id to narrow by — requested_team_id is what the person ASKED for,
-- which is a claim, not a membership — so there is no head coach or manager
-- to add. The single-club assumption does the work of "the club", as it does
-- in the email and in is_admin_anywhere().
--
-- ⚠️ THE SAME CATEGORY AS APPROVALS, `approval`, NOT A NEW ONE. To an admin
-- both are "somebody is waiting for me"; a second switch would ask them to
-- distinguish two things the Accounts screen shows in one list. The
-- notification_opt_outs CHECK is therefore untouched, and so is
-- src/data/notificationPreferences.js.
--
-- ⛔ THE REQUESTER IS NEVER NOTIFIED OF THEIR OWN REQUEST.
-- ⛔ NOTHING IS SENT IF IT IS NO LONGER PENDING — a where-clause, so it holds
--    however the function is called.
-- ⛔ INSERT ONLY, NOT UPDATE. A dismissal is an admin telling themselves
--    something they just did.


-- ══ 1. WHO IS TOLD ═══════════════════════════════════════════════════════

create or replace function private.access_request_audience(_requester uuid)
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select distinct m.profile_id
    from memberships m
   where m.status = 'active'
     and m.is_super
     -- ⛔ Never the person who asked.
     and m.profile_id is distinct from _requester;
$function$;

revoke all on function private.access_request_audience(uuid) from public, anon, authenticated;


-- ══ 2. THE SUBSCRIPTIONS TO SEND TO ══════════════════════════════════════
-- `public` only because PostgREST cannot reach `private`; the grants below
-- are what make it not-public in any real sense.

create or replace function public.access_request_push_subscriptions(_request uuid)
 returns table (id uuid, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select s.id, s.endpoint, s.p256dh, s.auth
    from access_requests req
    cross join lateral
      private.access_request_audience(req.profile_id) as aud(profile_id)
    join push_subscriptions s on s.profile_id = aud.profile_id
   where req.id = _request
     -- ⛔ Already dismissed means there is nothing to tell anybody.
     and req.status = 'pending'
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = aud.profile_id
          and o.category = 'approval');
$function$;

-- ⚠️ SERVICE ROLE ALONE — this returns other people's push endpoints. Both
-- the public revoke AND the named roles, the lesson 20260813_revoke_anon_execute
-- paid for.
revoke all on function public.access_request_push_subscriptions(uuid) from public;
revoke all on function public.access_request_push_subscriptions(uuid) from anon;
revoke all on function public.access_request_push_subscriptions(uuid) from authenticated;
grant execute on function public.access_request_push_subscriptions(uuid) to service_role;


-- ══ 3. THE TRIGGER ═══════════════════════════════════════════════════════
-- A SECOND trigger beside notify_access_request_asked (the email), not an
-- edit to it: a push that throws must not be able to stop an email that
-- works. Same two vault secrets as every other push — push_notify_url is the
-- push-send endpoint, approval_notify_secret the shared gate.

create or replace function private.notify_access_request_push()
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
    raise warning 'notify_access_request_push: vault secrets missing, no push sent for request %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('access_request_id', new.id)
  );

  return new;
-- ⚠️ SWALLOWS ITS OWN FAILURE. A push that cannot be sent must never stop
-- somebody ASKING. The request is the record; this is the prompt.
exception when others then
  raise warning 'notify_access_request_push: % (request %)', sqlerrm, new.id;
  return new;
end;
$function$;

revoke all on function private.notify_access_request_push() from public, anon, authenticated;

drop trigger if exists access_request_push on public.access_requests;
create trigger access_request_push
  after insert on public.access_requests
  for each row when (new.status = 'pending')
  execute function private.notify_access_request_push();


-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--   npm run db:check -- access-request-push
-- Then the real thing: sign in with a fresh account, ask for access, and
-- watch a super admin's phone. supabase/functions/push-send must be deployed
-- with the matching `access_request_id` branch first, or the post lands as
-- 'bad request' in net._http_response and nothing arrives.
