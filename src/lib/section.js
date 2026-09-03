// The senior sections — claude/plans/2026-09-03-senior-section.md.
//
// ⚠️ `teams.section` IS A COLUMN, SET BY AN ADMIN, NEVER PARSED FROM A NAME.
// The same rule as is_senior and uses_jersey_numbers. This file only turns
// the code into words and answers "which sections can this person see".
//
// ⚠️ WHAT A SECTION GRANTS IS DECIDED BY THE DATABASE, not here
// (db/migrations/20260905_senior_section.sql). `sectionsFor` decides what to
// OFFER on screen — which switch pills to draw — and a wrong answer here shows
// an empty list, never a row RLS would have refused.

export const SECTIONS = [
  { code: 'senior_men', label: 'Men', long: 'Senior men' },
  { code: 'senior_women', label: 'Women', long: 'Senior women' },
]

export const SECTION_CODES = SECTIONS.map((s) => s.code)

export function sectionLabel(code) {
  return SECTIONS.find((s) => s.code === code)?.label ?? ''
}

export function sectionLong(code) {
  return SECTIONS.find((s) => s.code === code)?.long ?? ''
}

/** Every squad in a section, in the club's own order. */
export function teamsInSection(teams, code) {
  // ⚠️ null is "no section", never a section: a junior squad's null must not
  // match a request for null.
  if (!code) return []
  return (teams ?? [])
    .filter((team) => team.section === code)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name))
}

/**
 * The sections this person belongs to — those of the squads they hold an
 * active membership in. An admin belongs to none by this measure and sees
 * every section through `admin` instead.
 *
 * @returns {{ mine: string[], all: string[] }} codes, in SECTIONS order
 */
export function sectionsFor(memberships, teams, { admin = false } = {}) {
  const byTeam = new Map((teams ?? []).map((team) => [team.id, team]))
  const present = new Set((teams ?? []).map((team) => team.section).filter(Boolean))
  const mine = new Set()
  for (const membership of memberships ?? []) {
    if (membership.status && membership.status !== 'active') continue
    const section = byTeam.get(membership.team_id)?.section
    if (section) mine.add(section)
  }
  const order = (set) => SECTION_CODES.filter((code) => set.has(code))
  return {
    mine: order(mine),
    all: admin ? order(present) : order(new Set([...mine, ...present])),
  }
}
