import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Unit tests for src/screens/Dashboard.jsx (Task 13). useMemberships and both
// data modules are mocked, so this exercises only the screen's own behaviour —
// scoping both queries to the user's visible teams, choosing the next fixture,
// the countdown, the stat tiles, the upcoming list, the last result, the
// edit-gated quick actions, and the loading/empty/error contract. No network is
// ever reachable from this file.
//
// The clock is pinned by spying on Date.now rather than with
// vi.useFakeTimers(): RTL's waitFor does not detect Vitest's fake timers (its
// jestFakeTimersAreEnabled() check looks for a global `jest`), so fake timers
// make every findBy*/waitFor hang. Date.now is the only clock the Dashboard
// reads, and pinning it is what makes the countdown assertions exact instead
// of racing the real second hand.

const useMembershipsMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const upsertEventMock = vi.fn()
const deleteEventMock = vi.fn()
const listPlayersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// The greeting added on 6 Aug 2026 pulls in useAuth and the profile row, so
// this screen now needs both. Without them every test in this file fails at
// render — useAuth throws outside its provider, and getMyProfile would reach
// for the network.
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jay@example.com' } }),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: vi.fn().mockResolvedValue({
    id: 'profile-1',
    first_name: 'Jay',
    last_name: 'Muir',
  }),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
  // Task 14 wired the detail sheet's Edit/Delete footer and the event form
  // into this screen too. Stubbed so a mis-wiring would fail loudly here
  // rather than reaching an undefined import at call time.
  upsertEvent: (...args) => upsertEventMock(...args),
  deleteEvent: (...args) => deleteEventMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

// Only reached when a fixture row opens EventDetail; mocked so this file
// stays network-free either way. EventDetail's own behaviour is covered by
// tests/schedule.test.jsx.
vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))

// Import after vi.mock so this binds to the mocked modules.
import Dashboard from '../src/screens/Dashboard.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

// 2026-07-20T09:00 Abu Dhabi — the prototype's own demo "now"
// (design-system.md §4.11), so the fixture below reproduces the documented
// "4 Days / 8 Hrs / 0 Min" hero exactly.
const NOW = Date.parse('2026-07-20T05:00:00Z')

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_FIRST_XV = { id: 'team-1xv', name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_FIRST_XV, TEAM_U10] // deliberately unsorted; visibleTeams sorts

const COACH = [
  { id: 'm1', role: 'coach', team_id: 'team-u10' },
  { id: 'm2', role: 'coach', team_id: 'team-1xv' },
]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }]
const ADMIN = [{ id: 'm0', role: 'admin', team_id: null }]
const PLAYER = [{ id: 'm5', role: 'player', team_id: 'team-u10', player_id: 'p1' }]
// A coach row with no resolvable team. canEditTeam refuses it deliberately;
// a raw `role === 'coach'` check would grant on it.
const TEAMLESS_COACH = [{ id: 'm6', role: 'coach', team_id: null }]

// 2026-07-24T13:00Z = 17:00 Abu Dhabi = 4 days 8 hours after NOW.
const NEXT_MATCH = {
  id: 'e-match',
  team_id: 'team-1xv',
  type: 'match',
  opponent: 'Al Ain Amblers',
  starts_at: '2026-07-24T13:00:00Z',
  venue: 'Zayed Sports City',
  home: true,
  result_us: null,
  result_them: null,
}
// Sooner than the match, but training — the hero must still prefer the match.
const SOONER_TRAINING = {
  id: 'e-training',
  team_id: 'team-u10',
  type: 'training',
  title: 'U10 skills session',
  starts_at: '2026-07-21T15:30:00Z',
  venue: 'Zayed Sports City',
  result_us: null,
  result_them: null,
}
// Kicked off before NOW and nobody has entered a score. Schedule's Upcoming
// tab keeps this visible on purpose (it still needs a score), but the
// Dashboard asks a calendar question — what is coming up — so it must not
// appear here at all.
const PAST_UNSCORED = {
  id: 'e-stale',
  team_id: 'team-u10',
  type: 'match',
  opponent: 'Dubai Exiles',
  starts_at: '2026-07-15T13:00:00Z',
  result_us: null,
  result_them: null,
}
const LAST_RESULT = {
  id: 'e-result',
  team_id: 'team-1xv',
  type: 'match',
  opponent: 'Jebel Ali Dragons',
  starts_at: '2026-07-10T13:00:00Z',
  result_us: 31,
  result_them: 19,
}
const OLDER_RESULT = {
  id: 'e-older',
  team_id: 'team-u10',
  type: 'match',
  opponent: 'Sharjah Wanderers',
  starts_at: '2026-07-03T13:00:00Z',
  result_us: 10,
  result_them: 20,
}

