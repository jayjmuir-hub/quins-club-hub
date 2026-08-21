-- 21 Aug 2026 — publish_training: the squad must be in the club and fit the template
--
-- WHY. Whole-branch review of the Rugby Performance Director dashboard, on top
-- of 20260821_training_plans.sql. publish_training authorised the CALLER
-- against the club that owns the TEMPLATE, and then trusted `_teams` entirely.
-- Nothing checked that each uuid in that array belongs to that club, and
-- nothing checked contact at all.
--
-- ══ ⚠️ SECURITY DEFINER MEANS RLS IS NOT THE BACKSTOP ══════════════════════
-- The function runs as its owner and sets search_path, so the row-level
-- policies on events and training_sessions never see the caller. An admin of
-- club A who passed a team id belonging to club B would have had that team's
-- training events written for them, because the only club check in the whole
-- function was on the template. There is ONE club today, so nothing is
-- currently exploitable — which is exactly why it is cheap to fix now rather
-- than on the day a second club is created and nobody remembers this.
--
-- ══ ⚠️ CONTACT IS DEFENCE IN DEPTH, NOT A NEW RULE ═════════════════════════
-- squadFitsTemplate in src/lib/trainingPlans.js already refuses a contact
-- template for a tag squad, and the Publish screen drops any squad that stops
-- fitting. But the SCREEN was the only thing enforcing it: a direct RPC call
-- with a hand-written array published a tackling hour to a tag squad. The
-- database now refuses it too, and the screen's version becomes a courtesy
-- rather than the guard.
--
-- ══ ⚠️ AGE-BAND FITNESS STAYS IN THE UI, ON PURPOSE ════════════════════════
-- The band is PARSED FROM THE SQUAD NAME, in JavaScript (ageBandFromTeamName),
-- because the club has no age column and the names are inconsistent. There is
-- nothing here for SQL to compare, and reimplementing that parse in plpgsql
-- would give two parsers that drift. Contact is a COLUMN, so contact is the
-- half that can be enforced here — and it is the half that hurts.
--
-- ══ THE REST OF THE FUNCTION IS UNCHANGED ══════════════════════════════════
-- Same signature, same preview/real switch, same coach_edited_at skip, same
-- date-range select in club time. Only the two lines inside the loop are new,
-- and they run before any counting so a refused squad cannot half-publish.
--
-- ⚠️ 42501 (insufficient_privilege) is used for BOTH refusals so the screen's
-- existing "that change was refused" path already reads it.
--
-- ⚠️ apply_migration strips `--` comments, so nothing above reaches the
-- database. The function's own header comment is in db/schema/functions.sql.

begin;

create or replace function public.publish_training(
  _template uuid, _teams uuid[], _from date, _to date, _preview boolean default true)
returns table (team_id uuid, will_write int, skipped_coach_edited int, no_events int)
language plpgsql security definer set search_path to 'public'
as $$
declare
  _club uuid;
  _team uuid;
  _ev record;
  _session uuid;
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
    team_id := _team; will_write := 0; skipped_coach_edited := 0; no_events := 0;

    perform 1 from teams t, session_templates tpl
     where t.id = _team and tpl.id = _template
       and t.club_id = _club
       and (not tpl.requires_contact or t.requires_contact);
    if not found then
      raise exception 'squad % is not in this club or does not fit this template', _team using errcode = '42501';
    end if;

    for _ev in
      select e.id, s.id as session_id, s.coach_edited_at
        from events e
        left join training_sessions s on s.event_id = e.id
       where e.team_id = _team
         and e.type = 'training'
         and (e.starts_at at time zone 'Asia/Dubai')::date between _from and _to
    loop
      if _ev.coach_edited_at is not null then
        skipped_coach_edited := skipped_coach_edited + 1;
        continue;
      end if;
      will_write := will_write + 1;
      if _preview then continue; end if;

      if _ev.session_id is null then
        insert into training_sessions (event_id, template_id)
        values (_ev.id, _template) returning id into _session;
      else
        _session := _ev.session_id;
        update training_sessions set template_id = _template, published_at = now()
         where id = _session;
        delete from training_session_blocks where session_id = _session;
      end if;

      insert into training_session_blocks (session_id, position, drill_id, minutes, coach_note)
      select _session, b.position, b.drill_id, b.minutes, b.coach_note
        from session_template_blocks b where b.template_id = _template;
    end loop;

    if will_write = 0 and skipped_coach_edited = 0 then no_events := 1; end if;
    return next;
  end loop;
end $$;

revoke execute on function public.publish_training(uuid, uuid[], date, date, boolean) from public, anon;
grant  execute on function public.publish_training(uuid, uuid[], date, date, boolean) to authenticated, service_role;

commit;
