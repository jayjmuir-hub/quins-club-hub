-- ══════════════════════════════════════════════════════════════════════════
--  Phase 3 — narrow WRITE access to children's records (Surface S1, edit)
--  28 Aug 2026 · admin-rights redesign
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT (spec §5.2, "Names / gender" column): editing a child's core record
-- (name, gender, squad) narrows to {clubadmin, youth, media} (+ super). Pitch,
-- Training and Welfare become READ-ONLY on the roster — they still READ names
-- (every admin right reads names, S1 read), they just can no longer edit or
-- delete a child. Squad staff keep editing their own squad; a guardian's own
-- self-service is untouched (it runs through SECURITY DEFINER RPCs, not this
-- policy). Because of Phase 0a every current admin holds clubadmin, so NOBODY
-- loses write today — only future narrow grants.
--
-- WHERE. One policy: "player edit" (ALL) on public.players, was
-- can_edit_team(team_id) — admin OR squad staff. Admins edit/insert/delete the
-- roster through the DIRECT table (src/data/players.js upsertPlayer /
-- insertPlayers / deletePlayer), so this policy is the whole admin write path.
--
-- ⚠️ THE RPCs ARE NOT A SIDE DOOR. set_own_player_gender and register_my_player
-- are guardian self-service (is_own_player / the caller's own registration) — a
-- narrowed admin cannot use them to write a child they do not own. So narrowing
-- this one policy is the whole boundary.
--
-- ⚠️ READ IS UNTOUCHED. "player read" (can_see_team OR is_own_player) stays, so
-- a Pitch/Training admin still sees the roster's names — the matrix's S1 read.
--
-- ⚠️ can_write_child SHARES THE VALUE of can_edit_child_contacts /
-- can_edit_child_photos ({clubadmin,youth,media}) TODAY, kept separate so S1's
-- write can diverge from S2/S3 if Jay rules them apart later.
--
-- Proven both directions in db/tests/child-write-allowlist.sql.

begin;

create or replace function private.can_write_child()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from memberships m
     where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active'
       and (m.is_super or m.admin_rights && array['clubadmin','youth','media']));
$$;
revoke all on function private.can_write_child() from public, anon;
grant execute on function private.can_write_child() to authenticated;

drop policy if exists "player edit" on public.players;
create policy "player edit" on public.players for all
using (private.can_write_child() or private.is_team_staff(team_id))
with check (private.can_write_child() or private.is_team_staff(team_id));

-- ── Guard: player edit is keyed on the write allowlist (not any admin), and
-- player read is unchanged (Pitch/Training keep reading names). ─────────────
do $g$
declare q text; r text;
begin
  select pg_get_expr(polqual, polrelid) into q from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='players' and p.polname='player edit';
  if q is null or q not like '%can_write_child%' then
    raise exception 'ABORTING: player edit is not keyed on the write allowlist (qual=%).', q;
  end if;
  if q like '%can_edit_team%' then
    raise exception 'ABORTING: player edit still admits any admin via can_edit_team.';
  end if;
  select pg_get_expr(polqual, polrelid) into r from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='players' and p.polname='player read';
  if r is null or r not like '%can_see_team%' then
    raise exception 'ABORTING: player read changed — S1 read must stay broad (qual=%).', r;
  end if;
  raise notice 'player write narrowed to the allowlist; read unchanged.';
end $g$;

commit;
