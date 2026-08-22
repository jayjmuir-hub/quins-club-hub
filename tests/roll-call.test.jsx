import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/components/RollCall.jsx — the one screen a signed-in account with no
// membership sees. Item 5 of
// claude/plans/2026-08-16-account-creation-redesign.md.
//
// ══ WHAT THIS FILE IS ACTUALLY DEFENDING ═════════════════════════════════
//
// The screen it replaced was a FORK: "Add your player", with a button reading
// "I'm not adding a player" that swapped in the ask-the-club form. They were
// mutually exclusive, so the branch somebody picked in their first ten seconds
// decided what the club knew about them from then on — a coach who came through
// the parent door was never once asked whether he coaches. Jay: "i have coaches
// signing up without adding their kids, its chaotic right now".
//
// So the assertions that matter here are not "the checkbox renders". They are:
// that several answers can be true at once and all of them are taken; that the
// provider reload happens ONCE and LAST, because doing it per-section unmounts
// the screen and silently discards every unanswered question; and that the name
// is written before anything reaches an approval queue.
//
// Only the data modules are mocked, so the real RollCall, AddYourPlayer,
// PlayerRegistrationForm and RequestAccess all render.

const getMyProfileMock = vi.fn()
const updateProfileNamesMock = vi.fn()
const requestStaffRoleMock = vi.fn()
const registerMyPlayerMock = vi.fn()
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()
const setPlayerDobMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'rowan@example.com' }, signOut: vi.fn() }),
}))

vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
  requestStaffRole: (...args) => requestStaffRoleMock(...args),
  registerMyPlayer: (...args) => registerMyPlayerMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  getMyAccessRequest: (...args) => getMyAccessRequestMock(...args),
  createAccessRequest: (...args) => createAccessRequestMock(...args),
  listSquadsForRequest: async () => [{ id: 't-u13', name: 'U13', sort_order: 3 }],
}))

vi.mock('../src/data/players.js', () => ({
  setPlayerDob: (...args) => setPlayerDobMock(...args),
}))

import RollCall from '../src/components/RollCall.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

// Invented, as everything published from this repo must be.
const TEAMS = [
  { id: 't-u16', club_id: 'club-1', name: 'U16', sort_order: 6 },
  { id: 't-u13', club_id: 'club-1', name: 'U13', sort_order: 3 },
]

function renderRollCall(props = {}) {
  const onDone = vi.fn()
  const utils = render(
    <RollCall teams={TEAMS} userId="user-1" email="rowan@example.com" onDone={onDone} {...props}>
      <button type="button">Sign out</button>
    </RollCall>,
  )
  return { ...utils, onDone }
}

const box = (name) => screen.getByRole('checkbox', { name })
const CONTINUE = { name: /^continue$/i }

/**
 * ⚠️ THE FIRST SCREEN NOW DEMANDS A SQUAD — 20 Aug 2026. It used to take a
 * tick and a name and let people through; what they actually wanted was asked
 * on the NEXT screen, so anybody who stopped in between left a named profile
 * and nothing else. Three people were waiting in exactly that state.
 *
 * ⚠️ FOUND BY THE FIELDSET'S LEGEND, NOT BY A SQUAD NAME. Every one of these
 * files names its squads differently ('U13', 'U12 Boys', 'U16G Contact'), and
 * a helper that hard-coded one would break the moment a fixture changed for
 * reasons that have nothing to do with the roll-call.
 */
async function pickSquadThenContinue(user) {
  const group = screen.queryByRole('group', { name: /which squad/i })
  if (group) {
    const boxes = within(group).queryAllByRole('checkbox')
    if (boxes.length && !boxes.some((box) => box.checked)) await user.click(boxes[0])
  }
  // ⚠️ THE STAFF ROLE IS REQUIRED HERE TOO when the staff box is ticked:
  // requested_role is CHECKed against a fixed list, so "staff" alone cannot be
  // written. Left unchosen, the submit is refused and the next screen never
  // arrives — which reads as a missing screen, not a missing answer.
  const role = screen.queryByLabelText(/what do you do/i)
  if (role && !role.value) {
    const first = [...role.options].find((option) => option.value)
    if (first) await user.selectOptions(role, first.value)
  }
  await user.click(await screen.findByRole('button', { name: /^continue$/i }))
}


