import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// RCM match sheets — Project 2. The editor and the Club Youth Manager's list.
//
// PROCESS ZONE. America/New_York, like the other fixture-writing suites: the
// deadline rule and the rendered kick-off are both time-of-day facts, and a
// zone bug is invisible under a UTC runner.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const useMembershipsMock = vi.fn()
const useMyProfileMock = vi.fn()
const upsertEventMock = vi.fn()
const getEventMock = vi.fn()
const listEventsMock = vi.fn()
const listPlayersMock = vi.fn()
const getMatchSheetMock = vi.fn()
const listMatchSheetsForMock = vi.fn()
const saveMatchSheetMock = vi.fn()
const saveSlotsMock = vi.fn()
const saveCardsMock = vi.fn()
const setStatusMock = vi.fn()
const listLineupsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))
// ⚠️ MOCKED FOR THE PROVIDER, NOT FOR THE VALUE. useMyProfile calls useAuth,
// which throws outside an AuthProvider — so the sheet cannot render at all
// without this, and every unrelated test in this file would fail with an error
// naming auth rather than the manager prefill that pulled it in.
vi.mock('../src/lib/useMyProfile.js', () => ({
  default: () => useMyProfileMock(),
}))
vi.mock('../src/data/events.js', () => ({
  getEvent: (...a) => getEventMock(...a),
  listEvents: (...a) => listEventsMock(...a),
  subscribeEvents: () => () => {},
  upsertEvent: (...a) => upsertEventMock(...a),
  insertEvents: async () => [],
  deleteEvent: async () => {},
  countSeriesFrom: async () => 0,
  deleteSeriesFrom: async () => {},
}))
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: async () => [],
}))
// The lineup the sheet seeds its 22 boxes from (16 Aug 2026). Mocked for the
// same reason players.js is: the real module reaches Supabase at import time.
vi.mock('../src/data/lineups.js', () => ({
  listLineups: (...a) => listLineupsMock(...a),
  createLineup: async () => ({}),
  updateLineup: async () => ({}),
  saveLineupPlayers: async () => [],
  deleteLineup: async () => {},
}))
vi.mock('../src/data/matchSheets.js', async () => {
  const actual = await vi.importActual('../src/data/matchSheets.js')
  return {
    SLOT_COUNT: actual.SLOT_COUNT,
    getMatchSheet: (...a) => getMatchSheetMock(...a),
    listMatchSheetsFor: (...a) => listMatchSheetsForMock(...a),
    saveMatchSheet: (...a) => saveMatchSheetMock(...a),
    saveMatchSheetSlots: (...a) => saveSlotsMock(...a),
    saveMatchSheetCards: (...a) => saveCardsMock(...a),
    setMatchSheetStatus: (...a) => setStatusMock(...a),
  }
})

import MatchSheet from '../src/screens/MatchSheet.jsx'
import YouthDashboard from '../src/screens/YouthDashboard.jsx'

const CLUB = '00000000-0000-0000-0000-0000000000ad'
const U14B = { id: 't-u14b', club_id: CLUB, name: 'U14B Contact', sort_order: 9 }
const U18B = { id: 't-u18b', club_id: CLUB, name: 'U18B Contact', sort_order: 13 }

const MATCH = {
  id: 'e-1',
  club_id: CLUB,
  team_id: 't-u14b',
  type: 'match',
  opponent: 'Dubai Exiles',
  home: true,
  venue: 'Zayed Sports City, Abu Dhabi',
  starts_at: '2026-09-12T05:00:00.000Z',
  ends_at: '2026-09-12T06:30:00.000Z',
  round: 4,
  league_team_id: 'lt-2',
  league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
  team: U14B,
}

const COACH = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u14b' }]
const PARENT = [{ id: 'm-p', role: 'parent', status: 'active', team_id: 't-u14b', player_id: 'p1' }]
const ADMIN_YOUTH = [
  { id: 'm-a', role: 'admin', status: 'active', team_id: null, club_id: CLUB, admin_rights: ['youth'] },
]

function mount(ui, { memberships = COACH, teams = [U14B, U18B], path = '/match-sheet/e-1' } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships,
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/match-sheet/:eventId" element={ui} />
        <Route path="/admin/youth" element={ui} />
        <Route path="/schedule" element={<div>Schedule marker</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
  // No profile by default: the prefill is a feature and must be asked for
  // explicitly, so the tests that are not about it see empty boxes.
  useMyProfileMock.mockReturnValue({ profile: null, firstName: '' })
  upsertEventMock.mockImplementation(async (patch) => ({ ...patch }))
  getEventMock.mockResolvedValue(MATCH)
  listPlayersMock.mockResolvedValue([
    { id: 'p1', team_id: 't-u14b', full_name: 'Zara Ali' },
    { id: 'p2', team_id: 't-u14b', full_name: 'Tom Fletcher' },
  ])
  getMatchSheetMock.mockResolvedValue(null)
  // ⚠️ NO LINEUP BY DEFAULT. The seeding is a feature and must be asked for
  // explicitly, exactly like the manager prefill above — every test that is not
  // about it must still see 22 empty boxes, or a name appearing on the form
  // would stop being evidence of anything.
  listLineupsMock.mockResolvedValue([])
  listMatchSheetsForMock.mockResolvedValue(new Map())
  // ⚠️ THE EMBED IS PART OF THE RETURN because saveMatchSheet asks for it. A
  // mock that omits it would blank the TEAM line on save and no test would say
  // why — which is the exact failure the embed was added to prevent.
  saveMatchSheetMock.mockResolvedValue({
    id: 'ms-1',
    status: 'draft',
    league_team_id: 'lt-2',
    league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
  })
  saveSlotsMock.mockResolvedValue([])
  saveCardsMock.mockResolvedValue([])
  setStatusMock.mockResolvedValue({ id: 'ms-1', status: 'complete' })
  listEventsMock.mockResolvedValue([MATCH])
})

