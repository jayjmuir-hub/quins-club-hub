import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Jay, 14 Aug 2026: "the request a pitch option should not be available when
// Away is selected for the match."
//
// An away match is played on somebody else's ground, so there is no pitch of
// ours to ask for — and offering the button put a request into the allocator's
// queue for a fixture the club is not hosting.
//
// ⚠️ THIS IS THE FIRST TEST TO RENDER PitchRequest AT ALL. Nothing exercised the
// component directly before today; the only coverage was tests/allocation.test.jsx,
// which is the OTHER end of the flow. So these also pin the gate that was already
// there (canEdit, and a pitch already allocated), not just the new arm.

const listPitchRequestsMock = vi.fn()

vi.mock('../src/data/pitchRequests.js', () => ({
  listPitchRequests: (...args) => listPitchRequestsMock(...args),
  requestPitch: vi.fn(),
  withdrawRequest: vi.fn(),
}))
vi.mock('../src/data/pitches.js', () => ({ PITCH_TBD: 'Pitch TBD' }))

import PitchRequest from '../src/components/PitchRequest.jsx'

const BASE = { id: 'e-1', type: 'match', pitch: null }

function renderFor(event, { canEdit = true } = {}) {
  render(<PitchRequest event={{ ...BASE, ...event }} canEdit={canEdit} />)
}

/** The component returns null while loading, so every assertion waits it out. */
const offer = () => screen.queryByRole('button', { name: 'Request a pitch' })

beforeEach(() => {
  vi.clearAllMocks()
  listPitchRequestsMock.mockResolvedValue([])
})

describe('PitchRequest — away matches have no pitch to ask for', () => {
  it('does NOT offer a pitch for an away match', async () => {
    renderFor({ home: false })
    await waitFor(() => expect(listPitchRequestsMock).toHaveBeenCalled())
    expect(offer()).not.toBeInTheDocument()
  })

  it('still offers a pitch for a home match', async () => {
    renderFor({ home: true })
    await waitFor(() => expect(offer()).toBeInTheDocument())
  })

  it('⚠️ still offers a pitch for TRAINING, whose `home` is NULL', async () => {
    // ⚠️ THE TRAP THIS TEST EXISTS FOR. EventForm writes `home: null` for every
    // training and social, so a `!event.home` check would have hidden the button
    // from the MAJORITY of the fixtures that actually want a pitch — the club
    // trains far more often than it plays. Only a strict `=== false` is correct.
    renderFor({ type: 'training', home: null })
    await waitFor(() => expect(offer()).toBeInTheDocument())
  })

  it('still offers a pitch when nobody has said home or away', async () => {
    // A NULL means "nobody said", not "away" — the same rule the dashboard hero
    // follows when it declines to render a home/away chip for a null.
    renderFor({ home: null })
    await waitFor(() => expect(offer()).toBeInTheDocument())
  })

  it('KEEPS an existing request visible on an away match, so it can be withdrawn', async () => {
    // ⚠️ THE REASON THE GATE JOINS THE "no request" BRANCH RATHER THAN BEING A
    // BLANKET EARLY RETURN. Switch a fixture to Away after requesting a pitch
    // and the coach must still be able to take the request back — otherwise the
    // allocator holds a request for a match nobody is hosting, and nothing on
    // the coach's screen points at it.
    listPitchRequestsMock.mockResolvedValue([
      { id: 'r-1', event_id: 'e-1', status: 'submitted', needs_referee: false, note: null },
    ])
    renderFor({ home: false })
    await waitFor(() => expect(screen.getByTestId('pitch-request-status')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /withdraw request/i })).toBeInTheDocument()
  })

  it('shows a DECLINED request on an away match too', async () => {
    // The component's header rule: this is the only place a decline is visible,
    // because a declined request deliberately leaves the fixture on Pitch TBD.
    listPitchRequestsMock.mockResolvedValue([
      {
        id: 'r-2',
        event_id: 'e-1',
        status: 'declined',
        needs_referee: false,
        note: null,
        decision_note: 'All pitches booked that morning.',
      },
    ])
    renderFor({ home: false })
    await waitFor(() =>
      expect(screen.getByText('All pitches booked that morning.')).toBeInTheDocument(),
    )
  })
})

describe('PitchRequest — the gates that were already there', () => {
  it('offers nothing to somebody who cannot edit the fixture', async () => {
    renderFor({ home: true }, { canEdit: false })
    await waitFor(() => expect(listPitchRequestsMock).toHaveBeenCalled())
    expect(offer()).not.toBeInTheDocument()
  })

  it('offers nothing once a real pitch is allocated', async () => {
    renderFor({ home: true, pitch: 'Pitch 3' })
    await waitFor(() => expect(listPitchRequestsMock).toHaveBeenCalled())
    expect(offer()).not.toBeInTheDocument()
  })

  it('DOES offer when the pitch is the TBD placeholder', async () => {
    // "Pitch TBD" means not allocated yet, which is exactly when you ask.
    renderFor({ home: true, pitch: 'Pitch TBD' })
    await waitFor(() => expect(offer()).toBeInTheDocument())
  })
})
