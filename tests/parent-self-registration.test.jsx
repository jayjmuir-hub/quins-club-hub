import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Parent self-registration and the PENDING membership state — the two screens
// step 3 and step 4 of claude/decisions/2026-08-08-parent-self-registration.md
// ask for. The data layer's own tests (the exact RPC parameters, and each
// error CODE mapping to a sentence) live in tests/data.test.js alongside every
// other src/data/ function; this file is about what a person sees.
//
// Three states are exercised here and they are genuinely different people:
//
//   ZERO memberships   -> "Add your player", with "ask the club" behind it
//   ALL rows pending   -> the app, WITH their child and their fixtures, under
//                         a "waiting to be approved" banner
//   an admin           -> the approval queue on the Accounts screen
//
// ⚠️ THE MIDDLE ONE IS THE ONE THAT IS EASY TO GET WRONG, and getting it wrong
// looks like being careful. A pending member can see their own child, their
// squad's fixtures and their own availability, because RLS was changed to
// allow exactly that (db/migrations/20260808_membership_pending_status.sql).
// Hiding the app behind a "please wait" card would throw all of it away and
// reduce the pending state to a slower version of no access — which is the
// thing the whole design exists to avoid. The Schedule test below is what
// pins that down: it renders the real screen, not a placeholder.
//
// Every data module is mocked, so nothing here can reach a Supabase client.

const useAuthMock = vi.fn()
const useMembershipsMock = vi.fn()
const registerMyPlayerMock = vi.fn()
const approveMembershipMock = vi.fn()
const getMyProfileMock = vi.fn()
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()
const updateProfileNamesMock = vi.fn()
const listClubMembersMock = vi.fn()
const listPendingProfilesMock = vi.fn()
const listAccessRequestsMock = vi.fn()
const dismissAccessRequestMock = vi.fn()
const restoreAccessRequestMock = vi.fn()
const grantMembershipsMock = vi.fn()
const updateMembershipRoleMock = vi.fn()
const deleteMembershipMock = vi.fn()
const updateProfileNameMock = vi.fn()
const listPlayersMock = vi.fn()
const setPlayerDobMock = vi.fn()
const listEventsMock = vi.fn()
const subscribeEventsMock = vi.fn()
const listAvailabilityMock = vi.fn()
const subscribeAvailabilityMock = vi.fn()
const setAvailabilityMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/members.js', () => ({
  registerMyPlayer: (...args) => registerMyPlayerMock(...args),
  approveMembership: (...args) => approveMembershipMock(...args),
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
  listClubMembers: (...args) => listClubMembersMock(...args),
  listPendingProfiles: (...args) => listPendingProfilesMock(...args),
  grantMemberships: (...args) => grantMembershipsMock(...args),
  updateMembershipRole: (...args) => updateMembershipRoleMock(...args),
  deleteMembership: (...args) => deleteMembershipMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  // The squad picker's source (16 Aug 2026). An unmocked export is undefined,
  // and calling it in an effect throws before anything renders.
  listSquadsForRequest: async () => [],
  getMyAccessRequest: (...args) => getMyAccessRequestMock(...args),
  createAccessRequest: (...args) => createAccessRequestMock(...args),
  listAccessRequests: (...args) => listAccessRequestsMock(...args),
  dismissAccessRequest: (...args) => dismissAccessRequestMock(...args),
  restoreAccessRequest: (...args) => restoreAccessRequestMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  // The date-of-birth write (16 Aug 2026). ⚠️ An unmocked export is `undefined`,
  // and calling it mid-submit throws AFTER the child is already registered —
  // which is precisely the failure the third case below exists to describe.
  setPlayerDob: (...args) => setPlayerDobMock(...args),
}))

vi.mock('../src/data/events.js', () => ({
  listEvents: (...args) => listEventsMock(...args),
  subscribeEvents: (...args) => subscribeEventsMock(...args),
}))

vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: (...args) => subscribeAvailabilityMock(...args),
  setAvailability: (...args) => setAvailabilityMock(...args),
}))

// Imported after vi.mock so these bind to the mocked modules.
import AppShell from '../src/components/AppShell.jsx'
import Accounts from '../src/screens/Accounts.jsx'
import Schedule from '../src/screens/Schedule.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

const CLUB_ID = 'club-1'
const TEAM_U13 = { id: 't-u13', club_id: CLUB_ID, name: 'U13', sort_order: 3 }
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 6 }
// A single-gender squad, named exactly as the club names them. Gender is
// REQUIRED on this one and on nothing else here (Jay, 9 Aug 2026).
const TEAM_U16G = { id: 't-u16g', club_id: CLUB_ID, name: 'U16G Contact', sort_order: 7 }
// ⚠️ THE ONLY SQUAD HERE THAT PERMITS SELF-REGISTRATION (11 Aug 2026), and it
// is deliberately MIXED so these tests never have to answer the gender
// question to reach the thing they are testing. The permission is the COLUMN —
// the other fixtures leave it undefined, which is what a squad below U13 looks
// like, and is why every older assertion in this file expects `false`.
const TEAM_SELF = {
  id: 't-u18',
  club_id: CLUB_ID,
  name: 'U18 Mixed',
  sort_order: 8,
  self_registration_allowed: true,
}
// Deliberately out of order: the form sorts by sort_order, like every other
// age-group list in the app.
const TEAMS = [TEAM_U16G, TEAM_U16, TEAM_U13, TEAM_SELF]

function shellState(overrides = {}) {
  return {
    memberships: [],
    realMemberships: [],
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
    viewAs: null,
    setViewAs: vi.fn(),
    ...overrides,
  }
}

function renderShell(children = <div>Routed content</div>) {
  return render(
    <MemoryRouter initialEntries={['/']} future={routerFuture}>
      <AppShell>{children}</AppShell>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // useMyProfile caches at module level keyed by user id; without this the
  // first test's profile leaks into every later one.
  clearMyProfileCache()
  vi.clearAllMocks()

  useAuthMock.mockReturnValue({
    user: { id: 'user-1', email: 'hannah@example.com' },
    signOut: vi.fn(),
  })
  useMembershipsMock.mockReturnValue(shellState())
  getMyProfileMock.mockResolvedValue({
    id: 'user-1',
    full_name: 'Hannah Okafor',
    first_name: 'Hannah',
    last_name: 'Okafor',
    name_confirmed_at: '2026-08-01T00:00:00Z',
    email: 'hannah@example.com',
  })
  getMyAccessRequestMock.mockResolvedValue(null)
  registerMyPlayerMock.mockResolvedValue({
    id: 'mm-new',
    profile_id: 'user-1',
    team_id: TEAM_U13.id,
    role: 'parent',
    status: 'pending',
  })
})

