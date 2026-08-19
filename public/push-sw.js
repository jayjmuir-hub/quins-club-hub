// Push notification handling, loaded into the Workbox-generated service
// worker via vite.config.js's `workbox.importScripts` — NOT a separate
// service worker of its own. This file only adds the two listeners push
// notifications need; everything else (precaching, the fetch handler, the
// autoUpdate/skipWaiting dance) is already wired up by the generated worker
// this gets pulled into, and must stay untouched here.
//
// ⚠️ CLASSIC SCRIPT, NOT A MODULE — `importScripts()` cannot load an ES
// module, so this file has no `import`/`export` and no build step of its
// own. It ships to `dist/` unmodified, the same as every other file under
// `public/`.
//
// claude/plans/2026-08-18-push-notifications.md.

self.addEventListener('push', function (event) {
  var payload = { title: 'Quins Club Hub', body: 'You have a notification.' }
  try {
    if (event.data) payload = event.data.json()
  } catch (error) {
    // A push arrived that this app did not send in the shape it expects —
    // show SOMETHING generic rather than let the event fail silently. The
    // OS-level "a page sent notifications but showed none" warning is worse
    // than a vague one.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Quins Club Hub', {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Two pushes with the same `tag` collapse into one notification in the
      // tray instead of stacking — push-send sets this to `feedback-<id>` so
      // several rapid replies to the SAME report do not spam the tray.
      tag: payload.tag,
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()

  var url = (event.notification.data && event.notification.data.url) || '/'

  // ⚠️ FOCUSES AN ALREADY-OPEN TAB RATHER THAN ALWAYS OPENING A NEW ONE. A
  // parent who taps a notification while the app is already open on their
  // phone should not end up with two tabs of the same PWA.
  //
  // ⚠️ DOES NOT NAVIGATE TO THE SPECIFIC REPORT. v1 opens the app's root —
  // finding the reply still means tapping the `?` button and choosing "See
  // what you've already reported", exactly as the acknowledgement email
  // already describes. A real deep link is future work, not invented here.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        if ('focus' in clients[i]) return clients[i].focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
