import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import {
  isDismissed,
  isInstalled,
  isIosSafari,
  nativeInstallAvailable,
  promptInstall,
  setDismissed,
  subscribeInstall,
} from '../lib/installPrompt.js'

// "Download the App" — the banner that tells people this is an app.
//
// ⚠️ THE HEADING SAYS "DOWNLOAD" AND THE BODY DOES NOT, AND THAT IS THE POINT.
// Jay, 20 Aug 2026: parents look for a download. Nothing is downloaded from a
// store here, so the heading borrows the word people search for and the body
// then tells them what actually happens.
// ⚠️ DO NOT "FIX" THE iOS BODY TO MATCH THE HEADING. It says "Add to Home
// Screen" because that is the literal wording of the menu item in Safari, and
// a parent scrolling that share sheet has to find those exact words. Renaming
// it to "Download" would describe a control that does not exist — the same
// dead-affordance defect this file's Android/iOS split already exists to
// avoid. `tests/install-prompt.test.jsx` pins the Safari step for this reason.
//
// See src/lib/installPrompt.js for the reasoning. In short: the app has been
// installable all along and nothing said so, and the two platforms need
// different treatment because iOS has no programmatic install at all.
//
// ⚠️ ONE BANNER, TWO BEHAVIOURS, AND NEVER THE WRONG ONE:
//   Android/Chrome  a real Install button, wired to the captured event.
//   iOS Safari      the Share → Add to Home Screen steps, and NO button —
//                   because there is nothing a button could call. A button
//                   that cannot work is the dead-affordance defect this
//                   codebase has already shipped once.
//   anything else   nothing at all. Desktop Firefox, Chrome-on-iPhone and a
//                   browser that has not offered an install all render
//                   nothing, rather than instructions that do not apply.

function ShareIcon(props) {
  // iOS's own share glyph — a box with an arrow leaving the top. Drawn rather
  // than described, because "the Share button" means nothing to somebody who
  // has never noticed it.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

function PlusSquareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  )
}

export default function InstallPrompt() {
  // ⚠️ READ ONCE INTO STATE, NOT ON EVERY RENDER. isDismissed() touches
  // localStorage; calling it during render would re-read storage on every
  // parent re-render, and this sits inside AppShell, which re-renders on every
  // route change and every membership refresh.
  const [dismissed, setDismissedState] = useState(() => isDismissed())
  const [hasNative, setHasNative] = useState(() => nativeInstallAvailable())
  const [busy, setBusy] = useState(false)

  // The event usually arrives before this mounts (see the module), but not
  // always — a slow first paint can invert the order. Subscribing covers both,
  // and also catches `appinstalled` firing from Chrome's own menu.
  useEffect(() => subscribeInstall(() => setHasNative(nativeInstallAvailable())), [])

  // Already an app on their phone — nothing to offer, on any platform.
  if (isInstalled()) return null
  if (dismissed) return null

  const ios = isIosSafari()
  // ⚠️ NOTHING TO SAY MEANS SAY NOTHING. Without a captured event and without
  // iOS Safari, there is no install route we can either trigger or describe.
  if (!hasNative && !ios) return null

  function close() {
    setDismissed()
    setDismissedState(true)
  }

  async function install() {
    setBusy(true)
    const accepted = await promptInstall()
    setBusy(false)
    // Accepted or refused, this banner is done: `appinstalled` clears the
    // event on success, and on refusal the browser will offer again another
    // day. Either way, asking twice in one session is nagging.
    if (accepted) setDismissedState(true)
  }

  return (
    <div
      data-testid="install-prompt"
      className="mb-4 rounded-[11px] border-[1.5px] border-line bg-surface-card p-3.5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-surface-mute text-brand-ink"
        >
          {ios ? <ShareIcon className="h-5 w-5" /> : <PlusSquareIcon className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">Download the App</p>

          {ios ? (
            // ⚠️ NAMES THE BROWSER, and that is not pedantry. Add to Home
            // Screen exists only in Safari on iOS — it is absent from Chrome
            // and Firefox share sheets there — so somebody reading this in
            // Chrome needs to know why they cannot find it.
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              In <strong className="font-semibold text-ink">Safari</strong>, tap the Share button
              at the bottom of the screen, then choose{' '}
              <strong className="font-semibold text-ink">Add to Home Screen</strong>. It then opens
              like an app, with no address bar.
            </p>
          ) : (
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              Opens like an app, with no address bar — and still shows your fixtures when you have
              no signal.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {/* ⚠️ THE BUTTON EXISTS ONLY WHERE IT CAN DO SOMETHING. On iOS the
                block is instructions and a dismiss, because no API can open
                Apple's share sheet for us. */}
            {hasNative && (
              <Button onClick={install} disabled={busy}>
                {busy ? 'Installing…' : 'Install'}
              </Button>
            )}
            <Button variant="secondary" onClick={close}>
              {hasNative ? 'Not now' : 'Got it'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
