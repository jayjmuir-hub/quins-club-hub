-- 25 Aug 2026 — retire the email-confirmation GATE; the email becomes a welcome.
--
-- Jay's decision, 25 Aug 2026: creating an account no longer waits on the
-- person opening a confirmation link. The mail they get is a welcome note —
-- "your account is created, here's what happens next" — not a gate. The
-- dashboard's "Confirm email" toggle goes OFF (Jay's click, AFTER this
-- migration and the notify-welcome function are live). Decision record:
-- claude/decisions/2026-08-25-remove-email-confirmation.md.
--
-- WHY THE MIGRATION EXISTS AT ALL — the gate was load-bearing in two places:
--
--   1. private.apply_signup_intent only ran when email_confirmed_at was SET —
--      via the on_auth_user_email_confirmed UPDATE trigger. With confirmation
--      off, GoTrue creates the user ALREADY confirmed: that UPDATE never
--      happens, the trigger never fires, and the wizard's answers would sit
--      in profiles.signup_intent forever. The waiting card would show intent,
--      but no pending memberships or players would ever be minted.
--   2. The signup email itself was sent by GoTrue through the send-email
--      hook. With confirmation off GoTrue sends NOTHING at signup, so the
--      welcome mail needs the house pattern: trigger → pg_net → edge
--      function → Resend (same shape as notify-approval et al).
--
-- ⚠️ SAFE TO APPLY BEFORE THE TOGGLE FLIPS, with one small, accepted
-- exception. The intent-application changes are keyed on the row being BORN
-- confirmed, which never happens while "Confirm email" is still on. The
-- welcome mail, though, hangs off BOTH doors (see the welcomed_at note
-- below), so anyone confirming an old-style link between this migration and
-- Jay's click gets a welcome mail right after confirming. That is a feature
-- wearing a caveat: they did just create an account, and the decision is to
-- welcome people who do.
--
-- ⚠️ WHY THE WELCOME HANGS OFF TWO TRIGGERS, NOT ONE. GoTrue under
-- autoconfirm has been observed (in its source, across versions) to either
-- write email_confirmed_at IN the INSERT or to INSERT unconfirmed and
-- Confirm() with an UPDATE inside the same transaction. Which one this
-- project's GoTrue does was NOT verified on the machine — so nothing here is
-- allowed to depend on the answer. profiles.welcomed_at is the once-only
-- gate: whichever trigger gets there first sends, the other finds the marker
-- set and does nothing. When the flip happens, verify live (rule 6) and note
-- which door actually fired in the deploy PR.
--
-- ⚠️ WHAT THIS DELIBERATELY GIVES UP: "a typo'd address must not mint a
-- child" (20260825_signup_before_confirm.sql). With no confirmation step, a
-- mistyped email creates an account and pending memberships the same as a
-- correct one. Jay accepted that trade — approval by an admin is still the
-- real gate on everything the club acts on; the email was only ever proving
-- the inbox, and it was costing real signups (a four-day-old login that
-- never opened the mail, measured 25 Aug on the Accounts screen).
--
-- ⚠️ THE OLD PATHS ARE KEPT, NOT DELETED. on_auth_user_email_confirmed stays:
-- legacy accounts created before the flip still confirm through their old
-- links and their intent still applies. complete_signup_intent stays as the
-- client-side retry. The confirmed-at gate INSIDE apply_signup_intent is
-- dropped (see 2 below) so a signed-in caller is enough.

begin;

-- ── 1. apply the intent at INSERT when the row is born confirmed ──────────
-- Same body as 20260825_signup_before_confirm.sql with one addition at the
-- end: when GoTrue hands us a user that is already confirmed (autoconfirm,
-- i.e. the toggle is off), run apply_signup_intent immediately — there will
-- never be an UPDATE for the confirmed trigger to see.
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

  -- Born confirmed (autoconfirm): the UPDATE trigger will never fire, so this
  -- is the only chance to turn the intent into pending rows. Swallow-and-warn,
  -- same as private.handle_user_email_confirmed — a failure here must not
  -- fail the signup; complete_signup_intent is the client retry.
  if new.email_confirmed_at is not null then
    begin
      perform private.apply_signup_intent(new.id);
    exception when others then
      raise warning 'apply_signup_intent (at signup) failed for %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$function$;

