import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import useDiscardGuard from '../src/lib/useDiscardGuard.js'
import DiscardConfirm from '../src/components/DiscardConfirm.jsx'
import { Sheet } from '../src/components/Sheet.jsx'
import PollComposer from '../src/components/PollComposer.jsx'
import NoticeComposer from '../src/components/NoticeComposer.jsx'

// "If I mis-click outside the event box while adding something it just
// disappears and I have to start all over" — Jay, 3 Sep 2026. The event form
// got its guard in #631; this is the same guard as one hook + one component,
// on every other sheet with typing in it. Pinned here:
//   - a CLEAN sheet still closes at once on Escape / backdrop / Cancel;
//   - a DIRTY one asks first, and "Keep editing" keeps the typing;
//   - "Discard" is the only thing that then closes it;
//   - a save in flight never arms the question (the save clears the dirt);
//   - the reload guard rides along (beforeunload is wired only while dirty).
// ⚠️ EVERY NAME IS INVENTED. CLAUDE.md rule 9.

vi.mock('../src/data/announcements.js', () => ({ createNotice: vi.fn(async () => ({ id: 'n1' })) }))

function Harness({ onClose, saving = false }) {
  const [text, setText] = useState('')
  const guard = useDiscardGuard({ dirty: text !== '', saving, onClose })
  return (
    <Sheet open onClose={guard.requestClose} title="Harness">
      {guard.confirming && <DiscardConfirm id="h" onDiscard={guard.discard} onKeep={guard.keep} />}
      <input aria-label="Text" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={guard.requestClose}>Cancel</button>
    </Sheet>
  )
}

describe('useDiscardGuard + DiscardConfirm', () => {
  it('a clean sheet closes at once, on Escape and on Cancel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('a dirty sheet asks first; Keep editing keeps the typing; Discard closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.type(screen.getByLabelText('Text'), 'half a thought')
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Discard your changes?')

    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Text')).toHaveValue('half a thought')
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('never arms while a save is in flight', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} saving />)
    await user.type(screen.getByLabelText('Text'), 'x')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wires the reload guard only while dirty', async () => {
    const user = userEvent.setup()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const before = () => add.mock.calls.filter(([type]) => type === 'beforeunload').length
    render(<Harness onClose={vi.fn()} />)
    expect(before()).toBe(0)
    await user.type(screen.getByLabelText('Text'), 'x')
    await waitFor(() => expect(before()).toBe(1))
    await user.clear(screen.getByLabelText('Text'))
    await waitFor(() =>
      expect(remove.mock.calls.filter(([type]) => type === 'beforeunload').length).toBe(1),
    )
    add.mockRestore()
    remove.mockRestore()
  })
})

describe('the guard on real sheets', () => {
  it('PollComposer: a typed question survives a mis-tap', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<PollComposer open onClose={onClose} onSubmit={vi.fn()} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.type(screen.getByLabelText(/question/i), 'Kit colour?')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard your changes?')
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/question/i)).toHaveValue('Kit colour?')
  })

  it('NoticeComposer: a typed title survives a mis-tap, and Discard lets it go', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <NoticeComposer
        open
        onClose={onClose}
        teams={[{ id: 't1', name: 'U12 Mixed' }]}
        clubWide={false}
        onPosted={vi.fn()}
      />,
    )
    await user.type(screen.getByLabelText(/title/i), 'Boots on Tuesday')
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
