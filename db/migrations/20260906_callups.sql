-- ══════════════════════════════════════════════════════════════════════════
--  U18 call-ups — a senior side asks, a parent says yes or no, the U18 staff
--  are told; the 17 floor is a setting
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-02-senior-squads.md, Part 3, step 6 of its order of
-- work. Jay's rulings (2 Sep 2026): the senior side decides, INFORM ONLY, no
-- veto for the U18 staff; the age floor is 17, today, not at a cut-off; a
-- called-up player gets full membership of the senior squad (option C).
--
-- Four things:
--   club_settings                 one row per club; senior_callup_min_age.
--   player_private.senior_callup_consent_at   a parent's yes, once a season.
--   callup_requests               the ask and its answer, with who and when.
--   Functions: callup_candidates, request_callup, answer_callup, end_callup —
--     every write goes through one of these, SECURITY DEFINER, each checking
--     the caller itself. No table policy grants a write.
--
-- ⚠️ THE PRIVACY GATE IS callup_candidates. The senior staff see NAME, home
-- squad and state for U18 players who are old enough. The birthday is read
-- inside the function against player_private and never leaves the database;
-- anyone under the floor is simply absent from the list. This is why it is a
-- function and not a filtered roster read.
--
-- ⚠️ WHAT "MEMBERSHIP OF THE SENIOR SQUAD" MEANS HERE: every ACTIVE membership
-- the player has in their home squad — the parents' rows and the player's own
-- row if they sign in themselves — gets a twin in the senior squad with the
-- same role. That is what gives the family the senior squad's fixtures,
-- availability, chat and notices, and it is what end_callup removes. The home
-- squad's rows and the consent are untouched by removal.
--
-- ⚠️ EVERY CHILD PROTECTION KEYS ON THE PERSON. A 17-year-old in the 2nd XV
-- is a minor to is_minor_profile, to the contact rules and to the DM review,
-- exactly as in the U18s. Nothing here changes that; db/tests/senior-section.sql
-- already proves the roster side.
--
-- ⚠️ NOTIFICATIONS ARE PUSHES THROUGH push-send's `profile_push` payload, to
-- named profiles: the parents (and the player, when they sign in themselves)
-- on a request; the U18 head coach and managers and the super admins
-- (private.approval_audience) on every state change. Email is NOT sent —
-- the spec asks for it and it is left for a later piece.

-- ── club_settings ──────────────────────────────────────────────────────────
create table if not exists public.club_settings (
  club_id                 uuid primary key references public.clubs(id) on delete cascade,
  senior_callup_min_age   smallint not null default 17,
  updated_at              timestamptz not null default now(),
  constraint club_settings_min_age_check check (senior_callup_min_age between 14 and 18)
);
alter table public.club_settings enable row level security;
drop policy if exists "club settings read" on public.club_settings;
create policy "club settings read" on public.club_settings
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "club settings manage" on public.club_settings;
create policy "club settings manage" on public.club_settings
  for all to authenticated using (private.is_admin(club_id)) with check (private.is_admin(club_id));

create or replace function private.callup_min_age(_club uuid)
returns integer
language sql
stable security definer
set search_path = public
as $$
  select coalesce((select senior_callup_min_age from public.club_settings where club_id = _club), 17)::int;
$$;
revoke execute on function private.callup_min_age(uuid) from public;
grant execute on function private.callup_min_age(uuid) to authenticated;

-- ── consent ────────────────────────────────────────────────────────────────
alter table public.player_private
  add column if not exists senior_callup_consent_at timestamptz;
comment on column public.player_private.senior_callup_consent_at is
  'A parent''s yes to senior call-ups this season. Distinct from plays_up_confirmed_at (a different decision). Null = no consent. Cleared by hand at season end until a rollover exists.';

