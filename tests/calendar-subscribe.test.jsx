import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The calendar subscription link (Jay's brief, 4 Aug 2026).
//
// The token in that URL is a BEARER CREDENTIAL — a calendar client cannot sign
// in, so anyone holding the URL gets that person's fixtures. Two behaviours
// below exist only because of that, and neither is cosmetic:
//   * the token is minted LAZILY, so opening the Schedule does not create a
//     live credential for every member who never asked for one;
//   * resetting is offered, and confirmed, right beside the link.

const myCalendarTokenMock = vi.fn()
const resetMyCalendarTokenMock = vi.fn()

vi.mock('../src/data/calendar.js', async (importOriginal) => {
  // The URL builders are pure and worth exercising for real; only the two
  // network calls are mocked.
  const actual = await importOriginal()
  return {
    ...actual,
    myCalendarToken: (...a) => myCalendarTokenMock(...a),
    resetMyCalendarToken: (...a) => resetMyCalendarTokenMock(...a),
  }
})

import CalendarSubscribe from '../src/components/CalendarSubscribe.jsx'

const TOKEN = '7d5c83a7-16f7-4a3b-97fe-6bc904840590'
const FRESH = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

beforeEach(() => {
  vi.clearAllMocks()
  myCalendarTokenMock.mockResolvedValue(TOKEN)
  resetMyCalendarTokenMock.mockResolvedValue(FRESH)
})

describe('CalendarSubscribe', () => {
  it('mints no token until someone actually opens it', () => {
    render(<CalendarSubscribe />)

    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument()
    // The whole point: rendering the Schedule must not create a live bearer
    // credential for every member.
    expect(myCalendarTokenMock).not.toHaveBeenCalled()
  })

  it('shows the feed URL, built from the Supabase project URL', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))

    const url = await screen.findByTestId('calendar-url')
    expect(myCalendarTokenMock).toHaveBeenCalledTimes(1)
    expect(url).toHaveTextContent(`/functions/v1/calendar?token=${TOKEN}`)
  })

  it('offers Apple a webcal: link, which is what makes it one tap', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    const apple = screen.getByRole('link', { name: /add on apple/i })
    expect(apple.getAttribute('href')).toMatch(/^webcal:/)
    expect(apple.getAttribute('href')).toContain(TOKEN)
  })

  it('does not re-mint on a second open', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    await user.click(screen.getByRole('button', { name: /close/i }))
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    expect(myCalendarTokenMock).toHaveBeenCalledTimes(1)
  })

  it('warns that the link works without signing in', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    expect(screen.getByText(/without signing in/i)).toBeInTheDocument()
  })

  it('confirms before resetting, then swaps in the new link', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    // Two steps: revoking someone's working calendar by mis-tap would be a
    // silent breakage they'd only notice weeks later.
    await user.click(screen.getByRole('button', { name: /reset my link/i }))
    expect(resetMyCalendarTokenMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /yes, reset/i }))
    await waitFor(() => expect(resetMyCalendarTokenMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('calendar-url')).toHaveTextContent(FRESH))
    expect(screen.getByTestId('calendar-url')).not.toHaveTextContent(TOKEN)
  })

  it('backs out of a reset without revoking anything', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    await user.click(screen.getByRole('button', { name: /reset my link/i }))
    await user.click(screen.getByRole('button', { name: /keep it/i }))

    expect(resetMyCalendarTokenMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('calendar-url')).toHaveTextContent(TOKEN)
  })

  it('surfaces a failure to mint instead of showing an empty panel', async () => {
    myCalendarTokenMock.mockRejectedValue(new Error('Sign in first.'))
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in first.')
    expect(screen.queryByTestId('calendar-url')).toBeNull()
  })

  it('survives a browser that refuses clipboard access', async () => {
    const user = userEvent.setup()
    render(<CalendarSubscribe />)
    await user.click(screen.getByRole('button', { name: /add to calendar/i }))
    await screen.findByTestId('calendar-url')

    // jsdom has no clipboard by default, and plenty of real browsers refuse
    // it (insecure context, locked-down settings). The URL is on screen and
    // selectable, so this must degrade rather than throw.
    const copy = screen.getByRole('button', { name: /copy link/i })
    await user.click(copy)

    expect(screen.getByTestId('calendar-url')).toHaveTextContent(TOKEN)
  })
})
