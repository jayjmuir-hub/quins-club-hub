import { labelForRole } from './scope.js'

// The DM header's badge order, from public.member_identity's rows
// (claude/plans/2026-08-26-dm-identity-rows.md, Jay's ruling 26 Aug 2026):
// super-admin first, then squad staff in age-group order wearing their REAL
// title ("U16B Assistant Coach", never a generic "Coach"), then parent with
// their squads grouped onto one badge, then player likewise. Pure — the
// component renders exactly what this returns, so the ordering is tested
// here and nowhere else.
//
// Duplicate membership rows are legitimate data (memberships has no unique
// constraint — the "U10 MIXED · U10 MIXED" live case), so every stage
// dedupes.

const STAFF_ROLES = new Set(['coach', 'manager', 'medic'])

// Jay's eight, in his stated order — the dignity order the badges render in
// (claude/plans/2026-08-26-club-officers.md). An unknown title (a future
// migration's) still renders, after the known ones, rather than vanishing.
export const OFFICER_TITLES = [
  'Club President',
  'Vice Chairman',
  'Rugby Junior Manager',
  'Club Secretary',
  'Treasurer',
  'Membership Secretary',
  'Director of Rugby',
  'Rugby Performance Director',
  // The ninth — added by 20260826_officer_title_social_media.sql, the
  // closed vocabulary admitting a title the designed way.
  'Social Media Director',
  // The tenth — 20260903_officer_title_club_captain.sql (Jay, 3 Sep 2026).
  'Club Captain',
]

/** @returns [{ label, tone: 'officer'|'admin'|'staff'|'family', squads? }] */
export function identityBadges(rows) {
  const list = rows ?? []
  const badges = []

  // Club officers lead — titles without rights, dignity order, deduped.
  const officerRank = (title) => {
    const i = OFFICER_TITLES.indexOf(title)
    return i === -1 ? OFFICER_TITLES.length : i
  }
  const officers = [...new Set(list.filter((r) => r.role === 'officer' && r.title).map((r) => r.title))]
    .sort((a, b) => officerRank(a) - officerRank(b) || a.localeCompare(b))
  for (const title of officers) badges.push({ label: title, tone: 'officer' })

  // One admin badge however many rows carry it — is_super or a bare admin
  // role both read as the club's administrator to a member.
  if (list.some((r) => r.is_super || r.role === 'admin')) {
    badges.push({ label: 'Club Hub admin', tone: 'admin' })
  }

  const staff = list
    .filter((r) => STAFF_ROLES.has(r.role) && r.squad)
    .sort((a, b) => (a.squad_sort ?? 0) - (b.squad_sort ?? 0) || a.squad.localeCompare(b.squad))
  const seen = new Set()
  for (const r of staff) {
    const label = `${r.squad} ${r.title ?? labelForRole(r.role) ?? r.role}`
    if (seen.has(label)) continue
    seen.add(label)
    badges.push({ label, tone: 'staff' })
  }

  for (const role of ['parent', 'player']) {
    const squads = [
      ...new Set(
        list
          .filter((r) => r.role === role && r.squad)
          .sort((a, b) => (a.squad_sort ?? 0) - (b.squad_sort ?? 0) || a.squad.localeCompare(b.squad))
          .map((r) => r.squad),
      ),
    ]
    if (squads.length || list.some((r) => r.role === role)) {
      badges.push({ label: labelForRole(role), tone: 'family', squads: squads.join(', ') })
    }
  }

  return badges
}