// A training or a social can NEVER carry a score, so under a hasResult-based
// filter this one would sit at the top of "Upcoming" and inflate the
// fixtures-to-play count forever. It is the case that exposed the split
// between "still needs a score" and "still to come".
const PAST_SOCIAL = {
  id: 'e-social',
  team_id: 'team-u10',
  type: 'social',
  title: 'Season launch barbecue',
  starts_at: '2026-07-04T14:00:00Z',
  result_us: null,
  result_them: null,
}

const EVENTS = [
  NEXT_MATCH,
  SOONER_TRAINING,
  PAST_UNSCORED,
  PAST_SOCIAL,
  LAST_RESULT,
  OLDER_RESULT,
]

const PLAYERS = [
  { id: 'p1', team_id: 'team-u10', full_name: 'Amir Haddad', position: 'Prop' },
  { id: 'p2', team_id: 'team-u10', full_name: 'Bea Okoro', position: 'Wing' },
  { id: 'p3', team_id: 'team-1xv', full_name: 'Cal Fletcher', position: 'Lock' },
]

function membershipValue(memberships, teams = TEAMS) {
  return { memberships, teams, loading: false, error: null, reload: vi.fn() }
}

// Intl separates the time from AM/PM with U+202F (narrow no-break space) in
// current Node, which no plain-space assertion would match.
function heroText(node) {
  return node.textContent.replace(/[\u202f\u00a0]/g, ' ')
}

function renderDashboard() {
  return render(
    // Same future flags App.jsx sets on its BrowserRouter — without them
    // react-router logs two upgrade warnings per render into the suite's
    // stderr.
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Dashboard />
    </MemoryRouter>,
  )
}

let nowSpy
let setIntervalSpy

beforeEach(() => {
  // ⚠️ useMyProfile caches at MODULE level, keyed by user id, so without this
  // the first test's profile leaks into every later one and a test that
  // expects no name would still see "Jay".
  clearMyProfileCache()
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW)
  setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
  useMembershipsMock.mockReset()
  listEventsMock.mockReset()
  subscribeEventsMock.mockReset()
  listPlayersMock.mockReset()

  useMembershipsMock.mockReturnValue(membershipValue(COACH))
  listEventsMock.mockResolvedValue(EVENTS)
  listPlayersMock.mockResolvedValue(PLAYERS)
  subscribeEventsMock.mockReturnValue(() => {})
})

afterEach(() => {
  nowSpy.mockRestore()
  setIntervalSpy.mockRestore()
})

