-- Email on a pitch request being asked and being answered.
--
-- Jay, 11 Aug 2026: "they should send an email to multiple people, appear in
-- two dashboards, and should be able to be tracked from submission to
-- assignment by also the coach or manager submitting it."
--
-- The dashboards and the tracking are built. This is the email half.
--
-- == WHY THE DATABASE SENDS IT AND NOT THE APP ==
-- The SUBMIT mail goes to Pitch Managers, and the coach who triggers it
-- CANNOT READ ADMIN EMAIL ADDRESSES — `profiles` is not bulk-readable by a
-- coach and `profiles.email` is column-granted, not merely policy-gated. A
-- client-side send would need either the club's admin list in the browser or a
-- service-role key in the browser. So the recipient list has to be built
-- server-side, which makes this a trigger, exactly like
-- private.notify_pending_membership.
--
-- ⚠️ IT MUST NEVER BE ABLE TO FAIL THE WRITE. Everything below is wrapped so
-- that a missing secret, a dead endpoint or a raised exception costs an email
-- and nothing else. A coach's pitch request must file whether or not Resend is
-- having a good day.
--
-- ⚠️ AND THE FAILURE IS THEN GENUINELY QUIET. `raise warning` goes to the
-- Postgres log, which nobody reads. That is a deliberate trade and it is only
-- acceptable because THE QUEUE IS IN-APP: the request is sitting on the
-- allocation screen whether or not the mail arrived. The email is a prompt to
-- go and look at the queue, never the record of it.

create or replace function private.notify_pitch_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'pitch_notify_url';
  -- ⚠️ REUSES THE APPROVAL SECRET. Same caller, same trust domain, and a
  -- second secret is a second thing to rotate and a second thing to forget.
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_pitch_request: vault secrets missing, no email sent for %', new.id;
    return new;
  end if;

  -- pg_net queues and returns; it does not wait for the response and does not
  -- retry. The queue row is written in THIS transaction, so the background
  -- worker cannot pick it up until the request has actually committed — which
  -- is what stops the edge function reading back a row that is not there yet.
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('pitch_request_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_pitch_request failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function private.notify_pitch_request() from public, anon, authenticated;

drop trigger if exists notify_pitch_request_asked on public.pitch_requests;
create trigger notify_pitch_request_asked
after insert on public.pitch_requests
for each row execute function private.notify_pitch_request();

-- ⚠️ ONLY WHEN THE STATUS ACTUALLY CHANGES, and only into a decided state.
-- Without `is distinct from` this fires on any UPDATE touching the row — a
-- decision_note correction would email the coach a second time saying the same
-- thing. `withdrawn` is a DELETE and so cannot reach here; `cancelled` is
-- filtered in the function because nobody needs telling about a question that
-- has stopped being asked.
drop trigger if exists notify_pitch_request_answered on public.pitch_requests;
create trigger notify_pitch_request_answered
after update of status on public.pitch_requests
for each row
when (
  old.status is distinct from new.status
  and new.status in ('allocated', 'declined')
)
execute function private.notify_pitch_request();

-- ⚠️ THE ORDER IN allocatePitch IS WHAT MAKES THE ALLOCATED EMAIL CORRECT.
-- src/data/pitchRequests.js writes `events.pitch` FIRST and closes the request
-- SECOND. That order was chosen so a refused fixture write leaves the request
-- open rather than telling a coach they have a pitch they do not have — but it
-- also means that by the time this trigger fires, `events.pitch` already holds
-- the real pitch, which is what the email reads back. Reversing those two
-- writes would email "you are on Pitch TBD".

comment on function private.notify_pitch_request() is
  'Posts a pitch request id to the notify-pitch-request edge function on submit and on decision. Swallows every failure: the in-app queue is the record, this is only the prompt.';
