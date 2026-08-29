import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// The Home card that tells people notifications exist.
//
// ⚠️ MOST OF THESE TESTS ASSERT THAT IT RENDERS **NOTHING**, and that is the
// point rather than an accident: it sits above the fixture hero on Home, so
// the placement is only defensible while it stays silent for everybody it does
// not apply to. claude/plans/2026-08-19-notifications-v2.md.

vi.mock('../src/lib/push.js', () => ({
  isPushSupported: vi.fn(),
  needsHomeScreenInstall: vi.fn(),
  pushPermissionState: vi.fn(),
  isSubscribed: vi.fn(),
}))

import {
  isPushSupported,
  needsHomeScreenInstall,
  pushPermissionState,
  isSubscribed,
} from '../src/lib/push.js'
import NotificationsNudge from '../src/components/NotificationsNudge.jsx'

function renderNudge() {
  return render(
    <MemoryRouter>
      <NotificationsNudge />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  isPushSupported.mockReturnValue(true)
  needsHomeScreenInstall.mockReturnValue(false)
  pushPermissionState.mockReturnValue('default')
  isSubscribed.mockResolvedValue(false)
})

describe('the notifications nudge', () => {
  it('offers a way in for somebody who has not turned them on', async () => {
    renderNudge()
    expect(await screen.findByTestId('notify-nudge')).toBeInTheDocument()
    // The hash matters: Settings scrolls to the anchored Notifications section
    // (25 Aug 2026 — a bare path dropped people at the top of a long screen,
    // Jay: "does not scroll down automatically to that section").
    expect(screen.getByRole('link', { name: /turn them on/i })).toHaveAttribute(
      'href',
      '/settings#notifications',
    )
  })

  // ⚠️ THE ONE THAT MATTERS MOST. Chrome demotes sites whose permission prompt
  // gets dismissed; a card that links to the toggle is the whole design, and a
  // card that ASKS would be the thing that costs the club the feature.
  it('never asks for permission itself — it only links to the toggle', async () => {
    const requestPermission = vi.fn()
    const original = global.Notification
    global.Notification = { permission: 'default', requestPermission }
    try {
      renderNudge()
      await screen.findByTestId('notify-nudge')
      expect(requestPermission).not.toHaveBeenCalled()
    } finally {
      global.Notification = original
    }
  })

  it('says nothing to somebody who already has them on', async () => {
    isSubscribed.mockResolvedValue(true)
    renderNudge()
    await waitFor(() => expect(isSubscribed).toHaveBeenCalled())
    expect(screen.queryByTestId('notify-nudge')).toBeNull()
  })

  // ⚠️ 'denied' MEANS THEY SAID NO. Asking again is exactly the nagging that
  // gets a site's prompt demoted.
  it('says nothing to somebody who already refused', async () => {
    pushPermissionState.mockReturnValue('denied')
    renderNudge()
    await waitFor(() => expect(isSubscribed).toHaveBeenCalled())
    expect(screen.queryByTestId('notify-nudge')).toBeNull()
  })

  it('says nothing in a browser that cannot do notifications at all', async () => {
    isPushSupported.mockReturnValue(false)
    renderNudge()
    await waitFor(() => expect(isPushSupported).toHaveBeenCalled())
    expect(screen.queryByTestId('notify-nudge')).toBeNull()
  })

  // ⚠️ THE CASE THE CARD IS MOST USEFUL FOR. An iPhone parent has no other way
  // to discover that Web Push needs an installed PWA — and push.js reports
  // "unsupported" for them, so this must be checked FIRST or the one group who
  // need telling are the one group told nothing.
  it('tells an iPhone user about the Home Screen instead of offering a dead link', async () => {
    needsHomeScreenInstall.mockReturnValue(true)
    isPushSupported.mockReturnValue(false)
    renderNudge()

    expect(await screen.findByTestId('notify-nudge')).toBeInTheDocument()
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /turn them on/i })).toBeNull()
  })

  it('stays gone once dismissed, on this device', async () => {
    const user = userEvent.setup()
    const view = renderNudge()
    await user.click(await screen.findByTestId('notify-nudge-dismiss'))
    expect(screen.queryByTestId('notify-nudge')).toBeNull()

    // ⚠️ AND ACROSS A RELOAD. A nag that returns every visit trains people to
    // ignore the one card that matters.
    view.unmount()
    renderNudge()
    await waitFor(() => expect(isSubscribed).toHaveBeenCalled())
    expect(screen.queryByTestId('notify-nudge')).toBeNull()
  })

  // ⚠️ A card telling somebody to turn on what they already turned on is worse
  // than no card, so the failure default is silence.
  it('stays silent when it cannot tell whether they are subscribed', async () => {
    isSubscribed.mockRejectedValue(new Error('service worker unavailable'))
    renderNudge()
    await waitFor(() => expect(isSubscribed).toHaveBeenCalled())
    expect(screen.queryByTestId('notify-nudge')).toBeNull()
  })
})
