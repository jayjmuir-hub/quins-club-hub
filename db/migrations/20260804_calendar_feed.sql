-- ---------------------------------------------------------------------
-- Calendar subscription feed                     (4 Aug 2026, Jay's brief)
--
-- "Export the schedule to Google and Apple calendar", chosen as a
-- SUBSCRIPTION rather than a one-off .ics download: a downloaded file is a
-- snapshot, so rescheduling a match leaves everyone's calendar silently
-- wrong, which is worse than having no calendar entry at all.
--
-- A calendar client cannot hold a Supabase session. It fetches a URL on a
-- timer, with no cookies, no JWT and no way to refresh a token. So the URL
-- itself has to carry the authorisation, which makes it a BEARER CREDENTIAL
-- and drives every decision below:
--
--   * the token is a random uuid, not the profile id -- a feed URL keyed on
--     something guessable or enumerable would be no protection at all;
--   * it is per person and REVOCABLE, because a subscription URL ends up in
--     phone backups, shared calendars and screenshots;
--   * the feed returns ONLY what that person may already see in the app, so
--     a leaked URL exposes their own fixtures and nothing wider.
--
-- The feed is read by an Edge Function (supabase/functions/calendar), which
-- holds the ANON key only. All authorisation lives in the SECURITY DEFINER
-- function at the bottom of this file -- one auditable place, rather than
-- trusting a service-role key in an edge runtime to filter correctly.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- 1. calendar_tokens
--
-- One row per profile. Resetting a link DELETEs and re-inserts rather than
-- updating in place, so the old token stops working the instant the new one
-- exists -- an update-in-place with a "previous token" grace period is
-- exactly the thing someone asks for after being locked out of their own
-- calendar, and it is also how a revoked link keeps working.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_tokens (
  profile_id  uuid        NOT NULL,
  token       uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at  timestamptz          DEFAULT now(),
  CONSTRAINT calendar_tokens_pkey            PRIMARY KEY (profile_id),
  CONSTRAINT calendar_tokens_token_key       UNIQUE (token),
  CONSTRAINT calendar_tokens_profile_id_fkey FOREIGN KEY (profile_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Own row only, all verbs. There is deliberately NO admin policy: an admin
-- has no reason to read someone else's feed URL, and a table of live bearer
-- credentials is the last place to widen read access for convenience.
DROP POLICY IF EXISTS "calendar token own" ON public.calendar_tokens;
CREATE POLICY "calendar token own" ON public.calendar_tokens
  AS PERMISSIVE FOR ALL TO public
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());


-- ---------------------------------------------------------------------
-- 2. my_calendar_token() -- fetch-or-create, for the signed-in caller
--
-- Returns the caller's token, minting one on first use. SECURITY INVOKER on
-- purpose: the RLS policy above is already exactly right, so there is nothing
-- for a definer to add except a way to get it wrong.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_calendar_token()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select token into existing from public.calendar_tokens where profile_id = auth.uid();
  if existing is not null then
    return existing;
  end if;

  insert into public.calendar_tokens (profile_id) values (auth.uid())
  returning token into existing;

  return existing;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.my_calendar_token() TO authenticated;


-- ---------------------------------------------------------------------
-- 3. reset_my_calendar_token() -- revoke and reissue
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_my_calendar_token()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  fresh uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  delete from public.calendar_tokens where profile_id = auth.uid();
  insert into public.calendar_tokens (profile_id) values (auth.uid())
  returning token into fresh;

  return fresh;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.reset_my_calendar_token() TO authenticated;


-- ---------------------------------------------------------------------
-- 4. calendar_events_for_token(_token uuid) -- THE authorisation boundary
--
-- Called by the Edge Function with the ANON key, because the caller is a
-- calendar client with no session. Everything that decides what comes back
-- is therefore in here.
--
-- The visibility rule is a deliberate, line-by-line mirror of
-- private.can_see_team, with the profile resolved from the token instead of
-- auth.uid():
--     admin of the team's club  ->  every team in that club
--     otherwise                 ->  teams they hold a membership row for
-- If can_see_team ever changes, THIS MUST CHANGE WITH IT. That duplication is
-- the price of a caller with no JWT; the alternative -- letting the edge
-- runtime filter -- moves the decision somewhere far easier to get wrong and
-- far harder to test.
--
-- An unknown or revoked token returns ZERO ROWS rather than raising. A
-- calendar client polls on a timer and shows the user nothing useful either
-- way, and an error that distinguishes "no such token" from "token with no
-- fixtures" is an oracle for guessing tokens.
--
-- Deliberately returns only what an ICS entry needs. Nothing here exposes a
-- contact detail, a player name or a parent -- a bearer URL in someone's
-- phone backup should reach fixtures, and only fixtures.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calendar_events_for_token(_token uuid)
 RETURNS TABLE (
   id uuid,
   type text,
   title text,
   opponent text,
   home boolean,
   venue text,
   competition text,
   starts_at timestamptz,
   team_name text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.competition,
         e.starts_at, t.name as team_name
  from public.events e
  join public.teams t on t.id = e.team_id
  where exists (
    select 1
    from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and (
        (m.role = 'admin' and m.club_id = t.club_id)
        or m.team_id = e.team_id
      )
  )
  -- A calendar is not an archive. Six months back keeps the season's results
  -- visible without asking every client to sync years of history forever.
  and e.starts_at > now() - interval '6 months'
  order by e.starts_at;
$function$;

REVOKE ALL ON FUNCTION public.calendar_events_for_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.calendar_events_for_token(uuid) TO authenticated;
