import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './Card.jsx'
import { isPushSupported, needsHomeScreenInstall, pushPermissionState, isSubscribed } from '../lib/push.js'

// A card on Home for people who have not switched notifications on.
//
// ══ ⚠️ WHY A CARD AND NOT A PROMPT ═══════════════════════════════════════
//
// **This must never call `Notification.requestPermission()` itself.** Chrome
// tracks how often a site's permission prompt is dismissed and silently demotes
// poor performers to a quiet prompt most people never see. One badly-placed
// prompt on page load can cost the club the feature permanently, for everybody,
// and it cannot be undone by asking more politely later.
//
// So this explains, and links to the toggle in More. The person taps there,
// deliberately, having read what they would get.
// claude/plans/2026-08-19-notifications-v2.md.
//
// ══ ⚠️ THE NUMBER THAT MADE THIS WORTH BUILDING ══════════════════════════
//
// On 19 Aug 2026, the day notices learned to notify: **1 subscriber out of 31
// active members.** Everything built that day reached one person. A feature
// nobody knows about is not shipped.
//
// ══ RETURNS null MORE OFTEN THAN IT RENDERS ══════════════════════════════
//
// Silent when notifications are already on, when the browser cannot do them,
// when permission was refused (asking again is nagging), and once dismissed.
// ⚠️ That property is what makes it acceptable ABOVE the fold on Home — the
// same argument NoticeBoard's header makes for itself. If it ever starts
// rendering a placeholder, its placement has to be re-decided.

// ⚠️ PER DEVICE, AND localStorage IS THEREFORE THE RIGHT HOME FOR IT — not a
// column on `profiles`. A push subscription IS per device and per browser:
// somebody who dismissed this on their laptop has said nothing about their
// phone, which is the device they would actually want notifications on.
const DISMISSED_KEY = 'quins:notify-nudge-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private browsing, or storage disabled. Showing the card is the safe
    // failure: worst case somebody dismisses it twice.
    return false
  }
}

export default function NotificationsNudge() {
  // `null` while we ask the Push API. Rendering nothing until we know beats a
  // card that appears and then vanishes for somebody already subscribed.
  const [subscribed, setSubscribed] = useState(null)
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    let cancelled = false
    if (!isPushSupported()) {
      setSubscribed(false)
      return () => {
        cancelled = true
      }
    }
    isSubscribed()
      .then((value) => {
        if (!cancelled) setSubscribed(value)
      })
      .catch(() => {
        // ⚠️ TREATED AS SUBSCRIBED ON FAILURE, i.e. SHOW NOTHING. The opposite
        // default would put a card in front of somebody who already turned
        // notifications on, telling them to go and turn them on.
        if (!cancelled) setSubscribed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Nothing to do — it will reappear next time, which is not worth an error.
    }
  }

  if (dismissed || subscribed === null || subscribed) return null
  // ⚠️ 'denied' MEANS THEY SAID NO. Asking again is the nagging that gets a
  // site demoted, and the toggle in More already explains how to undo it.
  if (pushPermissionState() === 'denied') return null

  // ⚠️ CHECKED BEFORE isPushSupported(), for the reason src/lib/push.js sets
  // out at length: iOS Safari's answer to feature detection does not predict
  // whether subscribing will work outside an installed PWA. This is also the
  // one case where the card is MOST useful — an iPhone parent has no way to
  // discover the Home Screen requirement otherwise.
  const needsInstall = needsHomeScreenInstall()
  if (!needsInstall && !isPushSupported()) return null

  return (
    <Card className="mb-3 p-4" data-testid="notify-nudge">
      <p className="text-[15px] font-extrabold text-ink">Get told when something changes</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        {needsInstall
          ? 'On an iPhone, notifications work once the app is on your Home Screen — tap Share, then Add to Home Screen, then open it from there.'
          : 'A notification when a notice goes up for your squad, or when somebody replies to something you reported. You choose which.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {!needsInstall && (
          <Link
            to="/more"
            className="inline-flex min-h-[44px] items-center rounded-[8px] bg-brand px-4 text-[15px] font-bold text-white hover:bg-brand-deep"
          >
            Turn them on
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          data-testid="notify-nudge-dismiss"
          className="min-h-[44px] px-1 text-sm font-bold text-ink-muted underline"
        >
          Not now
        </button>
      </div>
    </Card>
  )
}
