-- A `pending` membership state, so a self-registered parent can use the app
-- without being handed the rest of the squad.
--
-- Apply as migration `20260808xxxxxx membership_pending_status`.
-- Spec: claude/decisions/2026-08-08-parent-self-registration.md
--
-- ══ THE DANGER THIS EXISTS TO PREVENT — MEASURED, NOT ASSUMED ═══════════
-- Run against the live database on 8 Aug 2026, impersonating a brand-new
-- parent with one membership row on U16 (transaction rolled back):
--
--     players_visible   6   <-- THE WHOLE SQUAD
--     contacts_visible  1
--     events_visible   26
--
-- `player read` is `can_see_team(team_id)`, and can_see_team is true for ANY
-- membership row with a matching team_id whatever the role. So the instant a
-- self-registering parent gets a row pointing at U16, Postgres hands them
-- every U16 child's name, photo and gender. Not because a screen shows it —
-- because the query returns it.
--
-- ⚠️ `player_contacts` was ALREADY SAFE (1, not 6): its `contact edit own`
-- policy is `is_own_player`, so parent phone numbers never leaked. Earlier
-- descriptions of this risk in the session that produced this migration said
-- "names, dates of birth, phone numbers" — WRONG on two counts. There is no
-- date-of-birth column in `players` at all, and contacts were never exposed.
-- Recorded because overstating a risk is how the next person stops believing
-- the warnings.
--
-- ══ THE ORDERING TRAP ═══════════════════════════════════════════════════
-- The column is added AND can_see_team starts requiring it in the SAME
-- migration. If the default failed to land on existing rows, every current
-- user — including the only two admins — would lose all access at once, and
-- the app would look empty rather than broken.
--
-- The guard below is not a comment asking someone to check. It RAISES, inside
-- the transaction, before any policy changes. A migration on this project has
-- already reported success while changing nothing (6 Aug, a Postgres
-- self-assignment that never fired a `distinct from`), so "read the rows
-- back" is enforced here rather than requested.

begin;

alter table public.memberships
  add column if not exists status text not null default 'active';

alter table public.memberships
  drop constraint if exists memberships_status_check;
alter table public.memberships
  add constraint memberships_status_check check (status in ('pending','active'));

comment on column public.memberships.status is
  'active = full squad visibility. pending = self-registered, awaiting a '
  'coach or admin. A pending row still attaches the person to the squad '
  '(fixtures, their own child) but does NOT satisfy private.can_see_team.';

-- ⚠️ THE GUARD. Aborts the whole migration if a single existing row is not
-- active — which is the only circumstance under which the change below locks
-- people out.
do $$
declare bad int;
begin
  select count(*) into bad from public.memberships where status is distinct from 'active';
  if bad > 0 then
    raise exception
      'ABORTING: % existing membership row(s) are not active. Changing '
      'can_see_team now would revoke their access. Investigate before retrying.', bad;
  end if;
  raise notice 'guard passed: every existing membership is active';
end $$;

-- ══ TWO HELPERS, SPLIT BY SENSITIVITY ═══════════════════════════════════
-- The single can_see_team conflated "may see this squad's PEOPLE" with "may
-- see this squad's SCHEDULE". A child's name and photo are sensitive; a
-- training time is not. Splitting them is the whole point: it lets a pending
-- parent be useful (see fixtures, set their own child's availability) while
-- seeing nobody else.

-- ACTIVE ONLY. Gates anything that exposes other people.
create or replace function private.can_see_team(_team uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.status = 'active'
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or m.team_id = _team));
$function$;

-- ANY status. Gates non-sensitive squad context: fixtures and training times.
create or replace function private.is_attached_to_team(_team uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from memberships m
    where m.profile_id = auth.uid()
      and ((m.role = 'admin' and m.club_id = (select club_id from teams where id = _team))
           or m.team_id = _team));
$function$;

revoke execute on function private.is_attached_to_team(uuid) from public;

