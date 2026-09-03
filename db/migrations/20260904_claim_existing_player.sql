-- 4 Sep 2026 — a player whose parent already put them on the roster CLAIMS
-- that row instead of being refused, and instead of making a second one.
--
-- WHY. On 3 Sep 2026 eight U16B players signed up for themselves in one
-- evening. Their sign-up intents were all correct ("I play here myself",
-- their own name, the right squad). But six of them already had a roster
-- row, made by a parent the week before, and private.apply_signup_intent
-- treats a same-name row on the same squad as a duplicate and SKIPS it —
-- silently, "a half-applied wizard is better than an empty waiting card".
-- Each boy therefore landed in the app with no access at all, went to the
-- in-app form, was refused again by register_my_player's GUARD 1, and took
-- the only way past it: the tick that says "this is a different player".
-- Six duplicate rows, and four self-parent rows from the ones who guessed
-- "my child" instead. Every one of them was a teenager doing the obvious
-- thing and being told no.
--
-- The guard was right that the name was already there. What was missing is
-- the thing a person means when they type a name that is already on the
-- roster: THAT'S ME. So:
--
--   1. public.claim_existing_player(name, squad, self) — the in-app route.
--      Finds the ONE roster row with that name on that squad and inserts a
--      pending membership pointing at it: player if self (or a senior
--      squad), otherwise parent, plus a parent row carrying the claimer's
--      name and email. Refuses when nothing matches (add them as new) or
--      when two rows match (ask the club). Idempotent: a second call returns
--      the membership it already made. The approval queue vets it exactly
--      like a fresh registration — a coach still decides.
--
--   2. private.apply_signup_intent — the wizard route. The same-name branch
--      now CLAIMS the row instead of skipping it, under the same rules. A
--      new name still creates a new player, as before.
--
-- ⚠️ STILL PENDING. Nothing here grants access; it only points the request
-- at the right row. The self-name guard (GUARD 2) and the "different player"
-- tick both survive: they are for the two rare true cases, and the client
-- now shows "that's me / that's my child — connect me" as the first choice
-- and the tick second.
--
-- ⚠️ apply_migration strips `--` comments, so nothing above reaches the
-- database.

begin;

create or replace function public.claim_existing_player(
  p_full_name text,
  p_team_id uuid,
  p_self_register boolean default false
)
returns memberships
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  caller_email   text;
  confirmed_at   timestamptz;
  caller_name    text;
  clean_name     text;
  name_key       text;
  team_row       public.teams;
  matches        int;
  target         public.players;
  existing       public.memberships;
  new_membership public.memberships;
  new_role       text;
  pending_count  int;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();
  if nullif(btrim(caller_email), '') is null then
    raise exception 'Your account has no email address.' using errcode = '42501';
  end if;
  if confirmed_at is null then
    raise exception 'Please confirm your email address before adding a player.'
      using errcode = '42501';
  end if;

  clean_name := nullif(btrim(p_full_name), '');
  if clean_name is null then
    raise exception 'Enter the player''s name.' using errcode = '22023';
  end if;
  name_key := private.name_match_key(clean_name);
  if name_key is null then
    raise exception 'Enter the player''s first and family name.' using errcode = '22023';
  end if;

  select * into team_row from public.teams where id = p_team_id;
  if team_row.id is null then
    raise exception 'That age group does not exist.' using errcode = '22023';
  end if;
  if p_self_register and not coalesce(team_row.self_registration_allowed, false) then
    raise exception 'Players in % cannot register themselves — a parent or carer has to do it.',
      team_row.name using errcode = '0A000';
  end if;

  select count(*) into matches
    from public.players pl
   where pl.team_id = team_row.id
     and pl.left_at is null
     and private.name_match_key(pl.full_name) = name_key;
  if matches = 0 then
    raise exception 'Nobody with that name is on the % roster yet — add them as a new player.',
      team_row.name using errcode = '42704';
  end if;
  if matches > 1 then
    raise exception 'More than one player with that name is on the % roster. Ask the club to connect you to the right one.',
      team_row.name using errcode = '42710';
  end if;

  select * into target
    from public.players pl
   where pl.team_id = team_row.id
     and pl.left_at is null
     and private.name_match_key(pl.full_name) = name_key;

  -- Idempotent: claiming a row you are already attached to is a no-op.
  select * into existing
    from public.memberships m
   where m.profile_id = auth.uid() and m.player_id = target.id
   limit 1;
  if existing.id is not null then
    return existing;
  end if;

  select count(*) into pending_count
    from public.memberships
   where profile_id = auth.uid() and status = 'pending';
  if pending_count >= 5 then
    raise exception 'You already have % players waiting to be approved. Please wait for the club to review them.', pending_count
      using errcode = '42901';
  end if;

  new_role := case when p_self_register or team_row.is_senior then 'player' else 'parent' end;

  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (auth.uid(), team_row.club_id, team_row.id, new_role, target.id, 'pending')
  returning * into new_membership;

  -- A parent claiming their child leaves the same trace a registration does:
  -- a parent row the coach can see and ring. Never for a player claiming
  -- themselves — that is the self-parent row this migration exists to stop.
  if new_role = 'parent' then
    select nullif(btrim(coalesce(full_name, concat_ws(' ', first_name, last_name))), '')
      into caller_name
      from public.profiles where id = auth.uid();
    insert into public.player_parents (player_id, full_name, email, profile_id)
    select target.id, coalesce(caller_name, caller_email), lower(btrim(caller_email)), auth.uid()
     where not exists (
       select 1 from public.player_parents pp
        where pp.player_id = target.id
          and (pp.profile_id = auth.uid() or lower(pp.email) = lower(btrim(caller_email)))
     );
  end if;

  return new_membership;
