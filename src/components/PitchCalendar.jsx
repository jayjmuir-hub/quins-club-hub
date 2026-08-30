import Card from './Card.jsx'
import Button from './Button.jsx'
import { dayKey, dayKeyOf, monthGrid, sameDay, weekDays } from '../lib/calendarGrid.js'
import { eventDate, eventTimeLabel, formatTableDate } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { PITCH_TBD } from '../data/pitches.js'
import { shareKey } from '../data/pitchShareApprovals.js'
import { portionFraction, portionLabel, portionShort } from '../lib/pitchPortion.js'
import { ageBandFromTeamName } from '../lib/ageGroup.js'

// The WEEK and MONTH views of the pitch calendar. The DAY view — pitches down
// the side, hours across the top — stays in src/screens/Allocation.jsx, because
// it answers a different question: "what is on this pitch at this hour", where
// these two answer "what is coming".
//
// Jay, 12 Aug 2026: "i still don't see a full calendar view in the pitch
// management dashboard". The day grid was the whole screen, so planning past
// tomorrow meant pressing Next repeatedly and holding the answer in your head.
//
// ⚠️ BOTH VIEWS NAME THE FIXTURES — Jay, 30 Aug 2026. The month used to show a
// count and a dot per day ("just showing dots"); it now lists the fixtures like
// the Schedule month grid (#524), first few then "+N more", the cell still a
// button to the day. The WEEK groups each day by PITCH — a heading per pitch and
// the fixtures on it, youngest squad first (byPitch) — instead of one flat pile,
// and a booking opens its details on click (onPickEvent). Both carry the portion
// (¼/⅓/½/full) so a shared pitch is legible.
//
// ⚠️ A DAY WITH A PROBLEM MUST NOT BE DISTINGUISHED BY COLOUR ALONE. Amber for
// a clash reads as nothing at all to the ~8% of men with a colour vision
// deficiency, and this club's volunteers are mostly men. Every state carries a
// word too: a clash chip says "clash", a waiting booking sits under a "No pitch
// yet" heading, and the month cell's aria-label sums the day.

/** Groups events by their CLUB calendar day. See dayKeyOf for why that matters. */
function byDay(events) {
  const map = new Map()
  for (const event of events ?? []) {
    const start = eventDate(event)
    if (!start) continue
    const key = dayKeyOf(start)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(event)
  }
  for (const list of map.values()) {
    list.sort((a, b) => (eventDate(a)?.getTime() ?? 0) - (eventDate(b)?.getTime() ?? 0))
  }
  return map
}

const needsPitch = (event) => !(event.pitch ?? '').trim() || event.pitch === PITCH_TBD

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Youngest age group first — Jay, 30 Aug 2026: the week list was one
// undifferentiated pile, and reading it pitch by pitch, U6 up to seniors, is how
// you actually plan a session. A senior side or an unreadable name has no band,
// so it sorts LAST (it is the oldest). ageGroup.js is the one place that parses a
// squad name into an age.
function ageBandOf(event, teamsById) {
  const name = teamsById?.get(event.team_id)?.name ?? event.team_name ?? ''
  const band = ageBandFromTeamName(name)
  return band == null ? Infinity : band
}

/**
 * A day's fixtures grouped by the PITCH they are on, each group sorted youngest
 * age group first (then by time). Returns `[pitchName, events][]`, pitch groups
 * in name order with the "waiting for a pitch" group (key '') last. This is what
 * turns the week column from a flat list into "each pitch and what's on it".
 */
export function byPitch(list, teamsById) {
  const groups = new Map()
  for (const event of list) {
    const key = needsPitch(event) ? '' : event.pitch
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }
  for (const events of groups.values()) {
    events.sort(
      (a, b) =>
        ageBandOf(a, teamsById) - ageBandOf(b, teamsById) ||
        (eventDate(a)?.getTime() ?? 0) - (eventDate(b)?.getTime() ?? 0),
    )
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === '') return 1 // waiting-for-a-pitch group sits at the bottom
    if (b === '') return -1
    return a.localeCompare(b, undefined, { numeric: true })
  })
}

// The pitch calendar named the pitch but not the portion, so a half booking and
// a whole one looked identical (Jay, 30 Aug 2026). portionShort gives the
// compact ¼/⅓/½/full tag (null for a whole pitch, which the name already implies).

