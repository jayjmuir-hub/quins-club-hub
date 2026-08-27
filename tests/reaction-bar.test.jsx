import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The reaction bar (claude/plans/2026-08-24-chat-feedback.md, DB half in
// db/migrations/20260824_message_reactions.sql). The discriminating pair:
// your own reaction renders pressed (so a second tap reads as un-react), and
// the picker offers EXACTLY the five emoji the database's check constraint
// accepts — a sixth here would 23514 at the database and read as a bug.
import ReactionBar, { REACTION_SET, REACTION_PICKER_WIDTH } from '../src/components/ReactionBar.jsx'

const ME = 'me-1'
const REACTIONS = [
  { message_id: 'x1', profile_id: ME, emoji: '👍' },
  { message_id: 'x1', profile_id: 'p2', emoji: '👍' },
  { message_id: 'x1', profile_id: 'p3', emoji: '👏' },
]

describe('ReactionBar', () => {
  it('tallies per emoji and marks mine pressed', () => {
    render(<ReactionBar messageId="x1" reactions={REACTIONS} selfId={ME} onToggle={() => {}} />)
    const thumbs = screen.getByRole('button', { name: /👍 2/ })
    expect(thumbs).toHaveAttribute('aria-pressed', 'true')
    const clap = screen.getByRole('button', { name: /👏 1/ })
    expect(clap).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders nothing but the add button when nobody has reacted', () => {
    render(<ReactionBar messageId="x1" reactions={[]} selfId={ME} onToggle={() => {}} />)
    expect(screen.queryByRole('button', { name: /👍/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add reaction' })).toBeInTheDocument()
  })

  it('the picker offers exactly the five emoji the database accepts', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ReactionBar messageId="x1" reactions={[]} selfId={ME} onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: 'Add reaction' }))
    const picker = screen.getByTestId('reaction-picker')
    const options = within(picker).getAllByRole('button')
    expect(options.map((o) => o.textContent)).toEqual(['👍', '❤️', '😂', '😮', '👏'])
    expect(REACTION_SET).toEqual(['👍', '❤️', '😂', '😮', '👏'])
    expect(REACTION_PICKER_WIDTH).toBe(194)
    await user.click(options[1])
    expect(onToggle).toHaveBeenCalledWith('x1', '❤️', true)
  })

  it('tapping my own tally un-reacts; tapping another adds', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<ReactionBar messageId="x1" reactions={REACTIONS} selfId={ME} onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: /👍 2/ }))
    expect(onToggle).toHaveBeenCalledWith('x1', '👍', false)
    await user.click(screen.getByRole('button', { name: /👏 1/ }))
    expect(onToggle).toHaveBeenCalledWith('x1', '👏', true)
  })
})
