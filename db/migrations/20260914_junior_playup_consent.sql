-- ══════════════════════════════════════════════════════════════════════════
--  Junior play-up parent consent. Guest memberships stay ACTIVE so roster,
--  chat, notices and docs still work. Match lineup is refused until a
--  linked parent approves. NOT APPLIED from the cloud agent; ship in the
--  PR for Jay/Grok to apply.
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-05-playup-consent-and-ops.md slice 1.
-- claude/decisions/2026-09-05-playup-parent-consent.md.
--
-- ⚠️ NOT memberships.status. That flag is registration (pending/active) and
-- can_see_team requires active. Putting consent there would hide the guest
-- from the host roster. playup_consent is a separate enum on the guest row:
-- pending | approved, null on every non-play-up membership (including
-- senior call-up twins).
--
-- Direct super-admin add still starts pending. No auto-timeout.

alter table public.memberships
  add column if not exists playup_consent text;
alter table public.memberships
  drop constraint if exists memberships_playup_consent_check;
alter table public.memberships
  add constraint memberships_playup_consent_check
  check (playup_consent is null or playup_consent in ('pending', 'approved'));
comment on column public.memberships.playup_consent is
  'Junior play-up parent consent on a GUEST membership only. pending | approved. Null on home rows and on senior call-up twins. Distinct from memberships.status.';

-- Existing junior guest twins (20260913, if applied) start pending.
update public.memberships m
   set playup_consent = 'pending'
  from public.players p, public.teams home, public.teams guest
 where m.player_id = p.id
   and home.id = p.team_id
   and guest.id = m.team_id
   and m.team_id is distinct from p.team_id
   and m.status = 'active'
   and guest.is_senior is not true
   and home.is_senior is not true
   and m.playup_consent is null;

create or replace function public.squad_guest_flags(_teams uuid[])
returns table (player_id uuid, team_id uuid, playup_consent text)
language sql
stable
security definer
set search_path = public
as $$
  select m.player_id,
         m.team_id,
         case
           when bool_or(m.playup_consent = 'pending') then 'pending'
           when bool_or(m.playup_consent = 'approved') then 'approved'
           else null
         end
    from public.memberships m
    join public.players p on p.id = m.player_id
   where m.status = 'active'
     and m.player_id is not null
     and m.team_id = any(_teams)
     and p.team_id is distinct from m.team_id
     and private.can_see_team(m.team_id)
   group by m.player_id, m.team_id;
$$;
revoke execute on function public.squad_guest_flags(uuid[]) from public;
grant execute on function public.squad_guest_flags(uuid[]) to authenticated;
revoke execute on function public.squad_guest_flags(uuid[]) from anon;

create or replace function private.notify_junior_playup(
  _profiles uuid[], _title text, _body text, _path text, _tag text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⚠️ THE HARNESS SWITCH. db/tests/junior-playup-consent.sql runs against
  -- production; a synthetic play-up must not push the real families.
  if current_setting('app.harness', true) = 'on' then return; end if;
  perform private.push_to_profiles(_profiles, 'approval', _title, _body, _path, _tag);
end;
$$;
revoke execute on function private.notify_junior_playup(uuid[], text, text, text, text) from public;

create or replace function private.playup_staff(_club uuid, _home uuid, _guest uuid, _except uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct a), '{}'::uuid[])
    from (
      select * from private.approval_audience(_club, _home, _except)
      union
      select * from private.approval_audience(_club, _guest, _except)
    ) as a;
$$;
revoke execute on function private.playup_staff(uuid, uuid, uuid, uuid) from public;

create or replace function public.add_junior_playup(_player uuid, _guest_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.players;
  home public.teams;
  guest public.teams;
  n int;
begin
  if not private.is_super_admin() then
    raise exception 'Only a super admin can add a junior to another age group.' using errcode = '42501';
  end if;

  select * into p from public.players where id = _player;
  if p.id is null then
    raise exception 'No such player.' using errcode = '22023';
  end if;
  if p.left_at is not null then
    raise exception 'That player has left the squad.' using errcode = '22023';
  end if;

  select * into home from public.teams where id = p.team_id;
  select * into guest from public.teams where id = _guest_team;
  if guest.id is null then
    raise exception 'No such squad.' using errcode = '22023';
  end if;
  if home.id is null or home.is_senior is true then
    raise exception 'The player''s home squad must be a junior age group.' using errcode = '22023';
  end if;
  if guest.is_senior is true then
    raise exception 'The play-up squad must be a junior age group.' using errcode = '22023';
  end if;
  if guest.id = p.team_id then
    raise exception 'The play-up squad cannot be the player''s home age group.' using errcode = '22023';
  end if;
  if guest.club_id is distinct from p.club_id then
    raise exception 'The play-up squad must be in the same club.' using errcode = '22023';
  end if;

  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id, playup_consent)
  select m.profile_id, m.club_id, guest.id, m.role, 'active', m.player_id, 'pending'
    from public.memberships m
   where m.player_id = p.id and m.team_id = p.team_id and m.status = 'active'
     and not exists (
       select 1 from public.memberships x
        where x.profile_id = m.profile_id
          and x.team_id = guest.id
          and x.player_id = m.player_id
     );
  get diagnostics n = row_count;

  if n > 0 then
    perform private.notify_junior_playup(
      private.callup_family(p.id),
      guest.name || ' — play-up consent needed for ' || p.full_name,
      'Say yes or no in the app. They can train with ' || guest.name || ' now; they cannot be picked for a match until you agree.',
      '/',
      'playup-' || p.id || '-' || guest.id);
  end if;