describe('Add your player — a signed-in account with no access', () => {
  it('registers with the trimmed name and the chosen age group, then reloads the provider', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    useMembershipsMock.mockReturnValue(shellState({ reload }))

    renderShell()

    // Trailing spaces on purpose: a name typed on a phone keyboard picks them
    // up constantly, and the database's own guard trims before it checks for
    // blank — so the client trimming too is what keeps the two in step.
    await user.type(screen.getByLabelText(/player's first name/i), '  Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor  ')
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    // The third argument is gender, added 9 Aug 2026. NULL here on purpose:
    // "U13" is a mixed squad, the form never asked, and it must not invent an
    // answer. The single-gender squad has its own tests further down.
    //
    // The fourth is self-registration, added 11 Aug 2026. ⚠️ FALSE because this
    // fixture squad has no self_registration_allowed, so the question is never
    // shown — which is also the assertion that squads below U13 are untouched
    // by that feature.
    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenCalledWith('Chidi Okafor', TEAM_U13.id, null, false, { confirmDuplicate: false, confirmSelfName: false }),
    )
    expect(registerMyPlayerMock).toHaveBeenCalledTimes(1)

    // ⚠️ THE RELOAD IS THE HALF THAT IS INVISIBLE WHEN IT BREAKS. The
    // membership exists server-side either way; without the reload the parent
    // stays on the form looking at a screen that says nothing happened, and
    // the obvious response is to submit again — which is how somebody reaches
    // the five-pending limit without ever meaning to.
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('sorts the age groups the way every other list in the app does', async () => {
    renderShell()

    const options = within(screen.getByLabelText(/age group/i)).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'Choose an age group…',
      'U13',
      'U16',
      'U16G Contact',
      // ⚠️ sort_order 8, and it is LAST for that reason alone. A squad that
      // permits self-registration is not promoted, demoted or marked in this
      // list — the question appears after the squad is chosen, so the list
      // stays the plain age-group list every other screen shows.
      'U18 Mixed',
    ])
  })

  // ── Gender on a single-gender squad (Jay, 9 Aug 2026) ─────────────────
  //
  // ⚠️ THE RULING HAS TWO HALVES AND THEY POINT DIFFERENT WAYS. A blank gender
  // is REFUSED; a gender that CONTRADICTS the squad is ALLOWED with a warning.
  // Tests for both live here so nobody "tidies" the first into the second.
  describe('gender on a single-gender squad', () => {
    it('does not ask for gender on a mixed squad', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      // Seven of the club's eighteen squads need this. Asking the other
      // eleven's families anyway is how an optional question gets answered
      // wrongly just to get past it.
      expect(screen.queryByRole('radio', { name: /^female$/i })).not.toBeInTheDocument()
    })

    it('reveals the field as soon as a single-gender squad is chosen', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      expect(screen.getByRole('radio', { name: /^female$/i })).toBeInTheDocument()
      // Says WHY, naming the squad. A field that silently becomes mandatory
      // reads as the app malfunctioning.
      expect(screen.getByText(/U16G Contact is a single-gender squad/i)).toBeInTheDocument()
    })

    it('refuses a blank gender without spending a round trip', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Amara')
      await user.type(screen.getByLabelText(/player's family name/i), 'Bello')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/U16G Contact/i)
      // The database refuses this too (errcode 22004). The client check exists
      // so the common case does not cost a request — if this ever fires, the
      // request was never made.
      expect(registerMyPlayerMock).not.toHaveBeenCalled()
    })

    it('passes the chosen gender through as the third argument', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Amara')
      await user.type(screen.getByLabelText(/player's family name/i), 'Bello')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      await user.click(screen.getByRole('radio', { name: /^female$/i }))
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(registerMyPlayerMock).toHaveBeenCalledWith('Amara Bello', TEAM_U16G.id, 'female', false, { confirmDuplicate: false, confirmSelfName: false }),
      )
    })

    // ⚠️ THE HALF PEOPLE WILL WANT TO "FIX". A male player in U16G Contact is
    // allowed through. The club has had four women recorded in Senior Men 2nd
    // XV — a real arrangement, not a data error — and blocking it would make
    // such a player unrecordable by anyone, including whoever is trying to
    // correct them. Only ABSENCE is refused.
    it('lets a contradictory gender through rather than blocking it', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Sam')
      await user.type(screen.getByLabelText(/player's family name/i), 'Reid')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U16G.id)
      await user.click(screen.getByRole('radio', { name: /^male$/i }))
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(registerMyPlayerMock).toHaveBeenCalledWith('Sam Reid', TEAM_U16G.id, 'male', false, { confirmDuplicate: false, confirmSelfName: false }),
      )
    })
  })

  // --- a U13+ player registering THEMSELVES (11 Aug 2026) ----------------
  //
  // ⚠️ THE PERMISSION IS teams.self_registration_allowed, NEVER THE NAME.
  // 20260806_claim_roster_access.sql ruled that a squad rename must not hand an
  // account a role it should not have, so these tests drive the COLUMN. A test
  // that selected on "U18" appearing in the name would pass while the feature
  // was wired to something a rename could break.
  describe('a player at U13 or above registering themselves', () => {
    it('does not ask the question at all for a squad that does not allow it', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)

      expect(screen.queryByRole('radio', { name: /i'm the player/i })).not.toBeInTheDocument()
      // ⚠️ The negative above is only worth something if the control can be
      // found when it IS there. Same run, same query, the allowed squad.
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_SELF.id)
      expect(screen.getByRole('radio', { name: /i'm the player/i })).toBeInTheDocument()
    })

    it('defaults to "my child", so a distracted parent cannot register themselves by accident', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_SELF.id)

      expect(screen.getByRole('radio', { name: /my child/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /i'm the player/i })).not.toBeChecked()
    })

    it('sends the flag, and renames the field to match who is answering', async () => {
      const user = userEvent.setup()
      registerMyPlayerMock.mockResolvedValue({ id: 'mm-9', status: 'pending' })
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_SELF.id)
      await user.click(screen.getByRole('radio', { name: /i'm the player/i }))

      // The label follows the answer — "Player's first name" is a form written
      // about somebody else.
      //
      // ⚠️ AND THAT WORDING IS NOW CONDITIONAL. Splitting the name into two
      // boxes (16 Aug 2026) made it collide with the "About you" fieldset, which
      // asks the same two questions of the same person — so the warm wording is
      // used only when that fieldset is absent. The default fixture carries
      // name_confirmed_at, which is why it is absent here. See PlayerRow's
      // `selfNamed`.
      await user.type(screen.getByLabelText(/your first name/i), 'Tobi')
      await user.type(screen.getByLabelText(/your family name/i), 'Adeyemi')
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(registerMyPlayerMock).toHaveBeenCalledWith('Tobi Adeyemi', TEAM_SELF.id, null, true, { confirmDuplicate: false, confirmSelfName: false }),
      )
    })

    // ⚠️ THE BUG THIS EXISTS TO CATCH. Answer "I'm the player" on the squad
    // that allows it, then change your mind to one that does not. Without the
    // reset in the select's onChange the flag survives in state, the control
    // that set it is gone, and the person gets a refusal from the database
    // about a question they can no longer see.
    it('forgets the answer when the squad changes to one that cannot self-register', async () => {
      const user = userEvent.setup()
      registerMyPlayerMock.mockResolvedValue({ id: 'mm-10', status: 'pending' })
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_SELF.id)
      await user.click(screen.getByRole('radio', { name: /i'm the player/i }))
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)

      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(registerMyPlayerMock).toHaveBeenCalledWith('Chidi Okafor', TEAM_U13.id, null, false, { confirmDuplicate: false, confirmSelfName: false }),
      )
    })
  })

  // ── More than one child, in one go (Jay, 13 Aug 2026) ──────────────────
  //
  // ⚠️ THE FORM WAS THE LIMIT, NOT THE DATABASE, and that is the whole reason
  // this took five days to notice. `register_my_player` counts only PENDING
  // rows against its cap of five, deliberately, so that "an approved parent
  // adding a second child later is normal and must not be blocked by their own
  // history" (db/migrations/20260808_register_my_player.sql). The form took one
  // name and vanished after one submit.
  //
  // ⚠️ SEQUENTIAL, NOT CONCURRENT, and the partial-failure tests below are why.
  // The RPC takes one player per call, so three children are three round trips
  // whatever happens; firing them together makes "which child is missing?"
  // unanswerable. Register.jsx's touchline sweep made the same call first.
  describe('a parent registering more than one child', () => {
    it('saves each child in turn, in the order they were typed', async () => {
      const user = userEvent.setup()
      const reload = vi.fn()
      useMembershipsMock.mockReturnValue(shellState({ reload }))

      renderShell()

      await user.type(screen.getByLabelText(/player 1's first name|player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player 1's family name|player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)

      await user.click(screen.getByRole('button', { name: /add another child/i }))

      await user.type(screen.getByLabelText(/player 2's first name/i), 'Ada')
      await user.type(screen.getByLabelText(/player 2's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/player 2's date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/player 2's age group/i), TEAM_U16.id)

      await user.click(screen.getByRole('button', { name: /add these 2 players/i }))

      await waitFor(() => expect(registerMyPlayerMock).toHaveBeenCalledTimes(2))
      // Order matters: it is the order the parent typed, and it is what makes
      // the partial-failure message below able to name the right child.
      expect(registerMyPlayerMock.mock.calls[0]).toEqual(['Chidi Okafor', TEAM_U13.id, null, false, { confirmDuplicate: false, confirmSelfName: false }])
      expect(registerMyPlayerMock.mock.calls[1]).toEqual(['Ada Okafor', TEAM_U16.id, null, false, { confirmDuplicate: false, confirmSelfName: false }])
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    })

    // ⚠️ PER ROW, NOT PER FORM. Two children in two different squads, one of
    // which is single-gender: the gender question must appear against that
    // child only. A form that asked once and applied the answer to everybody
    // would record a gender the parent never gave for the other child.
    it('asks for gender only on the row whose squad demands it', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add another child/i }))
      await user.type(screen.getByLabelText(/player 2's date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/player 2's age group/i), TEAM_U16G.id)

      // Exactly one gender control on the page, and the explanation names the
      // squad that caused it.
      expect(screen.getAllByRole('radio', { name: /^female$/i })).toHaveLength(1)
      expect(screen.getByText(/U16G Contact is a single-gender squad/i)).toBeInTheDocument()
    })

    it('names the row that is incomplete rather than saying "your player"', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add another child/i }))
      await user.type(screen.getByLabelText(/player 2's first name/i), 'Ada')
      await user.type(screen.getByLabelText(/player 2's family name/i), 'Okafor')
      // Filled: the date-of-birth guard runs first, and this case is about the
      // age group naming the right ROW.
      await user.type(screen.getByLabelText(/player 2's date of birth/i), '2015-06-01')
      // Row 2 has no age group.
      await user.click(screen.getByRole('button', { name: /add these 2 players/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /choose an age group for ada okafor/i,
      )
      // Nothing was sent: a list that is refused client-side must not half-save.
      expect(registerMyPlayerMock).not.toHaveBeenCalled()
    })

    // ⚠️ THE ONE THAT MATTERS. Each call is its own committed transaction, so
    // child one EXISTS the moment it returns — "roll it all back" is not on the
    // table without a delete path that does not exist. What a parent must never
    // see is a generic apology that leaves them guessing whether any of it
    // landed, because the obvious response is to submit the lot again and
    // create duplicates the club then has to spot and delete.
    it('keeps the children that saved, and names the one that did not', async () => {
      const user = userEvent.setup()
      const refusal = new Error('That age group does not exist.')
      refusal.code = '22023'
      registerMyPlayerMock
        .mockResolvedValueOnce({ id: 'mm-1', status: 'pending' })
        .mockRejectedValueOnce(refusal)

      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add another child/i }))
      await user.type(screen.getByLabelText(/player 2's first name/i), 'Ada')
      await user.type(screen.getByLabelText(/player 2's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/player 2's date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/player 2's age group/i), TEAM_U16.id)
      await user.click(screen.getByRole('button', { name: /add these 2 players/i }))

      // The good news, said as good news.
      expect(await screen.findByTestId('registered-so-far')).toHaveTextContent(
        /chidi okafor is registered/i,
      )
      // And the bad news, naming the child and carrying the server's reason.
      expect(screen.getByRole('alert')).toHaveTextContent(/ada okafor wasn't added/i)
      expect(screen.getByRole('alert')).toHaveTextContent(/that age group does not exist/i)
    })

    // The child who saved must be GONE from the list, or the parent fixes the
    // failing row, resubmits, and registers the first one a second time.
    it('does not re-submit a child who already saved', async () => {
      const user = userEvent.setup()
      const refusal = new Error('That age group does not exist.')
      refusal.code = '22023'
      registerMyPlayerMock
        .mockResolvedValueOnce({ id: 'mm-1', status: 'pending' })
        .mockRejectedValueOnce(refusal)

      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add another child/i }))
      await user.type(screen.getByLabelText(/player 2's first name/i), 'Ada')
      await user.type(screen.getByLabelText(/player 2's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/player 2's date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/player 2's age group/i), TEAM_U16.id)
      await user.click(screen.getByRole('button', { name: /add these 2 players/i }))

      await screen.findByTestId('registered-so-far')

      // One row left, and it is Ada's.
      expect(screen.getAllByTestId('player-row')).toHaveLength(1)
      expect(screen.getByLabelText(/player's first name/i)).toHaveValue('Ada')
      expect(screen.getByLabelText(/player's family name/i)).toHaveValue('Okafor')

      registerMyPlayerMock.mockResolvedValueOnce({ id: 'mm-2', status: 'pending' })
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() => expect(registerMyPlayerMock).toHaveBeenCalledTimes(3))
      // Three calls total: Chidi, Ada-refused, Ada-retried. Chidi was never
      // sent twice.
      const names = registerMyPlayerMock.mock.calls.map((call) => call[0])
      expect(names).toEqual(['Chidi Okafor', 'Ada Okafor', 'Ada Okafor'])
    })

    // ⚠️ A PARENT MUST NOT BE STRANDED BY A ROW THEY CANNOT FIX. Two children
    // saved and the third refused for a reason outside their control leaves
    // real access waiting on the other side of this form.
    it('offers a way through once something has saved', async () => {
      const user = userEvent.setup()
      const reload = vi.fn()
      useMembershipsMock.mockReturnValue(shellState({ reload }))
      const refusal = new Error('That age group does not exist.')
      refusal.code = '22023'
      registerMyPlayerMock
        .mockResolvedValueOnce({ id: 'mm-1', status: 'pending' })
        .mockRejectedValueOnce(refusal)

      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add another child/i }))
      await user.type(screen.getByLabelText(/player 2's first name/i), 'Ada')
      await user.type(screen.getByLabelText(/player 2's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/player 2's date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/player 2's age group/i), TEAM_U16.id)
      await user.click(screen.getByRole('button', { name: /add these 2 players/i }))

      await screen.findByTestId('registered-so-far')
      await user.click(screen.getByRole('button', { name: /continue without them/i }))

      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    })

    // ⚠️ THE ESCAPE HATCH MUST NOT EXIST BEFORE IT IS EARNED. Offered on a
    // fresh form it reads as "skip this", on the one screen whose entire
    // purpose is not to be skipped.
    it('does not offer that way through before anything has saved', async () => {
      renderShell()

      expect(screen.queryByRole('button', { name: /continue without them/i })).not.toBeInTheDocument()
    })

    it('stops at five rows and says why', async () => {
      const user = userEvent.setup()
      renderShell()

      const addAnother = () => screen.getByRole('button', { name: /add another child/i })
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- each click must land
        // before the next row exists to click it again.
        await user.click(addAnother())
      }

      expect(screen.getAllByTestId('player-row')).toHaveLength(5)
      expect(addAnother()).toBeDisabled()
      // ⚠️ Says WHY, and says the limit is on players AWAITING APPROVAL rather
      // than on the family. A disabled button with no sentence beside it reads
      // as the app refusing to hold their children.
      expect(screen.getByText(/the most you can add at once/i)).toBeInTheDocument()
    })

    it('lets a row be removed again, without disturbing the others', async () => {
      const user = userEvent.setup()
      renderShell()

      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.click(screen.getByRole('button', { name: /add another child/i }))
      await user.type(screen.getByLabelText(/player 2's first name/i), 'Ada')
      await user.type(screen.getByLabelText(/player 2's family name/i), 'Okafor')

      await user.click(screen.getByRole('button', { name: /remove ada okafor/i }))

      expect(screen.getAllByTestId('player-row')).toHaveLength(1)
      // ⚠️ THE BUG A KEYED LIST EXISTS TO PREVENT. With index keys, removing a
      // row leaves the survivor holding the removed row's input state — so this
      // would read "Ada Okafor" while claiming to be player 1.
      expect(screen.getByLabelText(/player's first name/i)).toHaveValue('Chidi')
      expect(screen.getByLabelText(/player's family name/i)).toHaveValue('Okafor')
    })

    // The first row can never be removed: a list you can empty is a form with
    // no fields.
    it('does not let the only row be removed', async () => {
      renderShell()

      expect(screen.queryByRole('button', { name: /^remove/i })).not.toBeInTheDocument()
    })
  })

  // ── The registrant's own name, at sign-up (13 Aug 2026) ────────────────
  //
  // ⚠️ THIS IS WHERE IT MATTERS MOST, because at sign-up the person has NO
  // membership — and `NamePrompt`, the only other thing that captures a name,
  // is mounted inside AppShell's `ready` branch, which requires
  // `memberships.length > 0`. So before this field existed the order was forced
  // and backwards: registering a child created the membership, the membership
  // put the person in an admin's approval queue, and only THEN could the app
  // ask their name. Measured live on 13 Aug: a 2m 43s window in which the queue
  // showed a row it could not name — and NamePrompt is skippable, so the window
  // does not always close.
  describe('the registrant’s own name', () => {
    function unnamed() {
      getMyProfileMock.mockResolvedValue({
        id: 'user-1',
        full_name: null,
        first_name: null,
        last_name: null,
        name_confirmed_at: null,
        email: 'hannah@example.com',
      })
    }

    it('is not asked for when the person has already given it', async () => {
      renderShell()
      // The default fixture carries name_confirmed_at.
      expect(await screen.findByLabelText(/player's first name/i)).toBeInTheDocument()
      expect(screen.queryByLabelText(/your first name/i)).not.toBeInTheDocument()
    })

    it('is written BEFORE any child, so the queue row can never be nameless', async () => {
      const user = userEvent.setup()
      unnamed()

      const order = []
      updateProfileNamesMock.mockImplementation(async () => {
        order.push('name')
        return { id: 'user-1', first_name: 'Hannah', name_confirmed_at: '2026-08-13T00:00:00Z' }
      })
      registerMyPlayerMock.mockImplementation(async () => {
        order.push('child')
        return { id: 'mm-new', status: 'pending' }
      })

      renderShell()

      await user.type(await screen.findByLabelText(/your first name/i), 'Hannah')
      await user.type(screen.getByLabelText(/your family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() => expect(registerMyPlayerMock).toHaveBeenCalled())
      expect(updateProfileNamesMock).toHaveBeenCalledWith({
        profileId: 'user-1',
        firstName: 'Hannah',
        lastName: 'Okafor',
      })
      // ⚠️ THE ASSERTION THAT IS THE FIX. Reverse these two and the race is
      // back exactly as it was.
      expect(order).toEqual(['name', 'child'])
    })

    it('refuses to register anything while it is blank', async () => {
      const user = userEvent.setup()
      unnamed()
      renderShell()

      await user.type(await screen.findByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/your own first name/i)
      expect(registerMyPlayerMock).not.toHaveBeenCalled()
      expect(updateProfileNamesMock).not.toHaveBeenCalled()
    })

    // ⚠️ INVERTED 13 Aug 2026 (Jay). This asserted that a first name ALONE was
    // accepted, matching NamePrompt, RequestAccess and the You card, all of
    // which mark the family name optional because "plenty of people have one
    // name".
    //
    // That principle holds for those fields, which exist so the app has A name
    // for somebody. It does not hold for this one, which exists so a coach can
    // identify a STRANGER asking to join a children's squad — "Sarah" does not
    // do that. Measured before changing it: of 13 adults with a confirmed name,
    // ZERO have no family name; zero of 9 players have a single-word name. The
    // exemption was protecting nobody, and Jay's call was to require it and skip
    // the escape hatch that was offered.
    it('refuses a first name alone, unlike every other name field in the app', async () => {
      const user = userEvent.setup()
      unnamed()
      renderShell()

      await user.type(await screen.findByLabelText(/your first name/i), 'Hannah')
      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/family name/i)
      // Nothing written, in either direction — the name is checked before any
      // round trip, exactly like the blank-first-name case above.
      expect(updateProfileNamesMock).not.toHaveBeenCalled()
      expect(registerMyPlayerMock).not.toHaveBeenCalled()
    })

    // ⚠️ The negative above is worth nothing unless the same journey SUCCEEDS
    // once the family name is there. Same run, same fields, one box filled in.
    it('accepts it once the family name is given', async () => {
      const user = userEvent.setup()
      unnamed()
      renderShell()

      await user.type(await screen.findByLabelText(/your first name/i), 'Hannah')
      await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
      await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
      await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
      await user.click(screen.getByRole('button', { name: /add my player/i }))
      await screen.findByRole('alert')

      await user.type(screen.getByLabelText(/your family name/i), 'Okafor')
      await user.click(screen.getByRole('button', { name: /add my player/i }))

      await waitFor(() =>
        expect(updateProfileNamesMock).toHaveBeenCalledWith({
          profileId: 'user-1',
          firstName: 'Hannah',
          lastName: 'Okafor',
        }),
      )
      await waitFor(() => expect(registerMyPlayerMock).toHaveBeenCalled())
    })

    // ⚠️ AND THE FIELD MUST NOT SAY "optional", because it no longer is. The
    // label is the only thing telling somebody the rules before they submit.
    it('does not label the family name optional', async () => {
      unnamed()
      renderShell()

      const label = await screen.findByLabelText(/your family name/i)
      expect(label).toBeInTheDocument()
      expect(screen.queryByLabelText(/your family name \(optional\)/i)).not.toBeInTheDocument()
    })
  })

  it('will not submit a blank name, and does not spend a round trip finding out', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')

    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your player's first name/i)
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
  })

  it('will not submit without an age group either', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
    // Filled, because the date-of-birth guard runs BEFORE the age-group one and
    // this case is about the age group.
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    // ⚠️ THE WORDING NAMES THE CHILD SINCE 13 Aug 2026, and the change is not
    // cosmetic. The form can now hold up to five rows, so "choose your player's
    // age group" would leave a parent of three hunting for which box it means.
    // With one row and a name typed it reads the same either way.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /choose an age group for chidi okafor/i,
    )
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
  })

  // The sentence the data layer built from error.code (see
  // REGISTER_MESSAGES in src/data/members.js) has to survive the trip to the
  // screen. A component that swallowed it and printed its own generic apology
  // would make the whole code-keyed mapping pointless.
  it('shows the refusal the data layer produced, and lets them try again', async () => {
    const user = userEvent.setup()
    const refusal = new Error(
      'Please confirm your email address before adding a player. Check your inbox.',
    )
    refusal.code = '42501'
    registerMyPlayerMock.mockRejectedValue(refusal)

    renderShell()

    await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
      await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/confirm your email address/i)
    // Re-enabled, not stuck in "Adding…": the fix for an unconfirmed email is
    // to go and click a link and come back, and the form has to still work.
    expect(screen.getByRole('button', { name: /add my player/i })).toBeEnabled()
  })

  // ⚠️ THIS IS A REAL PRODUCTION STATE, NOT A DEFENSIVE BRANCH. `team read`
  // is "EXISTS a membership row for auth.uid() in this club", so a person with
  // ZERO memberships reads ZERO teams — which is exactly the person this
  // screen is for. Until that policy is widened (see
  // db/migrations/20260808_teams_readable_before_registration.sql, written but
  // NOT applied) this is what every self-registering parent will actually see,
  // and it has to be honest and offer a way forward rather than rendering an
  // empty dropdown.
  it('says so, and offers the other route, when no age groups came back', async () => {
    useMembershipsMock.mockReturnValue(shellState({ teams: [] }))

    renderShell()

    expect(await screen.findByText(/couldn't load the club's age groups/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/age group/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /not adding a player/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })

  it('keeps the ask-the-club route for someone with no child to register', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(await screen.findByRole('button', { name: /not adding a player/i }))

    // RequestAccess, unchanged — a coach or committee member still gets the
    // route that existed before self-registration.
    expect(await screen.findByRole('button', { name: /request access/i })).toBeInTheDocument()
    expect(screen.getByText('hannah@example.com')).toBeInTheDocument()
  })
})

describe('A member waiting to be approved', () => {
  const PENDING_MEMBERSHIP = {
    id: 'mm-pending',
    profile_id: 'user-1',
    club_id: CLUB_ID,
    team_id: TEAM_U13.id,
    role: 'parent',
    player_id: 'p-chidi',
    status: 'pending',
    teams: TEAM_U13,
  }

  // ⚠️ ADDED 13 Aug 2026, AND ITS ABSENCE IS WHY A FALSE SENTENCE SHIPPED FOR
  // FOUR DAYS. The banner told every waiting parent "Nobody is emailed
  // automatically, so… mention it to your coach or team manager." That was true
  // when written and became false on 9 Aug, when
  // db/migrations/20260809_notify_pending_membership.sql started emailing every
  // coach, team manager and admin for the squad the moment a registration
  // lands. The full suite stayed green throughout, because nothing asserted the
  // wording — so the app spent four days sending parents to chase a club that
  // had already been told.
  //
  // This is the anchor. It pins the CLAIM, not the prose: the banner must not
  // tell somebody nobody was notified.
  it('does not tell a waiting parent that nobody was emailed', async () => {
    useMembershipsMock.mockReturnValue(shellState({ memberships: [PENDING_MEMBERSHIP] }))

    renderShell()

    const banner = await screen.findByTestId('pending-approval')
    expect(banner).not.toHaveTextContent(/nobody is emailed/i)
    expect(banner).not.toHaveTextContent(/no.{0,3}one is emailed/i)
    // And says the opposite, which is what is actually true.
    expect(banner).toHaveTextContent(/emailed when you registered/i)
  })

  it('sees the waiting banner ABOVE the app, not instead of it', async () => {
    useMembershipsMock.mockReturnValue(shellState({ memberships: [PENDING_MEMBERSHIP] }))

    renderShell()

    expect(await screen.findByTestId('pending-approval')).toHaveTextContent(
      /waiting to be approved/i,
    )
    expect(screen.getByText('Routed content')).toBeInTheDocument()
  })

  // ⚠️ THE ONE THAT PROVES THE POINT. The real Schedule screen, rendered
  // inside the real AppShell, for somebody whose only membership is pending.
  // `event read` is private.is_attached_to_team, which accepts any status, so
  // the database really does return these fixtures — and if the app ever
  // starts gating on approval, this test is what says so.
  it('still sees the squad’s fixtures', async () => {
    listEventsMock.mockResolvedValue([
      {
        id: 'e-1',
        team_id: TEAM_U13.id,
        title: 'Training',
        kind: 'training',
        starts_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        location: 'Zayed Sports City',
      },
    ])
    subscribeEventsMock.mockReturnValue(() => {})
    listAvailabilityMock.mockResolvedValue([])
    subscribeAvailabilityMock.mockReturnValue(() => {})
    listPlayersMock.mockResolvedValue([])
    useMembershipsMock.mockReturnValue(shellState({ memberships: [PENDING_MEMBERSHIP] }))

    renderShell(<Schedule />)

    expect(await screen.findByText(/training/i)).toBeInTheDocument()
    expect(screen.getByTestId('pending-approval')).toBeInTheDocument()
  })

  // A parent who already has one approved squad and has just registered a
  // second child is a fully working member. Banner-ing their whole app would
  // be wrong, which is why isPendingOnly is `every` and not `some`.
  it('is not shown to someone who has one approved squad and one pending', async () => {
    useMembershipsMock.mockReturnValue(
      shellState({
        memberships: [
          { ...PENDING_MEMBERSHIP, id: 'mm-active', team_id: TEAM_U16.id, status: 'active' },
          PENDING_MEMBERSHIP,
        ],
      }),
    )

    renderShell()

    expect(await screen.findByText('Routed content')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-approval')).not.toBeInTheDocument()
  })

  it('is not shown to somebody with no memberships at all', async () => {
    renderShell()

    expect(await screen.findByRole('button', { name: /add my player/i })).toBeInTheDocument()
    expect(screen.queryByTestId('pending-approval')).not.toBeInTheDocument()
  })
})

describe('Accounts — the approval queue', () => {
  const ADMIN = [{ id: 'm-admin', role: 'admin', team_id: null, club_id: CLUB_ID }]

  const JAY_ADMIN = {
    id: 'mem-jay',
    profile_id: 'profile-jay',
    role: 'admin',
    team_id: null,
    status: 'active',
    created_at: '2026-01-05T09:00:00Z',
    profiles: { full_name: 'Jay Muir', email: 'jay@example.com' },
    teams: null,
  }
  // The self-registered row. Note it carries a linked player and a real
  // profile — that is what distinguishes it from a "waiting for access"
  // stranger, and it is why the card leads with the CHILD's name.
  const HANNAH_PENDING = {
    id: 'mem-hannah',
    profile_id: 'profile-hannah',
    role: 'parent',
    team_id: TEAM_U13.id,
    player_id: 'p-chidi',
    status: 'pending',
    created_at: '2026-08-08T07:15:00Z',
    profiles: { full_name: 'Hannah Okafor', email: 'hannah@example.com' },
    teams: { name: 'U13' },
    players: { full_name: 'Chidi Okafor' },
  }

  function renderAccounts() {
    return render(<Accounts />)
  }

  // ⚠️ THE ACCESS CONTROLS MOVED INTO A SHEET on 9 Aug 2026: the list is a
  // summary, and Role / Age group / Revoke only exist once a person is opened.
  async function openPerson(user, name) {
    const card = screen
      .getAllByTestId('account-person')
      .find((block) => within(block).queryByText(name))
    if (!card) throw new Error(`No account card for "${name}" — check the fixture.`)
    await user.click(within(card).getByRole('button', { name: `Edit ${name}` }))
    return screen.findByRole('dialog')
  }

  beforeEach(() => {
    useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: TEAMS })
    useAuthMock.mockReturnValue({ user: { id: 'profile-jay' }, signOut: vi.fn() })
    listClubMembersMock.mockResolvedValue([JAY_ADMIN, HANNAH_PENDING])
    listPendingProfilesMock.mockResolvedValue([])
    listAccessRequestsMock.mockResolvedValue([])
    listPlayersMock.mockResolvedValue([])
    approveMembershipMock.mockResolvedValue({ id: HANNAH_PENDING.id, status: 'active' })
  })

  it('lists a pending registration in its own section, child first', async () => {
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    const card = within(queue).getByTestId('pending-membership')
    expect(within(card).getByText(/chidi okafor/i)).toBeInTheDocument()
    expect(within(card).getByText(/added by hannah okafor/i)).toBeInTheDocument()
    expect(within(card).getByText('U13')).toBeInTheDocument()
  })

  // ⚠️ THE THIRD CATEGORY. A pending person is neither "has access" nor
  // "asked for access", and putting them in either list misleads an admin:
  // the main list would put them under a Revoke button while telling them
  // that somebody who can see nothing has access.
  it('keeps them out of the main list and out of the waiting-for-access list', async () => {
    renderAccounts()

    await screen.findByTestId('pending-approvals')

    // One block, Jay's. Hannah has no ACTIVE row, so she has no block.
    const blocks = screen.getAllByTestId('account-person')
    expect(blocks).toHaveLength(1)
    expect(within(blocks[0]).getByTestId('account-name')).toHaveTextContent('Jay Muir')

    // And she is not in the other queue either — that one is driven by
    // access_requests and by profiles with NO membership, and she has one.
    expect(
      within(screen.getByTestId('waiting-for-access')).queryByText(/hannah/i),
    ).not.toBeInTheDocument()
  })

  it('counts her as a login, but not as somebody with access', async () => {
    renderAccounts()

    await screen.findByTestId('pending-approvals')
    // 1 with access (Jay) · 1 access row (his) · 2 logins (both of them).
    expect(screen.getByText(/1 with access/)).toHaveTextContent(
      '1 with access · 1 access row · 2 logins',
    )
  })

  it('approves, and the row moves into the main list on the same render', async () => {
    const user = userEvent.setup()
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

    await waitFor(() => expect(approveMembershipMock).toHaveBeenCalledWith(HANNAH_PENDING.id))

    // The queue is gone (it was the only row in it) and Hannah now has a block
    // of her own in the main list, with the revoke control every other member
    // has. That transition is the whole feature: nothing was refetched, the
    // row simply stopped being pending.
    await waitFor(() => expect(screen.queryByTestId('pending-approvals')).not.toBeInTheDocument())
    const blocks = screen.getAllByTestId('account-person')
    expect(blocks).toHaveLength(2)
    const dialog = await openPerson(user, 'Hannah Okafor')
    expect(
      within(dialog).getByRole('button', { name: /revoke access for hannah okafor/i }),
    ).toBeInTheDocument()
  })

  // The refusal now comes from the RPC, which RAISES rather than matching zero
  // rows — see approveMembership in src/data/members.js. Its sentence is passed
  // through untouched, so this asserts the row STAYS rather than the wording.
  it('leaves the row in the queue when the approval is refused', async () => {
    const user = userEvent.setup()
    approveMembershipMock.mockRejectedValue(
      new Error('You can only approve players for your own age groups.'),
    )
    renderAccounts()

    const queue = await screen.findByTestId('pending-approvals')
    await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/your own age groups/i)
    expect(screen.getByTestId('pending-membership')).toBeInTheDocument()
  })

  // ⚠️ THE ROW CAN STILL ARRIVE NAMELESS, and the queue must stay usable when
  // it does. The registration form now asks (see above), but somebody who
  // signed up BEFORE 13 Aug 2026, or who reaches a membership by some other
  // route, can still have a profile with no name. This used to render
  // "Added by No name yet · deniro@example.com" — a placeholder standing in
  // front of the one fact that identifies the person.
  it('falls back to the email address when the registrant has no name yet', async () => {
    listClubMembersMock.mockResolvedValue([
      JAY_ADMIN,
      { ...HANNAH_PENDING, profiles: { full_name: null, email: 'hannah@example.com' } },
    ])
    renderAccounts()

    const card = within(await screen.findByTestId('pending-approvals')).getByTestId(
      'pending-membership',
    )
    expect(card).toHaveTextContent(/added by hannah@example\.com/i)
    expect(card).not.toHaveTextContent(/no name yet/i)
    // ⚠️ ONCE, not twice. The address used to be printed again as its own
    // segment, so promoting it into the name slot without this check would
    // read "Added by hannah@example.com · hannah@example.com".
    expect(card.textContent.match(/hannah@example\.com/g)).toHaveLength(1)
  })

  it('still prints the name AND the address when both are known', async () => {
    renderAccounts()

    const card = within(await screen.findByTestId('pending-approvals')).getByTestId(
      'pending-membership',
    )
    expect(card).toHaveTextContent(/added by hannah okafor/i)
    expect(card).toHaveTextContent(/hannah@example\.com/)
  })

  it('shows no queue at all when nobody is waiting', async () => {
    listClubMembersMock.mockResolvedValue([JAY_ADMIN])
    renderAccounts()

    await screen.findByTestId('waiting-for-access')
    expect(screen.queryByTestId('pending-approvals')).not.toBeInTheDocument()
  })

  // ── The coach / team manager view (Jay, 9 Aug 2026) ──────────────────
  //
  // ⚠️ WHAT THE SCREEN OFFERS IS NOT THE BOUNDARY. private.can_approve_team is,
  // and db/tests/rls-squad-staff-approval.sql proves it live — including that a
  // parent cannot approve themselves. These tests are about what a coach SEES:
  // the queue and nothing else, and no misleading numbers.
  describe('for a coach or team manager', () => {
    const COACH_U13 = [
      { id: 'mem-coach', role: 'coach', team_id: TEAM_U13.id, club_id: CLUB_ID, status: 'active' },
    ]
    const MANAGER_U13 = [
      { id: 'mem-mgr', role: 'manager', team_id: TEAM_U13.id, club_id: CLUB_ID, status: 'active' },
    ]

    it('shows a coach the queue and lets them approve', async () => {
      const user = userEvent.setup()
      useMembershipsMock.mockReturnValue({ memberships: COACH_U13, teams: TEAMS })
      // The database hands a coach only their own squads' pending rows — the
      // admin's own membership is not among them.
      listClubMembersMock.mockResolvedValue([HANNAH_PENDING])
      renderAccounts()

      const queue = await screen.findByTestId('pending-approvals')
      await user.click(within(queue).getByRole('button', { name: /approve chidi okafor/i }))

      await waitFor(() => expect(approveMembershipMock).toHaveBeenCalledWith(HANNAH_PENDING.id))
    })

    it('shows a team manager the same thing', async () => {
      useMembershipsMock.mockReturnValue({ memberships: MANAGER_U13, teams: TEAMS })
      listClubMembersMock.mockResolvedValue([HANNAH_PENDING])
      renderAccounts()

      expect(await screen.findByTestId('pending-approvals')).toBeInTheDocument()
    })

    // ⚠️ MEDIC IS DELIBERATELY EXCLUDED. can_edit_team includes medic — they
    // may edit players on the squad, which is the point of the role — but
    // admitting a stranger to a children's squad is not a medical decision.
    it('refuses a medic, though a medic may edit that very squad', async () => {
      useMembershipsMock.mockReturnValue({
        memberships: [{ id: 'mem-medic', role: 'medic', team_id: TEAM_U13.id, club_id: CLUB_ID }],
        teams: TEAMS,
      })
      renderAccounts()

      expect(await screen.findByRole('alert')).toHaveTextContent(/not authorised/i)
    })

    it('refuses a parent of a child in that very squad', async () => {
      // The case that would make the whole pending design theatre.
      useMembershipsMock.mockReturnValue({
        memberships: [
          { id: 'mem-p', role: 'parent', team_id: TEAM_U13.id, player_id: 'p-x', club_id: CLUB_ID },
        ],
        teams: TEAMS,
      })
      renderAccounts()

      expect(await screen.findByRole('alert')).toHaveTextContent(/not authorised/i)
    })

    it('tells a coach with an empty queue that it is empty, rather than showing nothing', async () => {
      useMembershipsMock.mockReturnValue({ memberships: COACH_U13, teams: TEAMS })
      listClubMembersMock.mockResolvedValue([])
      renderAccounts()

      // A blank screen reads as broken. The empty state says what will appear
      // here and when.
      expect(await screen.findByText(/when a parent registers a player/i)).toBeInTheDocument()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════
//  The duplicate guards — 14 Aug 2026.
//
//  ⚠️ THESE ARE ABOUT THE SCREEN, NOT THE RULE. The matching itself lives in
//  SQL and ONLY in SQL (private.name_match_key), because the registering
//  parent cannot see the roster they are duplicating: their membership is
//  pending, so `player read` returns nothing and any client-side "is this
//  already here?" would answer no every single time. What is tested here is
//  that the refusal reaches the person, that the way past it is offered on the
//  right row, and that the two confirmations stay independent.
//
//  Both guards exist because of real rows on the live roster:
//    42710 — U18B had ONE child on it twice, added by his father's account and
//            by his own, spelled differently.
//    42809 — U14B had a PARENT on it as a player, because the name box got his
//            name while "Who are you registering?" stayed on "My child".
// ══════════════════════════════════════════════════════════════════════════

function refusal(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

async function submitOneChild(user, name, teamId) {
  // Split at the last space: callers pass a whole name and the form now takes
  // two boxes. A one-word name goes in the FIRST box, which is the same rule
  // private.sync_person_name applies in the database.
  const parts = String(name).trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop() : ''
  await user.type(screen.getByLabelText(/player's first name/i), parts.join(' '))
  if (last) await user.type(screen.getByLabelText(/player's family name/i), last)
  await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
  await user.selectOptions(screen.getByLabelText(/age group/i), teamId)
  await user.click(screen.getByRole('button', { name: /add my player/i }))
}

describe('Add your player — the duplicate guards', () => {
  it('shows the server’s sentence when the player is already on the roster', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(shellState())
    registerMyPlayerMock.mockRejectedValue(
      refusal('42710', 'Someone with that name is already registered in U13.'),
    )

    renderShell()
    await submitOneChild(user, 'Chidi Okafor', TEAM_U13.id)

    // ⚠️ THE SERVER'S WORDING, NOT A LOCAL ONE. It names the squad and says
    // what to do instead, which is the part a parent acts on — src/data/
    // members.js deliberately keeps 42710 out of REGISTER_MESSAGES so it
    // survives.
    expect(await screen.findByRole('alert')).toHaveTextContent(/already registered in U13/i)
  })

  it('offers a tick, and sends the confirmation only after it is ticked', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    useMembershipsMock.mockReturnValue(shellState({ reload }))
    registerMyPlayerMock.mockRejectedValueOnce(
      refusal('42710', 'Someone with that name is already registered in U13.'),
    )

    renderShell()
    await submitOneChild(user, 'Chidi Okafor', TEAM_U13.id)
    await screen.findByRole('alert')

    // The first attempt asserted nothing.
    expect(registerMyPlayerMock).toHaveBeenLastCalledWith('Chidi Okafor', TEAM_U13.id, null, false, {
      confirmDuplicate: false,
      confirmSelfName: false,
    })

    registerMyPlayerMock.mockResolvedValue({ id: 'm-new', status: 'pending' })
    await user.click(screen.getByRole('checkbox', { name: /different player who happens/i }))
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    // ⚠️ ONLY the duplicate flag. A single "yes I'm sure" would have waved
    // through the self-name guard as well, which is a different mistake.
    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenLastCalledWith('Chidi Okafor', TEAM_U13.id, null, false, {
        confirmDuplicate: true,
        confirmSelfName: false,
      }),
    )
  })

  it('offers a different tick when the name is the registrant’s own', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(shellState())
    registerMyPlayerMock.mockRejectedValueOnce(
      refusal('42809', 'That is your own name, but you have said you are registering a child.'),
    )

    renderShell()
    await submitOneChild(user, 'Chidi Okafor', TEAM_U13.id)
    await screen.findByRole('alert')

    // ⚠️ THE OTHER TICK, worded for the other mistake. Offering the duplicate
    // wording here would ask a parent to confirm something nobody said.
    expect(
      screen.getByRole('checkbox', { name: /same name as me/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('checkbox', { name: /different player who happens/i }),
    ).not.toBeInTheDocument()

    registerMyPlayerMock.mockResolvedValue({ id: 'm-new', status: 'pending' })
    await user.click(screen.getByRole('checkbox', { name: /same name as me/i }))
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenLastCalledWith('Chidi Okafor', TEAM_U13.id, null, false, {
        confirmDuplicate: false,
        confirmSelfName: true,
      }),
    )
  })

  it('withdraws the confirmation when the name is edited', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(shellState())
    registerMyPlayerMock.mockRejectedValueOnce(
      refusal('42710', 'Someone with that name is already registered in U13.'),
    )

    renderShell()
    await submitOneChild(user, 'Chidi Okafor', TEAM_U13.id)
    await screen.findByRole('alert')
    await user.click(screen.getByRole('checkbox', { name: /different player who happens/i }))

    // ⚠️ THE POINT OF THE TEST. The tick means "yes, THIS name is deliberate".
    // Carrying it across a rewrite would let somebody confirm a warning about
    // one name and then submit a different one with the guard already off.
    registerMyPlayerMock.mockResolvedValue({ id: 'm-new', status: 'pending' })
    // ⚠️ THE FAMILY BOX, DELIBERATELY. Since the split (16 Aug 2026) EITHER box
    // must withdraw the tick, because either one changes who this is — and the
    // family name is the half a "…Jr" edit actually lands on.
    await user.type(screen.getByLabelText(/player's family name/i), ' Jr')
    expect(
      screen.queryByRole('checkbox', { name: /different player who happens/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add my player/i }))
    await waitFor(() =>
      expect(registerMyPlayerMock).toHaveBeenLastCalledWith(
        'Chidi Okafor Jr',
        TEAM_U13.id,
        null,
        false,
        { confirmDuplicate: false, confirmSelfName: false },
      ),
    )
  })

  it('offers no tick for a refusal that is not one of the guards', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(shellState())
    registerMyPlayerMock.mockRejectedValue(
      refusal('42901', 'You already have 5 players waiting to be approved.'),
    )

    renderShell()
    await submitOneChild(user, 'Chidi Okafor', TEAM_U13.id)
    await screen.findByRole('alert')

    // A pending-cap refusal is not something a tick can forgive, and offering
    // one would imply it is.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})

// ── DATE OF BIRTH ─────────────────────────────────────────────────────────
//
// ⚠️ WITHOUT THESE TWO THE FIELD WOULD BE UNTESTED WHILE THE SUITE WENT GREEN.
// Adding the input meant filling it in ~30 existing cases; every one of those
// passes whether the guard exists or not, and none of them looks at the write.
// The same shape of gap the role gate had on the same day.
describe('Add your player — the date of birth', () => {
  it('refuses a blank one without spending a round trip', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
    await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/date of birth/i)
    expect(registerMyPlayerMock).not.toHaveBeenCalled()
  })

  // ⚠️ AGAINST THE PLAYER ID THE RPC RETURNED, and there is no other way to
  // learn it: a pending parent cannot read `players` by name, so a lookup here
  // would return nothing and the birthday would be written against undefined.
  it('writes it against the player id the registration returned', async () => {
    const user = userEvent.setup()
    registerMyPlayerMock.mockResolvedValue({ id: 'mm-1', status: 'pending', player_id: 'p-42' })
    setPlayerDobMock.mockResolvedValue({ player_id: 'p-42', date_of_birth: '2014-03-04' })
    renderShell()

    await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
    await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    await waitFor(() => expect(setPlayerDobMock).toHaveBeenCalledWith('p-42', '2014-03-04'))
  })

  // ⚠️ THE CHILD IS ALREADY REGISTERED WHEN THIS WRITE RUNS. Its transaction is
  // committed and there is no delete path, so surfacing a failure here would
  // tell a parent their child was not added when it was — and the obvious
  // response is to submit again, which is how somebody reaches the five-pending
  // limit without meaning to.
  it('does not report a failed birthday as a failed registration', async () => {
    const user = userEvent.setup()
    registerMyPlayerMock.mockResolvedValue({ id: 'mm-1', status: 'pending', player_id: 'p-42' })
    setPlayerDobMock.mockRejectedValue(new Error('network'))
    renderShell()

    await user.type(screen.getByLabelText(/player's first name/i), 'Chidi')
    await user.type(screen.getByLabelText(/player's family name/i), 'Okafor')
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.selectOptions(screen.getByLabelText(/age group/i), TEAM_U13.id)
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    await waitFor(() => expect(setPlayerDobMock).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