describe('MatchSheet — the form', () => {
  it('auto-populates the fixture block from the event', async () => {
    mount(<MatchSheet />)
    expect(await screen.findByRole('heading', { name: /official match result sheet/i })).toBeInTheDocument()
    // ⚠️ CLUB IS THE CLUB; HOME TEAM IS THE LEAGUE TEAM. Taken from the real
    // form Jay supplied: its filled example reads CLUB: AD Harlequins and
    // HOME TEAM: ADHQ2. An earlier guess had the club name in both, which is
    // not what RCM asks for — the league team is what identifies the side.
    expect(screen.getAllByText(/AD Harlequins/)).toHaveLength(1)
    // TEAM: is the LEAGUE team, which is the whole reason Project 1 blocked this.
    // It appears twice: the TEAM: line and the HOME TEAM cell.
    //
    // ⚠️ SCOPED TO THE FACSIMILE SINCE 12 Aug 2026, and the scoping is the
    // assertion now. The Score card above the form also names the league team,
    // as a column header — so an unscoped count of 2 would have started failing
    // for a reason that has nothing to do with what RCM receives. What this
    // test is about is the PHOTOGRAPHED form, which is exactly what the testid
    // marks out.
    const form = within(screen.getByTestId('match-sheet-facsimile'))
    expect(form.getAllByText('ADHQ2')).toHaveLength(2)
    expect(form.getByText('Dubai Exiles')).toBeInTheDocument()
    expect(form.getByText('Zayed Sports City, Abu Dhabi')).toBeInTheDocument()
  })

  it('⚠️ puts OUR score on the right when we played AWAY', async () => {
    // The form's two score pairs are POSITIONAL — home on the left, away on the
    // right — while the database stores us/them. An away fixture is where the
    // two disagree, and it is the case a naive mapping gets wrong.
    //
    // ⚠️ REWRITTEN 12 Aug 2026 AND IT IS STILL THE SAME ASSERTION. The boxes
    // used to be typed into directly; the score is now DERIVED from the
    // components, so the test enters tries and reads the derived cell. What is
    // being pinned — that OUR number lands in the AWAY pair — has not changed,
    // and it would still be wrong in exactly the same way.
    getEventMock.mockResolvedValue({ ...MATCH, home: false })
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })

    // U14B: tries, conversions, penalties and drop goals. 5 tries + 3
    // conversions = 31, which is the number the old version of this test typed.
    await user.type(screen.getByLabelText('Tries, ADHQ2'), '5')
    await user.type(screen.getByLabelText('Conversions, ADHQ2'), '3')

    // We were away, so the AWAY pair is ours and the HOME pair is theirs.
    expect(screen.getByTestId('sheet-away-score')).toHaveTextContent('31')
    expect(screen.getByTestId('sheet-away-tries')).toHaveTextContent('5')
    expect(screen.getByTestId('sheet-home-score')).toBeEmptyDOMElement()

    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
    // ⚠️ ON THE FIXTURE, NOT ON THE SHEET. Jay ruled one score, on the fixture.
    expect(upsertEventMock.mock.calls[0][0]).toMatchObject({
      id: 'e-1',
      tries_us: 5,
      conversions_us: 3,
      penalties_us: null,
      drops_us: null,
      tries_them: null,
    })
    expect(saveMatchSheetMock.mock.calls[0][0]).not.toHaveProperty('score_us')
  })

  describe('the score, from the components', () => {
    it('⚠️ offers only what the age band may score — U12 gets no penalties', async () => {
      const U12 = { id: 't-u12', club_id: CLUB, name: 'U12 Mixed Contact', sort_order: 7 }
      getEventMock.mockResolvedValue({ ...MATCH, team_id: 't-u12', team: U12 })
      mount(<MatchSheet />, { memberships: [{ ...COACH[0], team_id: 't-u12' }], teams: [U12] })
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByLabelText('Tries, ADHQ2')).toBeInTheDocument()
      expect(screen.getByLabelText('Conversions, ADHQ2')).toBeInTheDocument()
      // A penalty at U12 is a tap-and-play, so there is no kick at goal to record.
      expect(screen.queryByLabelText('Penalties, ADHQ2')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Drop goals, ADHQ2')).not.toBeInTheDocument()
    })

    it("⚠️ honours the CLUB'S override, not the squad's name", async () => {
      // The whole reason teams.scoring_kinds is a column: a side entered in a
      // competition that allows conversions gets them, without a deploy and
      // without renaming the squad. U11's default is tries only, so the
      // conversions box appearing can only be the override.
      //
      // ⚠️ U11, AND IT WAS U10 UNTIL 15 Aug 2026. U10 and below have no RCM
      // sheet at all now (src/lib/minis.js — the form starts at "U11 to u16"),
      // so this screen answers a U10 fixture with "no match sheet for this age
      // group" and there is no scoring row to assert on. The override rule this
      // test is actually about is unchanged; only the squad it is asked of is.
      const U11 = {
        id: 't-u11',
        club_id: CLUB,
        name: 'U11 Mixed Contact',
        scoring_kinds: ['tries', 'conversions'],
      }
      getEventMock.mockResolvedValue({ ...MATCH, team_id: 't-u11', team: U11 })
      mount(<MatchSheet />, { memberships: [{ ...COACH[0], team_id: 't-u11' }], teams: [U11] })
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByLabelText('Conversions, ADHQ2')).toBeInTheDocument()
      expect(screen.getByText(/set for this squad on the club tab/i)).toBeInTheDocument()
    })

    it('⚠️ the FINAL SCORE box cannot be typed into', async () => {
      // The point of the whole exercise: the total on a governing body's form
      // cannot disagree with the tries and kicks printed beside it.
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.queryByLabelText('Home final score')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Away final score')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Home tries')).not.toBeInTheDocument()
    })

    it('⚠️ a hand-typed result with NO components is shown, not blanked', async () => {
      // The trap the database trigger exists to avoid, on the screen side: a
      // fixture whose 22-12 was typed before components existed must not read
      // as unplayed, and must not read as 0-0.
      getEventMock.mockResolvedValue({ ...MATCH, result_us: 22, result_them: 12 })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByTestId('sheet-home-score')).toHaveTextContent('22')
      expect(screen.getByTestId('sheet-away-score')).toHaveTextContent('12')
      expect(screen.getByTestId('sheet-home-tries')).toBeEmptyDOMElement()
      expect(screen.getByText(/entered on the fixture itself/i)).toBeInTheDocument()
    })

    it('⚠️ a recorded ZERO is not the same as not recorded', async () => {
      // 0 tries is an answer; a blank box is the absence of one. Rendering the
      // first as blank would erase a fact a coach deliberately recorded.
      getEventMock.mockResolvedValue({ ...MATCH, tries_us: 0, result_us: 0 })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByLabelText('Tries, ADHQ2')).toHaveValue(0)
      expect(screen.getByTestId('sheet-home-score')).toHaveTextContent('0')
      // The opposition's side has nothing recorded, so its boxes stay empty.
      expect(screen.getByLabelText('Tries, Dubai Exiles')).toHaveValue(null)
    })

    it('⚠️ says which rules it applied on a tournament fixture', async () => {
      getEventMock.mockResolvedValue({ ...MATCH, competition_type: 'tournament', competition: 'Dubai 7s' })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })
      expect(screen.getByText(/if it ran its own scoring/i)).toBeInTheDocument()
      expect(screen.queryByTestId('match-sheet-competition-clash')).not.toBeInTheDocument()
    })

    it('⚠️ surfaces a tournament with a league-sounding name, and does not guess', async () => {
      // Already in this data once: competition_type 'tournament' with
      // competition 'UAE Youth League'. It left the fixture with no league team
      // and a wrong TEAM box, and only the coach knows which half is wrong.
      getEventMock.mockResolvedValue({
        ...MATCH,
        competition_type: 'tournament',
        competition: 'UAE Youth League',
      })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })
      expect(screen.getByTestId('match-sheet-competition-clash')).toBeInTheDocument()
    })

    it('⚠️ writes the FIXTURE before the sheet, so a failure leaves the score right', async () => {
      saveMatchSheetMock.mockRejectedValueOnce(new Error('nope'))
      const { user } = mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      await user.type(screen.getByLabelText('Tries, ADHQ2'), '2')
      await user.click(screen.getByRole('button', { name: /save draft/i }))

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('nope'))
      expect(upsertEventMock).toHaveBeenCalled()
    })

    it('⚠️ clearing every box sends nulls, so the trigger leaves the result alone', async () => {
      getEventMock.mockResolvedValue({ ...MATCH, tries_us: 3, result_us: 15 })
      const { user } = mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      await user.clear(screen.getByLabelText('Tries, ADHQ2'))
      await user.click(screen.getByRole('button', { name: /save draft/i }))

      await waitFor(() => expect(upsertEventMock).toHaveBeenCalled())
      expect(upsertEventMock.mock.calls[0][0]).toMatchObject({ tries_us: null })
    })
  })

  describe('the person filling it in', () => {
    it('defaults the name and phone from the signed-in profile', async () => {
      useMyProfileMock.mockReturnValue({
        profile: { full_name: 'Sam Okafor', phone: '+971 50 123 4567' },
        firstName: 'Sam',
      })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      // ⚠️ waitFor, NOT A SYNCHRONOUS ASSERTION — and this went green locally
      // and RED IN CI before it was fixed, on 12 Aug 2026. The prefill is an
      // effect that fires after the sheet's own load commits, so the value
      // lands on a SECOND render. findByRole only waits for the heading, which
      // is painted by the first; on a fast enough runner the assertion beat the
      // prefill by one commit. The test was racy, not the screen.
      await waitFor(() =>
        expect(screen.getByLabelText('Team manager')).toHaveValue('Sam Okafor'),
      )
      expect(screen.getByLabelText('Team manager phone')).toHaveValue('+971 50 123 4567')
    })

    it('⚠️ DEFAULT, NOT LOCK — a filed sheet keeps the name it was filed with', async () => {
      // A manager fills the form and a coach signs it. Re-signing a sheet
      // because somebody else opened it is the failure this guards.
      getMatchSheetMock.mockResolvedValue({
        id: 'ms-1',
        event_id: 'e-1',
        status: 'draft',
        manager_name: 'Priya Nair',
        manager_phone: '+971 55 000 0000',
        league_team: MATCH.league_team,
        slots: [],
        cards: [],
      })
      useMyProfileMock.mockReturnValue({
        profile: { full_name: 'Sam Okafor', phone: '+971 50 123 4567' },
        firstName: 'Sam',
      })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByLabelText('Team manager')).toHaveValue('Priya Nair')
      expect(screen.getByLabelText('Team manager phone')).toHaveValue('+971 55 000 0000')
    })

    it('saves the phone onto the sheet', async () => {
      const { user } = mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      await user.type(screen.getByLabelText('Team manager phone'), '0501112222')
      await user.click(screen.getByRole('button', { name: /save draft/i }))

      await waitFor(() => expect(saveMatchSheetMock).toHaveBeenCalled())
      expect(saveMatchSheetMock.mock.calls[0][0]).toMatchObject({ manager_phone: '0501112222' })
    })
  })

  it('reproduces the discipline grid the form actually has', async () => {
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    expect(screen.getByText(/DISCIPLINE – RED OR YELLOW CARDS/i)).toBeInTheDocument()
    for (const heading of ['HALF', 'TIME', 'R/Y', 'NO', 'FULL NAME', 'REASON']) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
    // ⚠️ R/Y is a SELECT: the colour CHECK constraint accepts only 'yellow' or
    // 'red', so a typed "yel" would fail the save on a field somebody thought
    // they had filled in correctly.
    expect(screen.getByLabelText('Card 1 colour').tagName).toBe('SELECT')
  })

  it('⚠️ offers 22 slots, because the form has 22 and a short squad is normal', async () => {
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    for (const slot of [1, 15, 16, 22]) {
      expect(screen.getByLabelText(`Player ${slot}`)).toBeInTheDocument()
    }
    expect(screen.queryByLabelText('Player 23')).not.toBeInTheDocument()
  })

  it('⚠️ every slot carries an FR tick — it is a SAFETY declaration', async () => {
    // The FR column tells the referee which replacements can cover the front
    // row. It is not decoration and must not be dropped as clutter.
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    expect(screen.getByLabelText('Front row cover for player 16')).toBeInTheDocument()
  })

  it('⚠️ offers the SQUAD\'S roster, not the club\'s', async () => {
    // A club-wide roster here would let a coach file a player from another age
    // group — which the governing body receives as a wrong team sheet.
    mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    expect(listPlayersMock).toHaveBeenCalledWith({ teamIds: ['t-u14b'] })
  })

  it('links a typed name back to the roster when it matches exactly', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.type(screen.getByLabelText('Player 1'), 'Zara Ali')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveSlotsMock).toHaveBeenCalled())
    const written = saveSlotsMock.mock.calls[0][1].find((row) => row.slot === 1)
    expect(written).toMatchObject({ full_name: 'Zara Ali', player_id: 'p1' })
  })

  it('⚠️ accepts a name that is NOT on the roster, with a null player_id', async () => {
    // There is deliberately no roster import, so a coach must be able to write
    // somebody who has not been onboarded yet. The name is what gets filed.
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.type(screen.getByLabelText('Player 2'), 'Not On The Roster')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveSlotsMock).toHaveBeenCalled())
    const written = saveSlotsMock.mock.calls[0][1].find((row) => row.slot === 2)
    expect(written).toMatchObject({ full_name: 'Not On The Roster', player_id: null })
  })

  it('⚠️ stamps the league team from the FIXTURE, never from a typed field', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveMatchSheetMock).toHaveBeenCalled())
    expect(saveMatchSheetMock.mock.calls[0][0]).toMatchObject({
      event_id: 'e-1',
      league_team_id: 'lt-2',
    })
  })

  it('submits by marking the sheet complete', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(setStatusMock).toHaveBeenCalledWith('ms-1', 'complete'))
  })

  it('⚠️ says READY TO SEND, never "sent" — the app cannot know RCM received it', async () => {
    // ⚠️ THE LEAGUE TEAM IS PART OF THE FIXTURE BECAUSE A COMPLETE SHEET CANNOT
    // EXIST WITHOUT ONE as of 12 Aug 2026. Without it this mock exercises the
    // missing-league-team path instead of the one it is named for.
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1', event_id: 'e-1', status: 'complete', slots: [], cards: [],
      league_team_id: 'lt-2', league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
    })
    mount(<MatchSheet />)
    expect(await screen.findByText(/ready to send/i)).toBeInTheDocument()
    expect(screen.getByText(/the app cannot send it for you/i)).toBeInTheDocument()
    expect(screen.queryByText(/\bsent to RCM\b/i)).not.toBeInTheDocument()
  })

  // ── The TEAM line. Jay filed a U16B sheet on 12 Aug 2026 whose TEAM box read
  //    "U16B Contact" — the club's internal squad name — because the fixture had
  //    no league team and the code ended `?? squadName`. A blank box is an
  //    obviously unfinished form; a confidently wrong one is not.
  describe('the TEAM line', () => {
    const NO_LEAGUE_TEAM = { ...MATCH, league_team_id: null, league_team: null }

    it('⚠️ NEVER prints the squad name in RCM\'s TEAM box', async () => {
      getEventMock.mockResolvedValue(NO_LEAGUE_TEAM)
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      const facsimile = screen.getByTestId('match-sheet-facsimile')
      expect(facsimile).not.toHaveTextContent(/U14B Contact/)
      // The label survives; only the value is empty.
      expect(facsimile).toHaveTextContent(/TEAM:/)
    })

    it('⚠️ refuses to mark a sheet ready when there is no league team', async () => {
      getEventMock.mockResolvedValue(NO_LEAGUE_TEAM)
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByRole('button', { name: /^submit$/i })).toBeDisabled()
      expect(screen.getByTestId('match-sheet-no-league-team')).toBeInTheDocument()
    })

    it('⚠️ names the squad as OUR name for it, and sends the coach to the fixture', async () => {
      // The TEAM box is stamped from the event and cannot be typed here, so a
      // warning that only said "no league team" would send a coach hunting for
      // a field this form does not have.
      getEventMock.mockResolvedValue(NO_LEAGUE_TEAM)
      mount(<MatchSheet />)
      const warning = await screen.findByTestId('match-sheet-no-league-team')
      expect(warning).toHaveTextContent(/edit the fixture/i)
      expect(warning).toHaveTextContent(/U14B Contact/)
    })

    it('lets a normal fixture through, and prints the league team', async () => {
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByTestId('match-sheet-facsimile')).toHaveTextContent(/ADHQ2/)
      expect(screen.getByRole('button', { name: /^submit$/i })).not.toBeDisabled()
      expect(screen.queryByTestId('match-sheet-no-league-team')).not.toBeInTheDocument()
    })

    it('⚠️ a FILED sheet keeps the team it was filed with, not the fixture\'s new one', async () => {
      // A sheet is a record of what was SENT. Correcting the fixture in March
      // must not rewrite the TEAM line on a form RCM already holds.
      getMatchSheetMock.mockResolvedValue({
        id: 'ms-1', event_id: 'e-1', status: 'complete', slots: [], cards: [],
        league_team_id: 'lt-9',
        league_team: { id: 'lt-9', rcm_name: 'ADHQ1', division: 'A' },
      })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      const facsimile = screen.getByTestId('match-sheet-facsimile')
      expect(facsimile).toHaveTextContent(/ADHQ1/)
      expect(facsimile).not.toHaveTextContent(/ADHQ2/)
    })

    it('⚠️ still lets a wrongly-completed sheet be REOPENED', async () => {
      // The gate is one-way. A sheet marked ready before the gate existed must
      // still be fixable, or the app defends its rule against the person trying
      // to obey it.
      getEventMock.mockResolvedValue(NO_LEAGUE_TEAM)
      getMatchSheetMock.mockResolvedValue({
        id: 'ms-1', event_id: 'e-1', status: 'complete', slots: [], cards: [],
        league_team_id: null, league_team: null,
      })
      mount(<MatchSheet />)
      await screen.findByRole('heading', { name: /official match result sheet/i })

      expect(screen.getByRole('button', { name: /^reopen$/i })).not.toBeDisabled()
    })
  })

  it('⚠️ shows the TRUE deadline for U18 — an hour BEFORE kick-off', async () => {
    // One editor serves every age group (Jay, 12 Aug), but the app must not
    // tell a U18 coach a deadline that is a day and a bit wrong.
    getEventMock.mockResolvedValue({ ...MATCH, team_id: 't-u18b', team: U18B })
    mount(<MatchSheet />, {
      memberships: [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u18b' }],
    })
    expect(await screen.findByText(/due 1 hour before kick-off/i)).toBeInTheDocument()
  })

  it('refuses a parent, and offers no form', async () => {
    mount(<MatchSheet />, { memberships: PARENT })
    expect(await screen.findByRole('alert')).toHaveTextContent(/coaches and team managers/i)
    expect(screen.queryByLabelText('Player 1')).not.toBeInTheDocument()
  })

  it('surfaces a refused save rather than reporting success', async () => {
    saveMatchSheetMock.mockRejectedValue(new Error('you may not have permission'))
    const { user } = mount(<MatchSheet />)
    await screen.findByRole('heading', { name: /official match result sheet/i })
    await user.click(screen.getByRole('button', { name: /save draft/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/permission/i)
  })
})

describe('YouthDashboard — the Club Youth Manager list', () => {
  const asYouth = { memberships: ADMIN_YOUTH, path: '/admin/youth' }

  it('⚠️ is titled by the JOB, not by a person', async () => {
    // Nobody holds this job in the app yet; a screen named after somebody who
    // cannot sign in reads as broken.
    mount(<YouthDashboard />, { memberships: [{ role: 'admin', status: 'active', admin_rights: [] }], path: '/admin/youth' })
    // ⚠️ BY ROLE, not by text. Since 12 Aug the label appears TWICE on this
    // card — as the heading and inside the sentence below it — so a bare
    // findByText matches both and throws. Asserting the heading is also the
    // stronger claim: it is the title being tested, not the prose.
    expect(await screen.findByRole('heading', { name: /Club Youth Manager/i })).toBeInTheDocument()
    expect(screen.getByText(/Club Youth Manager hasn't been added to your account/i)).toBeInTheDocument()
  })

  it('lists matches with their sheet status', async () => {
    mount(<YouthDashboard />, asYouth)
    const row = await screen.findByTestId('youth-match-row')
    expect(within(row).getByText(/ADHQ2/)).toBeInTheDocument()
    expect(within(row).getByText(/not started/i)).toBeInTheDocument()
  })

  it('⚠️ asks for every sheet in ONE query, not one per fixture', async () => {
    // Built for a loaded club: a season across fifteen squads would otherwise
    // be hundreds of round trips on the screen whose job is the glance.
    mount(<YouthDashboard />, asYouth)
    await screen.findByTestId('youth-match-row')
    expect(listMatchSheetsForMock).toHaveBeenCalledTimes(1)
    expect(listMatchSheetsForMock).toHaveBeenCalledWith(['e-1'])
  })

  it('shows a submitted sheet as ready to send', async () => {
    listMatchSheetsForMock.mockResolvedValue(
      new Map([['e-1', { id: 'ms-1', event_id: 'e-1', status: 'complete' }]]),
    )
    mount(<YouthDashboard />, asYouth)
    // The default filter hides completed sheets, so switch to All.
    const { getByRole } = screen
    await screen.findByRole('button', { name: /all matches/i })
    await userEvent.setup().click(getByRole('button', { name: /all matches/i }))
    const row = await screen.findByTestId('youth-match-row')
    expect(within(row).getByText(/ready to send/i)).toBeInTheDocument()
  })

  it('⚠️ only lists MATCHES — training has no RCM sheet', async () => {
    listEventsMock.mockResolvedValue([
      MATCH,
      { ...MATCH, id: 'e-2', type: 'training', title: 'Tuesday session' },
    ])
    mount(<YouthDashboard />, asYouth)
    await screen.findByTestId('youth-match-row')
    expect(screen.getAllByTestId('youth-match-row')).toHaveLength(1)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   The 22, seeded from the coach's lineup — 16 Aug 2026
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ WHY THIS EXISTS. Jay, 16 Aug 2026: "names are not auto populating into
   them". They never had. The sheet's only help was the `squad-players`
   datalist on each box — a typeahead you discover by starting to type, on a
   phone, at the side of a pitch — while `lineups` already held exactly who
   played. The sheet was simply not asking.

   ⚠️ THE MERGE RULE IS THE PART WORTH PINNING. Seeding fills BLANK rows only,
   because a sheet that has been worked on is a record of somebody's decision;
   the deliberate overwrite is the Refill button, which is why it is the only
   control on the screen that asks twice.
   ══════════════════════════════════════════════════════════════════════════ */

/** The squad the mocked lineup draws from. Invented names, as this repo requires. */
const SQUAD = [
  { id: 'p1', team_id: 't-u14b', full_name: 'Zara Ali' },
  { id: 'p2', team_id: 't-u14b', full_name: 'Tom Fletcher' },
  { id: 'p3', team_id: 't-u14b', full_name: 'Idris Bakhtiari' },
]

/** Slot N's box, by the aria-label SlotCells gives it. */
const slotBox = (n) => screen.getByLabelText(`Player ${n}`)

describe('MatchSheet — the 22 come from the lineup', () => {
  beforeEach(() => {
    listPlayersMock.mockResolvedValue(SQUAD)
  })

  const LINEUP = {
    id: 'ln-1',
    event_id: 'e-1',
    label: null,
    lineup_players: [
      // ⚠️ DELIBERATELY OUT OF ORDER IN THE ARRAY. `sort_order` is what the
      // coach arranged and it is the only thing that may decide the order —
      // a test whose fixture is already sorted proves nothing about the sort.
      { id: 'lp-3', player_id: 'p3', role: 'replacement', sort_order: 0 },
      { id: 'lp-2', player_id: 'p2', role: 'starter', sort_order: 1 },
      { id: 'lp-1', player_id: 'p1', role: 'starter', sort_order: 0 },
    ],
  }

  it('fills the blank boxes, starters first and then replacements', async () => {
    listLineupsMock.mockResolvedValue([LINEUP])
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    expect(slotBox(1)).toHaveValue('Zara Ali')
    expect(slotBox(2)).toHaveValue('Tom Fletcher')
    // ⚠️ SLOT 3, NOT SLOT 16. The replacement follows the starters immediately
    // rather than waiting for a 15-man block, because `players_per_side` is the
    // coach's choice per lineup — a squad playing 10s would otherwise file a
    // form with five blank rows in the middle of it.
    expect(slotBox(3)).toHaveValue('Idris Bakhtiari')
    expect(slotBox(4)).toHaveValue('')
  })

  it('⚠️ never overwrites a row the sheet already had', async () => {
    listLineupsMock.mockResolvedValue([LINEUP])
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1',
      status: 'draft',
      league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
      slots: [{ slot: 1, player_id: null, full_name: 'Rory Ellingham', front_row: true }],
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    // The hand-typed name survives, and the lineup fills in around it.
    expect(slotBox(1)).toHaveValue('Rory Ellingham')
    expect(slotBox(2)).toHaveValue('Zara Ali')
  })

  it('⚠️ does not list a player twice when the sheet already names them', async () => {
    listLineupsMock.mockResolvedValue([LINEUP])
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1',
      status: 'draft',
      league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
      // Same player the lineup starts with, already on the sheet and LINKED.
      slots: [{ slot: 5, player_id: 'p1', full_name: 'Zara Ali', front_row: false }],
      cards: [],
    })
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    const named = [...Array(22).keys()]
      .map((i) => slotBox(i + 1).value)
      .filter((value) => value === 'Zara Ali')
    expect(named).toHaveLength(1)
  })

  it('⚠️ never ticks FR — a lineup records positions, not front-row cover', async () => {
    listLineupsMock.mockResolvedValue([LINEUP])
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    expect(screen.getByLabelText('Front row cover for player 1')).not.toBeChecked()
    expect(screen.getByLabelText('Front row cover for player 2')).not.toBeChecked()
  })

  it('says how to get names on the form when no team has been picked', async () => {
    listLineupsMock.mockResolvedValue([])
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    const squad = within(screen.getByTestId('match-sheet-squad'))
    expect(squad.getByText(/no team was picked/i)).toBeInTheDocument()
    expect(squad.queryByRole('button', { name: /refill/i })).toBeNull()
  })

  it('⚠️ Refill asks twice before it throws the form away', async () => {
    listLineupsMock.mockResolvedValue([LINEUP])
    getMatchSheetMock.mockResolvedValue({
      id: 'ms-1',
      status: 'draft',
      league_team: { id: 'lt-2', rcm_name: 'ADHQ2', division: 'B' },
      slots: [{ slot: 1, player_id: null, full_name: 'Rory Ellingham', front_row: true }],
      cards: [],
    })
    const { user } = mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')
    expect(slotBox(1)).toHaveValue('Rory Ellingham')

    // ARM. Nothing has changed yet — this is the whole point of the two steps.
    await user.click(screen.getByRole('button', { name: /refill from the team sheet/i }))
    expect(slotBox(1)).toHaveValue('Rory Ellingham')

    // Backing out leaves the form exactly as it was.
    await user.click(screen.getByRole('button', { name: /keep what/i }))
    expect(slotBox(1)).toHaveValue('Rory Ellingham')

    // CONFIRM. Now the lineup replaces the lot, FR ticks included — front row
    // cover is a claim about a named player, not about a row number.
    await user.click(screen.getByRole('button', { name: /refill from the team sheet/i }))
    await user.click(screen.getByRole('button', { name: /yes, replace the 22/i }))
    expect(slotBox(1)).toHaveValue('Zara Ali')
    expect(screen.getByLabelText('Front row cover for player 1')).not.toBeChecked()
  })

  it('names each lineup, because a squad can field two teams in a day', async () => {
    listLineupsMock.mockResolvedValue([
      { ...LINEUP, id: 'ln-a', label: 'Game 1' },
      { ...LINEUP, id: 'ln-b', label: 'Game 2' },
    ])
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    expect(screen.getByRole('button', { name: /refill from .Game 1./i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refill from .Game 2./i })).toBeInTheDocument()
  })

  it('⚠️ opens the sheet anyway when the lineups cannot be read', async () => {
    // A lineup is a convenience. The sheet is the governing body's document and
    // must open with an empty 22 rather than an error card.
    listLineupsMock.mockRejectedValue(new Error('offline'))
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    expect(slotBox(1)).toHaveValue('')
    expect(screen.getByTestId('match-sheet-squad')).toBeInTheDocument()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Filling it in on a phone — 16 Aug 2026
   ══════════════════════════════════════════════════════════════════════════

   ⚠️ WHY THIS EXISTS. The fixed-width fix earlier the same day made the sheet
   LEGIBLE on a phone and left it awful to FILL IN: 22 names into 40px boxes,
   scrolling sideways, standing on a pitch. Jay: *"i think we should go with the
   stacked mobile version"*. Below 900px every value is typed in
   MatchSheetEntry and the facsimile becomes a preview of what Share sends.

   ⚠️ THE WHOLE SUITE ABOVE RUNS ON THE PHONE BRANCH AND DID NOT CHANGE. jsdom
   has no matchMedia, so useMediaQuery returns false and the entry form is what
   renders — and because its aria-labels are IDENTICAL to the facsimile's, every
   pre-existing test kept passing without knowing the layout moved. That is the
   design, not a coincidence: if the two ever disagree, this file goes red.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Renders the PAPER branch — the one jsdom never picks by default.
 *
 * ⚠️ STUBBED PER TEST, NOT IN SHARED SETUP, which is what src/lib/useMediaQuery.js
 * asks for: it keeps "this test is about the wide layout" visible in the test
 * rather than buried somewhere every other test also reads.
 */
function widenToPaper() {
  const original = window.matchMedia
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })
  return () => {
    if (original === undefined) delete window.matchMedia
    else window.matchMedia = original
  }
}

describe('MatchSheet — filling it in when the paper does not fit', () => {
  it('gives a phone the stacked form, and the paper keeps its own boxes', async () => {
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    // The phone branch: one editor, and it is not the facsimile.
    expect(screen.getByTestId('match-sheet-entry')).toBeInTheDocument()
    const paper = within(screen.getByTestId('match-sheet-facsimile'))
    expect(paper.queryByLabelText('Player 1')).toBeNull()
    expect(screen.getByLabelText('Player 1')).toBeInTheDocument()
  })

  it('⚠️ THE FORM IS NEVER TYPED ON, AT ANY WIDTH — one rendering, one PNG', async () => {
    // ⚠️ THIS TEST REPLACED ITS OWN OPPOSITE. Until 16 Aug 2026 it asserted that
    // a wide screen put the inputs back INSIDE the facsimile — which is exactly
    // the arrangement that produced two renderings of one document and let them
    // drift by 25px within hours. The rule now is that there is nothing to
    // drift: the sheet is display-only everywhere, and the editor is beside it.
    //
    // Stubbing matchMedia wide is what makes this an assertion rather than a
    // restatement of jsdom's default — the wide branch is the one that used to
    // behave differently, so it is the one worth pinning.
    const restore = widenToPaper()
    try {
      mount(<MatchSheet />)
      await screen.findByTestId('match-sheet-facsimile')

      expect(screen.getByTestId('match-sheet-entry')).toBeInTheDocument()

      const paper = screen.getByTestId('match-sheet-facsimile')
      expect(paper.querySelectorAll('input:not([type="checkbox"]), select, textarea')).toHaveLength(
        0,
      )
      // The FR boxes stay, because they are what the tick is DRAWN with — but
      // none of them is reachable, and none is `disabled` (which would grey it
      // and change what gets photographed).
      const boxes = [...paper.querySelectorAll('input[type="checkbox"]')]
      expect(boxes).toHaveLength(22)
      expect(boxes.every((box) => box.disabled === false && box.tabIndex === -1)).toBe(true)
    } finally {
      restore()
    }
  })

  it('⚠️ renders the same DOM wide as narrow — the two paths are gone', async () => {
    // The strongest available statement of "one rendering" short of comparing
    // pixels: the photographed block must come out byte-identical whichever
    // branch of the old switch would have been taken.
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')
    const narrow = screen.getByTestId('match-sheet-facsimile').innerHTML
    cleanup()

    const restore = widenToPaper()
    try {
      mount(<MatchSheet />)
      await screen.findByTestId('match-sheet-facsimile')
      expect(screen.getByTestId('match-sheet-facsimile').innerHTML).toBe(narrow)
    } finally {
      restore()
    }
  })

  it('⚠️ types once and the preview follows — there is only one copy of the value', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    await user.type(screen.getByLabelText('Player 1'), 'Rory Ellingham')

    // The facsimile has no input for slot 1 on a phone, so the name can only be
    // there as rendered text — which is what Share photographs.
    expect(screen.getByTestId('match-sheet-facsimile')).toHaveTextContent('Rory Ellingham')
  })

  it('counts what is filled in, as a guide and never as a gate', async () => {
    const { user } = mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    expect(screen.getByTestId('entry-filled-count')).toHaveTextContent('0 of 22')
    await user.type(screen.getByLabelText('Player 1'), 'Rory Ellingham')
    expect(screen.getByTestId('entry-filled-count')).toHaveTextContent('1 of 22')

    // A short squad is normal and must still be submittable — the count says so
    // and nothing acts on it.
    expect(screen.getByRole('button', { name: /^submit$/i })).not.toBeDisabled()
  })

  it('⚠️ the card TIME box writes `minute`, the column that actually exists', async () => {
    // The label is RCM's ("TIME") and the column is the database's (`minute`).
    // Wiring the box to a key called `time` writes a field nothing reads, so the
    // value vanishes on save with no error — which is how this was written the
    // first time and why the assertion is on what reached saveMatchSheetCards.
    const { user } = mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    await user.selectOptions(screen.getByLabelText('Card 1 colour'), 'yellow')
    await user.type(screen.getByLabelText('Card 1 time'), '31')
    await user.click(screen.getByRole('button', { name: /save draft/i }))

    await waitFor(() => expect(saveCardsMock).toHaveBeenCalled())
    const [, cards] = saveCardsMock.mock.calls[0]
    expect(cards[0]).toMatchObject({ colour: 'yellow', minute: 31 })
  })

  it('⚠️ FR stays a real tick on the preview, not a greyed-out one', async () => {
    // A `disabled` checkbox is greyed by every browser, so the PNG from a phone
    // would stop matching the PNG from a laptop — the exact bug this screen was
    // fixed for hours earlier. The preview box must be un-disabled and merely
    // unreachable.
    const { user } = mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    await user.click(screen.getByLabelText('Front row cover for player 1'))

    const paper = screen.getByTestId('match-sheet-facsimile')
    const boxes = paper.querySelectorAll('input[type="checkbox"]')
    expect(boxes.length).toBe(22) // the form has 22, and a short squad is normal
    expect(boxes[0].checked).toBe(true)
    expect(boxes[0].disabled).toBe(false)
  })

  it('carries the manager, medical and captain boxes too, not only the 22', async () => {
    // The facsimile is not editable on a phone, so anything it holds that is not
    // in the stacked form is a field a coach simply cannot fill in.
    mount(<MatchSheet />)
    await screen.findByTestId('match-sheet-facsimile')

    const entry = within(screen.getByTestId('match-sheet-entry'))
    for (const label of [
      'Team captain',
      'Medical notes',
      'Team manager',
      'Team manager phone',
      'Card 1 reason',
      'Front row cover for player 22',
    ]) {
      expect(entry.getByLabelText(label)).toBeInTheDocument()
    }
  })
})
