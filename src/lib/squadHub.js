import { squadFormat } from './minis.js'
import {
  canEditTeam,
  highestRole,
  labelForRole,
} from './scope.js'

// Pure helpers for the Squad Hub picker — "yours first, then the rest of
// the club". Kept out of the screen so the grouping can be tested with
// fixture arrays and never needs jsdom.
//
// ⚠️ THIS IS NOT A NEW INFORMATION ARCHITECTURE. `/squad` still redirects a
// one-squad coach, still turns a parent-only account away, and still opens
// `/squad/:teamId` for anyone `canEditTeam` allows. The helper only decides
// WHICH of those openable squads sit in the "Your squads" card versus the
// club-wide one. Admins see every squad because canEditTeam is club-wide
// for them; without this split they get a settings dump of fifteen names.

function sortClubTeams(teams) {
  return [...(teams ?? [])].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name),
  )
}

/**
 * Squads this person may open a hub for, split into the ones they actually
 * belong to and the rest of the club they can still open (admins).
 *
 * "Yours" is any openable team that appears on a membership row with a
 * team_id — coach/manager/medic of that squad, or a parent/player row an
 * admin also holds. The club-wide admin row has team_id null on purpose
 * (src/lib/scope.js) and must not put every squad in "yours".
 *
 * @returns {{ yours: object[], rest: object[], all: object[] }}
 */
export function groupHubTeams(memberships, teams) {
  const all = sortClubTeams((teams ?? []).filter((team) => canEditTeam(memberships, team.id)))
  const yoursIds = new Set(
    (memberships ?? []).map((m) => m?.team_id).filter((id) => id != null),
  )
  const yours = all.filter((team) => yoursIds.has(team.id))
  const rest = all.filter((team) => !yoursIds.has(team.id))
  return { yours, rest, all }
}

/**
 * The muted line under the squad name.
 *
 * A team-scoped role wins: that is why this person is in "yours". Everyone
 * else (an admin opening a squad they do not staff) gets the format the
 * club already named — Mighty Minis / Friendly festivals — or "Club squad"
 * for a league side, so the rest of the club is not a second copy of the
 * name.
 */
export function hubTeamLine(memberships, team) {
  const rows = (memberships ?? []).filter((m) => m?.team_id === team?.id)
  const role = highestRole(rows)
  if (role && role !== 'admin') return labelForRole(role)
  return squadFormat(team?.name)?.title ?? 'Club squad'
}

/**
 * Circular mark on a picker row. "U13 Mixed" → "U13"; "Senior Men" → "SM".
 * Same shape as ChatList's shortBand; duplicated here so the picker does
 * not import a screen module to draw a two-letter glyph.
 */
export function squadMark(name) {
  const match = /^(U\d{1,2})/i.exec(name ?? '')
  if (match) return match[1].toUpperCase()
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}