/** The pitch + its portion, as one string: "D2 · ½", or just "D2" when whole. */
function pitchWithPortion(event) {
  const tag = portionShort(event.pitch_portion)
  return tag ? `${event.pitch} · ${tag}` : event.pitch
}

// One fixture's tone by state — a clash is amber, a booking still waiting for a
// pitch is muted, an allocated one is brand. Shape/word carry it too (the
// clash/waiting words below), never colour alone — the month/week accessibility
// rule this file already follows.
function entryTone(clash, waiting) {
  if (clash) return 'border-l-warn bg-warn-bg text-warn-ink'
  if (waiting) return 'border-l-line bg-surface-mute text-ink-muted'
  return 'border-l-brand bg-danger-bg text-danger-ink'
}

/** One fixture, under its pitch's heading in the week column. The pitch is the
 *  heading now (see byPitch), so the entry carries only the PORTION — how much of
 *  that pitch this booking takes. Clickable when `onPickEvent` is given: the
 *  pitch-assignment calendar opens the booking's details, the same details-first
 *  click the day grid uses (Jay, 30 Aug 2026). */
function WeekEntry({ event, clash, label, onPickEvent }) {
  const waiting = needsPitch(event)
  const tag = portionShort(event.pitch_portion)
  const body = (
    <>
      <span className="block text-[12px] font-extrabold leading-tight">{label}</span>
      <span className="block text-[11.5px] font-semibold leading-tight opacity-90">
        {eventTimeLabel(event)}
        {tag ? ` · ${tag}` : ''}
        {clash ? ' · clash' : ''}
      </span>
    </>
  )
  return (
    <li data-testid={clash ? 'week-entry-clash' : 'week-entry'}>
      {onPickEvent ? (
        <button
          type="button"
          onClick={() => onPickEvent(event)}
          aria-label={`Details for ${label}`}
          className={[
            'block w-full rounded-[8px] border-l-[3px] px-2 py-1.5 text-left transition',
            'hover:ring-2 hover:ring-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            entryTone(clash, waiting),
          ].join(' ')}
        >
          {body}
        </button>
      ) : (
        <div className={['rounded-[8px] border-l-[3px] px-2 py-1.5', entryTone(clash, waiting)].join(' ')}>
          {body}
        </div>
      )}
    </li>
  )
}