describe('Dashboard — loading, scoping and errors', () => {
  it('shows a spinner on first load and nothing else', () => {
    listEventsMock.mockReturnValue(new Promise(() => {}))
    listPlayersMock.mockReturnValue(new Promise(() => {}))

    renderDashboard()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText(/Quins vs/)).not.toBeInTheDocument()
  })

  it('asks for events and players scoped to the visible teams only', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(listEventsMock).toHaveBeenCalledWith({ teamIds: ['team-u10', 'team-1xv'] })
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['team-u10', 'team-1xv'] })
  })

  it('asks for no teams rather than everything when the scope is empty', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(COACH, []))
    // The real modules return [] for an empty teamIds array; the mocks must
    // too, or this would assert against data no such user could ever receive.
    listEventsMock.mockResolvedValue([])
    listPlayersMock.mockResolvedValue([])

    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)

    expect(listEventsMock).toHaveBeenCalledWith({ teamIds: [] })
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: [] })
  })

  it('renders an error region with a working retry', async () => {
    listEventsMock.mockRejectedValueOnce(new Error('Network unreachable'))

    renderDashboard()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Network unreachable/)).toBeInTheDocument()

    listEventsMock.mockResolvedValue(EVENTS)
    await userEvent.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByTestId('stat-players')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the rendered content on screen while a realtime refresh is in flight', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    const refresh = subscribeEventsMock.mock.calls[0][0]
    // Both refetches hang, so the screen is in the "loading again" state for
    // the whole of the assertions below.
    listEventsMock.mockReturnValue(new Promise(() => {}))
    listPlayersMock.mockReturnValue(new Promise(() => {}))
    await act(async () => {
      refresh()
    })

    expect(screen.getByTestId('next-fixture')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Dashboard — next fixture hero', () => {
  it('shows the next upcoming match, not the sooner training session', async () => {
    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    expect(within(hero).getByText('Quins vs Al Ain Amblers')).toBeInTheDocument()
    expect(within(hero).getByText(/Senior Men 1st XV/)).toBeInTheDocument()
    expect(within(hero).queryByText(/skills session/i)).not.toBeInTheDocument()
  })

  it('renders the kick-off in Abu Dhabi time, not the browser zone', async () => {
    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    // 2026-07-24T13:00Z is 17:00 in Abu Dhabi. Any browser-local rendering
    // would print a different hour under a non-UTC TZ.
    expect(heroText(hero)).toContain('5:00 PM')
    expect(heroText(hero)).toMatch(/Jul 24, 2026|24 Jul 2026/)
  })

  it('rolls the hero date over on Abu Dhabi\u2019s midnight, not the reader\u2019s', async () => {
    // 20:30 UTC on 24 Jul is 00:30 on 25 Jul in Abu Dhabi — a different
    // calendar day from UTC (the test runner's zone) and from New York. Only
    // a club-zone formatter prints the 25th and a 12:30 AM kick-off here, so
    // this assertion fails under any browser-local rendering whatever TZ the
    // suite runs in.
    listEventsMock.mockResolvedValue([
      { ...NEXT_MATCH, starts_at: '2026-07-24T20:30:00Z' },
    ])

    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    expect(heroText(hero)).toContain('12:30 AM')
    expect(heroText(hero)).toMatch(/Jul 25, 2026|25 Jul 2026/)
  })

  it('badges a home match as home and an away one as away', async () => {
    renderDashboard()
    expect(within(await screen.findByTestId('next-fixture')).getByText('Home')).toBeInTheDocument()
  })

  it('badges an away match as away', async () => {
    listEventsMock.mockResolvedValue([{ ...NEXT_MATCH, home: false }])

    renderDashboard()
    expect(within(await screen.findByTestId('next-fixture')).getByText('Away')).toBeInTheDocument()
  })

  it('shows no countdown', async () => {
    // Removed 6 Aug 2026 (Jay). Three boxes reading "24 / 7 / 54" is
    // precision nobody asked for when the next event is a training session
    // three weeks out, and the date and time sit directly above it.
    renderDashboard()
    await screen.findByTestId('next-fixture')

    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument()
    expect(screen.queryByTestId('countdown-days')).not.toBeInTheDocument()
  })

  it('still shows the date and time the countdown sat under', async () => {
    // ⚠️ The injected fault for the test above. The countdown and the
    // kick-off line were the same block; deleting one line too many took
    // `const date = eventDate(event)` with it and crashed the whole screen —
    // 34 tests red. This asserts the useful half survived.
    renderDashboard()
    const hero = await screen.findByTestId('next-fixture')

    expect(within(hero).getByText(/Jul 24, 2026/)).toBeInTheDocument()
    expect(within(hero).getByText(/5:00 PM/)).toBeInTheDocument()
  })

  it('does not call a training session a fixture', async () => {
    // ⚠️ FOUND ON PRODUCTION by Jay, 6 Aug 2026. The hero prefers the next
    // MATCH and falls back to any event when none is coming — correct — but
    // the eyebrow was the hardcoded string "Next fixture", so the club's only
    // upcoming event, a training session, was announced as a fixture.
    // "Fixture" means a match against another side; it is not a synonym for
    // "event", and a fixture is exactly what a parent scans for.
    listEventsMock.mockResolvedValue([SOONER_TRAINING])

    renderDashboard()
    const hero = await screen.findByTestId('next-fixture')

    expect(hero).toHaveTextContent(/next training/i)
    expect(hero).not.toHaveTextContent(/next fixture/i)
  })

  it('still calls a real match a fixture', async () => {
    // The injected fault for the test above: relabelling everything to
    // "Next up" would pass it while losing the word that matters.
    listEventsMock.mockResolvedValue([NEXT_MATCH])

    renderDashboard()
    expect(await screen.findByTestId('next-fixture')).toHaveTextContent(/next fixture/i)
  })

  it('falls back to the next event of any type when no match is upcoming', async () => {
    listEventsMock.mockResolvedValue([SOONER_TRAINING, LAST_RESULT])

    renderDashboard()

    const hero = await screen.findByTestId('next-fixture')
    expect(within(hero).getByText('U10 skills session')).toBeInTheDocument()
  })

  // ⚠️ THE CASE NOTHING COVERED, WHICH IS WHY IT SHIPPED. Every training in
  // this file is NAMED ("U10 skills session"), so the hero always had
  // something distinctive to put in its headline. In the real database every
  // session is titled "Training" — the obvious thing for a coach to type — and
  // the hero then read "NEXT TRAINING · U16B CONTACT" over "TRAINING" at 42px:
  // the largest type on the dashboard restating the smallest, directly above
  // it. Out of season, when the hero falls back from "next match" to "next
  // event of any type", that is the ordinary state and not an edge case.
  it('promotes the squad into the headline when the title only echoes the type', async () => {
    listEventsMock.mockResolvedValue([{ ...SOONER_TRAINING, title: 'Training' }])

    renderDashboard()
    const hero = await screen.findByTestId('next-fixture')

    // The squad is the most specific fact left, so it takes the headline...
    expect(within(hero).getByText('U10')).toBeInTheDocument()
    // ...and stops being repeated in the eyebrow beside "Next training".
    expect(hero).toHaveTextContent(/next training/i)
    expect(hero).not.toHaveTextContent(/next training · u10/i)
  })

  it('leaves a NAMED training alone — the squad stays in the eyebrow', async () => {
    // The other half of the guard. Without this, "always promote the squad"
    // would pass the test above while throwing away a title a coach wrote.
    listEventsMock.mockResolvedValue([SOONER_TRAINING])

    renderDashboard()
    const hero = await screen.findByTestId('next-fixture')

    expect(within(hero).getByText('U10 skills session')).toBeInTheDocument()
    expect(hero).toHaveTextContent(/next training · u10/i)
  })

  it('keeps the squad in the eyebrow for a match, whose headline is the opponent', async () => {
    listEventsMock.mockResolvedValue([NEXT_MATCH])

    renderDashboard()
    const hero = await screen.findByTestId('next-fixture')

    // NEXT_MATCH is on team-1xv, not U10 — the squad still rides in the
    // eyebrow because the headline already has the opponent to carry.
    expect(hero).toHaveTextContent(/next fixture · senior men 1st xv/i)
    expect(within(hero).getByText('Quins vs Al Ain Amblers')).toBeInTheDocument()
  })

  it('never picks a fixture that has already kicked off, even unscored', async () => {
    listEventsMock.mockResolvedValue([PAST_UNSCORED, LAST_RESULT])

    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)

    // A countdown to an instant that has already passed is meaningless.
    expect(screen.queryByTestId('next-fixture')).not.toBeInTheDocument()
  })

  it('runs no once-a-minute tick at all any more', async () => {
    // Filtered to the old countdown's 60s delay so nothing React or RTL
    // schedules internally can make this pass by accident.
    const ticks = () =>
      setIntervalSpy.mock.calls.filter(([, delay]) => delay === 60 * 1000).length

    // ⚠️ NOW ZERO EVEN WITH A HERO. The timer existed only to keep the
    // countdown honest; with the countdown gone, nothing on this screen
    // changes minute by minute, so a phone left on the dashboard should not
    // be re-rendering the whole thing once a minute for no visible effect.
    renderDashboard()
    await screen.findByTestId('next-fixture')
    expect(ticks()).toBe(0)
  })

  it('hides the hero entirely when there is nothing upcoming', async () => {
    listEventsMock.mockResolvedValue([LAST_RESULT])

    renderDashboard()
    await screen.findByText(/no upcoming fixtures/i)

    expect(screen.queryByTestId('next-fixture')).not.toBeInTheDocument()
    expect(screen.queryByTestId('countdown')).not.toBeInTheDocument()
  })
})

