// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  clubJuniorsHomeRows,
  clubSeniorsHomeRows,
  competitionBucket,
  formatWdl,
  isTournamentContainer,
  scoringSquadRecords,
  seasonWindowFor,
  squadMatchRecord,
  sumMatchRecords,
  windowCoveringSeason,
} from '../src/lib/matchRecord.js'

// Invented fixtures — this repo is public. Shape matches events rows.

const SEASON_NOW = new Date('2026-10-15T08:00:00Z') // 2026-27 in Dubai

function match(overrides) {
  return {
    id: 'e',
    type: 'match',
    team_id: 't-u16b',
    starts_at: '2026-10-10T13:00:00Z',
    opponent: 'Exiles',
    competition_type: 'league',
    tournament_id: null,
    result_us: 24,
    result_them: 12,
    ...overrides,
  }
}

describe('isTournamentContainer', () => {
  it('is the named tournament event with no parent game id', () => {
    expect(
      isTournamentContainer({
        type: 'match',
        competition_type: 'tournament',
        competition: 'Al Ain Sevens',
        tournament_id: null,
        opponent: null,
      }),
    ).toBe(true)
  })

  it('is false for a game under a tournament', () => {
    expect(
      isTournamentContainer({
        type: 'match',
        competition_type: 'tournament',
        competition: 'Al Ain Sevens',
        tournament_id: 'trn-1',
        opponent: 'Exiles',
      }),
    ).toBe(false)
  })

  it('is false for a league match', () => {
    expect(isTournamentContainer(match())).toBe(false)
  })
})

describe('competitionBucket', () => {
  it('maps league, tournament games, and null/tbd to the three pills', () => {
    expect(competitionBucket(match({ competition_type: 'league' }))).toBe('league')
    expect(competitionBucket(match({ competition_type: 'tournament' }))).toBe('tournaments')
    expect(competitionBucket(match({ competition_type: null }))).toBe('friendlies')
    expect(competitionBucket(match({ competition_type: 'tbd' }))).toBe('friendlies')
    expect(competitionBucket(match({ competition_type: 'friendly' }))).toBe('friendlies')
  })
})

describe('formatWdl', () => {
  it('uses an en dash, matching scores on Hub', () => {
    expect(formatWdl({ wins: 6, draws: 2, losses: 3 })).toBe('6–2–3')
  })
})

