// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import { fixtureLabel } from '../src/lib/fixtureLabel.js'

// One formatter for Schedule, EventDetail, the allocation grid and the calendar
// feed. The feed deploys separately from the bundle, so a rule duplicated at
// four call sites would drift invisibly until a parent's subscribed calendar
// disagreed with the app.

describe('fixtureLabel', () => {
  // ⚠️ THE NULL CASE COMES FIRST, DELIBERATELY. It is the rule the whole
  // feature rests on, and it is the one a later "improvement" is most likely to
  // break by adding a friendly-looking default.
  it('⚠️ renders NOTHING extra when the fixture is not a league match', () => {
    expect(fixtureLabel({ round: 4 }, null, 'U14B Contact')).toBe('U14B Contact')
  })

  it('⚠️ ignores a stale round number when there is no league team', () => {
    // A round left on a fixture that was later changed to a friendly must not
    // leak back out. Without a league team there is no league, so there is no
    // round — whatever the column happens to still hold.
    expect(fixtureLabel({ round: 9 }, undefined, 'U16G Contact')).toBe('U16G Contact')
  })

  it('names a senior division rather than lettering it (3 Sep 2026)', () => {
    // The men's 1st XV plays the West Asia Premiership, stored as the code
    // 'WAP'. "Div WAP" is what the old template would have said.
    expect(fixtureLabel({ round: 12 }, { rcm_name: 'ADH', division: 'WAP' }, 'Senior Men')).toBe(
      'ADH · Premiership · Round 12',
    )
    expect(fixtureLabel({ round: 2 }, { rcm_name: 'ADH', division: 'WXV' }, 'Senior Women')).toBe(
      'ADH · WXVs · Round 2',
    )
  })

  it('renders team, division and round for a league match', () => {
    expect(
      fixtureLabel({ round: 4 }, { rcm_name: 'ADHQ2', division: 'B' }, 'U14B Contact'),
    ).toBe('ADHQ2 · Div B · Round 4')
  })

  it('omits the division when the team is not in a lettered one', () => {
    // division is nullable on purpose — forcing a letter would invent data.
    expect(
      fixtureLabel({ round: 4 }, { rcm_name: 'ADHQ2', division: null }, 'U14B Contact'),
    ).toBe('ADHQ2 · Round 4')
  })

  it('omits the round when the fixture has none', () => {
    expect(
      fixtureLabel({ round: null }, { rcm_name: 'ADHQ2', division: 'B' }, 'U14B Contact'),
    ).toBe('ADHQ2 · Div B')
  })

  it('⚠️ treats round 0 as a real round, not as absent', () => {
    // `if (event.round)` would swallow this. Round 0 is unusual but a falsy
    // check here is the kind of bug that only shows up once a season.
    expect(
      fixtureLabel({ round: 0 }, { rcm_name: 'ADHQ2', division: 'A' }, 'U14B Contact'),
    ).toBe('ADHQ2 · Div A · Round 0')
  })

  it('survives a missing event object', () => {
    expect(fixtureLabel(null, { rcm_name: 'ADHQ2', division: 'C' }, 'U18B Contact')).toBe(
      'ADHQ2 · Div C',
    )
  })

  // ══ LEAGUE PLACEHOLDERS (1 Sep 2026) ══════════════════════════════════════
  //
  // The league publishes ROUNDS months before it publishes fixtures, so "a
  // league fixture whose side is not picked yet" is a real state — and its one
  // known fact, the round, must show. The gate is competition_type, never the
  // round's mere presence: the stale-round tests above are the control and
  // they still pass, because a friendly has no competition_type.
  it('⚠️ shows the round WITHOUT a league team when the event is filed as league', () => {
    expect(
      fixtureLabel({ competition_type: 'league', round: 1 }, null, 'U16B Contact'),
    ).toBe('U16B Contact · Round 1')
  })

  it('⚠️ round 0 survives the placeholder path too', () => {
    // Same falsy trap as the league-team path: `if (round)` would swallow it.
    expect(
      fixtureLabel({ competition_type: 'league', round: 0 }, null, 'U16B Contact'),
    ).toBe('U16B Contact · Round 0')
  })

  it('⚠️ a league fixture with NO round yet stays the bare squad name', () => {
    // Nothing to say is nothing said — no invented "Round TBD" decoration.
    expect(
      fixtureLabel({ competition_type: 'league', round: null }, null, 'U16B Contact'),
    ).toBe('U16B Contact')
  })

  it('⚠️ a TOURNAMENT or TBD competition never borrows the round', () => {
    // The round belongs to the league. A round left behind on a fixture whose
    // competition later changed must not leak back out through this new path.
    expect(
      fixtureLabel({ competition_type: 'tournament', round: 4 }, null, 'U16B Contact'),
    ).toBe('U16B Contact')
    expect(fixtureLabel({ competition_type: 'tbd', round: 4 }, null, 'U16B Contact')).toBe(
      'U16B Contact',
    )
  })

  it('falls back to the round alone when there is no squad name either', () => {
    expect(fixtureLabel({ competition_type: 'league', round: 2 }, null, '')).toBe('Round 2')
  })
})
