-- public.member_identity — every hat an account wears, as ROWS.
-- claude/plans/2026-08-26-dm-identity-rows.md, Jay's ruling of 26 Aug 2026:
-- a DM header must say ALL of it — "Club Hub admin, U16B Assistant Coach,
-- U18B Assistant Coach" — and parents and players get their badges too.
--
-- ⚠️ WHY A SECOND FUNCTION AND NOT A CHANGE TO member_contact_card: the card
-- answers "may I contact them, and how" — its shape is one row, its phone
-- and email are gated, and its "best role" summary is right for a card
-- headline. THIS function answers "who are they", one row per active
-- membership, and deliberately has NO contact column at all — it cannot
-- leak what it never selects.
--
-- ⚠️ THE VISIBILITY RULING (spec decision 2): identity — role, title,
-- squads — is visible to ANY caller holding an active membership in the
-- same club. That widens nothing in practice: dm_candidates already shows
-- every person with role and via_team in the new-chat picker. Contact
-- details keep member_contact_card's gate, untouched.

begin;

create or replace function public.member_identity(_profile uuid)
returns table(role text, title text, is_super boolean, squad text, squad_sort integer)
language sql stable security definer
set search_path to 'public'
as $$
  select m.role, m.title, coalesce(m.is_super, false), t.name, t.sort_order
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = _profile
     and m.status = 'active'
     -- Same club, active caller — the same door dm_candidates opens.
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = m.club_id
     )
$$;

comment on function public.member_identity(uuid) is
  'One row per ACTIVE membership of _profile — role, title, is_super, squad '
  'name and sort — for any active member of the same club. Identity only: '
  'no contact column exists here; phone/email stay behind '
  'member_contact_card''s entitlement. '
  'claude/plans/2026-08-26-dm-identity-rows.md.';

revoke all on function public.member_identity(uuid) from public, anon;
grant execute on function public.member_identity(uuid) to authenticated, service_role;

commit;