// ⚠️ THE CLOCK IS PINNED, FOR THE SAME REASON tests/parent-self-registration
// pins it: age-grade eligibility is judged at the 31 August cut-off, so which
// squad a fixed birthday belongs to changes on that date every year. The DOB
// below fits U13 for the 2026/27 season; on the real clock this file would
// start demanding a play-up consent tick on 31 Aug 2027, in tests about the
// roll-call.
//
// `toFake: ['Date']` only — faking the timers as well hangs userEvent.
const IN_SEASON = new Date('2026-11-07T09:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(IN_SEASON)
  clearMyProfileCache()
  vi.clearAllMocks()
  // ⚠️ A DEFAULT RESOLUTION, BECAUSE THE FIRST SCREEN NOW WRITES THE REQUEST.
  // RollCall records what the person asked for in the same submit as their
  // name (20 Aug 2026). A bare vi.fn() returns undefined, and the .then on it
  // throws before the screen advances — which reads as every test in the file
  // failing to find the NEXT screen, not as a missing mock.
  createAccessRequestMock.mockResolvedValue({ id: 'req-1', status: 'pending' })
  getMyProfileMock.mockResolvedValue({
    id: 'user-1',
    first_name: 'Rowan',
    last_name: 'Ashby',
    name_confirmed_at: '2026-08-01T00:00:00Z',
    email: 'rowan@example.com',
  })
  getMyAccessRequestMock.mockResolvedValue(null)
  updateProfileNamesMock.mockResolvedValue({
    id: 'user-1',
    first_name: 'Rowan',
    name_confirmed_at: '2026-08-17T00:00:00Z',
  })
  requestStaffRoleMock.mockResolvedValue({ id: 'mm-staff', status: 'pending' })
  registerMyPlayerMock.mockResolvedValue({ id: 'mm-child', player_id: 'p-1', status: 'pending' })
  setPlayerDobMock.mockResolvedValue({ player_id: 'p-1' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the ask', () => {
  it('offers every answer, with nothing pre-selected', async () => {
    renderRollCall()
    await screen.findByRole('button', CONTINUE)

    // ⚠️ NOTHING TICKED. Defaulting to "Parent" would be right most of the time,
    // which is exactly the problem: every coach who does not read the screen
    // would file as a parent, which is the same "no idea who they are" bug
    // wearing a more confident face.
    for (const answer of screen.getAllByRole('checkbox')) expect(answer).not.toBeChecked()

    expect(box(/child playing here/i)).toBeInTheDocument()
    expect(box(/play here myself/i)).toBeInTheDocument()
    // ⚠️ MEDIC IS HERE, WITH COACH AND MANAGER, not under "another way". It is
    // squad-scoped staff and request_staff_role accepts it; the plan's first
    // draft filed it as a volunteer and was wrong.
    expect(box(/coach, manage or medic/i)).toBeInTheDocument()
    expect(box(/help the club another way/i)).toBeInTheDocument()
  })

  it('refuses an empty answer rather than guessing one', async () => {
    const user = userEvent.setup()
    const { onDone } = renderRollCall()

    await pickSquadThenContinue(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/tick at least one/i)
    expect(onDone).not.toHaveBeenCalled()
    expect(requestStaffRoleMock).not.toHaveBeenCalled()
  })

  // Checkboxes, not radios: the whole point is that several are true at once.
  it('takes more than one answer', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /child playing here/i }))
    await user.click(box(/coach, manage or medic/i))

    expect(box(/child playing here/i)).toBeChecked()
    expect(box(/coach, manage or medic/i)).toBeChecked()
  })
})

