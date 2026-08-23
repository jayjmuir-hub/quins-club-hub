// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  ADMIN_RIGHTS,
  adminRightLabel,
  adminRights,
  hasAdminRight,
  isAdmin,
  isSuperAdmin,
} from '../src/lib/scope.js'

// Super admin, and per-admin rights.
//
// ⚠️ THESE ARE UI HELPERS AND NOT THE ENFORCEMENT. What actually stops an
// ordinary admin promoting themselves is the column grant on `memberships`
// plus the set_admin_rights RPC — proved in db/tests/rls-super-admin.sql
// against the live database. Nothing in this file could catch a missing
// column grant, and a test here passing says nothing about the database.
//
// What these DO guard is the shape a screen reads: that a super admin is
// still an ordinary admin (the whole reason it is a flag and not a role), and
// that a right is never inferred where it was not granted.

const admin = (extra = {}) => ({ role: 'admin', status: 'active', ...extra })

describe('isSuperAdmin', () => {
  it('⚠️ a super admin is STILL an ordinary admin — the point of a flag', () => {
    // If this ever fails, the flag has been turned into a role value and the
    // twelve `role = 'admin'` checks in the schema have quietly stopped
    // matching. That is the failure the whole design exists to avoid.
    const rows = [admin({ is_super: true })]
    expect(isAdmin(rows)).toBe(true)
    expect(isSuperAdmin(rows)).toBe(true)
  })

  it('an ordinary admin is not super', () => {
    expect(isSuperAdmin([admin({ is_super: false })])).toBe(false)
    expect(isSuperAdmin([admin()])).toBe(false)
  })

  it('⚠️ a PENDING admin is never super, however the flag is set', () => {
    // Mirrors private.is_super_admin(), which checks status for the same
    // reason can_edit_team gained the check on the same day.
    expect(isSuperAdmin([{ role: 'admin', status: 'pending', is_super: true }])).toBe(false)
  })

  it('a non-admin carrying the flag is not super', () => {
    // Nothing should ever write this, and it must not be believed if it does.
    expect(isSuperAdmin([{ role: 'coach', status: 'active', is_super: true }])).toBe(false)
  })

  it('survives no memberships at all', () => {
    expect(isSuperAdmin(null)).toBe(false)
    expect(isSuperAdmin([])).toBe(false)
  })
})

describe('adminRights', () => {
  it('⚠️ a super admin implicitly holds every right', () => {
    // Otherwise Jay has to grant himself each new right as he invents it, and
    // the first thing he does on finding a dashboard missing is wonder
    // whether the feature shipped at all.
    expect(adminRights([admin({ is_super: true })])).toEqual(ADMIN_RIGHTS)
  })

  it('returns only what was granted', () => {
    expect(adminRights([admin({ admin_rights: ['media'] })])).toEqual(['media'])
  })

  it('unions across several membership rows', () => {
    const rows = [admin({ admin_rights: ['media'] }), admin({ admin_rights: ['pitches'] })]
    expect(adminRights(rows)).toEqual(['media', 'pitches'])
  })

  it('⚠️ returns a STABLE order, not the order the database stored them', () => {
    // A menu built from this must not reorder itself between reloads.
    expect(adminRights([admin({ admin_rights: ['pitches', 'youth', 'media'] })])).toEqual([
      'youth',
      'media',
      'pitches',
    ])
  })

  it('⚠️ ignores a right on a non-admin or pending row', () => {
    expect(adminRights([{ role: 'coach', status: 'active', admin_rights: ['media'] }])).toEqual([])
    expect(adminRights([{ role: 'admin', status: 'pending', admin_rights: ['media'] }])).toEqual([])
  })

  it('drops a right the app does not recognise rather than showing it', () => {
    // The database has no CHECK on these values on purpose, so an unknown one
    // is possible and must be inert — not a menu item nobody can explain.
    expect(adminRights([admin({ admin_rights: ['media', 'finance'] })])).toEqual(['media'])
  })

  it('treats a missing admin_rights as none, not as a crash', () => {
    expect(adminRights([admin()])).toEqual([])
  })
})

describe('hasAdminRight', () => {
  it('is true only for a right actually held', () => {
    const rows = [admin({ admin_rights: ['pitches'] })]
    expect(hasAdminRight(rows, 'pitches')).toBe(true)
    expect(hasAdminRight(rows, 'media')).toBe(false)
  })

  it('is true for everything when super', () => {
    const rows = [admin({ is_super: true })]
    for (const right of ADMIN_RIGHTS) expect(hasAdminRight(rows, right)).toBe(true)
  })

  it('⚠️ an ordinary admin with NO rights sees no specialist dashboard', () => {
    // The default has to be nothing. A default of "everything" would make the
    // whole tier a no-op for every admin created before it existed.
    for (const right of ADMIN_RIGHTS) expect(hasAdminRight([admin()], right)).toBe(false)
  })
})

describe('the rights vocabulary', () => {
  it('has a label for every right', () => {
    // A right with no label would render as its raw value in a menu.
    for (const right of ADMIN_RIGHTS) {
      expect(adminRightLabel(right)).not.toBe(right)
      expect(adminRightLabel(right).length).toBeGreaterThan(0)
    }
  })

  it('falls back to the raw value rather than blank for an unknown right', () => {
    expect(adminRightLabel('finance')).toBe('finance')
  })

  // ⚠️ FOUR SINCE 21 Aug 2026, AND THE FOURTH IS SPELLED DIFFERENTLY ON
  // PURPOSE. "Rugby Performance Director" is person-shaped where the other
  // three are deliberately job-shaped (claude/decisions/2026-08-12-jobs-not-people.md).
  // Jay chose the wording knowing that, so this test pins it — a later tidy-up
  // that "corrects" it to match the others is undoing a decision, not a typo.
  // Five since 23 Aug 2026: `welfare` (squad chat phase 3) gates the Welfare
  // dashboard screen. Like the others, a screen-gate, not a data permission.
  it('is the four Jay named, plus welfare', () => {
    expect(ADMIN_RIGHTS).toEqual(['youth', 'media', 'pitches', 'training', 'welfare'])
    expect(ADMIN_RIGHTS.map(adminRightLabel)).toEqual([
      'Club Youth Manager',
      'Social Media Management',
      'Pitch Management',
      'Rugby Performance Director',
      'Welfare',
    ])
  })
})
