import { useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { insertEvents, upsertEvent } from '../data/events.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import { clubDateTimeInputs, clubToday, clubWallTimeToUtc, eventDate } from '../lib/eventFormat.js'
import {
  WEEKDAYS,
  generateSeriesDates,
  parseDateInput,
  weekdayOf,
} from '../lib/recurrence.js'

// The event add/edit form (design-system.md §5.6), opened in the shared
// Sheet from Schedule's "Add event" button and from EventDetail's "Edit".
// Field order is the design system's: type → opponent/title → date+time →
// age group → home/away → venue → competition → score → Save.
//
// Access control is NOT enforced here. The events table's "event edit" RLS
// policy (ALL, USING and WITH CHECK `can_edit_team(team_id)`) is the real
// boundary: admin of the team's club, or coach of that team. Everything this
// screen does with canEditTeam only narrows what it offers, so a mistake
// here can hide a squad the user may edit but can never let a write through
// that the database would refuse. upsertEvent turns a refused write — which
// PostgREST reports as a successful zero-row response, not an error — into a
// thrown error, so a silently-dropped save surfaces as a message.

// design-system.md §4.17. --muted is #77726e, which clears AA on white; the
// darker #5c5854 is used here for the same reason Schedule/Roster use it —
// these labels are the smallest text in the sheet (12.5px) and the extra
// headroom costs nothing.
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const FIELD = 'mb-3.5'
const INPUT_BASE =
  'w-full rounded-[11px] border-[1.5px] bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'
const FIELD_ROW = 'mb-3.5 grid grid-cols-2 gap-3'

// design-system.md §4.18. The prototype toggles the checked look with the
// CSS `:has()` relational selector; the port note says not to rely on that
// silently, so the visual state is driven from React state instead and the
// radio itself stays a real, focusable input (sr-only, not display:none, so
// it keeps keyboard access and an accessible name).
const SEG_OPTION_BASE =
  'block cursor-pointer select-none rounded-[11px] border-[1.5px] px-2 py-2.5 text-center text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2'
const SEG_OPTION_ON = 'border-brand bg-surface-mute font-bold text-brand-deep'
const SEG_OPTION_OFF = 'border-line font-semibold text-ink'

const TYPES = [
  { value: 'match', label: 'Match' },
  { value: 'training', label: 'Training' },
  { value: 'social', label: 'Social' },
]

const DEFAULT_VENUE = 'Zayed Sports City, Abu Dhabi'

function inputClasses(invalid) {
  return [INPUT_BASE, invalid ? 'border-brand-deep' : 'border-line'].join(' ')
}

// "Tue 11 Aug" for one generated date. Built from the parsed numbers and a
// literal month list rather than toLocaleDateString, for the same reason the
// generator itself avoids Date: a preview row must name the club's day, not
// the reader's, and here there is no instant to attach a timeZone option to
// — the value is a bare calendar date, which is exactly what we want to show.
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function seriesDateLabel(value) {
  const parts = parseDateInput(value)
  if (!parts) return value
  const weekday = WEEKDAYS.find((day) => day.value === weekdayOf(parts))?.label ?? ''
  return `${weekday} ${parts.day} ${MONTH_LABELS[parts.month - 1]}`
}

function Segmented({ legend, name, options, value, onChange }) {
  return (
    <fieldset className={FIELD}>
      <legend className={LABEL}>{legend}</legend>
      {/* An explicit flex row of equal-width blocks. The options are
          <label>/<span> pairs rather than <button>s on purpose — a button
          used as a layout box inherits Chromium's UA content-centring,
          which jsdom cannot see. */}
      <div className="flex gap-2">
        {options.map((option) => (
          <label key={option.value} className="flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={[
                SEG_OPTION_BASE,
                value === option.value ? SEG_OPTION_ON : SEG_OPTION_OFF,
              ].join(' ')}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// The form's initial state, derived once per mount. For a new event the date
// defaults to the club's today (design-system.md §7: "not new Date()") and
// the time is left blank — a kick-off time is something the coach must
// actually choose, and a prefilled one would quietly become wrong.
// `initialDate` is an ISO yyyy-mm-dd string for the CLUB's day, supplied when
// the form is opened from a calendar cell so the date the user tapped is the
// date they get. It is ignored when editing an existing event, whose own date
// always wins. Only ever a plain string — never a Date — for the same reason
// the calendar grid is built from numbers: a Date would re-read the browser's
// zone and could land the event on the wrong day for a reader outside Abu
// Dhabi. See CLUB_TIME_ZONE in src/lib/eventFormat.js.
function initialValues(event, editableTeams, initialDate = null) {
  const teamIds = editableTeams.map((team) => team.id)
  const fallbackTeamId = teamIds[0] ?? ''

  if (!event) {
    const today = clubToday()
    const pad = (n) => String(n).padStart(2, '0')
    return {
      type: 'match',
      title: '',
      opponent: '',
      date: initialDate ?? `${today.year}-${pad(today.month + 1)}-${pad(today.day)}`,
      time: '',
      teamId: fallbackTeamId,
      home: true,
      venue: DEFAULT_VENUE,
      pitch: '',
      competition: '',
      resultUs: '',
      resultThem: '',
    }
  }

  const { date, time } = clubDateTimeInputs(eventDate(event))
  return {
    type: event.type ?? 'match',
    title: event.title ?? '',
    opponent: event.opponent ?? '',
    date,
    time,
    teamId: teamIds.includes(event.team_id) ? event.team_id : fallbackTeamId,
    home: event.home !== false,
    venue: event.venue ?? '',
    pitch: event.pitch ?? '',
    competition: event.competition ?? '',
    resultUs: event.result_us == null ? '' : String(event.result_us),
    resultThem: event.result_them == null ? '' : String(event.result_them),
  }
}

// A score is only a score when BOTH halves are present — the same rule
// hasResult() applies when reading (a half-entered score must not knock a
// fixture out of Upcoming), applied here so a half-entered one is never
// written in the first place.
function parseScore(us, them) {
  const a = us.trim()
  const b = them.trim()
  if (a === '' || b === '') return { result_us: null, result_them: null }
  const nus = Number(a)
  const nthem = Number(b)
  if (!Number.isFinite(nus) || !Number.isFinite(nthem)) return { result_us: null, result_them: null }
  return { result_us: nus, result_them: nthem }
}

export default function EventForm({ event = null, initialDate = null, onClose, onSaved }) {
  const { memberships, teams } = useMemberships()

  // Teams this user may actually write to. For an admin that is every team;
  // for a coach only the squads they coach. canEditTeam is asked per team
  // rather than inferred from the role, so its deliberate null-team_id
  // refusal applies here too — a team with no resolvable id never becomes a
  // dropdown option.
  const editableTeams = useMemo(
    () => visibleTeams(memberships, teams).filter((team) => canEditTeam(memberships, team.id)),
    [memberships, teams],
  )

  const [values, setValues] = useState(() => initialValues(event, editableTeams, initialDate))
  const [invalid, setInvalid] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  // --- Repeats (create-time only) ------------------------------------
  // getDay() numbers of the weekdays ticked, the last date the series may
  // run to, and the generated dates the user has UNticked in the preview.
  // Exclusions are held as dates rather than indexes so that changing the
  // weekdays or the end date can't silently move which occurrence is
  // skipped — a stale exclusion simply stops matching anything.
  const [repeatDays, setRepeatDays] = useState([])
  const [repeatUntil, setRepeatUntil] = useState('')
  const [excluded, setExcluded] = useState([])

  // --- Extra age groups (create-time only) ---------------------------
  // Squads BESIDES the one in the Age group dropdown that should get their
  // own copy of this session. Deliberately modelled as "the primary squad
  // plus extras" rather than as one flat multi-select: the dropdown stays
  // exactly what it was, so every existing caller and test of the Age group
  // field is untouched, and the asymmetry is honest about what actually
  // happens — each squad gets a SEPARATE, independent event row.
  //
  // Why separate rows and not one event with many teams: team_id drives RLS
  // on `events` AND on `availability` (which reaches through to
  // events.team_id to decide who may read an RSVP), plus listEvents' team
  // filter, the calendar feed, Schedule, Dashboard and FixtureRow. A
  // many-to-many event would be a rewrite of the read path and of the
  // security boundary; a fan-out is additive and changes neither.
  //
  // The cost of that choice, stated plainly: a score or a venue change is
  // one edit per squad. group_id exists so "apply to every squad in this
  // session" can be added later without a migration.
  const [extraTeamIds, setExtraTeamIds] = useState([])
  // Guards against a double submit landing two inserts: `saving` state is
  // async, this is not.
  const inFlight = useRef(false)

  const set = (key) => (nextValue) => setValues((current) => ({ ...current, [key]: nextValue }))
  const setFromInput = (key) => (domEvent) => set(key)(domEvent.target.value)

  const isMatch = values.type === 'match'
  const editing = Boolean(event?.id)

  // Repeating is a CREATE-time feature. Editing an existing event never
  // shows the section, and this flag makes that structural rather than a
  // matter of remembering to check `editing` at every use site: with no
  // section rendered the state stays at its defaults, so `repeating` is
  // false and the save path below is the ordinary single-event one.
  const repeating = !editing && repeatDays.length > 0 && Boolean(repeatUntil)

  // The generated dates, and any error from generating them. generateSeriesDates
  // throws on a range over a year rather than truncating, so the throw is
  // caught here and shown as a message instead of taking the sheet down.
  const { previewDates, previewError } = useMemo(() => {
    if (!repeating) return { previewDates: [], previewError: null }
    try {
      return {
        previewDates: generateSeriesDates(values.date, repeatDays, repeatUntil),
        previewError: null,
      }
    } catch (err) {
      return { previewDates: [], previewError: err }
    }
  }, [repeating, values.date, repeatDays, repeatUntil])

  // What will actually be written: the preview minus whatever the user has
  // unticked. The preview IS the guard against Ramadan, Eid, half-term and
  // summer — generating blind and deleting the strays afterwards is the same
  // manual slog this feature exists to remove, in reverse.
  const seriesDates = previewDates.filter((date) => !excluded.includes(date))

  const toggleWeekday = (day) =>
    setRepeatDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    )

  const toggleDate = (date) =>
    setExcluded((current) =>
      current.includes(date) ? current.filter((d) => d !== date) : [...current, date],
    )

  // Reconcile the chosen squad against the live editable list on every
  // render rather than trusting the stored value — the same thing Schedule
  // and Roster do with their team filters. A stored id can outlive the scope
  // that produced it (memberships reload and shrink), and on a first render
  // where teams hadn't loaded yet the initial value is ''. Either way the
  // select would show a squad it wasn't actually holding in state.
  const teamId = editableTeams.some((team) => team.id === values.teamId)
    ? values.teamId
    : editableTeams[0]?.id ?? ''

  // The squads offered as extras: everything editable except the one already
  // chosen in the dropdown. Recomputed from `teamId` every render, so moving
  // the dropdown to a squad that was ticked as an extra cannot leave it
  // counted twice.
  const otherTeams = editing ? [] : editableTeams.filter((team) => team.id !== teamId)
  const extras = extraTeamIds.filter((id) => otherTeams.some((team) => team.id === id))
  // Primary first, then extras in the club's sort order — the row order the
  // insert will use, so what the button counts is what gets written.
  const targetTeamIds = [teamId, ...otherTeams.filter((t) => extras.includes(t.id)).map((t) => t.id)]
  const multiSquad = targetTeamIds.length > 1

  // Extras AND a repeat is refused outright (see the row-count guard in
  // handleSubmit). Naming it here so the SUBMIT BUTTON can tell the truth:
  // before this existed the label read "Add 14 events" — the series count —
  // for a combination that adds nothing at all, because the series branch of
  // the label was evaluated first and neither branch knew about the guard.
  //
  // ⚠️ The guard in handleSubmit is NOT redundant now the button is disabled.
  // It is the thing that actually prevents the write, and disabling a button
  // is a UI courtesy, not a control. Keep both.
  const blockedByRowGuard = multiSquad && repeating

  const toggleExtraTeam = (id) =>
    setExtraTeamIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
    )

  // A user with nothing they can edit should not be shown a form whose Save
  // button the database is guaranteed to refuse. This is defensive — every
  // entry point already gates on the same check — so it explains rather than
  // apologises.
  if (editableTeams.length === 0) {
    return (
      <Sheet open onClose={onClose} title={editing ? 'Edit event' : 'Add event'}>
        <p role="alert" className="rounded-[11px] bg-warn-bg px-4 py-3 text-sm text-ink">
          You don&apos;t have a squad you can add or change fixtures for. Ask a club admin if that
          looks wrong.
        </p>
      </Sheet>
    )
  }

  function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (inFlight.current) return

    const starts_at = clubWallTimeToUtc(values.date, values.time)
    const nextInvalid = {
      date: !values.date,
      time: !values.time || !starts_at,
      teamId: !teamId,
      opponent: isMatch && !values.opponent.trim(),
      title: !isMatch && !values.title.trim(),
    }
    setInvalid(nextInvalid)

    if (Object.values(nextInvalid).some(Boolean)) {
      setError(new Error('Fill in the highlighted fields before saving.'))
      return
    }

    // A repeat that generates nothing is a mistake, not an empty save — an
    // end date before the start, or every date unticked. Say so rather than
    // quietly creating the single event the user did not ask for.
    if (previewError) {
      setError(previewError)
      return
    }
    if (repeating && seriesDates.length === 0) {
      setError(new Error('That repeat produces no sessions. Check the days and the end date.'))
      return
    }

    // ⚠️ THE ROW-COUNT GUARD. Extra squads and repeating are each row
    // multipliers; together they multiply each other. A term of Tuesday
    // training across 15 squads is ~1,500 rows from one form submission,
    // with no undo built. Refuse the combination outright rather than
    // capping or truncating — the same reasoning as generateSeriesDates
    // throwing on a range over a year instead of quietly writing less than
    // was asked for. The Repeats section also says so on screen before the
    // user gets here; this is the guard, that is the courtesy.
    if (multiSquad && repeating) {
      setError(
        new Error(
          'Repeating is one age group at a time. Untick the extra age groups, or clear the repeat.',
        ),
      )
      return
    }

    // Everything except the squad-specific bits. Built once and stamped per
    // team below, so a fanned-out session cannot end up with a different
    // venue or kick-off time on one squad's copy than on another's.
    const common = {
      type: values.type,
      title: isMatch ? null : values.title.trim(),
      opponent: isMatch ? values.opponent.trim() : null,
      home: isMatch ? values.home : null,
      venue: values.venue.trim() || null,
      pitch: values.pitch.trim() || null,
      competition: isMatch ? values.competition.trim() || null : null,
      starts_at,
      ...(isMatch ? parseScore(values.resultUs, values.resultThem) : { result_us: null, result_them: null }),
    }

    // club_id comes from the team being written to, not from the primary
    // squad, so a fan-out stays correct if the club ever holds more than one
    // club_id (see the single-club assumption logged in state-of-play.md).
    const rowFor = (id) => {
      const team = editableTeams.find((candidate) => candidate.id === id)
      return {
        ...(team?.club_id ? { club_id: team.club_id } : null),
        ...common,
        team_id: id,
      }
    }

    const payload = {
      ...(editing ? { id: event.id } : null),
      ...rowFor(teamId),
    }

    inFlight.current = true
    setSaving(true)
    setError(null)

    // ONE series_id, generated here and stamped on every row, so "cancel all
    // remaining in this series" can be added later without a migration. Read
    // once OUTSIDE the map — a crypto.randomUUID() call inside it would give
    // every occurrence its own id and quietly produce 34 one-event "series",
    // which looks identical in the schedule and is useless to the feature the
    // column exists for.
    //
    // No polyfill: crypto.randomUUID is on every browser this app supports
    // and on the jsdom global in the test runner, and a fallback that
    // silently produced a non-unique id would defeat the point of the column.
    const seriesId = repeating ? crypto.randomUUID() : null
    // Same rule, same reason, for the multi-squad fan-out: ONE group_id read
    // once outside the map. Per-row ids would give three one-squad "groups"
    // that look identical in the schedule and are useless to the feature the
    // column exists for. The two are mutually exclusive by the guard above,
    // so a row never carries both.
    const groupId = multiSquad ? crypto.randomUUID() : null

    const rows = repeating
      ? seriesDates.map((date) => ({
          ...payload,
          starts_at: clubWallTimeToUtc(date, values.time),
          series_id: seriesId,
        }))
      : multiSquad
        ? targetTeamIds.map((id) => ({ ...rowFor(id), group_id: groupId }))
        : null

    // onSaved's contract stays "one saved event" — every caller uses it as a
    // refresh trigger and ignores the argument, and widening it to an array
    // for this one path would be a change they'd all have to absorb.
    const write = rows ? insertEvents(rows).then((saved) => saved[0] ?? null) : upsertEvent(payload)

    write
      .then((saved) => {
        onSaved?.(saved)
        onClose?.()
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        inFlight.current = false
        setSaving(false)
      })
  }

  return (
    <Sheet open onClose={onClose} title={editing ? 'Edit event' : 'Add event'}>
      {/* noValidate: this form does its own validation and reports it in a
          role="alert" region, which a screen reader announces — the native
          bubble is neither announced reliably nor visible to the browser
          check. */}
      <form onSubmit={handleSubmit} noValidate>
        <Segmented
          legend="Type"
          name="event-type"
          options={TYPES}
          value={values.type}
          onChange={(next) => {
            set('type')(next)
            setInvalid({})
          }}
        />

        {isMatch ? (
          <div className={FIELD}>
            <label className={LABEL} htmlFor="event-opponent">
              Opponent
            </label>
            <input
              id="event-opponent"
              type="text"
              value={values.opponent}
              onChange={setFromInput('opponent')}
              aria-invalid={invalid.opponent ? 'true' : undefined}
              placeholder="e.g. Dubai Exiles"
              className={inputClasses(invalid.opponent)}
            />
          </div>
        ) : (
          <div className={FIELD}>
            <label className={LABEL} htmlFor="event-title">
              Title
            </label>
            <input
              id="event-title"
              type="text"
              value={values.title}
              onChange={setFromInput('title')}
              aria-invalid={invalid.title ? 'true' : undefined}
              placeholder="e.g. U14 Contact &amp; Conditioning"
              className={inputClasses(invalid.title)}
            />
          </div>
        )}

        <div className={FIELD_ROW}>
          <div>
            <label className={LABEL} htmlFor="event-date">
              Date
            </label>
            <input
              id="event-date"
              type="date"
              value={values.date}
              onChange={setFromInput('date')}
              aria-invalid={invalid.date ? 'true' : undefined}
              className={inputClasses(invalid.date)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="event-time">
              Time
            </label>
            <input
              id="event-time"
              type="time"
              value={values.time}
              onChange={setFromInput('time')}
              aria-invalid={invalid.time ? 'true' : undefined}
              aria-describedby="event-time-note"
              className={inputClasses(invalid.time)}
            />
          </div>
        </div>
        {/* The one place the form names the zone, mirroring the detail
            sheet (§4.21). A coach entering fixtures from the UK over the
            summer needs to know 20:00 means 20:00 at Zayed Sports City. */}
        <p id="event-time-note" className="-mt-2 mb-3.5 text-[12.5px] text-ink-muted">
          Times are Abu Dhabi time.
        </p>

        {/* Repeats. Create-time only — an existing event has occurrences
            around it that editing this one must not silently rewrite, so
            editing shows nothing here at all. Every occurrence is a real,
            independent event row; see the header of src/lib/recurrence.js. */}
        {!editing && (
          <fieldset className="mb-3.5 rounded-[11px] border-[1.5px] border-line p-3">
            <legend className={`${LABEL} px-1`}>Repeats</legend>

            <div className="mb-3 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const on = repeatDays.includes(day.value)
                return (
                  <label key={day.value}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleWeekday(day.value)}
                      className="peer sr-only"
                    />
                    <span
                      className={[
                        'block cursor-pointer select-none rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2',
                        on ? SEG_OPTION_ON : SEG_OPTION_OFF,
                      ].join(' ')}
                    >
                      {day.label}
                    </span>
                  </label>
                )
              })}
            </div>

            <label className={LABEL} htmlFor="event-repeat-until">
              Repeat until
            </label>
            <input
              id="event-repeat-until"
              type="date"
              value={repeatUntil}
              min={values.date || undefined}
              onChange={(domEvent) => setRepeatUntil(domEvent.target.value)}
              className={inputClasses(false)}
            />

            {/* Said here, before submit, because the refusal on Save is
                otherwise a surprise arriving after the work of ticking
                things. The submit-time check in handleSubmit is the actual
                guard — this is the warning. */}
            {multiSquad && (
              <p className="mt-2 rounded-[9px] bg-warn-bg px-3 py-2 text-[12.5px] text-ink">
                Repeating is one age group at a time. Untick the extra age groups below to repeat
                this one.
              </p>
            )}

            {repeatDays.length === 0 || !repeatUntil ? (
              <p className="mt-2 text-[12.5px] text-ink-muted">
                Pick the days it runs on and a date to run until, and you&apos;ll get one event for
                each. Leave this alone for a one-off.
              </p>
            ) : previewError ? (
              <p
                role="alert"
                className="mt-2 rounded-[9px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
              >
                {previewError.message}
              </p>
            ) : (
              <>
                {/* The count is of what is TICKED, not what was generated —
                    it has to agree with the Save button and with the number
                    of rows actually written. */}
                <p className="mt-3 mb-1.5 text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                  {seriesDates.length === 1 ? '1 session' : `${seriesDates.length} sessions`}
                </p>
                <p className="mb-2 text-[12.5px] text-ink-muted">
                  Untick any that fall in a holiday, Ramadan or a break.
                </p>
                <ul className="max-h-56 overflow-y-auto rounded-[9px] border border-line">
                  {previewDates.map((date) => (
                    <li key={date} className="border-b border-line last:border-b-0">
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!excluded.includes(date)}
                          onChange={() => toggleDate(date)}
                          className="h-4 w-4 accent-brand"
                        />
                        <span
                          className={
                            excluded.includes(date) ? 'text-ink-faint line-through' : 'text-ink'
                          }
                        >
                          {seriesDateLabel(date)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </fieldset>
        )}

        <div className={FIELD}>
          <label className={LABEL} htmlFor="event-team">
            Age group
          </label>
          <select
            id="event-team"
            value={teamId}
            onChange={setFromInput('teamId')}
            aria-invalid={invalid.teamId ? 'true' : undefined}
            className={inputClasses(invalid.teamId)}
          >
            {editableTeams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        {/* Extra age groups. Create-time only, and only when there is
            actually another squad to offer — a coach of one squad never sees
            this at all. Each ticked squad gets its OWN event row, sharing a
            group_id; nothing here makes one event belong to several teams.
            Same chip styling as the Repeats weekdays, so the two
            row-multiplying controls on this form look like each other. */}
        {otherTeams.length > 0 && (
          <fieldset className={FIELD}>
            <legend className={LABEL}>Also add for</legend>
            <div className="flex flex-wrap gap-2">
              {otherTeams.map((team) => {
                const on = extras.includes(team.id)
                return (
                  <label key={team.id}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleExtraTeam(team.id)}
                      className="peer sr-only"
                    />
                    <span
                      className={[
                        'block cursor-pointer select-none rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-sm transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2',
                        on ? SEG_OPTION_ON : SEG_OPTION_OFF,
                      ].join(' ')}
                    >
                      {team.name}
                    </span>
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-[12.5px] text-ink-muted">
              {multiSquad
                ? `Each age group gets its own event — ${targetTeamIds.length} in total. Change one later and the others stay as they are.`
                : 'Tick any other age groups joining this session. Each gets its own event.'}
            </p>
          </fieldset>
        )}

        {isMatch && (
          <Segmented
            legend="Home or away"
            name="event-home"
            options={[
              { value: 'home', label: 'Home' },
              { value: 'away', label: 'Away' },
            ]}
            value={values.home ? 'home' : 'away'}
            onChange={(next) => set('home')(next === 'home')}
          />
        )}

        <div className={FIELD}>
          <label className={LABEL} htmlFor="event-venue">
            Venue
          </label>
          <input
            id="event-venue"
            type="text"
            value={values.venue}
            onChange={setFromInput('venue')}
            placeholder={DEFAULT_VENUE}
            className={inputClasses(false)}
          />
        </div>

        {/* Pitch. Free text, like Venue, and for the same reason: there is
            no pitches table and this deliberately does not invent one. A
            managed list would be worth having the day someone wants clash
            detection ("Pitch 2 already has U12 at 18:00"), which needs a
            controlled vocabulary to compare against — free text cannot do
            it. Until then a text box costs one nullable column. */}
        <div className={FIELD}>
          <label className={LABEL} htmlFor="event-pitch">
            Pitch
          </label>
          <input
            id="event-pitch"
            type="text"
            value={values.pitch}
            onChange={setFromInput('pitch')}
            placeholder="e.g. Pitch 2"
            className={inputClasses(false)}
          />
        </div>

        {isMatch && (
          <>
            <div className={FIELD}>
              <label className={LABEL} htmlFor="event-competition">
                Competition
              </label>
              <input
                id="event-competition"
                type="text"
                value={values.competition}
                onChange={setFromInput('competition')}
                placeholder="e.g. UAE Youth League"
                className={inputClasses(false)}
              />
            </div>

            <div className={FIELD_ROW}>
              <div>
                <label className={LABEL} htmlFor="event-result-us">
                  Quins score
                </label>
                <input
                  id="event-result-us"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={values.resultUs}
                  onChange={setFromInput('resultUs')}
                  aria-describedby="event-score-note"
                  className={inputClasses(false)}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="event-result-them">
                  Opposition score
                </label>
                <input
                  id="event-result-them"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={values.resultThem}
                  onChange={setFromInput('resultThem')}
                  aria-describedby="event-score-note"
                  className={inputClasses(false)}
                />
              </div>
            </div>
            {/* A fixture becomes a result when it has a score, not when its
                date passes — so leaving these blank is the normal case. */}
            <p id="event-score-note" className="-mt-2 mb-3.5 text-[12.5px] text-ink-muted">
              Leave the scores blank until the match has been played.
            </p>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {error.message || "We couldn't save that. Try again."}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || blockedByRowGuard}
          className="w-full rounded-[11px] bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving
            ? 'Saving…'
            : editing
              ? 'Save changes'
              : blockedByRowGuard
                ? // ⚠️ MUST come before the series branch. That branch counts
                  // the series and would promise "Add 14 events" for a
                  // combination that writes nothing — the defect this fixes.
                  // The label names the way OUT, not the problem, because the
                  // Repeats section already states the problem above.
                  'Untick the extras, or clear the repeat'
                : repeating && !previewError && seriesDates.length > 0
                  ? // Naming the number on the button is the last chance to
                    // notice that "until 2036" produced 500 rows.
                    `Add ${seriesDates.length} ${seriesDates.length === 1 ? 'event' : 'events'}`
                  : multiSquad
                    ? // Same reason: the last chance to notice that five squads
                      // are ticked, not the two that were meant.
                      `Add ${targetTeamIds.length} events`
                    : 'Add event'}
        </button>
      </form>
    </Sheet>
  )
}
