-- 2 Sep 2026 — a push to a squad's coaches when the director suggests sessions
--
-- WHY. Part 1 of claude/plans/2026-09-02-training-suggestions-and-age-guidance.md
-- left this as the next piece once the access-request push (#644) had landed,
-- so that the two were built on one pattern rather than beside each other.
-- A suggestion nobody is told about is a suggestion nobody answers.
--
-- ══ WHO IS TOLD ════════════════════════════════════════════════════════════
-- The squad's STAFF — active coach, manager or medic memberships on that team,
-- the same set private.can_edit_team accepts at team level — never the
-- families, never the director who pressed the button, minus anybody who has
-- switched the `training` category off. Club admins are NOT included by role:
-- the director is one, and an admin who also coaches a squad gets it through
-- that squad membership. Restated independently in db/tests/training-suggestion-push.sql
-- and asserted in both directions.
--
-- ══ HOW IT TRAVELS ═════════════════════════════════════════════════════════
-- The outbox pattern from 20260830_push_hardening.sql: the SECURITY DEFINER
-- sender writes the rendered strings into public.push_outbox (which members
-- cannot touch), posts only the outbox id to push-send, and push-send reads
-- the row, deletes it (single-use) and asks
-- public.training_suggestion_push_subscriptions for the phones. The request
-- body key is `training_suggestion_push`; the edge function's parser and
-- tests/push-training-suggestion-link.test.js pin it.
--
-- ONE push per squad per publish, not one per session — a fortnight's publish
-- is many sessions and one buzz is the whole message. Sent from inside
-- suggest_training after each squad's loop, only when something was actually
-- suggested (will_suggest > 0) and never on preview.
--
-- ⚠️ IT MUST NEVER FAIL THE PUBLISH. The sender swallows everything; a missing
-- vault secret costs a push and nothing else. The suggestion rows are the
-- record; the push is the prompt.
--
-- ⚠️ A NEW OPT-OUT CATEGORY, `training`. tests/notification-categories.test.js
-- requires SOME migration to state exactly the app's list, so the constraint
-- is restated in full here.
--
-- ⚠️ apply_migration strips `--` comments, so nothing above reaches the
-- database.

begin;

-- ── The category ───────────────────────────────────────────────────────────
alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply','notice','fixture','approval',
                      'availability','squad_chat','direct_messages',
                      'document','training'));

-- ── Who is told ────────────────────────────────────────────────────────────
create or replace function public.training_suggestion_push_subscriptions(_team uuid, _actor uuid)
 returns table (id uuid, endpoint text, p256dh text, auth text)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  with staff as (
    select distinct m.profile_id
      from memberships m
     where m.status = 'active'
       and m.team_id = _team
       and m.role in ('coach','manager','medic')
       and (_actor is null or m.profile_id <> _actor))
  select s.id, s.endpoint, s.p256dh, s.auth
    from staff p
    join push_subscriptions s on s.profile_id = p.profile_id
   where not exists (
     select 1 from notification_opt_outs o
      where o.profile_id = p.profile_id and o.category = 'training');
$function$;
revoke all on function public.training_suggestion_push_subscriptions(uuid, uuid) from public, anon, authenticated;
grant execute on function public.training_suggestion_push_subscriptions(uuid, uuid) to service_role;

-- ── The sender ─────────────────────────────────────────────────────────────
create or replace function private.send_training_suggestion_push(
  _club uuid, _team uuid, _actor uuid, _count int, _from date, _to date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare endpoint text; secret text; squad text; outbox uuid; span text;
begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
  if endpoint is null or secret is null then
    raise warning 'send_training_suggestion_push: vault secrets missing, no push sent';
    return;
  end if;

  select t.name into squad from teams t where t.id = _team;
  span := case when _from = _to then to_char(_from, 'DD Mon')
               else to_char(_from, 'DD Mon') || ' to ' || to_char(_to, 'DD Mon') end;

  insert into public.push_outbox (club_id, team_id, actor_id, category, title, body, path, tag)
  values (_club, _team, _actor, 'training',
          'Training suggested' || coalesce(' — ' || squad, ''),
          'The performance director has suggested ' || _count
            || case when _count = 1 then ' session' else ' sessions' end
            || ', ' || span || '. Accept or decline on the training shelf.',
          '/squad/' || _team || '/training',
          'training-suggest-' || _team)
  returning id into outbox;

  perform net.http_post(
    url     := endpoint,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-approval-secret', secret),
    body    := jsonb_build_object('training_suggestion_push', jsonb_build_object('outbox_id', outbox)));
exception when others then
  raise warning 'send_training_suggestion_push: %', sqlerrm;
end;
$function$;
revoke all on function private.send_training_suggestion_push(uuid, uuid, uuid, int, date, date) from public, anon, authenticated;

-- ── suggest_training, now telling the squad ────────────────────────────────
-- Identical to 20260902_training_suggestions.sql except the one `perform`
-- after each squad's loop.
create or replace function public.suggest_training(
  _template uuid, _teams uuid[], _from date, _to date, _preview boolean default true)
returns table (team_id uuid, will_suggest int, unchanged int, no_events int)
language plpgsql security definer set search_path to 'public'
as $$
declare
  _club uuid;
  _team uuid;
  _ev record;
  _me uuid := auth.uid();
begin
  select club_id into _club from session_templates where id = _template and is_active;
  if _club is null then
    raise exception 'template not found or retired' using errcode = 'P0002';
  end if;
  if not private.is_admin(_club) then
    raise exception 'not an active admin of this club' using errcode = '42501';
  end if;
  if _to < _from then
    raise exception 'date range is backwards' using errcode = '22007';
  end if;

  foreach _team in array _teams loop
    team_id := _team; will_suggest := 0; unchanged := 0; no_events := 0;

    perform 1 from teams t, session_templates tpl
     where t.id = _team and tpl.id = _template
       and t.club_id = _club
       and (not tpl.requires_contact or t.requires_contact);
    if not found then
      raise exception 'squad % is not in this club or does not fit this template', _team using errcode = '42501';
    end if;

    for _ev in
      select e.id, s.id as suggestion_id, s.template_id as current_template
        from events e
        left join training_suggestions s on s.event_id = e.id
       where e.team_id = _team
         and e.type = 'training'
         and (e.starts_at at time zone 'Asia/Dubai')::date between _from and _to
    loop
      if _ev.suggestion_id is not null and _ev.current_template = _template then
        unchanged := unchanged + 1;
        continue;
      end if;
      will_suggest := will_suggest + 1;
      if _preview then continue; end if;

      if _ev.suggestion_id is null then
        insert into training_suggestions (event_id, template_id, suggested_by)
        values (_ev.id, _template, _me);
      else
        update training_suggestions
           set template_id = _template, suggested_by = _me, suggested_at = now(),
               status = 'pending', decided_by = null, decided_at = null, decline_note = null
         where id = _ev.suggestion_id;
      end if;
    end loop;

    if will_suggest = 0 and unchanged = 0 then no_events := 1; end if;
    if not _preview and will_suggest > 0 then
      perform private.send_training_suggestion_push(_club, _team, _me, will_suggest, _from, _to);
    end if;
    return next;
  end loop;
end $$;

commit;
