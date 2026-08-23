import { useEffect, useId, useRef } from 'react'

// The single generic modal (design-system.md §4.16 .sheet + .scrim): a
// bottom-anchored sheet on mobile, a centered dialog at the `desktop:`
// breakpoint. Used for event detail, event add/edit, player detail, player
// add/edit — every overlay in the app.
//
// No portal: this renders in place (no createPortal). The sheet is
// `position:fixed`, which positions against the viewport regardless of
// where it sits in the DOM tree, as long as no ancestor sets a CSS
// `transform`/`filter`/`perspective` (any of which would turn that ancestor
// into the fixed-positioning containing block instead). AppShell (Task 8)
// sets none of those on any ancestor today, so a portal buys no correctness
// here — it would only add indirection. If a future ancestor ever adopts a
// transform (e.g. a page-transition wrapper), this assumption breaks and a
// portal becomes necessary; flagged here so that's not a surprise.
//
// Accessibility (design-system.md §8 lists these as the prototype's gaps —
// this is the "fix in the rewrite" the doc calls for):
//   - role="dialog" aria-modal="true", labelled by the visible title
//   - closes on Escape and on backdrop click
//   - traps Tab/Shift+Tab focus inside the panel while open
//   - moves focus into the panel on open, restores it to whatever had focus
//     before opening (the trigger element) on close
//   - renders nothing at all when closed (no hidden-but-present DOM)
//
// Motion: the mobile slide-up / desktop scale-fade entrance (design-
// system.md §4.16) is implemented via the `animate-sheet-slide-up` /
// `animate-sheet-scale-in` / `animate-scrim-fade-in` keyframes registered in
// tailwind.config.js, each paired with `motion-reduce:animate-none`. There
// is deliberately no matching exit animation — since the panel unmounts to
// nothing the instant `open` goes false, an exit animation would need to
// delay that unmount, which conflicts with the "renders nothing at all when
// closed" requirement above. Closing is instant; opening animates.

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// `dismissible` defaults to true, so every existing caller is unchanged.
// Passing false removes ALL THREE exits at once — the X, Escape, and the
// backdrop click. It has to be all three: a gate with two of them closed is
// not a gate, it is a gate with a side door, and which door a given person
// finds is a matter of whether they use a keyboard.
//
// Used by NamePrompt, the sign-in name gate. Do not reach for it to make an
// ordinary form feel important; a modal a user cannot leave is a trap unless
// completing it is genuinely the only way forward.
export function Sheet({ open, onClose, title, children, dismissible = true }) {
  const titleId = useId()
  const panelRef = useRef(null)
  const triggerRef = useRef(null)

  // Latest-ref pattern: any screen consuming Sheet with a controlled form
  // field (Sheet's own header comment names event/player add-edit forms as
  // the primary use case — Tasks 14/15) re-renders its parent on every
  // keystroke, which recreates an inline `onClose={() => setOpen(false)}`
  // with a fresh identity each time. If `onClose` were in the effect's
  // dependency array below, that fresh identity would re-run the whole
  // effect on every keystroke — re-running its cleanup mid-typing, which
  // calls `triggerRef.current?.focus?.()` and yanks focus out of the input
  // after every character. Reading the callback through a ref instead means
  // the effect only depends on `open`, so it runs exactly once per
  // open/close transition regardless of the caller's callback identity.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Same latest-ref treatment, and for the same reason: the keydown handler is
  // installed once per open/close transition, so reading `dismissible` from
  // the closure would freeze whatever it was at open time.
  const dismissibleRef = useRef(dismissible)
  dismissibleRef.current = dismissible

  useEffect(() => {
    if (!open) return undefined

    // Capture whatever had focus before the sheet opened, so it can be
    // restored on close (design-system.md §8 gap: "no focus return to the
    // trigger element on close").
    triggerRef.current = document.activeElement

    const panel = panelRef.current
    const focusables = panel ? Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)) : []
    ;(focusables[0] ?? panel)?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        // Still stopPropagation on a non-dismissible sheet: the keypress must
        // not fall through to whatever is behind the scrim either.
        if (dismissibleRef.current) onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const nodes = panel ? Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)) : []
      if (nodes.length === 0) {
        event.preventDefault()
        return
      }

      const first = nodes[0]
      const last = nodes[nodes.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    // Prevent background scroll while the sheet is open (matches the
    // prototype's body.style.overflow="hidden" behaviour).
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = previousOverflow
      triggerRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose is
    // read through onCloseRef (see comment above); it must NOT be a
    // dependency here, that's the fix, not an oversight.
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(24,10,20,0.5)] backdrop-blur-[2px] animate-scrim-fade-in motion-reduce:animate-none desktop:items-center"
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="glass-panel max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] shadow-card animate-sheet-slide-up motion-reduce:animate-none desktop:max-h-[88vh] desktop:w-[min(520px,94vw)] desktop:animate-sheet-scale-in desktop:rounded-[20px]"
      >
        {/* Drag-handle bar (design-system.md §4.16 .sheet-grip): mobile
            only, visual affordance only — there is no swipe-to-dismiss
            gesture wired up, matching the prototype (dismissal is tap-scrim
            or tap-close only). Hidden at the desktop breakpoint, where the
            sheet becomes a centered dialog with no grip. */}
        <div className="flex justify-center pb-1 pt-2.5 desktop:hidden" aria-hidden="true">
          <span className="h-1 w-[38px] rounded-full bg-surface-sunk" />
        </div>
        <div className="glass-panel sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line px-[18px] py-4">
          <h3 id={titleId} className="text-[18px] font-extrabold text-ink">
            {title}
          </h3>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-mute text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        {/* Bottom padding adds env(safe-area-inset-bottom) on top of the
            base 16px (design-system.md §3: "tab bar and FAB bottom offsets
            add env(safe-area-inset-bottom)" — the same treatment AppShell's
            <main> and Nav's tab bar already use). On a mobile sheet the
            panel's bottom edge sits flush with the viewport bottom, so
            without this the last row of content — a contact link, or the
            Save button on every add/edit form from Task 14 onward — lands
            inside an iPhone's home-indicator zone, where it is both hard to
            read and hard to tap. The inset resolves to 0 on every device
            that has no such zone, so this costs nothing elsewhere. */}
        <div className="px-[18px] pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">{children}</div>
      </div>
    </div>
  )
}

export default Sheet
