// Is this pending registration a child the roster already holds?
//
// The second net, and the looser one. The FIRST is
// db/migrations/20260814_registration_duplicate_guards.sql, which refuses a
// registration whose first-and-last name key matches a player already in the
// squad. This one runs later, in front of somebody who can see the roster.
//
// ══ ⚠️ WHY A SECOND NET EXISTS AT ALL ═════════════════════════════════════
//
// 31 Aug 2026. A child registered himself weeks after a parent had already
// registered him, and a second roster row appeared. The database guard could
// not have stopped it: it compares the tokens EXACTLY, and the two spellings
// were different transliterations of one name, a single letter apart. Exact
// equality sees through middle names and hyphens, which is what the August
// cases needed. It cannot see through spelling, and spelling is the variance
// this club actually produces.
//
// ⚠️ THE GUARD IS NOT LOOSENED, AND THAT IS THE DESIGN RATHER THAN AN
// OMISSION. The person it talks to CANNOT SEE THE ROSTER — a pending
// membership fails `player read`, which is the whole point of the pending
// design. So a message there may not name what it matched, cannot be told
// apart from a false positive, and a false positive BLOCKS A REAL FAMILY FROM
// REGISTERING. The approver has none of those problems. Full reasoning,
// including the argument against:
// claude/specs/2026-08-31-duplicate-at-approval-design.md.
//
// Pure, no imports, no React, no supabase — the same reasoning as
// src/lib/completeness.js and src/lib/scope.js: it must be trivially testable
// with plain objects, because a second implementation is a second answer and
// the wrong one would be the one nobody tested.

/** Fold to lowercase, drop accents, and split into word tokens. */
function tokens(name) {
  return (name ?? '')
    .normalize('NFD')
    // ⚠️ COMBINING MARKS ONLY (U+0300–U+036F). This is what makes 'Hámza'
    // compare equal to 'Hamza'. It deliberately does NOT touch Arabic or any
    // other script: the migration MEASURED that a unicode-aware split keeps
    // non-Latin names intact, after an earlier draft claimed they "reduce to
    // nothing". Mangling them here would undo that.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Unicode letters and numbers, so a non-Latin name survives as one token
    // rather than being stripped to nothing by an ASCII class.
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * First and last token, which is the shape the database guard uses too.
 *
 * `null` when there is nothing to compare — a nameless row, or one that is
 * punctuation alone. A null key matches nothing, so this fails OPEN: the same
 * direction the migration chose, because a missed duplicate is a tidy-up and a
 * false positive is a family being told they are somebody else.
 */
function nameKey(name) {
  const parts = tokens(name)
  if (parts.length === 0) return null
  return { first: parts[0], last: parts[parts.length - 1] }
}

/**
 * Levenshtein distance, abandoned as soon as it cannot come in under `limit`.
 * Names are short, so this is cheap; the bail-out is there because it runs
 * once per roster row per pending card.
 */
function distance(a, b, limit) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > limit) return limit + 1
    prev = row
  }
  return prev[b.length]
}

// How far apart two spellings of one first name are allowed to be.
//
// ⚠️ 2 IS A MEASURED CEILING, NOT A ROUND NUMBER. The pair that got through on
// 31 Aug is 1 apart. The twins already on the roster are 4 apart. Raising this
// to 4 to "catch more" makes those twins a permanent false positive on a queue
// somebody has to read every week — which is how a warning stops being read at
// all. tests/duplicateMatch.test.js asserts both ends.
const MAX_FIRST_NAME_EDITS = 2

// A shortened first name only counts from three characters. Two would make
// every 'Jo' a possible 'Joseph', 'Joel' and 'Jonah' at once.
const MIN_PREFIX = 3

function firstNamesLookAlike(a, b) {
  if (a === b) return 'same-name'
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= MIN_PREFIX && longer.startsWith(shorter)) return 'similar-name'
  if (distance(a, b, MAX_FIRST_NAME_EDITS) <= MAX_FIRST_NAME_EDITS) return 'similar-name'
  return null
}

/**
 * Roster rows that may be the same child as `player`.
 *
 * ⚠️ SCOPED TO THE SQUAD, NEVER THE CLUB. Brothers routinely share a surname,
 * and two boys called Tom Smith in U12 and U16 are two boys — the migration's
 * rule, kept here deliberately.
 *
 * ⚠️ THE DATE OF BIRTH IS NOT AN INPUT, AND MUST NOT BECOME ONE. It
 * corroborates the wording at the call site and never raises a flag: the live
 * roster holds twins who share a surname AND a birthday, and a matcher keyed
 * on that would report them every time the queue was opened.
 *
 * @param {{ id: string, team_id: string, full_name: string|null }} player
 * @param {Array<{ id: string, team_id: string, full_name: string|null }>} roster
 * @returns {Array<{ id: string, full_name: string, reason: 'same-name'|'similar-name' }>}
 */
export function findPossibleDuplicates({ player, roster }) {
  const key = nameKey(player?.full_name)
  if (!key || !player?.team_id) return []

  const found = []
  for (const row of roster ?? []) {
    if (!row || row.id === player.id) continue
    if (row.team_id !== player.team_id) continue
    const other = nameKey(row.full_name)
    if (!other || other.last !== key.last) continue
    const reason = firstNamesLookAlike(key.first, other.first)
    if (reason) found.push({ id: row.id, full_name: row.full_name, reason })
  }
  return found
}
