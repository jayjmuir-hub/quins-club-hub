// Pure helpers for "this player has left" — spec
// claude/specs/2026-09-02-player-leavers-design.md. A leaver is a players row
// with a non-null left_at. Nothing here reads the network.

export const LEFT_TAG = 'Left'

export function isLeaver(player) {
  return Boolean(player?.left_at)
}

/** A historic team sheet must still read correctly, so a leaver's name carries a tag. */
export function leaverName(player) {
  const name = player?.full_name ?? ''
  return isLeaver(player) ? `${name} · ${LEFT_TAG}` : name
}

/**
 * True when a profile's ONLY memberships are 'left'. Such a person has no
 * squad and is not waiting for approval either — the shell must show them the
 * same "tell the club who you are" screen as somebody with no memberships,
 * not a blank app. Mirrors isPendingOnly in scope.js in shape.
 */
export function isLeftOnly(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return false
  return memberships.every((m) => m?.status === 'left')
}

// ⚠️ NOT toLocaleDateString('en-GB', { month: 'short' }) — Node's ICU data
// renders September as "Sept" (four letters) where every other short month is
// three, so a locale-driven format is not stable across environments and is
// not even self-consistent across the year. Fixed table instead.
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * The day a player left, as `2 Sep 2026`.
 *
 * ⚠️ IT LIVES HERE BECAUSE TWO SCREENS SHOW IT AND THEY DISAGREED. AdminClub
 * had this table; PlayerDetail called toLocaleDateString. So the club screen
 * said "2 Sep 2026" and the player sheet said "2 Sept 2026" about the same
 * player on the same day — and the test that covered it used a `/sept?/`
 * regex, which accepted the disagreement rather than catching it. One fact,
 * one formatter (leavers review, 2 Sep 2026).
 */
export function formatLeftDate(iso) {
  const d = new Date(iso)
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