describe('Dashboard — stats', () => {
  it('counts players in scope, fixtures still to play, and matches needing a score', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByTestId('stat-players')).toHaveTextContent('3')
    // ⚠️ ONE, NOT TWO — REPOINTED 10 Aug 2026, AND THIS TEST WAS PINNING THE
    // BUG. It read '2' and its own comment explained why: "Only NEXT_MATCH and
    // SOONER_TRAINING are still to come." A training is not a fixture. The
    // tile is labelled "Fixtures to play" and this codebase had already
    // written the rule down — see nextEventLabel in src/lib/eventFormat.js:
    // "'Fixture' is not a loose synonym for 'event' in rugby". Live, a squad
    // training twice a week read "26 fixtures to play" with no match entered.
    // NEXT_MATCH is the only one still to come.
    expect(screen.getByTestId('stat-fixtures')).toHaveTextContent('1')

    // ⚠️ REPLACED "AGE GROUPS" (which asserted '2') ON 10 Aug 2026. That tile
    // counted `scopedTeams.length` — how the club is CONFIGURED — at 42px in
    // the loudest element on the screen, and it was the one number on the band
    // nobody could act on.
    //
    // ONE, and the fixture list is built so that only one thing can produce it:
    //   PAST_UNSCORED  past match, no score   <- the only one that counts
    //   PAST_SOCIAL    past, but a social     <- cannot carry a score
    //   LAST_RESULT    past match, scored
    //   OLDER_RESULT   past match, scored
    //   NEXT_MATCH     a match, but not played yet
    // So a count of 2 means socials are being counted, 3 means scored matches
    // are, and 4 means it is not filtering at all.
    expect(screen.getByTestId('stat-needs-score')).toHaveTextContent('1')
  })

  it('counts nothing when every played match has a score', async () => {
    // ⚠️ THE INJECTED FAULT FOR THE TEST ABOVE. Without this, a tile hard-coded
    // to "1" — or one counting any single past event — passes there and is
    // wrong everywhere. Zero is a real answer on this band: "nothing is waiting
    // on you" is what a management summary should be able to say.
    listEventsMock.mockResolvedValue([NEXT_MATCH, SOONER_TRAINING, PAST_SOCIAL, LAST_RESULT])

    renderDashboard()
    await screen.findByTestId('stat-needs-score')

    expect(screen.getByTestId('stat-needs-score')).toHaveTextContent('0')
  })

  it('does not count a match that has not kicked off yet', async () => {
    // The boundary. `<= now` and not `< now`: a match starting this instant has
    // not been played, so nobody owes a score for it.
    listEventsMock.mockResolvedValue([NEXT_MATCH])

    renderDashboard()
    await screen.findByTestId('stat-needs-score')

    expect(screen.getByTestId('stat-needs-score')).toHaveTextContent('0')
  })

  // ⚠️ SPACING, PINNED AS A CLASS TOKEN. jsdom applies no CSS, so nothing
  // here can measure the gap — this asserts the token the gap depends on, the
  // same approach the masthead breakpoint and PhoneInput overlap regressions
  // use.
  //
  // The defect this guards: every other block on the dashboard takes its top
  // gap from BlockTitle's mt-[18px], and the stat band is the only block with
  // no heading. It was silently living off the fixture hero's mb-4 until the
  // fortnight strip was inserted between them, at which point the band sat
  // flush against the strip's card with the two touching. Nothing failed —
  // that is exactly why it needs a token assertion rather than trusting the
  // layout to stay accidentally correct.
  it('gives the stat band its own top gap, since no BlockTitle supplies one', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    // The band is the tile's grid parent's parent (tile -> grid -> band root).
    const band = screen.getByTestId('stat-players').parentElement.parentElement
    expect(band.className).toContain('mt-[18px]')
    // And it really is the band, not some other ancestor that happens to
    // carry a margin — without this the assertion above would pass on any
    // wrapper.
    expect(band.className).toContain('rounded-card')
  })

  it('labels the tiles for the whole club when the user is an admin', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(ADMIN))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByTestId('stat-players')).toHaveTextContent(/registered players/i)
  })

  it('labels the tiles as the user’s own slice when they are not an admin', async () => {
    // Default role here is COACH — an editor, so the band still renders.
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(screen.getByTestId('stat-players')).toHaveTextContent(/players in view/i)
  })

  // ⚠️ THE ONE LABEL THAT DOES NOT VARY BY ROLE, and deliberately so. "Age
  // groups"/"Your groups" changed wording because a count of the whole club
  // and a count of your own squads are different facts. A match with no score
  // is the same fact either way — it is scoped by what the reader can see, not
  // reworded — so an admin and a coach get the same words.
  it('labels the score backlog the same for everyone who can see it', async () => {
    for (const memberships of [ADMIN, COACH]) {
      useMembershipsMock.mockReturnValue(membershipValue(memberships))
      const { unmount } = renderDashboard()
      expect(await screen.findByTestId('stat-needs-score')).toHaveTextContent(/needs a score/i)
      unmount()
    }
  })

  // Staff only, from 6 Aug 2026. Squad size, fixtures left and group count are
  // a management summary; a parent has one child and knows all three already.
  describe('is staff-only', () => {
    it.each([
      ['a parent', PARENT],
      ['a player', PLAYER],
    ])('hides the whole band from %s', async (_label, memberships) => {
      useMembershipsMock.mockReturnValue(membershipValue(memberships))

      renderDashboard()
      // Wait for a sibling that always renders, so this cannot pass simply by
      // asserting absence before the screen has loaded anything at all.
      await screen.findByTestId('quick-actions')

      expect(screen.queryByTestId('stat-players')).not.toBeInTheDocument()
      expect(screen.queryByTestId('stat-fixtures')).not.toBeInTheDocument()
      expect(screen.queryByTestId('stat-needs-score')).not.toBeInTheDocument()
    })

    it.each([
      ['a coach', COACH],
      ['an admin', ADMIN],
    ])('still shows it to %s', async (_label, memberships) => {
      // ⚠️ The injected fault for the pair above: without these, deleting the
      // band outright would pass every hiding test.
      useMembershipsMock.mockReturnValue(membershipValue(memberships))

      renderDashboard()
      expect(await screen.findByTestId('stat-players')).toBeInTheDocument()
      expect(screen.getByTestId('stat-fixtures')).toBeInTheDocument()
      expect(screen.getByTestId('stat-needs-score')).toBeInTheDocument()
    })

    it('leaves the rest of the parent home screen intact', async () => {
      // Removing the band must not take the fixture hero or the upcoming list
      // with it — those are the reason a parent opens this screen.
      useMembershipsMock.mockReturnValue(membershipValue(PARENT))

      renderDashboard()
      expect(await screen.findByTestId('upcoming-list')).toBeInTheDocument()
      expect(screen.getByTestId('quick-actions')).toBeInTheDocument()
    })
  })
})

