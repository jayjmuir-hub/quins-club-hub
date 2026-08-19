import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

// /my-reports — the screen a "somebody replied to your report" notification
// lands on, and the routing fallback that gets it there when the service
// worker cannot navigate the window itself.
//
// The data layer is mocked; `listFeedback`'s own behaviour (and the reason it
// carries no `submitted_by` filter) is covered in tests/data.test.js.

// ⚠️ MOCKED EVEN THOUGH NOTHING HERE CALLS IT. `importActual` below loads the
// real feedback module for its labels and `feedbackRef`, and that module
// imports the Supabase client, which THROWS at import time when the env vars
// are absent — which they are in a fresh worktree with no `.env`. Every other
// test file in here mocks it for the same reason.
vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))

vi.mock('../src/data/feedback.js', async () => {
  const actual = await vi.importActual('../src/data/feedback.js')
  return {
    ...actual,
    listFeedback: vi.fn(),
    subscribeFeedback: vi.fn(() => () => {}),
  }
})

import { listFeedback, subscribeFeedback } from '../src/data/feedback.js'
import MyReports from '../src/screens/MyReports.jsx'
import { useNotificationRouting } from '../src/lib/notificationRouting.js'

beforeEach(() => {
  listFeedback.mockReset()
  subscribeFeedback.mockReset()
  subscribeFeedback.mockReturnValue(() => {})
})

describe('/my-reports', () => {
  it('shows a report and, above all, the club’s reply to it', async () => {
    listFeedback.mockResolvedValue([
      { id: 'f1', ref: 41, status: 'done', body: 'The roster is blank on my phone', admin_note: 'Fixed on Tuesday.' },
    ])

    render(<MemoryRouter><MyReports /></MemoryRouter>)

    expect(await screen.findByText('The roster is blank on my phone')).toBeInTheDocument()
    // ⚠️ THE REPLY IS THE REASON THE SCREEN EXISTS. Jay chose in-app over a
    // second email, so admin_note is the ONLY channel an answer travels down.
    expect(screen.getByText(/Fixed on Tuesday\./)).toBeInTheDocument()
    expect(screen.getByText('QCH-0041')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('tells you when you have not reported anything, rather than showing a blank card', async () => {
    listFeedback.mockResolvedValue([])
    render(<MemoryRouter><MyReports /></MemoryRouter>)
    expect(await screen.findByText(/haven’t reported anything yet/)).toBeInTheDocument()
  })

  it('surfaces a load failure instead of looking empty', async () => {
    listFeedback.mockRejectedValue(new Error('network is down'))
    render(<MemoryRouter><MyReports /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('network is down')
  })

  // ⚠️ LIVE, BECAUSE ARRIVING HERE MEANS SOMETHING JUST CHANGED. Someone taps
  // the notification at the moment an admin replied; without a subscription
  // they would be shown whatever the page last loaded.
  it('subscribes to changes so a reply appears without a reload', async () => {
    listFeedback.mockResolvedValue([])
    render(<MemoryRouter><MyReports /></MemoryRouter>)
    await waitFor(() => expect(subscribeFeedback).toHaveBeenCalled())
  })
})

describe('the notification routing fallback', () => {
  let listeners
  let originalServiceWorker

  function Probe() {
    useNotificationRouting()
    const location = useLocation()
    return <span data-testid="where">{location.pathname}</span>
  }

  function renderProbe() {
    return render(
      <MemoryRouter initialEntries={['/more']}>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  beforeEach(() => {
    listeners = {}
    originalServiceWorker = navigator.serviceWorker
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: (type, fn) => {
          listeners[type] = fn
        },
        removeEventListener: () => {},
      },
    })
  })

  afterEach(() => {
    if (originalServiceWorker === undefined) delete navigator.serviceWorker
    else Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalServiceWorker })
  })

  it('routes to the path the service worker asks for', async () => {
    renderProbe()
    expect(screen.getByTestId('where')).toHaveTextContent('/more')

    listeners.message({ data: { type: 'notification-navigate', url: `${window.location.origin}/my-reports` } })

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/my-reports'))
  })

  // ⚠️ A postMessage IS AN INPUT. Same reasoning as safeNext() applies to a
  // redirect target: an off-origin url must not become a route.
  it('ignores a message pointing at another origin', async () => {
    renderProbe()
    listeners.message({ data: { type: 'notification-navigate', url: 'https://example.com/steal' } })
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/more'))
  })

  it('ignores messages that are not ours', async () => {
    renderProbe()
    listeners.message({ data: { type: 'workbox-something', url: `${window.location.origin}/my-reports` } })
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/more'))
  })
})
