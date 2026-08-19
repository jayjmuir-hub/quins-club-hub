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
import {
  NOTIFICATION_CATEGORIES,
  listMyOptOuts,
  setCategoryEnabled,
} from '../data/notificationPreferences.js'

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
  // Categories switched OFF. `null` means "not loaded yet", which is distinct
  // from `[]` — everything on — and the two need different things on screen.
  const [optOuts, setOptOuts] = useState(null)
  const [savingCategory, setSavingCategory] = useState(null)

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

  // ⚠️ ONLY WHEN SUBSCRIBED. The categories are a filter on something already
  // flowing; fetching them for somebody who has never turned notifications on
  // is a query behind a control they cannot see.
  useEffect(() => {
    if (!on) return undefined
    let cancelled = false
    listMyOptOuts()
      .then((rows) => {
        if (!cancelled) setOptOuts(rows)
      })
      .catch(() => {
        // ⚠️ NOT SURFACED AS THE PAGE'S ERROR. Failing to read preferences must
        // not look like failing to turn notifications on — the master switch
        // above is the thing somebody just used, and blaming it would send
        // them to turn it off and on again.
        if (!cancelled) setOptOuts([])
      })
    return () => {
      cancelled = true
    }
  }, [on])

  async function toggleCategory(key, enabled) {
    setSavingCategory(key)
    setError(null)
    // Optimistic, like the triage status control: the checkbox has already
    // moved in the DOM, and leaving state behind makes it snap back and forth.
    setOptOuts((current) =>
      enabled ? (current ?? []).filter((c) => c !== key) : [...(current ?? []), key],
    )
    try {
      await setCategoryEnabled(user?.id, key, enabled)
    } catch (err) {
      setOptOuts((current) =>
        enabled ? [...(current ?? []), key] : (current ?? []).filter((c) => c !== key),
      )
      setError(err.message || "That didn't save. Try again.")
    } finally {
      setSavingCategory(null)
    }
  }

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

      {/* ⚠️ HIDDEN UNTIL NOTIFICATIONS ARE ACTUALLY ON. Showing four
          checkboxes above a switch that is off would offer choices that
          silently do nothing — the browser permission is what decides whether
          anything arrives at all, and no preference here can substitute for
          it. See the correction in
          claude/plans/2026-08-19-notifications-v2.md: "on by default" is not
          something this app can do. */}
      {on && optOuts !== null && (
        <fieldset className="mt-4 border-t border-line pt-3">
          <legend className="mb-2 text-[13px] font-semibold text-ink-muted">
            What to notify me about
          </legend>
          {NOTIFICATION_CATEGORIES.map((category) => {
            const enabled = !optOuts.includes(category.key)
            return (
              <label
                key={category.key}
                htmlFor={`notify-${category.key}`}
                className="mb-2.5 flex min-h-[44px] items-start gap-2.5 last:mb-0"
              >
                <input
                  id={`notify-${category.key}`}
                  type="checkbox"
                  checked={enabled}
                  disabled={savingCategory === category.key}
                  onChange={(e) => toggleCategory(category.key, e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-ink">{category.label}</span>
                  <span className="block text-[13px] text-ink-muted">{category.hint}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
      )}
    </>
  )
}
