// The presence dot and where it rides
// (claude/plans/2026-08-26-last-active-and-presence-dots.md). Names invented.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PresenceDot from '../src/components/PresenceDot.jsx'
import { RowAvatar } from '../src/screens/ChatList.jsx'

describe('PresenceDot', () => {
  it('renders each state with its words, never colour alone', () => {
    const { rerender } = render(<PresenceDot state="online" />)
    expect(screen.getByRole('img', { name: 'Online' })).toHaveAttribute('data-state', 'online')
    rerender(<PresenceDot state="away" />)
    expect(screen.getByRole('img', { name: 'Away' })).toHaveAttribute('data-state', 'away')
    rerender(<PresenceDot state="offline" />)
    expect(screen.getByRole('img', { name: 'Offline' })).toHaveAttribute('data-state', 'offline')
  })

  it('an unknown state falls back to Offline rather than inventing a colour', () => {
    render(<PresenceDot state="astral" />)
    expect(screen.getByRole('img', { name: 'Offline' })).toHaveAttribute('data-state', 'offline')
  })
})

describe('RowAvatar + presence', () => {
  const dmRow = { kind: 'dm', label: 'Zz Probe Parent', detail: 'Direct message' }
  const squadRow = { kind: 'squad', label: 'U10 Mixed' }

  it('a DM row carries the dot when the screen passes presence', () => {
    render(<RowAvatar row={dmRow} presence="away" />)
    expect(screen.getByRole('img', { name: 'Away' })).toBeInTheDocument()
  })

  it('⚠️ no presence given → no dot (pickers), and a squad row NEVER gets one', () => {
    const { rerender } = render(<RowAvatar row={dmRow} />)
    expect(screen.queryByTestId('presence-dot')).toBeNull()
    // The discriminating negative: a channel is not a person.
    rerender(<RowAvatar row={squadRow} presence="online" />)
    expect(screen.queryByTestId('presence-dot')).toBeNull()
  })
})
