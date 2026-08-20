-- 20 Aug 2026 — chase the people who signed up and never finished.
--
-- WHY. Jay asked "will they be nudged again?" and the honest answer was: only
-- if they choose to come back. Nothing chased them. Measured the same day: of
-- the accounts with no access, several had confirmed their email, signed in,
-- and stopped — two had given their name, because the sign-up flow saves that
-- before it asks what you want.
--
-- ══ THE CADENCE, AND WHY IT IS TWO ═══════════════════════════════════════
--
-- One at 24 hours, one at seven days, then silence. The cap is the PRIMARY KEY
-- on (profile_id, nudge_no) rather than a counter — a counter resets the first
-- time somebody re-runs the job by hand, a primary key does not.
--
-- ══ ⚠️ WHO COUNTS AS UNFINISHED, AND THE TRAP THIS AVOIDS ════════════════
--
-- "Has an access request" is NOT the same as "has finished", and reading it
-- that way is a mistake this project made earlier the SAME DAY: RollCall's
-- mount check treated any request as "nothing left to ask" and turned the
-- sign-up screen into a dead end within an hour of the first screen starting to
-- write one for everybody. See 20260820 in claude/changelog.md.
--
-- So the rule here is the one that survived that:
--
--   * ANY membership row means they finished something — registering a child
--     and claiming a squad both write one, pending or active.
--   * A request asking as `volunteer` IS the whole ask; that person is waiting
--     on an admin, not stuck, and must not be chased.
--   * A DISMISSED request means the club has already said no. Chasing them
--     would invite them to re-apply after a refusal.
--
-- Anything else with a confirmed email and no membership row is somebody who
-- was interrupted.
--
-- ══ ⚠️ CLAIM FIRST, SEND SECOND ══════════════════════════════════════════
--
-- The rows go into `signup_nudges` BEFORE the HTTP call, so a failed send
-- cannot mail anybody twice. The cost is the opposite failure — a nudge
-- recorded that never arrived — and for a reminder that is much the cheaper of
-- the two. Same order, same reasoning, as `private.send_availability_nudges()`.

begin;

-- ── 1. What has been sent ────────────────────────────────────────────────
create table if not exists public.signup_nudges (
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  nudge_no   int         not null check (nudge_no in (1, 2)),
  sent_at    timestamptz not null default now(),
  primary key (profile_id, nudge_no)
);

comment on table public.signup_nudges is
  'One row per follow-up email sent to somebody who signed up and never '
  'finished. The PRIMARY KEY is the cap: two emails, ever. Written BEFORE the '
  'send, so a failure cannot mail anybody twice.';

alter table public.signup_nudges enable row level security;

-- ⚠️ NO POLICY, DELIBERATELY. RLS on with no policy means `anon` and
-- `authenticated` read and write nothing at all. Only the SECURITY DEFINER
-- function below touches this table, and nothing in the app needs to see it.
-- A permissive policy here would publish, to every signed-in member, a list of
-- who has been chased.

revoke all on public.signup_nudges from anon, authenticated;

-- ── 2. Who to chase ──────────────────────────────────────────────────────
create or replace function private.unfinished_signup_candidates(_nudge_no int)
  returns table (profile_id uuid, email text, first_name text)
  language sql
  security definer
  set search_path to 'public'
as $function$
  select u.id,
         u.email::text,
         coalesce(nullif(trim(p.first_name), ''), '')::text
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.email_confirmed_at is not null
     and u.email is not null
     -- Old enough for this nudge: 24 hours for the first, seven days for the
     -- second. Measured from the login being created, not from the last visit.
     and u.created_at < now() - case when _nudge_no = 1
                                     then interval '24 hours'
                                     else interval '7 days' end
     -- Finished something. Registering a child and claiming a squad BOTH write
     -- a membership row, pending or active, so any row at all disqualifies.
     and not exists (select 1 from public.memberships m where m.profile_id = u.id)
     -- Waiting on an admin, or already refused — neither is "stuck".
     and not exists (
       select 1 from public.access_requests ar
        where ar.profile_id = u.id
          and (ar.requested_role = 'volunteer' or ar.status = 'dismissed'))
     -- Not already sent this one.
     and not exists (
       select 1 from public.signup_nudges sn
        where sn.profile_id = u.id and sn.nudge_no = _nudge_no)
     -- ⚠️ THE SECOND NEVER ARRIVES WITHOUT THE FIRST. Without this, an account
     -- created a fortnight ago would receive nudge 2 as its opening message —
     -- "this is the last reminder we will send" to somebody who has had none.
     and (_nudge_no = 1
          or exists (select 1 from public.signup_nudges sn
                      where sn.profile_id = u.id and sn.nudge_no = 1));
$function$;

revoke all on function private.unfinished_signup_candidates(int) from public;

-- ── 3. The job ───────────────────────────────────────────────────────────
-- ⚠️ `_dry` EXISTS SO THE LIST CAN BE READ BEFORE ANY FAMILY IS MAILED. It
-- claims nothing and sends nothing; it only counts. Used to show Jay who would
-- receive the first run before the schedule was allowed to fire.
create or replace function private.send_signup_nudges(_dry boolean default false)
  returns integer
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
  people   jsonb;
  n        int := 0;
  total    int := 0;
  step     int;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'signup_nudge_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if not _dry and (endpoint is null or secret is null) then
    raise warning 'send_signup_nudges: vault secrets missing, nothing sent';
    return 0;
  end if;

  foreach step in array array[1, 2] loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'email', c.email, 'first_name', c.first_name, 'nudge_no', step)), '[]'::jsonb),
           count(*)
      into people, n
      from private.unfinished_signup_candidates(step) as c;

    if n = 0 then
      continue;
    end if;

    total := total + n;
    if _dry then
      continue;
    end if;

    -- ⚠️ CLAIM FIRST. See the header.
    insert into public.signup_nudges (profile_id, nudge_no)
    select c.profile_id, step
      from private.unfinished_signup_candidates(step) as c
    on conflict (profile_id, nudge_no) do nothing;

    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-approval-secret', secret),
      body    := jsonb_build_object('people', people));
  end loop;

  return total;
end;
$function$;

revoke all on function private.send_signup_nudges(boolean) from public;

-- ── 4. Daily ─────────────────────────────────────────────────────────────
-- ⚠️ 07:10 UTC is 11:10 in Abu Dhabi — late morning, not the middle of the
-- night. A reminder that lands at 3am reads as a system talking to itself.
-- Deliberately not the same minute as the availability nudge (05:23 UTC), so
-- the two jobs cannot contend for the same worker.
select cron.unschedule('signup-nudge')
 where exists (select 1 from cron.job where jobname = 'signup-nudge');

select cron.schedule(
  'signup-nudge',
  '10 7 * * *',
  $job$ select private.send_signup_nudges(); $job$
);

commit;


-- ══ HOW TO VERIFY AFTER APPLYING ═════════════════════════════════════════
--
--   -- who WOULD be chased, mailing nobody:
--   select private.send_signup_nudges(true);
--
--   -- the two lists, by name:
--   select 1 as nudge, * from private.unfinished_signup_candidates(1)
--   union all
--   select 2, * from private.unfinished_signup_candidates(2);
--
--   -- the schedule exists:
--   select jobname, schedule from cron.job where jobname = 'signup-nudge';