describe('the name', () => {
  function unnamed() {
    getMyProfileMock.mockResolvedValue({
      id: 'user-1',
      first_name: null,
      last_name: null,
      name_confirmed_at: null,
      email: 'rowan@example.com',
    })
  }

  it('is not asked of somebody who has already given it', async () => {
    renderRollCall()
    await screen.findByRole('button', CONTINUE)
    expect(screen.queryByLabelText(/your first name/i)).not.toBeInTheDocument()
  })

  // ⚠️ THE REASON IT IS ASKED HERE AND NOT LATER. request_staff_role creates a
  // pending membership that a coach sees in an approval queue rendered from
  // profiles.full_name — so a nameless account arrives there as "Unnamed
  // member", which is a request nobody can act on.
  it('is written before anything reaches an approval queue', async () => {
    const user = userEvent.setup()
    unnamed()

    const order = []
    updateProfileNamesMock.mockImplementation(async () => {
      order.push('name')
      return { id: 'user-1', first_name: 'Rowan', name_confirmed_at: '2026-08-17T00:00:00Z' }
    })
    requestStaffRoleMock.mockImplementation(async () => {
      order.push('staff')
      return { id: 'mm-staff', status: 'pending' }
    })

    renderRollCall()
    await user.click(await screen.findByRole('checkbox', { name: /coach, manage or medic/i }))
    await user.type(screen.getByLabelText(/your first name/i), 'Rowan')
    await user.type(screen.getByLabelText(/your family name/i), 'Ashby')
    await pickSquadThenContinue(user)

    await user.selectOptions(await screen.findByLabelText(/what do you do/i), 'coach')
    await user.selectOptions(screen.getByLabelText(/which squad/i), 't-u13')
    await user.click(screen.getByRole('button', { name: /ask to be approved/i }))

    await waitFor(() => expect(requestStaffRoleMock).toHaveBeenCalled())
    expect(order).toEqual(['name', 'staff'])
  })

  // ⚠️ BOTH NAMES, WHICH IS *NOT* THE RULE NamePrompt APPLIES. That gate
  // confirms the name of somebody the club already holds a membership for and
  // leaves the family name optional. This is a stranger asking to reach a
  // children's squad, and a coach has to recognise them from the queue row:
  // "Rowan" does not do that. Moving the question here must not relax it.
  it('requires a family name, unlike the sign-in gate', async () => {
    const user = userEvent.setup()
    unnamed()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /child playing here/i }))
    await user.type(screen.getByLabelText(/your first name/i), 'Rowan')
    await pickSquadThenContinue(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/family name/i)
    expect(updateProfileNamesMock).not.toHaveBeenCalled()
  })
})

