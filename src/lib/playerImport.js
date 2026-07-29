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
  'name', 'full name', 'fullname', 'player', 'player name',
  'position', 'pos',
  'team', 'age group', 'agegroup', 'squad', 'group',
])

function looksLikeHeader(cells) {
  const filled = cells.filter((c) => c !== '')
  if (filled.length === 0) return false
  return filled.every((c) => HEADER_WORDS.has(c.toLowerCase()))
}

/**
 * Parses pasted roster text into rows ready for preview.
 *
 * @param {string} text        raw clipboard content
 * @param {object} options
 * @param {Array}  options.teams      [{ id, name }] the user may see
 * @param {Function} [options.canEditTeam]  (teamId) => boolean; rows for teams
 *   the user cannot write are marked invalid so the preview can say why,
 *   rather than letting the insert fail opaquely.
 *
 * @returns {{rows: Array, delimiter: string, headerSkipped: boolean,
 *           validCount: number, invalidCount: number}}
 *   Each row: { lineNo, full_name, position, team_id, teamName, errors[], ok }
 *   `lineNo` is 1-based against the ORIGINAL paste including blanks and the
 *   header, so an error message can point the user at the line they can see.
 */
export function parsePlayerPaste(text, { teams = [], canEditTeam } = {}) {
  const normalised = normaliseText(text)
  const delimiter = detectDelimiter(normalised)

  // Case-insensitive team lookup. Built from the caller's team list, so it is
  // already scoped to what the user may see — an unknown name here means
  // "not a squad you have", which is exactly the message we want to show.
  const teamsByName = new Map(
    teams.map((t) => [String(t.name ?? '').trim().toLowerCase(), t]),
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

    const [nameCell = '', positionCell = '', teamCell = ''] = cells
    const errors = []

    const fullName = nameCell.trim()
    if (fullName === '') errors.push('Name is required')
    else if (fullName.length > 120) errors.push('Name is too long')

    // Position is optional — the roster renders "Position not set" — but a
    // value that is present and unrecognised is a mistake worth surfacing,
    // not something to silently discard.
    let position = null
    if (positionCell.trim() !== '') {
      position = canonicalPosition(positionCell)
      if (position === null) errors.push(`"${positionCell.trim()}" is not a position`)
    }

    // Team is required: players.team_id is NOT NULL.
    let team = null
    if (teamCell.trim() === '') {
      errors.push('Age group is required')
    } else {
      team = teamsByName.get(teamCell.trim().toLowerCase()) ?? null
      if (!team) errors.push(`"${teamCell.trim()}" is not one of your age groups`)
      else if (typeof canEditTeam === 'function' && !canEditTeam(team.id)) {
        errors.push(`You can't add players to ${team.name}`)
      }
    }

    rows.push({
      lineNo,
      full_name: fullName,
      position,
      team_id: team?.id ?? null,
      teamName: team?.name ?? teamCell.trim(),
      errors,
      ok: errors.length === 0,
    })
  })

  // Duplicate detection runs across the whole paste, after per-row parsing,
  // because it is the only check that needs to see every row. Same name in
  // the same squad twice is almost always a paste that was run twice.
  const seen = new Map()
  rows.forEach((row) => {
    if (!row.ok) return
    const key = `${row.full_name.toLowerCase()}::${row.team_id}`
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
    invalidCount: rows.filter((r) => !r.ok).length,
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
    }))
}
