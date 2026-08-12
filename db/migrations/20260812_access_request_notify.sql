-- Somebody asks for access; the admins get told.
--
-- ⚠️ apply_migration STRIPS `--` COMMENTS BEFORE EXECUTING, so this reasoning
-- lives in this file and never in the database. A re-capture cannot bring it
-- back — which is why it is written at length here and not only in the commit.
--
-- THE GAP, in claude/state-of-play.md's own words: "Nobody is emailed when an
-- access REQUEST arrives." A person signs up, is told an admin will be in
-- touch, and then nothing happens until somebody opens /accounts. With
-- self-onboarding as the plan (claude/decisions/2026-08-10-no-roster-import.md
-- — there is no roster import and parents will onboard themselves), that queue
-- stops being occasional.
--
-- ⚠️ NOT THE SAME THING AS private.notify_pending_membership. That fires for a
-- pending MEMBERSHIP — somebody already attached to a squad, waiting to be
-- approved into it. This fires for an ACCESS REQUEST — somebody with no
-- membership at all, asking to be let in. Two queues, two sections of the
-- Accounts screen, and conflating them sends an admin to the wrong list.
--
-- THE THIRD INSTANCE of trigger → edge function → Resend, and deliberately a
-- near-copy of the second. state-of-play.md predicted the cost correctly: "a
-- third is a copy with a different recipient query."

-- ── 1. The endpoint, DERIVED so nobody handles a value by hand ──────────────
--
-- ⚠️ DERIVED FROM approval_notify_url IN SQL, exactly as state-of-play.md
-- instructs, and the instruction is worth keeping: the host cannot drift
-- between the three functions, and — the part that matters more — NOBODY EVER
-- READS, PASTES OR TYPES THE VALUE. This repo is public and a URL that passes
-- through a chat, a commit or a tool call has been somewhere it should not be.
-- The same reasoning produced pitch_notify_url.
--
-- ⚠️ IT IS NOT A CREDENTIAL. The gate is approval_notify_secret, which this
-- function reuses. It lives in the vault so that it sits beside that secret and
-- can be corrected without a migration.
--
-- ⚠️ IDEMPOTENT: vault.create_secret raises on a duplicate name, so a re-run
-- would abort the migration on a step that has already succeeded.
do $$
declare
  base text;
begin
  if exists (select 1 from vault.secrets where name = 'access_request_notify_url') then
    return;
  end if;

  select decrypted_secret into base
  from vault.decrypted_secrets where name = 'approval_notify_url';

  if base is null then
    raise exception 'approval_notify_url is missing from the vault; cannot derive the access-request endpoint';
  end if;

  -- ⚠️ ANCHORED REPLACEMENT, not a bare replace(). The function name is the
  -- LAST path segment; a plain replace would also rewrite the string if
  -- 'notify-approval' ever appeared earlier in the host.
  perform vault.create_secret(
    regexp_replace(base, '/notify-approval$', '/notify-access-request'),
    'access_request_notify_url',
    'Endpoint the access-request trigger posts to. Derived from approval_notify_url so the host cannot drift between the three notify functions. Not a credential - the gate is approval_notify_secret, which this function reuses.'
  );
end $$;

-- ── 2. The trigger function ─────────────────────────────────────────────────
--
-- ⚠️ IT MUST NEVER FAIL THE WRITE, hence the catch-all `exception when others`.
-- Somebody's request to join has to file whether or not Resend is having a good
-- day — and the person filing it is a stranger with no membership, who would
-- have no idea what a failed insert meant.
--
-- ⚠️ AND THE FAILURE IS THEREFORE GENUINELY QUIET. `raise warning` goes to the
-- Postgres log, which nobody reads. Survivable ONLY because THE QUEUE IS
-- IN-APP: the request sits in "Waiting for access" on /accounts whether or not
-- the mail arrived. The email is a prompt to go and look, never the record.
--
-- ⚠️ REUSES approval_notify_secret. Same caller, same trust domain, and a
-- second secret is a second thing to rotate and a second thing to forget.
create or replace function private.notify_access_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'access_request_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_access_request: vault secrets missing, no email sent for %', new.id;
    return new;
  end if;

  -- pg_net queues and returns; it does not wait for the response and does not
  -- retry. The queue row is written in THIS transaction, so the background
  -- worker cannot pick it up until the request has actually committed — which
  -- is what stops the edge function reading back a row that is not there yet.
  --
  -- ⚠️ AND THAT IS ALSO THE TRICK FOR TESTING IT WITHOUT SENDING ANYTHING:
  -- insert inside a transaction and ROLL BACK. net.http_request_queue goes
  -- 0 → 1 and then vanishes with everything else.
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('access_request_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_access_request failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- ⚠️ NOBODY BUT THE TRIGGER MAY CALL IT. Same revoke as
-- private.notify_pitch_request: it reads the vault as SECURITY DEFINER, so an
-- EXECUTE grant to `authenticated` would be a way to make the database post
-- arbitrary ids to the endpoint.
revoke all on function private.notify_access_request() from public, anon, authenticated;

-- ── 3. The trigger ──────────────────────────────────────────────────────────
--
-- ⚠️ INSERT ONLY, AND ONLY WHEN pending. The three writes to this table are:
--   INSERT pending   — a person asking. THIS is the one worth an email.
--   UPSERT dismissed — an admin telling themselves something they just did.
--   DELETE           — restoreAccessRequest; there is no row left to describe.
--
-- ⚠️ THE `when` CLAUSE IS NOT BELT-AND-BRACES. dismissAccessRequest UPSERTS,
-- and an upsert that finds no existing row is an INSERT — of a row already
-- `dismissed`. Without the guard, dismissing a stranger who never asked would
-- email every admin "somebody is asking to join" about the person the admin
-- had just turned away.
drop trigger if exists notify_access_request_asked on public.access_requests;
create trigger notify_access_request_asked
after insert on public.access_requests
for each row
when (new.status = 'pending')
execute function private.notify_access_request();

comment on function private.notify_access_request() is
  'Posts an access request id to the notify-access-request edge function when somebody asks for access. Swallows every failure: the in-app waiting list is the record, this is only the prompt.';
