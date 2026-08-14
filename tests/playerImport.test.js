// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import { parsePlayerPaste, toInsertRows } from '../src/lib/playerImport.js'
import { canonicalPosition, POSITIONS } from '../src/lib/positions.js'

// Unit tests for the roster bulk-import parser (desktop-spec.md §5.1).
// Pure string in, structured rows out — no React, no network, no mocks.
//
// The premise these tests defend: malformed input is the NORMAL case for this
// box, because the input is a paste out of Excel. If the parser only handled
// clean input the feature would be useless, so most of what follows is about
// mess — headers, blanks, smart quotes, non-breaking spaces, quoted commas.

const TEAMS = [
  { id: 'team-u10', name: 'U10' },
  { id: 'team-u12', name: 'U12' },
  { id: 'team-1xv', name: 'Senior Men 1st XV' },
]

const parse = (text, opts = {}) => parsePlayerPaste(text, { teams: TEAMS, ...opts })

describe('positions enum', () => {
  it('matches the form choices case-insensitively and returns canonical casing', () => {
    expect(canonicalPosition('flanker')).toBe('Flanker')
    expect(canonicalPosition('  FLY-HALF ')).toBe('Fly-half')
    expect(canonicalPosition('number 8')).toBe('Number 8')
  })

  it('rejects anything not on the list rather than guessing', () => {
    expect(canonicalPosition('Winger')).toBeNull()
    expect(canonicalPosition('')).toBeNull()
    expect(canonicalPosition(null)).toBeNull()
  })

  it('offers exactly the 11 positions the design system defines', () => {
    expect(POSITIONS).toHaveLength(11)
  })
})

describe('parsePlayerPaste — shape tolerance', () => {
  it('parses a clean tab-separated paste', () => {
    const r = parse('Tom Fletcher\tFlanker\tU10\nAmy Rose\tWing\tU12')
    expect(r.delimiter).toBe('\t')
    expect(r.validCount).toBe(2)
    expect(r.rows[0]).toMatchObject({ full_name: 'Tom Fletcher', position: 'Flanker', team_id: 'team-u10' })
  })

  it('parses comma-separated when there is no tab anywhere', () => {
    const r = parse('Tom Fletcher, Flanker, U10')
    expect(r.delimiter).toBe(',')
    expect(r.rows[0].ok).toBe(true)
  })

  it('prefers tab over comma so a name containing a comma survives', () => {
    const r = parse('Smith, Jr\tProp\tU10')
    expect(r.rows[0].full_name).toBe('Smith, Jr')
    expect(r.rows[0].ok).toBe(true)
  })

  it('honours double quotes around a field containing the delimiter', () => {
    const r = parse('"Smith, Jr",Prop,U10')
    expect(r.rows[0].full_name).toBe('Smith, Jr')
  })

  it('treats a doubled quote inside a quoted field as one literal quote', () => {
    const r = parse('"The ""Bus"" Jones",Prop,U10')
    expect(r.rows[0].full_name).toBe('The "Bus" Jones')
  })

  it('skips a header row instead of importing a player called Name', () => {
    const r = parse('Name\tPosition\tTeam\nTom Fletcher\tFlanker\tU10')
    expect(r.headerSkipped).toBe(true)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].full_name).toBe('Tom Fletcher')
  })

  it('does not mistake a real player for a header', () => {
    const r = parse('Tom Fletcher\tFlanker\tU10')
    expect(r.headerSkipped).toBe(false)
    expect(r.rows).toHaveLength(1)
  })

  it('drops blank and whitespace-only lines without reporting them as errors', () => {
    const r = parse('Tom Fletcher\tFlanker\tU10\n\n   \n\nAmy Rose\tWing\tU12\n')
    expect(r.rows).toHaveLength(2)
    expect(r.invalidCount).toBe(0)
  })

  it('normalises smart quotes so an autocorrected surname still matches', () => {
    const r = parse('O’Sullivan\tProp\tU10')
    expect(r.rows[0].full_name).toBe("O'Sullivan")
  })

  it('normalises non-breaking spaces so a pasted team name still resolves', () => {
    const r = parse('Tom Fletcher\tProp\tU10 ')
    expect(r.rows[0].team_id).toBe('team-u10')
    expect(r.rows[0].ok).toBe(true)
  })

  it('handles CRLF line endings from Windows Excel', () => {
    const r = parse('Tom Fletcher\tProp\tU10\r\nAmy Rose\tWing\tU12')
    expect(r.rows).toHaveLength(2)
  })
})