-- ⚠️ can_edit_team is deliberately NOT status-gated here. Staff roles are
-- granted by an admin, never self-registered, so a pending coach cannot
-- exist. Adding the check would be harmless but implies a state that has no
-- way of arising, and an unreachable branch is a lie about the model.

-- ══ POLICIES ════════════════════════════════════════════════════════════

-- Own child stays visible while pending. Without this a pending parent sees
-- NOTHING, including the player they just registered, which reads as the app
-- having lost them.
drop policy if exists "player read" on public.players;
create policy "player read" on public.players
  for select using (private.can_see_team(team_id) or private.is_own_player(id));

-- Fixtures are not sensitive, and a pending parent needs them to be worth
-- signing in at all.
drop policy if exists "event read" on public.events;
create policy "event read" on public.events
  for select using (private.is_attached_to_team(team_id));

-- ⚠️ THE SILENT ONE. `avail own insert` and `avail own update` are both
-- is_own_player, but `avail read` was can_see_team — so a pending parent
-- would SAVE their availability and then be unable to see it. The write
-- succeeds, the row vanishes, nothing errors, and it reads as "the app lost
-- my answer". Found by reading the policies, not by testing.
drop policy if exists "avail read" on public.availability;
create policy "avail read" on public.availability
  for select using (
    private.can_see_team((select events.team_id from events where events.id = availability.event_id))
    or private.is_own_player(player_id)
  );

-- ══ A VERIFIED ROSTER MATCH MUST NOT QUEUE ══════════════════════════════
-- claim_roster_access grants on the strength of the person proving they can
-- read mail at an address the club already holds. That IS the verification,
-- so it grants 'active' outright. It would inherit the column default today;
-- stating it means a later change to that default cannot silently start
-- putting matched parents in the approval queue.
-- ⚠️ COPIED VERBATIM from the live definition (pg_get_functiondef, read 8 Aug
-- 2026) with EXACTLY TWO tokens added: `status` in the insert column list and
-- `'active'` in the select. Nothing else may drift.
--
-- Reconstructing this from memory was tried first and got three things wrong
-- in a way that would have shipped silently: club_id taken from the team
-- rather than the player, the second guard's message changed from "Your
-- account has no email address." to a sign-in message, and every explanatory
-- comment destroyed. Read the function, do not remember it.
create or replace function public.claim_roster_access()
 returns setof memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  caller_email text;
begin
  -- Fail-safe guard, matching the four existing anon-callable SECURITY DEFINER
  -- functions in this schema.
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;

  -- ⚠️ ONLY for accounts that hold NO access at all.
  --
  -- Running this on every sign-in would automatically pick up a newly-rostered
  -- sibling, which is genuinely useful — but it would ALSO silently resurrect
  -- access an admin had deliberately revoked, with no record that it happened.
  -- Re-granting revoked access is the worse failure, so it is refused here.
  -- Auto-adding siblings needs a ledger of what was granted automatically;
  -- that is separate work, deliberately not smuggled in here.
  if exists (select 1 from public.memberships m where m.profile_id = auth.uid()) then
    return;
  end if;

  return query
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select auth.uid(),
         p.club_id,
         p.team_id,
         -- ⚠️ teams.is_senior, never teams.name. A squad rename must not be
         -- able to hand an adult a 'parent' role.
         case when t.is_senior then 'player' else 'parent' end,
         p.id,
         -- ⚠️ ADDED 8 Aug 2026. A roster match IS the verification — the person
         -- proved they can read mail at an address the club already holds — so
         -- it grants outright and must never sit in the approval queue. It
         -- would inherit the column default today; stating it means a later
         -- change to that default cannot silently start queueing matched
         -- parents.
         'active'
  from public.player_contacts c
  join public.players p on p.id = c.player_id
  join public.teams   t on t.id = p.team_id
  where lower(btrim(c.email)) = lower(btrim(caller_email))
  -- Belt and braces against a double-submit racing the zero-membership guard
  -- above. memberships_unique_grant is what actually makes this safe.
  on conflict do nothing
  returning *;
end;
$function$;

commit;
