import { useEffect, useRef, useState } from 'react'

// Emoji reactions under a message bubble — the UI half of
// db/migrations/20260824_message_reactions.sql. One tap adds, tapping your
// own again removes; a small fixed menu, not a picker.
//
// ⚠️ REACTION_SET MUST MATCH THE DATABASE'S CHECK CONSTRAINT EXACTLY. A
// sixth emoji here would be accepted by the UI and refused by the database
// as a bare 23514. tests/reaction-bar.test.jsx pins the pair.

export const REACTION_SET = ['👍', '❤️', '😂', '😮', '👏']

/**
 * @param messageId  the message these belong to
 * @param reactions  rows {message_id, profile_id, emoji} for THIS message
 * @param selfId     the viewer
 * @param onToggle   (messageId, emoji, on) => void — on=true adds, false removes
 * @param disabled   read-only surfaces (a reviewing admin) hide the add button
 */
export default function ReactionBar({ messageId, reactions = [], selfId, onToggle, disabled = false }) {
  const [picking, setPicking] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!picking) return undefined
    function close(domEvent) {
      if (!ref.current?.contains(domEvent.target)) setPicking(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [picking])

  const tallies = REACTION_SET.map((emoji) => {
    const rows = reactions.filter((r) => r.emoji === emoji)
    return { emoji, count: rows.length, mine: rows.some((r) => r.profile_id === selfId) }
  }).filter((t) => t.count > 0)

  if (tallies.length === 0 && disabled) return null

  return (
    <div ref={ref} className="relative mt-1 flex flex-wrap items-center gap-1" data-testid="reaction-bar">
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
      {!disabled && (
        <button
          type="button"
          aria-label="Add reaction"
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
          className="grid h-6 w-6 place-items-center rounded-pill border border-line bg-surface-card text-ink-faint hover:text-ink"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
            <circle cx="9" cy="9.5" r="0.5" fill="currentColor" />
            <circle cx="15" cy="9.5" r="0.5" fill="currentColor" />
          </svg>
        </button>
      )}
      {picking && (
        <div
          data-testid="reaction-picker"
          className="absolute bottom-8 left-0 z-20 flex gap-1 rounded-pill border border-line bg-surface-card px-2 py-1.5 shadow-card"
        >
          {REACTION_SET.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setPicking(false)
                const mine = reactions.some((r) => r.emoji === emoji && r.profile_id === selfId)
                onToggle(messageId, emoji, !mine)
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-[17px] hover:bg-surface-mute"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
