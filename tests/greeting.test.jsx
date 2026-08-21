import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getMyProfileMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'zoe@example.com' } }),
}))

vi.mock('../src/data/members.js', () => ({
  getMyProfile: (...a) => getMyProfileMock(...a),
}))

import Greeting, { greetingFor } from '../src/components/Greeting.jsx'
import { clearMyProfileCache } from '../src/lib/useMyProfile.js'

beforeEach(() => {
  clearMyProfileCache()
  getMyProfileMock.mockReset()
  getMyProfileMock.mockResolvedValue({ id: 'p1', first_name: 'Jay' })
})

// Pure, so the boundaries can be pinned exactly rather than inferred from a
// rendered string at whatever time the suite happens to run.
describe('greetingFor', () => {
  it.each([
    [5, 'Good morning'],
    [9, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
    [0, 'Good evening'],
    [4, 'Good evening'],
  ])('at %i:00 says %s', (hour, expected) => {
    expect(greetingFor(hour)).toBe(expected)
  })

  it('never says good night', () => {
    // It reads as a farewell, which is wrong on a screen someone has just
    // opened.
    const all = Array.from({ length: 24 }, (_, h) => greetingFor(h))
    expect(all.join(' ')).not.toMatch(/night/i)
  })

  it('covers all 24 hours with a real greeting', () => {
    for (let h = 0; h < 24; h += 1) {
      expect(greetingFor(h)).toMatch(/^Good (morning|afternoon|evening)$/)
    }
  })
})

describe('Greeting', () => {
  it('uses the first name once the profile arrives', async () => {
    render(<Greeting now={Date.parse('2026-08-06T09:00:00')} />)
    // The name is the 2.0 accent word — Playfair italic crimson, with the
    // full stop inside the accent — so it lives in its own span and the
    // matcher reads the paragraph whole rather than hunting one text node.
    const name = await screen.findByText('Jay.')
    expect(name).toHaveClass('accent-word')
    expect(screen.getByTestId('greeting')).toHaveTextContent('Good morning, Jay.')
  })

  it('reads correctly with NO name at all', async () => {
    // ⚠️ NOT an edge case. A magic-link sign-in has no name until NamePrompt
    // is answered, and NamePrompt is skippable — so roughly half the club can
    // be in this state. The comma must vanish with the name, never leaving
    // "Good morning, ".
    getMyProfileMock.mockResolvedValue({ id: 'p1', first_name: null })
    render(<Greeting now={Date.parse('2026-08-06T09:00:00')} />)

    const el = await screen.findByTestId('greeting')
    expect(el).toHaveTextContent('Good morning')
    expect(el.textContent).not.toMatch(/,/)
  })

  it('ignores a whitespace-only name rather than printing a bare comma', async () => {
    getMyProfileMock.mockResolvedValue({ id: 'p1', first_name: '   ' })
    render(<Greeting now={Date.parse('2026-08-06T09:00:00')} />)

    const el = await screen.findByTestId('greeting')
    expect(el.textContent).not.toMatch(/,/)
  })

  it('still greets when the profile lookup fails', async () => {
    // A blip on a bad connection must not blank the top of the home screen.
    getMyProfileMock.mockRejectedValue(new Error('offline'))
    render(<Greeting now={Date.parse('2026-08-06T19:00:00')} />)

    expect(await screen.findByTestId('greeting')).toHaveTextContent('Good evening')
  })

  it('fetches the profile once even with two greetings mounted', async () => {
    // The whole point of the shared cache: two consumers, one round trip.
    render(
      <>
        <Greeting now={Date.parse('2026-08-06T09:00:00')} />
        <Greeting now={Date.parse('2026-08-06T09:00:00')} />
      </>,
    )
    await screen.findAllByText('Jay.')
    expect(getMyProfileMock).toHaveBeenCalledTimes(1)
  })
})