describe('Dashboard — upcoming list and last result', () => {
  it('lists the fixtures still to play, soonest first, capped at five', async () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `e-${index}`,
      team_id: 'team-u10',
      type: 'training',
      title: `Session ${index}`,
      starts_at: new Date(NOW + (index + 1) * 86400000).toISOString(),
      result_us: null,
      result_them: null,
    }))
    listEventsMock.mockResolvedValue([...many].reverse())

    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    const titles = within(list)
      .getAllByTestId('fixture-title')
      .map((node) => node.textContent)
    expect(titles).toEqual(['Session 0', 'Session 1', 'Session 2', 'Session 3', 'Session 4'])
  })

  // Task 14. The dashboard opens the same EventDetail as the schedule, so it
  // has to pass the same canEdit/onEdit wiring — without it a coach tapping a
  // fixture here is told, untruthfully, that the event is read-only.
  it('gives a coach the Edit and Delete actions in the detail sheet', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    await userEvent.click(within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('gives a parent no actions and no read-only banner in their place', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    await userEvent.click(within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    // The absence of an Edit button IS the message. Saying "read-only" as
    // well told people something they could already see (4 Aug 2026).
    expect(within(dialog).queryByText(/read-only/i)).toBeNull()
  })

  it('opens the edit form from the detail sheet', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    await userEvent.click(within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]'))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit event' })).toBeInTheDocument()
  })

  it('opens the event detail sheet when a fixture row is tapped', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    const row = within(list).getByText('U10 skills session').closest('[data-testid="fixture-row"]')
    await userEvent.click(row)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/U10 skills session/)).toBeInTheDocument()
  })

  // The Dashboard asks "what's coming up", not "what still needs a score".
  // Those coincide for matches and diverge completely for trainings and
  // socials, which can never be scored — so a hasResult-based filter left
  // stale ones on the list and in the count indefinitely.
  it('leaves stale unscored events out of both the list and the count', async () => {
    renderDashboard()

    const list = await screen.findByTestId('upcoming-list')
    const titles = within(list)
      .getAllByTestId('fixture-title')
      .map((node) => node.textContent)

    // Both future events, nothing else.
    expect(titles).toEqual(['U10 skills session', 'Quins vs Al Ain Amblers'])
    // A week-old social, which can never carry a score…
    expect(titles).not.toContain('Season launch barbecue')
    // …and a match played last week that nobody has scored yet. That one is
    // still on Schedule's Upcoming tab by design; it is not this screen's
    // question.
    expect(titles).not.toContain('Quins vs Dubai Exiles')

    // ⚠️ The LIST above is still every event type — that is this test's point
    // and it is unchanged. Only the COUNT narrowed to matches (10 Aug 2026):
    // of the two future events, "U10 skills session" is a training, so one
    // fixture is still to play. See the note on the stats test above.
    expect(screen.getByTestId('stat-fixtures')).toHaveTextContent('1')
  })

  it('shows the most recent scored fixture as the last result', async () => {
    renderDashboard()

    const block = await screen.findByTestId('last-result')
    expect(within(block).getByText('Quins vs Jebel Ali Dragons')).toBeInTheDocument()
    expect(within(block).getByText('31–19')).toBeInTheDocument()
    expect(within(block).queryByText(/Sharjah Wanderers/)).not.toBeInTheDocument()
  })

  it('says so when no scores have been entered yet', async () => {
    listEventsMock.mockResolvedValue([NEXT_MATCH])

    renderDashboard()

    const block = await screen.findByTestId('last-result')
    expect(within(block).getByText(/no results yet/i)).toBeInTheDocument()
  })
})

