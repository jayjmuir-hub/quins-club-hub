-- 25 Aug 2026 — a parent membership writes a player_parents row.
--
-- WHY. Admin Needs Attention tags a child when public.player_parents has
-- zero rows for them. That is the club's contact record for an adult, not
-- "this child has no Club Hub account". Most create paths never wrote it:
-- public.register_my_player and private.apply_signup_intent create the
-- player, a parent membership, and a player_contacts email, then stop.
-- Coaches saving from PlayerForm can also skip the parents editor, which
-- is still allowed — the badge is then telling the truth.
--
-- ⚠️ SO THIS IS NOT A FRONTEND FIX, AND THE BADGE IS NOT WRONG.
-- Hiding the count would make the screen lie. The write belongs next to
-- the membership that already says "this adult is this child's parent".
--
-- ⚠️ A TRIGGER ON memberships, NOT A PATCH OF EACH RPC. Whole-surface:
-- register_my_player, apply_signup_intent, AccessBuilder → grantMemberships
-- (admin adding a child for a parent), accept_invite, claim_roster_access.
-- A future insert of role='parent' with a player_id gets the row without
-- another migration. PlayerForm / insertPlayers creating a child WITH NO
-- parent membership are deliberately untouched — coaches may still save
-- without parents, and the importer still only writes names.
--
-- ⚠️ SELF-REGISTER IS role='player'. The adult is the child, not a parent.
-- The WHEN clause keeps that path from writing a parent row of themselves.
--
-- Apply as migration `20260825_player_parents_from_parent_membership`.

begin;

-- Copies the adult's profile onto public.player_parents for one child.
-- Idempotent on (player_id, profile_id) and on a matching email already
-- sitting on that child — a coach who typed the same adult must not get
-- a second row when the membership later lands.
--
-- Skips a blank name rather than raising: player_parents_name_not_blank
-- would otherwise abort the membership insert, and a parent's registration
-- succeeding is worth more than a contact row we cannot fill.
create or replace function private.write_parent_row_from_profile(
  p_player uuid,
  p_profile uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  parent_name  text;
  parent_email text;
  already      boolean;
begin
  if p_player is null or p_profile is null then
    return;
  end if;

  select
    nullif(btrim(coalesce(
      nullif(btrim(pr.full_name), ''),
      btrim(concat_ws(' ', pr.first_name, pr.last_name))
    )), ''),
    nullif(lower(btrim(pr.email)), '')
    into parent_name, parent_email
    from public.profiles pr
   where pr.id = p_profile;

  if parent_name is null then
    return;
  end if;

  select exists (
    select 1 from public.player_parents pp
     where pp.player_id = p_player
       and (
         pp.profile_id = p_profile
         or (
           parent_email is not null
           and lower(btrim(pp.email)) = parent_email
         )
       )
  ) into already;

  if already then
    return;
  end if;

  insert into public.player_parents (
    player_id, full_name, first_name, last_name,
    email, phone, profile_id, is_primary, sort_order
  )
  select
    p_player,
    parent_name,
    nullif(btrim(pr.first_name), ''),
    nullif(btrim(pr.last_name), ''),
    parent_email,
    nullif(btrim(pr.phone), ''),
    p_profile,
    not exists (
      select 1 from public.player_parents pp where pp.player_id = p_player
    ),
    coalesce(
      (select max(pp.sort_order) + 1
         from public.player_parents pp
        where pp.player_id = p_player),
      0
    )
    from public.profiles pr
   where pr.id = p_profile;
end;
$function$;

revoke all on function private.write_parent_row_from_profile(uuid, uuid) from public;

-- ⚠️ MUST NEVER FAIL A MEMBERSHIP INSERT. Same shape as
-- notify_pending_membership: the row that grants access is worth more than
-- the contact copy. Preventable skips live in the helper (blank name,
-- already present). Anything else is a warning, not a rollback.
create or replace function private.memberships_write_parent_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform private.write_parent_row_from_profile(new.player_id, new.profile_id);
  return new;
exception when others then
  raise warning 'memberships_write_parent_row: % (membership %)', sqlerrm, new.id;
  return new;
end;
$function$;

revoke all on function private.memberships_write_parent_row() from public;

drop trigger if exists memberships_write_parent_row on public.memberships;
create trigger memberships_write_parent_row
  after insert on public.memberships
  for each row
  when (new.role = 'parent' and new.player_id is not null)
  execute function private.memberships_write_parent_row();

-- ── Backfill: parent membership, zero player_parents rows ───────────────
-- Per player, not per membership: a child who already has a typed-in parent
-- row is left alone even if a second adult holds a membership without a
-- matching player_parents row. That is the case Jay named. Children with
-- two parent memberships and an empty list get both adults.
do $$
declare
  rec record;
  filled int := 0;
begin
  for rec in
    select m.player_id, m.profile_id
      from public.memberships m
     where m.role = 'parent'
       and m.player_id is not null
       and not exists (
         select 1 from public.player_parents pp
          where pp.player_id = m.player_id
       )
  loop
    perform private.write_parent_row_from_profile(rec.player_id, rec.profile_id);
    filled := filled + 1;
  end loop;
  raise notice 'player_parents backfill: considered % parent memberships on children with an empty list', filled;
end $$;

do $$
declare n int;
begin
  select count(*) into n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
   where c.relname = 'memberships'
     and t.tgname = 'memberships_write_parent_row'
     and not t.tgisinternal;
  if n <> 1 then
    raise exception 'ABORTING: expected exactly one memberships_write_parent_row trigger, found %.', n;
  end if;
  if to_regprocedure('private.write_parent_row_from_profile(uuid,uuid)') is null then
    raise exception 'ABORTING: private.write_parent_row_from_profile is missing.';
  end if;
end $$;

commit;
