import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// The toast — design-system.md §4.24, built 3 Sep 2026. Until now every
// screen improvised its own "it worked": the match sheet printed "Saved."
// under its buttons, the team sheet a "Saved" span, Schedule a five-second
// status line, the player import said nothing at all. One channel, one
// place, one wording style.
//
// Shape, from the spec: fixed, bottom-centre, an ink fill, 12px radius,
// ⚠️ text-surface-card, NOT text-white: bg-ink flips WHITE in dark mode
// (tests/theme.test.js, the inverse-pill trap) — the two flip together.
// shows ~2.2 seconds, and a NEW toast REPLACES the current one rather than
// stacking — rapid actions should not queue a column of confirmations.
// Beyond the spec: an optional action ("Undo"), which holds the toast for
// longer because a person needs time to read it and reach for it; a
// role="status" live region so screen readers hear it (the prototype had
// none — design-system.md's own a11y note); and a Dismiss on tap.
//
// ⚠️ PORTALLED TO document.body, z-[60]. Sheets are z-50 and every fixed
// overlay here has been caught inside a stacking context before
// (FloatingChatDock is `fixed z-30`); a toast fired as a sheet closes must
// still be on top of it.
//
// ⚠️ ABOVE THE MOBILE DOCK. Nav's dock is fixed at
// bottom-[calc(12px+env(safe-area-inset-bottom))] and roughly 64px tall, so
// the toast sits at 88px + the inset on a phone and 24px on desktop.
//
// ⚠️ useToast() WORKS WITHOUT THE PROVIDER — it returns a no-op. Three hundred
// suites render screens bare, and a confirmation that nobody listens to must
// not be a crash.

const ToastContext = createContext(() => {})

const SHOW_MS = 2200
const SHOW_WITH_ACTION_MS = 6000

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const counter = useRef(0)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const dismiss = useCallback(() => {
    clear()
    setToast(null)
  }, [clear])

  // show('Saved.') or show('Deleted.', { action: { label: 'Undo', onClick } }).
  // Debounced the way the spec describes: clearTimeout, then a fresh timer.
  const show = useCallback((message, { action = null } = {}) => {
    clear()
    counter.current += 1
    setToast({ id: counter.current, message: String(message), action })
    timer.current = setTimeout(() => {
      timer.current = null
      setToast(null)
    }, action ? SHOW_WITH_ACTION_MS : SHOW_MS)
  }, [clear])

  useEffect(() => clear, [clear])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({ toast, onDismiss }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    // The live region is ALWAYS mounted, empty when idle: a region that
    // appears with its text already inside it is not reliably announced.
    <div
      role="status"
      aria-live="polite"
      data-testid="toast-region"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 desktop:bottom-6"
    >
      {toast && (
        <div
          key={toast.id}
          data-testid="toast"
          className="pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-[12px] bg-ink px-[18px] py-[11px] text-[14px] font-semibold text-surface-card shadow-[0_10px_28px_rgba(0,0,0,0.28)] animate-toast-in motion-reduce:animate-none"
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                onDismiss()
                toast.action.onClick?.()
              }}
              className="-my-2 min-h-[44px] shrink-0 px-2 font-extrabold text-surface-card underline underline-offset-2 hover:underline"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-my-2 -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-surface-card/80 hover:text-surface-card"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

/** `const toast = useToast()` then `toast('Saved.')`. A no-op with no provider. */
export function useToast() {
  return useContext(ToastContext)
}
