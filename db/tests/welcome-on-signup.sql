-- ══════════════════════════════════════════════════════════════════════════
--  WELCOME-ON-SIGNUP HARNESS — with confirmation OFF, does a born-confirmed
--  signup still get its wizard answers applied, and does the welcome fire?
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is invented by the fixture below. The pg_net
--  queue row the welcome trigger writes rolls back with everything else, so
--  NO EMAIL IS EVER SENT by this file — the 0→1 queue delta is the proof the
--  trigger fired, the rollback is what makes measuring it acceptable.
--
-- WHY THIS FILE EXISTS
--
-- 25 Aug 2026, Jay removed the email-confirmation gate
-- (claude/decisions/2026-08-25-remove-email-confirmation.md). The gate was
-- load-bearing: private.apply_signup_intent used to run only when
-- email_confirmed_at was SET — an UPDATE that never happens under
-- autoconfirm, where the row is BORN confirmed. Migration
-- 20260825_welcome_email_no_confirm.sql moved the call into handle_new_user
-- for born-confirmed rows and added the notify_welcome trigger. If either
-- half regresses, every new signup silently becomes an empty waiting card
-- with no welcome mail — invisible until a person complains.
--
-- WHAT THIS ASSERTS
--
--   1. a BORN-CONFIRMED signup with a signup_intent gets, at INSERT time:
--      profile + intent applied + pending membership + player + ONE pg_net
--      queue row                                        <- the new flow
--   2. an UNCONFIRMED signup gets NONE of that beyond the profile   <- control:
--      proves the WHEN clauses key on email_confirmed_at, so applying the
--      migration while the dashboard toggle is still ON leaves intent
--      application exactly as it was
--   3. confirming the row from 2 (the UPDATE path — GoTrue's autoconfirm
--      Confirm() AND the legacy links) applies the intent and queues ONE
--      welcome                                          <- the second door
--   4. re-touching email_confirmed_at on an already-welcomed row queues
--      NOTHING                                          <- welcomed_at is once-only
--
-- ⚠️ 2 AND 4 ARE NOT PADDING. Without 2, a "fix" that applies intent for
-- every insert — confirmed or not — passes assertion 1 while silently
-- minting players for pre-flip signups that still owe a confirmation click.
-- Without 4, both doors firing (INSERT then UPDATE in one GoTrue
-- transaction) would send every new account two welcome emails and nothing
-- in this file would notice.

begin;

-- ── Fixture ───────────────────────────────────────────────────────────────
insert into clubs (id, name) values
 ('c0000000-0000-4000-8000-0000000000c1','ZZ Welcome Club');

insert into teams (id, club_id, name, sort_order, self_registration_allowed, is_senior) values
 ('c0000000-0000-4000-8000-0000000000f1','c0000000-0000-4000-8000-0000000000c1','ZZ Welcome Squad', 999, false, false);

do $$
declare
  q_before  bigint;
  q_after   bigint;
  applied_1 timestamptz;
  applied_2 timestamptz;
  applied_3 timestamptz;
  players_1 int;
  pending_1 int;
  intent    jsonb := jsonb_build_object(
    'first_name', 'Zaza',
    'last_name',  'Welcomeprobe',
    'claimed_role', 'parent',
    'squad_ids', jsonb_build_array('c0000000-0000-4000-8000-0000000000f1'),
    'players', jsonb_build_array(jsonb_build_object(
      'first_name', 'Zed',
      'last_name',  'Welcomeprobe',
      'team_id',    'c0000000-0000-4000-8000-0000000000f1'
    ))
  );
  problems text := '';