describe('squadMatchRecord', () => {
  it('counts every scored match in the club season window as W–D–L', () => {
    const events = [
      match({ id: 'w', result_us: 20, result_them: 10, competition_type: 'league' }),
      match({ id: 'd', result_us: 14, result_them: 14, competition_type: 'league' }),
      match({ id: 'l', result_us: 7, result_them: 21, competition_type: 'league' }),
    ]
    const rec = squadMatchRecord(events, { teamId: 't-u16b', at: SEASON_NOW })
    expect(formatWdl(rec)).toBe('1–1–1')
    expect(rec.played).toBe(3)
    expect(rec.season).toBe('2026-27')
  })

  it('includes tournament GAMES and friendlies in the headline, split on the pills', () => {
    const events = [
      match({ id: 'lg-w', result_us: 21, result_them: 7, competition_type: 'league' }),
      match({ id: 'lg-d', result_us: 10, result_them: 10, competition_type: 'league' }),
      match({
        id: 'tg-w',
        result_us: 14,
        result_them: 5,
        competition_type: 'tournament',
        tournament_id: 'trn-1',
        opponent: 'Wanderers',
      }),
      match({
        id: 'tg-l',
        result_us: 0,
        result_them: 12,
        competition_type: 'tournament',
        tournament_id: 'trn-1',
        opponent: 'Dragons',
      }),
      match({ id: 'fr-w', result_us: 28, result_them: 0, competition_type: null }),
    ]
    const rec = squadMatchRecord(events, { teamId: 't-u16b', at: SEASON_NOW })
    expect(formatWdl(rec)).toBe('3–1–1')
    expect(formatWdl(rec.league)).toBe('1–1–0')
    expect(formatWdl(rec.tournaments)).toBe('1–0–1')
    expect(formatWdl(rec.friendlies)).toBe('1–0–0')
  })

  it('excludes the tournament CONTAINER even if someone parked a score on it', () => {
    const events = [
      match({
        id: 'container',
        competition_type: 'tournament',
        competition: 'Al Ain Sevens',
        tournament_id: null,
        opponent: null,
        result_us: 99,
        result_them: 0,
      }),
      match({
        id: 'game',
        competition_type: 'tournament',
        tournament_id: 'container',
        opponent: 'Exiles',
        result_us: 12,
        result_them: 7,
      }),
    ]
    const rec = squadMatchRecord(events, { teamId: 't-u16b', at: SEASON_NOW })
    expect(formatWdl(rec)).toBe('1–0–0')
    expect(rec.played).toBe(1)
  })

  it('ignores training, unscored matches, other squads, and the previous season', () => {
    const events = [
      match({ id: 'ok', result_us: 10, result_them: 5 }),
      { id: 'train', type: 'training', team_id: 't-u16b', starts_at: '2026-10-11T13:00:00Z', result_us: 40, result_them: 0 },
      match({ id: 'blank', result_us: null, result_them: null }),
      match({ id: 'half', result_us: 10, result_them: null }),
      match({ id: 'other', team_id: 't-u14', result_us: 50, result_them: 0 }),
      match({ id: 'old', starts_at: '2026-05-01T13:00:00Z', result_us: 30, result_them: 0 }),
    ]
    const rec = squadMatchRecord(events, { teamId: 't-u16b', at: SEASON_NOW })
    expect(formatWdl(rec)).toBe('1–0–0')
    expect(rec.played).toBe(1)
  })

  it('keeps a 0–0 draw — zero is a real score', () => {
    const rec = squadMatchRecord(
      [match({ result_us: 0, result_them: 0, competition_type: null })],
      { teamId: 't-u16b', at: SEASON_NOW },
    )
    expect(formatWdl(rec)).toBe('0–1–0')
    expect(formatWdl(rec.friendlies)).toBe('0–1–0')
  })
})

describe('seasonWindowFor', () => {
  it('is 1 Sep 00:00 to 31 Aug 23:59 in Asia/Dubai', () => {
    const { from, to, label } = seasonWindowFor(SEASON_NOW)
    expect(label).toBe('2026-27')
    // 1 Sep 2026 00:00 Dubai = 31 Aug 2026 20:00Z
    expect(from).toBe('2026-08-31T20:00:00.000Z')
    // 31 Aug 2027 23:59 Dubai = 31 Aug 2027 19:59Z
    expect(to).toBe('2027-08-31T19:59:00.000Z')
  })
})

describe('windowCoveringSeason', () => {
  it('widens a short lookback so Home cannot silently under-count', () => {
    const short = {
      from: new Date('2026-10-01T00:00:00Z').toISOString(),
      to: new Date('2027-01-01T00:00:00Z').toISOString(),
    }
    const covered = windowCoveringSeason(short, SEASON_NOW)
    expect(Date.parse(covered.from)).toBeLessThanOrEqual(Date.parse('2026-08-31T20:00:00.000Z'))
    expect(Date.parse(covered.to)).toBeGreaterThanOrEqual(Date.parse('2027-01-01T00:00:00Z'))
  })
})

