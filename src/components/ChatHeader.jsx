import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// The bar at the top of every thread — 24 Aug 2026, the WhatsApp reshape.
// Back to the list, who/what this is, one line of context ("27 members ·
// announce-only", "Private · you and Sam"), and a ⋯ menu for the things that
// happen to a whole chat: announce-only, block, delete chat.
//
// ⚠️ THE SUBTITLE IS THE FIX FOR "without even showing who they went to".
// Every thread says, in its header, exactly who can read what is typed below.

/**
 * @param avatar   a node (Avatar / glyph)
 * @param title    string
 * @param subtitle string
 * @param actions  [{ label, onClick, danger? }] — the ⋯ menu; omit for none
 */
export default function ChatHeader({ avatar, title, subtitle, actions = [] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    // Chrome-free conversations (Jay, 25 Aug 2026): the masthead island is
    // hidden inside a thread (AppShell's conversationScreen), so this bar
    // pins at the very top — the 64px clearance it carried while the island
    // floated above it (#389) went with the island. The safe-area folds into
    // the padding so the bar's own background covers the notch. This header
    // only renders on conversation screens (Chat.jsx and the DM thread), so
    // there is no masthead case left to clear — except view-as, where the
    // chrome stays and this bar slides under the banner: accepted, an admin
    // previewing a thread is rare and the banner must win.
    <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center gap-2.5 border-b border-line bg-surface px-1 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] desktop:pt-2" data-testid="chat-header">
      <Link
        to="/chat"
        aria-label="Back to chats"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink hover:bg-surface-mute"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Link>
      {avatar}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[16px] font-extrabold leading-tight text-ink">{title}</h2>
        {subtitle && <p className="truncate text-[12px] text-ink-muted" data-testid="chat-subtitle">{subtitle}</p>}
      </div>
      {actions.length > 0 && (
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Chat options"
            aria-expanded={open}
            aria-haspopup="menu"
            className="grid h-9 w-9 place-items-center rounded-full text-ink hover:bg-surface-mute"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {open && (
            <ul
              role="menu"
              className="absolute right-0 top-10 z-20 min-w-[190px] overflow-hidden rounded-card border border-line bg-surface-card py-1 shadow-card"
            >
              {actions.map((a) => (
                <li key={a.label} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      a.onClick()
                    }}
                    className={`block w-full px-3.5 py-2 text-left text-[13.5px] font-semibold hover:bg-surface-mute ${
                      a.danger ? 'text-danger-ink' : 'text-ink'
                    }`}
                  >
                    {a.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
