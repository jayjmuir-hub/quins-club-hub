// Junior play-up parent consent. Distinct from memberships.status
// (pending/active registration) on purpose: a play-up guest stays ACTIVE on
// the host so roster, chat, notices and docs still work. Only match lineup
// reads this flag. claude/plans/2026-09-05-playup-consent-and-ops.md slice 1.

export const PLAYUP_CONSENT_PENDING = 'pending'
export const PLAYUP_CONSENT_APPROVED = 'approved'

export function isPlayupConsentPending(player) {
  return Boolean(player?.guest_of) && player?.playup_consent === PLAYUP_CONSENT_PENDING
}

export function playupBlocksLineup(player) {
  return isPlayupConsentPending(player)
}