end;
$$;

revoke execute on function public.add_junior_playup(uuid, uuid) from public;
grant execute on function public.add_junior_playup(uuid, uuid) to authenticated;
revoke execute on function public.add_junior_playup(uuid, uuid) from anon;

create or replace function public.remove_junior_playup(_player uuid, _guest_team uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.players;
  guest public.teams;
  n int;
begin
  if not private.is_super_admin() then
    raise exception 'Only a super admin can remove a junior from a guest age group.' using errcode = '42501';
  end if;

  select * into p from public.players where id = _player;
  if p.id is null then
    raise exception 'No such player.' using errcode = '22023';
  end if;

  select * into guest from public.teams where id = _guest_team;
  if guest.id is null then
    raise exception 'No such squad.' using errcode = '22023';
  end if;
  if guest.is_senior is true then
    raise exception 'The play-up squad must be a junior age group.' using errcode = '22023';
  end if;
  if guest.id = p.team_id then
    raise exception 'The play-up squad cannot be the player''s home age group.' using errcode = '22023';
  end if;

  select count(*) into n from public.memberships m
   where m.player_id = p.id and m.team_id = guest.id;
  if n > 0 then
    perform private.notify_junior_playup(
      private.playup_staff(p.club_id, p.team_id, guest.id, auth.uid()),
      'Play-up ended — ' || p.full_name,
      p.full_name || ' is no longer a guest of ' || guest.name || '.',
      '/',
      'playup-' || p.id || '-' || guest.id);
  end if;

  delete from public.memberships m
   where m.player_id = p.id and m.team_id = guest.id;
end;
$$;

revoke execute on function public.remove_junior_playup(uuid, uuid) from public;
grant execute on function public.remove_junior_playup(uuid, uuid) to authenticated;
revoke execute on function public.remove_junior_playup(uuid, uuid) from anon;

create or replace function public.answer_junior_playup(_player uuid, _guest_team uuid, _yes boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.players;
  guest public.teams;
begin
  if not private.is_own_player(_player) then
    raise exception 'Only a linked parent of that player can answer.' using errcode = '42501';
  end if;

  select * into p from public.players where id = _player;
  if p.id is null then
    raise exception 'No such player.' using errcode = '22023';
  end if;
  select * into guest from public.teams where id = _guest_team;
  if guest.id is null or guest.is_senior is true or guest.id = p.team_id then
    raise exception 'No such play-up.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.memberships m
     where m.player_id = p.id and m.team_id = guest.id
       and m.status = 'active' and m.playup_consent = 'pending'
  ) then
    raise exception 'There is no play-up waiting for consent.' using errcode = '22023';
  end if;

  if _yes then
    update public.memberships
       set playup_consent = 'approved'
     where player_id = p.id and team_id = guest.id and playup_consent = 'pending';
  else
    perform private.notify_junior_playup(
      private.playup_staff(p.club_id, p.team_id, guest.id, auth.uid()),
      'Play-up declined — ' || p.full_name,
      'The family declined ' || guest.name || ' for ' || p.full_name || '. The guest place has been removed.',
      '/',
      'playup-' || p.id || '-' || guest.id);
    delete from public.memberships m
     where m.player_id = p.id and m.team_id = guest.id;
  end if;
end;
$$;

revoke execute on function public.answer_junior_playup(uuid, uuid, boolean) from public;
grant execute on function public.answer_junior_playup(uuid, uuid, boolean) to authenticated;
revoke execute on function public.answer_junior_playup(uuid, uuid, boolean) from anon;

create or replace function private.refuse_pending_playup_lineup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_team uuid;
begin
  select e.team_id into ev_team
    from public.lineups l
    join public.events e on e.id = l.event_id
   where l.id = new.lineup_id;
  if ev_team is null then
    return new;
  end if;
  if exists (
    select 1 from public.memberships m
     where m.player_id = new.player_id
       and m.team_id = ev_team
       and m.status = 'active'
       and m.playup_consent = 'pending'
  ) then
    raise exception 'Parent consent is still pending for this play-up.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.refuse_pending_playup_lineup() from public;

drop trigger if exists refuse_pending_playup_lineup on public.lineup_players;
create trigger refuse_pending_playup_lineup
  before insert or update of player_id on public.lineup_players
  for each row execute function private.refuse_pending_playup_lineup();

do $$
begin
  if to_regprocedure('public.answer_junior_playup(uuid, uuid, boolean)') is null then
    raise exception 'ABORTING: answer_junior_playup was not created';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'memberships' and column_name = 'playup_consent'
  ) then
    raise exception 'ABORTING: memberships.playup_consent was not created';
  end if;
end $$;