describe('scoringSquadRecords', () => {
  it('skips U6 and U7, which do not record scores', () => {
    const teams = [
      { id: 't-u6', name: 'U6 Tag' },
      { id: 't-u7', name: 'U7 Tag' },
      { id: 't-u16b', name: 'U16B Contact' },
    ]
    const events = [
      match({ team_id: 't-u6', result_us: 5, result_them: 0 }),
      match({ team_id: 't-u16b', result_us: 20, result_them: 10 }),
    ]
    const rows = scoringSquadRecords(events, teams, { at: SEASON_NOW })
    expect(rows.map((r) => r.team.id)).toEqual(['t-u16b'])
    expect(formatWdl(rows[0].record)).toBe('1–0–0')
  })

  it('does not roll every age into one club total', () => {
    const teams = [
      { id: 't-u16b', name: 'U16B Contact' },
      { id: 't-u14', name: 'U14B Contact' },
    ]
    const events = [
      match({ team_id: 't-u16b', result_us: 20, result_them: 0 }),
      match({ team_id: 't-u14', result_us: 12, result_them: 14, id: 'e2' }),
    ]
    const rows = scoringSquadRecords(events, teams, { at: SEASON_NOW })
    expect(rows).toHaveLength(2)
    expect(formatWdl(rows[0].record)).toBe('1–0–0')
    expect(formatWdl(rows[1].record)).toBe('0–0–1')
  })
})

describe('sumMatchRecords', () => {
  it('adds wins, draws and losses across squad records', () => {
    const a = squadMatchRecord(
      [match({ team_id: 't-u16b', result_us: 20, result_them: 0 })],
      { teamId: 't-u16b', at: SEASON_NOW },
    )
    const b = squadMatchRecord(
      [
        match({ id: 'e2', team_id: 't-u14', result_us: 12, result_them: 14 }),
        match({
          id: 'e3',
          team_id: 't-u14',
          result_us: 10,
          result_them: 10,
          competition_type: 'tournament',
          tournament_id: 'trn',
        }),
      ],
      { teamId: 't-u14', at: SEASON_NOW },
    )
    expect(formatWdl(sumMatchRecords([a, b]))).toBe('1–1–1')
  })
})

describe('clubJuniorsHomeRows', () => {
  it('rolls more than one junior scoring squad into one Club juniors row', () => {
    const teams = [
      { id: 't-u8', name: 'U8 Tag' },
      { id: 't-u9', name: 'U9 Mixed' },
      { id: 't-u6', name: 'U6 Tag' },
      { id: 't-1xv', name: 'Senior Men 1st XV', is_senior: true, section: 'senior_men' },
    ]
    const events = [
      match({ id: 'e-u8', team_id: 't-u8', result_us: 20, result_them: 0 }),
      match({ id: 'e-u9', team_id: 't-u9', result_us: 8, result_them: 12 }),
      match({ id: 'e-u6', team_id: 't-u6', result_us: 5, result_them: 0 }),
      match({ id: 'e-xv', team_id: 't-1xv', result_us: 31, result_them: 19 }),
    ]
    const rows = clubJuniorsHomeRows(scoringSquadRecords(events, teams, { at: SEASON_NOW }))
    expect(rows).toHaveLength(2)
    expect(rows[0].team.name).toBe('Club juniors')
    expect(formatWdl(rows[0].record)).toBe('1–0–1')
    expect(rows[1].team.name).toBe('Senior Men 1st XV')
    expect(formatWdl(rows[1].record)).toBe('1–0–0')
    expect(rows.map((r) => r.team.name)).not.toContain('U8 Tag')
    expect(rows.map((r) => r.team.name)).not.toContain('U9 Mixed')
    expect(rows.map((r) => r.team.name)).not.toContain('U6 Tag')
  })

  it('leaves a single junior scoring squad labelled as that squad', () => {
    const teams = [
      { id: 't-u10', name: 'U10 Mixed' },
      { id: 't-1xv', name: 'Senior Men 1st XV' },
    ]
    const events = [
      match({ id: 'e-u10', team_id: 't-u10', result_us: 10, result_them: 20 }),
      match({ id: 'e-xv', team_id: 't-1xv', result_us: 31, result_them: 19 }),
    ]
    const rows = clubJuniorsHomeRows(scoringSquadRecords(events, teams, { at: SEASON_NOW }))
    expect(rows.map((r) => r.team.name)).toEqual(['U10 Mixed', 'Senior Men 1st XV'])
    expect(rows.map((r) => r.team.name)).not.toContain('Club juniors')
    expect(formatWdl(rows[0].record)).toBe('0–0–1')
    expect(formatWdl(rows[1].record)).toBe('1–0–0')
  })
})

