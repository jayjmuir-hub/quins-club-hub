import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

// The eligibility warning in the lineup picker —
// claude/plans/2026-08-17-lineup-eligibility-warning.md.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED. CLAUDE.md rule 9: this repo is public
// and its members are mostly children. A grade is an ability judgement, so this is
// the last file in the repo that should carry a real one.

const useMembershipsMock = vi.fn()
const getEventMock = vi.fn()
const listPlayersMock = vi.fn()
const listAvailabilityMock = vi.fn()
const listLineupsMock = vi.fn()
const listPlayerGradesMock = vi.fn()

vi.mock('react-router-dom', () => ({
  useParams: () => ({ eventId: 'e-1' }),
  useNavigate: () => vi.fn(),
}))
vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/events.js', () => ({ getEvent: (...a) => getEventMock(...a) }))
vi.mock('../src/data/players.js', () => ({ listPlayers: (...a) => listPlayersMock(...a) }))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...a) => listAvailabilityMock(...a),
}))
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
  createLineup: vi.fn(),
  updateLineup: vi.fn(),
  saveLineupPlayers: vi.fn(),
  deleteLineup: vi.fn(),
}))
vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: (...a) => listPlayerGradesMock(...a),
}))
vi.mock('../src/lib/shareImage.js', () => ({ shareElementAsImage: vi.fn() }))

import Lineup from '../src/screens/Lineup.jsx'

const TEAM = { id: 't-u16b', club_id: 'c-1', name: 'U16B Contact' }
const COACH = [{ id: 'm-1', role: 'coach', team_id: TEAM.id, status: 'active', club_id: 'c-1' }]

const PLAYERS = [
  { id: 'p-strong', full_name: 'Rory Aldenbrook', team_id: TEAM.id },
  { id: 'p-weak', full_name: 'Callum Whitstead', team_id: TEAM.id },
  { id: 'p-match', full_name: 'Ewan Marchetti', team_id: TEAM.id },
  { id: 'p-ungraded', full_name: 'Tomas Bergqvist', team_id: TEAM.id },
]

const GRADES = new Map([
  ['p-strong', { player_id: 'p-strong', tier: 'A', note: null }],
  ['p-weak', { player_id: 'p-weak', tier: 'C', note: null }],
  ['p-match', { player_id: 'p-match', tier: 'B', note: null }],
  // p-ungraded deliberately has NO row. That is the majority case in the club.
])

function eventAt(tier) {
  return {
    id: 'e-1',
    team_id: TEAM.id,
    type: 'match',
    opponent: 'Dubai Exiles',
    starts_at: '2026-10-10T04:00:00.000Z',
    tier,
  }
}

/**
 * A saved lineup holding every player, so picked rows and the share card both fill.
 *
 * ⚠️ THE A-GRADED CHILD IS THE REPLACEMENT, AND THAT IS NOT AN ARBITRARY CHOICE.
 * This started as "last player in the list is the replacement", which made the
 * bench place fall on the UNGRADED child — so a grade leaking into the
 * replacements list rendered nothing either way and the guard below could not see
 * it. Proved by injecting exactly that leak and watching the file stay green. It is
 * the same shape as the age cut-off bug: invisible on precisely the case where it
 * did not matter. A graded child has to sit on the bench for the bench to be tested
 * at all.
 */
function lineupWithEveryone() {
  return [
    {
      id: 'l-1',
      players_per_side: 15,
      squad_size: null,
      notes: '',
      lineup_players: PLAYERS.map((player, index) => ({
        player_id: player.id,
        role: player.id === 'p-strong' ? 'replacement' : 'starter',
        position: null,
        sort_order: index,
      })),
    },
  ]
}

