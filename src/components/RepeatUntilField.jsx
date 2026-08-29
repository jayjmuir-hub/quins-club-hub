import { useEffect, useState } from 'react'
import { monthGrid, sameDay, shiftMonth } from '../lib/calendarGrid.js'

// "How long does the repeat run?" — the control that replaced the native
// `<input type="date">` for "Repeat until" on 29 Aug 2026.
//
// ⚠️ WHY THIS EXISTS: the native date picker committed a date when you clicked
// to the next MONTH (Jay's phone), so navigating a few months out was
// impossible without it auto-picking and closing. Native date pickers are
// OS-level and vary by browser; they can't be driven in tests and this one
// could not be tamed. So: a plain number of weeks by default (no calendar at
// all), and an OPTIONAL inline calendar built from React buttons — its prev/next
// month controls are ordinary `onClick`s that cannot commit a date.
//
// ⚠️ MONTH BASE: calendarGrid.js carries months 0-based (JS Date), while
// recurrence.js's parseDateInput/formatDateInput are 1-based. This file talks to
// calendarGrid, so its own string↔parts helpers below are 0-based. Do not reuse
// formatDateInput here — it would be a month out.
//
// The contract with EventForm is one value: `value` is the resolved end-date
// string ('yyyy-mm-dd') or '', and onChange emits it. Weeks and the calendar
// are two ways to arrive at that one date; the parent's series generation is
// unchanged.

const WEEK_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_WEEKS = 52 // ~a year, matching recurrence.js's MAX_SERIES_DAYS guard.
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

/** `n` days after a 'yyyy-mm-dd' string, as a string. UTC arithmetic keeps it
 * calendar-correct (the UAE has no DST — see calendarGrid.js). */
function addDays(str, n) {
  const p = toParts(str)
  if (!p) return ''
  const d = new Date(Date.UTC(p.year, p.month, p.day + n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Whole weeks between two date strings, rounded, at least 1 — for a lossless
 * switch from an exact date back to the weeks field. */
function weeksBetween(startStr, endStr) {
  const a = toParts(startStr)
  const b = toParts(endStr)
  if (!a || !b) return ''
  const ms = Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)
  const weeks = Math.round(ms / (7 * 24 * 60 * 60 * 1000))
  return String(Math.min(MAX_WEEKS, Math.max(1, weeks)))
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * @param {object} props
 * @param {string} props.startDate  The event's start date ('yyyy-mm-dd'), or ''.
 * @param {string} props.value      The resolved end date ('yyyy-mm-dd'), or ''.
 * @param {(next: string) => void} props.onChange
 */
export default function RepeatUntilField({ startDate, value, onChange }) {
  const [mode, setMode] = useState('weeks') // 'weeks' | 'date'
  // ⚠️ STARTS AT '0', NOT '' (Jay, 29 Aug 2026: a blank box does not say what
  // it is for, and the spinner could not step back down to nothing). 0 weeks
  // means "no repeat yet" — the effect below emits '' for it, so a one-off is
  // still the default until a real number is set.
  const [weeks, setWeeks] = useState('0')
  // The month the inline calendar is showing, 0-based parts.
  const [view, setView] = useState(() => toParts(value) || toParts(startDate) || null)

  // ⚠️ THE ONE PLACE weeks-mode EMITS. Recomputing here (rather than in the
  // input's onChange) means changing the START date also moves a weeks-based
  // end date, and there is a single source of truth for the resolved value.
  // Gated on mode so date-mode picks (emitted directly below) are not clobbered.
  useEffect(() => {
    if (mode !== 'weeks') return
    const n = Number(weeks)
    onChange(weeks !== '' && Number.isFinite(n) && n > 0 && startDate ? addDays(startDate, n * 7) : '')
  }, [mode, weeks, startDate, onChange])

  function goToDateMode() {
    setView(toParts(value) || toParts(startDate) || null)
    setMode('date')
  }

  function goToWeeksMode() {
    // Lossless: carry the picked date back as a week count so switching does not
    // silently drop it. '0' is the "none yet" default, so treat it like empty.
    if ((weeks === '' || weeks === '0') && value) setWeeks(weeksBetween(startDate, value))
    setMode('weeks')
  }

  function pickDay(cell) {
    onChange(toStr(cell))
  }

  const selected = toParts(value)
  const minStr = startDate || ''

  return (
    <div>
      {mode === 'weeks' ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <label htmlFor="event-repeat-weeks" className="text-[15px] font-semibold text-ink">
            Repeat weekly for
          </label>
          <input
            id="event-repeat-weeks"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_WEEKS}
            value={weeks}
            onChange={(e) => {
              const raw = e.target.value
              // Allow a transient empty box while retyping; blur restores 0.
              if (raw === '') return setWeeks('')
              const n = Math.max(0, Math.min(MAX_WEEKS, Math.floor(Number(raw))))
              setWeeks(Number.isFinite(n) ? String(n) : '0')
            }}
            onBlur={() => setWeeks((w) => (w === '' ? '0' : w))}
            className="w-[68px] rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none transition focus:border-brand"
          />
          <span className="text-[15px] font-semibold text-ink">weeks</span>
          <button
            type="button"
            onClick={goToDateMode}
            className="ml-1 text-[13px] font-bold text-brand-ink underline"
          >
            or pick an end date
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink-muted">
              {value ? `Runs until ${toStr(selected)}` : 'Pick the last date it runs'}
            </span>
            <button
              type="button"
              onClick={goToWeeksMode}
              className="text-[13px] font-bold text-brand-ink underline"
            >
              use a number of weeks
            </button>
          </div>

          {view && (
            <div
              className="rounded-[12px] border-[1.5px] border-line bg-surface-card p-2.5"
              data-testid="repeat-calendar"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setView(shiftMonth(view, -1))}
                  className="grid h-8 w-8 place-items-center rounded-[8px] text-ink hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  ‹
                </button>
                <span className="text-[14px] font-extrabold text-ink" data-testid="repeat-calendar-month">
                  {MONTH_NAMES[view.month]} {view.year}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => setView(shiftMonth(view, 1))}
                  className="grid h-8 w-8 place-items-center rounded-[8px] text-ink hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
                  const disabled = Boolean(minStr) && cellStr < minStr
                  const isSel = sameDay(cell, selected)
                  return (
                    <button
                      key={cellStr}
                      type="button"
                      disabled={disabled}
                      aria-label={cellStr}
                      aria-pressed={isSel}
                      onClick={() => {
                        if (!cell.inMonth) setView({ year: cell.year, month: cell.month, day: 1 })
                        pickDay(cell)
                      }}
                      className={[
                        'grid h-9 place-items-center rounded-[8px] text-[13.5px] transition',
                        disabled ? 'cursor-not-allowed text-ink-faint/40' : 'hover:bg-surface-mute',
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
      )}
    </div>
  )
}
