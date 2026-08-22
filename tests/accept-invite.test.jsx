import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Unit tests for src/screens/AcceptInvite.jsx (Task 18): the invitee-facing
// screen reached via /accept-invite/:token. acceptInvite and useMemberships
// are mocked, so this exercises only the screen's own load/success/failure
// behaviour — never a real network call, and never the real
// MembershipProvider.

const acceptInviteMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  acceptInvite: (...args) => acceptInviteMock(...args),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Imported after vi.mock so this binds to the mocked modules.
import AcceptInvite from '../src/screens/AcceptInvite.jsx'

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

function renderScreen(token = 'tok-abc-123', { strict = false } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[`/accept-invite/${token}`]} future={routerFuture}>
      <Routes>
        <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        <Route path="/" element={<div>Home screen marker</div>} />
      </Routes>
    </MemoryRouter>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

const reloadMock = vi.fn()

beforeEach(() => {
  acceptInviteMock.mockReset()
  useMembershipsMock.mockReset()
  reloadMock.mockReset()
  useMembershipsMock.mockReturnValue({
    memberships: [],
    teams: [],
    loading: false,
    error: null,
    reload: reloadMock,
  })
})

describe('AcceptInvite', () => {
  it('shows a loading state while acceptInvite is in flight', () => {
    acceptInviteMock.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('calls acceptInvite with the token from the URL', async () => {
    acceptInviteMock.mockResolvedValue({ id: 'm-new', role: 'coach', team_id: 't-u12' })

    renderScreen('tok-xyz-789')

    await waitFor(() => expect(acceptInviteMock).toHaveBeenCalledWith('tok-xyz-789'))
  })

  it('reloads memberships and navigates home on success', async () => {
    acceptInviteMock.mockResolvedValue({ id: 'm-new', role: 'coach', team_id: 't-u12' })

    renderScreen()

    await waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Home screen marker')).toBeInTheDocument()
  })

  it("shows the RPC's actual error message in an alert region on failure, without a generic wrapper", async () => {
    acceptInviteMock.mockRejectedValue(
      new Error('This invite was sent to a different email address than the one you signed in with.'),
    )

    renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite was sent to a different email address than the one you signed in with.',
    )
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  it('does not reload or navigate home on failure', async () => {
    acceptInviteMock.mockRejectedValue(new Error('This invite has already been used.'))

    renderScreen()

    await screen.findByRole('alert')
    expect(reloadMock).not.toHaveBeenCalled()
    expect(screen.queryByText('Home screen marker')).not.toBeInTheDocument()
  })

  it('calls acceptInvite exactly once even if the screen re-renders', async () => {
    acceptInviteMock.mockResolvedValue({ id: 'm-new' })

    renderScreen()

    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
    expect(acceptInviteMock).toHaveBeenCalledTimes(1)
  })

  it('shows crest branding on the loading and error states', async () => {
    acceptInviteMock.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByText('Abu Dhabi Harlequins')).toBeInTheDocument()
    expect(screen.getByAltText('Abu Dhabi Harlequins crest')).toBeInTheDocument()
  })

  // Regression test for D1: React 18 StrictMode double-invokes effects in
  // dev (mount -> synchronous cleanup -> remount, before first paint). A
  // previous version of this screen combined a `calledRef` guard with a
  // `mounted` ref, and the throwaway first mount's cleanup permanently set
  // `mounted = false` before the real (still in-flight) acceptInvite promise
  // settled, silently swallowing the eventual success/failure and leaving
  // the screen stuck on "Accepting your invite..." forever. Rendering with
  // <StrictMode> here reproduces that double-invoke in this test environment
  // and asserts the full success sequence (reload + navigate home) still
  // completes despite it.
  it('still completes the accept flow under React StrictMode double-invoke', async () => {
    acceptInviteMock.mockResolvedValue({ id: 'm-new', role: 'coach', team_id: 't-u12' })

    renderScreen('tok-strict-1', { strict: true })

    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
    expect(await screen.findByText('Home screen marker')).toBeInTheDocument()
    // acceptInvite may be invoked by both the throwaway and real StrictMode
    // mounts' effects in principle, but calledRef must prevent that: only
    // the genuine mount's effect should ever call it.
    expect(acceptInviteMock).toHaveBeenCalledTimes(1)
  })

  it('still shows the error alert under React StrictMode double-invoke', async () => {
    acceptInviteMock.mockRejectedValue(new Error('This invite has already been used.'))

    renderScreen('tok-strict-2', { strict: true })

    expect(await screen.findByRole('alert')).toHaveTextContent('This invite has already been used.')
    expect(acceptInviteMock).toHaveBeenCalledTimes(1)
  })
})
