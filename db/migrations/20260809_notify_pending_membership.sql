-- Email coaches, team managers and admins the moment somebody registers a
-- player and lands in the approval queue (Jay, 9 Aug 2026: "need emails
-- alerting them and admins of approvals waiting" — immediate, not a digest).
--
-- Apply as migration `20260809xxxxxx notify_pending_membership`.
-- The endpoint it calls is supabase/functions/notify-approval/index.ts.
--
-- ══ PREREQUISITES, ALL THREE, OR NOTHING IS SENT ════════════════════════
--   1. `create extension pg_net with schema extensions;`  (done separately —
--      an extension is not something to bury in a feature migration)
--   2. two Vault secrets, created once and NOT in this file because a secret
--      in a committed migration is a published secret:
--          approval_notify_url     the function's https URL
--          approval_notify_secret  a random 32-byte hex string
--   3. the SAME value as APPROVAL_NOTIFY_SECRET in the Edge Function's
--      environment (Supabase dashboard → Edge Functions → Secrets). ⚠️ THERE
--      IS NO MCP TOOL FOR THIS — it is a hand step, and until it is done the
--      function answers 503 "not configured" and no email is sent. That is the
--      intended failure: it fails CLOSED rather than becoming an open relay.
--
-- ══ WHY THE APP DOESN'T JUST CALL THE FUNCTION ══════════════════════════
-- Registration is public.register_my_player, reachable by any signed-in
-- stranger with a confirmed email. A notification fired by the CLIENT is one
-- the client can skip — not a security hole, but it makes "the club is always
-- told" depend on a browser finishing a second request. The trigger is on the
-- row, so it cannot be skipped.
--
-- ══ ⚠️ IT MUST NEVER FAIL A REGISTRATION ════════════════════════════════
-- Three separate layers of that, and all three are deliberate:
--   * net.http_post QUEUES the request and returns immediately. It does not
--     wait for a response, so a dead endpoint costs nothing.
--   * the vault lookup WARNS and returns rather than raising if a secret is
--     missing.
--   * the whole body is wrapped in `exception when others` → warn → return new.
-- A parent's registration succeeding is worth more than an email. The SCREEN
-- is the source of truth; the email is a prompt to go and look at it.

begin;

create or replace function private.notify_pending_membership()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
begin
  -- ⚠️ READ FROM VAULT, NEVER HARDCODED. This file is committed to a PUBLIC
  -- repository. A shared secret written here is a shared secret published.
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'approval_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_pending_membership: vault secrets missing, no email sent for membership %', new.id;
    return new;
  end if;

  -- ⚠️ THE BODY CARRIES AN ID AND NOTHING ELSE. Every name, address and squad
  -- in the email is read back inside the function with the service role. A
  -- body carrying "send this text to these addresses" would make the endpoint
  -- an open relay wearing a shared secret.
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('membership_id', new.id)
  );

  return new;
exception when others then
  -- Belt to the braces above. Nothing about sending an email is worth losing
  -- a registration over.
  raise warning 'notify_pending_membership: % (membership %)', sqlerrm, new.id;
  return new;
end;
$function$;

-- ⚠️ `when (new.status = 'pending')`, NOT every insert. claim_roster_access
-- inserts ACTIVE rows (a roster email match IS the verification), and an admin
-- granting access inserts active rows too. Neither is waiting for anybody, and
-- emailing four volunteers about work that does not exist is how a
-- notification becomes something people filter out.
drop trigger if exists notify_pending_membership on public.memberships;
create trigger notify_pending_membership
  after insert on public.memberships
  for each row
  when (new.status = 'pending')
  execute function private.notify_pending_membership();

-- ── THE GUARD ──────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'memberships' and t.tgname = 'notify_pending_membership'
     and not t.tgisinternal;
  if n <> 1 then
    raise exception 'ABORTING: expected exactly one notify trigger, found %.', n;
  end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'ABORTING: pg_net is not installed, so the trigger would warn on every registration.';
  end if;
  raise notice 'guard passed: trigger installed and pg_net present';
end $$;

commit;

-- ── VERIFY (run it; do not assume) ─────────────────────────────────────
-- Inside a transaction that ROLLS BACK — pg_net queues into a table, so the
-- rollback un-queues the request and no mail is ever sent:
--
--   begin;
--   create temp table steps (step text, detail text);
--   insert into steps values ('queue before', (select count(*)::text from net.http_request_queue));
--   -- ...insert an auth.users row, a player, and a PENDING membership...
--   insert into steps values ('after a PENDING insert', (select count(*)::text from net.http_request_queue));
--   insert into steps select 'secret matches vault',
--     ((headers->>'x-approval-secret') = (select decrypted_secret from vault.decrypted_secrets
--        where name='approval_notify_secret'))::text
--     from net.http_request_queue order by id desc limit 1;
--   -- ...insert an ACTIVE membership...
--   insert into steps values ('after an ACTIVE insert (must not grow)', (select count(*)::text from net.http_request_queue));
--   select * from steps;
--   rollback;
--
-- Verified 9 Aug 2026: 0 → 1 on the pending insert, still 1 after the active
-- one, url correct, secret header present and equal to the vault value.
--
-- And the endpoint itself, with plain curl (no JWT — proving verify_jwt is
-- genuinely off, which is the setting the MCP deploy tool silently defaults
-- back to true):
--   no secret header  -> 503 "not configured"   (before the env var is set)
--   wrong secret      -> 401 "unauthorised"     (after it is set)
