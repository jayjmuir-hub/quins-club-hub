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
 */

export function compareSquadStaff(a, b) {
  const rankDiff = squadStaffRank(a) - squadStaffRank(b)
  if (rankDiff !== 0) return rankDiff
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''))
}

function squadStaffRank(member) {
  const title = member?.title ?? ''
  const headedCoach = member?.role === 'coach' && (member?.isHeadCoach === true || /\bhead\b/i.test(title))
  if (headedCoach) return 0
  if (member?.role === 'manager') return 1
  if (member?.role === 'coach') return 2
  if (member?.role === 'medic') return 3
  return 4
}
