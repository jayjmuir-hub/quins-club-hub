// @vitest-environment node
// Nothing here touches the DOM. The measurement and the rule are in vite.config.js.
import { describe, expect, it } from 'vitest'
import {
  MISMATCH,
  OK,
  PLAY_UP,
  ageAt,
  ageGradeCheck,
  canPlayUpInto,
  cutoffAgesForTeam,
  cutoffFor,
  ownBandForAge,
  ownSquadLabel,
  playupSourceTeams,
  playupTargetTeams,
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
  // ⚠️ THE CUT-OFF IS 31 AUGUST BUT THE APP ROLLS OVER ON 1 JUNE — Jay's call,
  // 17 Aug 2026, and it is the fix for a bug that was LIVE on the registration
  // form. "The season containing today" put 17 Aug 2026 in the 2025/26 season,
  // so a family registering in August — for a season starting in two weeks —
  // had every child judged one year too young. The form then REFUSED to submit
  // until the parent consented to a play-up that was not happening, and the
  // consent wrote a false `plays_up_confirmed_at`.
  it('⚠️ looks forward to the coming season through the summer', () => {
    expect(cutoffFor(new Date('2026-08-17T00:00:00Z')).toISOString()).toContain('2026-08-31')
    expect(cutoffFor(new Date('2026-06-01T00:00:00Z')).toISOString()).toContain('2026-08-31')
  })

  // The boundary itself: 1 June IS the new season as far as registration goes.
  it('turns over on 1 June, not the day after', () => {
    expect(cutoffFor(new Date('2026-06-01T00:00:00Z')).toISOString()).toContain('2026-08-31')
    expect(cutoffFor(new Date('2026-05-31T00:00:00Z')).toISOString()).toContain('2025-08-31')
  })

  // ⚠️ SEPTEMBER TO MAY IS UNCHANGED, and these two are what prove the fix did
  // not simply shift the bug to the other side of the year.
  it('is unchanged in season — the governing date is still LAST August in March', () => {
    expect(cutoffFor(new Date('2027-03-01T00:00:00Z')).toISOString()).toContain('2026-08-31')
  })

  it('is unchanged once the season has actually started', () => {
    expect(cutoffFor(new Date('2026-09-01T00:00:00Z')).toISOString()).toContain('2026-08-31')
    expect(cutoffFor(new Date('2026-11-07T00:00:00Z')).toISOString()).toContain('2026-08-31')
  })
})

describe('ownBandForAge', () => {
  it('is a table, not age + 1 — U16 and U18 each take two ages', () => {
    expect(ownBandForAge(12)).toBe(13)
    expect(ownBandForAge(14)).toBe(16)
    expect(ownBandForAge(15)).toBe(16)
    expect(ownBandForAge(16)).toBe(18)
    expect(ownBandForAge(17)).toBe(18)
  })

  // ⚠️ THE GIRLS' TABLE IS A PARTIAL OVERRIDE. The club runs girls' groups only
  // at U12, U14, U16 and U18 — there is no U13G — so a girl who is 12 falls
  // through to U13, the MIXED squad, which is where she would actually play.
  // Deleting the fallback would leave those children with no answer at all.
  it('⚠️ falls through to the mixed groups where no girls’ group exists', () => {
    expect(ownBandForAge(11, true)).toBe(12)
    expect(ownBandForAge(12, true)).toBe(13)
    expect(ownBandForAge(9, true)).toBe(10)
  })

  it('has no answer for an age the club runs nothing for', () => {
    expect(ownBandForAge(19)).toBeNull()
    expect(ownBandForAge(3)).toBeNull()
  })
})

