-- 21 Aug 2026 — a notice may go to several age groups at once.
--
-- Jay: "need the ability to check boxes for age groups when sending notices,
-- each age group and then whole club, can select multiple age groups, any
-- number of them, select whole club and the other options grey out so we don't
-- send redundant notices".
--
-- ══ FAN-OUT, NOT A JUNCTION TABLE — AND THAT IS PRECEDENT, NOT PREFERENCE ══
--
-- `claude/decisions/2026-08-05-multi-squad-events-and-pitch.md` asked exactly
-- this question for EVENTS and answered it: one row per squad, sharing a
-- `group_id`. The reasoning transfers verbatim, because `team_id` is the
-- SECURITY BOUNDARY here too — `announcement read` keys on it, and so does
-- `private.notice_audience`. A junction table would be a rewrite of the read
-- path and of the boundary; a fan-out is purely additive and every existing
-- policy, query and screen handles the rows correctly already.
--
-- ══ ⚠️ BUT NOTICES HAVE A PROBLEM EVENTS DID NOT, AND IT IS THE WHOLE POINT ══
--
-- Three squads' training sessions are three different things. A notice sent to
-- three squads is ONE MESSAGE. So a naive fan-out would push it once per row,
-- and anybody attached to more than one of the chosen squads gets the same
-- words on their phone two or three times.
--
-- ⚠️ MEASURED 21 Aug 2026, BEFORE BUILDING: SEVEN people hold active
-- memberships in two squads, two of them subscribed, four devices between
-- them. Not hypothetical, and it grows with the club.
--
-- Two changes stop it, and neither touches the edge function:
--
--   1. `notice_push_subscriptions` resolves the WHOLE GROUP and returns each
--      person once. It already took an announcement id and it still does, so
--      `push-send` needs no branch and no redeploy.
--   2. `notice_push` becomes STATEMENT-level with a transition table and posts
--      ONCE PER GROUP, for the lowest id in it. The same shape as the fixture
--      triggers built 19 Aug, for the same reason.
--
-- ⚠️ THE TRIGGER MUST STILL FIRE FOR ORDINARY SINGLE-ROW INSERTS, which is
-- most of them. `group_id` is null there and each row is its own group.

alter table public.announcements
  add column if not exists group_id uuid;

comment on column public.announcements.group_id is
  'Set when one notice was posted to several squads at once. Null for an ordinary single-squad or club-wide notice. Rows sharing a group_id are the same message.';

-- Partial: the great majority of notices are ungrouped and index nothing.
create index if not exists announcements_group_id_idx
  on public.announcements (group_id)
  where group_id is not null;

-- ── Who the push reaches ──────────────────────────────────────────────────
--
-- ⚠️ `distinct` IS THE FIX AND IT IS EASY TO DROP BY ACCIDENT. Without it a
-- person in two of the chosen squads comes back twice and is pushed twice,
-- which is the exact defect this migration exists to prevent.
--
-- ⚠️ EVERY OTHER CONDITION IS UNCHANGED FROM THE SINGLE-SQUAD VERSION — author
-- excluded, expired notice sends nothing, opt-out respected. They are read from
-- the announcement that was ASKED for, which is also the one the trigger picks,
-- and all rows in a group share an author and an expiry.
create or replace function public.notice_push_subscriptions(_announcement uuid)
  returns table (id uuid, endpoint text, p256dh text, auth text)
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
  with asked as (
    select * from announcements where id = _announcement
  ),
  siblings as (
    select an.*
      from announcements an
      join asked a
        on (a.group_id is not null and an.group_id = a.group_id)
        or (a.group_id is null and an.id = a.id)
  ),
  people as (
    select distinct aud.profile_id
      from siblings s
      cross join lateral private.notice_audience(s.club_id, s.team_id) as aud(profile_id)
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join asked a
   where p.profile_id <> a.author_id
     and (a.expires_at is null or a.expires_at > now())
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = p.profile_id and o.category = 'notice');
$function$;

-- ⚠️ NO GRANT CHANGES. `create or replace` preserves the existing ACL, and this
-- function is reached by the edge function as service_role. A `revoke ... from
-- public` here would be a privilege change smuggled into a feature migration —
-- and 19 Aug 2026 recorded that a revoke issued by a non-grantor succeeds and
-- silently does nothing, so it would not even be an honest one.

-- ── One post per message, not one per row ─────────────────────────────────
--
-- ⚠️ STATEMENT-LEVEL WITH A TRANSITION TABLE, the shape 20260819_fixture_push
-- established. FOR EACH ROW cannot see its siblings, so it cannot know that the
-- three rows it is being called for are one message.
--
-- ⚠️ AND IT MUST STILL FIRE FOR A PLAIN SINGLE-ROW INSERT, which is most
-- notices. `group_id` is null there, so `coalesce(group_id, id)` makes each
-- ungrouped row its own group and the behaviour is exactly as before.
create or replace function private.notify_notice_push()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  endpoint text;
  secret   text;
  lead     record;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'approval_notify_secret';

  if endpoint is null or secret is null then
    raise warning 'notify_notice_push: vault secrets missing, no push sent';
    return null;
  end if;

  -- ⚠️ A STABLE PICK, SO A RE-RUN AND A LOG LINE AGREE. Any row of the group
  -- resolves the same audience, but the choice should not wander.
  -- ⚠️ `array_agg(... order by ...)` AND NOT `min(id)`: THERE IS NO `min(uuid)`
  -- IN POSTGRES. The first draft of this trigger used min() and failed with
  -- "function min(uuid) does not exist" — caught by running the migration
  -- inside a rolled-back transaction before applying it, which is the only
  -- reason it is not a broken trigger on a live table.
  for lead in
    select (array_agg(a.id order by a.id))[1] as id
      from inserted a
     where a.expires_at is null or a.expires_at > now()
     group by coalesce(a.group_id, a.id)
  loop
    begin
      perform net.http_post(
        url     := endpoint,
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-approval-secret', secret),
        body    := jsonb_build_object('announcement_id', lead.id));
    exception when others then
      -- A push that cannot be sent must never stop the notice being POSTED,
      -- and one group failing must not silence the rest.
      raise warning 'notify_notice_push: % (notice %)', sqlerrm, lead.id;
    end;
  end loop;

  return null;
end;
$function$;

drop trigger if exists notice_push on public.announcements;

create trigger notice_push
  after insert on public.announcements
  referencing new table as inserted
  for each statement
  execute function private.notify_notice_push();