end;
$function$;

revoke all on function public.claim_existing_player(text, uuid, boolean) from public, anon;
grant execute on function public.claim_existing_player(text, uuid, boolean) to authenticated;
grant execute on function public.claim_existing_player(text, uuid, boolean) to service_role;

-- ── the wizard route: identical to the 30 Aug body except the same-name
--    branch, which claims instead of skipping ──────────────────────────────
create or replace function private.apply_signup_intent(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  intent        jsonb;
  already       timestamptz;
  caller_email  text;
  caller_name   text;
  player        jsonb;
  clean_name    text;
  clean_gender  text;
  team_row      public.teams;
  new_player    public.players;
  existing_row  public.players;
  matches       int;
  new_role      text;
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

  select u.email
    into caller_email
    from auth.users u
   where u.id = p_user_id;

  if caller_email is null then
    return;
  end if;

  select nullif(btrim(coalesce(full_name, concat_ws(' ', first_name, last_name))), '')
    into caller_name
    from public.profiles where id = p_user_id;

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
  -- p_user_id in place of auth.uid(). A name already on the squad's roster is
  -- CLAIMED (4 Sep 2026) rather than skipped — see the migration header.
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

    select count(*) into pending_count
      from public.memberships
     where profile_id = p_user_id and status = 'pending';
    if pending_count >= 5 then
      exit;
    end if;

    new_role := case
      when (player->>'self_register') = 'true' or team_row.is_senior then 'player'
      else 'parent'
    end;

    -- THE CLAIM. Exactly one live row with this name on this squad, and the
    -- person did not insist it is a different player: point their pending
    -- membership at it. Two matching rows is the club's to untangle; skip as
    -- before rather than guess.
    if private.name_match_key(clean_name) is not null
       and coalesce(player->>'confirm_duplicate', '') <> 'true' then
      select count(*) into matches
        from public.players pl
       where pl.team_id = team_row.id
         and pl.left_at is null
         and private.name_match_key(pl.full_name) = private.name_match_key(clean_name);
      if matches = 1 then
        select * into existing_row
          from public.players pl
         where pl.team_id = team_row.id
           and pl.left_at is null
           and private.name_match_key(pl.full_name) = private.name_match_key(clean_name);
        if not exists (
          select 1 from public.memberships m
           where m.profile_id = p_user_id and m.player_id = existing_row.id
        ) then
          insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
          values (p_user_id, team_row.club_id, team_row.id, new_role, existing_row.id, 'pending');
          if new_role = 'parent' then
            insert into public.player_parents (player_id, full_name, email, profile_id)
            select existing_row.id, coalesce(caller_name, caller_email), lower(btrim(caller_email)), p_user_id
             where not exists (
               select 1 from public.player_parents pp
                where pp.player_id = existing_row.id
                  and (pp.profile_id = p_user_id or lower(pp.email) = lower(btrim(caller_email)))
             );
          end if;
        end if;
        continue;
      elsif matches > 1 then
        continue;
      end if;
    end if;

    insert into public.players (club_id, team_id, full_name, gender)
    values (team_row.club_id, team_row.id, clean_name, clean_gender)
    returning * into new_player;

    insert into public.player_contacts (player_id, email)
    values (new_player.id, lower(btrim(caller_email)));

    insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
    values (p_user_id, team_row.club_id, team_row.id, new_role, new_player.id, 'pending');

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

commit;
