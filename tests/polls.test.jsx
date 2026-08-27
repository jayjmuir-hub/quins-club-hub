import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PollBubble from '../src/components/PollBubble.jsx'
import PollComposer from '../src/components/PollComposer.jsx'
import PollVotes from '../src/components/PollVotes.jsx'

// The three poll surfaces. The bubble's voting maths and the composer's
// validation are the logic worth pinning; the RLS behind them is
// db/tests/chat-polls.sql.

const POLL = {
  allowMultiple: false,
  totalVoters: 3,
  options: [
    { id: 'o0', position: 0, label: 'Saturday', voters: [{ id: 'me', name: 'Me Self' }, { id: 'p2', name: 'Bo Lund' }] },
    { id: 'o1', position: 1, label: 'Sunday', voters: [{ id: 'p3', name: 'Cy Rowe' }] },
  ],
}

describe('PollBubble', () => {
  it('shows the options, counts, running total and the single-choice hint', () => {
    render(<PollBubble poll={POLL} selfId="me" onVote={() => {}} onViewVotes={() => {}} />)
    expect(screen.getByText('Saturday')).toBeInTheDocument()
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByTestId('poll-count-0')).toHaveTextContent('2')
    expect(screen.getByTestId('poll-count-1')).toHaveTextContent('1')
    expect(screen.getByTestId('poll-total')).toHaveTextContent('3 votes')
    expect(screen.getByText('Select one')).toBeInTheDocument()
  })

  it('marks my own pick as pressed and leaves the others unpressed', () => {
    render(<PollBubble poll={POLL} selfId="me" onVote={() => {}} />)
    expect(screen.getByTestId('poll-option-0')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('poll-option-1')).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles a voted option off and votes an un-voted one on', async () => {
    const user = userEvent.setup()
    const onVote = vi.fn()
    render(<PollBubble poll={POLL} selfId="me" onVote={onVote} />)
    await user.click(screen.getByTestId('poll-option-0')) // I voted this → remove
    expect(onVote).toHaveBeenLastCalledWith('o0', false)
    await user.click(screen.getByTestId('poll-option-1')) // not voted → add (single-choice switch)
    expect(onVote).toHaveBeenLastCalledWith('o1', true)
  })

  it('offers View votes when there are votes, and fires the callback', async () => {
    const user = userEvent.setup()
    const onViewVotes = vi.fn()
    render(<PollBubble poll={POLL} selfId="me" onVote={() => {}} onViewVotes={onViewVotes} />)
    await user.click(screen.getByTestId('poll-view-votes'))
    expect(onViewVotes).toHaveBeenCalled()
  })

  it('hides View votes when nobody has voted', () => {
    const empty = { ...POLL, totalVoters: 0, options: POLL.options.map((o) => ({ ...o, voters: [] })) }
    render(<PollBubble poll={empty} selfId="me" onVote={() => {}} onViewVotes={() => {}} />)
    expect(screen.queryByTestId('poll-view-votes')).toBeNull()
  })

  it('reads "Select one or more" for a multiple-choice poll', () => {
    render(<PollBubble poll={{ ...POLL, allowMultiple: true }} selfId="me" onVote={() => {}} />)
    expect(screen.getByText('Select one or more')).toBeInTheDocument()
  })

  it('is read-only with no vote handler', () => {
    render(<PollBubble poll={POLL} selfId="me" onVote={null} />)
    expect(screen.getByTestId('poll-option-0')).toBeDisabled()
  })
})

describe('PollComposer', () => {
  it('keeps Post disabled until there is a question and two options', async () => {
    const user = userEvent.setup()
    render(<PollComposer open onClose={() => {}} onSubmit={() => {}} />)
    expect(screen.getByTestId('poll-create')).toBeDisabled()
    await user.type(screen.getByTestId('poll-question'), 'Which weekend?')
    await user.type(screen.getByTestId('poll-option-input-0'), 'Saturday')
    expect(screen.getByTestId('poll-create')).toBeDisabled() // one option is not enough
    await user.type(screen.getByTestId('poll-option-input-1'), 'Sunday')
    expect(screen.getByTestId('poll-create')).toBeEnabled()
  })

  it('grows a fresh option field as the last one is filled', async () => {
    const user = userEvent.setup()
    render(<PollComposer open onClose={() => {}} onSubmit={() => {}} />)
    expect(screen.queryByTestId('poll-option-input-2')).toBeNull()
    await user.type(screen.getByTestId('poll-option-input-1'), 'Sunday')
    expect(screen.getByTestId('poll-option-input-2')).toBeInTheDocument()
  })

  it('submits the trimmed question, the non-blank options and the multiple flag', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<PollComposer open onClose={() => {}} onSubmit={onSubmit} />)
    await user.type(screen.getByTestId('poll-question'), '  Which weekend?  ')
    await user.type(screen.getByTestId('poll-option-input-0'), 'Saturday')
    await user.type(screen.getByTestId('poll-option-input-1'), 'Sunday')
    await user.click(screen.getByTestId('poll-allow-multiple'))
    await user.click(screen.getByTestId('poll-create'))
    expect(onSubmit).toHaveBeenCalledWith({
      question: 'Which weekend?',
      options: ['Saturday', 'Sunday'],
      allowMultiple: true,
    })
  })
})

describe('PollVotes', () => {
  it('lists the voters under each option, and says so when there are none', () => {
    const poll = {
      ...POLL,
      options: [
        POLL.options[0],
        { id: 'o1', position: 1, label: 'Sunday', voters: [] },
      ],
    }
    render(<PollVotes open onClose={() => {}} poll={poll} />)
    const sheet = screen.getByTestId('poll-votes')
    expect(within(sheet).getByText('Me Self')).toBeInTheDocument()
    expect(within(sheet).getByText('Bo Lund')).toBeInTheDocument()
    expect(within(sheet).getByText('No votes yet')).toBeInTheDocument()
  })
})
