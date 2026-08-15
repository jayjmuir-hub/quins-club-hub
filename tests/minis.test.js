// @vitest-environment node
// Nothing here touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import {
  MINIS_MAX_AGE,
  MIGHTY_MINIS_MAX_AGE,
  SCORES_FROM_AGE,
  isMinisBand,
  isMinisTeam,
  recordsScores,
  squadFormat,
} from '../src/lib/minis.js'
import { matchSheetDeadline } from '../src/lib/matchSheetDeadline.js'
import { allowsOwnContact } from '../src/lib/ageGroup.js'
import { scoringForBand } from '../src/lib/scoring.js'

// U10 and below — confirmed by the club's youth section, 15 Aug 2026:
//   there is no league below U11;
//   U6-U8 play Mighty Minis at the cricket stadium on league match weekends;
//   U9-U10 play friendly festivals of three or four clubs, each hosting one.
// And the RCM sheet's own instructions start at "U11 to u16".

const KICK_OFF = new Date('2026-09-12T09:00:00.000Z')

// The club's real squad names, which are what these functions actually receive.
// The suffix cases are the ones this repo has already been bitten by: "U6 Tag"
// ends in a G and "U12G" puts a letter straight after the digits.
const MINIS = ['U6 Tag', 'U7 Tag', 'U8 Tag', 'U9 Mixed Contact', 'U10 Mixed Contact']
const NOT_MINIS = [
  'U11 Mixed Contact',
  'U12 Mixed Contact',
  'U12G QR',
  'U14B Contact',
  'U16G Contact',
  'U18 Colts',
  "Women's XV",
  'Senior Men 1st XV',
]

describe('isMinisBand', () => {
  it('is U10 and below, and the boundary is exactly there', () => {
    expect(isMinisBand(10)).toBe(true)
    expect(isMinisBand(11)).toBe(false)
    expect(MINIS_MAX_AGE).toBe(10)
  })

  it('⚠️ NULL IS NOT MINIS — this fails OPEN, unlike allowsOwnContact', () => {
    // The single most important line in the module, and the reason it is
    // asserted next to its opposite below. ageBandFromTeamName answers null for
    // a senior side AND for junk, and this cannot tell them apart — so a band it
    // could not read keeps every control it has today rather than losing them.
    expect(isMinisBand(null)).toBe(false)
    expect(isMinisBand(undefined)).toBe(false)
    expect(isMinisBand(NaN)).toBe(false)
    expect(isMinisBand('10')).toBe(false)
  })

  it('⚠️ fails in the OPPOSITE direction to allowsOwnContact, on purpose', () => {
    // Both are handed the same unreadable input and answer differently. Anyone
    // who "aligns" them will break one: offering a child's own phone is a
    // safeguarding failure, hiding a coach's league dropdown is an annoyance.
    expect(allowsOwnContact('')).toBe(false) // fails CLOSED — refuses
    expect(isMinisTeam('')).toBe(false) // fails OPEN — keeps everything
  })
})

describe('isMinisTeam', () => {
  it('reads the club’s real squad names', () => {
    for (const name of MINIS) expect(isMinisTeam(name)).toBe(true)
    for (const name of NOT_MINIS) expect(isMinisTeam(name)).toBe(false)
  })

  it('⚠️ the Women’s XV is NOT minis, and that is load-bearing', () => {
    // It is named on the RCM form ("WXV"). If this ever answered true — say by
    // treating an unreadable name as minis — the Women's XV would silently lose
    // its match sheet, which is the exact failure the fail-open rule prevents.
    expect(isMinisTeam("Women's XV")).toBe(false)
  })

  it('survives junk without claiming anything', () => {
    for (const name of [null, undefined, 42, '', '   ', 'Development squad', 'U123']) {
      expect(isMinisTeam(name)).toBe(false)
    }
  })
})

