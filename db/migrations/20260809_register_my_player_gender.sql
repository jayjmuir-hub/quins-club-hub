-- Gender is REQUIRED when the squad is single-gender (Jay, 9 Aug 2026).
--
-- Apply as migration `20260809xxxxxx register_my_player_gender`.
--
-- ⚠️ APPLIED TO PRODUCTION IN TWO STEPS, and the history shows both:
-- `register_my_player_gender` then `register_my_player_gender_errcode`. The
-- second only changed the gender-required raise from errcode 22023 to 22004
-- (see the note at that raise). THIS FILE IS THE FINAL STATE — running it once
-- on a rebuilt database produces the same result as running the two did.
--
-- ══ THE RULING, BOTH HALVES ═════════════════════════════════════════════
--   * a CONTRADICTORY gender warns loudly and still saves. The club has had
--     four women recorded in "Senior Men 2nd XV" — a real arrangement, not a
--     data error — and a hard block would have made those four players
--     uneditable by anybody, including whoever was trying to correct them.
--   * a BLANK gender on a single-gender squad is REFUSED. Without this the
--     rule is decoration: most players have no gender recorded, so leaving
--     the question unanswered is the path of least resistance and it defeats
--     the warning entirely.
--
-- ══ WHY THIS IS IN THE DATABASE AND NOT ONLY IN THE FORM ════════════════
-- register_my_player is the one function in this schema that lets a person
-- with NO membership — an unapproved stranger with a confirmed email — create
-- rows. Everything else runs behind can_edit_team. A check that lives only in
-- AddYourPlayer.jsx is a check that anyone with the REST endpoint skips, and
-- this is precisely the caller who has no reason to use our form.
--
-- ⚠️ THE NAME RULE IS NOW WRITTEN TWICE, and that is a real cost, stated
-- rather than hidden: private.squad_expects_gender below MIRRORS squadExpects
-- in src/lib/gender.js. They must agree. tests/gender.test.js pins the JS side
-- against all 18 live squad names and db/tests/squad-gender.sql pins this side
-- against the same list, so a change to one shows up as a failure rather than
-- as two systems quietly disagreeing about a twelve-year-old.

begin;

-- ── The rule. Mirrors squadExpects() in src/lib/gender.js. ──────────────
--
-- ⚠️ lower() FIRST, then a case-SENSITIVE match. `~*` with a negated bracket
-- expression like [^a-z] is subtle in Postgres — case folding applies inside
-- brackets, including negated ones — and "subtle" is not what should decide
-- whether a child's squad is treated as girls-only. Lowercasing the input
-- makes the pattern mean exactly what it looks like.
--
-- ⚠️ THE SUFFIX MUST TOUCH THE DIGITS. "U6 Tag" ends in a G. If the pattern
-- allowed anything between the number and the letter, every Tag squad in the
-- club would be classified girls-only. The character after the digits must BE
-- the b or g.
create or replace function private.squad_expects_gender(_name text)
 returns text
 language sql
 immutable
as $function$
  select case
    -- Word boundaries, not substring search. `like '%men%'` is also true of
    -- "Development" and "Improvers"; nothing is named that today, which is the
    -- only reason the old JS version's `includes('men')` never misfired.
    when _name is null                                       then null
    when lower(_name) ~ '\y(women|girls)\y'                  then 'female'
    when lower(_name) ~ '\y(men|boys)\y'                     then 'male'
    when lower(btrim(_name)) ~ '^u[0-9]{1,2}g([^a-z]|$)'     then 'female'
    when lower(btrim(_name)) ~ '^u[0-9]{1,2}b([^a-z]|$)'     then 'male'
    else null
  end;
$function$;

comment on function private.squad_expects_gender(text) is
  'The gender a squad name implies, or null for a mixed squad. MIRRORS '
  'squadExpects() in src/lib/gender.js — change both or neither. Female is '
  'tested before male so a "Men''s & Women''s" squad is not called a men''s side.';

-- Matches the other private helpers in this schema.
revoke execute on function private.squad_expects_gender(text) from public;
grant execute on function private.squad_expects_gender(text) to authenticated, anon;

