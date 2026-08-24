import { useEffect, useRef, useState } from 'react'

// The message context menu — round 4, from Jay's WhatsApp screenshots
// (claude/plans/2026-08-24-chat-round-4.md): a chevron on the bubble
// opening Reply · Forward · Copy · Pin · Star · Reply privately · Delete /
// Report. It replaced round 3's inline text-action row: seven actions as
// permanent text under every bubble is noise; one chevron is not.
//
// Pure props: the screen decides WHICH items a message gets (yours vs
// theirs, group vs DM, participant vs reviewer) — this only draws them.

/**
 * @param items  [{ label, onClick, danger? }]
 * @param mine   colours the chevron for the green bubble it sits on
 */
export default function MessageMenu({ items = [], mine = false }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function close(domEvent) {
      if (!ref.current?.contains(domEvent.target)) setOpen(false)
    }
    function onKey(domEvent) {
      if (domEvent.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!items.length) return null
  return (
    <div ref={ref} className="absolute right-1 top-1 z-10" data-testid="message-menu">
      <button
        type="button"
        aria-label="Message options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`grid h-5 w-5 place-items-center rounded-full ${mine ? 'text-white/70 hover:bg-white/15 hover:text-white' : 'text-ink-faint hover:bg-surface-mute hover:text-ink'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="menu"
          className={`absolute top-6 z-30 min-w-[170px] overflow-hidden rounded-card border border-line bg-surface-card py-1 shadow-card ${mine ? 'right-0' : 'left-0'}`}
        >
          {items.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  a.onClick()
                }}
                className={`block w-full px-3 py-1.5 text-left text-[13px] font-semibold hover:bg-surface-mute ${a.danger ? 'text-danger-ink' : 'text-ink'}`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
