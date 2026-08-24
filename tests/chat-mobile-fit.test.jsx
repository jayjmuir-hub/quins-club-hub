import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The mobile-thread fit fixes (Jay's phone screenshot, 24 Aug 2026: "chat
// isn't playing nice with the bottom menu bar"). jsdom cannot measure the
// real chrome, so the classes ARE the assertions — the same stance as the
// emoji picker's breakpoint test — plus the menu's flip logic, which IS
// measurable by shrinking the viewport.

import MessageMenu from '../src/components/MessageMenu.jsx'
import ChatHeader from '../src/components/ChatHeader.jsx'

describe('the message menu near the viewport bottom', () => {
  it('flips upward instead of opening under the tab bar, and outranks the chrome', async () => {
    const user = userEvent.setup()
    // jsdom rects are all zeros, so innerHeight decides: small viewport →
    // (innerHeight - bottom 0) < 320 → flip.
    const original = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true })
    render(<MessageMenu items={[{ label: 'Reply', onClick: () => {} }]} />)
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    const menu = screen.getByRole('menu')
    expect(menu.className).toContain('bottom-6')
    expect(menu.className).not.toContain('top-6')
    // z-50 beats the dock and the masthead island (both z-40)
    expect(menu.className).toContain('z-50')
    Object.defineProperty(window, 'innerHeight', { value: original, configurable: true })
  })

  it('opens downward with room to spare', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    render(<MessageMenu items={[{ label: 'Reply', onClick: () => {} }]} />)
    await user.click(screen.getByRole('button', { name: 'Message options' }))
    expect(screen.getByRole('menu').className).toContain('top-6')
  })
})

describe('the thread header clears the glass masthead on phones', () => {
  it('carries the phone offset and desktop:top-0', () => {
    render(<MemoryRouter><ChatHeader avatar={null} title="Zz Probe" subtitle="x" /></MemoryRouter>)
    const header = screen.getByTestId('chat-header')
    expect(header.className).toContain('top-[calc(env(safe-area-inset-top)+64px)]')
    expect(header.className).toContain('desktop:top-0')
  })
})
