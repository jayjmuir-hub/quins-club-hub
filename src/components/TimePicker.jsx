import { useEffect, useRef, useState } from 'react'

// A time picker that is NOT the browser's native `<input type="time">`.
//
// ⚠️ WHY: on desktop the native time control is a cramped AM/PM spinner that is
// awkward to drive with a mouse and impossible to drive in a test (it is an
// OS-level widget). This one is plain React and does both things a person wants:
//   • TYPE it — "1845", "18:45", "6", "630" all resolve. Any minute is allowed.
//   • TAP it — a popover with quick-pick chips and hour/minute columns fills the
//     field. The columns snap to :00/:15/:30/:45; the keyboard is the escape
//     hatch for everything else.
// Both stay in sync, and it mirrors DatePicker's trigger+popover shape so the
// two controls sit together consistently.
//
// Value is 'HH:MM' 24-hour (the exact string the native input emitted), so
// callers — including EventForm's "drag the end time with the start" logic and
// the database — are unchanged.

const pad = (n) => String(n).padStart(2, '0')
const HOURS = Array.from({ length: 24 }, (_, h) => h) // 00–23
const MINUTES = [0, 15, 30, 45] // the tap grid; typing is not limited to these
const DEFAULT_CHIPS = ['17:00', '17:30', '18:00', '18:30', '19:00']

/**
 * Parse whatever a person typed into a canonical 'HH:MM', or null.
 * Accepts "18:45", "1845", "6", "630", "18.45". Any minute 0–59 is valid.
 * Exported for its own unit tests.
 */
export function parseTime(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  let h
  let m
  const colon = /^(\d{1,2})[:.](\d{1,2})$/.exec(s)
  if (colon) {
    h = Number(colon[1])
    m = Number(colon[2])
  } else {
    const digits = s.replace(/\D/g, '')
    if (!digits) return null
    if (digits.length <= 2) {
      h = Number(digits)
      m = 0
    } else if (digits.length === 3) {
      // "630" → 6:30 (first digit is the hour, last two the minutes)
      h = Number(digits.slice(0, 1))
      m = Number(digits.slice(1))
    } else {
      h = Number(digits.slice(0, 2))
      m = Number(digits.slice(2, 4))
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${pad(h)}:${pad(m)}`
}

/** 'HH:MM' → { h, m } for highlighting, or null. */
function toParts(value) {
  const parsed = parseTime(value)
  if (!parsed) return null
  const [h, m] = parsed.split(':').map(Number)
  return { h, m }
}

function ClockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

/**
 * @param {object} props
 * @param {string} props.id            Ties a <label htmlFor> to the field.
 * @param {string} props.value         'HH:MM' or ''.
 * @param {(next: string) => void} props.onChange   Emits 'HH:MM' or ''.
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.invalid]    Sets aria-invalid and the error ring.
 * @param {string}  [props.describedBy]  Forwarded to aria-describedby (help/error note).
 * @param {string[]} [props.chips]     Quick-pick times; [] hides the row.
 * @param {string}  [props.testId]     data-testid on the field.
 */
export default function TimePicker({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  describedBy,
  chips = DEFAULT_CHIPS,
  testId,
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value || '')
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const focusedRef = useRef(false)

  // Outside changes (an edit form loading its row) refresh the field — but never
  // while the person is mid-type, or their keystrokes would be clobbered.
  useEffect(() => {
    if (!focusedRef.current) setText(value || '')
  }, [value])

  // Esc closes and returns focus; an outside click closes without stealing it.
  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.focus()
      }
    }
    function onDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  // On open, bring the selected hour/minute into view in their columns.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelectorAll('[data-sel="true"]').forEach((el) => {
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center' })
    })
  }, [open])

  const sel = toParts(value)

  function commit(next) {
    // next is a canonical 'HH:MM'. Update the field and the caller together.
    setText(next)
    onChange(next)
  }

  function handleType(raw) {
    setText(raw)
    if (raw.trim() === '') {
      onChange('')
      return
    }
    const parsed = parseTime(raw)
    if (parsed) onChange(parsed)
  }

  function handleBlur() {
    focusedRef.current = false
    // Canonicalise what is shown: a valid entry to 'HH:MM', an unparseable one
    // back to the last good value. Do NOT close here — clicking a column cell
    // blurs the input, and closing would drop the click.
    const parsed = parseTime(text)
    setText(parsed || value || '')
  }

  const FIELD_BASE =
    'w-full rounded-[11px] border-[1.5px] bg-surface-card px-3 py-2.5 pr-10 text-[16px] text-ink outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'

  const cellBase = 'w-full py-1.5 text-center text-[14px] tabular-nums transition'

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        data-testid={testId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="e.g. 18:30"
        value={text}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        // ⚠️ FOCUS DOES NOT OPEN IT (2 Sep 2026 UX review, Low): tabbing from
        // "Time" to "End time" used to drop ~33 chip buttons into the Tab
        // order. Click or ArrowDown opens; typing still works closed.
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={handleBlur}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        onChange={(e) => handleType(e.target.value)}
        className={[FIELD_BASE, invalid ? 'border-danger-ink' : 'border-line'].join(' ')}
      />
      <ClockIcon className="pointer-events-none absolute right-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted" />

      {open && !disabled && (
        <div
          ref={panelRef}
          role="group"
          aria-label="Choose a time"
          data-testid="time-picker-panel"
          className="absolute left-0 z-20 mt-2 w-[240px] max-w-[92vw] overflow-hidden rounded-[12px] border-[1.5px] border-line bg-surface-card shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
        >
          {chips.length > 0 && (
            <div className="px-2.5 pb-1.5 pt-2.5">
              <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[.3px] text-ink-faint">Quick pick</div>
              <div className="flex flex-wrap gap-1.5">
                {chips.map((t) => {
                  const isSel = parseTime(value) === parseTime(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => commit(parseTime(t))}
                      className={[
                        'rounded-[8px] border px-2 py-1 text-[12.5px] tabular-nums transition',
                        isSel ? 'border-brand bg-brand font-bold text-white' : 'border-line text-ink hover:bg-surface-mute',
                      ].join(' ')}
                    >
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex border-t-[1.5px] border-line">
            <div className="flex-1">
              <div className="py-1.5 text-center text-[10.5px] font-bold uppercase tracking-[.3px] text-ink-faint">Hour</div>
              <div role="listbox" aria-label="Hour" className="max-h-[152px] overflow-y-auto">
                {HOURS.map((h) => {
                  const isSel = sel?.h === h
                  return (
                    <button
                      key={h}
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      data-sel={isSel ? 'true' : undefined}
                      onClick={() => commit(`${pad(h)}:${pad(sel?.m ?? 0)}`)}
                      className={[cellBase, isSel ? 'bg-brand font-bold text-white' : 'text-ink hover:bg-surface-mute'].join(' ')}
                    >
                      {pad(h)}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="w-px bg-line" />
            <div className="flex-1">
              <div className="py-1.5 text-center text-[10.5px] font-bold uppercase tracking-[.3px] text-ink-faint">Min</div>
              <div role="listbox" aria-label="Minute" className="max-h-[152px] overflow-y-auto">
                {MINUTES.map((m) => {
                  const isSel = sel?.m === m
                  return (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      data-sel={isSel ? 'true' : undefined}
                      onClick={() => commit(`${pad(sel?.h ?? 0)}:${pad(m)}`)}
                      className={[cellBase, isSel ? 'bg-brand font-bold text-white' : 'text-ink hover:bg-surface-mute'].join(' ')}
                    >
                      {pad(m)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
