// Day dividers for chat streams — round 3, Jay: "there are marks for
// messages Today, Yesterday, and then older get a date". Pure functions so
// the labels are testable without a clock in the DOM.

const DAY_MS = 24 * 60 * 60 * 1000

/** Midnight of a date, in LOCAL time — chat days are the reader's days. */
function midnight(d) {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  return m
}

/**
 * 'Today', 'Yesterday', or a short date — with the year only once it
 * differs, because "Mon 18 Aug 2025" in an active chat is noise until it
 * is not.
 */
export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso)
  const days = Math.round((midnight(now) - midnight(d)) / DAY_MS)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const opts = { weekday: 'short', day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('en-GB', opts)
}

/** True when two timestamps fall on different LOCAL days — divider goes between. */
export function daysDiffer(prevIso, iso) {
  if (!prevIso) return true
  return midnight(new Date(prevIso)).getTime() !== midnight(new Date(iso)).getTime()
}