describe('the sections', () => {
  // ⚠️ THE ASSERTION THIS WHOLE SCREEN TURNS ON. AppShell renders the roll-call
  // while `memberships.length === 0`, and only `reload` changes that. Calling it
  // when the first section finishes unmounts the screen with every remaining
  // question unasked — no error, nothing on screen to notice.
  it('does NOT reload the provider between sections', async () => {
    const user = userEvent.setup()
    const { onDone } = renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /child playing here/i }))
    await user.click(box(/coach, manage or medic/i))
    await pickSquadThenContinue(user)

    // Staff first, and finishing it must NOT end the screen.
    await user.selectOptions(await screen.findByLabelText(/what do you do/i), 'coach')
    await user.selectOptions(screen.getByLabelText(/which squad/i), 't-u13')
    await user.click(screen.getByRole('button', { name: /ask to be approved/i }))

    await waitFor(() => expect(requestStaffRoleMock).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
    // …and the child question is still standing.
    expect(await screen.findByLabelText(/player's first name/i)).toBeInTheDocument()
  })

  // ⚠️ THE SAME RULE FROM THE OTHER SIDE, AND THE TEST ABOVE DOES NOT COVER IT.
  // Injecting the fault — `onRegistered={onDone}` on the players section — left
  // the whole file green, because the case above finishes the STAFF section and
  // every other case had players LAST, where reloading is correct. Only a run
  // with a question AFTER the registration form can see it. That is exactly the
  // "check what the existing tests can actually see" trap this project keeps
  // meeting.
  it('does not reload when a question still follows the registration form', async () => {
    const user = userEvent.setup()
    const { onDone } = renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /child playing here/i }))
    await user.click(box(/help the club another way/i))
    await pickSquadThenContinue(user)

    await user.type(await screen.findByLabelText(/player's first name/i), 'Ada')
    await user.type(screen.getByLabelText(/player's family name/i), 'Ashby')
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.selectOptions(screen.getByLabelText(/age group/i), 't-u13')
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    // The volunteer question is still to come, so the screen must stay.
    expect(await screen.findByRole('button', { name: /request access/i })).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('reloads once, after the last answer', async () => {
    const user = userEvent.setup()
    const { onDone } = renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /child playing here/i }))
    await pickSquadThenContinue(user)

    await user.type(await screen.findByLabelText(/player's first name/i), 'Ada')
    await user.type(screen.getByLabelText(/player's family name/i), 'Ashby')
    await user.type(screen.getByLabelText(/date of birth/i), '2014-03-04')
    await user.selectOptions(screen.getByLabelText(/age group/i), 't-u13')
    await user.click(screen.getByRole('button', { name: /add my player/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('sends the squad and the role it was told', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /coach, manage or medic/i }))
    await pickSquadThenContinue(user)

    await user.selectOptions(await screen.findByLabelText(/what do you do/i), 'medic')
    await user.selectOptions(screen.getByLabelText(/which squad/i), 't-u16')
    await user.click(screen.getByRole('button', { name: /ask to be approved/i }))

    await waitFor(() => expect(requestStaffRoleMock).toHaveBeenCalledWith('t-u16', 'medic'))
  })

  // ⚠️ NOT OPTIONAL POLISH. Somebody who ticked this by mistake, or whose squad
  // is not on the list, would otherwise be stranded here with the children they
  // came to register permanently out of reach behind it.
  it('lets the staff question be skipped without writing anything', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /child playing here/i }))
    await user.click(box(/coach, manage or medic/i))
    await pickSquadThenContinue(user)

    await user.click(await screen.findByRole('button', { name: /skip this for now/i }))

    expect(await screen.findByLabelText(/player's first name/i)).toBeInTheDocument()
    expect(requestStaffRoleMock).not.toHaveBeenCalled()
  })

  it('refuses a staff claim with no squad, before spending a round trip', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /coach, manage or medic/i }))
    await pickSquadThenContinue(user)

    await user.selectOptions(await screen.findByLabelText(/what do you do/i), 'coach')
    await user.click(screen.getByRole('button', { name: /ask to be approved/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/which squad/i)
    expect(requestStaffRoleMock).not.toHaveBeenCalled()
  })

  // ⚠️ SAID BEFORE THEY ASK, NOT AFTER. Somebody who claims a squad and then
  // finds its roster empty will assume the app is broken. request_staff_role
  // writes a PENDING membership: fixtures and nothing else.
  it('says what a staff claim is worth before it is made', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /coach, manage or medic/i }))
    await pickSquadThenContinue(user)

    expect(await screen.findByText(/approves this/i)).toBeInTheDocument()
    expect(screen.getByText(/not the players/i)).toBeInTheDocument()
  })

  it('hands a volunteer to the ask-the-club form', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await user.click(await screen.findByRole('checkbox', { name: /help the club another way/i }))
    await pickSquadThenContinue(user)

    expect(await screen.findByRole('button', { name: /request access/i })).toBeInTheDocument()
  })
})

