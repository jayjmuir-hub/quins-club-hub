-- ══════════════════════════════════════════════════════════════════════════
--  FIX — private.icon_role_label(text) and private.icon_role_matches(text,
--  memberships), created by 20260909_role_group_icons.sql, shipped with no
--  `search_path` pin. db/tests/search-path.sql caught it on its first live
--  run after #697, exactly as claude/runbooks/db-harnesses.md warns a new
--  `private` function always risks: "the only function in `private` with a
--  mutable search_path" (that warning was about a different function, on
--  1 Sep, but the mechanism is the same one).
--
--  Neither function touches a table (both are pure SQL over their
--  arguments), so this is belt-and-braces rather than a live exploit path —
--  but every other function in `private` is pinned, and the harness names
--  the exemption rather than counting it, so an unpinned function must
--  either be pinned or be argued for in db/schema/functions.sql. Nothing
--  argues for these two staying open; pin them.
--
--  Value measured from live, not guessed: every pinned function in
--  `private` (checked via `pg_proc.proconfig`, 4 Sep 2026) carries
--  `search_path=public` — one lone exception, `attachments_well_formed`,
--  pins the empty string instead, which is not this shape. `public` is what
--  every other role/membership helper in this family uses, e.g. the
--  `set search_path to 'public'` already on `club_icon_map` and
--  `my_profile_icons` two functions below these in the same migration.
--
--  Bodies are unchanged from the creating migration — only the `set
--  search_path` clause is added.
-- ══════════════════════════════════════════════════════════════════════════

create or replace function private.icon_role_matches(_role text, _m public.memberships)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select _m.status = 'active' and case _role
    when 'coach'     then _m.role = 'coach'
    when 'headcoach' then _m.role = 'coach' and _m.is_head_coach
    when 'manager'   then _m.role = 'manager'
    when 'medic'     then _m.role = 'medic'
    when 'admin'     then _m.role = 'admin'
    else false end;
$function$;

create or replace function private.icon_role_label(_role text)
returns text
language sql
immutable
set search_path = public
as $function$
  select case _role
    when 'coach'     then 'Every coach'
    when 'headcoach' then 'Every head coach'
    when 'manager'   then 'Every manager'
    when 'medic'     then 'Every medic'
    when 'admin'     then 'Every club admin'
    else _role end;
$function$;

-- ── Assert it landed ─────────────────────────────────────────────────────
do $$
declare v_unpinned text[];
begin
  select array_agg(p.proname order by p.proname) into v_unpinned
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname in ('icon_role_matches', 'icon_role_label')
    and p.proconfig is null;
  if v_unpinned is not null then
    raise exception 'still unpinned after the migration: %', array_to_string(v_unpinned, ', ');
  end if;
end $$;
