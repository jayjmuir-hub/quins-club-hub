import { useEffect } from 'react'

// Close every notification this app has sitting in the phone's tray whenever
// the app comes to the front — Jay, 3 Sep 2026: "why do i have 30
// notifications on my app icon, i open it and there is nothing for me to
// check".
//
// ⚠️ THE 30 WAS THE TRAY, NOT THE APP. The database said zero unread for him.
// Each push becomes a tray notification (public/push-sw.js), and until now
// nothing closed one except tapping it — reading the message inside the app
// left the notification standing. Android launchers (Samsung's in
// particular) paint the NUMBER OF NOTIFICATIONS IN THE SHADE on the icon,
// independently of the Badging API count the app sets, so thirty unopened
// pushes read as 30 on the icon after every message had been read.
//
// ⚠️ CLEAR ALL, NOT "THE ONES FOR THE SCREEN YOU ARE ON". The person is now
// looking at the app, which is the only thing a tray notification exists to
// bring about. A per-screen rule would leave the pile in place for anyone who
// reads a notice via the dashboard rather than via the notice's own screen.
// Messaging apps clear on open for the same reason.
//
// ⚠️ NEVER THROWS AND NEVER BLOCKS. `getNotifications` is absent in plain
// tabs, on iOS below 16.4 and in every test environment; the tray is
// decoration and a refusal must not reach the screen. Fire-and-forget.
//
// The Badging API count is a separate thing and stays with
// src/lib/useDockBadges.js, which repaints it from the true unread count.

/** Close every open notification of this app's service worker. Never throws. */
export function clearNotificationTray() {
  try {
    const sw = typeof navigator === 'undefined' ? null : navigator.serviceWorker
    if (!sw?.ready?.then) return
    sw.ready
      .then((registration) => registration?.getNotifications?.())
      .then((list) => {
        for (const notification of list ?? []) {
          try {
            notification.close()
          } catch {
            // decoration only
          }
        }
      })
      .catch(() => {})
  } catch {
    // decoration only
  }
}

/**
 * Clears the tray on mount and every time the app returns to the foreground.
 * `visibilitychange` is what fires when a phone switches back to an installed
 * PWA; `focus` covers a desktop tab. Both listen for the same cheap call.
 */
export default function useClearNotificationTray() {
  useEffect(() => {
    clearNotificationTray()
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        clearNotificationTray()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])
}
