import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { setAppBadge } from './appBadge.js'
import { countUnreadMessages, subscribeMessages } from '../data/messages.js'
import { countAdminWaiting } from '../data/members.js'

// The dock's status dots (23 Aug 2026, the motion pass): a red dot with a
// glow halo on Chat when there are unread posts, and on More — the phone's
// route to Admin — when an admin has approvals or access requests waiting.
// The same red that marks the active tab, carrying meaning rather than
// decoration.
//
// ⚠️ A DOT, NOT A COUNT. "3 unread" invites a parent to feel they owe the
// app three reads; a dot says "something new" and goes away when they look.
// The sidebar's Admin item shows the number because an admin IS the person
// who owes those reviews.
//
// Refresh policy, in order of cheapness:
//   - chat: realtime on `messages` (already the screen's own subscription
//     shape), plus a recount when LEAVING /chat — that is where reads get
//     recorded, so the count taken before the visit is the one that is wrong.
//   - admin: a recount when leaving Accounts/approvals, the same rule the
//     sidebar badge follows and for the same reason.
// Both fail to "no dot": a count that cannot be read must never paint a
// dot the screen cannot clear.

const CHAT_PATHS = ['/chat']
const ACCOUNTS_PATHS = ['/admin/accounts', '/approvals']

function onAny(pathname, paths) {
  return paths.some((path) => pathname.startsWith(path))
}

/**
 * @param {{ userId: string|null, admin: boolean, enabled?: boolean }} args
 * @returns {{ '/chat': boolean, '/more': boolean }}
 */
export default function useDockBadges({ userId, admin, enabled = true }) {
  const { pathname } = useLocation()
  const [chat, setChat] = useState(false)
  const [more, setMore] = useState(false)
  const [chatTick, setChatTick] = useState(0)
  const [adminTick, setAdminTick] = useState(0)

  const onChat = onAny(pathname, CHAT_PATHS)
  const onAccounts = onAny(pathname, ACCOUNTS_PATHS)
  const wasOnChat = useRef(onChat)
  const wasOnAccounts = useRef(onAccounts)
  useEffect(() => {
    if (wasOnChat.current && !onChat) setChatTick((n) => n + 1)
    wasOnChat.current = onChat
  }, [onChat])
  useEffect(() => {
    if (wasOnAccounts.current && !onAccounts) setAdminTick((n) => n + 1)
    wasOnAccounts.current = onAccounts
  }, [onAccounts])

  useEffect(() => {
    if (!enabled || !userId) {
      setChat(false)
      // Signed out: a stale count on the icon is a claim about an account
      // nobody is in.
      setAppBadge(0)
      return undefined
    }
    let mounted = true
    const recount = () =>
      countUnreadMessages(userId)
        .then((n) => {
          if (!mounted) return
          setChat(n > 0)
          // Round 7, Jay: "add a new chat message count to the app icon".
          // Same number, same recount — the installed icon and the dock dot
          // cannot disagree. A no-op in a plain tab (src/lib/appBadge.js).
          setAppBadge(n)
        })
        .catch(() => mounted && setChat(false))
    recount()
    const unsubscribe = subscribeMessages(recount)
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [enabled, userId, chatTick])

  useEffect(() => {
    if (!enabled || !admin) {
      setMore(false)
      return undefined
    }
    let mounted = true
    countAdminWaiting(userId)
      .then((n) => mounted && setMore(n > 0))
      .catch(() => mounted && setMore(false))
    return () => {
      mounted = false
    }
  }, [enabled, admin, userId, adminTick])

  // While you are ON the screen the dot points at, it is noise — Chat is
  // clearing itself as you read.
  return { '/chat': chat && !onChat, '/more': more && !onAccounts }
}
