-- 25 Aug 2026 — finish RollCall BEFORE the confirmation email is sent.
--
-- WHY. People confirmed the email, closed the tab, and landed on Waiting for
-- access as Unnamed / "hasn't said what they need". Measured on the Accounts
-- screen the same day: anne.granelli@gmail.com (confirmed, no name, no role)
-- and willowh10@hotmail.com (unconfirmed, same blanks).
--
-- Confirmation is ON, so signUp() returns no session. They cannot run RollCall
-- between signup and confirm. The answers therefore have to be collected
-- BEFORE signUp, stored on the new profile, and turned into pending
-- memberships only once email_confirmed_at is set.
--
-- ⚠️ PLAYERS ARE STILL NOT CREATED UNTIL THE EMAIL IS CONFIRMED.
-- public.register_my_player's first guards stay the rule: a typo'd address
-- must not mint a child. The waiting card can still show the INTENT
-- immediately (name + role + squads) because that is not a player row.
--
-- ⚠️ THIS TRIGGER RUNS AS THE FUNCTION OWNER, NOT THE NEW USER.
-- auth.uid() is null here. Do not call register_my_player / request_staff_role
-- from it — they refuse a null uid. private.apply_signup_intent takes the
-- user id explicitly.

begin;

-- ── 1. Where the wizard's answers live ───────────────────────────────────
alter table public.profiles
  add column if not exists signup_intent jsonb;

alter table public.profiles
  add column if not exists signup_intent_applied_at timestamptz;

comment on column public.profiles.signup_intent is
  'Answers collected before auth.users was created: name, ticks, squads, '
  'staff role, children. Copied from raw_user_meta_data by handle_new_user. '
  'Players are applied from this only after email_confirmed_at is set.';

comment on column public.profiles.signup_intent_applied_at is
  'When private.apply_signup_intent created the pending memberships / players '
  'from signup_intent. Null means still waiting on confirm, or nothing to apply.';