begin
  select count(*) into q_before from net.http_request_queue;

  -- ── 1. Born confirmed: the post-flip signup ─────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                          raw_user_meta_data, created_at, updated_at)
  values ('c0000000-0000-4000-8000-000000000001',
          '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'zz-welcome-confirmed@example.invalid', now(),
          jsonb_build_object('signup_intent', intent), now(), now());

  select count(*) into q_after from net.http_request_queue;

  select p.signup_intent_applied_at into applied_1
    from public.profiles p where p.id = 'c0000000-0000-4000-8000-000000000001';

  select count(*) into players_1 from public.players
   where team_id = 'c0000000-0000-4000-8000-0000000000f1'
     and full_name = 'Zed Welcomeprobe';

  select count(*) into pending_1 from public.memberships
   where profile_id = 'c0000000-0000-4000-8000-000000000001'
     and status = 'pending' and role = 'parent';

  if applied_1 is null then
    problems := problems || ' [1] intent NOT applied at insert for a born-confirmed row.';
  end if;
  if players_1 <> 1 then
    problems := problems || format(' [1] expected 1 player, found %s.', players_1);
  end if;
  if pending_1 <> 1 then
    problems := problems || format(' [1] expected 1 pending parent membership, found %s.', pending_1);
  end if;
  if q_after - q_before <> 1 then
    -- Also fails when the vault is missing welcome_notify_url /
    -- approval_notify_secret — which is a real finding, not a harness bug:
    -- the migration derives the URL, so a zero here after it ran means the
    -- welcome path is dark in production.
    problems := problems || format(' [1] welcome queue delta was %s, wanted 1.', q_after - q_before);
  end if;

  -- ── 2. CONTROL: unconfirmed insert must change nothing ──────────────────
  q_before := q_after;

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                          raw_user_meta_data, created_at, updated_at)
  values ('c0000000-0000-4000-8000-000000000002',
          '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'zz-welcome-unconfirmed@example.invalid', null,
          jsonb_build_object('signup_intent', intent), now(), now());

  select count(*) into q_after from net.http_request_queue;

  select p.signup_intent_applied_at into applied_2
    from public.profiles p where p.id = 'c0000000-0000-4000-8000-000000000002';

  if applied_2 is not null then
    problems := problems || ' [2] CONTROL BROKEN: intent applied for an UNCONFIRMED row — every other assertion is suspect.';
  end if;
  if q_after - q_before <> 0 then
    problems := problems || format(' [2] welcome fired for an unconfirmed row (delta %s).', q_after - q_before);
  end if;

  -- ── 3. The second door: confirming row 2 applies intent + ONE welcome ───
  q_before := q_after;

  update auth.users
     set email_confirmed_at = now()
   where id = 'c0000000-0000-4000-8000-000000000002';

  select count(*) into q_after from net.http_request_queue;

  select p.signup_intent_applied_at into applied_3
    from public.profiles p where p.id = 'c0000000-0000-4000-8000-000000000002';

  if applied_3 is null then
    problems := problems || ' [3] confirm-by-UPDATE path no longer applies the intent.';
  end if;
  if q_after - q_before <> 1 then
    problems := problems || format(' [3] confirm-by-UPDATE queued %s welcomes, wanted 1.', q_after - q_before);
  end if;

  -- ── 4. Once only: touching email_confirmed_at again queues nothing ──────
  -- welcomed_at is already set on row 1 by assertion 1; a re-set of
  -- email_confirmed_at must not send a second mail. (A real re-fire needs
  -- a null→set transition, but the marker must hold even if the trigger's
  -- WHEN clause is ever loosened — that is what this measures.)
  q_before := q_after;

  update auth.users
     set email_confirmed_at = null
   where id = 'c0000000-0000-4000-8000-000000000001';
  update auth.users
     set email_confirmed_at = now()
   where id = 'c0000000-0000-4000-8000-000000000001';

  select count(*) into q_after from net.http_request_queue;

  if q_after - q_before <> 0 then
    problems := problems || format(' [4] an already-welcomed account queued %s more welcomes, wanted 0.', q_after - q_before);
  end if;

  if problems <> '' then
    raise exception 'WELCOME ON SIGNUP:%', problems;
  end if;

  raise notice 'WELCOME ON SIGNUP: all checks passed.';
end $$;

rollback;
