import { useEffect, useRef, useState } from 'react'
import { monthGrid, sameDay, shiftMonth } from '../lib/calendarGrid.js'
import { clubToday } from '../lib/eventFormat.js'

// A date picker that is NOT the browser's native `<input type="date">`.
//
// ⚠️ WHY: the OS date picker committed a date when you navigated to the next
// MONTH (Jay's phone, 29 Aug 2026), so paging a few months — or, for a
// birthday, a few YEARS — was impossible. Native pickers are OS-level, vary by
// browser and cannot be driven in a test. This one is plain React: a trigger
// that reveals an inline calendar, and the calendar's controls are ordinary
// buttons and <select>s that cannot commit a date on navigation.
//
// ⚠️ FAST YEAR/MONTH JUMP IS THE POINT FOR BIRTHDAYS. A child born in 2015 or a
// coach born in 1985 is dozens of months back; a month-at-a-time calendar would
// be unusable there. The month and year are native <select>s — quick to jump,
// keyboard-friendly — with the day grid below.
//
// ⚠️ MONTH BASE: calendarGrid.js is 0-based (JS Date); recurrence.js's
// parse/formatDateInput are 1-based. This file talks to calendarGrid, so its
// own string↔parts helpers below are 0-based. Do not mix the two.
//
// Value is 'yyyy-mm-dd' (the same string the native input emitted), so callers
// and the database are unchanged.

const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n) => String(n).padStart(2, '0')

/** 'yyyy-mm-dd' → 0-based { year, month, day }, or null. */
function toParts(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '')
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) }
}

/** 0-based { year, month, day } → 'yyyy-mm-dd'. */
function toStr({ year, month, day }) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** "15 Aug 2015" for the trigger; the ISO string stays the value. */
function displayDate(str) {
  const p = toParts(str)
  if (!p) return ''
  return `${p.day} ${SHORT_MONTHS[p.month]} ${p.year}`
}

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

/**
 * @param {object} props
 * @param {string} props.id          Ties a <label htmlFor> to the trigger.
 * @param {string} props.value       'yyyy-mm-dd' or ''.
 * @param {(next: string) => void} props.onChange
 * @param {string} [props.min]       'yyyy-mm-dd' — earliest selectable day.
 * @param {string} [props.max]       'yyyy-mm-dd' — latest selectable day.
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.invalid]  Sets aria-invalid and the error ring.
 * @param {string} [props.placeholder]
 */
export default function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  invalid = false,
  placeholder = 'Choose a date',
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(
    () => toParts(value) || toParts(max) || toParts(min) || clubToday(),
  )
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  // When the value arrives/changes from outside (edit form loading its row),
  // move the calendar to it so opening lands on the right month.
  useEffect(() => {
    const p = toParts(value)
    if (p) setView(p)
  }, [value])

  // Esc closes and returns focus; an outside click closes without stealing it.
  useEffect(() => {
    if (!open) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
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

  const selected = toParts(value)
  const minP = toParts(min)
  const maxP = toParts(max)

  // Year range for the jump dropdown. Bounded by min/max where given, else a
  // wide band around today so both a birthday and next term are reachable.
  const baseYear = clubToday().year
  const topYear = maxP ? maxP.year : baseYear + 5
  const bottomYear = minP ? minP.year : baseYear - 100
  const years = []
  for (let y = topYear; y >= bottomYear; y -= 1) years.push(y)

  function outOfRange(cellStr) {
    if (min && cellStr < min) return true
    if (max && cellStr > max) return true
    return false
  }

  function pick(cell) {
    onChange(toStr(cell))
    setOpen(false)
    triggerRef.current?.focus()
  }

  const TRIGGER_BASE =
    'flex w-full items-center justify-between gap-2 rounded-[11px] border-[1.5px] bg-surface-card px-3 py-2.5 text-left text-[16px] outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid ? 'true' : undefined}
        onClick={() => setOpen((was) => !was)}
        className={[TRIGGER_BASE, invalid ? 'border-danger-ink' : 'border-line', value ? 'text-ink' : 'text-ink-faint'].join(' ')}
      >
        <span>{value ? displayDate(value) : placeholder}</span>
        <CalendarIcon className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
      </button>

      {/* Clear — a sibling of the trigger, not nested inside it (a button in a
          button is invalid), positioned just left of the calendar icon. Keeps
          the native input's "you can empty it" behaviour, which a required
          field's own validation still leans on. */}
      {value && !disabled && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => onChange('')}
          className="absolute right-9 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-ink-muted hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}

      {open && view && (
        <div
          role="dialog"
          aria-label="Choose a date"
          data-testid="date-picker-calendar"
          className="mt-2 rounded-[12px] border-[1.5px] border-line bg-surface-card p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
        >
          <div className="mb-2 flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setView(shiftMonth(view, -1))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-ink hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              ‹
            </button>
            <select
              aria-label="Month"
              value={view.month}
              onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
              className="min-w-0 flex-1 rounded-[8px] border border-line bg-surface-card px-2 py-1.5 text-[13.5px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={view.year}
              onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
              className="rounded-[8px] border border-line bg-surface-card px-2 py-1.5 text-[13.5px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView(shiftMonth(view, 1))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-ink hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEK_HEADERS.map((label) => (
              <div key={label} className="py-1 text-center text-[10.5px] font-bold uppercase tracking-[.3px] text-ink-faint">
                {label}
              </div>
            ))}
            {monthGrid(view).map((cell) => {
              const cellStr = toStr(cell)
              const off = outOfRange(cellStr)
              const isSel = sameDay(cell, selected)
              return (
                <button
                  key={cellStr}
                  type="button"
                  disabled={off}
                  aria-label={cellStr}
                  aria-pressed={isSel}
                  onClick={() => {
                    if (!cell.inMonth) setView({ year: cell.year, month: cell.month, day: 1 })
                    pick(cell)
                  }}
                  className={[
                    'grid h-9 place-items-center rounded-[8px] text-[13.5px] transition',
                    off ? 'cursor-not-allowed text-ink-faint/40' : 'hover:bg-surface-mute',
                    cell.inMonth ? 'text-ink' : 'text-ink-faint',
                    isSel ? 'bg-brand font-extrabold text-white hover:bg-brand' : 'font-semibold',
                  ].join(' ')}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
