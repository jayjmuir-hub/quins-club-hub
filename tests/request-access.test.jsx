import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/components/RequestAccess.jsx — what a signed-in account
// with NO membership sees, and the approval gate's user-facing half (see
// db/migrations/20260804_access_requests.sql for why the gate is approval
// rather than closing signup).
//
// The four states are not cosmetic variants of each other; getting the wrong
// one in front of someone is the whole failure mode this component exists to
// avoid. In particular a DISMISSED person must never be shown the form: the
// database gives them no update, delete or second-insert path, so a form
// there would be a button that cannot work.
//
// Same mocking style as tests/name-prompt.test.jsx: both data modules are
// mocked so nothing here can reach a real Supabase client.

const getMyProfileMock = vi.fn()
// Repointed 6 Aug 2026: this screen now writes first/family name via
// updateProfileNames (which also stamps name_confirmed_at), not full_name via
// updateProfileName. Renamed rather than duplicated — a mock for the old
// function would sit here forever, always uncalled, always passing.
const updateProfileNamesMock = vi.fn()
const getMyAccessRequestMock = vi.fn()
const createAccessRequestMock = vi.fn()

vi.mock('../src/data/members.js', () => ({
  getMyProfile: (...args) => getMyProfileMock(...args),
  updateProfileNames: (...args) => updateProfileNamesMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  getMyAccessRequest: (...args) => getMyAccessRequestMock(...args),
  createAccessRequest: (...args) => createAccessRequestMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import RequestAccess from '../src/components/RequestAccess.jsx'

const USER_ID = 'user-1'
const EMAIL = 'newcomer@example.com'

function renderIt(props = {}) {
  return render(
    <RequestAccess userId={USER_ID} email={EMAIL} {...props}>
      <button type="button">Sign out</button>
    </RequestAccess>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getMyAccessRequestMock.mockResolvedValue(null)
  getMyProfileMock.mockResolvedValue({
    id: USER_ID,
    full_name: '',
    first_name: null,
    last_name: null,
    name_confirmed_at: null,
    email: EMAIL,
  })
  updateProfileNamesMock.mockImplementation(async ({ firstName, lastName }) => ({
    first_name: firstName,
    last_name: lastName || null,
  }))
  createAccessRequestMock.mockImplementation(async ({ profileId, note }) => ({
    id: 'req-1',
    profile_id: profileId,
    note: note?.trim() || null,
    status: 'pending',
  }))
})

describe('RequestAccess', () => {
  it('offers the form to someone who has never asked, and prefills their name', async () => {
    getMyProfileMock.mockResolvedValue({
      id: USER_ID,
      full_name: 'Nina Newcomer',
      first_name: 'Nina',
      last_name: 'Newcomer',
    })

    renderIt()

    expect(await screen.findByRole('button', { name: /request access/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Nina')
    expect(screen.getByLabelText(/family name/i)).toHaveValue('Newcomer')
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
  })

  // The blurb added 6 Aug 2026. Its job is to stop someone who expected to be
  // let straight in from concluding they have done something wrong, and to
  // offer the fix most of them can apply themselves. Asserted because it is
  // the entire reason this screen exists under roster onboarding — copy that
  // silently regresses to "ask an admin" is a support-request generator.
  it('reassures a non-matched person and names the address that failed', async () => {
    renderIt()

    await screen.findByRole('button', { name: /request access/i })
    expect(screen.getByText(/nothing has gone wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/different email for you/i)).toBeInTheDocument()
    expect(screen.getByText(EMAIL)).toBeInTheDocument()
  })

  it('does not promise an email it cannot send', async () => {
    getMyAccessRequestMock.mockResolvedValue({ id: 'ar-1', status: 'pending', note: null })

    renderIt()

    // The old copy said "We'll email <address> once someone has approved it".
    // Nothing in this app sends that message — see the comment in
    // RequestAccess.jsx. This asserts the promise stays retracted.
    expect(await screen.findByText(/request is with the club/i)).toBeInTheDocument()
    expect(screen.queryByText(/we'll email/i)).not.toBeInTheDocument()
  })

  it('saves the name before the request, then confirms it was sent', async () => {
    const user = userEvent.setup()
    renderIt()

    await screen.findByRole('button', { name: /request access/i })
    await user.type(screen.getByLabelText(/first name/i), 'Nina')
    await user.type(screen.getByLabelText(/family name/i), 'Newcomer')
    await user.type(screen.getByLabelText(/who are you at the club/i), 'Parent of Sam, U10')
    await user.click(screen.getByRole('button', { name: /request access/i }))

    await waitFor(() =>
      expect(updateProfileNamesMock).toHaveBeenCalledWith({
        profileId: USER_ID,
        firstName: 'Nina',
        lastName: 'Newcomer',
      }),
    )
    expect(createAccessRequestMock).toHaveBeenCalledWith({
      profileId: USER_ID,
      note: 'Parent of Sam, U10',
    })

    // The confirmation replaces the form — no way to send a second request,
    // which matches the UNIQUE key that would refuse one anyway.
    expect(await screen.findByText(/request is with the club/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request access/i })).toBeNull()
    expect(screen.getByText(/Parent of Sam, U10/)).toBeInTheDocument()
  })

  it('refuses to send a nameless request, and never writes anything', async () => {
    const user = userEvent.setup()
    renderIt()

    await screen.findByRole('button', { name: /request access/i })
    await user.click(screen.getByRole('button', { name: /request access/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your first name/i)
    expect(updateProfileNamesMock).not.toHaveBeenCalled()
    expect(createAccessRequestMock).not.toHaveBeenCalled()
  })

  it('keeps the form usable when the write fails', async () => {
    const user = userEvent.setup()
    createAccessRequestMock.mockRejectedValue(new Error('Network is down'))
    renderIt()

    await screen.findByRole('button', { name: /request access/i })
    await user.type(screen.getByLabelText(/first name/i), 'Nina')
    await user.click(screen.getByRole('button', { name: /request access/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network is down')
    expect(screen.getByRole('button', { name: /request access/i })).toBeEnabled()
  })

  it('tells someone already waiting that they are waiting, with no form', async () => {
    getMyAccessRequestMock.mockResolvedValue({
      id: 'req-1',
      profile_id: USER_ID,
      note: 'Parent of Sam, U10',
      status: 'pending',
    })

    renderIt()

    expect(await screen.findByText(/request is with the club/i)).toBeInTheDocument()
    expect(screen.getByText(/Parent of Sam, U10/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request access/i })).toBeNull()
  })

  it('shows a dismissed person a refusal and NO form to ask again', async () => {
    getMyAccessRequestMock.mockResolvedValue({
      id: 'req-1',
      profile_id: USER_ID,
      note: null,
      status: 'dismissed',
    })

    renderIt()

    expect(await screen.findByText(/access not approved/i)).toBeInTheDocument()
    // The database refuses a second request outright (no update/delete policy
    // for the owner, plus a UNIQUE key), so offering the form here would be
    // offering a control that cannot work.
    expect(screen.queryByRole('button', { name: /request access/i })).toBeNull()
    expect(screen.queryByLabelText(/first name/i)).toBeNull()
  })

  it('falls back to a plain message, not a form, when the request read fails', async () => {
    getMyAccessRequestMock.mockRejectedValue(new Error('nope'))

    renderIt()

    expect(await screen.findByText(/couldn't check whether you've already asked/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request access/i })).toBeNull()
  })

  it('still renders the form when only the profile read fails', async () => {
    // The profile only prefills a text box. Losing it must not cost someone
    // their ability to ask for access.
    getMyProfileMock.mockRejectedValue(new Error('nope'))

    renderIt()

    expect(await screen.findByRole('button', { name: /request access/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toHaveValue('')
  })

  it('offers sign-out in every state — nobody gets trapped', async () => {
    const states = [null, { status: 'pending' }, { status: 'dismissed' }]

    for (const state of states) {
      getMyAccessRequestMock.mockResolvedValue(state)
      const { unmount } = renderIt()
      expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument()
      unmount()
    }
  })
})
