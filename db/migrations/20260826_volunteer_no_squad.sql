-- 26 Aug 2026 — a volunteer's access request no longer needs a squad.
--
-- Jay's ruling, 26 Aug 2026, reversing his own 17 Aug one ("keep the squad
-- requirement" — claude/plans/2026-08-16-account-creation-redesign.md, the
-- RESOLVED section). The new evidence: a real committee member hit the
-- signup wizard's "Choose at least one squad" wall the same day. A helper
-- has no age group; the squad was only ever "who to ask about me", and the
-- admin queue shows every request regardless (the FOR ALL admin policy is
-- is_admin_anywhere(), not squad-scoped). Decision record:
-- claude/decisions/2026-08-26-volunteer-no-squad.md.
--
-- ⚠️ ONLY 'volunteer' IS RELAXED. Parent, player, coach, manager and medic
-- requests still carry a squad — for them the 16 Aug reasoning ("requests
-- coming in and no idea who they are") stands untouched. The client keeps
-- the same line: needsSquads() in src/lib/signupIntent.js is false only
-- when "I help the club another way" is the sole tick.
--
-- Two places enforce the old rule, and both change here:
--   1. The INSERT policy on public.access_requests (the RollCall /
--      RequestAccess client path).
--   2. private.handle_new_user's guard (the signup-wizard path — SECURITY
--      DEFINER, so the policy never sees it; its own `first_team is not
--      null` test was the gate, and a helper-only signup previously created
--      NO request at all, leaving them invisible to admins).
-- private.apply_signup_intent needs nothing: with no squads and no players
-- its loops simply have no work.
--
-- Safe to apply BEFORE the code deploys: this only widens what the policy
-- accepts, and the old client never sends a null team.

begin;

-- ── 1. The INSERT policy: null team allowed for volunteer, only ──────────
drop policy if exists "access request insert own" on public.access_requests;
create policy "access request insert own" on public.access_requests
  as permissive for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and status = 'pending'
    and requested_role is not null
    and (requested_team_id is not null or requested_role = 'volunteer')
  );

-- ── 2. handle_new_user: a helper-only intent still writes a request ──────
-- Same body as 20260825_welcome_email_no_confirm.sql with TWO changes: the
-- access-request guard accepts a null first_team when the claim is
-- 'volunteer', and requested_team_ids becomes null (not '{}') when no squad
-- was chosen — createAccessRequest's own convention: an empty array would
-- claim they chose none, null says there was nothing to choose.
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

    -- ⚠️ 'volunteer' MAY HAVE NO SQUAD — the 26 Aug 2026 change. Everything
    -- else still requires one, matching the INSERT policy above.
    if role_claim is not null
       and (first_team is not null or role_claim = 'volunteer') then
      insert into public.access_requests (
        profile_id, status, requested_role, requested_team_id, requested_team_ids
      )
      values (new.id, 'pending', role_claim, first_team, nullif(team_ids, '{}'))
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

commit;
