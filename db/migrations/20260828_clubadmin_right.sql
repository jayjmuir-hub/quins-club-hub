-- ══════════════════════════════════════════════════════════════════════════
--  `clubadmin` — the base admin right, and the backfill that makes it safe
--  28 Aug 2026 · admin-rights redesign, Phase 0a (the linchpin)
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT AND WHY (design: claude/plans/2026-08-28-admin-rights-migration.md,
-- spec §4 Option 1):
--   The "Club Hub Admin" portal was open to every admin by construction
--   (`right: null` in src/lib/portals.js). To make specialist rights real
--   boundaries later, that base capability has to become a right in its own
--   name — `clubadmin` — so a right can compose the portal like any other and,
--   eventually, so an admin can be narrowed below full Club-Hub-Admin sight.
--
--   This migration is Phase 0a's DATA half: give every existing admin the new
--   right so that when the frontend flip ships (portal `right: null` →
--   `'clubadmin'`) nobody loses the screen. The frontend half ships separately,
--   on merge to `main`.
--
-- ⚠️ ORDER IS LOAD-BEARING, ACROSS TWO DEPLOY SURFACES.
--   1. THIS migration is applied to production FIRST (additive, invisible).
--   2. THEN the frontend flip is merged and deployed.
--   Between the two, a non-super admin who lacked `clubadmin` would find the
--   Club Hub Admin card greyed. Applying this first closes that window. The
--   migration is safe to sit applied for any length of time before the deploy:
--   the current bundle's adminRights() filters admin_rights to the deployed
--   ADMIN_RIGHTS list, which does not yet contain 'clubadmin', so the value is
--   simply ignored until the flip ships. It grants nothing and hides nothing.
--
-- ⚠️ NON-SUPER ADMINS ONLY, ON PURPOSE.
--   A super admin holds every right IMPLICITLY — adminRights() short-circuits
--   on isSuperAdmin (src/lib/scope.js), and the server helpers the later phases
--   add must mirror that (is_super OR right = any(rights)). Writing 'clubadmin'
--   into a super's deliberately-empty admin_rights array would break the "supers
--   hold everything without being granted it" invariant (the reason those arrays
--   are empty) for no gain: the client and every future helper already answer
--   TRUE for them. So supers are left untouched.
--
-- ⚠️ IT IS ADDITIVE AND IDEMPOTENT. The `not (... = any ...)` guard means a
--   second run touches nothing, and no admin loses a right they hold.
--
-- ⚠️ THE AUDIT TRIGGER WILL FIRE, AND THAT IS CORRECT. audit_membership
--   (db/migrations/20260817_membership_audit.sql) records this UPDATE as
--   action='changed' with actor_kind='system' (a migration has no auth.uid()).
--   A system-attributed grant of clubadmin to each backfilled admin is exactly
--   the trail we want.
--
-- ⚠️ `clubadmin` HAS NO CHECK CONSTRAINT, like every other right — the
--   vocabulary lives in src/lib/scope.js ADMIN_RIGHTS ("change one, change
--   both"). This migration adds the DATA; that commit adds the NAME.
--
-- Proven in db/tests/clubadmin-backfill.sql (both directions, rolled back).

begin;

update public.memberships
   set admin_rights = array_append(admin_rights, 'clubadmin')
 where role = 'admin'
   and status = 'active'
   and is_super = false
   and not ('clubadmin' = any(admin_rights));

-- ── THE GUARD ──────────────────────────────────────────────────────────────
-- After this migration, no active non-super admin may lack clubadmin. If one
-- does, the WHERE above is wrong and the flip would strip them — abort loudly
-- rather than commit a half-backfill.
do $$
declare
  missing int;
begin
  select count(*) into missing
  from public.memberships
  where role = 'admin'
    and status = 'active'
    and is_super = false
    and not ('clubadmin' = any(admin_rights));

  if missing <> 0 then
    raise exception
      'ABORTING: % active non-super admin(s) still lack clubadmin after the '
      'backfill. The Club Hub Admin flip would strip them.', missing;
  end if;

  raise notice 'clubadmin backfill: every active non-super admin now holds it.';
end $$;

commit;