revoke all on function private.handle_new_user() from public;

-- ── 2. drop the confirmed-at gate inside apply_signup_intent ──────────────
-- The gate enforced "no players until the email is proved". The email is no
-- longer proved, by decision. Keeping the gate would also strand the LEGACY
-- limbo cohort — people who signed up before the flip and never opened the
-- mail: once the toggle is off they can sign in (GoTrue's not-confirmed
-- check is skipped under autoconfirm) but their email_confirmed_at stays
-- null, so with the gate their intent could never apply, from any path.
-- Everything else in the body is unchanged from 20260825_signup_before_confirm.sql.
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

  select u.email
    into caller_email
    from auth.users u
   where u.id = p_user_id;

  if caller_email is null then
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
  -- than rolling the new user back to an empty waiting card.
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

-- ── 3. the welcome endpoint's URL, derived so the host cannot drift ───────
-- Same reasoning as access_request_notify_url: it is not a credential (the
-- gate is approval_notify_secret, reused below), and vault.create_secret
-- raises on a duplicate name, so guard the re-run.
do $$
declare
  base text;
begin
  if exists (select 1 from vault.secrets where name = 'welcome_notify_url') then
    return;
  end if;

  select decrypted_secret into base
  from vault.decrypted_secrets where name = 'approval_notify_url';

  if base is null then
    raise exception 'approval_notify_url is missing from the vault; cannot derive the welcome endpoint';
  end if;

  -- Anchored replacement, not a bare replace() — the function name is the
  -- LAST path segment.
  perform vault.create_secret(
    regexp_replace(base, '/notify-approval$', '/notify-welcome'),
    'welcome_notify_url',
    'Endpoint the welcome trigger posts to. Derived from approval_notify_url so the host cannot drift between the notify functions. Not a credential - the gate is approval_notify_secret, which this function reuses.'
  );
end $$;

-- ── 4. the welcome trigger — BOTH doors, one send ──────────────────────────
-- See the header: GoTrue may hand us email_confirmed_at in the INSERT or in
-- an UPDATE moments later, so the welcome hangs off both, and
-- profiles.welcomed_at is the once-only gate. The UPDATE ... where
-- welcomed_at is null is atomic under READ COMMITTED — two triggers cannot
-- both see FOUND, so two mails cannot queue.
--
-- pg_net queues in-transaction and delivers after commit, so the edge
-- function always reads a committed profiles row, whatever the trigger
-- firing order on auth.users.
--
-- ⚠️ IT MUST NEVER FAIL THE SIGNUP, hence the catch-all. And the failure is
-- therefore genuinely quiet — survivable ONLY because the mail is a welcome,
-- not a gate: the account works whether or not the mail arrived.
alter table public.profiles
  add column if not exists welcomed_at timestamptz;

comment on column public.profiles.welcomed_at is
  'When the welcome email was queued for this account. The once-only gate '
  'between the two triggers that can send it (born-confirmed INSERT, and the '
  'email_confirmed_at UPDATE). Null on accounts from before 25 Aug 2026.';

create or replace function private.notify_welcome()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
begin
  -- The once-only gate, claimed BEFORE anything that can fail. If the vault
  -- reads or the queue insert blow up, the catch-all below still commits the
  -- claim — one lost mail, never two sent.
  update public.profiles
     set welcomed_at = now()
   where id = new.id
     and welcomed_at is null;
  if not found then
    return new;
  end if;

  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'welcome_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_welcome: vault secrets missing, no email sent for %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('user_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_welcome failed for %: %', new.id, sqlerrm;
  return new;
end;
$function$;

revoke all on function private.notify_welcome() from public;

-- Door one: the row arrives already confirmed.
drop trigger if exists on_auth_user_created_welcome on auth.users;
create trigger on_auth_user_created_welcome
  after insert on auth.users
  for each row
  when (new.email is not null and new.email_confirmed_at is not null)
  execute function private.notify_welcome();

-- Door two: the row is confirmed by a later UPDATE — GoTrue's Confirm()
-- under autoconfirm, and the legacy links. Null→set ONLY: an email CHANGE
-- re-confirmation must not look like a new account.
drop trigger if exists on_auth_user_confirmed_welcome on auth.users;
create trigger on_auth_user_confirmed_welcome
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.notify_welcome();

commit;
