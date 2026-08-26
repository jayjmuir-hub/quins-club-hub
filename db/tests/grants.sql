-- ══════════════════════════════════════════════════════════════════════════
--  GRANTS HARNESS — the column ceiling on `profiles`, and what defends it
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: everything runs
--  inside a transaction that ROLLS BACK, and the only write it makes is the
--  deliberately-injected fault in part 3, which is undone with it.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- `claude/state-of-play.md` called table and column grants "the one real gap …
-- and nothing currently checks it". `db/schema/grants.sql` now captures them,
-- which makes drift DIFFABLE. This makes it CHECKABLE — the two are different
-- and the repo has been bitten by the difference: the 7 Aug capture was read as
-- clean and the 9 Aug re-capture found two objects it had missed.
--
-- WHAT IT GUARDS. `profiles.email` is the login identity. RLS authorises the
-- ROW — `profile update own` is USING (id = auth.uid()), and `profile update
-- club admin` is USING private.shares_admin_club(id), so a club admin is
-- authorised against every member row in the club. **Only the column grant
-- limits which FIELDS.** Take the column grants away and both policies become
-- "may rewrite anyone's login email", with no other line of defence.
--
-- ⚠️ READING `policies.sql` WILL NOT TELL YOU THIS. `profile update own` reads
-- as "a member may edit their own profile", full stop. The five-column ceiling
-- on that sentence exists only in the grants.
--
-- ⚠️ PART 3 IS THE POINT OF THE FILE. A check that has never failed is not a
-- check (CLAUDE.md rule 6), and this one cannot be trusted on a green run
-- alone: every assertion below is of the form "this privilege is absent", and
-- a typo'd role name or table name makes all of them vacuously true. So the
-- harness injects the exact fault it exists to catch and proves it fails.
--
-- ⚠️ WHAT HAS AND HAS NOT BEEN RUN, as of 10 Aug 2026. Parts 1 and 2 were run
-- against live and passed. Non-vacuity was proved read-only, by asking the same
-- `has_column_privilege` probe about `phone` — a column that IS granted — and
-- watching it raise. So the mechanism demonstrably distinguishes granted from
-- not, which is the thing a green run cannot tell you on its own.
--
-- **Part 3 has NOT been run against production.** It was written to be run from
-- the SQL editor, where `begin`/`rollback` are a real transaction. It was
-- deliberately not driven through the Supabase MCP tool, whose statement and
-- transaction handling is not guaranteed to keep a mid-batch failure from
-- leaving the GRANT behind — and the GRANT it injects is precisely "any club
-- admin may rewrite any member's login email". Run it in the SQL editor, in one
-- paste, and read part 4.

begin;

-- ── 1. The check itself, as a temp function so it can be run twice ─────────
--
-- pg_temp, so it disappears with the session and cannot be left behind on
-- production even if the rollback below were skipped.

create function pg_temp.check_grants() returns void language plpgsql as $fn$
declare
  granted   text[];
  -- ⚠️ THIS LIST IS A DECISION, NOT AN INVENTORY. Every name here is a
  -- column a signed-in member may rewrite on their OWN profile row. Adding one
  -- because the check went red is exactly the reflex this assertion exists to
  -- interrupt.
  --
  -- ⚠️ no_player_confirmed_at and no_role_confirmed_at ADDED 19 Aug 2026.
  -- They arrived with self-registration and were granted at that time; the
  -- expectation here was never updated, and nothing noticed because the file
  -- could not PARSE (an E-string splice, fixed above) and the nightly
  -- db-check was inert without a SUPABASE_DB_URL secret. Reviewed before being
  -- added: both are timestamps a member sets about THEMSELVES — "I have no
  -- child to add", "I hold no role" — written by the sign-in gate on that
  -- person's own row. Neither is an identity column and neither is readable as
  -- a privilege. `email`, `id` and `club_id` remain absent, which is the point.
  expected  text[] := array['first_name','full_name','last_name',
                            'name_confirmed_at','no_player_confirmed_at',
                            'no_role_confirmed_at','phone'];
  stray     text;
  unguarded text;
