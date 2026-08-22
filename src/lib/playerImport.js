// Parser for the roster bulk-import paste box (desktop-spec.md §5.1).
//
// Pure — no imports beyond the positions enum, no network, no React. Same
// rule as src/lib/scope.js and src/lib/playerFormat.js, and for the same
// reason: this is the piece with the most branching in the whole feature, so
// it needs to be testable with plain strings.
//
// The design premise is that MALFORMED INPUT IS THE NORMAL CASE. This box
// will mostly receive a paste out of Excel or Google Sheets, which arrives
// with a header row, trailing blank rows, smart quotes from autocorrect, and
// non-breaking spaces. Rejecting the paste and asking the user to clean it up
// by hand would defeat the point of having an importer. So: be liberal about
// shape, strict about meaning, and report per row rather than failing whole.
//
// What this file does NOT do is decide permissions. It marks a row invalid if
// the team is unknown or unwritable, but that is a *reporting* convenience so
// the preview can grey the row out. RLS is what actually refuses the insert.
import { canonicalPosition } from './positions.js'
import { canonicalGender, squadRequiresGender } from './gender.js'

// Word-joiner, BOM, non-breaking space and the smart quote family. Excel and
// Word insert these silently and they are invisible in the preview, so a name
// that looks identical to the eye fails an equality check against the team
// list. Normalised before anything else looks at the text.
const INVISIBLES = /[​-‍﻿]/g
const NBSP = / /g
const SMART_SINGLE = /[‘’‚‛]/g
const SMART_DOUBLE = /[“”„‟]/g

function normaliseText(text) {
  return String(text ?? '')
    .replace(INVISIBLES, '')
    .replace(NBSP, ' ')
    .replace(SMART_SINGLE, "'")
    .replace(SMART_DOUBLE, '"')
}

// Tab wins when present: a tab-separated paste is what you get from a
// spreadsheet, and a name legitimately containing a comma ("Smith, Jr") would
// otherwise be split. Only fall back to comma when there is no tab anywhere.
function detectDelimiter(text) {
  return text.includes('\t') ? '\t' : ','
}

// Minimal CSV field splitter: handles double-quoted fields containing the
// delimiter, and "" as an escaped quote inside one. Deliberately not a full
// RFC 4180 implementation — no embedded newlines inside quoted fields, which
// a roster paste does not produce and which would require restructuring the
// line split above.
function splitLine(line, delimiter) {
  const out = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1 } else { inQuotes = false }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      out.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  out.push(field)
  return out.map((f) => f.trim())
}

// A first row is a header if its cells are header WORDS rather than data.
// Checked by name rather than by "does row 1 validate", because a header row
// reading "Name, Position, Team" would otherwise be imported as a player
// called Name — the single most likely way this feature embarrasses someone.
const HEADER_WORDS = new Set([
  'name', 'names', 'full name', 'fullname', 'player', 'players', 'player name',
  'first', 'last', 'first name', 'last name', 'firstname', 'lastname', 'surname', 'forename',
  'position', 'positions', 'pos',
  'team', 'teams', 'age group', 'age groups', 'agegroup', 'age', 'squad', 'squads', 'group',
  'gender', 'genders', 'sex', 'm/f', 'boy/girl',
])

function looksLikeHeader(cells) {
  const filled = cells.filter((c) => c !== '')
  if (filled.length === 0) return false
  return filled.every((c) => HEADER_WORDS.has(c.toLowerCase()))
}

