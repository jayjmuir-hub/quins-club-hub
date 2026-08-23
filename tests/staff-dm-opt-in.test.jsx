import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The guardian's opt-in for a U16+ player to be messaged by their squad's
// coach or manager (squad chat phase 3). The trigger is the rule; this is
// the polite front, and it must be INVISIBLE wherever the rule would refuse.

const setStaffDmOptInMock = vi.fn()
const maybeSingleMock = vi.fn()
vi.mock('../src/data/messages.js', () => ({ setStaffDmOptIn: (...a) => setStaffDmOptInMock(...a) }))
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingleMock() }) }) }),
  },
}))

import StaffDmOptIn from '../src/components/StaffDmOptIn.jsx'

const PLAYER = { id: 'p1', full_name: 'Zz Probe Sixteen' }

beforeEach(() => {
  vi.clearAllMocks()
  maybeSingleMock.mockResolvedValue({ data: { staff_dm_opt_in: false, staff_dm_opt_in_at: null }, error: null })
  setStaffDmOptInMock.mockResolvedValue(undefined)
})

describe('StaffDmOptIn', () => {
  it('renders nothing for a U12 squad, and nothing for the player themself on a U16 squad', () => {
    const { container, rerender } = render(<StaffDmOptIn player={PLAYER} teamName="U12 Mixed" isGuardian />)
    expect(container).toBeEmptyDOMElement()
    rerender(<StaffDmOptIn player={PLAYER} teamName="U16B" isGuardian={false} />)
    expect(container).toBeEmptyDOMElement()
    expect(maybeSingleMock).not.toHaveBeenCalled()
  })

  it('offers the switch to a guardian of a U16 player, off by default, and writes the flip', async () => {
    const user = userEvent.setup()
    render(<StaffDmOptIn player={PLAYER} teamName="U16B" isGuardian />)
    const sw = await screen.findByRole('switch', { name: 'Allow coach and manager messages' })
    await waitFor(() => expect(sw).toBeEnabled())
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await user.click(sw)
    expect(setStaffDmOptInMock).toHaveBeenCalledWith('p1', true)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/Turned on/)).toBeInTheDocument()
  })

  it('a playing-up child on a U16 squad is offered the switch — the guardian decides', async () => {
    render(<StaffDmOptIn player={PLAYER} teamName="U16 Girls" isGuardian />)
    expect(await screen.findByTestId('staff-dm-opt-in')).toBeInTheDocument()
  })
})