describe('ownSquadLabel', () => {
  const SQUADS = [
    'U6 Tag', 'U10 Mixed', 'U11 Mixed', 'U12 Mixed', 'U12G QR', 'U13 Mixed',
    'U14B', 'U14G QR', 'U16B', 'U16G', 'U18B', 'U18G',
  ]

  it('names the club’s real squad, not a band number', () => {
    expect(ownSquadLabel(11, 'U13 Mixed', SQUADS)).toBe('U12 Mixed')
  })

  // ⚠️ A GIRL PICKING A GIRLS' SQUAD IS SENT TO A GIRLS' SQUAD. Two squads share
  // band 12 — U12 Mixed and U12G QR — and naming the wrong one to a parent who
  // has already told us which kind of squad they are in is worse than vague.
  it('⚠️ prefers a squad of the same kind as the one they picked', () => {
    expect(ownSquadLabel(11, 'U14G QR', SQUADS)).toBe('U12G QR')
  })

  // ⚠️ FALLS BACK RATHER THAN GUESSING. A confident wrong squad is worse than an
  // honest vague one.
  it('⚠️ falls back to the band when two squads are equally likely', () => {
    expect(ownSquadLabel(11, 'U13 Mixed', ['U12 Mixed', 'U12 Mixed B'])).toBe('U12')
  })

  it('falls back when the club runs no such squad at all', () => {
    expect(ownSquadLabel(11, 'U13 Mixed', [])).toBe('U12')
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

// ⚠️ THE WHOLE REASON THIS SECTION EXISTS. Jay, 17 Aug 2026, looking at the age
// bands: "i think this is wrong because we are doing this for the upcoming
// season that starts sept 1st". These are the cases as a parent meets them
// during the August registration window — the ones that were wrong in
// production until this commit.
describe('⚠️ registering in August, for the season that starts on 1 September', () => {
  const AUGUST = new Date('2026-08-17T00:00:00Z')
  const SQUADS = ['U12 Mixed', 'U12G QR', 'U13 Mixed', 'U14B', 'U14G QR', 'U16B', 'U18B']

  // Born 15 Jan 2014 -> 12 at the 31 Aug 2026 cut-off -> an ordinary U13.
  it('⚠️ treats an ordinary U13 registrant as ordinary, not as playing up', () => {
    const check = ageGradeCheck('U13 Mixed', '2014-01-15', AUGUST, { squadNames: SQUADS })
    expect(check.status).toBe(OK)
    expect(check.cutoffAge).toBe(12)
  })

  it('does the same for every single-age band, which is where it was wrong', () => {
    // ⚠️ U16 AND U18 ARE ABSENT FROM THIS LIST ON PURPOSE — they are DOUBLE
    // bands, so the lower age of the pair absorbed the off-by-one and they came
    // out `ok` throughout the bug. Asserting them would have proved nothing.
    const cases = [
      ['U10 Mixed', '2017-01-15'],
      ['U11 Mixed', '2016-01-15'],
      ['U12 Mixed', '2015-01-15'],
      ['U13 Mixed', '2014-01-15'],
      ['U14B', '2013-01-15'],
    ]
    for (const [squad, dob] of cases) {
      expect(ageGradeCheck(squad, dob, AUGUST).status, `${squad} / ${dob}`).toBe(OK)
    }
  })

  // ⚠️ AND A GENUINE PLAY-UP IS STILL A PLAY-UP. The fix must not simply stop
  // the form asking — the consent flow is right, it was the date that was wrong.
  it('still asks about a real play-up, and now names the squad they belong in', () => {
    const check = ageGradeCheck('U13 Mixed', '2015-01-15', AUGUST, { squadNames: SQUADS })
    expect(check.status).toBe(PLAY_UP)
    expect(check.ownSquad).toBe('U12 Mixed')
    expect(check.message).toContain('They are 11 at the 31 Aug 2026 cut-off.')
    expect(check.message).toContain('That is U12 Mixed.')
    expect(check.message).toContain('You have chosen U13 Mixed, which is one age group up.')
    expect(check.message).toMatch(/coaches will be told/i)
  })

  // ⚠️ A PARENT WHO PICKED THE WRONG SQUAD WAS BEING ASKED TO CONSENT RATHER
  // THAN SHOWN THEIR MISTAKE, and consenting is much the easier of the two.
  // Naming their own squad is what turns a permission request into a question.
  it('⚠️ names the real squad rather than a band number', () => {
    const check = ageGradeCheck('U13 Mixed', '2015-01-15', AUGUST, { squadNames: SQUADS })
    expect(check.message).not.toMatch(/That is U12\./)
  })

  it('degrades to the band when it is not given a squad list', () => {
    const check = ageGradeCheck('U13 Mixed', '2015-01-15', AUGUST)
    expect(check.message).toContain('That is U12.')
  })
})

describe('a real mismatch', () => {
  it('names the ages the squad is for, and the age the birthday gives', () => {
    const check = ageGradeCheck('U12 Mixed', '2010-03-04', IN_SEASON) // 16
    expect(check.status).toBe(MISMATCH)
    expect(check.message).toMatch(/aged 11/)
    expect(check.message).toMatch(/makes them 16/)
  })

  it('also points at the squad that birthday does fit', () => {
    const check = ageGradeCheck('U12 Mixed', '2010-03-04', IN_SEASON, {
      squadNames: ['U12 Mixed', 'U16B', 'U18B'],
    })
    expect(check.ownSquad).toBe('U18B')
    expect(check.message).toContain('That is U18B.')
  })

  // ⚠️ ⚠️ THIS REPLACED A TEST THAT ASSERTED NOTHING, AND THE STORY IS THE
  //    POINT. `ageGradeCheck` had a guard suppressing "That is X" when X was the
  //    squad the parent had already picked, and a test for it that passed. Both
  //    were worthless: the case it "handled" returns `ok` and exits long before
  //    the guard, so the test's `not.toMatch` was true of an EMPTY message.
  //    Deleting the guard broke nothing, which is how it was caught.
  //
  //    What is real is the INVARIANT underneath: `ownBandForAge` is the exact
  //    inverse of `cutoffAgesForTeam`, so a non-`ok` result can never name the
  //    squad you chose. That is worth pinning, because breaking the inverse
  //    would make the app tell a parent their child belongs in the squad they
  //    just picked while refusing to accept them in it.
  //
  //    ⚠️ THE CONTROL IS LOAD-BEARING. A sweep that finds nothing proves nothing
  //    unless it can be shown to find something — twice in this repo an empty
  //    result has been read as proof of absence and was wrong (CLAUDE.md rule 6).
  it('⚠️ never tells a parent their own squad is the one they already picked', () => {
    const SQUADS = [
      'U6 Tag', 'U7 Tag', 'U8 Tag', 'U9 Mixed', 'U10 Mixed', 'U11 Mixed', 'U12 Mixed',
      'U12G QR', 'U13 Mixed', 'U14B', 'U14G QR', 'U16B', 'U16G', 'U18B', 'U18G',
    ]
    let checked = 0
    let named = 0

    for (const squad of SQUADS) {
      for (let age = 3; age <= 22; age += 1) {
        const check = ageGradeCheck(squad, `${2026 - age}-01-15`, IN_SEASON, { squadNames: SQUADS })
        if (check.status === OK) continue
        checked += 1
        if (check.ownSquad) named += 1
        expect(check.ownSquad, `${squad} at ${age}`).not.toBe(squad)
      }
    }

    // The control: the sweep really did reach non-`ok` results, and most of them
    // really did carry a squad name for the assertion to compare against.
    //
    // ⚠️ `named` IS DELIBERATELY NOT EQUAL TO `checked`, AND ASSERTING THAT IT
    // WAS is how this control was wrong on its first run. Ages outside the band
    // table — 3, 4, and everything from 18 up — correctly have NO own squad, so
    // 176 of the 281 carry a name. Demanding all 281 made the control fail while
    // the invariant it guards was perfectly fine.
    expect(checked).toBeGreaterThan(100)
    expect(named).toBeGreaterThan(100)
    expect(named).toBeLessThan(checked)
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

describe('play-up source and target squads (request/nominate picker)', () => {
  const U13 = { id: 't-u13', name: 'U13 Mixed', sort_order: 8, is_senior: false }
  const U14B = { id: 't-u14b', name: 'U14B', sort_order: 9, is_senior: false }
  const U16B = { id: 't-u16b', name: 'U16B Contact', sort_order: 11, is_senior: false }
  const U12G = { id: 't-u12g', name: 'U12G QR', sort_order: 7, is_senior: false }
  const U14G = { id: 't-u14g', name: 'U14G', sort_order: 9, is_senior: false }
  const U6 = { id: 't-u6', name: 'U6', sort_order: 1, is_senior: false }
  const SENIOR = { id: 't-1xv', name: 'Senior Men 1st XV', sort_order: 20, is_senior: true }
  const ALL = [U6, U13, U14B, U16B, U12G, U14G, SENIOR]

  it('U14B may take a play-up from U13 Mixed, not from U6 or a senior side', () => {
    const sources = playupSourceTeams(U14B, ALL, IN_SEASON)
    expect(sources.map((t) => t.id)).toEqual([U13.id])
    expect(canPlayUpInto(U13, U14B, IN_SEASON)).toBe(true)
    expect(canPlayUpInto(U6, U14B, IN_SEASON)).toBe(false)
    expect(canPlayUpInto(SENIOR, U14B, IN_SEASON)).toBe(false)
  })

  it('U13 Mixed may be nominated into U14B, not into U16B (two hops) or seniors', () => {
    const targets = playupTargetTeams(U13, ALL, IN_SEASON)
    expect(targets.map((t) => t.id)).toEqual([U14B.id])
    expect(canPlayUpInto(U13, U16B, IN_SEASON)).toBe(false)
  })

  it('⚠️ girls may play up two groups: U12G into U14G', () => {
    expect(canPlayUpInto(U12G, U14G, IN_SEASON)).toBe(true)
    expect(playupSourceTeams(U14G, ALL, IN_SEASON).map((t) => t.id)).toEqual([U12G.id])
  })
})