begin
  -- ── 1a. `email` must not be updatable by a member, by ANY route ──────────
  --
  -- has_column_privilege answers the real question rather than the catalogue
  -- one: it is true if the privilege arrives table-level OR column-level, so
  -- it cannot be fooled by re-granting UPDATE on the whole table.
  if has_column_privilege('authenticated', 'public.profiles', 'email', 'UPDATE') then
    raise exception
      'GRANTS: `authenticated` can UPDATE profiles.email. This is the login '
      'identity, and `profile update club admin` authorises an admin against '
      'every member row in the club — so this is "any admin may rewrite any '
      -- ⚠️ A DOUBLED QUOTE, NOT A BACKSLASH ESCAPE. This line was
      -- E'member\'s login email' — an E-string spliced into a run of ordinary
      -- adjacent string literals. Postgres will not continue a plain literal
      -- with an E-literal, so the WHOLE FILE failed to parse and this harness
      -- asserted nothing whatever. It reported "syntax error at or near
      -- E'member...", which names the line but not the reason, and it went
      -- unnoticed because the nightly db-check was inert without a
      -- SUPABASE_DB_URL secret. '' is the standard escape and needs no prefix.
      'member''s login email". See db/schema/grants.sql section 3.';
  end if;

  -- The other two ungranted columns. Less severe than email, still not a
  -- member's to write: `id` is the join to auth.users and to every membership
  -- row, `created_at` is audit.
  if has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE') then
    raise exception 'GRANTS: `authenticated` can UPDATE profiles.id — that is the auth user id.';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE') then
    raise exception 'GRANTS: `authenticated` can UPDATE profiles.created_at.';
  end if;

  -- ── 1b. The granted columns must STILL be granted ────────────────────────
  --
  -- ⚠️ THE OTHER DIRECTION, AND THE ONE THAT WOULD BE MISREAD AS AN RLS BUG.
  -- An ungranted column makes the save fail with a permission error that looks
  -- exactly like a policy refusal, so it gets debugged in policies.sql for an
  -- hour first. Asserting both directions is what stops that.
  select array_agg(att.attname order by att.attname)
    into granted
  from pg_attribute att
  where att.attrelid = 'public.profiles'::regclass
    and att.attnum > 0 and not att.attisdropped
    and has_column_privilege('authenticated', att.attrelid, att.attname, 'UPDATE');

  if granted is distinct from (select array_agg(x order by x) from unnest(expected) x) then
    raise exception
      'GRANTS: the updatable columns of `profiles` are % but should be %. '
      'Adding a column to profiles is a decision, not a formality — see '
      'db/schema/grants.sql section 3.', granted, expected;
  end if;

  -- ── 1c. No column grants anywhere else in `public` ───────────────────────
  --
  -- A new column grant is not necessarily wrong, but it is invisible in every
  -- other file in db/schema/ and must be recorded in grants.sql deliberately.
  --
  -- ⚠️ THIS CHECK READ "these five are the only column-level grants in the
  -- schema" AND WAS FALSE WITHIN HOURS OF BEING WRITTEN. `super_admin_and_rights`
  -- added six on `memberships` on 10 Aug — the SAME DAY — then `social_ideas`
  -- added four on 12 Aug and `memberships.title` a seventh on 13 Aug.
  --
  -- ⚠️ SO THIS HARNESS FAILED AGAINST LIVE FROM 10 TO 13 AUG 2026 AND NOBODY
  -- SAW IT, because nobody ran it. Its header says "Parts 1 and 2 were run
  -- against live and passed", which was true when written and is the whole
  -- problem: **a check nobody runs is not a check, in exactly the way a check
  -- that has never failed is not a check.** Found on 13 Aug by running it while
  -- verifying an unrelated migration.
  --
  -- ⚠️ THE FAILURE WAS THE HARNESS BEING WRONG, NOT THE DATABASE. Every one of
  -- the sixteen grants below is deliberate and recorded in db/schema/grants.sql.
  -- Widening the expectation is therefore the correct fix — but note that it
  -- makes THIS list the thing that now has to be kept current, and it will rot
  -- the same way if a migration adds a column grant without touching it. That is
  -- the intended cost: the check fails loudly rather than drifting quietly.
  select c.relname || '.' || att.attname
    into stray
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute att on att.attrelid = c.oid
                       and att.attnum > 0 and not att.attisdropped
  where n.nspname = 'public'
    and att.attacl is not null
    and (c.relname || '.' || att.attname) <> all (array[
      -- profiles — the login-identity ceiling. See section 3 of grants.sql.
      --
      -- ⚠️ THE TWO no_*_confirmed_at COLUMNS ADDED 19 Aug 2026, and this list
      -- rotted exactly the way its own header predicted it would: they were
      -- granted with self-registration and nothing here was touched. Both are
      -- timestamps a member sets about themselves via the sign-in gate.
      'profiles.first_name', 'profiles.full_name', 'profiles.last_name',
      'profiles.name_confirmed_at', 'profiles.no_player_confirmed_at',
      'profiles.no_role_confirmed_at', 'profiles.phone',
      -- feedback — the TRIAGE ceiling, added 18 Aug with help-and-feedback and
      -- recorded in db/schema/grants.sql section "public.feedback — COLUMN
      -- grants" on the same day. Only this list was missed.
      --
      -- ⚠️ THE GRANT IS TO `authenticated`, NOT TO ADMINS — Postgres grants
      -- cannot see roles the app invents. What limits triage to an admin is the
      -- `feedback triage` POLICY; what limits it to these four COLUMNS is this
      -- grant. Neither alone is the control: a member may not reach these
      -- columns, and an admin may not reach the reporter's own words.
      'feedback.status', 'feedback.admin_note',
      'feedback.handled_by', 'feedback.handled_at',
      -- memberships — the super-admin ceiling. `is_super` and `admin_rights`
      -- are DELIBERATELY ABSENT: that absence is what stops an ordinary admin
      -- promoting themselves. 20260810_super_admin_and_rights.sql.
      'memberships.profile_id', 'memberships.club_id', 'memberships.team_id',
      'memberships.player_id', 'memberships.role', 'memberships.status',
      'memberships.title',
      -- ⚠️ is_head_coach ADDED 18 Aug 2026 (20260818_membership_head_coach).
      -- It sits beside is_super and admin_rights and is NOT one of them: it
      -- confers no authority at all, it decides who is TOLD when somebody
      -- registers for that squad. An admin who set it on themselves would
      -- receive more email and gain nothing. The unique index
      -- memberships_one_head_coach_per_team is what stops it fanning out.
      'memberships.is_head_coach',
      -- notify_approvals ADDED 23 Aug 2026 (20260823_notify_approvals). The
      -- same kind of thing as is_head_coach: who is TOLD, never who may act.
      -- Constrained to admin / coach / manager rows by a CHECK.
      'memberships.notify_approvals',
      -- announcements — an author may edit their own notice. ⚠️ `team_id` is
      -- DELIBERATELY ABSENT and that absence is load-bearing: step 10 of
      -- db/tests/announcements.sql exists to prove an author cannot re-scope a
      -- squad notice club-wide after posting, and the ONLY thing preventing it
      -- is this grant list. Adding team_id "for consistency" would reopen it
      -- and every policy test would stay green.
      'announcements.title', 'announcements.body',
      'announcements.pinned', 'announcements.expires_at',
      -- social_ideas — marking an idea must not rewrite the submitter's words.
      'social_ideas.status', 'social_ideas.decision_note',
      'social_ideas.decided_by', 'social_ideas.decided_at',
      -- chat (23 Aug 2026, 20260823_squad_chat) — an author edits their own
      -- words, pins, or soft-deletes; the columns are the ceiling, the
      -- policies decide whose message. Recorded in grants.sql the same day;
      -- ⚠️ THIS LIST was missed and the harness was red from 23 Aug — unseen,
      -- because the pitch-occupancy refusal was blocking the whole nightly.
      'messages.body', 'messages.pinned', 'messages.deleted_at',
      -- chat phase 3 (20260823_squad_chat_phase3) — resolving a report stamps
      -- these two and nothing else; staff_dm_opt_in is the guardian's switch
      -- (its _by/_at neighbours ride the table-level grant, no column ACL).
      'message_reports.resolved_at', 'message_reports.resolved_by',
      'player_private.staff_dm_opt_in',
      -- group chats (24 Aug 2026, 20260824_group_chats) — the owner-only
      -- "group rename" policy gates WHO; this column grant gates to WHAT.
      'conversations.title'
    ])
  limit 1;

  if stray is not null then
    raise exception
      'GRANTS: column-level grant on %, which db/schema/grants.sql does not '
      'record. Re-capture it, or drop it.', stray;
  end if;

  -- ⚠️ AND THE OTHER DIRECTION, WHICH THE ORIGINAL DID NOT CHECK AT ALL. A
  -- column grant DISAPPEARING is the failure that looks like an RLS bug and gets
  -- debugged in policies.sql for an hour — 1b does this for `profiles` and
  -- nothing did it for the other two.
  if not has_column_privilege('authenticated', 'public.memberships', 'title', 'UPDATE') then
    raise exception
      'GRANTS: `authenticated` has LOST UPDATE on memberships.title. Saving a '
      'job title will fail with something that looks exactly like an RLS '
      'refusal. ⚠️ The fix is the COLUMN grant — never `grant update on '
      'public.memberships to authenticated`, which hands every admin is_super.';
  end if;
  if has_column_privilege('authenticated', 'public.memberships', 'is_super', 'UPDATE') then
    raise exception
      'GRANTS: `authenticated` can UPDATE memberships.is_super. `memb manage` is '
      'FOR ALL and admin-only, so this makes the super-admin tier decoration: '
      'any admin can promote themselves. See db/schema/grants.sql section 4.';
  end if;
  if has_column_privilege('authenticated', 'public.memberships', 'admin_rights', 'UPDATE') then
    raise exception
      'GRANTS: `authenticated` can UPDATE memberships.admin_rights, bypassing '
      'the set_admin_rights RPC.';
  end if;

  -- ── 1d. Every table in `public` must have RLS enabled ────────────────────
  --
  -- ⚠️ NOT A TIDINESS CHECK. Supabase's default privileges on `public` grant
  -- `anon` full table rights on every table created there — see section 1 of
  -- db/schema/grants.sql. A table without RLS is therefore not "unhardened",
  -- it is readable and writable by anyone with the project URL. The grant that
  -- makes that true is invisible in the CREATE TABLE.
  select c.relname into unguarded
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
  limit 1;

  if unguarded is not null then
    raise exception
      'GRANTS: table `public.%` has RLS DISABLED. Default privileges grant '
      '`anon` full rights on every table in public, so this table is open to '
      'anyone with the project URL.', unguarded;
  end if;

  raise notice 'GRANTS: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  GRANTS: all checks passed.

