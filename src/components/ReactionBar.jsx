import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fitPopoverX } from '../lib/popoverFit.js'

// Emoji reactions under a message bubble — the UI half of
// db/migrations/20260824_message_reactions.sql. One tap adds, tapping your
// own again removes; a small fixed menu, not a picker.
//
// ⚠️ REACTION_SET MUST MATCH THE DATABASE'S CHECK CONSTRAINT EXACTLY. A
// sixth emoji here would be accepted by the UI and refused by the database
// as a bare 23514. tests/reaction-bar.test.jsx pins the pair.

export const REACTION_SET = ['👍', '❤️', '😂', '😮', '👏']

// Must match the picker's Tailwind: five w-8 buttons, gap-1, px-2, 1px border.
// Used to place the tray against the viewport *before* paint; jsdom has no
// layout, so the constant is also what the overflow tests assert against.
export const REACTION_PICKER_WIDTH = REACTION_SET.length * 32 + (REACTION_SET.length - 1) * 4 + 16 + 2

/**
 * The add-reaction button plus its five-emoji picker, on its own — round 3
 * split it out of the bar so the WhatsApp surfaces can park it BESIDE the
 * bubble (left of yours, right of theirs) while the tallies stay attached.
 *
 * @param align  'left' | 'right' — preferred hug; flipped/shifted if that
 *   placement would overflow the viewport. Incoming bubbles pass 'left'
 *   (smiley to the right of the bubble); outgoing pass 'right'.
 */
export function ReactionTrigger({ messageId, reactions = [], selfId, onToggle, align = 'left' }) {
  const [picking, setPicking] = useState(false)
  const [place, setPlace] = useState(null)
  const ref = useRef(null)
  const pickerRef = useRef(null)

  function measure() {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      left: fitPopoverX({
        triggerLeft: rect.left,
        triggerRight: rect.right,
        popoverWidth: REACTION_PICKER_WIDTH,
        viewportWidth: window.innerWidth,
        preferred: align === 'right' ? 'right' : 'left',
      }),
      // 8px above the trigger, matching the old `bottom-8` gap minus the
      // trigger's own height. Viewport coordinates so a padded / overflow-clipped
      // parent cannot shove the tray off-screen.
      bottom: window.innerHeight - rect.top + 8,
    }
  }

  function toggle() {
    if (picking) {
      setPicking(false)
      setPlace(null)
      return
    }
    setPlace(measure())
    setPicking(true)
  }

  useEffect(() => {
    if (!picking) return undefined
    function close(domEvent) {
      if (ref.current?.contains(domEvent.target)) return
      if (pickerRef.current?.contains(domEvent.target)) return
      setPicking(false)
      setPlace(null)
    }
    function onResize() {
      setPlace(measure())
    }
    document.addEventListener('mousedown', close)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [picking, align]) // measure reads align + the trigger rect; picking is the subscribe gate.

  return (
    <div ref={ref} className="relative" data-testid="reaction-trigger">
      <button
        type="button"
        aria-label="Add reaction"
        aria-expanded={picking}
        onClick={toggle}
        className="relative grid h-6 w-6 place-items-center rounded-pill border border-line bg-surface-card text-ink-faint hover:text-ink before:absolute before:-inset-2.5 before:content-['']"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
          <circle cx="9" cy="9.5" r="0.5" fill="currentColor" />
          <circle cx="15" cy="9.5" r="0.5" fill="currentColor" />
        </svg>
      </button>
      {/* Portalled to <body> in viewport coordinates. position:absolute
          against the trigger was the clip: a padded / overflow-hidden chat
          row (dock panel, thread scroller) made left-0 hang off the phone. */}
      {picking &&
        place &&
        createPortal(
          <div
            ref={pickerRef}
            data-testid="reaction-picker"
            className="fixed z-50 flex gap-1 rounded-pill border border-line bg-surface-card px-2 py-1.5 shadow-card"
            style={{ left: place.left, bottom: place.bottom }}
          >
            {REACTION_SET.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setPicking(false)
                  setPlace(null)
                  const mine = reactions.some((r) => r.emoji === emoji && r.profile_id === selfId)
                  onToggle(messageId, emoji, !mine)
                }}
                className="grid h-8 w-8 place-items-center rounded-full text-[17px] hover:bg-surface-mute"
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

/**
 * @param messageId  the message these belong to
 * @param reactions  rows {message_id, profile_id, emoji} for THIS message
 * @param selfId     the viewer
 * @param onToggle   (messageId, emoji, on) => void — on=true adds, false removes
 * @param disabled   read-only surfaces (a reviewing admin) hide the add button
 * @param showAdd    false when the trigger lives beside the bubble instead
 */
export default function ReactionBar({ messageId, reactions = [], selfId, onToggle, disabled = false, showAdd = true }) {
  const tallies = REACTION_SET.map((emoji) => {
    const rows = reactions.filter((r) => r.emoji === emoji)
    return { emoji, count: rows.length, mine: rows.some((r) => r.profile_id === selfId) }
  }).filter((t) => t.count > 0)

  if (tallies.length === 0 && (disabled || !showAdd)) return null

  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1" data-testid="reaction-bar">
      {tallies.map((t) => (
        <button
          key={t.emoji}
          type="button"
          aria-pressed={t.mine}
          aria-label={`${t.emoji} ${t.count}`}
          disabled={disabled}
          onClick={() => onToggle(messageId, t.emoji, !t.mine)}
          className={`flex items-center gap-1 rounded-pill border px-1.5 py-0.5 text-[12px] leading-none ${
            t.mine ? 'border-brand bg-danger-bg font-bold text-brand-ink' : 'border-line bg-surface-card text-ink-muted'
          }`}
        >
          <span aria-hidden="true">{t.emoji}</span>
          <span className="text-[11px] font-semibold">{t.count}</span>
        </button>
      ))}
      {!disabled && showAdd && (
        <ReactionTrigger messageId={messageId} reactions={reactions} selfId={selfId} onToggle={onToggle} />
      )}
    </div>
  )
}
