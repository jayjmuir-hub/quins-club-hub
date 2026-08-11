-- A U13+ player may register THEMSELVES, not only be registered by a parent
-- (Jay, 11 Aug 2026).
--
-- Apply as migration `20260811xxxxxx self_registration`.
--
-- ══ THE PROBLEM ═════════════════════════════════════════════════════════
-- register_my_player derives the role from ONE line:
--   case when team_row.is_senior then 'player' else 'parent' end
-- Every squad has is_senior = false since the senior squads were deleted on
-- 10 Aug, so EVERY self-registration produces a 'parent' — including an
-- 18-year-old registering himself, who is then shown as the Parent of a player
-- record that is him.
--
-- ⚠️ THE ROLE IS COSMETIC AND THAT IS WHY THIS IS SAFE. No RLS policy
-- distinguishes 'parent' from 'player' (zero matches in db/schema/policies.sql,
-- checked 11 Aug 2026); private.is_own_player uses `role in ('parent','player')`
-- and src/lib/scope.js treats them identically. This migration changes a WORD,
-- not an access boundary. If that ever stops being true, this comment is the
-- thing that was relied on.
--
-- ══ WHY A COLUMN AND NOT THE SQUAD'S NAME ═══════════════════════════════
-- ⚠️ 20260806_claim_roster_access.sql ruled: "teams.is_senior, never
-- teams.name. A squad rename must not be able to hand an account a role it
-- shouldn't have." Parsing "U13" out of the name would let renaming a squad
-- silently change who may hold their own account.
--
-- private.squad_expects_gender DOES parse the name, and that is not a
-- counter-example: it validates the data being entered, it does not decide who
-- gets an account. The distinction is the whole reason this is a column.
--
-- ══ THE DEPLOY WINDOW ═══════════════════════════════════════════════════
-- p_self_register has a DEFAULT, so a THREE-argument call from yesterday's
-- bundle still resolves here and still behaves exactly as it does today. The
-- three-argument signature is then dropped, because Postgres prefers an exact
-- arity match over one satisfied by a default — leaving it in place would mean
-- every existing client kept calling a function with no self-registration
-- support at all, and the feature would apply to nobody. That is the same trap
-- 20260809_register_my_player_gender.sql documents; read it before changing
-- anything here.

begin;

-- ── 1. The permission, as data ──────────────────────────────────────────
alter table public.teams
  add column if not exists self_registration_allowed boolean not null default false;

comment on column public.teams.self_registration_allowed is
  'Whether a player in this squad may register THEMSELVES rather than being '
  'registered by a parent. Jay''s ruling 11 Aug 2026: U13 and above. Set '
  'deliberately per squad — NEVER derived from teams.name, so that renaming a '
  'squad cannot change who may hold their own account.';

-- The seven squads at U13 and above, named explicitly. A human read this list
-- against the live squad table; the guard at the bottom asserts the count so a
-- typo fails the migration instead of quietly enabling six squads or eight.
update public.teams
   set self_registration_allowed = true
 where name in (
   'U13 Mixed Contact',
   'U14B Contact',
   'U14G QR',
   'U16B Contact',
   'U16G Contact',
   'U18B Contact',
   'U18G Contact'
 );

