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

// "Get the app" — the install sheet, and the account-menu row that opens it.
//
// ══ WAS A PILL IN THE MASTHEAD, 12–25 Aug 2026 ═══════════════════════════════
//
// Jay, 12 Aug 2026: "i want an App button in the top bar, similar to the design
// of the adhjrt website". It shipped as a frosted "App" pill in the masthead
// row — and became the row's widest fixed item. On 25 Aug Jay's phone (a
// Samsung with screen zoom, ~320 CSS px of viewport) showed the wordmark
// truncated to "QUINS CLUB H…" and he called it: "the App button is cutting
// off the text to the left". Asked to choose between compacting the pill and
// moving it, he chose the move — so the install route now lives in the
// account menu, which is where AppShell's own note says every new control
// belongs ("THE NEXT CONTROL GOES IN AccountMenu.jsx, NOT HERE"). The
// masthead row is back to one trigger after the role pill.
//
// ⚠️ IT MEANS "GET THIS AS AN APP", NOT "GO TO THE APP". The Club Hub IS the
// app; the useful thing this row does is the thing nobody could find:
// install it to the home screen.
//
// ⚠️ AND THAT WAS ONLY REACHABLE FROM A BANNER THAT CAN BE DISMISSED FOREVER.
// InstallPrompt sets `quins.install-prompt-dismissed` in localStorage and then
// never renders again on that device. Anyone who tapped "Not now" once had no
// route back at all. This is the permanent one, which is why it deliberately
// does NOT read the dismissed flag.
//
// ⚠️ HIDDEN ONCE INSTALLED, on every platform. Somebody reading this inside the
// installed app has already done it, and an install row in an installed app
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

/** A phone with a down-arrow: install-to-device, drawn in the menu's stroke style. */
function InstallIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M12 7v6m0 0-2.5-2.5M12 13l2.5-2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  )
}

/**
 * Installed-state tracking, shared by the row and the sheet.
 * `beforeinstallprompt` usually lands before React mounts (the module
 * captures it at load), but a slow first paint can invert that — and
 * `appinstalled` can fire while this is on screen, from Chrome's own menu.
 */
function useInstallState() {
  const [hasNative, setHasNative] = useState(() => nativeInstallAvailable())
  const [installed, setInstalled] = useState(() => isInstalled())
  useEffect(
    () =>
      subscribeInstall(() => {
        setHasNative(nativeInstallAvailable())
        setInstalled(isInstalled())
      }),
    [],
  )
  return { hasNative, installed, setInstalled }
}

/**
 * The account-menu row. Renders nothing once installed. `itemClass` /
 * `iconClass` come from AccountMenu so this row is pixel-identical to its
 * siblings without exporting the menu's private style constants.
 *
 * @param {object} props
 * @param {() => void} props.onOpen     Opens the sheet AppShell owns.
 * @param {string} props.itemClass
 * @param {string} props.iconClass
 */
export function GetAppMenuItem({ onOpen, itemClass, iconClass }) {
  const { installed } = useInstallState()
  if (installed) return null
  return (
    <button type="button" role="menuitem" data-testid="app-button" onClick={onOpen} className={itemClass}>
      <InstallIcon className={iconClass} />
      Get the app
    </button>
  )
}

/**
 * The install sheet. State lives in AppShell (the HelpSheet pattern): the
 * account-menu panel unmounts when the menu closes, so the sheet cannot be
 * owned by the row that opens it.
 */
export default function GetAppSheet({ open, onClose }) {
  const { hasNative, installed, setInstalled } = useInstallState()
  const [busy, setBusy] = useState(false)

  if (!open || installed) return null

  const ios = isIosSafari()

  async function install() {
    setBusy(true)
    const accepted = await promptInstall()
    setBusy(false)
    if (accepted) {
      setInstalled(true)
      onClose()
    }
  }

  return (
    <Sheet open onClose={onClose} title="Get the app">
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
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
