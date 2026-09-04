-- ══════════════════════════════════════════════════════════════════════════
--  FIX — public.end_callup(uuid) returned a STALE row: it read `req` before
--  updating callup_requests, then returned that same pre-update variable, so
--  callers were told status = 'consented' after a successful end. The senior
--  membership WAS deleted correctly (the delete runs against the live table,
--  not the variable); only the returned status was wrong.
--
--  Found 4 Sep 2026 by db/tests/callups.sql step 10, the harness's own first
--  live run after `claude/runbooks/db-harnesses.md`'s FAIL-row fix made a
--  silent-pass harness able to fail. Confirmed against the LIVE function body
--  (captured with `select pg_get_functiondef('public.end_callup(uuid)'::
--  regprocedure)` inside a rolled-back probe, per the "migration files are not
--  authoritative" lesson) before editing, rather than trusting this repo's own
--  20260906_callups.sql — which turned out to already carry the same bug, so
--  the two agreed.
--
--  Body is otherwise IDENTICAL to the captured live definition. The single
--  change: re-select `req` from the table after the update, so the returned
--  row reflects what was actually written (status, decided_at, decided_by).
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.end_callup(_request uuid)
returns public.callup_requests
language plpgsql
security definer
set search_path = public
as $$
declare req public.callup_requests; p public.players; senior public.teams;
begin
  select * into req from public.callup_requests where id = _request;
  if req.id is null then raise exception 'No such request.' using errcode = '22023'; end if;
  if not (private.can_edit_team(req.senior_team_id) or private.is_admin(req.club_id)) then
    raise exception 'Only the senior squad''s staff or an admin can end a call-up.' using errcode = '42501';
  end if;
  if req.status <> 'consented' then
    raise exception 'Only an active call-up can be ended.' using errcode = '22023';
  end if;
  select * into p from public.players where id = req.player_id;
  select * into senior from public.teams where id = req.senior_team_id;
  -- The senior twins go; the home squad's rows and the consent stay.
  delete from public.memberships m
   where m.player_id = req.player_id and m.team_id = req.senior_team_id;
  update public.callup_requests set status = 'removed', decided_at = now(), decided_by = auth.uid() where id = req.id;
  -- ⚠️ THE FIX: re-read the row so the caller sees what was actually written,
  -- instead of the pre-update snapshot taken at the top of this function.
  select * into req from public.callup_requests where id = req.id;
  perform private.push_to_profiles(
    (select coalesce(array_agg(a), '{}'::uuid[]) from private.approval_audience(req.club_id, req.home_team_id, auth.uid()) as a),
    'approval', p.full_name || ' back from ' || senior.name, 'The call-up has ended. Inform only.', '/callups', 'callup-' || req.id);
  perform private.push_to_profiles(private.callup_family(req.player_id), 'approval',
    p.full_name || '''s call-up to ' || senior.name || ' has ended', 'Their place in the home squad is unchanged.', '/callups', 'callup-' || req.id);
  return req;
end;
$$;
revoke execute on function public.end_callup(uuid) from public;
grant execute on function public.end_callup(uuid) to authenticated;

-- ── Assert it landed ─────────────────────────────────────────────────────
do $$
begin
  if (select pg_get_functiondef('public.end_callup(uuid)'::regprocedure)) not like '%select * into req from public.callup_requests where id = req.id;%' then
    raise exception 'end_callup was not re-selected after the update';
  end if;
end $$;
