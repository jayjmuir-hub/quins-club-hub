// Installing the app to the home screen.
//
// ⚠️ THIS APP HAS BEEN A REAL, INSTALLABLE PWA SINCE THE PWA PLUGIN LANDED,
// AND NOTHING IN THE UI EVER SAID SO. Verified live 12 Aug 2026:
// manifest.webmanifest serves with display:standalone, all four icons (192,
// 512 and both maskable) return 200 image/png, and sw.js is served and
// registered via virtual:pwa-register. That is every installability criterion
// met — so Chrome has been free to offer an install all along, and iPhone
// users have had no way to discover it at all.
//
// Jay asked "do we have a PWA for this?" on 12 Aug 2026, which is the whole
// justification for this file: if the person who commissioned the app does not
// know it installs, no parent is going to work it out.
//
// ⚠️ THE TWO PLATFORMS ARE GENUINELY DIFFERENT AND MUST NOT BE COLLAPSED.
//   Android/Chrome  fires `beforeinstallprompt`, which can be captured and
//                   replayed later against a button we draw. A real install.
//   iOS/Safari      NEVER fires it. Apple has no programmatic install at all.
//                   The ONLY route is Share → Add to Home Screen, by hand.
// So one platform gets a button that installs, and the other gets
// instructions. Showing an "Install" button on iOS would be a button that
// cannot work — the same dead-affordance defect EventDetail already shipped
// once with its availability button.

const DISMISSED_KEY = 'quins.install-prompt-dismissed'

// ⚠️ CAPTURED AT MODULE LOAD, NOT IN A useEffect. `beforeinstallprompt` fires
// once and early — often before React has mounted the tree — and it is not
// re-fired. A listener registered inside a component's effect misses it on the
// exact load where it mattered, and the banner then never appears until a
// later visit. Registering here means the event is already in hand by the time
// anything renders.
let deferredPrompt = null
const subscribers = new Set()

function notify() {
  for (const fn of subscribers) fn()
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // preventDefault stops Chrome's own mini-infobar so ours is the only
    // prompt. It is also what makes the event replayable later.
    event.preventDefault()
    deferredPrompt = event
    notify()
  })
  // Fired when the install completes by ANY route, including Chrome's own menu
  // rather than our button. Without this the banner would sit there inviting
  // someone to install an app they have just installed.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** Subscribe to changes in whether a native install is available. */
export function subscribeInstall(callback) {
  subscribers.add(callback)
  return () => subscribers.delete(callback)
}

/** The captured event, or null when the browser has not offered one. */
export function nativeInstallAvailable() {
  return deferredPrompt !== null
}

/**
 * Runs the real Chrome install flow. Resolves true if the user accepted.
 *
 * ⚠️ THE EVENT IS SINGLE-USE. Chrome refuses a second prompt() on the same
 * event, so it is cleared either way — including on dismissal, because the
 * browser will fire a fresh `beforeinstallprompt` on a later visit if it still
 * wants to offer one. Holding a spent event would leave a button that silently
 * does nothing.
 */
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return false
  deferredPrompt = null
  notify()
  try {
    await event.prompt()
    const choice = await event.userChoice
    return choice?.outcome === 'accepted'
  } catch {
    // A rejected prompt() is not an app error — the person simply does not get
    // an install this time.
    return false
  }
}

/**
 * Is the app ALREADY running as an installed app?
 *
 * Two checks because the platforms report it differently: `display-mode:
 * standalone` is the standard and works on Android and desktop, while iOS
 * Safari has never implemented it for this and exposes the non-standard
 * `navigator.standalone` instead. Checking only the first shows the banner to
 * every iPhone user who has already installed it.
 */
export function isInstalled() {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches === true
  const iosStandalone = window.navigator?.standalone === true
  return standalone || iosStandalone
}

/**
 * Does this look like iOS Safari, where the manual Share route is the only
 * one that exists?
 *
 * ⚠️ IT MUST BE SAFARI, NOT MERELY iOS, AND THIS IS THE PART PEOPLE GET WRONG.
 * Chrome, Firefox and Edge on iPhone are all Safari underneath but none of
 * them can add to the home screen — the option is absent from their share
 * sheets. Telling a Chrome-on-iPhone user to "tap Share then Add to Home
 * Screen" sends them looking for a menu item that is not there.
 *
 * ⚠️ iPadOS 13+ REPORTS ITSELF AS A MAC. `navigator.platform` is 'MacIntel' on
 * an iPad, so the touch-point test is what separates an iPad from a desktop
 * Mac. Without it, iPad users are told nothing at all.
 */
export function isIosSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iPadOnDesktopUA =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  const isIos = /iPad|iPhone|iPod/.test(ua) || iPadOnDesktopUA
  if (!isIos) return false
  // Every iOS browser's UA contains 'Safari'; only the real one lacks a
  // vendor prefix.
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|Brave/.test(ua)
  return !isOtherBrowser
}

/** Has this person already said no? */
export function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    // Private browsing and blocked storage both throw. A banner that cannot
    // remember a dismissal is better than a crash, so treat it as not
    // dismissed and let them close it again.
    return false
  }
}

export function setDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, '1')
  } catch {
    // See above — nothing to do, and nothing worth reporting to a user.
  }
}

// Test seam. The module-level listener and localStorage both persist across
// tests in one file, so the suite needs a way back to a known state. Not used
// by the app.
export function __resetInstallPromptForTests() {
  deferredPrompt = null
  subscribers.clear()
  try {
    window.localStorage.removeItem(DISMISSED_KEY)
  } catch {
    /* ignore */
  }
}

export function __setDeferredPromptForTests(event) {
  deferredPrompt = event
  notify()
}