describe('somebody who already asked', () => {
  // ⚠️ THEY MUST NOT MEET THE TICKS AGAIN. access_requests has a UNIQUE key on
  // profile_id, so re-filing surfaces as a database error to somebody who did
  // nothing wrong — and being asked the same question twice reads as the app
  // having lost their answer.
  it('goes straight to the state of their request', async () => {
    getMyAccessRequestMock.mockResolvedValue({ id: 'req-1', status: 'pending', note: null, requested_role: 'volunteer' })
    renderRollCall()

    expect(await screen.findByText(/request is with the club/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })


  it('⚠️ a PARENT who already asked is NOT sent to the terminal screen', async () => {
    // ⚠️ THE REGRESSION THIS EXISTS TO STOP, shipped and caught the same day.
    // Until 20 Aug only the "I help another way" tick wrote a request, so the
    // presence of one really did mean "waiting on an admin, nothing more to
    // ask". The first screen now writes one for EVERYBODY — so reading it as
    // "finished" sent a parent who chose their squads and closed the tab to
    // RequestAccess, which is terminal, and they could never add their child.
    //
    // Registering a child and claiming a squad both write a membership row, and
    // this screen only renders when there are none — so anyone still seeing it
    // has finished nothing, whatever they already asked for.
    getMyAccessRequestMock.mockResolvedValue({
      id: 'req-1',
      status: 'pending',
      note: null,
      requested_role: 'parent',
    })
    renderRollCall()

    expect(await screen.findByRole('checkbox', { name: /child playing here/i })).toBeInTheDocument()
    expect(screen.queryByText(/request is with the club/i)).toBeNull()
  })
  it('shows a dismissed person the refusal, not a form', async () => {
    getMyAccessRequestMock.mockResolvedValue({ id: 'req-1', status: 'dismissed', note: null, requested_role: 'volunteer' })
    renderRollCall()

    expect(await screen.findByText(/hasn't approved access/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request access/i })).toBeNull()
  })

  // ⚠️ NEITHER READ MAY TAKE THE SCREEN DOWN. Somebody locked out of the club
  // meeting a page that will not load has no way forward at all.
  it('still asks when both reads fail', async () => {
    getMyAccessRequestMock.mockRejectedValue(new Error('offline'))
    getMyProfileMock.mockRejectedValue(new Error('offline'))
    renderRollCall()

    expect(await screen.findByRole('button', CONTINUE)).toBeInTheDocument()
    // ⚠️ AND IT ASKS FOR THE NAME, because the safe default when we cannot tell
    // is to ask for one we may already have. The opposite default puts "Unnamed
    // member" in a coach's queue.
    expect(screen.getByLabelText(/your first name/i)).toBeInTheDocument()
  })
})

describe('the way out', () => {
  it('offers sign-out on every step', async () => {
    const user = userEvent.setup()
    renderRollCall()

    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()

    await user.click(box(/coach, manage or medic/i))
    await pickSquadThenContinue(user)
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})

describe('the squads, asked on the first screen', () => {
  // ⚠️ THE WHOLE POINT OF THE CHANGE, 20 Aug 2026. The name used to be saved on
  // screen one and what the person actually WANTED on screen two, so anybody who
  // stopped in between left a named profile and nothing else. Measured on
  // production that day: three people waiting, all confirmed, all signed in,
  // none with a request row, two of them named.

  async function tick(user, name) {
    await user.click(await screen.findByRole('checkbox', { name }))
  }

  it('records every squad chosen, not just the first', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await tick(user, /child playing here/i)
    const squads = await screen.findByRole('group', { name: /which squad/i })
    const boxes = within(squads).getAllByRole('checkbox')
    await user.click(boxes[0])
    await user.click(boxes[1])
    await user.click(await screen.findByRole('button', { name: /^continue$/i }))

    await waitFor(() => expect(createAccessRequestMock).toHaveBeenCalled())
    const sent = createAccessRequestMock.mock.calls[0][0]
    expect(sent.teamIds).toHaveLength(2)
    expect(sent.role).toBe('parent')
    expect(sent.profileId).toBe('user-1')
  })

  it('⚠️ refuses to continue with no squad, rather than recording a name and nothing else', async () => {
    const user = userEvent.setup()
    renderRollCall()

    await tick(user, /child playing here/i)
    await user.click(await screen.findByRole('button', { name: /^continue$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one squad/i)
    expect(createAccessRequestMock).not.toHaveBeenCalled()
  })

  it('⚠️ asks which staff role, because "staff" alone cannot be written', async () => {
    // requested_role is CHECKed against a fixed list and the INSERT policy
    // requires it. Coach, manager and medic are three different claims and
    // guessing one would put a wrong answer in front of whoever approves it.
    const user = userEvent.setup()
    renderRollCall()

    await tick(user, /coach, manage or medic/i)
    const squads = await screen.findByRole('group', { name: /which squad/i })
    await user.click(within(squads).getAllByRole('checkbox')[0])
    await user.click(await screen.findByRole('button', { name: /^continue$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/coach, manage or medic/i)
    expect(createAccessRequestMock).not.toHaveBeenCalled()
  })
})
