-- calendar_events_for_token carries info_only and all_day.
--
-- Spec: claude/plans/2026-08-31-club-diary.md ([PHASE 2])
-- Harness: db/tests/club-diary-allday.sql step 7
--
-- ⚠️ THE FUNCTION IS calendar_events_for_token, NOT calendar_feed. The
-- migration FILES are named calendar_feed*.sql and the spec inherited that
-- name from the filenames — a probe written from the documentation raised
-- "function does not exist", which is the LUCKY version of that mistake. A
-- file name is not an object name; resolve the object.
--
-- ADDITIVE AND INERT ON ITS OWN: nothing can set all_day until the three-way
-- time control ships, and the Deno edge function ignores columns it does not
-- read. It exists so the feed CAN see the flags before anything can produce
-- them — the ordering that keeps a midnight appointment off a subscribed phone.
--
-- ⚠️ DROP AND RECREATE IS FORCED. Postgres refuses to change the return type
-- of an existing function, and adding OUT columns to a RETURNS TABLE is a
-- return-type change. Both statements run in ONE transaction, so the function
-- is never missing from the feed's point of view.
--
-- ⚠️⚠️ THE GRANTS ARE THE DANGEROUS PART. Dropping the function drops its ACL,
-- and a NEWLY created function grants EXECUTE to PUBLIC BY DEFAULT. Recreating
-- without the revoke below silently re-opens what 20260805164810
-- calendar_feed_revoke_public_execute deliberately closed — a security
-- regression invisible in the diff, because the new body looks right.
-- Measured before writing, restored exactly, and asserted after:
--     postgres=X  anon=X  authenticated=X  service_role=X   (PUBLIC absent)
-- anon is load-bearing: calendar clients fetch the .ics unauthenticated, and
-- the token in the URL is the credential.
--
-- Body captured from pg_get_functiondef on LIVE, not from the 4 Aug file.
--
-- ⚠️ KNOCK-ON, RESOLVED THE RIGHT WAY: db/tests/tournaments.sql carried its own
-- COPY of this function (17-column signature) as scaffolding from before the
-- tournament migration shipped, and this change turned that harness red with
-- the same cannot-change-return-type error. The copy was REPOINTED to assert
-- the live function's filter rather than recreate it — an anchor is repointed,
-- never deleted, and a harness must not carry a copy of a function body.

drop function if exists public.calendar_events_for_token(uuid);

create function public.calendar_events_for_token(_token uuid)
 returns table(id uuid, type text, title text, opponent text, home boolean, venue text, pitch text, competition text, starts_at timestamp with time zone, ends_at timestamp with time zone, notes text, team_name text, league_team_name text, league_division text, round smallint, time_tbd boolean, competition_type text, info_only boolean, all_day boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select e.id, e.type, e.title, e.opponent, e.home, e.venue, e.pitch, e.competition,
         e.starts_at, e.ends_at, e.notes, t.name as team_name,
         lt.rcm_name as league_team_name, lt.division as league_division, e.round,
         e.time_tbd, e.competition_type, e.info_only, e.all_day
  from public.events e
  left join public.teams t on t.id = e.team_id
  left join public.league_teams lt on lt.id = e.league_team_id
  where exists (
    select 1
    from public.calendar_tokens ct
    join public.memberships m on m.profile_id = ct.profile_id
    where ct.token = _token
      and (
        (m.role = 'admin' and m.club_id = e.club_id)
        or m.team_id = e.team_id
        or (e.team_id is null and m.club_id = e.club_id)
      )
  )
  and e.starts_at > now() - interval '6 months'
  and e.tournament_id is null
  order by e.starts_at;
$function$;

revoke all on function public.calendar_events_for_token(uuid) from public;
grant execute on function public.calendar_events_for_token(uuid) to anon, authenticated, service_role;

do $$
declare sig text; acl text;
begin
  sig := pg_get_function_result('public.calendar_events_for_token(uuid)'::regprocedure);
  if sig not like '%all_day boolean%' or sig not like '%info_only boolean%' then
    raise exception 'calendar_events_for_token did not gain the flags: %', sig;
  end if;
  if sig not like '%time_tbd boolean%' or sig not like '%competition_type text%'
     or sig not like '%league_division text%' or sig not like '%round smallint%' then
    raise exception 'calendar_events_for_token LOST an existing column: %', sig;
  end if;

  select coalesce(array_to_string(proacl, ' '), '') into acl
    from pg_proc where oid = 'public.calendar_events_for_token(uuid)'::regprocedure;
  if acl not like '%anon=X%' then
    raise exception 'anon lost EXECUTE — the public .ics feed would 403: %', acl;
  end if;
  if acl ~ '(^|\s)=X' then
    raise exception 'PUBLIC holds EXECUTE — the revoke did not take: %', acl;
  end if;
end $$;
