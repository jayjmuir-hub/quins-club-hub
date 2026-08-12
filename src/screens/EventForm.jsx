import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { listLeagueTeams } from '../data/leagueTeams.js'
import { listPitches, PITCH_TBD } from '../data/pitches.js'
import { insertEvents, upsertEvent, updateSeriesFrom, setSeriesTimeFrom } from '../data/events.js'
import { SCORE_KINDS, hasNoComponents } from '../lib/scoring.js'

// The pitch picker's escape hatch. A sentinel rather than '' so "Something
// else…" stays distinguishable from "No pitch" — they are different answers,
// and collapsing them would make the free-text box impossible to reach.
const OTHER_PITCH = '__other__'

// ══ COMPETITION ═══════════════════════════════════════════════════════════
//
// Jay, 12 Aug 2026: a match is a LEAGUE fixture or a TOURNAMENT fixture, and
// the app should ask which rather than making somebody type it into a free-text
// box and hope everyone spells it the same way.
//
// ⚠️ "NEITHER" IS A REAL ANSWER AND IS THE DEFAULT. A friendly is neither, and
// friendlies are common. Nothing may read the blank as "assume league" — the
// same rule `league_team_id` carries, for the same reason.
const COMPETITION_LEAGUE = 'league'
const COMPETITION_TOURNAMENT = 'tournament'

// ⚠️ ONE TO EIGHT BECAUSE THAT IS THE SEASON, and a SELECT rather than a number
// box because the set is small and closed. The column stays `smallint`, so a
// ninth round is one line here and no migration.
const LEAGUE_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8]

