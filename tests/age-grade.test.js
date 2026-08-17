// @vitest-environment node
// Nothing here touches the DOM. The measurement and the rule are in vite.config.js.
import { describe, expect, it } from 'vitest'
import {
  MISMATCH,
  OK,
  PLAY_UP,
  ageAt,
  ageGradeCheck,
  cutoffAgesForTeam,
  cutoffFor,
} from '../src/lib/ageGrade.js'

// src/lib/ageGrade.js — UAERF age-grade eligibility, ported from the tournament
// site (…\GitHub\adhjrt) where the model has lived since July 2026.
//
// ══ THE ONE FACT EVERY CASE BELOW TURNS ON ═══════════════════════════════
// A player's age group is fixed by their age at midnight on 31 AUGUST — "Under
// X" means exactly X−1 on that date. So a U13 squad is mostly TWELVE-year-olds
// for most of the season, and "is this child 13 today?" is the wrong question
// every time.
//
// Every case passes `today` explicitly. Letting it default to the real clock
// would make these fail on somebody's birthday, and again every 31 August.

// Mid-season: the governing cut-off is 31 Aug 2026.
const IN_SEASON = new Date('2026-11-07T00:00:00Z')

describe('cutoffFor', () => {
  // ⚠️ THE SEASON TURNS OVER ON 31 AUGUST, so "this year's cut-off" is wrong for
  // eight months in twelve. In March the governing date is still LAST August.
  it('uses last August once the year has turned', () => {
    expect(cutoffFor(new Date('2027-03-01T00:00:00Z')).toISOString()).toContain('2026-08-31')
  })

  it('uses this August once the season has started', () => {
    expect(cutoffFor(new Date('2026-09-01T00:00:00Z')).toISOString()).toContain('2026-08-31')
  })

  // The boundary itself: 31 August IS the new season.
  it('turns over on the day, not the day after', () => {
    expect(cutoffFor(new Date('2026-08-31T00:00:00Z')).toISOString()).toContain('2026-08-31')
    expect(cutoffFor(new Date('2026-08-30T00:00:00Z')).toISOString()).toContain('2025-08-31')
  })
})

describe('cutoffAgesForTeam', () => {
  it('reads a single-age band off the squad name', () => {
    expect(cutoffAgesForTeam('U12 Mixed')).toEqual([11])
    expect(cutoffAgesForTeam('U6 Tag')).toEqual([5])
    expect(cutoffAgesForTeam('U14G QR')).toEqual([13])
  })

  // ⚠️ U16 AND U18 SPAN TWO AGES EACH — there is no U15 or U17 competition. A
  // model that assumed one age per band would flag two whole squads as
  // anomalies, every season.
  it('gives U16 and U18 two ages each', () => {
    expect(cutoffAgesForTeam('U16B')).toEqual([14, 15])
    expect(cutoffAgesForTeam('U18G')).toEqual([16, 17])
  })

  it('gives a senior side nothing to check against', () => {
    expect(cutoffAgesForTeam('Senior Men 1st XV')).toBeNull()
    expect(cutoffAgesForTeam('')).toBeNull()
  })
})

describe('ageAt', () => {
  it('counts whole years at the date given, not today', () => {
    // Born March 2014: 12 at the Aug 2026 cut-off.
    expect(ageAt('2014-03-04', new Date('2026-08-31T00:00:00Z'))).toBe(12)
  })

  // A birthday that has not happened yet on the cut-off date is the whole
  // mechanism — this is what makes a U13 squad twelve-year-olds.
  it('does not count a birthday falling after the cut-off', () => {
    expect(ageAt('2014-09-01', new Date('2026-08-31T00:00:00Z'))).toBe(11)
    expect(ageAt('2014-08-31', new Date('2026-08-31T00:00:00Z'))).toBe(12)
  })

  it('returns null rather than throwing on junk', () => {
    expect(ageAt('', IN_SEASON)).toBeNull()
    expect(ageAt(null, IN_SEASON)).toBeNull()
    expect(ageAt('not-a-date', IN_SEASON)).toBeNull()
  })
})

describe('the ordinary case', () => {
  // ⚠️ THE ONE A NAIVE "IS THIS CHILD 13 TODAY" CHECK GETS WRONG, AND IT IS THE
  // NORMAL STATE OF A U13 SQUAD rather than an edge case.
  it('is silent about a twelve-year-old in U13', () => {
    expect(ageGradeCheck('U13 Mixed', '2014-03-04', IN_SEASON).status).toBe(OK)
  })

  it('is silent about both ages of a double band', () => {
    expect(ageGradeCheck('U16B', '2012-03-04', IN_SEASON).status).toBe(OK) // 14
    expect(ageGradeCheck('U16B', '2011-03-04', IN_SEASON).status).toBe(OK) // 15
  })

  it('says nothing while either half is missing', () => {
    expect(ageGradeCheck('U13 Mixed', '', IN_SEASON).status).toBe(OK)
    expect(ageGradeCheck('', '2014-03-04', IN_SEASON).status).toBe(OK)
    expect(ageGradeCheck('Senior Men 1st XV', '2014-03-04', IN_SEASON).status).toBe(OK)
  })
})

