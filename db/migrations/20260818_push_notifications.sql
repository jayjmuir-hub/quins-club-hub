-- Real browser push notifications, starting with one trigger: a reply to
-- your own report.
--
-- Apply as migration `20260818xxxxxx push_notifications`.
-- Full reasoning: claude/plans/2026-08-18-push-notifications.md.
--
-- ══ WHY A NEW TABLE, NOT A COLUMN ON `profiles` ═════════════════════════
-- A person may have the app open on more than one device (a phone and a
-- desktop, a coach's own phone and a shared team-manager tablet), and each
-- device's browser holds its OWN push subscription — a different `endpoint`,
-- a different pair of keys. A single column on `profiles` could only ever
-- remember one. `endpoint` is the natural identity of a subscription, so it
-- is the unique key here rather than `(profile_id)`.
--
-- ══ RLS: OWNER-ONLY, SAME SHAPE AS `player_parents` ═════════════════════
-- The subscriber manages their own rows; nobody else — not even a club
-- admin — has any reason to read them. Only the service-role sender (the
-- push-send Edge Function) reads across profiles, and service_role bypasses
-- RLS entirely, so no policy needs to grant that.
--
-- ⚠️ `anon` IS REVOKED EXPLICITLY, AT CREATION, RATHER THAN LEFT TO DEFAULT
-- PRIVILEGES. Today's session found `public.register_my_player` had carried
-- an unexamined `anon` EXECUTE grant since 9 Aug because nobody explicitly
-- revoked it — Supabase's default privileges hand a new object to anon,
-- authenticated and service_role alike, and only an explicit revoke removes
-- the named grant. This table starts clean rather than joining that list.
--
-- ══ A SHARED-DEVICE EDGE CASE, KNOWN AND NOT SOLVED HERE ════════════════
-- If two different people sign into the SAME browser on the SAME device —
-- a family tablet, say — the browser's push subscription for this origin is
-- one `endpoint` regardless of who is signed in. The second person's
-- subscribe attempt will hit the UNIQUE constraint on a row RLS will not let
-- them see or reassign (USING checks the ROW's owner, not the caller), so it
-- fails with an ordinary duplicate-key error rather than silently taking over
-- the first person's subscription or silently doing nothing. That is a safe
-- failure mode — nobody's notifications get hijacked — but it is not a good
-- ONE, and fixing it (offering to replace an existing subscription on THIS
-- device) is future work, not invented here.

begin;

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

create policy "push subscription own"
  on public.push_subscriptions
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

revoke all on public.push_subscriptions from public;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
-- service_role keeps Supabase's default grant, unrevoked: the push-send Edge
-- Function reads every subscriber for a report with the service key, and
-- deletes a subscription whose endpoint the push service has reported dead.
grant select, delete on public.push_subscriptions to service_role;


-- ── private.notify_feedback_reply_push() — TRIGGER FUNCTION ────────────────
--
-- Same shape as private.notify_pending_membership(), on purpose: reads two
-- Vault secrets, never fails the UPDATE it fires from (net.http_post queues
-- and returns without waiting; a missing secret WARNS and returns; the whole
-- body is wrapped in `exception when others`), and the body it POSTs carries
-- an id and nothing else — every fact in the notification is read back by the
-- Edge Function with the service role, so this endpoint cannot become an open
-- relay wearing a shared secret.
--
-- ⚠️ REUSES approval_notify_secret, LIKE notify-feedback DOES. Edge Function
-- secrets are project-wide, so the value is already present; a fifth secret
-- with the same job would be a fifth thing to remember to rotate together.

create or replace function private.notify_feedback_reply_push()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_feedback_reply_push: vault secrets missing, no push sent for feedback %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret', secret),
    body    := jsonb_build_object('feedback_id', new.id)
  );

  return new;
exception when others then
  raise warning 'notify_feedback_reply_push: % (feedback %)', sqlerrm, new.id;
  return new;
end;
$function$;

-- No explicit grants — matching notify_pending_membership, this is a trigger
-- function that reads NEW and is not meaningfully callable directly.

-- ── The trigger ─────────────────────────────────────────────────────────
--
-- ⚠️ THE WHEN CLAUSE IS THE WHOLE SCOPING DECISION. `feedback triage` (the
-- table's only UPDATE policy) is `using private.is_admin(club_id)`, so every
-- UPDATE on this table is already an admin action — no separate guard is
-- needed in the function body for "who did this". What decides whether the
-- REPORTER has something new to see is whether `status` or `admin_note`
-- actually changed: src/components/HelpButton.jsx renders exactly those two
-- fields back to them, so this condition is "did their own screen just change
-- under them", not a guess at intent.
create trigger notify_feedback_reply_push
  after update on public.feedback
  for each row
  when (new.status is distinct from old.status or new.admin_note is distinct from old.admin_note)
  execute function private.notify_feedback_reply_push();


-- ── Guard: fail loudly if the pieces this depends on are not there ─────────
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'ABORTING: pg_net is not installed.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'push_notify_url') then
    raise exception 'ABORTING: push_notify_url is missing from vault.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'approval_notify_secret') then
    raise exception 'ABORTING: approval_notify_secret is missing from vault.';
  end if;
  raise notice 'guard passed: trigger installed, pg_net present, both vault secrets exist';
end $$;

commit;
