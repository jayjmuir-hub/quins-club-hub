import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/components/EmojiPicker.jsx — round 2. A curated composer picker,
// desktop-only by CLASS (jsdom cannot measure a breakpoint, so the class is
// the assertion), staying open across picks. Distinct from ReactionBar's
// fixed five, which are a database constraint.

import EmojiPicker from '../src/components/EmojiPicker.jsx'
import { insertAtCursor } from '../src/lib/chatComposer.js'

describe('EmojiPicker', () => {
  it('opens on the button, fires onPick per tap, and stays open for a second pick', async () => {
    const user = userEvent.setup()
    const onPick = vi.fn()
    render(<EmojiPicker onPick={onPick} />)
    expect(screen.queryByTestId('emoji-grid')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('emoji-button'))
    const grid = screen.getByTestId('emoji-grid')
    await user.click(screen.getByRole('menuitem', { name: 'Insert 🏉' }))
    await user.click(screen.getByRole('menuitem', { name: 'Insert 👏' }))
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['🏉', '👏'])
    expect(grid).toBeInTheDocument()
  })

  it('Escape closes it', async () => {
    const user = userEvent.setup()
    render(<EmojiPicker onPick={() => {}} />)
    await user.click(screen.getByTestId('emoji-button'))
    expect(screen.getByTestId('emoji-grid')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('emoji-grid')).not.toBeInTheDocument()
  })

  it('is hidden below the desktop breakpoint, by class — the phone keyboard already has one', () => {
    render(<EmojiPicker onPick={() => {}} />)
    const root = screen.getByTestId('emoji-picker')
    expect(root.className).toContain('hidden')
    expect(root.className).toContain('desktop:block')
  })
})

describe('insertAtCursor', () => {
  it('drops the emoji at the caret and parks the caret after it', () => {
    const el = document.createElement('textarea')
    el.value = 'see you there'
    el.setSelectionRange(3, 3)
    const next = insertAtCursor(el, '🏉')
    expect(next).toBe('see🏉 you there')
    expect(el.selectionStart).toBe(3 + '🏉'.length)
  })

  it('replaces a selection instead of stacking on top of it', () => {
    const el = document.createElement('textarea')
    el.value = 'good luck'
    el.setSelectionRange(5, 9)
    expect(insertAtCursor(el, '👏')).toBe('good 👏')
  })
})
