-- 20 Aug 2026 — the two chase emails must not arrive in the same breath.
--
-- ══ THE BUG, AND WHY THE ORIGINAL GUARD DID NOT CATCH IT ═════════════════
--
-- 20260820_signup_nudges.sql already knew that nudge 2 must never open the
-- conversation, and guarded it:
--
--     and (_nudge_no = 1
--          or exists (select 1 from public.signup_nudges sn
--                      where sn.profile_id = u.id and sn.nudge_no = 1));
--
-- That asks "has nudge 1 been sent?" and never "how long ago?". And
-- `private.send_signup_nudges` loops `array[1, 2]` inside ONE call: step 1
-- INSERTS the nudge-1 row, then step 2 re-runs this query in the SAME
-- TRANSACTION and finds the row it just wrote. So anybody already older than
-- seven days when they are first chased satisfies both steps at once and gets
-- BOTH EMAILS SECONDS APART — the second of which says it is the last reminder
-- we will send.
--
-- ⚠️ NOT HYPOTHETICAL, AND NOT RARE. Measured against production on 20 Aug
-- 2026: two accounts, 10 and 11 days old, would have received both the moment
-- an admin clicked Restore on the Accounts screen. `restoreAccessRequest`
-- DELETES the access_requests row, so un-dismissing somebody removes the only
-- thing that was suppressing the chase, and their age does the rest.
--
-- ⚠️ IT IS THE SAME LESSON AS THE DEAD END EARLIER THAT DAY: what a row MEANS
-- changed under a query that was reading it. There, "has a request" stopped
-- meaning "has finished". Here, "has a nudge-1 row" was written to mean "was
-- chased a while ago" and quietly also means "was chased four lines up".
--
-- ══ THE FIX ══════════════════════════════════════════════════════════════
--
-- Nudge 2 now requires that nudge 1 was sent at least six days ago. Six, not
-- seven, because nudge 1 itself lands a day after signing up: 24 hours, then
-- six days, is the "one at 24 hours, one at seven days" the cadence was always
-- described as.
--
-- ⚠️ A BACKLOG PERSON STILL GETS BOTH — Jay, 20 Aug 2026: "they should get the
-- email if info is missing". Somebody who signed up three weeks ago and stalled
-- is chased on day 1 of noticing them and again six days later, not silenced
-- and not double-mailed. Whether the second one goes at all is still decided at
-- send time by every other condition in this function, so anyone who finishes
-- in between simply drops out of the set.
--
-- The `created_at` floor for nudge 2 is now implied by the new clause and is
-- KEPT ANYWAY, as a floor that survives a hand-inserted or backfilled
-- signup_nudges row.

create or replace function private.unfinished_signup_candidates(_nudge_no int)
  returns table (profile_id uuid, email text, first_name text)
  language sql
  security definer
  set search_path = public
as $function$
  select u.id,
         u.email::text,
         coalesce(nullif(trim(p.first_name), ''), '')::text
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email_confirmed_at is not null
     and u.email is not null
     and u.created_at < now() - case when _nudge_no = 1
                                     then interval '24 hours'
                                     else interval '7 days' end
     and not exists (select 1 from public.memberships m where m.profile_id = u.id)
     and not exists (
       select 1 from public.access_requests ar
        where ar.profile_id = u.id
          and (ar.requested_role = 'volunteer' or ar.status = 'dismissed'))
     and not exists (
       select 1 from public.signup_nudges sn
        where sn.profile_id = u.id and sn.nudge_no = _nudge_no)
     -- ⚠️ THE SECOND NEVER ARRIVES WITHOUT THE FIRST, *AND NOT IN THE SAME
     -- RUN AS IT*. The `sent_at` test is the whole of this migration: without
     -- it, step 2 of send_signup_nudges finds the row step 1 wrote moments
     -- earlier and mails the last reminder on the heels of the first.
     and (_nudge_no = 1
          or exists (select 1 from public.signup_nudges sn
                      where sn.profile_id = u.id
                        and sn.nudge_no = 1
                        and sn.sent_at < now() - interval '6 days'));
$function$;

revoke all on function private.unfinished_signup_candidates(int) from public;

-- ── Verifying this ────────────────────────────────────────────────────────
-- `db/tests/signup-nudges.sql`, part 4, which until this migration ASSERTED
-- THE BUG: it inserted a nudge-1 row and demanded nudge 2 be due immediately.
-- A green test holding broken behaviour in place, which is worse than no test.
--
--   select count(*) from private.unfinished_signup_candidates(1);
--   select count(*) from private.unfinished_signup_candidates(2);