-- ── 2. Squad list for a person with NO session ───────────────────────────
-- `team read` is auth.uid() IS NOT NULL. The wizard has no session. Team
-- names are not sensitive (RequestAccess already shows them to a stranger).
create or replace function public.list_signup_squads()
returns table (
  id uuid,
  name text,
  sort_order integer,
  self_registration_allowed boolean,
  is_senior boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select t.id, t.name, t.sort_order, t.self_registration_allowed, t.is_senior
    from public.teams t
   order by t.sort_order, t.name;
$function$;

revoke all on function public.list_signup_squads() from public;
grant execute on function public.list_signup_squads() to anon;
grant execute on function public.list_signup_squads() to authenticated;

-- ── 3. Apply the stored intent once the email is proved ──────────────────
create or replace function private.apply_signup_intent(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  intent        jsonb;
  already       timestamptz;
  confirmed_at  timestamptz;
  caller_email  text;
  player        jsonb;
  clean_name    text;
  clean_gender  text;
  team_row      public.teams;
  new_player    public.players;
  pending_count int;
  staff_role    text;
  staff_team    uuid;
begin
  if p_user_id is null then
    return;
  end if;

  select p.signup_intent, p.signup_intent_applied_at
    into intent, already
    from public.profiles p
   where p.id = p_user_id;

  if intent is null or already is not null then
    return;
  end if;

  select u.email, u.email_confirmed_at
    into caller_email, confirmed_at
    from auth.users u
   where u.id = p_user_id;

  if confirmed_at is null then
    return;
  end if;

  -- Staff claim. Same role list as public.request_staff_role.
  staff_role := nullif(intent->>'staff_role', '');
  staff_team := nullif(intent->>'staff_team_id', '')::uuid;
  if staff_role in ('coach', 'manager', 'medic') and staff_team is not null then
    select * into team_row from public.teams where id = staff_team;
    if team_row.id is not null then
      insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
      select p_user_id, team_row.club_id, team_row.id, staff_role, null, 'pending'
       where not exists (
         select 1 from public.memberships m
          where m.profile_id = p_user_id
            and m.club_id = team_row.club_id
            and m.team_id = team_row.id
            and m.role = staff_role
            and m.player_id is null
       );
    end if;
  end if;

  -- Children. Mirrors the guards inside public.register_my_player, with
  -- p_user_id in place of auth.uid(). Duplicate names are skipped rather
  -- than aborting the rest of the intent — a half-applied wizard is better
  -- than rolling the confirmed user back to an empty waiting card.
  for player in
    select value from jsonb_array_elements(coalesce(intent->'players', '[]'::jsonb))
  loop
    clean_name := nullif(btrim(
      concat_ws(' ', player->>'first_name', player->>'last_name')
    ), '');
    if clean_name is null or length(clean_name) > 80 then
      continue;
    end if;

    select * into team_row from public.teams where id = nullif(player->>'team_id', '')::uuid;
    if team_row.id is null then
      continue;
    end if;

    if (player->>'self_register') = 'true'
       and not coalesce(team_row.self_registration_allowed, false) then
      continue;
    end if;

    clean_gender := nullif(btrim(lower(player->>'gender')), '');
    if clean_gender is not null and clean_gender not in ('male', 'female') then
      continue;
    end if;
    if clean_gender is null and private.squad_expects_gender(team_row.name) is not null then
      continue;
    end if;

    if private.name_match_key(clean_name) is not null
       and coalesce(player->>'confirm_duplicate', '') <> 'true'
       and exists (
         select 1 from public.players pl
          where pl.team_id = team_row.id
            and private.name_match_key(pl.full_name) = private.name_match_key(clean_name)
       ) then
      continue;
    end if;

    select count(*) into pending_count
      from public.memberships
     where profile_id = p_user_id and status = 'pending';
    if pending_count >= 5 then
      exit;
    end if;

    insert into public.players (club_id, team_id, full_name, gender)
    values (team_row.club_id, team_row.id, clean_name, clean_gender)
    returning * into new_player;

    insert into public.player_contacts (player_id, email)
    values (new_player.id, lower(btrim(caller_email)));

    insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
    values (
      p_user_id,
      team_row.club_id,
      team_row.id,
      case
        when (player->>'self_register') = 'true' or team_row.is_senior
        then 'player'
        else 'parent'
      end,
      new_player.id,
      'pending'
    );

    if nullif(player->>'dob', '') is not null then
      insert into public.player_private (player_id, date_of_birth, plays_up_confirmed_at)
      values (
        new_player.id,
        (player->>'dob')::date,
        case
          when player->>'play_up_consent' = 'true'
          then now()
          else null
        end
      )
      on conflict (player_id) do nothing;
    end if;
  end loop;

  update public.profiles
     set signup_intent_applied_at = now()
   where id = p_user_id;
end;
$function$;

revoke all on function private.apply_signup_intent(uuid) from public;

create or replace function public.complete_signup_intent()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;
  perform private.apply_signup_intent(auth.uid());
end;
$function$;

revoke all on function public.complete_signup_intent() from public;
grant execute on function public.complete_signup_intent() to authenticated;

-- ── 4. Seed the profile AND the access_request at signup ─────────────────
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  intent     jsonb;
  first_n    text;
  last_n     text;
  full_n     text;
  role_claim text;
  team_ids   uuid[];
  first_team uuid;
begin
  intent := new.raw_user_meta_data->'signup_intent';
  first_n := nullif(btrim(coalesce(intent->>'first_name', new.raw_user_meta_data->>'first_name', '')), '');
  last_n  := nullif(btrim(coalesce(intent->>'last_name', new.raw_user_meta_data->>'last_name', '')), '');
  full_n  := nullif(btrim(coalesce(
               new.raw_user_meta_data->>'full_name',
               concat_ws(' ', first_n, last_n)
             )), '');

  insert into public.profiles (
    id, full_name, first_name, last_name, email, email_confirmed_at,
    name_confirmed_at, signup_intent
  )
  values (
    new.id,
    coalesce(full_n, ''),
    first_n,
    last_n,
    new.email,
    new.email_confirmed_at,
    case when first_n is not null then now() else null end,
    intent
  )
  on conflict (id) do update
    set email = excluded.email,
        email_confirmed_at = excluded.email_confirmed_at,
        signup_intent = coalesce(public.profiles.signup_intent, excluded.signup_intent);

  if intent is not null then
    role_claim := nullif(intent->>'claimed_role', '');
    select coalesce(array_agg(x::uuid), '{}')
      into team_ids
      from jsonb_array_elements_text(coalesce(intent->'squad_ids', '[]'::jsonb)) as x;
    first_team := team_ids[1];

    if role_claim is not null and first_team is not null then
      insert into public.access_requests (
        profile_id, status, requested_role, requested_team_id, requested_team_ids
      )
      values (new.id, 'pending', role_claim, first_team, team_ids)
      on conflict (profile_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.handle_new_user() from public;

-- ── 5. Confirming the email is what creates the child ────────────────────
create or replace function private.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.profiles
     set email_confirmed_at = new.email_confirmed_at
   where id = new.id;

  -- ⚠️ MUST NOT FAIL THE CONFIRM. A raise here would leave email_confirmed_at
  -- set in auth.users and not mirrored, or roll back the confirm depending on
  -- how GoTrue wraps the update. Swallow and warn; complete_signup_intent is
  -- the client retry.
  begin
    perform private.apply_signup_intent(new.id);
  exception when others then
    raise warning 'apply_signup_intent failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

revoke all on function private.handle_user_email_confirmed() from public;

commit;
