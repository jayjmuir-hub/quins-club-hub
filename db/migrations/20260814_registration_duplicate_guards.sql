-- 14 Aug 2026 — stop self-registration creating a second roster spot for a
-- child who is already on it, and stop a parent registering THEMSELVES as a
-- player.
--
-- ══ ⚠️ WHAT ACTUALLY HAPPENED, MEASURED ON THE LIVE ROSTER ════════════════
--
-- Reported by Jay, 14 Aug 2026, from the real club. Two DIFFERENT failures that
-- look like one problem from the Accounts screen:
--
--   1. ONE CHILD, TWO ROSTER SPOTS, TWO ACCOUNTS — U18B Contact.
--      `Yassine Dhaouadi`      created by his father's account (role parent)
--      `yassine ridha dhaouadi` created by the boy's own account (role player)
--      Neither account could see the other's row, so neither had any way to
--      know. Nothing in the app or the database looked at the name.
--
--   2. A PARENT ON THE ROSTER AS A PLAYER — U14B Contact.
--      Account `Govert Buijs-Bernad` registered TWO "children": `GOVERT BUIJS`
--      (himself) and `Juan Buijs-Bernad` (his son). Both landed as role
--      `parent`, so the "Who are you registering?" control was left on its
--      default — "My child" — while his own name went in the name box.
--
-- ⚠️ `register_my_player` HAD NO IDEA EITHER HAD HAPPENED. It INSERTs a new
-- `players` row unconditionally on every call. There was no uniqueness of any
-- kind, at any layer, on a roster of children.
--
-- ══ ⚠️ WHY THE CHECK CANNOT LIVE IN THE CLIENT ════════════════════════════
--
-- The obvious fix is "look for an existing player before submitting". **The
-- registering parent cannot see one.** They hold a PENDING membership, and
-- `player read` is `private.can_see_team(...)`, which requires
-- `status = 'active'` — that is the whole point of the pending design
-- (20260808_membership_pending_status.sql), and it is what stops a stranger
-- typing "U13" and reading every child's name.
--
-- So a client-side duplicate check would query as the parent, get zero rows,
-- and confidently report "no duplicate" every single time. The check has to run
-- inside this SECURITY DEFINER function, which is the one thing that can see
-- the squad on their behalf.
--
-- ══ ⚠️ THE DISCLOSURE THIS ACCEPTS, STATED RATHER THAN SNEAKED IN ═════════
--
-- Telling somebody "a player with that name is already registered in U18B"
-- confirms, to any account with a confirmed email, that a child by that name is
-- in that squad. It is an enumeration oracle and a refusal creates no row, so
-- it is not rate-limited by the pending cap.
--
-- Accepted deliberately, and the reasoning is: the probe requires GUESSING a
-- child's exact first and last name AND their squad, which is knowledge the
-- guesser mostly already has; the alternative designs are worse (silently
-- accept the duplicate, or accept it and queue it for an admin, both of which
-- leave the roster wrong); and the message deliberately **does not echo the
-- stored spelling**, so it reveals nothing beyond a yes/no about a string the
-- person typed themselves. ⚠️ If the club ever grows to the point where this
-- matters, the fix is to move the answer behind approval rather than to delete
-- the check.

