// src/lib/fixtureFormat.js
// What format a fixture is played in — 7s, 10s, 12s or 15s — and what follows
// from it. claude/plans/2026-09-02-fixture-format.md.
//
// ⚠️ THE FORMAT IS A PROPERTY OF THE FIXTURE, NOT THE SQUAD. A squad plays
// 15s on Friday and a 7s tournament the next weekend (Jay, 2 Sep 2026). The
// RCM/UAERF 2025-26 law variations give U18 three formats at tournaments, so
// deriving it from the age group would be wrong exactly when it matters.
//
// ⚠️ THIS FILE IS THE ONLY HOME FOR THESE NUMBERS. The match sheet, the
// lineup and the availability count all import them; none of them may hold a
// literal 22 for sizing any more. (src/data/matchSheets.js keeps SLOT_COUNT
// as the 15s MAXIMUM for the stored-slot bound — the biggest a sheet can be —
// not as the size of any particular sheet.)
//
// ⚠️ NULL READS AS 15, ON PURPOSE. Every fixture created before this column
// existed has no format, and every one of them was a 15s fixture as far as
// the sheet was concerned. Reading null as 15 keeps each of them exactly as
// it was. A league match is ALWAYS 15 — the event form writes it and a CHECK
// in the database refuses anything else on a league row.
//
// Pure, no React — the same rule scoring.js and minis.js follow, for the same
// reason: read by several screens and by tests that must not build a DOM.
//
// ⚠️ squadMax and replacements below have no consumer yet — they are
// provided for the squad-size and availability-count work in
// claude/plans/2026-09-02-senior-squads.md.

/** The formats the club plays, smallest first. Order is the order the form offers them. */
export const FORMATS = Object.freeze([7, 10, 12, 15])

/** What a fixture with no stated format is. */
export const DEFAULT_FORMAT = 15

// Squad maximum per format, straight from the law variations table:
// 7s 12, 10s 15, 12s 18, 15s 22. Sheet slots EQUAL squad max — the sheet
// names everyone who may take the field.
const SQUAD_MAX = Object.freeze({ 7: 12, 10: 15, 12: 18, 15: 22 })

// Replacements per format: squad max minus players on the pitch.
const REPLACEMENTS = Object.freeze({ 7: 5, 10: 5, 12: 6, 15: 7 })

/** True for exactly the four numbers the database CHECK admits. */
export function isFormat(value) {
  return typeof value === 'number' && FORMATS.includes(value)
}

/** The fixture's format, with null and anything unrecognised reading as 15. */
export function formatOf(event) {
  const value = event?.format
  return isFormat(value) ? value : DEFAULT_FORMAT
}

/** How many named slots the match sheet has for this format. */
export function sheetSlots(format) {
  return SQUAD_MAX[isFormat(format) ? format : DEFAULT_FORMAT]
}

/** How many replacements the format allows. */
export function replacements(format) {
  return REPLACEMENTS[isFormat(format) ? format : DEFAULT_FORMAT]
}

/** The largest squad the format allows to be named. */
export function squadMax(format) {
  return SQUAD_MAX[isFormat(format) ? format : DEFAULT_FORMAT]
}

/** "7s", "15s" — the way the club says it. */
export function formatLabel(format) {
  return `${isFormat(format) ? format : DEFAULT_FORMAT}s`
}
