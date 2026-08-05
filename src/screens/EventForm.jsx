import { useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { upsertEvent } from '../data/events.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import { clubDateTimeInputs, clubToday, clubWallTimeToUtc, eventDate } from '../lib/eventFormat.js'

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
  // Guards against a double submit landing two inserts: `saving` state is
  // async, this is not.
  const inFlight = useRef(false)

  const set = (key) => (nextValue) => setValues((current) => ({ ...current, [key]: nextValue }))
  const setFromInput = (key) => (domEvent) => set(key)(domEvent.target.value)

  const isMatch = values.type === 'match'
  const editing = Boolean(event?.id)

  // Reconcile the chosen squad against the live editable list on every
  // render rather than trusting the stored value — the same thing Schedule
  // and Roster do with their team filters. A stored id can outlive the scope
  // that produced it (memberships reload and shrink), and on a first render
  // where teams hadn't loaded yet the initial value is ''. Either way the
  // select would show a squad it wasn't actually holding in state.
  const teamId = editableTeams.some((team) => team.id === values.teamId)
    ? values.teamId
    : editableTeams[0]?.id ?? ''

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

    const team = editableTeams.find((candidate) => candidate.id === teamId)
    const payload = {
      ...(editing ? { id: event.id } : null),
      ...(team?.club_id ? { club_id: team.club_id } : null),
      team_id: teamId,
      type: values.type,
      title: isMatch ? null : values.title.trim(),
      opponent: isMatch ? values.opponent.trim() : null,
      home: isMatch ? values.home : null,
      venue: values.venue.trim() || null,
      competition: isMatch ? values.competition.trim() || null : null,
      starts_at,
      ...(isMatch ? parseScore(values.resultUs, values.resultThem) : { result_us: null, result_them: null }),
    }

    inFlight.current = true
    setSaving(true)
    setError(null)

    upsertEvent(payload)
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
          disabled={saving}
          className="w-full rounded-[11px] bg-brand px-4 py-3 text-[15px] font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add event'}
        </button>
      </form>
    </Sheet>
  )
}
