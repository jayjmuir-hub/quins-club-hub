import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Round 2, Jay: "chat icon option in all coach, manager, etc pills" — the
// chat button on the Home staff tiles (SquadStaffCard). Pure props: the
// button exists only when the screen wires onChat, never for yourself, and
// whether the DM is ALLOWED stays open_conversation's call in the handler.

import { SquadStaffCard } from '../src/components/SquadStaffCard.jsx'

const COACH = {
  membershipId: 'mem-1',
  profileId: 'coach-profile-1',
  role: 'coach',
  title: null,
  isHeadCoach: false,
  name: 'Zz Coach Probe',
  email: 'zz-coach@example.invalid',
  phone: null,
  photoPath: null,
  photoUrl: null,
  focus: null,
}

describe('SquadStaffCard — the chat button', () => {
  it('shows a chat button per staff member and hands the member to onChat', async () => {
    const user = userEvent.setup()
    const onChat = vi.fn()
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH]} onChat={onChat} selfId="me-1" />)
    await user.click(screen.getByRole('button', { name: 'Chat with Zz Coach Probe' }))
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'coach-profile-1' }))
  })

  it('never offers a chat with yourself', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH]} onChat={() => {}} selfId="coach-profile-1" />)
    expect(screen.queryByRole('button', { name: 'Chat with Zz Coach Probe' })).not.toBeInTheDocument()
  })

  it('renders no chat button at all when the screen has not wired one', () => {
    render(<SquadStaffCard squadName="U13 Mixed Contact" staff={[COACH]} />)
    expect(screen.queryByRole('button', { name: 'Chat with Zz Coach Probe' })).not.toBeInTheDocument()
  })

  it('a member with no phone or email still gets the chat button', async () => {
    const user = userEvent.setup()
    const onChat = vi.fn()
    render(
      <SquadStaffCard
        squadName="U13 Mixed Contact"
        staff={[{ ...COACH, email: null, phone: null }]}
        onChat={onChat}
        selfId="me-1"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Chat with Zz Coach Probe' }))
    expect(onChat).toHaveBeenCalled()
  })
})
