// PersonName — any name becomes a door to the person
// (claude/plans/2026-08-26-person-card.md). Invented names (rule 9).
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PersonName from '../src/components/PersonName.jsx'

describe('PersonName', () => {
  it('is a button that reports the profile id', () => {
    const onOpen = vi.fn()
    render(
      <PersonName profileId="p-1" selfId="p-2" onOpen={onOpen}>
        Zz Probe Coach
      </PersonName>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Zz Probe Coach' }))
    expect(onOpen).toHaveBeenCalledWith('p-1')
  })

  it('⚠️ your own name and a missing profile render plain text — no button', () => {
    const onOpen = vi.fn()
    const { rerender } = render(
      <PersonName profileId="p-2" selfId="p-2" onOpen={onOpen}>
        Me
      </PersonName>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Me')).toBeInTheDocument()
    rerender(
      <PersonName profileId={null} selfId="p-2" onOpen={onOpen}>
        an account since deleted
      </PersonName>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('an account since deleted')).toBeInTheDocument()
  })

  it('keeps the caller’s classes in both shapes', () => {
    const onOpen = vi.fn()
    const { rerender } = render(
      <PersonName profileId="p-1" selfId="p-2" onOpen={onOpen} className="truncate">
        Zz Probe Coach
      </PersonName>,
    )
    expect(screen.getByRole('button', { name: 'Zz Probe Coach' }).className).toContain('truncate')
    rerender(
      <PersonName profileId={null} selfId="p-2" onOpen={onOpen} className="truncate">
        Zz Plain
      </PersonName>,
    )
    expect(screen.getByText('Zz Plain').className).toContain('truncate')
  })
})
