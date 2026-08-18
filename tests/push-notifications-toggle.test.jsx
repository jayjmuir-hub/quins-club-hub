import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Component tests for PushNotificationsToggle. src/lib/push.js is fully
// mocked — its own behaviour (feature detection, the RLS-shaped upsert, the
// Home Screen priority-ordering fix) is covered in tests/push.test.js. This
// file only asserts what the SCREEN shows for each state that module can
// report, and that the toggle calls the right function.

const useAuthMock = vi.fn()
vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/lib/push.js', () => ({
  isPushSupported: vi.fn(),
  needsHomeScreenInstall: vi.fn(),
  pushPermissionState: vi.fn(),
  isSubscribed: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}))

import {
  isPushSupported,
  needsHomeScreenInstall,
  pushPermissionState,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '../src/lib/push.js'
import PushNotificationsToggle from '../src/components/PushNotificationsToggle.jsx'

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { id: 'profile-1' } })
  isPushSupported.mockReturnValue(true)
  needsHomeScreenInstall.mockReturnValue(false)
  pushPermissionState.mockReturnValue('default')
  isSubscribed.mockResolvedValue(false)
})

describe('PushNotificationsToggle', () => {
  it('shows the Home Screen message on iOS Safari that has not installed the app, and offers no toggle', async () => {
    needsHomeScreenInstall.mockReturnValue(true)

    render(<PushNotificationsToggle />)

    expect(screen.getByText(/add.*to your Home Screen/i)).toBeInTheDocument()
    expect(screen.queryByTestId('push-toggle')).not.toBeInTheDocument()
  })

  it('⚠️ checks needsHomeScreenInstall EVEN WHEN isPushSupported says false, and shows that message — not "unsupported"', () => {
    // The exact regression tests/push.test.js caught in the underlying
    // module: a component that only asked needsHomeScreenInstall() inside an
    // `if (!isPushSupported())` branch would still be fine here since both
    // are mocked independently — this pins the SCREEN-level contract, that
    // the Home Screen message wins over the generic one.
    isPushSupported.mockReturnValue(false)
    needsHomeScreenInstall.mockReturnValue(true)

    render(<PushNotificationsToggle />)

    expect(screen.getByText(/add.*to your Home Screen/i)).toBeInTheDocument()
    expect(screen.queryByText(/doesn.t support/i)).not.toBeInTheDocument()
  })

  it('shows an unsupported message on a browser with no Push API at all', () => {
    isPushSupported.mockReturnValue(false)

    render(<PushNotificationsToggle />)

    expect(screen.getByText(/doesn.t support notifications/i)).toBeInTheDocument()
    expect(screen.queryByTestId('push-toggle')).not.toBeInTheDocument()
  })

  it('shows a blocked message when permission was already denied, and offers no toggle', () => {
    pushPermissionState.mockReturnValue('denied')

    render(<PushNotificationsToggle />)

    expect(screen.getByText(/blocked for this site/i)).toBeInTheDocument()
    expect(screen.queryByTestId('push-toggle')).not.toBeInTheDocument()
  })

  it('offers "Turn on" when not yet subscribed, and turns on via subscribeToPush(profileId)', async () => {
    isSubscribed.mockResolvedValue(false)
    subscribeToPush.mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<PushNotificationsToggle />)

    const button = await screen.findByTestId('push-toggle')
    await waitFor(() => expect(button).toHaveTextContent(/turn on/i))

    await user.click(button)

    expect(subscribeToPush).toHaveBeenCalledWith('profile-1')
    await waitFor(() => expect(button).toHaveTextContent(/turn off/i))
  })

  it('reflects an existing subscription as "Turn off" on load, without a click', async () => {
    isSubscribed.mockResolvedValue(true)

    render(<PushNotificationsToggle />)

    const button = await screen.findByTestId('push-toggle')
    await waitFor(() => expect(button).toHaveTextContent(/turn off/i))
  })

  it('turns off via unsubscribeFromPush() and needs no profile id to do it', async () => {
    isSubscribed.mockResolvedValue(true)
    unsubscribeFromPush.mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(<PushNotificationsToggle />)

    const button = await screen.findByTestId('push-toggle')
    await waitFor(() => expect(button).toHaveTextContent(/turn off/i))

    await user.click(button)

    expect(unsubscribeFromPush).toHaveBeenCalled()
    await waitFor(() => expect(button).toHaveTextContent(/turn on/i))
  })

  it('shows the refusal message and leaves the toggle in its PREVIOUS state when subscribing fails', async () => {
    isSubscribed.mockResolvedValue(false)
    subscribeToPush.mockRejectedValue(new Error('Notifications are blocked for this site.'))
    const user = userEvent.setup()

    render(<PushNotificationsToggle />)

    const button = await screen.findByTestId('push-toggle')
    await waitFor(() => expect(button).toHaveTextContent(/turn on/i))

    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked for this site/i)
    // ⚠️ STILL "Turn on" — a failed attempt must not flip the label to a
    // state the subscription never actually reached.
    expect(button).toHaveTextContent(/turn on/i)
  })
})
