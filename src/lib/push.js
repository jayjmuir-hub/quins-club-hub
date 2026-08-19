import { supabase } from './supabase.js'
import { isInstalled, isIosSafari } from './installPrompt.js'

// Real browser/OS push notifications — not email. Jay, 18 Aug 2026: "I don't
// want more emails, I just want app push notifications." First (and only, for
// now) trigger: a reply to your own report. claude/plans/2026-08-18-push-
// notifications.md.
//
// ⚠️ NOT A SECRET. VAPID public keys are designed to be public — they
// identify the sending application server, the way any public key does. Kept
// in sync BY HAND with the same literal in supabase/functions/push-send/
// index.ts; there are only the two places, and a mismatch fails loudly (the
// browser refuses to subscribe with a key it does not recognise) rather than
// silently.
const VAPID_PUBLIC_KEY = 'BIk1aNY5eXSyvkXrOTVPcSZZypmVXWsXKSqGH5q5TxhWm4kJ4M1oVhhnInX-eniqENr3N6HI23CkGkiHQVEMJGI'

/**
 * `pushManager.subscribe()` wants the application server key as a
 * BufferSource, not the base64url string every other API in this codebase
 * hands around. This is the one place that conversion happens.
 */
function urlBase64ToUint8Array(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Does this browser have the APIs push notifications need at all? */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * True when push cannot work YET, specifically because this is iOS Safari
 * and the app has not been added to the Home Screen.
 *
 * ⚠️ DELIBERATELY INDEPENDENT OF `isPushSupported()`, NOT GATED BY IT. An
 * earlier version of this function required `isPushSupported()` to be true
 * first — which made it unreachable, because the whole reason this function
 * needs to exist is that iOS Safari's ANSWER to "is PushManager/Notification
 * present" is not a reliable predictor of whether `subscribe()` will actually
 * work outside an installed PWA. Whatever feature detection reports, "is this
 * iOS Safari, not installed" is checked and shown FIRST, everywhere this is
 * used — see subscribeToPush() and PushNotificationsToggle.jsx. Caught by
 * tests/push.test.js, which asserted the message a real non-installed iPhone
 * should see and found this branch could never be reached.
 *
 * ⚠️ NOT "unsupported" EITHER, for the same reason in the other direction —
 * Safari supports Web Push perfectly well from an installed PWA (iOS 16.4+,
 * September 2023), so a plain "not supported" message would send someone
 * looking for a different browser instead of the Home Screen.
 */
export function needsHomeScreenInstall() {
  return isIosSafari() && !isInstalled()
}

/**
 * `Notification.permission`, or null when the API does not exist at all —
 * kept distinct from 'denied' because the UI reads them differently ("this
 * browser can't" vs "you said no").
 */
export function pushPermissionState() {
  if (typeof Notification === 'undefined') return null
  return Notification.permission
}

/** Is there an active push subscription on THIS device right now? */
export async function isSubscribed() {
  if (!isPushSupported()) return false
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription !== null
}

/**
 * Turns notifications on for this device: asks permission if needed,
 * subscribes with the browser's Push API, and records the subscription.
 *
 * ⚠️ RECORDING IS A PLAIN INSERT, NOT AN RPC. `push_subscriptions` is
 * owner-only under RLS (profile_id = auth.uid()), so an ordinary insert as
 * the signed-in user is already exactly as safe as a written-for-purpose
 * function would be — see the migration for the policy.
 *
 * ⚠️ A SHARED-DEVICE EDGE CASE, KNOWN AND NOT SOLVED HERE. If a different
 * person already subscribed THIS device (a family tablet, say), the browser
 * hands back the SAME endpoint, and inserting it under a different
 * `profile_id` collides with the existing row's UNIQUE constraint — RLS will
 * not let this insert see or replace a row it does not own, so it fails with
 * an ordinary duplicate-key error. Surfaced as a plain "couldn't turn that
 * on" rather than something more specific: this is rare enough that a
 * confusing but honest failure beats guessing at what the other person
 * should do about it.
 *
 * Throws on refusal (permission denied, browser unsupported, or the insert
 * failing) so the caller can show why. Returns nothing on success.
 */
export async function subscribeToPush(profileId) {
  if (!profileId) throw new Error('subscribeToPush needs a profile id.')
  // ⚠️ CHECKED BEFORE isPushSupported(), NOT INSIDE ITS BRANCH — see
  // needsHomeScreenInstall()'s own comment for why the two cannot be nested.
  if (needsHomeScreenInstall()) {
    throw new Error('Add this app to your Home Screen first — Share, then Add to Home Screen.')
  }
  if (!isPushSupported()) {
    throw new Error('This browser does not support notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Check your browser or phone settings.'
        : 'Notifications were not turned on.',
    )
  }

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  // PushSubscription#toJSON() already returns p256dh/auth as base64url
  // strings — the same encoding this app uses everywhere else, and the
  // encoding public.push_subscriptions stores. No manual ArrayBuffer
  // conversion is needed on this side.
  const { endpoint, keys } = subscription.toJSON()

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { profile_id: profileId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' },
    )
  if (error) throw error
}

/**
 * Turns notifications off for this device: unsubscribes the browser AND
 * removes the row, so push-send stops trying to reach an endpoint that no
 * longer exists. Either half failing does not stop the other — a browser
 * that can no longer unsubscribe (rare) should not leave a dead row lingering
 * forever, and a dead row should not stop the person's own OS-level toggle
 * from taking effect.
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const { endpoint } = subscription.toJSON()
  await subscription.unsubscribe().catch(() => {})
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}