-- ── The new signature ───────────────────────────────────────────────────
-- ⚠️ COPIED VERBATIM from the live definition (pg_get_functiondef, read 9 Aug
-- 2026). The ONLY additions are the p_gender parameter, the two guards marked
-- ADDED below, and the column in the players insert. Reconstructing this
-- function from memory was tried once before, on 8 Aug, and got three things
-- wrong in a way that would have shipped silently. Read it, do not remember it.
--
-- p_gender has a DEFAULT so a two-argument call still resolves here after the
-- old signature is dropped. That matters for the deploy window: between this
-- migration landing and the new bundle reaching a parent's phone, the old
-- client calls with two arguments. It will now be REFUSED on a single-gender
-- squad with a clear sentence, rather than quietly writing a blank.
create or replace function public.register_my_player(
  p_full_name text,
  p_team_id   uuid,
  p_gender    text default null
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

  -- ⚠️ ADDED 9 Aug 2026. Checked BEFORE the value is used, so an unrecognised
  -- string is reported as a bad value rather than surfacing later as a CHECK
  -- constraint violation the client has no sentence for.
  clean_gender := nullif(btrim(lower(p_gender)), '');
  if clean_gender is not null and clean_gender not in ('male', 'female') then
    raise exception 'Gender must be male or female.' using errcode = '22023';
  end if;

  -- ⚠️ ADDED 9 Aug 2026. THE REQUIREMENT. Deliberately does NOT check whether
  -- the gender AGREES with the squad — a contradiction is allowed through by
  -- design and is warned about in the UI. Only absence is refused.
  --
  -- ⚠️ ERRCODE 22004 (null_value_not_allowed), NOT 22023 like the guards
  -- above it. Not pedantry: src/data/members.js maps 22023 to one generic
  -- sentence about names and age groups, because that code covers three
  -- different guards and none of their server messages is worth showing. This
  -- one IS — it names the squad, and the squad is the whole reason the field
  -- became mandatory. A distinct code is what lets the client pass this
  -- message through verbatim without also passing through the other three.
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

  insert into public.player_contacts (player_id, email)
  values (new_player.id, lower(btrim(caller_email)));

  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, team_row.id,
          case when team_row.is_senior then 'player' else 'parent' end,
          new_player.id, 'pending')
  returning * into new_membership;

  return new_membership;
end;
$function$;

-- ⚠️ THE OLD SIGNATURE MUST GO, not be left alongside. Postgres prefers an
-- EXACT arity match over one satisfied by a default, so a two-argument call
-- would keep resolving to the old function — which has no gender check at all
-- — and the requirement would apply to nobody using yesterday's client.
drop function if exists public.register_my_player(text, uuid);

-- ⚠️ GRANTS ARE NOT INHERITED by a new signature, and DROP takes the old
-- ACLs with it. Restated verbatim from the live proacl read on 9 Aug 2026:
-- {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}.
-- Getting this wrong is not theoretical — on 8 Aug a revoke with no matching
-- grant broke every events query in production for about a minute.
revoke execute on function public.register_my_player(text, uuid, text) from public;
grant execute on function public.register_my_player(text, uuid, text) to authenticated, anon;

-- ── THE GUARD. Reads the result back, inside the transaction. ───────────
do $$
declare
  n_old int;
  n_new int;
begin
  select count(*) into n_old from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'register_my_player' and p.pronargs = 2;
  select count(*) into n_new from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'register_my_player' and p.pronargs = 3;

  if n_old <> 0 then
    raise exception 'ABORTING: the 2-argument register_my_player still exists; a two-arg call would bypass the gender check.';
  end if;
  if n_new <> 1 then
    raise exception 'ABORTING: expected exactly one 3-argument register_my_player, found %.', n_new;
  end if;

  -- The name rule itself, against the real squad list. A silent regex change
  -- here is the failure that matters, and it would otherwise be invisible.
  if private.squad_expects_gender('U6 Tag') is not null then
    raise exception 'ABORTING: "U6 Tag" classified as single-gender — the suffix pattern is matching the G in Tag.';
  end if;
  if private.squad_expects_gender('U12G QR') <> 'female'
     or private.squad_expects_gender('U14B Contact') <> 'male'
     or private.squad_expects_gender('U13 Mixed Contact') is not null
     or private.squad_expects_gender('Senior Men 1st XV') <> 'male'
     or private.squad_expects_gender('Women''s XV') <> 'female' then
    raise exception 'ABORTING: squad_expects_gender disagrees with the known squad list.';
  end if;

  raise notice 'guard passed: 3-arg only, and the name rule agrees with the squad list';
end $$;

commit;