describe('clubSeniorsHomeRows', () => {
  it('rolls more than one senior scoring squad into one Club seniors row', () => {
    const teams = [
      { id: 't-u10', name: 'U10 Mixed' },
      { id: 't-1xv', name: 'Senior Men 1st XV', is_senior: true, section: 'senior_men' },
      { id: 't-wxv', name: "Women's XV", is_senior: true, section: 'senior_women' },
      { id: 't-vets', name: 'Vets XV', is_senior: true },
    ]
    const events = [
      match({ id: 'e-u10', team_id: 't-u10', result_us: 10, result_them: 20 }),
      match({ id: 'e-xv', team_id: 't-1xv', result_us: 31, result_them: 19 }),
      match({ id: 'e-w', team_id: 't-wxv', result_us: 12, result_them: 12 }),
      match({ id: 'e-v', team_id: 't-vets', result_us: 5, result_them: 17 }),
    ]
    const rows = clubSeniorsHomeRows(scoringSquadRecords(events, teams, { at: SEASON_NOW }))
    expect(rows).toHaveLength(2)
    expect(rows[0].team.name).toBe('U10 Mixed')
    expect(formatWdl(rows[0].record)).toBe('0–0–1')
    expect(rows[1].team.name).toBe('Club seniors')
    expect(formatWdl(rows[1].record)).toBe('1–1–1')
    expect(rows.map((r) => r.team.name)).not.toContain('Senior Men 1st XV')
    expect(rows.map((r) => r.team.name)).not.toContain("Women's XV")
    expect(rows.map((r) => r.team.name)).not.toContain('Vets XV')
  })

  it('leaves a single senior scoring squad labelled as that squad', () => {
    const teams = [
      { id: 't-u10', name: 'U10 Mixed' },
      { id: 't-1xv', name: 'Senior Men 1st XV' },
    ]
    const events = [
      match({ id: 'e-u10', team_id: 't-u10', result_us: 10, result_them: 20 }),
      match({ id: 'e-xv', team_id: 't-1xv', result_us: 31, result_them: 19 }),
    ]
    const rows = clubSeniorsHomeRows(scoringSquadRecords(events, teams, { at: SEASON_NOW }))
    expect(rows.map((r) => r.team.name)).toEqual(['U10 Mixed', 'Senior Men 1st XV'])
    expect(rows.map((r) => r.team.name)).not.toContain('Club seniors')
    expect(formatWdl(rows[0].record)).toBe('0–0–1')
    expect(formatWdl(rows[1].record)).toBe('1–0–0')
  })

  it('does not fold juniors into Club seniors, and Club juniors still rolls', () => {
    const teams = [
      { id: 't-u8', name: 'U8 Tag' },
      { id: 't-u9', name: 'U9 Mixed' },
      { id: 't-1xv', name: 'Senior Men 1st XV' },
      { id: 't-wxv', name: "Women's XV" },
    ]
    const events = [
      match({ id: 'e-u8', team_id: 't-u8', result_us: 20, result_them: 0 }),
      match({ id: 'e-u9', team_id: 't-u9', result_us: 8, result_them: 12 }),
      match({ id: 'e-xv', team_id: 't-1xv', result_us: 31, result_them: 19 }),
      match({ id: 'e-w', team_id: 't-wxv', result_us: 14, result_them: 21 }),
    ]
    const rows = clubJuniorsHomeRows(
      clubSeniorsHomeRows(scoringSquadRecords(events, teams, { at: SEASON_NOW })),
    )
    expect(rows.map((r) => r.team.name)).toEqual(['Club juniors', 'Club seniors'])
    expect(formatWdl(rows[0].record)).toBe('1–0–1')
    expect(formatWdl(rows[1].record)).toBe('1–0–1')
  })
})
