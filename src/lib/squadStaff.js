import { SQUAD_STAFF_ROLES } from './scope.js'

/**
 * Order within a squad: Head Coach, Team Manager(s), Assistant Coaches, Medics.
 *
 * Jay, 25 Aug 2026: reverse the previous ruling (name order because "role
 * order reads as a hierarchy the club has not agreed to"). The club has now
 * agreed. Same role keeps name order. A title like "Head Coach", or the
 * `is_head_coach` flag, still wins over a plain coach — "Overheads and Kit"
 * does not, because that is a different word.
 *
 * Lives in `lib/` (not `data/staff.js`) so a test that mocks the data module
 * still gets the real comparator — Home's Dashboard tests mock listMySquadStaff
 * and would otherwise sort as no-ops.
 *
 * ⚠️ ROLE NAMES COME FROM SQUAD_STAFF_ROLES, NEVER FROM A LITERAL. tests/
 * staff-roles.test.jsx refuses `=== 'coach'` anywhere in src/ but scope.js —
 * this file is the agreed sort, not a second vocabulary.
 */

export function compareSquadStaff(a, b) {
  const rankDiff = squadStaffRank(a) - squadStaffRank(b)
  if (rankDiff !== 0) return rankDiff
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
}

function squadStaffRank(member) {
  const title = member?.title ?? ''
  const role = member?.role
  const [coach, manager, medic] = SQUAD_STAFF_ROLES
  const headedCoach = role === coach && (member?.isHeadCoach === true || /\bhead\b/i.test(title))
  if (headedCoach) return 0
  if (role === manager) return 1
  if (role === coach) return 2
  if (role === medic) return 3
  return 4
}
