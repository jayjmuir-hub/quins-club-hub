import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Sheet from './Sheet.jsx'
import {
  isInstalled,
  isIosSafari,
  nativeInstallAvailable,
  promptInstall,
  subscribeInstall,
} from '../lib/installPrompt.js'

// The "App" link in the masthead.
//
// Jay, 12 Aug 2026: "i want an App button in the top bar, similar to the design
// of the adhjrt website".
//
// ⚠️ THE DESIGN IS BORROWED; THE COLOUR IS NOT, AND THAT DISTINCTION COST A
// BUILD. adhjrt.com's header carries an "App" link distinguished by COLOUR AND
// WEIGHT rather than by a filled pill — measured off the live site on 12 Aug
// 2026: weight 700, 15px, 8px radius, ~7px/11px padding, no background and no
// border, in a row of weight-600 white links. That SHAPE is what is copied.
//
// ⚠️ ITS GREEN IS NOT. Sampling #3bd070 off that site failed
// tests/press-feedback.test.js: it is the RETIRED brand green, and that site
// still runs the pre-6-Aug palette. This uses `accent` — the current one —
// which is 5.71:1 on the chrome. See the note in tailwind.config.js.
//
// ⚠️ IT MEANS "GET THIS AS AN APP", NOT "GO TO THE APP". On adhjrt.com — a
// marketing site — "App" links to a separate match-day companion. The Club Hub
// IS the app, so a link to itself would be a button that goes nowhere. The
// useful thing an "App" button can do here is the thing nobody could find:
// install it to the home screen.
//
// ⚠️ AND THAT WAS ONLY REACHABLE FROM A BANNER THAT CAN BE DISMISSED FOREVER.
// InstallPrompt sets `quins.install-prompt-dismissed` in localStorage and then
// never renders again on that device. Anyone who tapped "Not now" once had no
// route back at all. This is the permanent one, which is why it deliberately
// does NOT read the dismissed flag.
//
// ⚠️ HIDDEN ONCE INSTALLED, on every platform. Somebody reading this inside the
// installed app has already done it, and an install button in an installed app
// is the clearest possible sign that nothing is paying attention.
//
// ⚠️ IT IS NOT A DEAD AFFORDANCE ON A BROWSER THAT CANNOT INSTALL, and the
// distinction matters because this codebase has shipped that defect before (the
// availability button that drew itself and swallowed the tap). The BANNER stays
// silent there, correctly — unprompted instructions that do not apply are
// noise. This is different: somebody has ASKED. So the sheet always has a true
// answer, including "this browser will not do it, here is one that will".

/** iOS's own share glyph. Drawn, not described — see InstallPrompt. */
function ShareIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  )
}

export default function AppButton() {
  const [open, setOpen] = useState(false)
  const [hasNative, setHasNative] = useState(() => nativeInstallAvailable())
  const [busy, setBusy] = useState(false)
  const [installed, setInstalled] = useState(() => isInstalled())

  // `beforeinstallprompt` usually lands before React mounts (the module
  // captures it at load), but a slow first paint can invert that — and
  // `appinstalled` can fire while this is on screen, from Chrome's own menu.
  useEffect(
    () =>
      subscribeInstall(() => {
        setHasNative(nativeInstallAvailable())
        setInstalled(isInstalled())
      }),
    [],
  )

  if (installed) return null

  const ios = isIosSafari()

  async function install() {
    setBusy(true)
    const accepted = await promptInstall()
    setBusy(false)
    if (accepted) {
      setInstalled(true)
      setOpen(false)
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid="app-button"
        onClick={() => setOpen(true)}
        // ⚠️ `shrink-0` LIKE EVERY OTHER ITEM IN THIS ROW. The masthead's one
        // shrinkable item is the wordmark, and it absorbs every overflow — the
        // defect that rendered "ABU…" on every screen for a week. A new item
        // that could squeeze is a new way to bring that back.
        className={[
          'shrink-0 rounded-[8px] px-2.5 py-1.5 text-[15px] font-bold transition',
          'text-accent hover:bg-white/10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        App
      </button>

      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Get the app">
          <div className="p-4">
            <p className="text-sm leading-relaxed text-ink">
              Quins Club Hub installs to your home screen. It opens like an app with no address
              bar, and still shows your fixtures when you have no signal.
            </p>

            {ios ? (
              // ⚠️ NAMES THE BROWSER. Add to Home Screen exists only in Safari
              // on iOS — it is absent from Chrome and Firefox share sheets
              // there — so somebody reading this in Chrome needs to know why
              // they cannot find it.
              <div className="mt-3.5 rounded-[11px] bg-surface-mute p-3.5">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <ShareIcon aria-hidden="true" className="h-4.5 w-4.5 shrink-0 text-brand-ink" />
                  On iPhone and iPad
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                  In <strong className="font-semibold text-ink">Safari</strong>, tap the Share
                  button at the bottom of the screen, then choose{' '}
                  <strong className="font-semibold text-ink">Add to Home Screen</strong>.
                </p>
              </div>
            ) : hasNative ? null : (
              // ⚠️ THE HONEST ANSWER, NOT A DEAD END. No captured event and not
              // iOS Safari means this browser will not install it — so say so,
              // and name the ones that will, rather than showing a button that
              // cannot work.
              <div className="mt-3.5 rounded-[11px] bg-surface-mute p-3.5">
                <p className="text-sm font-bold text-ink">This browser won&apos;t install it</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                  Open <strong className="font-semibold text-ink">adhquins-clubhub.com</strong> in{' '}
                  <strong className="font-semibold text-ink">Chrome</strong> on Android, or{' '}
                  <strong className="font-semibold text-ink">Safari</strong> on iPhone, and the
                  option will be there. On a computer, Chrome and Edge show an install icon at the
                  right-hand end of the address bar.
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2.5">
              {hasNative && (
                <Button onClick={install} disabled={busy}>
                  {busy ? 'Installing…' : 'Install'}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  )
}
