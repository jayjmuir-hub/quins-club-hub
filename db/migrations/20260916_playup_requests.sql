-- ══════════════════════════════════════════════════════════════════════════
--  Junior play-up slice 2 — request / nominate queue.
--  Head coach of the relevant squad, or its age-group manager, may file.
--  Super admin Approve calls add_junior_playup (parent consent still pending).
--  NOT APPLIED from the cloud agent; ship in the PR for Jay/Grok to apply.
--  Do not reuse 20260915 — that stamp is playup_staff_fix / open Claude PRs.
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-05-playup-consent-and-ops.md slice 2.
-- claude/decisions/2026-09-05-playup-parent-consent.md.
--
-- Writes go through security-definer RPCs. The table has a SELECT policy
-- only. Assistant coach / medic / untagged staff are refused here, not
-- merely hidden in the UI.

create or replace function private.can_request_playup(_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
     where m.profile_id = (select auth.uid())
       and m.status = 'active'
       and m.team_id = _team
       and (
         (m.role = 'coach' and m.is_head_coach)
         or m.role = 'manager'
       )
  );
$$;
revoke execute on function private.can_request_playup(uuid) from public;
grant execute on function private.can_request_playup(uuid) to authenticated;
revoke execute on function private.can_request_playup(uuid) from anon;

create or replace function private.playup_club_supers(_club uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct m.profile_id), '{}'::uuid[])
    from public.memberships m
   where m.club_id = _club
     and m.role = 'admin'
     and m.status = 'active'
     and m.is_super;
$$;
revoke execute on function private.playup_club_supers(uuid) from public;

create table if not exists public.playup_requests (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  home_team_id    uuid not null references public.teams(id) on delete cascade,
  guest_team_id   uuid not null references public.teams(id) on delete cascade,
  requested_by    uuid references public.profiles(id) on delete set null,
  kind            text not null,
  note            text,
  status          text not null default 'requested',
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id) on delete set null,
  decision_note   text,
  constraint playup_requests_kind_check check (kind in ('host_request', 'home_nominate')),
  constraint playup_requests_status_check check (status in ('requested', 'approved', 'declined')),
  constraint playup_requests_distinct_squads check (home_team_id is distinct from guest_team_id)
);
create index if not exists playup_requests_status_idx on public.playup_requests(status);
create unique index if not exists playup_requests_one_open
  on public.playup_requests(player_id, guest_team_id) where status = 'requested';
comment on table public.playup_requests is
  'Junior play-up queue. requested until a super admin approves (add_junior_playup) or declines. Distinct from memberships.playup_consent.';

alter table public.playup_requests enable row level security;
drop policy if exists "playup request read" on public.playup_requests;
create policy "playup request read" on public.playup_requests
  for select to authenticated
  using (
    private.is_super_admin()
    or requested_by = (select auth.uid())
    or private.can_request_playup(home_team_id)
    or private.can_request_playup(guest_team_id)
  );