-- ── The matching rule ──────────────────────────────────────────────────────
--
-- FIRST token + LAST token, case-folded, punctuation-blind. That is what makes
-- the real U18 case match:
--
--   'Yassine Dhaouadi'       -> 'yassine dhaouadi'
--   'yassine ridha dhaouadi' -> 'yassine dhaouadi'   <-- middle name ignored
--
-- and what correctly leaves the real U14 pair alone:
--
--   'GOVERT BUIJS'      -> 'govert buijs'
--   'Juan Buijs-Bernad' -> 'juan bernad'
--
-- ⚠️ `[^[:alnum:]]+` RATHER THAN `[^a-z0-9]+`, and the difference is not
-- cosmetic in this club — which already has Arabic-script and accented names on
-- the roster. The class is unicode-aware, so both survive intact:
--
--   'José García'  -> 'josé garcía'     (NOT mangled to 'jos garcia', which
--                                        would collide with a different 'Jos')
--   'يوسف'          -> 'يوسف'            (kept, and compares like any other name)
--
-- Measured, not assumed — an earlier draft of this comment claimed non-Latin
-- names "reduce to nothing", and the test showed they do not.
--
-- NULL comes back only for a name with no alphanumerics AT ALL (punctuation or
-- symbols alone), and a NULL key never matches anything — so that case fails
-- OPEN. That is the right direction to fail: a missed duplicate is a tidy-up, a
-- false block is a family that cannot register.
create or replace function private.name_match_key(_name text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
           when parts is null or cardinality(parts) = 0 then null
           when parts[1] = '' then null
           when cardinality(parts) = 1 then parts[1]
           else parts[1] || ' ' || parts[cardinality(parts)]
         end
  from (
    select nullif(
             regexp_split_to_array(
               btrim(regexp_replace(lower(coalesce(_name, '')), '[^[:alnum:]]+', ' ', 'g')),
               ' '
             ),
             array[]::text[]
           ) as parts
  ) t;
$function$;

revoke execute on function private.name_match_key(text) from public;
revoke execute on function private.name_match_key(text) from anon;
grant execute on function private.name_match_key(text) to authenticated;

-- ── The function ───────────────────────────────────────────────────────────
--
-- ⚠️ DROPPED AND RECREATED, NOT `create or replace`, BECAUSE THE ARITY CHANGES.
-- state-of-play records the lesson from 11 Aug: "Postgres prefers an exact
-- arity match, so leaving [the old one] would have left every client resolving
-- to a function with no self-registration support and nothing failing to say
-- so." Two overloads would also make the PostgREST call ambiguous.
--
-- ⚠️ THE TWO NEW PARAMETERS DEFAULT TO false, WHICH IS WHAT MAKES THIS SAFE TO
-- APPLY BEFORE THE DEPLOY. PostgREST calls an RPC with NAMED arguments, so the
-- bundle currently serving — which sends the four it knows about — resolves to
-- this function and gets the guards switched on. That is the desired outcome:
-- the fix protects the live app immediately, and the new bundle only adds the
-- means to override it.
drop function if exists public.register_my_player(text, uuid, text, boolean);

create or replace function public.register_my_player(
  p_full_name        text,
  p_team_id          uuid,
  p_gender           text    default null,
  p_self_register    boolean default false,
  -- ⚠️ TWO SEPARATE CONFIRMATIONS, NOT ONE. A single flag would mean that
  -- confirming "yes, a different child who happens to share the name" ALSO
  -- silently waved through "yes, I am registering myself as my own child".
  -- They are different mistakes, the person is shown a different sentence for
  -- each, and each tick may only forgive the thing it was shown.
  p_confirm_duplicate  boolean default false,
  p_confirm_self_name  boolean default false
)
returns memberships
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
  name_key      text;
  caller_key    text;
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

  -- ⚠️ ADDED 11 Aug 2026. Server-side because register_my_player is the one
  -- function a person with NO membership can call. ERRCODE 0A000 deliberately:
  -- src/data/members.js maps 42501 to a sentence about confirming your email,
  -- which would be a lie here. Codes absent from that map fall through to
  -- error.message intact.
  if p_self_register and not coalesce(team_row.self_registration_allowed, false) then
    raise exception 'Players in % cannot register themselves — a parent or carer has to do it.',
      team_row.name using errcode = '0A000';
  end if;

  clean_gender := nullif(btrim(lower(p_gender)), '');
  if clean_gender is not null and clean_gender not in ('male', 'female') then
    raise exception 'Gender must be male or female.' using errcode = '22023';
  end if;

  if clean_gender is null and private.squad_expects_gender(team_row.name) is not null then
    raise exception '% is a single-gender squad, so the player''s gender has to be recorded.',
      team_row.name using errcode = '22004';
  end if;

  name_key := private.name_match_key(clean_name);

  -- ══ GUARD 1: THIS PLAYER IS ALREADY ON THE ROSTER ═══════════════════════
  --
  -- Scoped to the SQUAD, not the club: brothers in different age groups
  -- routinely share a surname, and two boys called Tom Smith in U12 and U16 are
  -- two boys. Within one squad the same first-and-last name is overwhelmingly
  -- the same child being added twice.
  --
  -- ⚠️ THE MESSAGE DOES NOT ECHO THE STORED SPELLING. See the disclosure note
  -- at the top of this file — a yes/no about a string the person typed is the
  -- minimum that still makes the check useful.
  if name_key is not null and not p_confirm_duplicate then
    if exists (
      select 1 from public.players pl
       where pl.team_id = team_row.id
         and private.name_match_key(pl.full_name) = name_key
    ) then
      raise exception 'Someone with that name is already registered in %. If that is your player, they are already on the roster — ask the club to connect you to them rather than adding them again.',
        team_row.name using errcode = '42710';
    end if;
  end if;

  -- ══ GUARD 2: THAT IS YOUR OWN NAME ══════════════════════════════════════
  --
  -- ⚠️ ONLY WHEN THEY SAID "MY CHILD". A U13+ player registering THEMSELVES is
  -- supposed to type their own name — that is the entire feature, and firing
  -- here would break it. The signal is the contradiction: your own name, filed
  -- as somebody else.
  --
  -- ⚠️ THE PROFILE ALREADY HAS A NAME BY THIS POINT, EVEN ON A FIRST
  -- REGISTRATION. PlayerRegistrationForm writes it before the first call to
  -- this function, deliberately — 13 Aug 2026, to close the race where an
  -- approval queue row existed before the person had a name. That fix is what
  -- makes this guard work on the very registration it most needs to catch.
  if not p_self_register and not p_confirm_self_name then
    select private.name_match_key(
             coalesce(
               nullif(btrim(pr.full_name), ''),
               btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, ''))
             )
           )
      into caller_key
      from public.profiles pr
     where pr.id = auth.uid();

    if caller_key is not null and name_key is not null and caller_key = name_key then
      if coalesce(team_row.self_registration_allowed, false) then
        raise exception 'That is your own name, but you have said you are registering a child. If you are the player, choose "I am the player". If you are registering your child, use their name.'
          using errcode = '42809';
      else
        raise exception 'That is your own name, but you have said you are registering a child. Players in % cannot register themselves, so if this is you, ask the club to set your access up instead.',
          team_row.name using errcode = '42809';
      end if;
    end if;
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

