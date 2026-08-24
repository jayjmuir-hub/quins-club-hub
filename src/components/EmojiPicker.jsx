import { useEffect, useRef, useState } from 'react'

// The composer's emoji picker — round 2, Jay's word was simply "emojis"
// (claude/plans/2026-08-24-chat-feedback.md). A curated grid, NOT a
// searchable library: zero dependencies, a few KB, one tap. Typing emoji
// from a keyboard already worked; this is the button desktop was missing.
//
// ⚠️ DESKTOP ONLY (hidden below the `desktop:` breakpoint, same variant the
// dock uses): a phone's keyboard has a better picker than this one, and the
// button would spend thumb-space the composer needs.
//
// ⚠️ DISTINCT FROM REACTIONS. ReactionBar's fixed five are a database check
// constraint on message_reactions; this list is composer input — plain text
// in the body — and widening or trimming it touches nothing but this file.

const GROUPS = [
  ['Smileys', ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤩', '🥳', '😉', '🙂', '🤗', '🤔', '😴', '😅', '😇', '🙃', '😢', '😭', '😡', '🤯', '😱', '🫡']],
  ['Gestures', ['👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👋', '✌️', '🤞', '👌', '🤙', '☝️', '🫶']],
  ['Rugby & sport', ['🏉', '🏆', '🥇', '🥈', '🥉', '🎽', '⏱️', '🏟️', '🥅', '🚩', '🎯', '🔥']],
  ['Hearts & things', ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '⭐', '🎉', '🎂', '☀️', '🌧️', '⚡', '💯', '✅', '❌', '❓', '❗', '💤']],
]

/**
 * The 🙂 button plus its popover. `onPick(emoji)` fires per tap and the
 * popover STAYS OPEN — half the fun of emoji is three in a row. Outside
 * click or Escape closes.
 */
export default function EmojiPicker({ onPick, disabled = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function onDocClick(domEvent) {
      if (!rootRef.current?.contains(domEvent.target)) setOpen(false)
    }
    function onKey(domEvent) {
      if (domEvent.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative hidden desktop:block" data-testid="emoji-picker">
      {open && (
        <div
          className="absolute bottom-12 right-0 z-40 max-h-64 w-72 overflow-y-auto rounded-[14px] border border-line bg-surface-card p-2.5 shadow-card"
          data-testid="emoji-grid"
          role="menu"
          aria-label="Emoji"
        >
          {GROUPS.map(([label, list]) => (
            <div key={label} className="mb-1.5 last:mb-0">
              <p className="px-1 pb-1 font-condensed text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-faint">{label}</p>
              <div className="grid grid-cols-8">
                {list.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    onClick={() => onPick?.(emoji)}
                    className="grid h-8 w-8 place-items-center rounded-[8px] text-[18px] leading-none hover:bg-surface-mute"
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label="Add an emoji"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-[19px] leading-none hover:bg-surface-mute disabled:opacity-40"
        data-testid="emoji-button"
      >
        <span aria-hidden="true">🙂</span>
      </button>
    </div>
  )
}