async function renderScreen({ tier = 'B', lineups = [], grades = GRADES } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: COACH,
    teams: [TEAM],
    loading: false,
    error: null,
  })
  getEventMock.mockResolvedValue(eventAt(tier))
  listPlayersMock.mockResolvedValue(PLAYERS)
  listAvailabilityMock.mockResolvedValue(PLAYERS.map((p) => ({ player_id: p.id, status: 'in' })))
  listLineupsMock.mockResolvedValue(lineups)
  listPlayerGradesMock.mockResolvedValue(grades)
  render(<Lineup />)
  // ⚠️ getAllByText, NOT getByText. Once a lineup exists a picked child's name
  // appears TWICE — in the row and in the off-screen share card — and getByText
  // throws on a second match. The duplicate is the share card working.
  await waitFor(() => expect(screen.getAllByText('Rory Aldenbrook').length).toBeGreaterThan(0))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the eligibility warning', () => {
  it('warns in both directions at once, with different sentences', async () => {
    // A B-tier fixture puts the A-graded child below it and the C-graded child
    // above it — both mismatches visible on one screen, which is the case a
    // single-direction implementation would half-pass.
    await renderScreen({ tier: 'B' })

    expect(screen.getByText(/Graded A — this fixture is B tier\. Check they’re eligible\./))
      .toBeInTheDocument()
    expect(screen.getByText(/Graded C — this fixture is B tier, above their grade\./))
      .toBeInTheDocument()
  })

  // ⚠️ THE LOAD-BEARING CASE. Most of the club is ungraded; a warning against
  // nearly every name is furniture and coaches learn to read past it.
  it('says nothing about the ungraded or the correctly graded', async () => {
    await renderScreen({ tier: 'B' })

    // Ewan is graded B at a B-tier fixture; Tomas has no grade at all.
    expect(screen.queryByText(/Graded B/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Graded undefined|Graded null|Graded  /)).not.toBeInTheDocument()

    // The control: this render DID produce warnings, so the two absences above
    // mean "correctly silent" rather than "the feature never ran".
    expect(screen.getAllByText(/Graded [AC] —/).length).toBeGreaterThan(0)
  })

  it('says nothing at all when the fixture has no tier', async () => {
    // A friendly. Same players, same grades — only the fixture's tier differs.
    await renderScreen({ tier: null })
    expect(screen.queryByText(/Graded/)).not.toBeInTheDocument()
  })

  it('warns on the picked rows as well as in the pool', async () => {
    await renderScreen({ tier: 'B', lineups: lineupWithEveryone() })

    // Everyone is picked, so the pool is empty and these can only be picked rows.
    // ⚠️ A CONTIGUOUS FRAGMENT, NOT THE WHOLE SENTENCE. That line interpolates
    // `{players.length}` mid-sentence, so the text node is split and an exact
    // match finds nothing — the same trap as grepping a bundle for a string that
    // spans a template hole.
    expect(screen.getByText(/Everyone in this squad is in the team/)).toBeInTheDocument()
    // Rory is the REPLACEMENT and is graded A, so this warning can only be coming
    // from a bench row — a bench place still puts a child on the team sheet, which
    // is what an eligibility rule is about.
    expect(screen.getByText(/Graded A — this fixture is B tier/)).toBeInTheDocument()
    // And Callum is a starter, graded C. Both picked surfaces, one render.
    expect(screen.getByText(/Graded C — this fixture is B tier/)).toBeInTheDocument()
  })

  // ⚠️ A STRUCTURAL STAND-IN FOR A MEASUREMENT jsdom CANNOT MAKE, AND THE NUMBERS
  // ARE WHY IT EXISTS. Measured in a real browser at 375px: with the sentence inside
  // the name's flex column, alongside the status chip and both buttons, it was 122px
  // wide, wrapped to FOUR lines, and made the row 108px tall against a 42px unwarned
  // baseline. Moved under the row it gets 322px, one line, 62px.
  //
  // ⚠️ EVERY OTHER ASSERTION IN THIS FILE PASSED ON THE 108px VERSION. jsdom reports
  // no widths and no wrapping, so it cannot fail on layout — but it CAN see shape,
  // and the shape is the thing that was wrong. So: the warning must be a SIBLING of
  // the flex row, never a descendant of it.
  it('keeps the warning outside the flex row, where it has the full width', async () => {
    for (const lineups of [[], lineupWithEveryone()]) {
      cleanup()
      await renderScreen({ tier: 'B', lineups })

      const warnings = screen.getAllByText(/Graded [AC] —/)
      // The control: this configuration really did render warnings to inspect.
      expect(warnings.length).toBeGreaterThan(0)

      for (const warning of warnings) {
        // Straight to the <li>, not into a flex column shared with the buttons.
        expect(warning.parentElement.tagName).toBe('LI')
        expect(warning.parentElement.className).not.toMatch(/\bflex\b/)
      }
    }
  })

  // ⚠️ THE SCREEN MUST SURVIVE A REFUSED GRADE READ. player_grades is coach-only
  // and an empty or failed read is the normal case, not an error. Picking a team
  // is the job; the warning is decoration on top of it.
  it('still loads the lineup when the grade read fails outright', async () => {
    listPlayerGradesMock.mockRejectedValue(new Error('permission denied for table player_grades'))
    await renderScreen({ tier: 'B', grades: new Map() })

    // No warnings, no error banner, and the squad is still pickable.
    expect(screen.queryByText(/Graded/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Tomas Bergqvist')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
describe('⚠️ the shared image must never carry a grade', () => {
  // The share card is photographed by shareElementAsImage and handed to WhatsApp:
  // it leaves the app permanently and can be forwarded onward. It sits about a
  // hundred lines below the warning in the same file, which is exactly the
  // distance at which somebody adds a helpful line to the wrong block.
  it('shows names and nothing about ability, even when every child mismatches', async () => {
    // A C-tier fixture: the A and B graded children are both above it, so the
    // screen is full of warnings. If any of them can reach the card, this fails.
    await renderScreen({ tier: 'C', lineups: lineupWithEveryone() })

    const card = document.querySelector('[aria-hidden="true"] .bg-white')
    expect(card).not.toBeNull()
    const shared = card.textContent

    // The control FIRST: the card really was found and really is populated, so a
    // clean scan below means "nothing leaked" rather than "nothing was there".
    expect(shared).toContain('Rory Aldenbrook')
    expect(shared).toContain('Tomas Bergqvist')
    expect(shared).toContain('Starting')

    // And the warnings really are on the page, outside the card.
    expect(screen.getAllByText(/Graded [AB] —/).length).toBeGreaterThan(0)

    // Now the actual assertion.
    expect(shared).not.toMatch(/Graded/)
    expect(shared).not.toMatch(/tier/i)
    expect(shared).not.toMatch(/eligib/i)
    expect(shared).not.toMatch(/above their grade/)
  })

  // ⚠️ THE REAL GUARD, AND THE KEYWORD SCAN ABOVE IS WHY IT EXISTS. That scan was
  // written first and looked thorough — no "Graded", no "tier", no "eligib". A leak
  // of the bare LETTER, rendering a replacement as `Tomas Bergqvist (A)`, was then
  // injected into the share card and the whole file stayed GREEN. A test that would
  // pass against the very thing it exists to catch reports confidence it has not
  // earned.
  //
  // So this one names no keyword at all: whatever a grade is rendered AS, the card
  // must not change when the grades do. The card is compared against itself with
  // every grade removed and nothing else altered.
  it('renders a card that does not change when the grades do', async () => {
    await renderScreen({ tier: 'C', lineups: lineupWithEveryone(), grades: GRADES })
    const graded = document.querySelector('[aria-hidden="true"] .bg-white').textContent
    const warningsWhenGraded = screen.getAllByText(/Graded [AB] —/).length

    cleanup()

    await renderScreen({ tier: 'C', lineups: lineupWithEveryone(), grades: new Map() })
    const ungraded = document.querySelector('[aria-hidden="true"] .bg-white').textContent
    const warningsWhenUngraded = screen.queryAllByText(/Graded/).length

    // ⚠️ THE CONTROL, AND IT IS LOAD-BEARING. Without it the comparison below
    // would pass perfectly if grades never reached the screen at all — the two
    // renders would be identical because both were ungraded. This proves the first
    // render really was graded and the second really was not, so the comparison is
    // measuring the card and not measuring nothing.
    expect(warningsWhenGraded).toBeGreaterThan(0)
    expect(warningsWhenUngraded).toBe(0)
    expect(graded).toContain('Rory Aldenbrook')
    expect(graded).toContain('Starting')

    expect(graded).toBe(ungraded)
  })

  it('keeps the warnings out of the card even when they are in the picked rows', async () => {
    await renderScreen({ tier: 'C', lineups: lineupWithEveryone() })

    const card = document.querySelector('[aria-hidden="true"] .bg-white')
    // Every warning on the page must be outside the card, checked per node rather
    // than by scanning text — a leak that duplicated a node would pass a text
    // scan of the page but not this.
    const warnings = screen.getAllByText(/Graded [AB] —/)
    expect(warnings.length).toBeGreaterThan(0)
    for (const warning of warnings) {
      expect(card.contains(warning)).toBe(false)
    }
  })
})

describe('it warns and never blocks', () => {
  it('leaves saving and sharing available with every child mismatched', async () => {
    await renderScreen({ tier: 'C', lineups: lineupWithEveryone() })

    // Same rule the over-picked count follows: show the coach what they may not
    // have noticed, then let them decide. A coach who means it must not have to
    // argue with the app.
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Share to WhatsApp' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
