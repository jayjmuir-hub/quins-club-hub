-- ══════════════════════════════════════════════════════════════════════════
--  Grok-sweep items 10, 11, 12 — the push/mail pipeline stops trusting its
--  callers · 30 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- THREE fixes, one theme: the HTTP body of an internal request is not a
-- trustworthy place for addresses, endpoints, or lock-screen text.
--
-- 1 (item 12, SSRF). register_push_subscription accepted ANY string as the
--    endpoint — a member could register http://169.254.169.254/… and have
--    push-send POST VAPID-signed requests at it from inside the edge runtime.
--    Now: https only, host on the allowlist of real browser push services.
--    Measured against production first: live endpoints are web.push.apple.com
--    (25), fcm.googleapis.com (12) and one legacy jmt17.google.com — all
--    covered. push-send carries the same allowlist before its fetch, belt and
--    braces.
--
-- 2 (item 11, body-trust). squad_push carried title/body/path free-form in
--    the request body, so anyone holding the shared secret could write
--    arbitrary lock-screen text to a whole squad. The copy now travels
--    through public.push_outbox: send_fixture_push INSERTS the rendered row
--    and posts only its id; push-send loads the row (service role), renders
--    from the DATABASE, and deletes it — single-use, so a replayed request
--    notifies nobody. The outbox row is also the CANCELLATION tombstone: the
--    strings are snapshotted at delete time, when the events row still
--    existed in the trigger's OLD.
--    availability_nudge needs no outbox — the event still exists at nudge
--    time, so push-send re-derives the copy from event_id and ignores any
--    text in the body.
--
-- 3 (item 10, open relay). send_signup_nudges POSTed email addresses in the
--    body and notify-unfinished-signup mailed whatever arrived — with the
--    secret, an open relay wearing club branding. It now posts profile IDS;
--    the function loads email/first_name from profiles by id (the
--    notify-welcome pattern) and caps the batch.
--
-- ⚠️ DEPLOY ORDERING: apply this migration and deploy the two functions
-- back-to-back. Between the two, a fixture push or signup nudge would be
-- refused with 'bad request' (seconds; fixture pushes are user-triggered and
-- rare at this hour, the nudge cron runs at 05:23 UTC).
--
-- ROLLBACK. Re-create the three functions from db/schema/functions.sql as of
-- the previous commit; drop table public.push_outbox.

begin;

-- ── 1 · The endpoint allowlist (item 12) ───────────────────────────────────
create or replace function private.push_endpoint_allowed(_endpoint text)
returns boolean
language sql
immutable
as $$
  select _endpoint like 'https://%'
     and (
       _endpoint like 'https://fcm.googleapis.com/%'
       or _endpoint like 'https://web.push.apple.com/%'
       or _endpoint like 'https://updates.push.services.mozilla.com/%'
       -- Edge/Windows (WNS) issues per-tenant hosts under notify.windows.com;
       -- legacy Chrome issued jmt17.google.com (one live row) and siblings.
       or _endpoint similar to 'https://[a-z0-9.-]+\.notify\.windows\.com/%'
       or _endpoint similar to 'https://[a-z0-9.-]+\.google\.com/%'
       or _endpoint similar to 'https://[a-z0-9.-]+\.push\.apple\.com/%'
     );
$$;
revoke all on function private.push_endpoint_allowed(text) from public, anon;
grant execute on function private.push_endpoint_allowed(text) to authenticated;