select pg_temp.check_grants();


-- ── 3. ⚠️ THE SELF-TEST — inject the exact fault and prove it is caught ────
--
-- The fault is one statement: give `authenticated` back the ability to write
-- the login email. This is the real thing, produced the real way, not a
-- simulation of it — and it is undone by the rollback at the bottom.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: GRANTS: …
-- If instead you see SELF-TEST FAILED, the checks in part 1 are vacuous and
-- part 2's green result meant nothing.

grant update (email) on public.profiles to authenticated;

do $$
begin
  begin
    perform pg_temp.check_grants();
    -- Reaching here means the check passed while email was updatable.
    raise exception 'SELF-TEST FAILED: check_grants() passed with UPDATE(email) granted. The assertions are vacuous — check the role and table names.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 3b. ⚠️ WHICH FUNCTIONS `anon` MAY EXECUTE ──────────────────────────────
--
-- Added 13 Aug 2026, after finding that TEN of the fourteen functions in
-- `public` were executable by `anon` — including approve_membership and
-- set_admin_rights, whose migrations grant only `authenticated`.
--
-- ⚠️ TWO INDEPENDENT GRANTS HAVE TO BE GONE, AND CHECKING EITHER ONE ALONE IS
-- HOW THIS STAYED OPEN IN TWO DIFFERENT WAYS AT ONCE:
--
--   * Supabase ships `alter default privileges in schema public grant all on
--     functions to anon, authenticated, service_role` — a grant to `anon` BY
--     NAME, which `revoke ... from public` does not touch. That is the bug in
--     the house pattern used by nine migrations.
--   * Some functions ALSO carry a `PUBLIC` grant (`=X/postgres` in proacl), and
--     `anon` inherits through it — so `revoke ... from anon` alone leaves them
--     open too.
--
-- ⚠️ SO THIS ASSERTS `has_function_privilege`, THE EFFECTIVE ANSWER, and never
-- the presence of a revoke in the migration text. Reading the SQL is precisely
-- what produced the wrong belief for a fortnight.
--
-- ⛔ ONE ALLOWED ENTRY IS DELIBERATE AND MUST NOT BE "TIDIED":
--
--   calendar_events_for_token — the calendar feed. supabase/functions/calendar
--     calls it with the publishable key on behalf of Google/Apple, which carry
--     no session. ⚠️ netlify.toml records that a subscribed URL cannot be
--     changed remotely, so revoking this breaks every subscribed feed in the
--     club with no way to warn anyone and no way to repair it.
--
-- ⚠️ `register_my_player` WAS THE SECOND ENTRY HERE UNTIL 18 Aug 2026, AND
-- CALLING IT "DELIBERATE" WAS THE SAME MISTAKE THIS FILE'S OWN OPENING WARNS
-- ABOUT — reading the migration text rather than asking why. The citation
-- above named the two migrations that re-granted it (20260809_register_my_
-- player_gender.sql, 20260811_self_registration.sql) as if an explicit grant
-- proved a decision. It did not: `DROP FUNCTION` takes the old signature's
-- ACLs with it, and both migrations' own comments say they are RESTATING the
-- prior grant to avoid an outage, not choosing one. Neither migration gives a
-- reason `anon` specifically needs it, and `claude/open-items.md` found the
-- real one on 16 Aug — the same accidental-default-privilege pattern nine
-- OTHER functions carried until someone added the explicit revoke.
-- ⚠️ THE GRANT WAS ALSO FUNCTIONALLY INERT. `register_my_player`'s first line
-- is `if auth.uid() is null then raise exception ... using errcode = '42501'`,
-- and a genuinely anonymous PostgREST call — the only kind that ever executes
-- as the `anon` ROLE, since a signed-in session runs as `authenticated` —
-- always has a null `auth.uid()`. So the grant let an anonymous caller reach
-- the function and be refused one line later, instead of refused at the door.
-- Revoked in 20260818_revoke_anon_execute_register_my_player.sql. Measured
-- unchanged by the revoke: a real signed-in registration, and the calendar
-- feed, both still work — neither one runs this function as `anon`.
create or replace function pg_temp.check_anon_execute() returns void language plpgsql as $$
declare
  _unexpected text;
  _missing text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into _unexpected
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname not in ('calendar_events_for_token');
  if _unexpected is not null then
    raise exception 'anon can EXECUTE functions it should not: %. A `revoke ... from public` in the migration does NOT remove Supabase''s named grant to anon, and a `revoke ... from anon` does not remove a PUBLIC grant. Both are required.', _unexpected;
  end if;

  -- ⚠️ THE OTHER DIRECTION, AND IT IS NOT DECORATION. A future session
  -- "hardening" this by revoking the one allowed entry would take the
  -- calendar feed off every parent's phone, permanently. This arm turns that
  -- into a red harness instead of a silent outage nobody can undo.
  select string_agg(name, ', ') into _missing from (
    select 'calendar_events_for_token' as name
     where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname='public' and p.proname='calendar_events_for_token'
                          and has_function_privilege('anon', p.oid, 'execute'))
  ) t;
  if _missing is not null then
    raise exception 'anon has LOST execute on a function that needs it: %. calendar_events_for_token is the calendar feed and a subscribed URL cannot be repaired remotely.', _missing;
  end if;
