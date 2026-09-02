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