create or replace function public.register_push_subscription(
  _endpoint text,
  _p256dh   text,
  _auth     text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  _me uuid := auth.uid();
begin
  if _me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if _endpoint is null or btrim(_endpoint) = '' then
    raise exception 'endpoint required' using errcode = '22023';
  end if;
  -- ⚠️ Item 12 (30 Aug 2026): the endpoint is a URL this project's edge
  -- runtime will POST to. Only real browser push services may be registered —
  -- anything else (http://, private ranges, arbitrary hosts) is refused here,
  -- at the door, so push-send can never be aimed at internal metadata
  -- endpoints or used as a signed request proxy.
  if not private.push_endpoint_allowed(_endpoint) then
    raise exception 'endpoint is not a recognised push service' using errcode = '22023';
  end if;

  -- The takeover. Whoever held this device before no longer does.
  delete from public.push_subscriptions where endpoint = _endpoint;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (_me, _endpoint, _p256dh, _auth);
end;
$function$;
revoke all on function public.register_push_subscription(text, text, text) from public;
revoke all on function public.register_push_subscription(text, text, text) from anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- ── 2 · The outbox (item 11) ───────────────────────────────────────────────
create table if not exists public.push_outbox (
  id         uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  club_id    uuid        not null,
  team_id    uuid,
  actor_id   uuid,
  category   text        not null default 'fixture',
  title      text        not null,
  body       text        not null,
  path       text        not null default '/',
  tag        text,
  constraint push_outbox_pkey primary key (id),
  -- The function refuses to send anywhere but inside the app; enforced here
  -- too so a compromised writer cannot smuggle a URL through.
  constraint push_outbox_path_is_a_path check (path like '/%')
);
alter table public.push_outbox enable row level security;
-- No policies on purpose: only SECURITY DEFINER senders write it and only the
-- service role (which bypasses RLS) reads it. Members never touch it.
revoke all on public.push_outbox from anon;
revoke all on public.push_outbox from authenticated;

create or replace function private.send_fixture_push(_club uuid, _team uuid, _actor uuid, _headline text, _event events)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare endpoint text; secret text; squad text; detail text; whenish text; outbox uuid;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_fixture_push: vault secrets missing, no push sent';
    return;
  end if;

  select t.name into squad from teams t where t.id = _team;

  whenish := to_char(_event.starts_at at time zone 'Asia/Dubai', 'Dy DD Mon')
             || case when _event.time_tbd then ', time TBC'
                     else ', ' || to_char(_event.starts_at at time zone 'Asia/Dubai', 'HH24:MI') end;

  detail := coalesce(
    case when _event.type = 'match' and _event.opponent is not null then 'v ' || _event.opponent end,
    nullif(_event.title, ''), initcap(_event.type));

  -- ⚠️ Item 11 (30 Aug 2026): the copy goes through the OUTBOX, not the HTTP
  -- body. push-send loads this row by id, renders from it, and deletes it —
  -- so holding the shared secret is no longer enough to write lock-screen
  -- text, and a replayed request finds nothing to send. For a CANCELLED
  -- fixture this row is the tombstone: _event is the trigger's OLD, and these
  -- strings are its snapshot.
  insert into public.push_outbox (club_id, team_id, actor_id, category, title, body, path, tag)
  values (_club, _team, _actor, 'fixture',
          _headline || coalesce(' — ' || squad, ''),
          detail || ' · ' || whenish,
          '/schedule',
          'fixture-' || _event.id)
  returning id into outbox;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('squad_push', jsonb_build_object('outbox_id', outbox)));
exception when others then
  raise warning 'send_fixture_push: %', sqlerrm;
end;
$function$;

-- ── 3 · Nudges travel as ids (item 10) ─────────────────────────────────────
create or replace function private.send_signup_nudges(_dry boolean default false)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
  people   jsonb;
  n        int := 0;
  total    int := 0;
  step     int;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'signup_nudge_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if not _dry and (endpoint is null or secret is null) then
    raise warning 'send_signup_nudges: vault secrets missing, nothing sent';
    return 0;
  end if;

  foreach step in array array[1, 2] loop
    -- ⚠️ Item 10 (30 Aug 2026): IDS ONLY. notify-unfinished-signup loads
    -- email and first_name from profiles by id (the notify-welcome pattern)
    -- and caps the batch — the body no longer carries an address anywhere,
    -- so the function cannot be used as a relay by anyone with the secret.
    select coalesce(jsonb_agg(jsonb_build_object(
             'profile_id', c.profile_id, 'nudge_no', step)), '[]'::jsonb),
           count(*)
      into people, n
      from private.unfinished_signup_candidates(step) as c;

    if n = 0 then
      continue;
    end if;

    total := total + n;
    if _dry then
      continue;
    end if;

    insert into public.signup_nudges (profile_id, nudge_no)
    select c.profile_id, step
      from private.unfinished_signup_candidates(step) as c
    on conflict (profile_id, nudge_no) do nothing;

    perform net.http_post(
      url     := endpoint,
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-approval-secret', secret),
      body    := jsonb_build_object('people', people));
  end loop;

  return total;
end;
$function$;

-- ── Guard ──────────────────────────────────────────────────────────────────
do $g$
declare src text;
begin
  src := pg_get_functiondef('public.register_push_subscription(text, text, text)'::regprocedure);
  if src not like '%push_endpoint_allowed%' then
    raise exception 'ABORTING: register_push_subscription does not validate the endpoint.';
  end if;
  src := pg_get_functiondef('private.send_fixture_push(uuid, uuid, uuid, text, events)'::regprocedure);
  if src not like '%push_outbox%' then
    raise exception 'ABORTING: send_fixture_push still puts copy in the HTTP body.';
  end if;
  src := pg_get_functiondef('private.send_signup_nudges(boolean)'::regprocedure);
  if src like '%''email'', c.email%' then
    raise exception 'ABORTING: send_signup_nudges still posts email addresses.';
  end if;
  if not exists (select 1 from pg_class where relname = 'push_outbox') then
    raise exception 'ABORTING: push_outbox missing.';
  end if;
  raise notice 'Push endpoints allowlisted; fixture copy via outbox; nudges travel as ids.';
end $g$;

commit;
