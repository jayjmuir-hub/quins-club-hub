// The app-icon badge — Jay, 24 Aug 2026 (late night): "we need to add a
// new chat message count to the app icon". The Badging API: on an
// INSTALLED PWA, `navigator.setAppBadge(n)` paints the count on the icon
// (Android/Chrome, Windows/Edge; iOS home-screen apps from 16.4 with
// notification permission). In a plain browser tab the API is absent and
// every call here is a silent no-op — the badge is an installed-app
// nicety, never a dependency.

/** Paint `count` on the installed app's icon; 0 clears it. Never throws. */
export function setAppBadge(count) {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.setAppBadge !== 'function') return
    if (count > 0) navigator.setAppBadge(count).catch(() => {})
    else navigator.clearAppBadge?.().catch?.(() => {})
  } catch {
    // Badging is decoration; a refusal must never surface.
  }
}
