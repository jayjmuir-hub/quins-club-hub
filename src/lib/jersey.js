// src/lib/jersey.js
// Season jersey numbers — seniors only (claude/plans/2026-09-02-senior-squads.md).
// Pure, no React. The database enforces 1–99 and uniqueness per squad
// (players_jersey_num_check, players_team_jersey_unique); this file is what
// the screens ask BEFORE a write, so a refusal reads as a sentence and not
// as a constraint name.

export function isJerseyNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= 99
}

/** '' → null (clear), a valid number → the number, anything else → undefined (refuse). */
export function parseJerseyInput(text) {
  const trimmed = String(text ?? '').trim()
  if (trimmed === '') return null
  if (!/^\d{1,2}$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return isJerseyNumber(n) ? n : undefined
}

export function jerseyClashMessage(number, holderName) {
  return `Number ${number} is already worn by ${holderName} in this squad. Clear theirs first, or pick another.`
}

/** Numbered first, ascending; then the unnumbered by name. */
export function sortByJersey(a, b) {
  const an = isJerseyNumber(a.jersey_num) ? a.jersey_num : null
  const bn = isJerseyNumber(b.jersey_num) ? b.jersey_num : null
  if (an != null && bn != null) return an - bn
  if (an != null) return -1
  if (bn != null) return 1
  return a.full_name.localeCompare(b.full_name)
}