// ⚠️ HARD-CODED, AND NOT A MANAGED TABLE — deliberately, unlike pitches. The
// pitch list became a table the day clash detection needed to reason about
// pitches; nothing reasons about a tournament, it is a label on a fixture. Four
// regulars plus a free-text escape hatch is the same shape the pitch picker
// settled on, and it costs no schema.
// ⚠️ THE ESCAPE HATCH IS NOT A COURTESY. A one-off invitational the club has
// never entered before must be nameable without a deploy, or somebody files it
// under the closest wrong option.
const TOURNAMENTS = [
  'ADHJRT',
  'Dubai Youth Festival',
  'Al Ain Tournament',
  'Small Blacks Tournament',
]
const OTHER_TOURNAMENT = '__other_tournament__'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import {
  clubDateTimeInputs,
  clubToday,
  clubWallTimeToUtc,
  eventDate,
  eventEndDate,
} from '../lib/eventFormat.js'
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
function initialValues(event, editableTeams, initialDate = null, duplicating = false) {
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
      endTime: '',
      teamId: fallbackTeamId,
      home: true,
      venue: DEFAULT_VENUE,
      pitch: '',
      competition: '',
      // ⚠️ '' MEANS "NOT A LEAGUE MATCH", and that is the default for every new
      // fixture. Null league_team_id is what makes a fixture not a league one;
      // nothing may guess otherwise from the type or the squad.
      leagueTeamId: '',
      round: '',
      // '' = neither: a friendly. See the block by COMPETITION_LEAGUE.
      competitionType: '',
      notes: '',
      resultUs: '',
      resultThem: '',
    }
  }

  const { date, time } = clubDateTimeInputs(eventDate(event))
  // ⚠️ PREFILLS BLANK WHEN ends_at IS NULL, AND THAT IS A REAL CASE, not a
  // defensive one: the column arrived on 8 Aug 2026 and is nullable on
  // purpose, so every event created before it — and anything a future
  // external fixture feed sends — has no end time. Editing one of those must
  // open cleanly on a blank field and then be REQUIRED to fill it in, which
  // is what handleSubmit's endTime check does. eventEndDate returns null for
  // a missing or unparseable value, and clubDateTimeInputs(null) is
  // {date:'', time:''}, so nothing here can produce "Invalid Date" in a time
  // input.
  const { time: endTime } = clubDateTimeInputs(eventEndDate(event))
  return {
    type: event.type ?? 'match',
    title: event.title ?? '',
    opponent: event.opponent ?? '',
    // ══ DUPLICATING ═══════════════════════════════════════════════════════
    //
    // Jay, 12 Aug 2026: "the details are the work, the date is trivial." So a
    // duplicate carries everything that took effort — times, venue, pitch,
    // notes, squad, competition, league team — and clears the three things
    // that belong to the ORIGINAL OCCURRENCE and to nothing else.
    //
    // ⚠️ THE DATE IS BLANK, AND JAY CHOSE THAT OVER THREE SMARTER DEFAULTS
    // (next week, same date, today). The reasoning is the one already written
    // above about the TIME field: a prefilled value that is a guess quietly
    // becomes wrong, and here being wrong means a real session appearing in
    // fifteen parents' subscribed calendars on a day nobody chose. Blank
    // cannot be wrong; it can only be unfinished, and handleSubmit's existing
    // `date: !values.date` check already refuses to save it. NO NEW GUARD WAS
    // NEEDED FOR THIS — that is why blank is the cheap answer as well as the
    // safe one.
    date: duplicating ? '' : date,
    time,
    endTime,
    teamId: teamIds.includes(event.team_id) ? event.team_id : fallbackTeamId,
    home: event.home !== false,
    venue: event.venue ?? '',
    pitch: event.pitch ?? '',
    competition: event.competition ?? '',
    // ⚠️ AN OLD ROW WITH A COMPETITION AND NO TYPE IS READ AS A TOURNAMENT.
    // `competition` was free text from v1 until 12 Aug 2026, so every fixture
    // predating the column holds a string and a null type. Reading that as a
    // tournament name preserves what somebody typed and lets them correct it;
    // showing "neither" would silently orphan the text on the next save.
    // ⚠️ IT IS A READ, NOT A BACKFILL. The migration deliberately wrote nothing,
    // so nothing in the database can be mistaken for an answer somebody gave.
    competitionType:
      event.competition_type ?? (event.competition ? COMPETITION_TOURNAMENT : ''),
    // ⚠️ CARRIED ON A DUPLICATE, unlike the round below. A league team belongs
    // to the SQUAD, and the squad carries over — so ADHQ2's next fixture is
    // still ADHQ2's. Clearing it would make the commonest duplicate (same
    // side, another week) worse than typing it fresh.
    leagueTeamId: event.league_team_id ?? '',
    // ⚠️ CLEARED ON A DUPLICATE. A round belongs to one fixture in a season's
    // sequence; "Round 4" twice is not an obvious typo, it is a WRONG RESULT
    // filed with the governing body — the same class of harm the league-team
    // picker's squad scoping exists to prevent (see listLeagueTeams).
    round: duplicating || event.round == null ? '' : String(event.round),
    notes: event.notes ?? '',
    // ⚠️ CLEARED ON A DUPLICATE, and this is the one that would be found last.
    // Duplicating a PLAYED match is the normal way to set up the return
    // fixture; carrying the score would create a brand-new fixture that is
    // already a result — it would leave Upcoming immediately (hasResult), land
    // in the Results tab, and feed the "played with no score" dashboard tile
    // with a lie. Nothing on screen would say where the numbers came from.
    resultUs: duplicating || event.result_us == null ? '' : String(event.result_us),
    resultThem: duplicating || event.result_them == null ? '' : String(event.result_them),
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

/** One side's scoring components off a fixture row, keyed as scoring.js wants. */
function componentsOf(event, side) {
  const parts = {}
  for (const kind of SCORE_KINDS) parts[kind] = event?.[`${kind}_${side}`] ?? null
  return parts
}

export default function EventForm({
  event = null,
  // ⚠️ DUPLICATE IS A CREATE THAT STARTS FROM AN EXISTING ROW — a flag beside
  // `event`, not a third mode with its own code path. Everything below already
  // branches on `editing`, and `editing` is what this flag turns off: the id
  // never reaches the payload, so upsertEvent INSERTS; the series checkbox is
  // gated on `editing` so it cannot appear; and Repeats and "Also add for"
  // (both `!editing`) become available, which is a bonus rather than an
  // accident — "run last term's Tuesday session again all next term" is
  // duplicate + tick Tuesday + set an end date, and that is the one thing
  // Repeats genuinely cannot do on its own, being create-time only.
  //
  // ⚠️ series_id AND group_id CANNOT LEAK INTO A DUPLICATE, and it is worth
  // saying WHY rather than trusting it: neither is in `initialValues` at all.
  // The payload is assembled from `common` + rowFor() + leagueFields, and the
  // only writers of those two columns are the `repeating` and `multiSquad`
  // branches further down, which read fresh crypto.randomUUID()s. So the
  // protection is structural, not a filter somebody has to remember. It
  // matters: a duplicate that inherited series_id would be swept up by "delete
  // this and every later session" from an occurrence it has nothing to do
  // with, on a date nobody would think to check.
  duplicate = false,
  initialDate = null,
  onClose,
  onSaved,
}) {
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

  const [values, setValues] = useState(() =>
    initialValues(event, editableTeams, initialDate, duplicate),
  )
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
  // ⚠️ A DUPLICATE IS NOT EDITING, and this single line is what makes that
  // true everywhere. `editing` gates the id on the payload, the series
  // checkbox, the Repeats panel, the extra-squads picker, the sheet title and
  // the submit label — so turning it off here is the whole feature, rather
  // than six separate places each remembering to ask about `duplicate`.
  const editing = Boolean(event?.id) && !duplicate

  // ⚠️ A SCORE WITH COMPONENTS BEHIND IT CANNOT BE TYPED HERE, AND SAYING SO IS
  // THE WHOLE POINT OF THIS FLAG. Since 12 Aug 2026 result_us / result_them are
  // DERIVED by a database trigger from the tries, conversions, penalties and
  // drop goals recorded on the fixture. An UPDATE from this form does not send
  // those components, so the trigger recomputes from the ones already stored and
  // overwrites whatever was typed — correctly, and completely silently. Left as
  // plain inputs, a coach would type 30-0, press Save, and watch it come back
  // 22-12 with nothing anywhere explaining why.
  //
  // ⚠️ NOT ON A DUPLICATE. Duplicating a played match clears the score (see
  // initialValues), and the new fixture has no components of its own — so the
  // boxes must be typeable, which is the ordinary case for a friendly whose
  // score somebody just wants to record.
  const derivedScore =
    editing &&
    !(
      hasNoComponents(componentsOf(event, 'us')) && hasNoComponents(componentsOf(event, 'them'))
    )

  // ⚠️ THE TITLE IS THE ONLY THING TELLING SOMEBODY THIS IS A NEW EVENT.
  // A duplicate opens on a form that is full of an existing fixture's details —
  // the same venue, pitch, squad and times they were just looking at — so
  // "Add event" would read as though the sheet had failed to load the one they
  // tapped, and "Edit event" would be a lie that costs an accidental overwrite.
  // It is derived from `duplicate` rather than from `editing`, because
  // `editing` is false for BOTH a duplicate and a plain add.
  const sheetTitle = duplicate ? 'Duplicate event' : editing ? 'Edit event' : 'Add event'

  // Repeating is a CREATE-time feature. Editing an existing event never
  // shows the section, and this flag makes that structural rather than a
  // matter of remembering to check `editing` at every use site: with no
  // section rendered the state stays at its defaults, so `repeating` is
  // false and the save path below is the ordinary single-event one.
  const repeating = !editing && repeatDays.length > 0 && Boolean(repeatUntil)

  // ══ EDITING A REPEATING SERIES ══════════════════════════════════════════
  //
  // Only offered when editing an event that HAS a series_id. A one-off and a
  // multi-squad group both get the ordinary single-event save they had before
  // — group_id is deliberately not handled, exactly as deleteSeriesFrom does
  // not handle it (Jay deferred it 8 Aug 2026).
  //
  // ⚠️ DEFAULTS TO THIS EVENT ONLY, and that is not a coin toss. The wider
  // choice rewrites every later occurrence, so it has to be the one somebody
  // reaches for on purpose. A default that quietly edited a term would be
  // discovered after the fact, and there is no undo.
  const seriesId = editing ? event?.series_id : null
  const [applyToSeries, setApplyToSeries] = useState(false)
  const editingSeries = Boolean(seriesId) && applyToSeries
  // The time this sheet opened with, captured once. Compared against
  // values.time to decide whether the series time move is needed at all —
  // see the note at the call site for why it is not re-derived from
  // event.starts_at.
  const [originalTime] = useState(() => values.time)

  // The managed pitch list. Loaded once per open sheet — it is a handful of
  // rows and it must not refetch while somebody is typing.
  //
  // ⚠️ A FAILED LOAD IS NOT AN ERROR STATE HERE. If the list cannot be read
  // the form falls back to the free-text box it had before 11 Aug, which is
  // strictly better than refusing to let anyone save a fixture because the
  // pitch table was unreachable.
  const [pitchNames, setPitchNames] = useState([])
  useEffect(() => {
    let mounted = true
    listPitches()
      .then((rows) => {
        if (mounted) setPitchNames(rows.map((row) => row.name))
      })
      .catch(() => {
        if (mounted) setPitchNames([])
      })
    return () => {
      mounted = false
    }
  }, [])

  // ══ LEAGUE TEAM ═════════════════════════════════════════════════════════
  //
  // ⚠️ THE OPTIONS ARE THE CHOSEN SQUAD'S, AND ONLY THE CHOSEN SQUAD'S. That
  // is the entire reason listLeagueTeams takes a teamId and refuses to answer
  // without one: a club-wide list here would let a U14 fixture be filed under
  // a U16 team, and the governing body receives that as a WRONG RESULT rather
  // than as an obvious mistake. Retired teams are excluded (the default) —
  // this is a picker, and the one screen that shows retired ones is the Club
  // tab, where they can be brought back.
  //
  // ⚠️ A FAILED LOAD IS NOT AN ERROR STATE, same as the pitch list above: the
  // field falls back to "Not a league match", which is the correct answer for
  // every fixture that is not one, rather than refusing to let anyone save.
  const [leagueTeamOptions, setLeagueTeamOptions] = useState([])
  useEffect(() => {
    let mounted = true
    listLeagueTeams({ teamId: values.teamId })
      .then((rows) => {
        if (mounted) setLeagueTeamOptions(rows)
      })
      .catch(() => {
        if (mounted) setLeagueTeamOptions([])
      })
    return () => {
      mounted = false
    }
  }, [values.teamId])

  // ⚠️ CHANGING THE SQUAD CLEARS THE LEAGUE TEAM, AND THIS IS THE BUG THE
  // WHOLE FIELD IS MOST LIKELY TO HAVE. Pick U14B, pick ADHQ2, then realise it
  // was the U16 fixture and change the Age group: without this the select
  // still holds a U14 team's id while showing U16's options, and the save
  // writes it. Done as an effect on the value rather than in the dropdown's
  // onChange so it holds however teamId comes to change — structural, not a
  // matter of remembering to check it at every use site.
  //
  // Keyed off a ref so it does NOT fire on mount: editing an existing league
  // fixture must open with its league team intact.
  const previousTeamId = useRef(values.teamId)
  useEffect(() => {
    if (previousTeamId.current === values.teamId) return
    previousTeamId.current = values.teamId
    setValues((current) => ({ ...current, leagueTeamId: '', round: '' }))
  }, [values.teamId])

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
      <Sheet open onClose={onClose} title={sheetTitle}>
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
    // Both ends are built from the SAME date field and the same club-zone
    // conversion, so an event runs on one club calendar day.
    //
    // ⚠️ KNOWN LIMIT, stated rather than guessed at: an event that runs past
    // midnight (a social finishing at 00:30) cannot be entered — its end
    // lands before its start and the check below refuses it. The alternative
    // was to roll the end onto the next day whenever it looked earlier than
    // the start, which silently turns a mistyped 08:00 (meant 20:00) into a
    // fourteen-hour fixture in every parent's calendar. Refusing is wrong in
    // a rare case and visible; rolling over is wrong in a common case and
    // invisible. If Jay wants after-midnight events, the honest fix is an
    // end-DATE field, not a rule that infers one.
    const ends_at = clubWallTimeToUtc(values.date, values.endTime)
    // Instant comparison, not a string one. Both are UTC ISO strings today so
    // a lexicographic compare would happen to work — and would stop working
    // the day either side gained an offset or a different precision.
    const endsAfterStart =
      Boolean(starts_at && ends_at) && Date.parse(ends_at) > Date.parse(starts_at)

    const nextInvalid = {
      date: !values.date,
      time: !values.time || !starts_at,
      // REQUIRED (Jay's ruling, 8 Aug 2026) even though the column is
      // nullable — see the migration for why those two are not in conflict.
      endTime: !values.endTime || !ends_at || !endsAfterStart,
      teamId: !teamId,
      opponent: isMatch && !values.opponent.trim(),
      title: !isMatch && !values.title.trim(),
    }
    setInvalid(nextInvalid)

    if (Object.values(nextInvalid).some(Boolean)) {
      // The ordering failure gets its own message. "Fill in the highlighted
      // fields" is a lie when the field IS filled in, and the database's own
      // guard — the events_ends_after_starts CHECK, which is the real
      // boundary — surfaces as a raw 23514 that means nothing to a coach.
      const orderingIsTheOnlyProblem =
        Boolean(values.endTime && ends_at && starts_at && !endsAfterStart) &&
        Object.entries(nextInvalid).every(([key, bad]) => !bad || key === 'endTime')
      setError(
        new Error(
          orderingIsTheOnlyProblem
            ? 'The end time must be after the start time.'
            : 'Fill in the highlighted fields before saving.',
        ),
      )
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
      // ⚠️ `competition` NOW MEANS "THE TOURNAMENT'S NAME", so it is null for a
      // league fixture and for a friendly. Switching an event from Tournament
      // to League therefore clears the name, which is intended: the two answers
      // are exclusive and leaving the old name behind would render a league
      // fixture as though it were still in a tournament.
      competition:
        isMatch && values.competitionType === COMPETITION_TOURNAMENT
          ? values.competition.trim() || null
          : null,
      // ⚠️ IN `common`, UNLIKE THE LEAGUE FIELDS BELOW, AND THE DIFFERENCE IS
      // REAL. What competition a session belongs to is a fact about the EVENT —
      // an ADHJRT weekend fanned out across every age group is genuinely one
      // tournament for all of them. Which of our teams played it, and in which
      // round, are facts about the SQUAD, so those stay on the primary payload.
      competition_type: isMatch ? values.competitionType || null : null,
      // Optional, and empty means NULL rather than '' — EventDetail and the
      // calendar feed both test it for truthiness, and an empty string would
      // render an "Additional info" heading over nothing.
      notes: values.notes.trim() || null,
      starts_at,
      // Overwritten per occurrence in the series branch below. Left here so
      // the ONE-OFF and the MULTI-SQUAD fan-out both carry it without a
      // second place to remember: rowFor() spreads `common`, so every fanned
      // -out squad copy gets the same end time as the primary by
      // construction, not by being told to.
      ends_at,
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

    // ══ THE LEAGUE FIELDS ARE THE PRIMARY SQUAD'S, AND ARE NOT IN `common` ══
    //
    // ⚠️ THIS IS THE WHOLE REASON THEY SIT HERE AND NOT WITH venue AND pitch.
    // `common` is stamped onto EVERY row by rowFor(), so a multi-squad fan-out
    // would give the primary squad's league team to all three squads' copies —
    // the "U14 team on a U16 fixture" mistake, made automatically and for every
    // squad at once. `league_team_id` is only ever the squad in the Age group
    // dropdown, so it goes on the payload after rowFor() and nowhere else.
    // ⚠️ It is also therefore ABSENT from the series-edit write below, which
    // sends `common`: "apply to every later session" cannot retag a term with
    // one round number, which is right.
    //
    // ⚠️ round IS NULL UNLESS THIS IS A LEAGUE FIXTURE, whatever the input
    // still holds. A round left behind on a fixture later switched to a
    // tournament or a friendly must not survive in the column.
    // ⚠️ GATED ON THE COMPETITION TYPE, NOT ON THE LEAGUE TEAM — changed
    // 12 Aug 2026 when the type became a field somebody answers. A round is a
    // property of the COMPETITION ("round 4 of the league"), not of which of
    // our sides turned up, and tying it to `league_team_id` meant a league
    // fixture whose team had not been picked yet silently discarded the round.
    // fixtureLabel still refuses to RENDER a round without a league team, which
    // is a separate and still-correct rule about display.
    const leagueTeamId = isMatch && values.leagueTeamId ? values.leagueTeamId : null
    const isLeagueFixture = isMatch && values.competitionType === COMPETITION_LEAGUE
    const roundText = String(values.round ?? '').trim()
    const leagueFields = {
      league_team_id: leagueTeamId,
      round:
        isLeagueFixture && roundText !== '' && Number.isFinite(Number(roundText))
          ? Number(roundText)
          : null,
    }

    const payload = {
      ...(editing ? { id: event.id } : null),
      ...rowFor(teamId),
      ...leagueFields,
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
          // ⚠️ RECOMPUTED PER OCCURRENCE, exactly like starts_at, and NOT
          // carried over from `payload`. The whole series is "the same wall
          // clock on each date", so the end has to be converted against ITS
          // OWN date: reusing one ends_at would give every session the first
          // date's finish, i.e. a two-hour training on 11 Aug and a
          // minus-168-hour one on 18 Aug — which the events_ends_after_starts
          // CHECK would reject as a raw 23514 on a batch insert, taking the
          // whole term down with it. Same trap as the offset lookup in
          // clubWallTimeToUtc: a time is only meaningful against a date.
          ends_at: clubWallTimeToUtc(date, values.endTime),
          series_id: seriesId,
        }))
      : multiSquad
        ? targetTeamIds.map((id) => ({ ...rowFor(id), group_id: groupId }))
        : null

    // ⚠️ THE SERIES EDIT IS TWO WRITES, AND THE ORDER MATTERS.
    // updateSeriesFrom sets the date-independent fields (venue, pitch, title,
    // type, opponent, competition, notes) in one statement.
    // setSeriesTimeFrom then moves the time of day, which cannot be the same
    // statement because each occurrence's new start is computed from its OWN
    // date — see the RPC's comment in db/migrations.
    //
    // Fields first, time second, deliberately: the time move is the one that
    // reorders the list on screen, so doing it last means a failure between
    // the two leaves the sessions where they were rather than moved but
    // otherwise unedited.
    //
    // ⚠️ THIS EVENT IS UPDATED BY THE SERIES CALLS THEMSELVES, not separately.
    // Both filter `starts_at >= this occurrence`, so it is already in range —
    // an extra upsertEvent would be a second write of the same row and would
    // fight the time move.
    const seriesWrite = async () => {
      await updateSeriesFrom(seriesId, event.starts_at, common)
      // ⚠️ ONLY WHEN THE TIME ACTUALLY CHANGED, and compared against the
      // form's OWN initial value rather than re-deriving it from
      // event.starts_at. initialValues() already converted that instant into
      // club wall-clock to fill the input; converting it a second time by a
      // different route is how the two drift and every save starts moving a
      // whole term by zero minutes.
      if (values.time !== originalTime) {
        const [hh, mm] = String(values.time).split(':').map(Number)
        await setSeriesTimeFrom(seriesId, event.starts_at, hh, mm)
      }
      return { ...event, ...common }
    }

    // onSaved's contract stays "one saved event" — every caller uses it as a
    // refresh trigger and ignores the argument, and widening it to an array
    // for this one path would be a change they'd all have to absorb.
    const write = editingSeries
      ? seriesWrite()
      : rows
        ? insertEvents(rows).then((saved) => saved[0] ?? null)
        : upsertEvent(payload)

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
    <Sheet open onClose={onClose} title={sheetTitle}>
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

        {/* Date on its own row, then the two times side by side.
            End time joined this form on 8 Aug 2026, and the obvious layout
            — three columns — was rejected: on a 360px phone that leaves each
            control around 100px, and a native date input needs roughly 120px
            before Chrome starts clipping the year. Grouping the two times
            also says what they are, which is one thing with two ends. */}
        <div className={FIELD}>
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
        <div className={FIELD_ROW}>
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
          <div>
            {/* REQUIRED. The column is nullable — see the migration — but
                every event created HERE gets an end time, because the only
                other answer available to the calendar feed is a per-type
                guess (match 120, training 90) that has been quietly landing
                in parents' phones since the feed shipped. */}
            <label className={LABEL} htmlFor="event-end-time">
              End time
            </label>
            <input
              id="event-end-time"
              type="time"
              value={values.endTime}
              onChange={setFromInput('endTime')}
              aria-invalid={invalid.endTime ? 'true' : undefined}
              aria-describedby="event-time-note"
              className={inputClasses(invalid.endTime)}
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

        {/* Pitch. A PICKER as of 11 Aug 2026 — this comment used to explain
            why it was free text, and the reasoning ("a managed list would be
            worth having the day someone wants clash detection") is exactly
            what happened. The list is db/migrations/20260811_pitches.sql.

            ⚠️ THE FREE-TEXT BOX SURVIVES, AND NOT AS A COURTESY. Existing
            events name pitches that predate the list ("Clubhouse lawn"), and
            a picker that could not express them would force somebody to
            either mis-file a fixture or invent a pitch row for a lawn. The
            select is the fast path; the box is the escape hatch.

            ⚠️ `Pitch TBD` IS ITS OWN OPTION, not a pitch in the list. Jay's
            ruling: it must keep rendering, because without it nobody can tell
            "no pitch allocated yet" from "the app didn't say". */}
        <div className={FIELD}>
          <label className={LABEL} htmlFor="event-pitch">
            Pitch
          </label>
          <select
            id="event-pitch"
            value={pitchNames.includes(values.pitch) || values.pitch === PITCH_TBD ? values.pitch : OTHER_PITCH}
            onChange={(domEvent) => {
              const chosen = domEvent.target.value
              // Choosing "Something else" must not silently keep the previous
              // pitch — it clears the box so the person types what they mean.
              set('pitch')(chosen === OTHER_PITCH ? '' : chosen)
            }}
            className={inputClasses(false)}
          >
            <option value="">No pitch</option>
            <option value={PITCH_TBD}>{PITCH_TBD} — not allocated yet</option>
            {pitchNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={OTHER_PITCH}>Something else…</option>
          </select>

          {!pitchNames.includes(values.pitch) && values.pitch !== PITCH_TBD && (
            <input
              type="text"
              aria-label="Pitch name"
              value={values.pitch}
              onChange={setFromInput('pitch')}
              placeholder="e.g. Clubhouse lawn"
              className={`${inputClasses(false)} mt-2`}
            />
          )}
        </div>

        {isMatch && (
          <>
            {/* ⚠️ MATCHES ONLY, and the squad's own teams only. A training
                session has no league team, and the options come from
                listLeagueTeams({ teamId }) — see the block by its loader for
                why a club-wide list here would be a wrong RESULT rather than
                an obvious mistake. */}
            <div className={FIELD}>
              <label className={LABEL} htmlFor="event-league-team">
                League team
              </label>
              <select
                id="event-league-team"
                value={values.leagueTeamId}
                onChange={setFromInput('leagueTeamId')}
                className={inputClasses(false)}
              >
                {/* ⚠️ "Not a league match" IS THE DEFAULT AND IS A REAL ANSWER,
                    not a prompt to choose. Friendlies and festivals are
                    matches with no league team, and they are the common case.
                    Wording it as "Select…" would read as an unfilled field. */}
                <option value="">Not a league match</option>
                {leagueTeamOptions.map((leagueTeam) => (
                  <option key={leagueTeam.id} value={leagueTeam.id}>
                    {leagueTeam.division
                      ? `${leagueTeam.rcm_name} — Div ${leagueTeam.division}`
                      : leagueTeam.rcm_name}
                  </option>
                ))}
              </select>
              {leagueTeamOptions.length === 0 && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                  This squad has no league teams yet. An admin can add them on the Club tab.
                </p>
              )}
            </div>

            {/* ⚠️ A CHOICE, NOT A FREE-TEXT BOX, as of 12 Aug 2026. It was an
                open text field ("e.g. UAE Youth League"), which meant every
                coach spelled the same competition differently and nothing could
                group by it. Jay's ruling: ask which of the two it is. */}
            <div className={FIELD}>
              <label className={LABEL} htmlFor="event-competition-type">
                Competition
              </label>
              <select
                id="event-competition-type"
                value={values.competitionType}
                onChange={(domEvent) => {
                  const chosen = domEvent.target.value
                  // ⚠️ SWITCHING TYPE CLEARS THE OTHER SIDE'S ANSWER. League and
                  // Tournament are exclusive, so a round left over from League
                  // or a name left over from Tournament would be written against
                  // a fixture that is no longer either. The save nulls them too;
                  // this is so the FORM never shows a stale value it will drop.
                  setValues((current) => ({
                    ...current,
                    competitionType: chosen,
                    round: chosen === COMPETITION_LEAGUE ? current.round : '',
                    competition: chosen === COMPETITION_TOURNAMENT ? current.competition : '',
                  }))
                }}
                className={inputClasses(false)}
              >
                {/* ⚠️ "Neither" IS A REAL ANSWER AND THE DEFAULT — a friendly.
                    Wording it "Select…" would read as an unfilled field. */}
                <option value="">Neither — a friendly</option>
                <option value={COMPETITION_LEAGUE}>League</option>
                <option value={COMPETITION_TOURNAMENT}>Tournament</option>
              </select>
            </div>

            {/* ⚠️ ROUND BELONGS TO THE LEAGUE, so it appears with it and only
                with it. The set is small and closed, so a select rather than a
                number box: it cannot be typed wrong, and "R9" is a conversation
                to have rather than a value to accept silently. */}
            {values.competitionType === COMPETITION_LEAGUE && (
              <div className={FIELD}>
                <label className={LABEL} htmlFor="event-round">
                  Round
                </label>
                <select
                  id="event-round"
                  value={values.round}
                  onChange={setFromInput('round')}
                  className={inputClasses(false)}
                >
                  {/* Not knowing the round yet is normal and must be sayable. */}
                  <option value="">Not set</option>
                  {LEAGUE_ROUNDS.map((round) => (
                    <option key={round} value={String(round)}>
                      Round {round}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ⚠️ THE FOUR REGULARS PLUS AN ESCAPE HATCH, the shape the pitch
                picker above settled on. A one-off invitational the club has
                never entered must be nameable without a deploy, or somebody
                files it under the closest wrong option. */}
            {values.competitionType === COMPETITION_TOURNAMENT && (
              <div className={FIELD}>
                <label className={LABEL} htmlFor="event-tournament">
                  Tournament
                </label>
                <select
                  id="event-tournament"
                  value={
                    TOURNAMENTS.includes(values.competition) ? values.competition : OTHER_TOURNAMENT
                  }
                  onChange={(domEvent) => {
                    const chosen = domEvent.target.value
                    // Choosing "Something else" must not silently keep the
                    // previous tournament — it clears the box so the person
                    // types what they mean. Same as the pitch picker.
                    set('competition')(chosen === OTHER_TOURNAMENT ? '' : chosen)
                  }}
                  className={inputClasses(false)}
                >
                  {TOURNAMENTS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value={OTHER_TOURNAMENT}>Something else…</option>
                </select>

                {!TOURNAMENTS.includes(values.competition) && (
                  <input
                    type="text"
                    aria-label="Tournament name"
                    value={values.competition}
                    onChange={setFromInput('competition')}
                    placeholder="e.g. Sharjah Sevens"
                    className={`${inputClasses(false)} mt-2`}
                  />
                )}
              </div>
            )}

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
                  readOnly={derivedScore}
                  aria-describedby="event-score-note"
                  className={`${inputClasses(false)}${derivedScore ? ' bg-surface-mute text-ink-muted' : ''}`}
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
                  readOnly={derivedScore}
                  aria-describedby="event-score-note"
                  className={`${inputClasses(false)}${derivedScore ? ' bg-surface-mute text-ink-muted' : ''}`}
                />
              </div>
            </div>
            {/* ⚠️ TWO DIFFERENT SENTENCES, AND THE SECOND ONE IS LOAD-BEARING.
                A fixture becomes a result when it has a score, not when its date
                passes — so blank is the normal case. But once tries and kicks
                are recorded the score is computed from them, and a form that
                still invited typing would be lying about what Save does. */}
            <p id="event-score-note" className="-mt-2 mb-3.5 text-[12.5px] text-ink-muted">
              {derivedScore
                ? 'This score is worked out from the tries and kicks recorded on the match sheet. Change it there.'
                : 'Leave the scores blank until the match has been played.'}
            </p>
          </>
        )}

        {/* Additional info (8 Aug 2026). OPTIONAL, and last before Save,
            because it is the one field with no fixed shape — "meet at the
            gate 30 minutes before", "bring both kits". It goes to the event
            sheet AND into the calendar feed's DESCRIPTION, so it reaches a
            parent who never opens the app.
            ⚠️ SQUAD-VISIBLE, NOT PRIVATE — same wording as the column
            comment in the migration. Anyone who can see the event can read
            it, including through a calendar subscription URL, so the hint
            below says so rather than leaving a coach to assume otherwise.
            maxLength is a courtesy limit, not a constraint: `notes` is
            unbounded `text` in Postgres, and 500 characters is about as much
            as an ICS DESCRIPTION can carry before it stops being read. */}
        <div className={FIELD}>
          <label className={LABEL} htmlFor="event-notes">
            Additional info
          </label>
          <textarea
            id="event-notes"
            rows={3}
            maxLength={500}
            value={values.notes}
            onChange={setFromInput('notes')}
            aria-describedby="event-notes-note"
            placeholder="e.g. Meet at the gate 30 minutes before. Bring both kits."
            className={`${inputClasses(false)} resize-y`}
          />
          <p id="event-notes-note" className="mt-1.5 text-[12.5px] text-ink-muted">
            Optional. Shown on the event and in anyone&apos;s subscribed calendar.
          </p>
        </div>

        {/* ── Apply to the rest of the series ────────────────────────────
            Only for an event that HAS a series_id. ⚠️ `<label>`/`<input>`
            rather than a styled <button>, matching Segmented.jsx and the
            EventForm radio group above: a button used as a layout box
            inherits Chromium's UA content-centring, which jsdom cannot see.

            ⚠️ FUTURE ONLY, and it says so on screen rather than in a comment
            nobody reads. "this and later" is what the write does — sessions
            already played keep their results and attendance. */}
        {seriesId && (
          <div className="mb-3.5 rounded-[11px] border-[1.5px] border-line bg-surface-card p-3">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={applyToSeries}
                onChange={(domEvent) => setApplyToSeries(domEvent.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
              />
              <span>
                <span className="block text-sm font-bold text-ink">
                  Apply to this and every later session
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-muted">
                  This is a repeating event. Sessions that have already happened are never
                  changed. The date stays per session — a new time moves them all to that
                  time, keeping each session&apos;s length.
                </span>
              </span>
            </label>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {error.message || "We couldn't save that. Try again."}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          full
          disabled={saving || blockedByRowGuard}
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
        </Button>
      </form>
    </Sheet>
  )
}
