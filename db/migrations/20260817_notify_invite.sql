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

-- ── VERIFY (run it; do not assume) ─────────────────────────────────────
-- ⚠️ INSIDE A TRANSACTION THAT ROLLS BACK. pg_net queues into a table, so the
-- rollback un-queues the request and no mail is ever sent:
--
--   begin;
--   select count(*) from net.http_request_queue;                  -- before
--   insert into public.invites (club_id, email, role, team_id, created_by)
--   values ('<club>', 'nobody@example.com', 'parent', '<team>', '<a profile>');
--   select count(*) from net.http_request_queue;                  -- must be +1
--   select (headers->>'x-approval-secret')
--            = (select decrypted_secret from vault.decrypted_secrets
--                where name = 'approval_notify_secret') as secret_matches,
--          url, body
--     from net.http_request_queue order by id desc limit 1;
--   rollback;
--
-- And the endpoint itself, with plain curl and NO JWT — which is what proves
-- verify_jwt is genuinely off, the setting the MCP deploy tool silently
-- defaults back to true:
--   no secret header  -> 401 "unauthorised"  (503 if the env var is unset)
--   wrong secret      -> 401 "unauthorised"