-- ── 2. The new signature ────────────────────────────────────────────────
-- ⚠️ COPIED VERBATIM from 20260809_register_my_player_gender.sql, which was
-- itself copied from pg_get_functiondef. The ONLY additions are the
-- p_self_register parameter, the guard marked ADDED, and the role expression.
-- Reconstructing this function from memory was tried on 8 Aug and got three
-- things wrong silently. Read it, do not remember it.
create or replace function public.register_my_player(
  p_full_name     text,
  p_team_id       uuid,
  p_gender        text default null,
  p_self_register boolean default false
)
 returns public.memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  caller_email  text;
  confirmed_at  timestamptz;
  pending_count int;
  new_player    public.players;
  new_membership public.memberships;
  clean_name    text;
  clean_gender  text;
  team_row      public.teams;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();

  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;
  if confirmed_at is null then
    raise exception 'Please confirm your email address before adding a player.'
      using errcode = '42501';
  end if;

  clean_name := nullif(btrim(p_full_name), '');
  if clean_name is null then
    raise exception 'Enter the player''s name.' using errcode = '22023';
  end if;
  if length(clean_name) > 80 then
    raise exception 'That name is too long.' using errcode = '22023';
  end if;

  select * into team_row from public.teams where id = p_team_id;
  if team_row.id is null then
    raise exception 'That age group does not exist.' using errcode = '22023';
  end if;

  -- ⚠️ ADDED 11 Aug 2026. THE REFUSAL, and it lives here rather than only in
  -- AddYourPlayer.jsx for the same reason the gender rule does:
  -- register_my_player is the one function in this schema a person with NO
  -- membership can call, so a check that exists only in the form is a check
  -- that anyone calling the REST endpoint skips.
  --
  -- ⚠️ ERRCODE 0A000, and the choice is deliberate. src/data/members.js maps
  -- 42501 to a sentence about confirming your email address, which would be a
  -- lie here. Codes ABSENT from that map fall through to error.message intact,
  -- which is what this raise wants — the same mechanism the 22004 gender raise
  -- relies on. Do not "tidy" this onto 42501.
  if p_self_register and not coalesce(team_row.self_registration_allowed, false) then
    raise exception 'Players in % cannot register themselves — a parent or carer has to do it.',
      team_row.name using errcode = '0A000';
  end if;

  clean_gender := nullif(btrim(lower(p_gender)), '');
  if clean_gender is not null and clean_gender not in ('male', 'female') then
    raise exception 'Gender must be male or female.' using errcode = '22023';
  end if;

  -- ⚠️ UNCHANGED 9 Aug rule: absence is refused, contradiction is allowed and
  -- warned about in the UI. It applies whoever is registering — a U16B player
  -- registering himself still has to answer.
  if clean_gender is null and private.squad_expects_gender(team_row.name) is not null then
    raise exception '% is a single-gender squad, so the player''s gender has to be recorded.',
      team_row.name using errcode = '22004';
  end if;

  select count(*) into pending_count
    from public.memberships
   where profile_id = auth.uid() and status = 'pending';
  if pending_count >= 5 then
    raise exception 'You already have % players waiting to be approved. Please wait for the club to review them.', pending_count
      using errcode = '42901';
  end if;

  insert into public.players (club_id, team_id, full_name, gender)
  values (team_row.club_id, team_row.id, clean_name, clean_gender)
  returning * into new_player;

  -- ⚠️ UNCHANGED, and worth stating: this is the PLAYER's contact row, and for
  -- a self-registering player the caller's email genuinely IS the player's.
  -- The guardian does not go here — that is player_parents, which carries its
  -- own "warn, never block" ruling.
  insert into public.player_contacts (player_id, email)
  values (new_player.id, lower(btrim(caller_email)));

  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, team_row.id,
          -- ⚠️ is_senior IS DELIBERATELY STILL HERE. If a senior squad ever
          -- returns, its players are players whether or not anyone remembers
          -- to set the new column.
          case when p_self_register or team_row.is_senior then 'player' else 'parent' end,
          new_player.id, 'pending')
  returning * into new_membership;

  return new_membership;
end;
$function$;

-- ⚠️ THE OLD SIGNATURE MUST GO. Postgres prefers an EXACT arity match over one
-- satisfied by a default, so a three-argument call would keep resolving to the
-- old function and no client would ever reach the new parameter.
drop function if exists public.register_my_player(text, uuid, text);

-- ⚠️ GRANTS ARE NOT INHERITED by a new signature, and DROP takes the old ACLs
-- with it. Restated from the 9 Aug proacl read:
-- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}.
-- On 8 Aug a revoke with no matching grant broke every events query in
-- production for about a minute.
revoke execute on function public.register_my_player(text, uuid, text, boolean) from public;
grant execute on function public.register_my_player(text, uuid, text, boolean) to authenticated, anon;

-- ── THE GUARD. Reads the result back, inside the transaction. ───────────
do $$
declare
  n_old   int;
  n_new   int;
  n_allow int;
  n_young int;
begin
  select count(*) into n_old from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'register_my_player' and p.pronargs = 3;
  select count(*) into n_new from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'register_my_player' and p.pronargs = 4;

  if n_old <> 0 then
    raise exception 'ABORTING: the 3-argument register_my_player still exists; every client would keep resolving to it.';
  end if;
  if n_new <> 1 then
    raise exception 'ABORTING: expected exactly one 4-argument register_my_player, found %.', n_new;
  end if;

  -- ⚠️ The count is the point. An UPDATE that matched nothing because a squad
  -- was renamed reports "success" and changes no rows; reading it back is the
  -- only thing that tells the difference. A Postgres self-assignment reporting
  -- success while changing nothing has already happened here once (6 Aug).
  select count(*) into n_allow from public.teams where self_registration_allowed;
  if n_allow <> 7 then
    raise exception 'ABORTING: expected 7 squads to allow self-registration, found %. Has a squad been renamed?', n_allow;
  end if;

  -- And the other side of it: nothing below U13 may have been caught.
  select count(*) into n_young from public.teams
   where self_registration_allowed
     and name in ('U6 Tag','U7 Tag','U8 Tag','U9 Mixed Contact','U10 Mixed Contact',
                  'U11 Mixed Contact','U12 Mixed Contact','U12G QR');
  if n_young <> 0 then
    raise exception 'ABORTING: % squad(s) below U13 were enabled for self-registration.', n_young;
  end if;

  raise notice 'guard passed: 4-arg only, 7 squads enabled, none below U13';
end $$;

commit;