describe('squadFormat', () => {
  it('gives U6-U8 the Mighty Minis, at the cricket stadium', () => {
    for (const name of ['U6 Tag', 'U7 Tag', 'U8 Tag']) {
      const format = squadFormat(name)
      expect(format.key).toBe('mighty-minis')
      expect(format.summary).toMatch(/cricket stadium/i)
    }
    expect(MIGHTY_MINIS_MAX_AGE).toBe(8)
  })

  it('gives U9-U10 the friendly festivals, with a club hosting each weekend', () => {
    for (const name of ['U9 Mixed Contact', 'U10 Mixed Contact']) {
      const format = squadFormat(name)
      expect(format.key).toBe('festival')
      expect(format.summary).toMatch(/friendly/i)
      expect(format.points.join(' ')).toMatch(/hosts one/i)
    }
  })

  it('⚠️ the two formats are DIFFERENT text, not one message with two titles', () => {
    // The whole reason squadFormat returns a shape rather than a boolean. If
    // these ever collapse into the same words, the split has stopped earning
    // its keep and the screens should be simplified rather than left pretending.
    expect(squadFormat('U8 Tag').summary).not.toBe(squadFormat('U10 Mixed Contact').summary)
  })

  it('⚠️ says nothing at all about U11 and up — no card, no placeholder', () => {
    for (const name of NOT_MINIS) expect(squadFormat(name)).toBeNull()
  })

  it('both formats state that the league starts at U11', () => {
    // The fact every minis parent needs, and the one the app was silently
    // failing to give: a fixture list that looks exactly like a U16 season.
    for (const name of ['U6 Tag', 'U10 Mixed Contact']) {
      expect(squadFormat(name).points.join(' ')).toMatch(/league starts at U11/i)
    }
  })
})

describe('matchSheetDeadline — the lower bound added 15 Aug 2026', () => {
  it('⚠️ U10 AND BELOW GET NO DEADLINE, because they are not on the form', () => {
    // Before this, every band under 18 was handed "within 24 hours of the final
    // whistle" — a governing-body deadline, stated confidently, for a sheet
    // nobody has ever filed. The form says "U11 to u16 Games".
    for (const name of MINIS) expect(matchSheetDeadline(name, KICK_OFF)).toBeNull()
  })

  it('U11 still gets one — the boundary is exactly at 11', () => {
    const due = matchSheetDeadline('U11 Mixed Contact', KICK_OFF)
    expect(due).not.toBeNull()
    expect(due.side).toBe('after')
    expect(due.band).toBe(11)
  })
})

describe('recordsScores — U6 and U7 do not', () => {
  it('⚠️ THREE BOUNDARIES IN A ROW, IN THREE DIFFERENT PLACES', () => {
    // The whole reason each has its own named constant. Written out band by band
    // so that anyone "tidying" two of them together has to delete this test to
    // do it, and has to read it first.
    //
    //   U6-U7    no score recorded at all              SCORES_FROM_AGE = 8
    //   U6-U8    Mighty Minis at the cricket stadium   MIGHTY_MINIS_MAX_AGE = 8
    //   U6-U10   no league, no match sheet             MINIS_MAX_AGE = 10
    expect(SCORES_FROM_AGE).toBe(8)
    expect(recordsScores('U6 Tag')).toBe(false)
    expect(recordsScores('U7 Tag')).toBe(false)
    expect(recordsScores('U8 Tag')).toBe(true)

    // U8 is the band where the three rules visibly disagree: it is Mighty Minis,
    // it has no league and no sheet, and it DOES record a score.
    expect(squadFormat('U8 Tag').key).toBe('mighty-minis')
    expect(isMinisTeam('U8 Tag')).toBe(true)
    expect(recordsScores('U8 Tag')).toBe(true)
  })

  it('U9 and U10 keep scores — Jay: "keep scoring for U8/U9/U10"', () => {
    for (const name of ['U9 Mixed Contact', 'U10 Mixed Contact']) {
      expect(recordsScores(name)).toBe(true)
    }
  })

  it('⚠️ fails OPEN, like every other rule in this module', () => {
    // An unreadable squad name records scores. The alternative is a fixture
    // whose score cannot be entered and whose squad nobody can identify.
    for (const name of [null, undefined, '', 'Senior Men 1st XV', "Women's XV", 'junk']) {
      expect(recordsScores(name)).toBe(true)
    }
  })

  it('⚠️ is NOT scoringForTeam, and the database is why', () => {
    // scoringForBand's thresholds are mirrored by private.scoring_kinds_for_team,
    // so moving one means writing a migration. This is a UI question the
    // database neither knows nor cares about — which is precisely why U6 can
    // answer "no score is entered" while still having a scoring KIND defined.
    expect(scoringForBand(6)).toEqual(['tries'])
    expect(recordsScores('U6 Tag')).toBe(false)
  })
})

describe('⚠️ the minis threshold is NOT the scoring threshold', () => {
  it('U11 is tries-only AND has a match sheet, at the same time', () => {
    // Two rules that both happen to mention eleven and are not the same rule.
    // scoringForBand's tries-only band runs to 11 inclusive; the RCM form starts
    // AT 11. Anyone who unifies these two numbers will move one of them.
    expect(scoringForBand(11)).toEqual(['tries'])
    expect(isMinisTeam('U11 Mixed Contact')).toBe(false)
    expect(matchSheetDeadline('U11 Mixed Contact', KICK_OFF)).not.toBeNull()
  })
})