describe('parsePlayerPaste — validation', () => {
  it('requires a name', () => {
    const r = parse('\tProp\tU10')
    expect(r.rows[0].ok).toBe(false)
    expect(r.rows[0].errors).toContain('Name is required')
  })

  it('requires an age group, because players.team_id is NOT NULL', () => {
    const r = parse('Tom Fletcher\tProp\t')
    expect(r.rows[0].errors).toContain('Age group is required')
  })

  it('allows an empty position, which the roster renders as "Position not set"', () => {
    const r = parse('Tom Fletcher\t\tU10')
    expect(r.rows[0].ok).toBe(true)
    expect(r.rows[0].position).toBeNull()
  })

  it('rejects a present-but-unrecognised position rather than discarding it silently', () => {
    const r = parse('Tom Fletcher\tWinger\tU10')
    expect(r.rows[0].ok).toBe(false)
    expect(r.rows[0].errors[0]).toContain('is not a position')
  })

  it('rejects a team the user does not have, naming it', () => {
    const r = parse('Tom Fletcher\tProp\tU14')
    expect(r.rows[0].ok).toBe(false)
    expect(r.rows[0].errors[0]).toContain('U14')
  })

  it('matches team names case-insensitively', () => {
    const r = parse('Tom Fletcher\tProp\tsenior men 1st xv')
    expect(r.rows[0].team_id).toBe('team-1xv')
  })

  it('marks rows for teams the user cannot write to, without hiding them', () => {
    const r = parse('Tom Fletcher\tProp\tU12', { canEditTeam: (id) => id !== 'team-u12' })
    expect(r.rows[0].ok).toBe(false)
    expect(r.rows[0].errors[0]).toContain("can't add players to U12")
  })

  it('reports the original line number so the user can find the bad row', () => {
    const r = parse('Name\tPosition\tTeam\n\nTom Fletcher\tProp\tU10\nBad\tWinger\tU10')
    expect(r.rows[1].lineNo).toBe(4)
  })

  it('flags a duplicate name in the same squad, pointing at the first occurrence', () => {
    const r = parse('Tom Fletcher\tProp\tU10\nTom Fletcher\tLock\tU10')
    expect(r.rows[0].ok).toBe(true)
    expect(r.rows[1].ok).toBe(false)
    expect(r.rows[1].errors[0]).toContain('Duplicate of line 1')
  })

  it('allows the same name in two different squads — siblings and namesakes exist', () => {
    const r = parse('Tom Fletcher\tProp\tU10\nTom Fletcher\tProp\tU12')
    expect(r.validCount).toBe(2)
  })

  it('counts valid and invalid rows separately for the preview summary', () => {
    const r = parse('Tom Fletcher\tProp\tU10\nBad Row\tWinger\tU10\n\nAmy Rose\tWing\tU12')
    expect(r.validCount).toBe(2)
    expect(r.invalidCount).toBe(1)
  })
})

describe('toInsertRows', () => {
  it('emits only valid rows, shaped for the players table', () => {
    const r = parse('Tom Fletcher\tProp\tU10\nBad\tWinger\tU10')
    expect(toInsertRows(r, { clubId: 'club-1' })).toEqual([
      { club_id: 'club-1', gender: null, team_id: 'team-u10', full_name: 'Tom Fletcher', position: 'Prop' },
    ])
  })

  it('never emits jersey_num — the club does not use squad numbers', () => {
    const r = parse('Tom Fletcher\tProp\tU10')
    expect(toInsertRows(r, { clubId: 'club-1' })[0]).not.toHaveProperty('jersey_num')
  })

  it('returns an empty array when nothing is valid, rather than throwing', () => {
    const r = parse('Bad\tWinger\tU99')
    expect(toInsertRows(r, { clubId: 'club-1' })).toEqual([])
  })
})

// ── Gender required on a single-gender squad (Jay, 9 Aug 2026) ──────────
//
// ⚠️ WHY THE IMPORTER AND NOT JUST THE FORMS. This is the path that creates
// players in bulk. A rule enforced on the one-at-a-time form and skipped on
// the 200-row paste is a rule that applies to almost no rows in practice.
describe('gender required on a single-gender squad', () => {
  const SQUADS = [
    { id: 'team-u6', name: 'U6 Tag' },            // mixed — and ends in a G
    { id: 'team-u13', name: 'U13 Mixed Contact' },// mixed
    { id: 'team-u16g', name: 'U16G Contact' },    // girls
    { id: 'team-1xv', name: 'Senior Men 1st XV' },// men
  ]
  const p = (text) => parsePlayerPaste(text, { teams: SQUADS })

  it('rejects a blank gender on a single-gender squad, naming the squad', () => {
    const r = p('Amara Bello\tProp\tU16G Contact')
    expect(r.rows[0].ok).toBe(false)
    expect(r.rows[0].errors.join(' ')).toMatch(/U16G Contact is single-gender/)
  })

  it('accepts the same row once the gender column is filled in', () => {
    const r = p('Amara Bello\tProp\tU16G Contact\tF')
    expect(r.rows[0].errors).toEqual([])
    expect(r.rows[0].gender).toBe('female')
  })

  // ⚠️ THE HALF THAT LOOKS LIKE A BUG AND IS NOT. Only ABSENCE is refused. A
  // contradiction is a real squad arrangement to be looked at, not a parse
  // failure — and an importer that rejected it would make such a player
  // impossible to load at all.
  it('imports a CONTRADICTORY gender rather than rejecting the row', () => {
    const r = p('Sam Reid\tProp\tU16G Contact\tM')
    expect(r.rows[0].ok).toBe(true)
    expect(r.rows[0].gender).toBe('male')
  })

  it('leaves the mixed squads alone, including the ones whose names end in G', () => {
    const r = p('Tom Fletcher\tProp\tU6 Tag\nChidi Okafor\tHooker\tU13 Mixed Contact')
    expect(r.rows.map((row) => row.errors)).toEqual([[], []])
    expect(r.rows.map((row) => row.gender)).toEqual([null, null])
  })

  it('applies to the senior sides too, which are also single-gender', () => {
    expect(p('Joe Bloggs\tProp\tSenior Men 1st XV').rows[0].ok).toBe(false)
    expect(p('Joe Bloggs\tProp\tSenior Men 1st XV\tM').rows[0].ok).toBe(true)
  })

  // An unknown squad already fails on its own error. Adding a second,
  // confusing "gender is required" on top of "that isn't one of your age
  // groups" would send someone hunting for the wrong problem.
  it('says nothing about gender when the squad itself is unknown', () => {
    const r = p('Joe Bloggs\tProp\tU99 Nonsense')
    expect(r.rows[0].errors.join(' ')).not.toMatch(/gender/i)
  })
})
