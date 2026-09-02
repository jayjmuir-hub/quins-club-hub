-- 2 Sep 2026 — training_suggestions: the director's session is a SUGGESTION,
-- and publish never writes a coach's plan again.
--
-- WHY. A coach, via Jay, 2 Sep 2026: the performance director's published
-- sessions "should be simply noted as a suggestion and the coach could accept
-- or decline, if accepted then they would still have the ability to adjust
-- that session." Part 1 of
-- claude/plans/2026-09-02-training-suggestions-and-age-guidance.md.
--
-- ══ WHAT publish_training DID, AND WHY THAT WAS THE COMPLAINT ══════════════
-- It wrote the template's blocks straight into training_sessions /
-- training_session_blocks for every training event in range, skipping only a
-- session a coach had already SAVED (coach_edited_at). A session the coach had
-- simply not got to yet became the director's plan, with nothing on screen to
-- say it was not the coach's own.
--
-- ══ THE SHAPE: A SUGGESTION IS ITS OWN ROW, BESIDE THE SESSION ═════════════
-- One row per event, pointing at the template. Blocks are NOT copied here —
-- the template's blocks are what the coach sees and what accept copies. So a
-- pending suggestion always shows the template as it is now (it is the
-- director's suggestion until accepted), and an accepted one is a COPY the
-- director's later edits cannot reach.
--
-- Considered and not chosen: a status column on training_sessions. Cheaper,
-- but the suggestion then occupies the plan slot and an un-edited existing
-- plan is still clobbered — the exact complaint. Two rows means nothing the
-- coach has is ever overwritten, and a second publish has somewhere to go.
--
-- ══ TWO RPCs, BOTH SECURITY DEFINER, SO THE TABLE NEEDS NO WRITE POLICY ═════
-- suggest_training(...)  — admin only. Same signature and preview switch as
--   publish_training. Never touches training_sessions. Per event in range:
--     no row                          → insert pending
--     pending, different template     → replace (the director changed their mind)
--     accepted/declined, different tpl→ back to pending (a fresh question)
--     same template, any status       → unchanged (never nags)
--   Returns (team_id, will_suggest, unchanged, no_events).
-- decide_training_suggestion(...) — squad staff only (private.can_edit_team on
--   the event's team). Accept copies the template's blocks into the session
--   (creating it, visibility 'staff', if there is none; replacing its blocks
--   if there is — the screen asks first), stamps coach_edited_at, and marks
--   the row accepted. Decline marks it declined with an optional note.
--   An accepted session IS a coach's session: the ordinary editor takes over.
--
-- ══ ⚠️ publish_training IS LEFT IN PLACE, ON PURPOSE ═══════════════════════
-- The deployed app still calls it and reads its return shape. A new name means
-- this migration and the app deploy can land in either order. A later
-- migration drops publish_training once nothing on main calls it.
--
-- ══ ⚠️ CONTACT IS STILL REFUSED HERE, EXACTLY AS IN publish_training ═══════
-- A contact template can no more be SUGGESTED to a tag squad than published
-- to one. Age is not checked (it never was, server-side): since 7db98ca the
-- band is guidance in the UI.
--
-- ══ WHO MAY READ ═══════════════════════════════════════════════════════════
-- Staff of the squad (can_edit_team) and the club's admins (is_admin). A
-- parent or player never sees a suggestion, pending or otherwise — nothing in
-- the read policy resolves through is_attached_to_team.
--
-- ⚠️ apply_migration strips `--` comments, so nothing above reaches the
-- database. The functions' header comments are in db/schema/functions.sql.

begin;

-- ── The table ──────────────────────────────────────────────────────────────
create table if not exists public.training_suggestions (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null unique references public.events(id) on delete cascade,
  template_id   uuid not null references public.session_templates(id) on delete cascade,
  suggested_by  uuid not null references public.profiles(id),
  suggested_at  timestamptz not null default now(),
  status        text not null default 'pending'
                  check (status in ('pending','accepted','declined')),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  decline_note  text,
  constraint training_suggestions_decision_shape check (
    (status = 'pending' and decided_by is null and decided_at is null and decline_note is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null)
  )
);
comment on table public.training_suggestions is
  'The director''s suggested session for one training event. One row per event; a re-publish with a different template resets it to pending. Never written by the app directly — suggest_training and decide_training_suggestion are the only writers. Blocks are not copied here: accept copies them from the template into training_sessions.';
comment on column public.training_suggestions.status is
  'pending until the squad''s staff accept or decline. Accepted means the template''s blocks were copied into the session and coach_edited_at stamped; the session is the coach''s from then on.';

alter table public.training_suggestions enable row level security;

-- Birth defaults trimmed the same way the likes tables were: nothing for
-- anon, SELECT only for authenticated. The two RPCs are the writers.
revoke all on public.training_suggestions from public, anon, authenticated;
grant select on public.training_suggestions to authenticated;

drop policy if exists "suggestion read" on public.training_suggestions;
create policy "suggestion read" on public.training_suggestions for select
  using (exists (
    select 1 from public.events e
     where e.id = training_suggestions.event_id
       and (private.can_edit_team(e.team_id) or private.is_admin(e.club_id))));

-- ── suggest_training ───────────────────────────────────────────────────────
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
        -- A different template: whatever the answer to the old one was, this
        -- is a fresh question.
        update training_suggestions
           set template_id = _template, suggested_by = _me, suggested_at = now(),
               status = 'pending', decided_by = null, decided_at = null, decline_note = null
         where id = _ev.suggestion_id;
      end if;
    end loop;

    if will_suggest = 0 and unchanged = 0 then no_events := 1; end if;
    return next;
  end loop;
end $$;

revoke execute on function public.suggest_training(uuid, uuid[], date, date, boolean) from public, anon;
grant  execute on function public.suggest_training(uuid, uuid[], date, date, boolean) to authenticated, service_role;

-- ── decide_training_suggestion ─────────────────────────────────────────────
create or replace function public.decide_training_suggestion(
  _suggestion uuid, _accept boolean, _note text default null)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  _s record;
  _session uuid;
  _me uuid := auth.uid();
begin
  select s.id, s.event_id, s.template_id, s.status, e.team_id
    into _s
    from training_suggestions s
    join events e on e.id = s.event_id
   where s.id = _suggestion;
  if _s.id is null then
    raise exception 'suggestion not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_team(_s.team_id) then
    raise exception 'not staff of this squad' using errcode = '42501';
  end if;
  if _s.status <> 'pending' then
    raise exception 'this suggestion has already been answered' using errcode = '22023';
  end if;

  if _accept then
    select id into _session from training_sessions where event_id = _s.event_id;
    if _session is null then
      insert into training_sessions (event_id, template_id, coach_edited_at, visibility, created_by)
      values (_s.event_id, _s.template_id, now(), 'staff', _me)
      returning id into _session;
    else
      update training_sessions
         set template_id = _s.template_id, coach_edited_at = now()
       where id = _session;
      delete from training_session_blocks where session_id = _session;
    end if;
    insert into training_session_blocks (session_id, position, drill_id, minutes, coach_note)
    select _session, b.position, b.drill_id, b.minutes, b.coach_note
      from session_template_blocks b where b.template_id = _s.template_id;

    update training_suggestions
       set status = 'accepted', decided_by = _me, decided_at = now(), decline_note = null
     where id = _s.id;
    return _session;
  end if;

  update training_suggestions
     set status = 'declined', decided_by = _me, decided_at = now(),
         decline_note = nullif(btrim(coalesce(_note, '')), '')
   where id = _s.id;
  return null;
end $$;

revoke execute on function public.decide_training_suggestion(uuid, boolean, text) from public, anon;
grant  execute on function public.decide_training_suggestion(uuid, boolean, text) to authenticated, service_role;

commit;
