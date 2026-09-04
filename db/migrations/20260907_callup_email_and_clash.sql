-- ══════════════════════════════════════════════════════════════════════════
--  Call-ups, the two pieces #689 left out: the family's EMAIL on an ask, and
--  the same-day CLASH NOTE for a player picked in two squads
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-02-senior-squads.md Part 3. Built 4 Sep 2026.
--
-- 1. Email. #689 pushed the family and named email as not built. This adds a
--    notify-callup edge function (supabase/functions/notify-callup/index.ts),
--    the same shape as notify-approval, and posts { request_id } to it from
--    request_callup. `callup_notify_url` is derived from approval_notify_url
--    in the vault (the 20260812_access_request_notify pattern), so the host
--    cannot drift; the gate is approval_notify_secret, reused.
--
-- 2. The clash note. "When a player in two squads has fixtures in both on
--    the same day, both fixtures show 'also selected for U18B v Exiles,
--    11:00'." Read from events and lineups; nothing stored.
--    public.event_clashes(_event) returns, for a fixture, every player on
--    one of its lineups who is also on a lineup of another fixture that
--    same club day, with the other fixture's squad, opponent and time.
--    Callable by anyone attached to the fixture's squad (the same reach as
--    reading the event); names only.
--
-- ⚠️ THE EMAIL MUST NEVER FAIL THE ASK. The http_post is wrapped; a Resend
-- outage leaves the request filed and the push (already sent) standing.

-- ── 1a. the endpoint ───────────────────────────────────────────────────────
do $$
declare base text;
begin
  if exists (select 1 from vault.secrets where name = 'callup_notify_url') then return; end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'approval_notify_url';
  if base is null then
    raise exception 'approval_notify_url is missing from the vault; cannot derive the call-up endpoint';
  end if;
  perform vault.create_secret(
    regexp_replace(base, '/notify-approval$', '/notify-callup'),
    'callup_notify_url',
    'Endpoint request_callup posts { request_id } to. Derived from approval_notify_url so the host cannot drift. Not a credential - the gate is approval_notify_secret, which this function reuses.'
  );
end $$;

-- ── 1b. the sender ─────────────────────────────────────────────────────────
create or replace function private.notify_callup_email(_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare endpoint text; secret text;
begin
  if current_setting('app.harness', true) = 'on' then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'callup_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'notify_callup_email: vault secrets missing, no email sent for request %', _request;
    return;
  end if;
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('request_id', _request));
exception when others then
  raise warning 'notify_callup_email: %', sqlerrm;
end;
$$;
revoke execute on function private.notify_callup_email(uuid) from public;

-- ── 1c. request_callup, now emailing the family too ────────────────────────
-- Identical to 20260906_callups.sql's body plus the one perform line.
create or replace function public.request_callup(_player uuid, _senior_team uuid)
returns public.callup_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  senior public.teams; p public.players; pp public.player_private; req public.callup_requests;
  home_name text;
begin
  select * into senior from public.teams where id = _senior_team;
  select * into p from public.players where id = _player;
  if senior.id is null or not senior.is_senior or p.id is null then
    raise exception 'No such squad or player.' using errcode = '22023';
  end if;
  if not private.can_edit_team(_senior_team) then
    raise exception 'Only the senior squad''s staff can request a call-up.' using errcode = '42501';
  end if;
  select * into pp from public.player_private where player_id = _player;
  if pp.date_of_birth is null
     or pp.date_of_birth > current_date - make_interval(years => private.callup_min_age(senior.club_id)) then
    raise exception 'This player is under the club''s call-up age.' using errcode = '42501';
  end if;
  if exists (select 1 from public.memberships m where m.player_id = _player and m.team_id = _senior_team and m.status = 'active') then
    raise exception 'Already in this squad.' using errcode = '22023';
  end if;
  select name into home_name from public.teams where id = p.team_id;

  insert into public.callup_requests (club_id, player_id, home_team_id, senior_team_id, requested_by)
  values (senior.club_id, _player, p.team_id, _senior_team, auth.uid())
  returning * into req;

  if pp.senior_callup_consent_at is not null then
    perform private.apply_callup(req.id, true, auth.uid());
    select * into req from public.callup_requests where id = req.id;
  else
    perform private.push_to_profiles(private.callup_family(_player), 'approval',
      senior.name || ' would like to call up ' || p.full_name,
      'Say yes or no in the app.', '/callups', 'callup-' || req.id);
    perform private.notify_callup_email(req.id);
  end if;
  perform private.push_to_profiles(
    (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(senior.club_id, p.team_id, auth.uid()) as a),
    'approval', 'Call-up requested — ' || p.full_name,
    senior.name || ' has asked to call up ' || p.full_name || ' from ' || coalesce(home_name, 'their squad') || '.',
    '/callups', 'callup-' || req.id);
  return req;
end;
$$;

-- ── 2. the clash note ──────────────────────────────────────────────────────
create or replace function public.event_clashes(_event uuid)
returns table (player_id uuid, full_name text, other_event_id uuid, other_team text, other_title text, other_starts_at timestamptz, other_time_tbd boolean)
language plpgsql
stable security definer
set search_path = public
as $$
declare e public.events;
begin
  select * into e from public.events where id = _event;
  if e.id is null then return; end if;
  if not private.is_attached_to_team(e.team_id) then
    raise exception 'Not your fixture.' using errcode = '42501';
  end if;
  return query
    select distinct p.id, p.full_name, o.id, t.name,
           coalesce(case when o.opponent is not null then 'v ' || o.opponent end, nullif(o.title, ''), 'Match'),
           o.starts_at, o.time_tbd
      from public.lineups l
      join public.lineup_players lp on lp.lineup_id = l.id
      join public.players p on p.id = lp.player_id
      join public.lineup_players lp2 on lp2.player_id = lp.player_id
      join public.lineups l2 on l2.id = lp2.lineup_id and l2.event_id <> _event
      join public.events o on o.id = l2.event_id and o.type = 'match'
      join public.teams t on t.id = o.team_id
     where l.event_id = _event
       and (o.starts_at at time zone 'Asia/Dubai')::date = (e.starts_at at time zone 'Asia/Dubai')::date
     order by p.full_name;
end;
$$;
revoke execute on function public.event_clashes(uuid) from public;
grant execute on function public.event_clashes(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'callup_notify_url') then raise exception 'callup_notify_url was not created'; end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'event_clashes') then raise exception 'event_clashes was not created'; end if;
end $$;
