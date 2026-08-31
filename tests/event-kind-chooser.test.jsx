import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EventKindChooser from '../src/components/EventKindChooser.jsx'

// The "What are you adding?" step in front of the event form (phase 3). Its one
// job is to turn a tap into a kind and hand it on; the reshaping lives in
// EventForm. See claude/plans/2026-08-29-tournaments-as-containers.md.

describe('EventKindChooser', () => {
  it('offers the five kinds under the prompt', () => {
    render(<EventKindChooser onPick={() => {}} onClose={() => {}} />)

    expect(screen.getByText('What are you adding?')).toBeInTheDocument()
    // ⚠️ 'Club Diary' ADDED 31 Aug 2026 and it is NOT an events.type — it maps
    // to type='social' with info_only set, the same way 'Tournament' maps to a
    // match with competition_type='tournament'. The chooser speaks the user's
    // language; EventForm turns the pick back into columns.
    // claude/plans/2026-08-31-club-diary.md.
    for (const label of ['Match', 'Tournament', 'Training', 'Social', 'Club Diary']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
    }
  })

  it('calls onPick with diary for the Club Diary card', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<EventKindChooser onPick={onPick} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^Club Diary/ }))
    expect(onPick).toHaveBeenCalledWith('diary')
  })

  it('calls onPick with the chosen kind', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<EventKindChooser onPick={onPick} onClose={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^Tournament/ }))
    expect(onPick).toHaveBeenCalledWith('tournament')

    await user.click(screen.getByRole('button', { name: /^Match/ }))
    expect(onPick).toHaveBeenLastCalledWith('match')
  })

  it('closes without picking when dismissed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onPick = vi.fn()
    render(<EventKindChooser onPick={onPick} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
