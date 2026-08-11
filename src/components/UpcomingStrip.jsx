import { CLUB_TIME_ZONE, clubDayParts } from '../lib/eventFormat.js'

// A fortnight of days across the top of the home screen, with a dot on any
// day that has something on. Option C of the three Jay compared.
//
// WHY NOT A MONTH GRID. A full grid costs ~320px of vertical space and puts a
// third view of the same events on a screen that already has the fixture hero
// and the Upcoming list — pushing Quick Actions off the first screen on a
// phone. This costs ~90px and does not duplicate Schedule, because it only
// ever shows two weeks.
//
// ⚠️ DAYS ARE BUCKETED IN CLUB TIME, NOT THE READER'S. A 01:00 Dubai kick-off
// is 21:00 the previous day in UTC and 22:00 the previous evening in London,
// so reading date.getDate() would file it under the wrong day and paint the
// dot on the wrong cell. Every day key here goes through clubDayParts. The
// club is in Abu Dhabi and its fixtures happen on Abu Dhabi days, whatever
// time zone a travelling parent is reading in.

const DAYS = 14

// 08:00 UTC is 12:00 in Dubai (UTC+4, no DST), so anchoring each generated
// day at midday club time keeps it unambiguously inside the intended day —
// no hour arithmetic can tip it into the neighbouring one.
const CLUB_MIDDAY_UTC_HOUR = 8

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLUB_TIME_ZONE,
  weekday: 'short',
})

const DOT_CLASS = {
  match: 'bg-brand',
  training: 'bg-accent-mid',
  social: 'bg-warn',
}

export function dayKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Exported for tests: the fortnight this renders, as club-day parts.
export function stripDays(nowMs, count = DAYS) {
  const today = clubDayParts(new Date(nowMs))
  return Array.from({ length: count }, (_, index) => {
    const at = new Date(
      Date.UTC(today.year, today.month, today.day + index, CLUB_MIDDAY_UTC_HOUR),
    )
    return { date: at, parts: clubDayParts(at), isToday: index === 0 }
  })
}

export default function UpcomingStrip({ events = [], now = Date.now(), onSelect = undefined }) {
  const byDay = new Map()
  for (const event of events) {
    if (!event?.starts_at) continue
    const at = new Date(event.starts_at)
    if (Number.isNaN(at.getTime())) continue
    const key = dayKey(clubDayParts(at))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(event)
  }

  const days = stripDays(now)

  // ⚠️ THE EMPTY FORTNIGHT. Fourteen bordered cells with no dot on any of them
  // is not a calendar, it is 90px of furniture — and it sits ABOVE THE FOLD on
  // a phone, pushing the thing a parent opened the app for further down. The
  // row also reads as though it is still loading, because "cells with no dots"
  // and "cells whose dots have not arrived" look identical.
  //
  // ⚠️ A SENTENCE, NOT `<Empty>`. The shared empty state is a 42px icon with
  // py-11 around it — TALLER than the strip it replaces, which would make the
  // nothing-on case cost more space than the something-on case. The whole
  // point here is to give the space back.
  //
  // Note this says "in the next two weeks" and not "nothing coming up": events
  // beyond the fortnight are deliberately outside this component's window, and
  // the Upcoming list directly below is the thing that answers "what is next".
  const anythingOn = days.some(({ parts }) => byDay.has(dayKey(parts)))

  if (!anythingOn) {
    return (
      <p data-testid="upcoming-strip-empty" className="px-2.5 py-4 text-center text-sm text-ink-faint">
        Nothing on in the next two weeks.
      </p>
    )
  }

  return (
    <div
      data-testid="upcoming-strip"
      // Horizontal scroll with the scrollbar hidden — the same treatment the
      // team-filter pills use, so the two rows behave alike.
      className="flex gap-1.5 overflow-x-auto p-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map(({ parts, isToday, date }) => {
        const dayEvents = (byDay.get(dayKey(parts)) ?? []).slice(0, 3)
        const weekday = WEEKDAY_FORMAT.format(date)
        // ⚠️ Only days with something on are interactive. A tappable empty day
        // would be a control that looks live and does nothing — the exact
        // dead-tap this design was chosen to avoid.
        const interactive = dayEvents.length > 0 && typeof onSelect === 'function'
        const Tag = interactive ? 'button' : 'div'

        return (
          <Tag
            key={dayKey(parts)}
            data-testid="strip-day"
            {...(interactive
              ? {
                  type: 'button',
                  onClick: () => onSelect(dayEvents[0]),
                  'aria-label': `${weekday} ${parts.day}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`,
                }
              : { 'aria-hidden': dayEvents.length === 0 ? undefined : undefined })}
            className={[
              // ⚠️ `rounded-tab` (12px), matching adhjrt.com's age-group
              // buttons — Jay, 11 Aug 2026. This cell was ALREADY that shape
              // in every other respect: white fill with a hairline border when
              // idle, solid red when it is today, exactly as those buttons go
              // white then red when selected. Only the corner disagreed (11px),
              // and 11px is the app's SURFACE radius — the wrong token for
              // something you press.
              'w-[46px] shrink-0 rounded-tab border px-0 py-1.5 text-center',
              isToday
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface-card text-ink',
              interactive ? 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand' : '',
            ].join(' ')}
          >
            <span className="block font-display text-[15px] leading-none">{parts.day}</span>
            <span
              className={[
                // font-bold is required by tests/theme.test.js, not optional
                // styling: `font-condensed` without an explicit 600/700 was a
                // silent fallback to the body face when the condensed cuts
                // were Barlow. Inter now sets the weight in index.css too,
                // but the call-site convention is kept so every condensed
                // element still reads the same way.
                'mt-1 block font-condensed text-[9px] font-bold uppercase tracking-[0.1em]',
                isToday ? 'text-white/85' : 'text-ink-faint',
              ].join(' ')}
            >
              {weekday}
            </span>
            {/* Fixed-height rail whether or not there are dots, so the cells
                do not jump in height across the row. */}
            <span className="mt-1.5 flex h-1 items-center justify-center gap-[3px]">
              {dayEvents.map((event) => (
                <span
                  key={event.id}
                  data-testid="strip-dot"
                  className={[
                    'h-1 w-1 rounded-full',
                    // On the red "today" cell a red dot would vanish.
                    isToday ? 'bg-white' : DOT_CLASS[event.type] ?? 'bg-ink-faint',
                  ].join(' ')}
                />
              ))}
            </span>
          </Tag>
        )
      })}
    </div>
  )
}