-- ── callup_requests ────────────────────────────────────────────────────────
create table if not exists public.callup_requests (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  home_team_id    uuid not null references public.teams(id) on delete cascade,
  senior_team_id  uuid not null references public.teams(id) on delete cascade,
  requested_by    uuid references public.profiles(id) on delete set null,
  status          text not null default 'requested',
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id) on delete set null,
  constraint callup_requests_status_check check (status in ('requested', 'consented', 'refused', 'removed'))
);
create index if not exists callup_requests_player_idx on public.callup_requests(player_id);
create index if not exists callup_requests_senior_team_idx on public.callup_requests(senior_team_id);
-- One OPEN ask per player per senior squad.
create unique index if not exists callup_requests_one_open
  on public.callup_requests(player_id, senior_team_id) where status = 'requested';

alter table public.callup_requests enable row level security;
-- Read: the family, the senior squad's staff, the home squad's staff, admins.
-- No write policy at all: request_callup / answer_callup / end_callup are the
-- only writers.
drop policy if exists "callup read" on public.callup_requests;
create policy "callup read" on public.callup_requests
  for select to authenticated
  using (private.is_own_player(player_id)
      or private.can_edit_team(senior_team_id)
      or private.can_edit_team(home_team_id)
      or private.is_admin(club_id));

-- ── a push to named people ─────────────────────────────────────────────────
create or replace function public.profiles_push_subscriptions(_profiles uuid[], _category text)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable security definer
set search_path = public
as $$
  select s.id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
   where s.profile_id = any(_profiles)
     and not exists (select 1 from public.notification_opt_outs o
                      where o.profile_id = s.profile_id and o.category = _category);
$$;
revoke execute on function public.profiles_push_subscriptions(uuid[], text) from public;
grant execute on function public.profiles_push_subscriptions(uuid[], text) to service_role;

create or replace function private.push_to_profiles(_profiles uuid[], _category text, _title text, _body text, _path text, _tag text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare endpoint text; secret text;
begin
  if _profiles is null or cardinality(_profiles) = 0 then return; end if;
  -- ⚠️ THE HARNESS SWITCH. db/tests/callups.sql runs against production and
  -- its synthetic call-up would otherwise push the real super admins. A
  -- transaction-local setting turns the send off; nothing outside a harness
  -- sets it, and it dies with the transaction.
  if current_setting('app.harness', true) = 'on' then return; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'push_to_profiles: vault secrets missing, nothing sent';
    return;
  end if;
  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('profile_push', jsonb_build_object(
                 'profile_ids', to_jsonb(_profiles), 'category', _category,
                 'title', _title, 'body', _body, 'path', _path, 'tag', _tag)));
exception when others then
  raise warning 'push_to_profiles: %', sqlerrm;
end;
$$;
revoke execute on function private.push_to_profiles(uuid[], text, text, text, text, text) from public;

-- The people who answer for a player: active parent memberships, and the
-- player's own membership when they sign in themselves.
create or replace function private.callup_family(_player uuid)
returns uuid[]
language sql
stable security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.profile_id), '{}'::uuid[])
    from public.memberships m
   where m.player_id = _player and m.status = 'active' and m.role in ('parent', 'player');
$$;
revoke execute on function private.callup_family(uuid) from public;

