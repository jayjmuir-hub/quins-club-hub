-- invites.grant_status — what an accepted invite is worth.
--
-- ⛔ THIS TOUCHES public.accept_invite, WHICH IS THE FUNCTION THAT TURNS A TOKEN
-- INTO ACCESS AND IS WRAPPED IN SECURITY-CRITICAL BANNERS IN db/schema/functions.sql.
-- Read this whole header before changing a line of it again.
--
-- == THE FACT THAT FORCED THIS, MEASURED RATHER THAN ASSUMED ==
--
-- `accept_invite` did not mention `status` anywhere. Confirmed on the live
-- database on 16 Aug 2026:
--
--   select position('status' in pg_get_functiondef(p.oid)) > 0  ->  false
--
-- Both of its `insert into public.memberships (…)` statements named five
-- columns and omitted it, so **every accepted invite inherited the column
-- default, which is 'active'.** That was invisible and harmless while the only
-- thing creating invites was an admin-only form, because an admin's invite
-- SHOULD land active.
--
-- == WHY IT STOPS BEING HARMLESS ==
--
-- Plan item 4 puts an "Invite" button on a parent row, and one of the callers is
-- the child's own PARENT (Jay: "if the father adds the mother for example").
-- With accept_invite as it was, the father typing any address into that box and
-- pressing the button would grant that address an ACTIVE membership on the
-- squad — and `private.can_see_team` requires exactly 'active', while
-- `player read` is `can_see_team(team_id) OR is_own_player(id)`.
--
-- ⚠️ SO THE BUTTON WOULD HAVE HANDED THE WHOLE SQUAD'S CHILDREN — names, photos,
-- and via player_parents every family's phone number — TO WHATEVER EMAIL ADDRESS
-- A PARENT TYPED, with nobody at the club checking it. That is precisely the
-- danger claude/decisions/2026-08-08-parent-self-registration.md exists to
-- prevent, arriving through a door that decision did not know about.
--
-- ⚠️ AND NOTE WHAT A PARENT CAN DO TODAY WITHOUT THIS: they may already add a
-- player_parents ROW, but that row is a name and an email pointing at nothing
-- and grants no access at all. The button is what would turn typing an address
-- into granting access. It is a new power, not an easier route to an old one.
--
-- == THE SHAPE OF THE FIX, AND WHY IT IS THIS SHAPE ==
--
-- accept_invite now writes `inv.grant_status` instead of omitting status. That
-- is deliberately a STORED VALUE AND NOT A DERIVED RULE:
--
--   * it could have asked "who created this invite, and were they staff?" —
--     which means accept_invite grows a second security judgement, in a second
--     place, that has to stay in step with the first one;
--   * instead the decision is made ONCE, at creation, by the function that
--     already knows who the caller is (public.invite_parent), and recorded.
--     accept_invite reads a column.
--
-- A reviewer of accept_invite can now see the whole rule in one line. That
-- property is the point of the design, and losing it is how this function
-- acquires an undocumented behaviour.
--
-- ⚠️ DEFAULT 'active' IS LOAD-BEARING FOR THE EXISTING INVITE FORM. Every row
-- already in `invites`, and every invite the admin-only InviteForm creates
-- without naming this column, keeps the behaviour it has always had. Nothing
-- about the current flow changes. ⚠️ The table is empty today (0 rows), so no
-- backfill is required — but the default is what makes that true tomorrow too.
--
-- ⚠️ THE CHECK MIRRORS memberships_status_check DELIBERATELY. If the two ever
-- disagree, an invite would be accepted and then fail on insert with a
-- constraint error, half way through a SECURITY DEFINER function, after
-- accepted_at had already been stamped — i.e. an invite burnt for nothing.

begin;

alter table public.invites
  add column if not exists grant_status text not null default 'active';

alter table public.invites
  drop constraint if exists invites_grant_status_check;
alter table public.invites
  add constraint invites_grant_status_check
  check (grant_status in ('active', 'pending'));

comment on column public.invites.grant_status is
  'The memberships.status an accepted invite creates. ''active'' = full squad '
  'visibility, which is what a staff-created invite is worth. ''pending'' = the '
  'invitee sees their own child and the squad fixtures only, which is what a '
  'PARENT-created invite is worth, because nobody at the club checked the address. '
  'Read by public.accept_invite. Defaults to ''active'' so the admin invite form is '
  'unchanged.';

-- ── accept_invite, unchanged except for the two insert statements ───────────
-- Reproduced in full from pg_get_functiondef on 16 Aug 2026 rather than written
-- from memory, so the diff is genuinely two column lists and two values.
create or replace function public.accept_invite(_token uuid)
 returns setof memberships
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  inv public.invites%rowtype;
  caller_email text;
  target_count int;
  missing_player int;
begin
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'You must be signed in to accept an invite.';
  end if;

  select * into inv from public.invites where token = _token for update;
  if not found then
    raise exception 'This invite link is not valid.';
  end if;

  if inv.accepted_at is not null then
    raise exception 'This invite has already been used.';
  end if;

  if lower(inv.email) <> lower(caller_email) then
    raise exception 'This invite was sent to a different email address than the one you signed in with.';
  end if;

  select count(*) into target_count
  from public.invite_targets t where t.invite_id = inv.id;

  if inv.role <> 'admin' and target_count = 0 and inv.team_id is null then
    raise exception 'This invite is incomplete — it has no age group. Ask an admin to send a new one.';
  end if;

  if inv.role in ('parent', 'player') then
    if target_count > 0 then
      select count(*) into missing_player
        from public.invite_targets t
       where t.invite_id = inv.id and t.player_id is null;
    else
      missing_player := case when inv.player_id is null then 1 else 0 end;
    end if;

    if missing_player > 0 then
      raise exception 'This invite is incomplete — it does not say which player it is for. Ask an admin to send a new one.';
    end if;
  end if;

  update public.invites set accepted_at = now() where id = inv.id;

  -- ⚠️ THE ONLY CHANGE IN THIS FUNCTION: `status` is now named, and its value is
  -- read off the invite. Omitting it fell through to the column default
  -- ('active'), which is correct for a staff invite and wrong for a
  -- parent-created one. See the header.
  if target_count > 0 then
    return query
    insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
    select distinct auth.uid(), inv.club_id, t.team_id, inv.role, t.player_id, inv.grant_status
    from public.invite_targets t
    where t.invite_id = inv.id
    returning *;
  else
    return query
    insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
    values (auth.uid(), inv.club_id, inv.team_id, inv.role, inv.player_id, inv.grant_status)
    returning *;
  end if;
end;
$function$
;

-- Grants restated exactly as captured, because CREATE OR REPLACE keeps the
-- existing ACL and a future CREATE (rather than REPLACE) would not.
revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.accept_invite(uuid) to service_role;

commit;