// The roster-identity key: case- and whitespace-insensitive name, per squad.
// Shared by the already-on-the-roster check and the within-paste duplicate
// check, so "TOM  FLETCHER" and "Tom Fletcher" are the same child in both.
const nameKey = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Parses pasted roster text into rows ready for preview.
 *
 * ⚠️ COLUMNS ARE CLASSIFIED BY CONTENT, NOT BY POSITION — 22 Aug 2026, after
 * Jay pasted the spreadsheet a club actually has (name, age group, gender —
 * no position column) and all 38 rows failed with ""U16B" is not a position".
 * Squad names, positions and gender tokens are three closed vocabularies that
 * do not overlap, so every cell can say what it is: a cell matching a squad
 * is the age group, a position word is the position, a gender token is the
 * gender, and the name is what remains. Any column order works, any subset
 * works, and the old fixed order still parses identically.
 *
 * The NAME is the first CONTIGUOUS run of unclassified cells, which is what
 * lets a sheet with separate First and Last columns import ("Harry" "Nunn" →
 * "Harry Nunn"). An unclassified cell OUTSIDE that run — a "Y" in a gender
 * column, a "1" — is an error naming the value, never silently dropped and
 * never silently glued onto a name: both failure modes put garbage in the
 * database with a green tick next to it.
 *
 * @param {string} text        raw clipboard content
 * @param {object} options
 * @param {Array}  options.teams      [{ id, name }] the user may see
 * @param {Function} [options.canEditTeam]  (teamId) => boolean; rows for teams
 *   the user cannot write are marked invalid so the preview can say why,
 *   rather than letting the insert fail opaquely.
 * @param {string} [options.defaultTeamId]  the squad the screen's picker has
 *   selected: rows naming NO squad fall back to it, so a plain list of names
 *   is a valid import. A row naming its own squad still wins.
 * @param {Array}  [options.existingPlayers]  [{ full_name, team_id }] already
 *   on the roster. A pasted row matching one (same squad, name compared
 *   case- and whitespace-insensitively) is SKIPPED — a third state beside
 *   ready and needs-fixing, counted as `skippedCount`, never inserted, and
 *   not red: re-pasting an updated sheet is ordinary, not an error. Until
 *   22 Aug 2026 nothing checked this and a second paste doubled the squad
 *   with a green tick on every row. A genuine namesake in the same squad is a
 *   deliberate act for the single-player form, where the existing child is
 *   visible first.
 *
 * @returns {{rows: Array, delimiter: string, headerSkipped: boolean,
 *           validCount: number, invalidCount: number}}
 *   Each row: { lineNo, full_name, position, team_id, teamName, errors[], ok }
 *   `lineNo` is 1-based against the ORIGINAL paste including blanks and the
 *   header, so an error message can point the user at the line they can see.
 */