describe('playing up', () => {
  it('allows one age group, and says so', () => {
    // 11 at the cut-off, registered for U13 (for 12s). U12 is one below.
    const check = ageGradeCheck('U13 Mixed', '2015-03-04', IN_SEASON)
    expect(check.status).toBe(PLAY_UP)
    expect(check.groupsYoung).toBe(1)
    expect(check.message).toMatch(/one age group/i)
    expect(check.message).toMatch(/coaches will be told/i)
  })

  // ⚠️ THE CASE ARITHMETIC GETS WRONG, AND MY FIRST VERSION OF THIS FILE DID.
  // A fourteen-year-old in U18B is ONE group below — U16B is for 14s and 15s —
  // but 16 minus 14 says two, which would refuse a play-up the club allows.
  // This is why the model walks a LADDER of groups rather than subtracting ages.
  it('counts hops down the ladder, not years of age', () => {
    const check = ageGradeCheck('U18B', '2012-03-04', IN_SEASON) // 14 at cut-off
    expect(check.status).toBe(PLAY_UP)
    expect(check.groupsYoung).toBe(1)
  })

  // ⚠️ TWO GROUPS FOR THE GIRLS' SQUADS — Jay's explicit instruction on the
  // tournament site, after a real U14G registration at age 12 was wrongly
  // refused. The girls' ladder has NO group at age 12, so one hop walks past a
  // legitimate player.
  it('allows two age groups for a girls’ squad', () => {
    const check = ageGradeCheck('U14G QR', '2015-03-04', IN_SEASON) // 11 at cut-off
    expect(check.status).toBe(PLAY_UP)
    expect(check.groupsYoung).toBe(2)
    expect(check.message).toMatch(/two age groups/i)
  })

  // …and the boys' equivalent stops at one, which is the whole point of the
  // distinction rather than an oversight.
  it('does NOT allow two age groups for a boys’ squad', () => {
    expect(ageGradeCheck('U14B', '2015-03-04', IN_SEASON).status).toBe(MISMATCH)
  })

  // ⚠️ THE CASE THE LADDER GETS WRONG, AND THE ONE THAT REFUSED A LIVE
  // REGISTRATION ON THE TOURNAMENT SITE IN JULY 2026. The girls' ladder has a
  // HOLE: U12G is for 11s and U14G is for 13s, so there is no group at 12 at
  // all, and one hop steps straight over a real twelve-year-old. That is why
  // the girls' branch subtracts years instead of walking rungs.
  it('does not step over a twelve-year-old in U14G, where no group exists at 12', () => {
    expect(ageGradeCheck('U14G QR', '2013-03-04', IN_SEASON).status).toBe(OK) // 13, normal
    const twelve = ageGradeCheck('U14G QR', '2014-03-04', IN_SEASON) // 12
    expect(twelve.status).toBe(PLAY_UP)
    expect(twelve.groupsYoung).toBe(1)
  })
})

describe('a real mismatch', () => {
  it('names the ages the squad is for, and the age the birthday gives', () => {
    const check = ageGradeCheck('U12 Mixed', '2010-03-04', IN_SEASON) // 16
    expect(check.status).toBe(MISMATCH)
    expect(check.message).toMatch(/aged 11/)
    expect(check.message).toMatch(/makes them 16/)
  })

  // ⚠️ OLDER IS NEVER A PLAY-UP. Playing DOWN an age group is a different
  // judgement entirely and this model does not make it.
  it('never treats an older player as playing up', () => {
    const check = ageGradeCheck('U12 Mixed', '2012-03-04', IN_SEASON) // 14
    expect(check.status).toBe(MISMATCH)
    expect(check.groupsYoung).toBe(0)
  })

  // ⚠️ IT ASKS, IT DOES NOT REFUSE — the wording has to leave the door open,
  // because the club's standing ruling is that the age-group picker warns. The
  // tournament site blocks here; this is not that form.
  it('leaves the door open in its wording', () => {
    expect(ageGradeCheck('U12 Mixed', '2010-03-04', IN_SEASON).message).toMatch(
      /you can still save/i,
    )
  })
})