export function PitchWeek({ anchor, today, events, clashing, teamsById, onPickDay, onPickEvent }) {
  const days = weekDays(anchor)
  const grouped = byDay(events)

  return (
    <Card className="overflow-x-auto p-0">
      {/* min-w keeps the seven columns readable rather than crushing them on a
          phone; the Card scrolls, the DOCUMENT does not — which is what stops
          this widening the whole page (see the overflow gate). */}
      <div data-testid="pitch-week" className="grid min-w-[820px] grid-cols-7">
        {days.map((day) => {
          const list = grouped.get(dayKey(day)) ?? []
          const isToday = sameDay(day, today)
          return (
            <div
              key={dayKey(day)}
              className="min-w-0 border-b border-r border-line last:border-r-0"
            >
              <button
                type="button"
                onClick={() => onPickDay(day)}
                className={[
                  'flex w-full items-baseline justify-between gap-1 border-b border-line px-2.5 py-2 text-left transition',
                  'hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
                  isToday ? 'bg-surface-mute' : '',
                ].join(' ')}
                aria-label={`Open ${WEEKDAYS[days.indexOf(day)]} ${day.day}`}
              >
                <span className="text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted">
                  {WEEKDAYS[days.indexOf(day)]}
                </span>
                <span
                  className={[
                    'text-[15px] font-extrabold',
                    isToday ? 'text-danger-ink' : 'text-ink',
                  ].join(' ')}
                >
                  {day.day}
                </span>
              </button>

              {list.length === 0 ? (
                <p className="px-2.5 py-3 text-[11.5px] text-ink-faint">—</p>
              ) : (
                <div className="flex flex-col gap-2.5 p-1.5">
                  {/* One block per pitch — its name as a heading, then the
                      fixtures on it, youngest squad first (byPitch). A booking
                      still waiting for a pitch heads its own block, last. */}
                  {byPitch(list, teamsById).map(([pitch, entries]) => (
                    <div key={pitch || '__waiting__'} data-testid="week-pitch-group">
                      <p className="flex items-center gap-1 px-1 pb-1 text-[10px] font-extrabold uppercase tracking-[.6px] text-ink-faint">
                        <span
                          aria-hidden="true"
                          className={['h-1.5 w-1.5 rounded-full', pitch ? 'bg-brand' : 'bg-line'].join(' ')}
                        />
                        {pitch || 'No pitch yet'}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {entries.map((event) => (
                          <WeekEntry
                            key={event.id}
                            event={event}
                            clash={clashing.has(event.id)}
                            onPickEvent={onPickEvent}
                            label={fixtureLabel(
                              event,
                              event.league_team,
                              teamsById.get(event.team_id)?.name ?? 'Fixture',
                            )}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const MAX_MONTH_EVENTS = 3

/** One fixture as a chip in a month cell — time + name, toned by state. The cell
 *  is too small for the pitch/portion inline, so it rides in the tooltip. */
function MonthEntry({ event, clash, teamsById }) {
  const waiting = needsPitch(event)
  const name = fixtureLabel(event, event.league_team, teamsById?.get(event.team_id)?.name ?? 'Fixture')
  const where = waiting ? 'no pitch yet' : pitchWithPortion(event)
  return (
    <span
      title={`${eventTimeLabel(event)} · ${name} · ${where}${clash ? ' · clash' : ''}`}
      className={[
        'block truncate rounded-[5px] border-l-[3px] px-1.5 py-0.5 text-[10.5px] font-bold leading-tight',
        entryTone(clash, waiting),
      ].join(' ')}
    >
      <span className="opacity-90">{eventTimeLabel(event)}</span> {name}
    </span>
  )
}

// ⚠️ THE MONTH VIEW NOW SHOWS THE FIXTURES, NOT JUST A COUNT — Jay, 30 Aug 2026
// ("the monthly view is just showing dots"), the same change the Schedule month
// grid took on 24 Aug (#524). The old objection — fifteen squads make a Saturday
// cell a wall of 6px text — is handled the way that grid handles it: the first
// few fixtures show, the rest collapse to "+N more", and the whole cell is a
// button that opens the day for the full picture. Colour still never stands
// alone: each chip carries the time and name, a clash says "clash" in its
// tooltip, and the aria-label sums the day. The grid scrolls inside its Card
// (min-width) rather than crushing seven columns onto a phone.
export function PitchMonth({ anchor, today, events, clashing, teamsById, onPickDay }) {
  const cells = monthGrid(anchor)
  const grouped = byDay(events)

  return (
    <Card className="overflow-x-auto p-0">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((name) => (
            <span
              key={name}
              className="px-2 py-2 text-center text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted"
            >
              {name}
            </span>
          ))}
        </div>

        <div data-testid="pitch-month" className="grid grid-cols-7">
          {cells.map((cell) => {
            const list = grouped.get(dayKey(cell)) ?? []
            const clashes = list.filter((event) => clashing.has(event.id)).length
            const waiting = list.filter(needsPitch).length
            const isToday = sameDay(cell, today)
            const visible = list.slice(0, MAX_MONTH_EVENTS)
            const overflow = list.length - visible.length

            return (
              <button
                key={dayKey(cell)}
                type="button"
                data-testid="month-cell"
                onClick={() => onPickDay(cell)}
                // ⚠️ SAID OUT LOUD. The chips' tones are invisible to a screen
                // reader, so the label sums what the day needs.
                aria-label={[
                  `${cell.day}`,
                  list.length === 0
                    ? 'nothing on'
                    : `${list.length} ${list.length === 1 ? 'fixture' : 'fixtures'}`,
                  clashes > 0 ? `${clashes / 2} clash` : null,
                  waiting > 0 ? `${waiting} waiting for a pitch` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                className={[
                  'group flex min-h-[104px] flex-col items-stretch gap-1 overflow-hidden border-b border-r border-line p-1.5 text-left transition',
                  'hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
                  cell.inMonth ? '' : 'bg-surface-sunk',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12.5px] font-extrabold',
                    isToday ? 'bg-brand text-ink-invert' : cell.inMonth ? 'text-ink' : 'text-ink-faint',
                  ].join(' ')}
                >
                  {cell.day}
                </span>

                {list.length > 0 && (
                  <span className="flex min-h-0 flex-col gap-[3px]">
                    {visible.map((event) => (
                      <MonthEntry
                        key={event.id}
                        event={event}
                        clash={clashing.has(event.id)}
                        teamsById={teamsById}
                      />
                    ))}
                    {overflow > 0 && (
                      <span className="px-1.5 text-[10px] font-bold text-ink-faint">+{overflow} more</span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* The key — the chip tones. Kept because colour needs a word somewhere,
            and a busy month is exactly where a reader needs it spelled out. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-3 py-2.5 text-[11.5px] font-semibold text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-1 rounded-full bg-brand" /> has a pitch
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-1 rounded-full bg-warn" /> clash
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-1 rounded-full bg-line" /> waiting for a pitch
          </span>
        </div>
      </div>
    </Card>
  )
}

// ── The occupancy view ──────────────────────────────────────────────────────
//
// "What's free before I ask." A pitch is routinely shared — a quarter here, a
// half there — and pitchShares (src/data/pitches.js) finds every set of two or
// more squads on one pitch at one moment. This panel draws each as a stacked
// bar: a segment per squad sized by its portion, the empty track the room left,
// and a warn fill when the portions overtop the pitch (which is also a clash).
//
// ⚠️ COLOUR IS NEVER THE ONLY SIGNAL. Every segment is named in the legend and
// in the bar's aria-label, and the over state carries the word "Over" and a ⚠,
// so the ~8% of this club's mostly-male volunteers with a colour deficiency get
// the same information (design-system §accessibility, the same rule the clash
// markers in the month view follow).

const SEG_TONES = ['bg-brand', 'bg-accent', 'bg-brand/55', 'bg-accent/55']
const OVER = 1 + 1e-9

/** A share's segments, one per OCCUPANT — a fan-out (shared group_id) counts
 *  once, exactly as pitchLoad sums it, so the bar matches the load. Widest first. */
function shareSegments(group) {
  const byOccupant = new Map()
  for (const event of group.events) {
    const key = event.group_id ? `g:${event.group_id}` : `e:${event.id}`
    const fraction = portionFraction(event.pitch_portion)
    const existing = byOccupant.get(key)
    if (!existing || fraction > existing.fraction) byOccupant.set(key, { key, event, fraction })
  }
  return [...byOccupant.values()].sort((a, b) => b.fraction - a.fraction)
}

const squadOf = (event, teamsById) =>
  event.team_name ?? teamsById?.get(event.team_id)?.name ?? 'A squad'

const portionOf = (event) => portionLabel(event.pitch_portion) ?? 'Full pitch'

/** The instant a share peaks — its latest start, when everyone is present. */
const peakEvent = (group) =>
  group.events.reduce((a, b) => ((eventDate(b)?.getTime() ?? 0) > (eventDate(a)?.getTime() ?? 0) ? b : a))

/** A pitch fraction as words: 0.25 → "a quarter", ⅓ → "a third", 1.5 → "1.5 pitches".
 *  ⚠️ Portions are ¼, ⅓, ½ and 1, so any occupancy lands on a TWELFTH — the old
 *  "round to quarters" turned a third into "a quarter". Quantise to twelfths,
 *  name the fractions people actually say, and fall back to a rounded percentage
 *  for an odd mixed twelfth (a ¼ beside a ⅓ is 7⁄12) rather than "seven twelfths". */
function fractionWord(fraction) {
  const named = { 3: 'a quarter', 4: 'a third', 6: 'a half', 8: 'two thirds', 9: 'three quarters', 12: 'a full pitch' }
  const twelfths = Math.round(fraction * 12)
  if (twelfths <= 0) return 'nothing'
  if (named[twelfths]) return named[twelfths]
  if (twelfths % 12 === 0) return `${twelfths / 12} pitches`
  if (fraction > 1) return `${Math.round(fraction * 100) / 100} pitches`
  return `${Math.round(fraction * 100)}%`
}

function occupancyStatus(load) {
  if (load > OVER) return { over: true, text: `Over by ${fractionWord(load - 1)} — needs another pitch` }
  const free = 1 - load
  if (free < 1e-9) return { over: false, text: 'Full — nothing spare' }
  return { over: false, text: `${fractionWord(load)} used · ${fractionWord(free)} free` }
}

/** One shared pitch, as a stacked bar plus a named legend. */
function ShareRow({ group, teamsById, approved, canApprove, onApprove, onUndo, busy }) {
  const segments = shareSegments(group)
  const status = occupancyStatus(group.load)
  // An APPROVED overload is a resolved one: it stops reading as a warning
  // (bar tones, not warn) and its line says who cleared it. Only an unapproved
  // overload is still "over" for styling.
  const overActive = status.over && !approved
  // When a share overflows, scale to the load so every segment stays visible
  // inside the bar rather than being clipped at the pitch edge.
  const scale = Math.max(group.load, 1)
  const rep = peakEvent(group)
  const spoken = `${group.pitch}: ${segments
    .map((seg) => `${squadOf(seg.event, teamsById)} ${portionOf(seg.event).toLowerCase()}`)
    .join(', ')} — ${approved ? 'sharing approved' : status.text}`

  return (
    <div data-testid={status.over ? 'share-row-over' : 'share-row'} className="px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-extrabold text-ink">{group.pitch}</span>
        <span className="text-[11.5px] font-semibold text-ink-muted">
          {formatTableDate(eventDate(rep))} · {eventTimeLabel(rep)}
        </span>
      </div>

      <div
        role="img"
        aria-label={spoken}
        className="flex h-3.5 w-full overflow-hidden rounded-full bg-surface-mute ring-1 ring-inset ring-line"
      >
        {segments.map((seg, i) => (
          <div
            key={seg.key}
            title={`${squadOf(seg.event, teamsById)} · ${portionOf(seg.event)}`}
            style={{ width: `${(seg.fraction / scale) * 100}%` }}
            className={overActive ? 'bg-warn' : SEG_TONES[i % SEG_TONES.length]}
          />
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {segments.map((seg, i) => (
          <span key={seg.key} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink-muted">
            <span
              aria-hidden="true"
              className={['h-2 w-2 rounded-full', overActive ? 'bg-warn' : SEG_TONES[i % SEG_TONES.length]].join(' ')}
            />
            {squadOf(seg.event, teamsById)} · {portionOf(seg.event)}
          </span>
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p
          className={[
            'text-[11.5px] font-bold',
            approved ? 'text-accent-ink' : overActive ? 'text-warn-ink' : 'text-ink-faint',
          ].join(' ')}
        >
          {approved ? '✓ Sharing approved' : `${overActive ? '⚠ ' : ''}${status.text}`}
        </p>

        {/* Only an admin sees a control, and only on an OVERLOAD — a share that
            fits has nothing to approve. Approving clears the clash marker across
            the calendar; undoing brings it back. */}
        {canApprove && status.over && (
          approved ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onUndo(shareKey(group.events))}>
              Undo
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onApprove(group)}>
              It&apos;s fine — approve
            </Button>
          )
        )}
      </div>
    </div>
  )
}

/**
 * The shared-pitch panel under the calendar. Renders nothing when no pitch is
 * shared in the loaded window — a permanent empty "Sharing" card would be
 * furniture. `approvedKeys` marks the overloads an admin has cleared;
 * `canApprove` (admins only) turns on the approve / undo control.
 */
export function PitchOccupancy({
  shares,
  teamsById,
  approvedKeys,
  canApprove = false,
  onApprove,
  onUndo,
  busy = false,
}) {
  if (!shares || shares.length === 0) return null
  const sorted = [...shares].sort(
    (a, b) => (eventDate(peakEvent(a))?.getTime() ?? 0) - (eventDate(peakEvent(b))?.getTime() ?? 0),
  )
  return (
    <Card data-testid="pitch-occupancy" className="mt-3 p-0">
      <div className="border-b border-line px-3 py-2.5">
        <h3 className="text-[13px] font-extrabold text-ink">Shared pitches</h3>
        <p className="text-[11.5px] font-medium text-ink-muted">
          How full each shared pitch is, and what&apos;s spare before you ask.
        </p>
      </div>
      <div className="divide-y divide-line">
        {sorted.map((group) => (
          <ShareRow
            key={`${group.pitch}|${shareKey(group.events)}`}
            group={group}
            teamsById={teamsById}
            approved={Boolean(approvedKeys?.has(shareKey(group.events)))}
            canApprove={canApprove}
            onApprove={onApprove}
            onUndo={onUndo}
            busy={busy}
          />
        ))}
      </div>
    </Card>
  )
}