end
$$;

select pg_temp.check_anon_execute();

-- ⚠️ AND ITS OWN SELF-TEST, because a check that has never failed is not a
-- check. Granting anon EXECUTE on one function must make the check above go
-- red. GRANT is transactional, so this is undone by the rollback at the foot
-- of this file — the same arrangement part 3 uses for UPDATE(email).
grant execute on function public.my_squad_staff() to anon;

do $$
begin
  begin
    perform pg_temp.check_anon_execute();
    raise exception 'SELF-TEST FAILED: check_anon_execute() passed while anon held EXECUTE on my_squad_staff. The assertion is vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the anon check caught it: %', sqlerrm;
  end;
end
$$;

revoke execute on function public.my_squad_staff() from anon;


-- ── 5. The four chat-era table ceilings (26 Aug 2026) ──────────────────────
-- 20260826_trim_grant_ceilings.sql closed the untrimmed-birth-defaults gap
-- the 25 Aug re-capture measured: REVOKE lines had targeted PUBLIC/anon and
-- left authenticated holding verbs no migration granted. These assert the
-- intended ceilings hold — by GRANT, not merely by the owner-scoped policies
-- in front of them. (Numbered 5 though it sits before part 4 — "Undo" was
-- already the foot of this file when this arrived, and it must stay last.)

