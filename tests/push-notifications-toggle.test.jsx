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

const listMyOptOutsMock = vi.fn()
const setCategoryEnabledMock = vi.fn()
vi.mock('../src/data/notificationPreferences.js', () => ({
  NOTIFICATION_CATEGORIES: [
    { key: 'notice', label: 'New notices', hint: 'When somebody posts a notice.' },
    { key: 'feedback_reply', label: 'Replies to your reports', hint: 'When somebody answers.' },
  ],
  listMyOptOuts: (...a) => listMyOptOutsMock(...a),
  setCategoryEnabled: (...a) => setCategoryEnabledMock(...a),
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
  listMyOptOutsMock.mockReset()
  setCategoryEnabledMock.mockReset()
  listMyOptOutsMock.mockResolvedValue([])
  setCategoryEnabledMock.mockResolvedValue(undefined)
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

// ══════════════════════════════════════════════════════════════════════════
//  CATEGORIES — 19 Aug 2026. Jay: "we need more notification categories not
//  just the help tickets", and "then people can opt out if they want".
// ══════════════════════════════════════════════════════════════════════════

describe('notification categories', () => {
  // ⚠️ THE MOST IMPORTANT ONE. Checkboxes above an OFF master switch would be
  // choices that silently do nothing: the browser permission decides whether
  // anything arrives at all, and no preference here can substitute for it.
  it('are not offered until notifications are actually on', async () => {
    isSubscribed.mockResolvedValue(false)
    render(<PushNotificationsToggle />)
    await screen.findByTestId('push-toggle')
    expect(screen.queryByLabelText(/new notices/i)).toBeNull()
    expect(listMyOptOutsMock).not.toHaveBeenCalled()
  })

  it('are all on by default, because absence of a row means on', async () => {
    isSubscribed.mockResolvedValue(true)
    listMyOptOutsMock.mockResolvedValue([])
    render(<PushNotificationsToggle />)

    expect(await screen.findByLabelText(/new notices/i)).toBeChecked()
    expect(screen.getByLabelText(/replies to your reports/i)).toBeChecked()
  })

  it('shows a category as off when an opt-out row exists', async () => {
    isSubscribed.mockResolvedValue(true)
    listMyOptOutsMock.mockResolvedValue(['notice'])
    render(<PushNotificationsToggle />)

    expect(await screen.findByLabelText(/new notices/i)).not.toBeChecked()
    // ⚠️ The OTHER one must stay on — an opt-out is per category, not a
    // master off switch wearing a different hat.
    expect(screen.getByLabelText(/replies to your reports/i)).toBeChecked()
  })

  it('writes the change through when you switch one off', async () => {
    const user = userEvent.setup()
    isSubscribed.mockResolvedValue(true)
    render(<PushNotificationsToggle />)

    await user.click(await screen.findByLabelText(/new notices/i))
    await waitFor(() =>
      expect(setCategoryEnabledMock).toHaveBeenCalledWith('profile-1', 'notice', false),
    )
  })

  it('switches one back on by deleting the opt-out', async () => {
    const user = userEvent.setup()
    isSubscribed.mockResolvedValue(true)
    listMyOptOutsMock.mockResolvedValue(['notice'])
    render(<PushNotificationsToggle />)

    await user.click(await screen.findByLabelText(/new notices/i))
    await waitFor(() =>
      expect(setCategoryEnabledMock).toHaveBeenCalledWith('profile-1', 'notice', true),
    )
  })

  // ⚠️ THE CHECKBOX MUST GO BACK. An optimistic switch that stays moved after
  // a failed save is a person believing they turned something off.
  it('puts the checkbox back and says so when the save fails', async () => {
    const user = userEvent.setup()
    isSubscribed.mockResolvedValue(true)
    setCategoryEnabledMock.mockRejectedValue(new Error('network is down'))
    render(<PushNotificationsToggle />)

    const box = await screen.findByLabelText(/new notices/i)
    await user.click(box)

    expect(await screen.findByRole('alert')).toHaveTextContent(/network is down/i)
    await waitFor(() => expect(screen.getByLabelText(/new notices/i)).toBeChecked())
  })

  // ⚠️ A failure to READ preferences must not look like a failure to turn
  // notifications on - the master switch is what somebody just used.
  it('falls back to everything-on when the preferences cannot be read', async () => {
    isSubscribed.mockResolvedValue(true)
    listMyOptOutsMock.mockRejectedValue(new Error('nope'))
    render(<PushNotificationsToggle />)

    expect(await screen.findByLabelText(/new notices/i)).toBeChecked()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
