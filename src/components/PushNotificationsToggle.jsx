import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import { useAuth } from '../lib/auth.jsx'
import {
  isPushSupported,
  needsHomeScreenInstall,
  pushPermissionState,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push.js'

// The ONE toggle for the ONE thing push notifications currently do: tell you
// when somebody replies to a report you filed. claude/plans/2026-08-18-push-
// notifications.md. Lives in More because More is the one screen every role
// reaches on a phone — the same reason CalendarSubscribe and SendAnIdea sit
// here rather than on a dedicated settings screen this app does not have.

export default function PushNotificationsToggle() {
  const { user } = useAuth()
  const [on, setOn] = useState(false)
  const [checking, setChecking] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  // ⚠️ RE-CHECKED ON MOUNT, NOT ASSUMED FROM A STORED FLAG. The permission or
  // the subscription itself can change from OUTSIDE this component entirely —
  // the person revokes it in their OS notification settings, or clears the
  // browser's site data — and there is no event this app can listen for when
  // that happens. Asking the Push API directly is the only way to show the
  // true state rather than a stale one.
  useEffect(() => {
    let cancelled = false
    if (isPushSupported()) {
      isSubscribed()
        .then((value) => {
          if (!cancelled) setOn(value)
        })
        .finally(() => {
          if (!cancelled) setChecking(false)
        })
    } else {
      setChecking(false)
    }
    return () => {
      cancelled = true
    }
  }, [])

  async function handleToggle() {
    setError(null)
    setWorking(true)
    try {
      if (on) {
        await unsubscribeFromPush()
        setOn(false)
      } else {
        await subscribeToPush(user?.id)
        setOn(true)
      }
    } catch (err) {
      setError(err.message || "That didn't work. Try again.")
    } finally {
      setWorking(false)
    }
  }

  // ⚠️ CHECKED FIRST, BEFORE isPushSupported() — see that function's own
  // comment in src/lib/push.js for why nesting this inside the "not
  // supported" branch made it unreachable.
  if (needsHomeScreenInstall()) {
    return (
      <p className="text-sm leading-relaxed text-ink-faint">
        On an iPhone, notifications only work once the app is added to your Home Screen — tap
        Share, then Add to Home Screen, then come back here.
      </p>
    )
  }

  if (!isPushSupported()) {
    return (
      <p className="text-sm leading-relaxed text-ink-faint">
        This browser doesn&apos;t support notifications.
      </p>
    )
  }

  if (pushPermissionState() === 'denied') {
    return (
      <p className="text-sm leading-relaxed text-ink-faint">
        Notifications are blocked for this site. Turn them back on in your browser or phone&apos;s
        settings, then come back here.
      </p>
    )
  }

  return (
    <>
      <p className="text-sm leading-relaxed text-ink">
        Get a notification on this device when somebody at the club replies to a report you sent.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
        >
          {error}
        </p>
      )}

      <Button
        className="mt-3"
        variant={on ? 'secondary' : 'primary'}
        disabled={checking || working}
        onClick={handleToggle}
        data-testid="push-toggle"
      >
        {checking ? 'Checking…' : working ? 'Working…' : on ? 'Turn off' : 'Turn on notifications'}
      </Button>
    </>
  )
}
