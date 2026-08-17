-- Email an invitee the moment an invite is created.
--
-- Jay, 16 Aug 2026: "there should be an invite button that the coaches,
-- managers, and admin can click to send that person an email invitation", and
-- 17 Aug settling the three open questions: yes, the sender is NAMED, and it
-- fires for EVERY invite.
--
-- The endpoint is supabase/functions/notify-invite/index.ts. Read its header
-- before changing anything here — the safety argument lives there.
--
-- ══ PREREQUISITES ════════════════════════════════════════════════════════
--   1. pg_net (already installed — checked by the guard below).
--   2. ONE new Vault secret: `invite_notify_url`, the function's https URL.
--      ⚠️ A FUNCTION URL IS NOT A SECRET. It lives in vault only so this trigger
--      reads it the same way the other four do.
--   3. `approval_notify_secret`, WHICH ALREADY EXISTS. This function reuses it
--      rather than minting a fourth — one secret to rotate, and rotating three
--      of four is the failure that leaves exactly one endpoint open.
--      ⚠️ THE EDGE FUNCTION ENV VAR IS PROJECT-WIDE ON SUPABASE, so
--      APPROVAL_NOTIFY_SECRET is already set for any new function. There is no
--      dashboard step for this one, unlike the 9 Aug migration that established
--      the pattern.
--
-- ══ ⚠️ WHAT MAKES THIS ONE DIFFERENT FROM THE OTHER THREE NOTIFIERS ══════
--
-- They tell a GROUP of volunteers that work is waiting. This mails ONE person
-- and the message contains `invites.token`, which IS the authentication: anybody
-- holding it can accept and become a member. So the endpoint mails exactly the
-- address on the row, and the body carries an id and nothing else.
--
-- ══ ⚠️ EVERY INVITE, INCLUDING THE ADMIN FORM'S ═════════════════════════
--
-- No WHEN clause narrowing this to invite_parent's rows. A rule about WHICH
-- invites get emailed would be a second rule free to disagree with the first,
-- and the admin form has always made an admin copy a link out by hand — which
-- this fixes rather than preserves.
--
-- ⚠️ IT DOES NOT DOUBLE-SEND ON A REPEATED PRESS. public.invite_parent is
-- idempotent: a second press returns the invite already outstanding WITHOUT
-- inserting, so no second row and no second email. That is a property of that
-- function, not of this trigger — if a future caller starts inserting duplicate
-- invites, this will mail every one of them.
--
-- ══ ⚠️ IT MUST NEVER FAIL AN INVITE ═════════════════════════════════════
-- Three layers, all deliberate, exactly as notify_pending_membership:
--   * net.http_post QUEUES and returns immediately;
--   * a missing vault secret WARNS and returns;
--   * the whole body is wrapped in `exception when others` -> warn -> return.
-- The invite still exists and the screen still shows its accept link, so a dead
-- mail path costs convenience rather than access.

begin;

create or replace function private.notify_invite()
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
  -- repository.
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'invite_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_invite: vault secrets missing, no email sent for invite %', new.id;
    return new;
  end if;

  -- ⚠️ AN ID AND NOTHING ELSE. Every value in the email — the address it goes
  -- to most of all — is read back inside the function with the service role. A
  -- body carrying its own recipient would make an endpoint that mails a valid
  -- credential into an open relay.
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('invite_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_invite: % (invite %)', sqlerrm, new.id;
  return new;
end;
$function$;

-- ⚠️ NO `when` CLAUSE, DELIBERATELY — see the header. Every invite is emailed.
--
-- ⚠️ AND IT FIRES ON INSERT ONLY. An UPDATE trigger would re-send when
-- accept_invite stamps `accepted_at`, mailing "set up your account" to somebody
-- who just did.
drop trigger if exists notify_invite on public.invites;
create trigger notify_invite
  after insert on public.invites
  for each row
  execute function private.notify_invite();

-- ── THE GUARD ──────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'invites' and t.tgname = 'notify_invite' and not t.tgisinternal;
  if n <> 1 then
    raise exception 'ABORTING: expected exactly one notify_invite trigger, found %.', n;
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception 'ABORTING: pg_net is not installed, so the trigger would warn on every invite.';
  end if;

  -- ⚠️ THE SHARED SECRET MUST ALREADY BE THERE. If it is not, this trigger is a
  -- no-op that warns on every invite and nobody notices for a week.
  if not exists (select 1 from vault.secrets where name = 'approval_notify_secret') then
    raise exception 'ABORTING: approval_notify_secret is missing from vault.';
  end if;

  raise notice 'guard passed: trigger installed, pg_net present, shared secret exists';
end $$;

commit;

-- ── VERIFIED ON PRODUCTION, 17 Aug 2026 ────────────────────────────────
--
-- ⚠️ `net.http_request_queue.body` IS `bytea`, NOT `jsonb`. Selecting it raw
-- prints a hex blob, and casting it straight to jsonb fails with "invalid input
-- syntax for type json … Token \ is invalid" — which reads like a malformed body
-- and is nothing of the kind. `convert_from(body, 'utf8')::jsonb` is the answer.
-- ⚠️ The VERIFY block in 20260809_notify_pending_membership.sql selects `body`
-- plainly and would show the same hex; it is not wrong, but it cannot show what
-- it looks like it shows.
--
-- Inside a transaction that ROLLED BACK — pg_net queues into a table, so the
-- rollback un-queues the request and no mail was ever sent:
--
--   queue                      0 -> 1     (the trigger fired)
--   url                        …/functions/v1/notify-invite
--   invite_id matches the row  true
--   body is ONLY the id        true       ⚠️ the open-relay guard
--   secret matches vault       true
--
-- Then re-read after the rollback: 0 queued requests, 0 test invites, trigger
-- still installed. ⚠️ THAT SECOND READ IS THE ONE WORTH KEEPING — a queued row
-- that survived would have sent a REAL email on the next pg_net tick.
--
-- And the endpoint itself, with plain curl and no JWT:
--   no secret header  -> 401, body "unauthorised"
--   wrong secret      -> 401, body "unauthorised"
--
-- ⚠️ THE BODY TEXT IS THE PROOF THAT verify_jwt IS OFF, NOT THE STATUS CODE.
-- With verification ON the gateway also answers 401 — but with ITS message,
-- before this function runs. "unauthorised" is this function's own string, so
-- seeing it means the request reached the code. The MCP deploy tool silently
-- defaults verify_jwt back to true; this is how to tell.
--
-- ⚠️ AND 401 RATHER THAN 503 PROVED THE SHARED SECRET IS ALREADY SET for a
-- brand-new function — Edge Function env vars are PROJECT-WIDE on Supabase.
-- 503 is the fail-closed answer when APPROVAL_NOTIFY_SECRET is missing.
