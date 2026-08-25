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

  // Round 7: mark the INSTALLED app's icon while the app is closed. The
  // worker cannot know the true unread count, so a no-argument
  // setAppBadge shows the platform's generic "something new" mark; the
  // app replaces it with the real number the moment it opens
  // (src/lib/useDockBadges.js). Guarded — the API is absent on plenty of
  // platforms and a push must never fail over decoration.
  try {
    if (self.navigator && typeof self.navigator.setAppBadge === 'function') {
      self.navigator.setAppBadge().catch(function () {})
    }
  } catch (error) {
    // decoration only
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Quins Club Hub', {
      body: payload.body || '',
      // -v2: bumped with the bat-wing icon (25 Aug 2026); the un-suffixed
      // file still exists for notifications shown by an older cached worker.
      icon: '/icons/icon-192-v2.png',
      badge: '/icons/icon-192-v2.png',
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
  // ⚠️ AND IT MUST NAVIGATE THAT TAB, NOT MERELY FOCUS IT. This is the 19 Aug
  // 2026 bug, found by Jay on the first real notification the club ever
  // received: the loop below used to `return clients[i].focus()` and stop, so
  // `url` was read only on the openWindow branch and an already-open app
  // simply came back to whatever screen it was showing. He tapped a reply to
  // his report and landed on More -> Notifications.
  //
  // ⚠️ THE HAND TEST CANNOT SEE THIS, WHICH IS WHY IT SHIPPED. You turn
  // notifications on from More -> Notifications, so that is the screen you are
  // already sitting on when the first one arrives, and "focus" looks right.
  // tests/push-sw.test.js is the thing that can see it.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i]
        if (!('focus' in client)) continue

        // ⚠️ navigate() REJECTS ON A CLIENT THIS WORKER DOES NOT CONTROL, and
        // an uncontrolled window is a real state on a first load rather than a
        // theoretical one. It also does not exist at all in every browser. In
        // both cases fall back to telling the running app where to go, which
        // src/lib/notificationRouting.js listens for — a client-side route
        // instead of a full page load, and the only option left that still
        // honours the tap.
        if ('navigate' in client) {
          return client
            .navigate(url)
            .then(function (navigated) {
              return (navigated || client).focus()
            })
            .catch(function () {
              if ('postMessage' in client) {
                client.postMessage({ type: 'notification-navigate', url: url })
              }
              return client.focus()
            })
        }

        if ('postMessage' in client) {
          client.postMessage({ type: 'notification-navigate', url: url })
        }
        return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