describe('Dashboard — quick actions', () => {
  // The card holds exactly the actions a role may take. Asserting on the full
  // set, not on one button at a time, is what makes these fail if a
  // not-yet-built action is ever added back: getByRole('button') matches a
  // disabled button just as happily as an enabled one, so "the add button is
  // present" proves nothing about whether it works.
  const actionNames = () =>
    within(screen.getByTestId('quick-actions'))
      .getAllByRole('link')
      .concat(within(screen.getByTestId('quick-actions')).queryAllByRole('button'))
      .map((node) => node.textContent.trim())

  it('offers a coach navigation only — no add actions until Tasks 14/15 build them', async () => {
    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(actionNames()).toEqual(['View full schedule', 'View team list'])
  })

  it('offers an admin the same, and no read-only explanation', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(ADMIN))

    renderDashboard()
    await screen.findByTestId('stat-players')

    expect(actionNames()).toEqual(['View full schedule', 'View team list'])
    expect(screen.queryByText(/you're signed in as a/i)).not.toBeInTheDocument()
  })

  it('offers a parent navigation only, and says why', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))

    renderDashboard()
    // ⚠️ Waits on quick-actions, NOT stat-players. The stat band is staff-only
    // from 6 Aug 2026, so for every read-only role in this block it never
    // appears and a findByTestId('stat-players') just times out. These tests
    // were using the band as a proxy for "the screen has loaded"; the thing
    // they actually assert on is the right signal.
    await screen.findByTestId('quick-actions')

    expect(actionNames()).toEqual(['View schedule', 'View team list'])
    expect(screen.getByText(/signed in as a parent/i)).toBeInTheDocument()
  })

  // A player is one of the four supported roles, and used to be told they
  // were a parent — twelve lines below a scope note reading "Player view".
  it('calls a player a player, not a parent', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PLAYER))

    renderDashboard()
    await screen.findByTestId('quick-actions')

    expect(actionNames()).toEqual(['View schedule', 'View team list'])
    expect(screen.getByText(/signed in as a player/i)).toBeInTheDocument()
    expect(screen.queryByText(/signed in as a parent/i)).not.toBeInTheDocument()
  })

  it('treats a coach with no resolvable team as read-only', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(TEAMLESS_COACH))
    listEventsMock.mockResolvedValue([])
    listPlayersMock.mockResolvedValue([])

    renderDashboard()
    await screen.findByTestId('quick-actions')

    // canEditTeam refuses a null team_id, so this coach gets the read-only
    // card rather than an action pointing at a form with no squad to pick.
    expect(actionNames()).toEqual(['View schedule', 'View team list'])
    expect(screen.getByText(/signed in as a coach/i)).toBeInTheDocument()
  })

  it('links to the full schedule and the team list', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))

    renderDashboard()
    await screen.findByTestId('quick-actions')

    expect(screen.getByRole('link', { name: /schedule/i })).toHaveAttribute('href', '/schedule')
    expect(screen.getByRole('link', { name: /team list/i })).toHaveAttribute('href', '/roster')
  })
})