export function parsePlayerPaste(
  text,
  { teams = [], canEditTeam, defaultTeamId = null, existingPlayers = [] } = {},
) {
  const normalised = normaliseText(text)
  const delimiter = detectDelimiter(normalised)

  // Case-insensitive team lookup. Built from the caller's team list, so it is
  // already scoped to what the user may see — an unknown name here means
  // "not a squad you have", which is exactly the message we want to show.
  const teamsByName = new Map(
    teams.map((t) => [String(t.name ?? '').trim().toLowerCase(), t]),
  )
  const defaultTeam = teams.find((t) => t.id === defaultTeamId) ?? null
  const existingKeys = new Set(
    existingPlayers.map((player) => `${nameKey(player.full_name)}::${player.team_id}`),
  )

  const rawLines = normalised.split(/\r\n|\n|\r/)
  const rows = []
  let headerSkipped = false

  rawLines.forEach((rawLine, index) => {
    const lineNo = index + 1
    if (rawLine.trim() === '') return // blank rows are noise, not errors

    const cells = splitLine(rawLine, delimiter)

    // Only the first non-blank line can be a header.
    if (!headerSkipped && rows.length === 0 && looksLikeHeader(cells)) {
      headerSkipped = true
      return
    }

    const errors = []

    // ── Classify every cell by what it contains ──────────────────────────
    // First match of each kind wins; a second squad name (or position, or
    // gender) on one line falls through to the unclassified pile and is
    // reported below rather than silently overwriting the first.
    let team = null
    let teamCellText = ''
    let position = null
    let gender = null
    const unclassified = [] // { index, value }

    cells.forEach((cell, cellIndex) => {
      if (cell === '') return
      if (!team) {
        const matched = teamsByName.get(cell.toLowerCase())
        if (matched) {
          team = matched
          teamCellText = cell
          return
        }
      }
      if (position === null) {
        const matchedPosition = canonicalPosition(cell)
        if (matchedPosition !== null) {
          position = matchedPosition
          return
        }
      }
      if (gender === null) {
        const matchedGender = canonicalGender(cell)
        if (matchedGender !== null) {
          gender = matchedGender
          return
        }
      }
      unclassified.push({ index: cellIndex, value: cell })
    })

    // The name: the first contiguous run of unclassified cells, joined.
    // Anything unclassified OUTSIDE that run is a value we could not read —
    // say so per value, because gluing it onto the name or dropping it are
    // both ways of importing garbage with a green tick.
    const nameParts = []
    let runEnd = null
    for (const entry of unclassified) {
      if (runEnd === null || entry.index === runEnd + 1) {
        nameParts.push(entry.value)
        runEnd = entry.index
      } else {
        errors.push(
          `Couldn't tell what "${entry.value}" is — not a position, one of your age groups, or Male/Female`,
        )
      }
    }
    const fullName = nameParts.join(' ')

    if (fullName === '') errors.push('Name is required')
    else if (fullName.length > 120) errors.push('Name is too long')

    // Squad: a row that names one keeps it; a row that names none takes the
    // screen's picker. players.team_id is NOT NULL, so no squad from either
    // source is an error.
    if (!team && defaultTeam) {
      team = defaultTeam
      teamCellText = defaultTeam.name
    }
    if (!team) {
      errors.push('No age group on this line — add one, or pick a squad above the box')
    } else if (typeof canEditTeam === 'function' && !canEditTeam(team.id)) {
      errors.push(`You can't add players to ${team.name}`)
    }

    // ⚠️ GENDER IS REQUIRED WHEN THE SQUAD IS SINGLE-GENDER (Jay, 9 Aug 2026).
    //
    // Checked HERE, after the team is resolved, because the requirement is a
    // property of the squad rather than of the cell — a blank gender is
    // perfectly fine in the eleven mixed squads and is only a problem in the
    // seven single-gender ones.
    //
    // ⚠️ And it is checked in the IMPORTER, not only in the forms, because
    // this is the path that creates players in bulk. A rule enforced on the
    // one-at-a-time form and skipped on the 200-row paste is a rule that
    // applies to almost no rows in practice.
    //
    // As everywhere else: only ABSENCE is an error. A row saying "male" in a
    // girls' squad imports, because a contradiction is a real arrangement to
    // be looked at rather than a parse failure. (Under content classification
    // "no gender cell" and "blank gender cell" are the same thing: gender is
    // null exactly when no cell read as one.)
    if (team && gender === null && squadRequiresGender(team.name)) {
      errors.push(`${team.name} is single-gender, so gender is required`)
    }

    rows.push({
      lineNo,
      full_name: fullName,
      position,
      gender,
      team_id: team?.id ?? null,
      teamName: team?.name ?? teamCellText,
      errors,
      ok: errors.length === 0,
      existing: false,
    })
  })

  // Already on the roster: checked before the within-paste duplicate pass so
  // that a re-pasted sheet reads "35 ready · 3 already there", not as 3
  // duplicates of lines that are not in the paste at all.
  rows.forEach((row) => {
    if (!row.ok) return
    if (existingKeys.has(`${nameKey(row.full_name)}::${row.team_id}`)) {
      row.existing = true
      row.ok = false
    }
  })

  // Duplicate detection runs across the whole paste, after per-row parsing,
  // because it is the only check that needs to see every row. Same name in
  // the same squad twice is almost always a paste that was run twice.
  const seen = new Map()
  rows.forEach((row) => {
    if (!row.ok) return
    const key = `${nameKey(row.full_name)}::${row.team_id}`
    if (seen.has(key)) {
      row.errors.push(`Duplicate of line ${seen.get(key)}`)
      row.ok = false
    } else {
      seen.set(key, row.lineNo)
    }
  })

  return {
    rows,
    delimiter,
    headerSkipped,
    validCount: rows.filter((r) => r.ok).length,
    // Skipped rows are neither: they are fine, and already done.
    invalidCount: rows.filter((r) => !r.ok && !r.existing).length,
    skippedCount: rows.filter((r) => r.existing).length,
  }
}

/**
 * The subset of a parsed result that is safe to insert, shaped for the
 * players table. Deliberately omits jersey_num: the club does not use squad
 * numbers (src/lib/playerFormat.js) and src/data/players.js never writes it.
 */
export function toInsertRows(parsed, { clubId }) {
  return parsed.rows
    .filter((row) => row.ok)
    .map((row) => ({
      club_id: clubId,
      team_id: row.team_id,
      full_name: row.full_name,
      position: row.position,
      // null when the column was blank or absent, which the CHECK constraint
      // allows. Never '' — players_gender_check refuses the empty string, and
      // a whole 300-row insert is one statement, so a single '' would abort
      // the entire import (see insertPlayers in src/data/players.js).
      gender: row.gender ?? null,
    }))
}