create function pg_temp.check_table_ceilings() returns void language plpgsql as
$$
declare
  spec record;
  verb text;
  held text;
begin
  for spec in
    select * from (values
      ('notification_opt_outs', 'SELECT,INSERT,DELETE'),
      ('conversation_members',  'SELECT'),
      ('message_reactions',     'SELECT,INSERT,DELETE'),
      ('message_stars',         'SELECT,INSERT,DELETE')
    ) as t(tbl, expected)
  loop
    held := '';
    foreach verb in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege('authenticated', 'public.' || spec.tbl, verb) then
        held := held || case when held = '' then '' else ',' end || verb;
      end if;
    end loop;
    if held <> spec.expected then
      raise exception
        'TABLE CEILING: authenticated holds [%] on public.%, expected [%]. '
        'Either 20260826_trim_grant_ceilings.sql regressed, or a new grant '
        'arrived untrimmed — see db/schema/grants.sql.',
        held, spec.tbl, spec.expected;
    end if;
  end loop;
end
$$;

select pg_temp.check_table_ceilings();

-- Self-test: re-open the exact gap the migration closed and the check must
-- go red. Transactional, undone by the rollback below.
grant update on public.conversation_members to authenticated;

do $$
begin
  begin
    perform pg_temp.check_table_ceilings();
    raise exception 'SELF-TEST FAILED: check_table_ceilings() passed while authenticated held UPDATE on conversation_members. The assertion is vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the ceiling check caught it: %', sqlerrm;
  end;
end
$$;

revoke update on public.conversation_members from authenticated;

-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did grant UPDATE(email) on production. GRANT
-- is transactional in Postgres, so this removes it — but only if it runs.
-- If you ran part 3 alone, run: revoke update (email) on public.profiles from authenticated;

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run this on its own afterwards. Expected: f
--
--   select has_column_privilege('authenticated','public.profiles','email','UPDATE');