create or replace function private.insert_playup_requests(
  _players uuid[], _guest uuid, _note text, _kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  guest public.teams;
  pid uuid;
  p public.players;
  home public.teams;
  n int;
  note_txt text;
begin
  if _kind is distinct from 'host_request' and _kind is distinct from 'home_nominate' then
    raise exception 'Unknown play-up request kind.' using errcode = '22023';
  end if;
  if _players is null or cardinality(_players) = 0 then
    raise exception 'Pick at least one player.' using errcode = '22023';
  end if;

  select * into guest from public.teams where id = _guest;
  if guest.id is null then
    raise exception 'No such squad.' using errcode = '22023';
  end if;
  if guest.is_senior is true then
    raise exception 'The play-up squad must be a junior age group.' using errcode = '22023';
  end if;

  if _kind = 'host_request' then
    if not private.can_request_playup(_guest) then
      raise exception 'Only that age group''s head coach or manager can request a play-up onto it.' using errcode = '42501';
    end if;
  end if;

  note_txt := nullif(btrim(coalesce(_note, '')), '');

  foreach pid in array _players loop
    select * into p from public.players where id = pid;
    if p.id is null then
      raise exception 'No such player.' using errcode = '22023';
    end if;
    if p.left_at is not null then
      raise exception 'That player has left the squad.' using errcode = '22023';
    end if;
    if p.club_id is distinct from guest.club_id then
      raise exception 'The play-up squad must be in the same club.' using errcode = '22023';
    end if;

    select * into home from public.teams where id = p.team_id;
    if home.id is null or home.is_senior is true then
      raise exception 'The player''s home squad must be a junior age group.' using errcode = '22023';
    end if;
    if home.id = guest.id then
      raise exception 'The play-up squad cannot be the player''s home age group.' using errcode = '22023';
    end if;

    if _kind = 'home_nominate' then
      if not private.can_request_playup(home.id) then
        raise exception 'Only that age group''s head coach or manager can nominate a player from it.' using errcode = '42501';
      end if;
    end if;

    select count(*) into n from public.memberships m
     where m.player_id = p.id and m.team_id = guest.id and m.status = 'active';
    if n > 0 then
      raise exception 'That player is already a guest of that age group.' using errcode = '22023';
    end if;

    insert into public.playup_requests (
      club_id, player_id, home_team_id, guest_team_id, requested_by, kind, note, status
    ) values (
      p.club_id, p.id, home.id, guest.id, (select auth.uid()), _kind, note_txt, 'requested'
    );
  end loop;

  perform private.notify_junior_playup(
    private.playup_club_supers(guest.club_id),
    'Play-up request',
    'A play-up is waiting for your decision.',
    '/admin/playups',
    'playup-request'
  );
end;
$$;
revoke execute on function private.insert_playup_requests(uuid[], uuid, text, text) from public;

create or replace function public.request_junior_playups(_players uuid[], _guest_team uuid, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.insert_playup_requests(_players, _guest_team, _note, 'host_request');
end;
$$;
revoke execute on function public.request_junior_playups(uuid[], uuid, text) from public;
grant execute on function public.request_junior_playups(uuid[], uuid, text) to authenticated;
revoke execute on function public.request_junior_playups(uuid[], uuid, text) from anon;

create or replace function public.nominate_junior_playups(_players uuid[], _guest_team uuid, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.insert_playup_requests(_players, _guest_team, _note, 'home_nominate');
end;
$$;
revoke execute on function public.nominate_junior_playups(uuid[], uuid, text) from public;
grant execute on function public.nominate_junior_playups(uuid[], uuid, text) to authenticated;
revoke execute on function public.nominate_junior_playups(uuid[], uuid, text) from anon;

create or replace function public.playup_source_players(_source_team uuid, _host_team uuid)
returns table (player_id uuid, full_name text, state text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.can_request_playup(_host_team) then
    raise exception 'Only that age group''s head coach or manager can see who they may request.' using errcode = '42501';
  end if;
  if _source_team is not distinct from _host_team then
    raise exception 'Pick a younger age group.' using errcode = '22023';
  end if;
  return query
    select p.id, p.full_name,
           case
             when exists (
               select 1 from public.memberships m
                where m.player_id = p.id and m.team_id = _host_team and m.status = 'active'
             ) then 'guest'
             when exists (
               select 1 from public.playup_requests r
                where r.player_id = p.id and r.guest_team_id = _host_team and r.status = 'requested'
             ) then 'requested'
             else 'available'
           end
      from public.players p
     where p.team_id = _source_team
       and p.left_at is null
     order by p.full_name;
end;
$$;
revoke execute on function public.playup_source_players(uuid, uuid) from public;
grant execute on function public.playup_source_players(uuid, uuid) to authenticated;
revoke execute on function public.playup_source_players(uuid, uuid) from anon;

create or replace function public.decide_playup_request(_id uuid, _yes boolean, _note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.playup_requests;
  note_txt text;
begin
  if not private.is_super_admin() then
    raise exception 'Only a super admin can approve or decline a play-up request.' using errcode = '42501';
  end if;

  select * into r from public.playup_requests where id = _id;
  if r.id is null then
    raise exception 'No such play-up request.' using errcode = '22023';
  end if;
  if r.status is distinct from 'requested' then
    raise exception 'That request has already been decided.' using errcode = '22023';
  end if;

  note_txt := nullif(btrim(coalesce(_note, '')), '');

  if _yes then
    perform public.add_junior_playup(r.player_id, r.guest_team_id);
    update public.playup_requests
       set status = 'approved',
           decided_at = now(),
           decided_by = (select auth.uid()),
           decision_note = note_txt
     where id = r.id;
    return;
  end if;

  update public.playup_requests
     set status = 'declined',
         decided_at = now(),
         decided_by = (select auth.uid()),
         decision_note = note_txt
   where id = r.id;

  if r.requested_by is not null then
    perform private.notify_junior_playup(
      array[r.requested_by],
      'Play-up declined',
      coalesce(note_txt, 'A play-up request was declined.'),
      '/',
      'playup-request-declined'
    );
  end if;
end;
$$;
revoke execute on function public.decide_playup_request(uuid, boolean, text) from public;
grant execute on function public.decide_playup_request(uuid, boolean, text) to authenticated;
revoke execute on function public.decide_playup_request(uuid, boolean, text) from anon;
