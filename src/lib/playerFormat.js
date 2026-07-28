// Pure presentation helpers for players. No imports — same rule as
// src/lib/scope.js and src/lib/eventFormat.js: trivially testable with plain
// strings, no network, no React, no global state.
//
// This exists because the club does not use jersey numbers (confirmed with
// Jay). The prototype's roster row and player-detail hero both led with a
// number tile; with no numbers to show, both lead with initials derived from
// full_name instead — which is always present (full_name is NOT NULL), keeps
// the design system's row rhythm and scannable left edge, and is what club
// apps conventionally do. Both screens need it, which is why it lives here
// rather than inside Roster.jsx.
//
// The jersey_num column stays in the schema: it is nullable, costs nothing
// empty, and is there if the senior sides ever want squad numbers. Nothing in
// the UI reads it.

/**
 * Two-character initials for a player's full name, e.g. "Tom Fletcher" → "TF".
 *
 * The awkward cases, decided deliberately:
 *   - Middle names are skipped — first and last word only. "Faisal Al
 *     Mansoori" → "FM", not "FAM", which would overflow a 40px tile.
 *   - A hyphenated or apostrophed surname is ONE name and contributes one
 *     letter, its first: "Nguyen-Fitzgerald" → "N", "O'Sullivan" → "O".
 *     Treating the punctuation as a word separator would yield three-letter
 *     initials for a single surname, and would also mangle names where the
 *     hyphen is intrinsic rather than a joining of two families.
 *   - A single-word name has no second initial to take, so it uses the first
 *     two letters of that word ("Ronaldinho" → "RO"), keeping every tile the
 *     same width rather than leaving lone-name players with a smaller mark.
 *   - A missing, empty or whitespace-only name returns "?" rather than
 *     rendering "undefined" into the tile. full_name is NOT NULL so this
 *     should be unreachable, but this is display code.
 *
 * Splitting is codepoint-aware, so a name outside the Basic Multilingual
 * Plane can't be cut through the middle of a surrogate pair.
 */
export function initials(fullName) {
  if (typeof fullName !== 'string') return '?'

  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  if (words.length === 1) {
    return [...words[0]].slice(0, 2).join('').toUpperCase()
  }

  const first = [...words[0]][0] ?? ''
  const last = [...words[words.length - 1]][0] ?? ''
  return (first + last).toUpperCase()
}
