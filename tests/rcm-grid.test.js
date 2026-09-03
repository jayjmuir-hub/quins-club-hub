// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ownFixtures, parseRcmGrid, weekendDate } from '../src/lib/rcmGrid.js'

// The real 2026–27 Senior Men's grid, as text extracted from the RCM PDF.
// ⚠️ THE EXPECTED VALUES BELOW ARE THE ONES LOADED BY HAND ON 3 Sep 2026
// (db/seeds/2026-09-03-senior-fixtures-2026-27.sql), read off the PDF column
// by column and checked against it. The two rulings Jay gave that day (JA
// away on the Friday, the Doha pair reversed) are NOT in the grid and must
// not appear here — this tests the reader, not the club's amendments.
const here = path.dirname(fileURLToPath(import.meta.url))
const GRID = readFileSync(path.join(here, 'fixtures', 'rcm-2026-27-senior-men.txt'), 'utf8')

const WAP = [
  [2, '2026-10-10', 'TUS', true], [3, '2026-10-17', 'SHA', true], [4, '2026-10-24', 'JAD', false],
  [5, '2026-10-31', 'DSH', false], [6, '2026-11-14', 'DOH', true], [7, '2027-01-16', 'DH', false],
  [8, '2027-01-23', 'DEX', true], [9, '2027-01-30', 'BAH', true], [11, '2027-02-13', 'TUS', false],
  [12, '2027-02-20', 'SHA', false], [13, '2027-02-27', 'JAD', true], [14, '2027-03-06', 'DSH', true],
  [15, '2027-03-20', 'DOH', false], [16, '2027-03-27', 'DH', true], [17, '2027-04-03', 'DEX', false],
  [18, '2027-04-17', 'BAH', false],
]
const DIV1 = [
  [2, '2026-10-10', 'TUS', true], [3, '2026-10-17', 'SHA', true], [4, '2026-11-07', 'JAD', false],
  [5, '2027-01-16', 'DH', false], [6, '2027-01-23', 'DT', true], [7, '2027-02-06', 'AAA', false],
  [8, '2027-02-20', 'DSH', false], [9, '2027-03-06', 'DEX', true], [10, '2027-03-20', 'BHR', true],
  [11, '2027-04-03', 'BAH', false],
]
const DIV2 = [
  [2, '2026-10-10', 'DT', true], [3, '2026-10-31', 'JAD', false], [4, '2026-11-14', 'DSH', false],
  [5, '2027-01-16', 'DTU', false], [6, '2027-01-30', 'DKI', true], [7, '2027-02-13', 'DH', false],
  [8, '2027-02-27', 'BHR', true], [9, '2027-03-27', 'AAA', true],
]
const shape = (rows) => rows.map(([round, date, opponent, home]) => ({ round, date, opponent, home }))

describe('parseRcmGrid — the 2026–27 senior men’s grid', () => {
  const parsed = parseRcmGrid(GRID, { seasonStartYear: 2026 })
  const byCode = Object.fromEntries(parsed.divisions.map((d) => [d.code, d]))

  it('finds the three divisions in column order, and places every row', () => {
    expect(parsed.divisions.map((d) => d.code)).toEqual(['WAP', 'DIV1', 'DIV2'])
    expect(parsed.warnings).toEqual([])
  })

  it('reads the legend that rides on the fixture lines', () => {
    expect(parsed.legend.ADH).toBe('Abu Dhabi Harlequins')
    expect(parsed.legend.DH).toBe('Dubai Hurricanes')
    expect(parsed.legend.AAA).toBe('Al Ain Amblers')
    // Fourteen clubs in the legend, one of them (DKI) printed on a weekend
    // header line rather than a fixture line.
    expect(Object.keys(parsed.legend).sort()).toEqual([
      'AAA', 'ADH', 'BAH', 'BHR', 'DEX', 'DH', 'DKI', 'DOH', 'DSH', 'DT', 'DTU', 'JAD', 'SHA', 'TUS',
    ])
  })

  it('⚠️ reproduces every one of our Premiership fixtures as loaded on 3 Sep', () => {
    expect(ownFixtures(byCode.WAP, 'ADH')).toEqual(shape(WAP))
    expect(byCode.WAP.rounds.map((r) => r.round)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  it('⚠️ reproduces the Division 1 fixtures, placed by continuity on the two-division weekends', () => {
    expect(ownFixtures(byCode.DIV1, 'ADH')).toEqual(shape(DIV1))
    expect(byCode.DIV1.rounds.map((r) => r.round)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1))
  })

  it('⚠️ reproduces the Division 2 fixtures, placed by the sides that only play there', () => {
    expect(ownFixtures(byCode.DIV2, 'ADH')).toEqual(shape(DIV2))
    expect(byCode.DIV2.rounds.map((r) => r.round)).toEqual(Array.from({ length: 9 }, (_, i) => i + 1))
  })

  it('never puts a side in two games of one round, and skips byes and the pre-season friendly', () => {
    for (const division of parsed.divisions) {
      for (const round of division.rounds) {
        const sides = round.fixtures.flatMap((f) => [f.home, f.away])
        expect(new Set(sides).size).toBe(sides.length)
        expect(sides).not.toContain('BYE')
        expect(round.fixtures.length).toBeLessThanOrEqual(Math.floor(division.sides.length / 2))
      }
    }
    // 25/26 Sept "TUS DEX" is a friendly and is not a round anywhere.
    expect(parsed.divisions.every((d) => d.rounds.every((r) => !r.weekend.startsWith('25-26')))).toBe(true)
  })

  it('knows the Premiership and Division 2 sides apart', () => {
    expect(byCode.WAP.sides).toContain('DOH')
    expect(byCode.WAP.sides).not.toContain('DKI')
    expect(byCode.DIV2.sides).toContain('DKI')
    expect(byCode.DIV2.sides).toContain('DTU')
    expect(byCode.DIV2.sides).not.toContain('SHA')
  })
})

describe('weekendDate', () => {
  it('picks the Saturday of the weekend, in the right half of the season', () => {
    expect(weekendDate(2, 3, 'Oct', 2026)).toBe('2026-10-03')
    expect(weekendDate(24, 25, 'Oct', 2026)).toBe('2026-10-24')
    expect(weekendDate(15, 16, 'Jan', 2026)).toBe('2027-01-16')
  })
  it('falls back to the later day when neither is a Saturday, and rejects a bad month', () => {
    expect(weekendDate(1, 2, 'Oct', 2026)).toBe('2026-10-02')
    expect(weekendDate(1, 2, 'Nope', 2026)).toBeNull()
  })
})

describe('parseRcmGrid — empty and malformed input', () => {
  it('reports a missing header rather than guessing', () => {
    const out = parseRcmGrid('2-3 Oct RD1 RD1\nADH BYE', { seasonStartYear: 2026 })
    expect(out.divisions).toEqual([])
    expect(out.warnings[0]).toMatch(/header/i)
  })
  it('flags a pair it cannot place instead of dropping it silently', () => {
    const text = ['WAP WAP DIV1 DIV1', '2-3 Oct RD1 RD1 RD1 RD1', 'AA BB CC DD', '9-10 Oct RD2 RD2 RD2 RD2', 'BB AA DD CC', 'XX YY'].join('\n')
    const out = parseRcmGrid(text, { seasonStartYear: 2026 })
    expect(out.warnings).toHaveLength(1)
    expect(out.warnings[0]).toMatch(/XX v YY/)
  })
})
