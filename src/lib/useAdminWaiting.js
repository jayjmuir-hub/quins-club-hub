import { useEffect, useRef, useState } from 'react'
import { countAdminWaiting } from '../data/members.js'
import { subscribeToTable } from '../data/subscribeToTable.js'

// The number an admin opens the app for: approvals and access requests
// waiting (countAdminWaiting). ONE hook behind both places that show it —
// the desktop sidebar's Admin count and the phone dock's More dot — so the
// two can never disagree about when to look again.
//
// ⚠️ UNTIL 2 Sep 2026 THIS WAS COUNTED ON MOUNT AND WHEN LEAVING ACCOUNTS,
// AND NOTHING ELSE. Jay, on the desktop site: "when I have the desktop site
// open and new join approvals come in the little number icon on admin
// doesn't increment unless I open admin again or refresh". A tab left open
// on the Schedule all afternoon showed the morning's number. Chat had a
// realtime subscription from the start; this count did not.
//
// Refresh policy now, cheapest first:
//   1. realtime on `memberships` and `access_requests` — a pending row
//      arriving or being decided is exactly the event that moves the count.
//      ⚠️ BOTH TABLES HAD TO BE ADDED TO THE `supabase_realtime` PUBLICATION
//      (db/migrations/20260902_realtime_admin_waiting.sql). A subscription
//      on a table outside the publication connects, reports SUBSCRIBED, and
//      never fires — no error anywhere. Debounced, because an approval
//      touches memberships and access_requests in one go.
//   2. the tab coming back — `visibilitychange` to visible, or window focus —
//      recounts if the last count is older than a few seconds. This is the
//      belt under the realtime braces: a laptop that slept drops its socket,
//      and a profile created without an access request (a sign-up abandoned
//      at the name prompt) is counted but never announced by either table.
//   3. `tick` from the caller — Sidebar and useDockBadges bump it when the
//      admin LEAVES Accounts, where the queue gets cleared, the rule from
//      23 Aug 2026 that still holds.
// Every path fails to the last good number, never to a throw: a count that
// cannot be read must not take the sidebar down with it. The initial state
// is 0, so a first failure shows no badge (the previous behaviour).

// Realtime events from one approval arrive as a burst; one recount serves.
export const ADMIN_WAITING_DEBOUNCE_MS = 400
// A tab flickering between focus and blur must not recount on every flick.
export const ADMIN_WAITING_FOCUS_MIN_AGE_MS = 5000

/**
 * @param {{ userId: string|null, enabled: boolean, tick?: number }} args
 * @returns {number} how many are waiting; 0 when disabled or unreadable
 */
export default function useAdminWaiting({ userId, enabled, tick = 0 }) {
  const [count, setCount] = useState(0)
  const lastCountedAt = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setCount(0)
      return undefined
    }
    let mounted = true
    const recount = () => {
      lastCountedAt.current = Date.now()
      return countAdminWaiting(userId)
        .then((n) => {
          if (mounted) setCount(n)
        })
        .catch(() => {
          // Keep the last good number. On the very first count that is 0,
          // which is the "no badge" the sidebar has always shown on failure.
        })
    }
    recount()

    const unsubscribeMemberships = subscribeToTable('memberships', recount, {
      debounceMs: ADMIN_WAITING_DEBOUNCE_MS,
    })
    const unsubscribeRequests = subscribeToTable('access_requests', recount, {
      debounceMs: ADMIN_WAITING_DEBOUNCE_MS,
    })

    const onReturn = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (Date.now() - lastCountedAt.current < ADMIN_WAITING_FOCUS_MIN_AGE_MS) return
      recount()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)

    return () => {
      mounted = false
      unsubscribeMemberships?.()
      unsubscribeRequests?.()
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [enabled, userId, tick])

  return count
}
