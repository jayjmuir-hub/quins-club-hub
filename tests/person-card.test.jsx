// The person card — tap any name, contact the person.
// claude/plans/2026-08-26-person-card.md. Invented names throughout (rule 9).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PersonCard from '../src/components/PersonCard.jsx'

const getPersonCard = vi.fn()
// IdentityBadges fetches member_identity (26 Aug 2026); empty here keeps
// this file about its own subject and network-free.
vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/personCard.js', () => ({
  getPersonCard: (...args) => getPersonCard(...args),
}))

const openConversation = vi.fn()
vi.mock('../src/data/messages.js', () => ({
  openConversation: (...args) => openConversation(...args),
}))

const coach = {
  profileId: 'p-coach',
  name: 'Zz Probe Coach',
  role: 'coach',
  title: 'Head Coach',
  isSuper: false,
  squads: ['U10 ZZ Cardprobe'],
  phone: '+971500000100',
  email: 'zz-probe-coach@example.invalid',
  photoUrl: null,
  focus: null,
}

// ⚠️ The shape ruling C hands an ordinary member for another parent: a real
// card with null contacts. The component must read this as normal, not as
// an error or an empty state.
const parent = {
  ...coach,
  profileId: 'p-parent',
  name: 'Zz Probe Parent',
  role: 'parent',
  title: null,
  squads: [],
  phone: null,
  email: null,
}

function mount(profileId, onClose = () => {}) {
  return render(
    <MemoryRouter>
      <PersonCard profileId={profileId} onClose={onClose} />
    </MemoryRouter>,
  )
}

describe('PersonCard', () => {
  beforeEach(() => {
    getPersonCard.mockReset()
    openConversation.mockReset()
  })

  it('renders nothing while no profile is picked', () => {
    mount(null)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getPersonCard).not.toHaveBeenCalled()
  })

  it('shows every action for a staff card', async () => {
    getPersonCard.mockResolvedValue(coach)
    mount('p-coach')
    expect(await screen.findByText('Zz Probe Coach')).toBeInTheDocument()
    // The title replaces the role label — same rule as the Squad contacts card.
    expect(screen.getByText(/Head Coach/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Call Zz Probe Coach' })).toHaveAttribute(
      'href',
      'tel:+971500000100',
    )
    expect(screen.getByRole('link', { name: 'Message Zz Probe Coach on WhatsApp' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Email Zz Probe Coach' })).toHaveAttribute(
      'href',
      'mailto:zz-probe-coach@example.invalid',
    )
    expect(screen.getByRole('button', { name: 'Chat with Zz Probe Coach' })).toBeInTheDocument()
  })

  it('⚠️ a parent card is chat-only — no call, no email, and that is a normal card, not an error', async () => {
    getPersonCard.mockResolvedValue(parent)
    mount('p-parent')
    expect(await screen.findByText('Zz Probe Parent')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /whatsapp/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /email/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Chat with Zz Probe Parent' })).toBeInTheDocument()
    expect(screen.queryByText(/could not/i)).toBeNull()
  })

  it('a load failure shows words in the sheet, never a dead tap', async () => {
    getPersonCard.mockRejectedValue(new Error('Could not load their details.'))
    mount('p-coach')
    expect(await screen.findByText('Could not load their details.')).toBeInTheDocument()
  })

  it('chat drives the existing DM path', async () => {
    getPersonCard.mockResolvedValue(coach)
    openConversation.mockResolvedValue('conv-1')
    mount('p-coach')
    fireEvent.click(await screen.findByRole('button', { name: 'Chat with Zz Probe Coach' }))
    await waitFor(() => expect(openConversation).toHaveBeenCalledWith('p-coach'))
  })

  it("a refused DM renders the database's words inline", async () => {
    getPersonCard.mockResolvedValue(coach)
    openConversation.mockRejectedValue(new Error('You cannot message this person.'))
    mount('p-coach')
    fireEvent.click(await screen.findByRole('button', { name: 'Chat with Zz Probe Coach' }))
    expect(await screen.findByText('You cannot message this person.')).toBeInTheDocument()
  })
})