-- ── the list the senior side sees ──────────────────────────────────────────
create or replace function public.callup_candidates(_senior_team uuid)
returns table (player_id uuid, full_name text, home_team_id uuid, home_team text, state text, request_id uuid)
language plpgsql
stable security definer
set search_path = public
as $$
declare senior public.teams;
begin
  select * into senior from public.teams where id = _senior_team;
  if senior.id is null or not senior.is_senior then
    raise exception 'Not a senior squad.' using errcode = '22023';
  end if;
  if not private.can_edit_team(_senior_team) then
    raise exception 'Only the senior squad''s staff can see who they may call up.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.team_id, t.name,
           case
             when exists (select 1 from public.memberships m where m.player_id = p.id and m.team_id = _senior_team and m.status = 'active') then 'in_squad'
             when exists (select 1 from public.callup_requests r where r.player_id = p.id and r.senior_team_id = _senior_team and r.status = 'requested') then 'requested'
             when exists (select 1 from public.callup_requests r where r.player_id = p.id and r.senior_team_id = _senior_team and r.status = 'refused'
                            and r.decided_at > now() - interval '120 days') then 'refused'
             when pp.senior_callup_consent_at is not null then 'consent_given'
             else 'consent_needed'
           end,
           (select r.id from public.callup_requests r where r.player_id = p.id and r.senior_team_id = _senior_team and r.status = 'requested' limit 1)
      from public.players p
      join public.teams t on t.id = p.team_id
      join public.player_private pp on pp.player_id = p.id
     where p.club_id = senior.club_id
       and p.left_at is null
       and not t.is_senior
       and pp.date_of_birth is not null
       and pp.date_of_birth <= current_date - make_interval(years => private.callup_min_age(senior.club_id))
     order by p.full_name;
end;
$$;
revoke execute on function public.callup_candidates(uuid) from public;
grant execute on function public.callup_candidates(uuid) to authenticated;

-- ── the ask ────────────────────────────────────────────────────────────────
create or replace function public.request_callup(_player uuid, _senior_team uuid)
returns public.callup_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  senior public.teams; p public.players; pp public.player_private; req public.callup_requests;
  home_name text; who text;
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
  select coalesce(full_name, 'Someone') into who from public.profiles where id = auth.uid();

  insert into public.callup_requests (club_id, player_id, home_team_id, senior_team_id, requested_by)
  values (senior.club_id, _player, p.team_id, _senior_team, auth.uid())
  returning * into req;

  if pp.senior_callup_consent_at is not null then
    -- Consent already given this season: the ask is answered by it.
    perform private.apply_callup(req.id, true, auth.uid());
    select * into req from public.callup_requests where id = req.id;
  else
    perform private.push_to_profiles(private.callup_family(_player), 'approval',
      senior.name || ' would like to call up ' || p.full_name,
      'Say yes or no in the app.', '/callups', 'callup-' || req.id);
  end if;
  -- Inform the home squad's staff (never the requester).
  perform private.push_to_profiles(
    (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(senior.club_id, p.team_id, auth.uid()) as a),
    'approval', 'Call-up requested — ' || p.full_name,
    senior.name || ' has asked to call up ' || p.full_name || ' from ' || coalesce(home_name, 'their squad') || '.',
    '/callups', 'callup-' || req.id);
  return req;
end;
$$;
revoke execute on function public.request_callup(uuid, uuid) from public;
grant execute on function public.request_callup(uuid, uuid) to authenticated;