-- ⚠️ THE DROP TOOK EVERY GRANT WITH IT, and a recreated function in `public` is
-- anon-executable again immediately through Supabase's default privileges — see
-- 20260813_revoke_anon_execute.sql. `anon` IS INTENTIONAL HERE, unlike most of
-- the schema: 20260809_register_my_player_gender.sql and
-- 20260811_self_registration.sql both grant it deliberately, and
-- db/tests/grants.sql §3b asserts that it keeps it.
revoke execute on function public.register_my_player(text, uuid, text, boolean, boolean, boolean) from public;
grant execute on function public.register_my_player(text, uuid, text, boolean, boolean, boolean)
  to authenticated, anon;

-- ══ WHAT THIS DOES NOT DO ═════════════════════════════════════════════════
--
-- ⚠️ IT DOES NOT CLEAN UP THE TWO BAD ROWS ALREADY ON THE ROSTER. `GOVERT
-- BUIJS` and the duplicate `yassine ridha dhaouadi` are real rows attached to
-- real accounts, and deleting a child's record is a decision for the club, not
-- a side effect of a migration. They are listed at the top of this file so
-- whoever does it knows exactly which two.
--
-- ⚠️ IT DOES NOT ADD A DATABASE CONSTRAINT. A unique index on
-- (team_id, name_match_key(full_name)) would look stronger and would be wrong:
-- an admin adding a genuine second `Tom Smith` from the Accounts screen must
-- not be blocked, and neither must a coach fixing a spelling. The guard belongs
-- on the SELF-REGISTRATION path, which is where the mistake is made by people
-- who cannot see the roster they are duplicating.
