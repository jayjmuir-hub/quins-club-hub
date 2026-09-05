-- ══════════════════════════════════════════════════════════════════════════
--  Junior play-up — a super admin twins a junior onto a second junior age
--  group via guest memberships. Home stays players.team_id.
--  NOT APPLIED from the cloud agent; ship in the PR for Jay to apply.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Same twinning as private.apply_callup (db/migrations/20260906_callups.sql):
-- every ACTIVE membership with this player_id on the home squad is copied
-- onto the guest squad with the same role. listPlayers already marks those
-- rows guest_of. There is no consent request — the super admin is the gate.
--
-- remove_junior_playup deletes only memberships for that player_id on the
-- guest team. It never touches home memberships or the players row.

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

  insert into public.memberships (profile_id, club_id, team_id, role, status, player_id)
  select m.profile_id, m.club_id, guest.id, m.role, 'active', m.player_id
    from public.memberships m
   where m.player_id = p.id and m.team_id = p.team_id and m.status = 'active'
     and not exists (
       select 1 from public.memberships x
        where x.profile_id = m.profile_id
          and x.team_id = guest.id
          and x.player_id = m.player_id
     );
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

  delete from public.memberships m
   where m.player_id = p.id and m.team_id = guest.id;
end;
$$;

revoke execute on function public.remove_junior_playup(uuid, uuid) from public;
grant execute on function public.remove_junior_playup(uuid, uuid) to authenticated;
revoke execute on function public.remove_junior_playup(uuid, uuid) from anon;