// ── Mobile spacing above Quick actions ─────────────────────────────────
//
// Jay, from a phone, 9 Aug 2026: "the training event overlaps with the quick
// actions area".
//
// ⚠️ jsdom APPLIES NO CSS AND HAS NO LAYOUT, so nothing in this file can see
// the bug or prove the fix. What follows pins the CLASS TOKENS that produce
// the behaviour once real CSS applies, and the reasoning lives here so a
// future tidy-up that removes them has to argue with it.
//
// THE MEASUREMENT, taken with Playwright at 390px against the harness:
//     before   gap above the "Quick actions" heading = 0px
//     after    gap = 18px, matching every other block on the screen
//     desktop  unchanged either way
//
// THE CAUSE. BlockTitle carries `first:mt-0` so the two COLUMN headings line
// up when the dashboard is side by side. "Quick actions" is the first child of
// the second column, so it takes that reset — right on desktop, wrong once the
// columns stack, where it left the heading flush against the Upcoming card.
describe('Dashboard — the second column needs its own gap on mobile', () => {
  it('separates the quick-actions column from Upcoming below the desktop breakpoint', async () => {
    renderDashboard()
    const quickCard = await screen.findByTestId('quick-actions')

    // The wrapper is the heading's grandparent: Card -> div(column).
    const column = quickCard.parentElement
    const classes = column.className

    // ⚠️ BOTH TOKENS OR NEITHER. mt-[18px] alone would double the gap on
    // desktop, where the columns are side by side and first:mt-0 already
    // handles it; desktop:mt-0 alone does nothing.
    expect(classes).toContain('mt-[18px]')
    expect(classes).toContain('desktop:mt-0')
  })
})
