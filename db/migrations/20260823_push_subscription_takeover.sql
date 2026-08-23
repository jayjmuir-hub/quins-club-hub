-- public.register_push_subscription — a device endpoint belongs to whoever is
-- signed in on it NOW.
--
-- Found 23 Aug 2026, live, on the first shared phone: Jay signed out, his
-- wife signed in on the same iPhone, tapped "Turn on notifications", and got
--
--     new row violates row-level security policy (USING expression)
--     for table "push_subscriptions"
--
-- 20260818_push_notifications.sql predicted this case in its header ("a
-- family tablet, say") and called fixing it future work. This is that work.
-- The mechanism: the browser's push subscription for this origin is ONE
-- `endpoint` regardless of who is signed in. The client upserts on
-- `endpoint`, so the second person's insert becomes an UPDATE of the first
-- person's row, and the owner-only policy's USING arm refuses it. (The
-- header guessed a duplicate-key error; the upsert's ON CONFLICT arm is
-- reached first, so it is the RLS error that surfaces.)
--
-- ⚠️ THIS IS ALSO A PRIVACY BUG, NOT ONLY A USABILITY ONE. Had the second
-- person got past the error by any other route, the phone's row would still
-- have named the FIRST person — and every push meant for them would keep
-- landing on a phone somebody else is now signed into. The right rule is the
-- one this function enforces: the endpoint moves to the caller, and the
-- previous owner's claim on that device ends.
--
-- WHY A SECURITY DEFINER FUNCTION AND NOT A POLICY CHANGE
--
-- A policy that let a caller UPDATE somebody else's row "when the endpoint
-- matches" would let anybody who LEARNED an endpoint string hijack that
-- device's notifications. The endpoint is a capability — it is precisely the
-- thing `push subscription own` exists to keep private — so the takeover has
-- to happen inside a function whose only input is the caller's own
-- browser-issued endpoint, and which never reveals whether a row existed.
--
-- What it does, in one statement each: delete any row for this endpoint
-- (whoever owns it), insert one for auth.uid(). Returns nothing. A signed-out
-- caller is refused at the first line.
--
-- Harness: db/tests/push-subscription-takeover.sql.

begin;

create or replace function public.register_push_subscription(
  _endpoint text,
  _p256dh   text,
  _auth     text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  _me uuid := auth.uid();
begin
  if _me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if _endpoint is null or btrim(_endpoint) = '' then
    raise exception 'endpoint required' using errcode = '22023';
  end if;

  -- The takeover. Whoever held this device before no longer does.
  delete from public.push_subscriptions where endpoint = _endpoint;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (_me, _endpoint, _p256dh, _auth);
end;
$function$;

-- Same grant shape as the other member-callable RPCs: authenticated only.
-- ⚠️ The explicit `revoke … from anon` matters — Supabase's default privileges
-- grant EXECUTE to anon on every new function, and `revoke from public` does
-- not remove that explicit grant (claude/open-items.md, register_my_player).
revoke all on function public.register_push_subscription(text, text, text) from public;
revoke all on function public.register_push_subscription(text, text, text) from anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

commit;