-- ── applying an answer (shared by answer_callup and an already-consented ask) ──
create or replace function private.apply_callup(_request uuid, _yes boolean, _by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare req public.callup_requests; p public.players; senior public.teams; n int;
begin
  select * into req from public.callup_requests where id = _request for update;
  if req.id is null or req.status <> 'requested' then return; end if;
  select * into p from public.players where id = req.player_id;
  select * into senior from public.teams where id = req.senior_team_id;
  if _yes then
    update public.player_private set senior_callup_consent_at = coalesce(senior_callup_consent_at, now()) where player_id = req.player_id;
    -- Twin every active home-squad membership of this player into the senior squad.
    insert into public.memberships (profile_id, club_id, team_id, role, status, player_id)
    select m.profile_id, m.club_id, req.senior_team_id, m.role, 'active', m.player_id
      from public.memberships m
     where m.player_id = req.player_id and m.team_id = req.home_team_id and m.status = 'active'
       and not exists (select 1 from public.memberships x where x.profile_id = m.profile_id and x.team_id = req.senior_team_id and x.player_id = m.player_id);
    get diagnostics n = row_count;
    update public.callup_requests set status = 'consented', decided_at = now(), decided_by = _by where id = req.id;
    perform private.push_to_profiles(
      (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(req.club_id, req.senior_team_id, _by) as a),
      'approval', p.full_name || ' can play for ' || senior.name, 'The family said yes. They are in the squad now.', '/squad/' || senior.id, 'callup-' || req.id);
    perform private.push_to_profiles(
      (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(req.club_id, req.home_team_id, _by) as a),
      'approval', p.full_name || ' joins ' || senior.name, 'Called up with the family''s consent. Inform only — nothing to do.', '/callups', 'callup-' || req.id);
  else
    update public.callup_requests set status = 'refused', decided_at = now(), decided_by = _by where id = req.id;
    perform private.push_to_profiles(
      (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(req.club_id, req.senior_team_id, _by) as a),
      'approval', 'Call-up declined — ' || p.full_name, 'The family said no this time.', '/callups', 'callup-' || req.id);
  end if;
end;
$$;
revoke execute on function private.apply_callup(uuid, boolean, uuid) from public;

-- ── the family's answer ────────────────────────────────────────────────────
create or replace function public.answer_callup(_request uuid, _yes boolean)
returns public.callup_requests
language plpgsql
security definer
set search_path = public
as $$
declare req public.callup_requests;
begin
  select * into req from public.callup_requests where id = _request;
  if req.id is null then raise exception 'No such request.' using errcode = '22023'; end if;
  if not (auth.uid() = any(private.callup_family(req.player_id))) then
    raise exception 'Only the player''s family can answer a call-up.' using errcode = '42501';
  end if;
  if req.status <> 'requested' then
    raise exception 'This request has already been answered.' using errcode = '22023';
  end if;
  perform private.apply_callup(_request, _yes, auth.uid());
  select * into req from public.callup_requests where id = _request;
  return req;
end;
$$;
revoke execute on function public.answer_callup(uuid, boolean) from public;
grant execute on function public.answer_callup(uuid, boolean) to authenticated;

-- ── ending a call-up ───────────────────────────────────────────────────────
create or replace function public.end_callup(_request uuid)
returns public.callup_requests
language plpgsql
security definer
set search_path = public
as $$
declare req public.callup_requests; p public.players; senior public.teams;
begin
  select * into req from public.callup_requests where id = _request;
  if req.id is null then raise exception 'No such request.' using errcode = '22023'; end if;
  if not (private.can_edit_team(req.senior_team_id) or private.is_admin(req.club_id)) then
    raise exception 'Only the senior squad''s staff or an admin can end a call-up.' using errcode = '42501';
  end if;
  if req.status <> 'consented' then
    raise exception 'Only an active call-up can be ended.' using errcode = '22023';
  end if;
  select * into p from public.players where id = req.player_id;
  select * into senior from public.teams where id = req.senior_team_id;
  -- The senior twins go; the home squad's rows and the consent stay.
  delete from public.memberships m
   where m.player_id = req.player_id and m.team_id = req.senior_team_id;
  update public.callup_requests set status = 'removed', decided_at = now(), decided_by = auth.uid() where id = req.id;
  perform private.push_to_profiles(
    (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(req.club_id, req.home_team_id, auth.uid()) as a),
    'approval', p.full_name || ' back from ' || senior.name, 'The call-up has ended. Inform only.', '/callups', 'callup-' || req.id);
  perform private.push_to_profiles(private.callup_family(req.player_id), 'approval',
    p.full_name || '''s call-up to ' || senior.name || ' has ended', 'Their place in the home squad is unchanged.', '/callups', 'callup-' || req.id);
  return req;
end;
$$;
revoke execute on function public.end_callup(uuid) from public;
grant execute on function public.end_callup(uuid) to authenticated;

-- ── Assert it landed ───────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_private' and column_name = 'senior_callup_consent_at') then
    raise exception 'senior_callup_consent_at was not added';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'callup_candidates') then
    raise exception 'callup_candidates was not created';
  end if;
  if exists (select 1 from pg_policies where tablename = 'callup_requests' and cmd <> 'SELECT') then
    raise exception 'callup_requests must have no write policy';
  end if;
end $$;
