import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Spinner from '../components/Spinner.jsx'
import { getEvent, upsertEvent } from '../data/events.js'
import { listLineups } from '../data/lineups.js'
import { listPlayers } from '../data/players.js'
import {
  SLOT_COUNT,
  getMatchSheet,
  saveMatchSheet,
  saveMatchSheetCards,
  saveMatchSheetSlots,
  setMatchSheetStatus,
} from '../data/matchSheets.js'
import { useMemberships } from '../lib/memberships.jsx'
import useMyProfile from '../lib/useMyProfile.js'
import { canEditTeam } from '../lib/scope.js'
import { eventDate, eventTimeLabel, formatTime } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { shareElementAsImage } from '../lib/shareImage.js'
import { deadlineLabel, isOverdue, matchSheetDeadline } from '../lib/matchSheetDeadline.js'
import { namesFromLineup } from '../lib/lineupSquad.js'
import { isMinisTeam } from '../lib/minis.js'
import {
  SCORE_KINDS,
  SCORE_LABELS,
  SCORE_POINTS,
  hasNoComponents,
  scoringForTeam,
  totalFor,
} from '../lib/scoring.js'

// The RCM Official Match Result Sheet — Project 2.
//
// ⚠️ THIS IS A GOVERNING-BODY FORM, NOT A CLUB SCREEN, and that governs every
// layout decision here. It is filled in, photographed, and sent to Rugby Club
// Management through a WhatsApp group. What matters is that the finished
// artefact is legible and complete, not that it looks like the rest of the app.
//
// ⚠️ THE LAYOUT IS A FACSIMILE OF THE REAL FORM, which Jay supplied on
// 12 Aug 2026. Structure taken from the document itself, not from a
// description of its fields:
//   - the 22 run in TWO COLUMNS, 1-12 left and 13-22 right, each with its own
//     FR column
//   - FINAL SCORE / TRIES appear TWICE, once for HOME and once for AWAY — not
//     "us" and "them", so a fixture we played AWAY puts our score on the RIGHT
//   - discipline is a grid of HALF | TIME | R/Y | NO | FULL NAME | REASON
//   - the headings are RCM's red, and the instruction strip sits directly under
//     the CLUB/TEAM line where they put it
//
// ⚠️ INSTRUCTION 5 ON THE FORM: "WAP, DIV1, DIV2 Games are completed on
// sportslive app." Those are senior competitions and this sheet does not apply
// to them at all — independent support for matchSheetDeadline() returning null
// for a non-youth squad rather than guessing a rule.
//
// ⚠️ ONE EDITOR FOR EVERY AGE GROUP — Jay, 12 Aug 2026. U18's real deadline
// falls an hour BEFORE kick-off, and this screen still SAYS so, because not
// offering a pre-match flow is a different thing from telling a coach
// something untrue.

/** Every cell on the form is a hairline box. One class, so none can drift. */
const CELL = 'border border-black px-1.5 py-[3px] align-middle'

/** 1-12 down the left; 13-22 fill the right beside them. */
const LEFT_COLUMN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** The five blank discipline rows the paper form provides. */
const CARD_ROWS = 5

/** The two sides, in the order the columns are laid out. */
const SIDES = ['us', 'them']

function emptyScore() {
  const blank = {}
  for (const side of SIDES) for (const kind of SCORE_KINDS) blank[`${kind}_${side}`] = ''
  return blank
}

/** Seeds the entry boxes from the fixture. Null stays BLANK, never 0. */
function scoreFrom(row) {
  const next = emptyScore()
  for (const side of SIDES) {
    for (const kind of SCORE_KINDS) {
      const value = row?.[`${kind}_${side}`]
      // ⚠️ `value == null ? '' : String(value)` — NOT `value ?? ''` followed by
      // a truthiness test. A recorded ZERO is a real answer ("they scored no
      // penalties") and must render as 0, while "not recorded" must render as a
      // blank box. Collapsing the two is the exact distinction the components
      // exist to keep, and it would collapse silently.
      next[`${kind}_${side}`] = value == null ? '' : String(value)
    }
  }
  return next
}

/**
 * One side's components as numbers, with blank meaning null.
 *
 * ⚠️ NULL, NOT 0, FOR A BLANK BOX — this is what hasNoComponents() reads to
 * decide whether a side has a recorded score at all, and it is the same
 * predicate the database trigger applies before it recomputes a result. Return
 * 0 here and a fixture whose score was typed by hand months ago gets recomputed
 * to nothing the first time somebody opens its match sheet.
 */
function partsFor(score, side) {
  const parts = {}
  for (const kind of SCORE_KINDS) {
    const text = String(score[`${kind}_${side}`] ?? '').trim()
    const parsed = Number(text)
    parts[kind] = text === '' || !Number.isFinite(parsed) ? null : Math.max(0, Math.floor(parsed))
  }
  return parts
}

/** "tries, conversions and drop goals" — for the sentence naming the rules. */
function kindSentence(kinds) {
  const words = kinds.map((kind) => SCORE_LABELS[kind].toLowerCase())
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/**
 * An input that reads as a filled-in box rather than a form control.
 *
 * ⚠️ NO BORDER AND NO BACKGROUND ON PURPOSE. The table cell already draws the
 * box; a control with its own chrome would photograph as an app screenshot
 * instead of as a completed form, which is the one thing this page is for.
 */
function Cell({ value, onChange, list, ...rest }) {
  return (
    <input
      {...rest}
      list={list}
      value={value ?? ''}
      onChange={onChange}
      className="w-full min-w-0 bg-transparent text-[11.5px] leading-tight outline-none"
    />
  )
}

/** One numbered squad row: number, name, FR tick. */
function SlotCells({ slots, index, onName, onSet }) {
  const row = slots[index]
  return (
    <>
      <td className={`${CELL} text-center font-bold`}>{row.slot}</td>
      <td className={CELL}>
        <Cell
          list="squad-players"
          aria-label={`Player ${row.slot}`}
          value={row.full_name}
          onChange={(domEvent) => onName(index, domEvent.target.value)}
        />
      </td>
      <td className={`${CELL} text-center`}>
        {/* ⚠️ The FR column is a SAFETY declaration — it tells the referee which
            replacements can cover the front row. Not decoration. */}
        <input
          type="checkbox"
          aria-label={`Front row cover for player ${row.slot}`}
          checked={row.front_row}
          onChange={(domEvent) => onSet(index, { front_row: domEvent.target.checked })}
        />
      </td>
    </>
  )
}

function emptySlots() {
  return Array.from({ length: SLOT_COUNT }, (unused, index) => ({
    slot: index + 1,
    player_id: null,
    full_name: '',
    front_row: false,
  }))
}

/** Fills the 22 rows from whatever the sheet actually stored, gaps included. */
function slotsFrom(stored) {
  const base = emptySlots()
  for (const row of stored ?? []) {
    if (row.slot >= 1 && row.slot <= SLOT_COUNT) {
      base[row.slot - 1] = {
        slot: row.slot,
        player_id: row.player_id ?? null,
        full_name: row.full_name ?? '',
        front_row: Boolean(row.front_row),
      }
    }
  }
  return base
}

/**
 * Fills the BLANK rows from a lineup, and never touches a filled one.
 *
 * ⚠️ THE SAME RULE THE MANAGER PREFILL USES, AND FOR THE SAME REASON. A sheet
 * that has been worked on is a record of what somebody decided; a lineup edited
 * after they started must not quietly rewrite it. The coach who WANTS the new
 * lineup presses Refill, which is the other function below and says so.
 *
 * ⚠️ A PLAYER ALREADY ON THE SHEET IS NOT ADDED AGAIN. Without this, a coach who
 * typed three names by hand and then reloaded would find those three players
 * listed twice — once where they typed them and once where the lineup put them —
 * which the governing body reads as a 25-man squad.
 */
function withLineup(slots, picks) {
  if (!picks.length) return slots
  const taken = new Set(slots.map((row) => row.player_id).filter(Boolean))
  const queue = picks.filter((pick) => !taken.has(pick.player_id))
  return slots.map((row) => {
    if (String(row.full_name ?? '').trim() !== '') return row
    const next = queue.shift()
    return next ? { ...row, player_id: next.player_id, full_name: next.full_name } : row
  })
}

/**
 * Replaces all 22 rows with a lineup. The deliberate, confirmed action.
 *
 * ⚠️ THE FR TICKS GO WITH THE NAMES. Front row cover is a SAFETY declaration
 * about a named player (see SlotCells); leaving a tick behind on a row whose
 * occupant just changed would tell a referee that somebody can pack down at
 * hooker on the strength of who used to be in that box.
 */
function slotsFromLineup(picks) {
  const base = emptySlots()
  picks.slice(0, SLOT_COUNT).forEach((pick, index) => {
    base[index] = { ...base[index], player_id: pick.player_id, full_name: pick.full_name }
  })
  return base
}

function emptyCards() {
  return Array.from({ length: CARD_ROWS }, () => ({
    half: '',
    minute: '',
    colour: '',
    slot: '',
    full_name: '',
    reason: '',
  }))
}

export default function MatchSheet() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { memberships } = useMemberships()
  const { profile } = useMyProfile()

  const [event, setEvent] = useState(null)
  const [squad, setSquad] = useState([])
  const [lineups, setLineups] = useState([])
  const [sheet, setSheet] = useState(null)
  const [slots, setSlots] = useState(emptySlots)
  const [cardRows, setCardRows] = useState(emptyCards)
  const [fields, setFields] = useState({
    captain_name: '',
    manager_name: '',
    manager_phone: '',
    medical_notes: '',
  })

  // ⚠️ THE SCORE IS THE FIXTURE'S, NOT THE SHEET'S — Jay ruled one score, on the
  // fixture, 12 Aug 2026. These eight boxes are `public.events` columns and are
  // saved with the event, not with the sheet; match_sheets carried its own
  // score_us/score_them/tries_us/tries_them until the same day and they are
  // gone, because two places to hold a score is two places to disagree.
  const [score, setScore] = useState(emptyScore)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [sharing, setSharing] = useState(false)
  // The id of the lineup whose Refill has been ARMED, or null. Two-step inline
  // confirm — never a native confirm(), which blocks the event loop and is
  // untestable (RESTORE.md; the pattern is Notices' NoticeRow).
  const [confirmRefill, setConfirmRefill] = useState(null)
  const printRef = useRef(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    getEvent(eventId)
      .then(async (row) => {
        if (!mounted) return
        if (!row) {
          setError(new Error('That fixture could not be found.'))
          return
        }
        setEvent(row)
        setScore(scoreFrom(row))

        // ⚠️ SCOPED TO THE FIXTURE'S SQUAD. A club-wide roster on this form
        // would let a coach file a player from another age group, which the
        // governing body receives as a wrong team sheet rather than an obvious
        // slip — the same reasoning listLeagueTeams' teamId argument carries.
        //
        // ⚠️ THE LINEUP IS FETCHED HERE, NOT IN A SECOND EFFECT, AND THE
        // SEEDING HAPPENS ON THIS LINE. The names to seed with need BOTH the
        // squad (for the names — `lineup_players` holds none) and the saved
        // sheet (to know which rows are already filled), and the two arrive
        // independently. Doing it in an effect that watches all three would
        // need the same once-per-mount ref the manager prefill carries, and for
        // a worse reason: it would run again on any later re-render and refill
        // a row the coach had just cleared.
        //
        // ⚠️ A FAILURE TO READ LINEUPS IS NOT A FAILURE TO OPEN THE SHEET. The
        // sheet is the governing body's document and must open with an empty 22
        // rather than an error — the same `.catch(() => [])` the squad read has
        // carried since this screen was written.
        const [players, existing, fixtureLineups] = await Promise.all([
          listPlayers({ teamIds: [row.team_id] }).catch(() => []),
          getMatchSheet(eventId),
          listLineups(eventId).catch(() => []),
        ])
        if (!mounted) return

        setSquad(players)
        setLineups(fixtureLineups)
        setSlots(withLineup(slotsFrom(existing?.slots), namesFromLineup(fixtureLineups[0], players)))

        if (existing) {
          setSheet(existing)
          if (existing.cards?.length) {
            const filled = existing.cards.map((card) => ({
              half: card.half ?? '',
              minute: card.minute ?? '',
              colour: card.colour ?? '',
              slot: card.slot ?? '',
              full_name: card.full_name ?? '',
              reason: card.reason ?? '',
            }))
            // Always keep at least the paper form's five rows available.
            while (filled.length < CARD_ROWS) filled.push(emptyCards()[0])
            setCardRows(filled)
          }
          setFields({
            captain_name: existing.captain_name ?? '',
            manager_name: existing.manager_name ?? '',
            manager_phone: existing.manager_phone ?? '',
            medical_notes: existing.medical_notes ?? '',
          })
        }
      })
      .catch((err) => {
        if (mounted) setError(err)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [eventId])

  // ── The person filling it in, defaulted from their own profile ─────────────
  //
  // Jay, 12 Aug 2026: the sheet should "auto populate the details of the person
  // filling it out, coach or manager, full name, and phone number". The form's
  // footer asks for exactly that and it was being retyped by hand — the one
  // sheet that exists was filed with a NULL manager_name.
  //
  // ⚠️ DEFAULT, NOT LOCK, and the `||` is what makes it a default. It fills a
  // BLANK box and never touches one that already has something in it, so a
  // filed sheet naming the manager is not quietly re-signed by the next coach
  // who opens it. The person filling the form in is not always the person whose
  // details RCM wants.
  //
  // ⚠️ ONCE PER MOUNT, guarded by a ref rather than by a dependency list. The
  // profile arrives from a cached promise (useMyProfile) whose timing relative
  // to the sheet's own load is not fixed, so this effect can fire either side
  // of it; without the ref, a later re-render would refill a box the coach had
  // deliberately cleared.
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current || loading || !profile) return
    prefilled.current = true
    setFields((current) => ({
      ...current,
      manager_name: current.manager_name || profile.full_name || '',
      manager_phone: current.manager_phone || profile.phone || '',
    }))
  }, [profile, loading])

  const squadName = event?.team?.name ?? ''
  const kickOff = event ? eventDate(event) : null
  const deadline = useMemo(
    () => (squadName && kickOff ? matchSheetDeadline(squadName, kickOff) : null),
    [squadName, kickOff],
  )

  // ⚠️ THE CLIENT CHECK DECIDES WHAT IS OFFERED, NOT WHAT IS PERMITTED. RLS on
  // match_sheets is the real boundary; this only avoids showing a form the
  // database would refuse to save.
  const mayEdit = event ? canEditTeam(memberships, event.team_id) : false

  const setField = (key) => (domEvent) => {
    setSaved(false)
    setFields((current) => ({ ...current, [key]: domEvent.target.value }))
  }

  function setSlot(index, patch) {
    setSaved(false)
    setSlots((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  /**
   * Throws away the 22 and rebuilds them from a lineup. Armed, then confirmed.
   *
   * ⚠️ THIS REPLACES, IT DOES NOT MERGE, AND THAT IS THE WHOLE POINT OF IT. The
   * merge already happened on load, and a merge cannot express "I dropped two
   * players and the lineup is now right" — the dropped pair would survive in the
   * rows the coach had not cleared. Because it is destructive it is the only
   * control on this screen that needs a second tap.
   */
  function refillFromLineup(lineup) {
    setSaved(false)
    setConfirmRefill(null)
    setSlots(slotsFromLineup(namesFromLineup(lineup, squad)))
  }

  /** Links a typed name back to a roster player when it matches one exactly. */
  function nameChanged(index, value) {
    const match = squad.find((player) => player.full_name === value)
    setSlot(index, { full_name: value, player_id: match ? match.id : null })
  }

  const setCard = (index, key) => (domEvent) => {
    setSaved(false)
    const { value } = domEvent.target
    setCardRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  // ── The score, derived from the components ────────────────────────────────
  //
  // ⚠️ WHAT A SQUAD MAY SCORE COMES FROM scoringForTeam, NOT FROM THE SQUAD'S
  // NAME. It reads the club's `teams.scoring_kinds` override and falls back to
  // the age band — and the band is the DIGITS, never the trailing letter, which
  // is gender. src/lib/scoring.js carries the full reasoning.
  //
  // ⚠️ THE SAME THREE THRESHOLDS LIVE IN private.scoring_kinds_for_team, and
  // that duplication is deliberate: the trigger that stores the total and this
  // form that shows it must agree, or a coach sees one number and the database
  // keeps another, both plausible.
  const kinds = scoringForTeam(event?.team)
  const overridden = Array.isArray(event?.team?.scoring_kinds)

  const ourParts = partsFor(score, 'us')
  const theirParts = partsFor(score, 'them')

  // ⚠️ FALLS BACK TO THE FIXTURE'S STORED RESULT WHEN NOTHING IS RECORDED, and
  // that fallback is not tidiness. A result typed by hand before components
  // existed is a real score with no components behind it; showing a blank — or
  // worse, a derived 0 — would present a played match as unplayed. It mirrors
  // the database trigger exactly: no components on a side, leave that side's
  // result alone.
  const ourTotal = hasNoComponents(ourParts) ? event?.result_us ?? null : totalFor(event?.team, ourParts)
  const theirTotal = hasNoComponents(theirParts)
    ? event?.result_them ?? null
    : totalFor(event?.team, theirParts)

  // ⚠️ HOME AND AWAY, NOT US AND THEM. The form has two score pairs and they
  // are positional: playing away puts our score in the RIGHT-hand pair. The
  // columns stay `_us` / `_them` because that is what the rest of the app means
  // by a result (see hasResult and resultScore in eventFormat), so the mapping
  // happens here and nowhere else.
  const weAreHome = event?.home !== false
  const homeScore = weAreHome ? ourTotal : theirTotal
  const homeTries = weAreHome ? ourParts.tries : theirParts.tries
  const awayScore = weAreHome ? theirTotal : ourTotal
  const awayTries = weAreHome ? theirParts.tries : ourParts.tries

  const setComponent = (kind, side) => (domEvent) => {
    setSaved(false)
    setScore((current) => ({ ...current, [`${kind}_${side}`]: domEvent.target.value }))
  }

  // ⚠️ THE SAVED SHEET WINS OVER THE LIVE FIXTURE, and only falls back to it for
  // a draft nobody has saved yet. A filed sheet is a record of what was SENT;
  // if somebody corrects the fixture's league team in March, the sheet RCM
  // already holds must not quietly change to agree with them.
  //
  // ⚠️ AND THERE IS NO SQUAD-NAME FALLBACK. Until 12 Aug 2026 this line ended
  // `?? squadName`, so a fixture with no league team printed "U16B Contact" —
  // the club's internal squad name — into a governing body's TEAM field, on a
  // form that was then photographed and sent. A BLANK box is an obviously
  // unfinished form; a confidently wrong one is not, and nothing warned anybody.
  // This is the same trap `src/lib/ageGroup.js` already carries a note about:
  // the absent value fell through to the LEAST SAFE answer.
  const ourLeagueTeam = sheet ? sheet.league_team : event?.league_team
  const ourName = ourLeagueTeam?.rcm_name ?? ''
  const missingLeagueTeam = !ourName
  const homeName = weAreHome ? ourName : event?.opponent ?? ''
  const awayName = weAreHome ? event?.opponent ?? '' : ourName

  // "24 Jan 26", the form's own format, in club time.
  const formDate = kickOff
    ? kickOff.toLocaleDateString('en-GB', {
        timeZone: 'Asia/Dubai',
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      })
    : ''

  // ⚠️ The COMPETITION line reads from competition_type, which since 12 Aug
  // means `competition` holds the TOURNAMENT name and is null for a league
  // fixture. Reading `competition` alone would leave every league match blank.
  const competitionLine =
    event?.competition_type === 'league'
      ? `League${event.round != null ? ` · Round ${event.round}` : ''}`
      : event?.competition || ''

  const numeric = (value) => {
    const text = String(value ?? '').trim()
    if (text === '') return null
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
  }

  const persist = useCallback(
    async (status) => {
      setSaving(true)
      setSaveError(null)
      try {
        // ⚠️ THE FIXTURE IS WRITTEN FIRST, AND THE ORDER IS THE MITIGATION.
        // This is two writes and not a transaction — the same shape as the
        // pitch allocation, which writes the fixture before it closes the
        // request. A failure after this line leaves the SCORE correct and the
        // sheet unsaved, with the coach still looking at the form and able to
        // press Save again; the other order would leave a filed sheet claiming
        // a result the fixture does not have.
        //
        // ⚠️ ALL EIGHT COLUMNS ARE SENT EVERY TIME, INCLUDING NULLS. Clearing
        // every box on a side is how a coach says "I should not have recorded
        // that", and the trigger's guard then leaves that side's result exactly
        // as it was — it does not zero it. See the migration.
        const componentPatch = { id: eventId }
        for (const side of SIDES) {
          const parts = partsFor(score, side)
          for (const kind of SCORE_KINDS) componentPatch[`${kind}_${side}`] = parts[kind]
        }

        // ⚠️ MERGED INTO THE CURRENT EVENT, NEVER ASSIGNED OVER IT. upsertEvent
        // returns a plain row with no embeds, so `setEvent(saved)` would drop
        // `team` and `league_team` — and `team` is what scoringForTeam reads, so
        // the boxes on screen would silently change to the age-band default the
        // instant somebody pressed Save. Spreading keeps the embeds, because the
        // returned row has no key for them to overwrite.
        //
        // The result_us / result_them coming back are the TRIGGER's, computed
        // server-side from the components just written — which is what makes
        // this the moment the form's total and the stored total are proved equal.
        const savedEvent = await upsertEvent(componentPatch)
        setEvent((current) => ({ ...current, ...savedEvent }))

        const row = await saveMatchSheet({
          ...(sheet?.id ? { id: sheet.id } : { event_id: eventId }),
          // ⚠️ STAMPED FROM THE FIXTURE, NOT TYPED. The TEAM: line must be the
          // league team the fixture actually recorded, or the sheet and the app
          // disagree about who played.
          league_team_id: event?.league_team_id ?? null,
          captain_name: fields.captain_name.trim() || null,
          manager_name: fields.manager_name.trim() || null,
          manager_phone: fields.manager_phone.trim() || null,
          medical_notes: fields.medical_notes.trim() || null,
        })

        await saveMatchSheetSlots(row.id, slots)
        await saveMatchSheetCards(
          row.id,
          cardRows.map((card) => ({
            ...card,
            half: numeric(card.half),
            minute: numeric(card.minute),
            slot: numeric(card.slot),
          })),
        )

        const fresh = status ? await setMatchSheetStatus(row.id, status) : row
        setSheet((current) => ({ ...current, ...fresh, id: row.id }))
        setSaved(true)
        return fresh
      } catch (failure) {
        setSaveError(failure)
        throw failure
      } finally {
        setSaving(false)
      }
    },
    [sheet, eventId, event, fields, score, slots, cardRows],
  )

  /**
   * Renders the sheet to a PNG and hands it to the OS share sheet.
   *
   * ⚠️ THE MECHANISM MOVED TO src/lib/shareImage.js ON 14 Aug 2026, unchanged,
   * because the lineup screen needs the identical thing and two copies of it
   * would drift. The reasoning that used to live here — that `wa.me/?text=`
   * cannot carry a file, that html2canvas is imported lazily because it is a
   * fifth of a megabyte, that a desktop download is the NORMAL route rather than
   * an error, and that an aborted share is somebody changing their mind — is all
   * in that file now. Read it before changing this.
   *
   * ⚠️ RCM's own instruction 2 asks for a "saved file or screen shot/picture of
   * form", which is why this screen shares an IMAGE at all. That part is
   * specific to the match sheet and stays here.
   */
  async function share() {
    setSharing(true)
    setSaveError(null)
    try {
      await shareElementAsImage(printRef.current, {
        filename: `match-sheet-${eventId}.png`,
        title: 'RCM match sheet',
      })
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <Spinner label="Loading the match sheet…" />
      </div>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t open that sheet</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          {error.message || 'Something went wrong.'}
        </p>
        <Button onClick={() => navigate('/schedule')} className="mx-auto mt-4">
          Back to the schedule
        </Button>
      </Card>
    )
  }

  if (!mayEdit) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Match sheet</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Only the coaches and team managers attached to this squad can fill in its match sheet.
        </p>
      </Card>
    )
  }

  // ⚠️ THE ROUTE IS LINKABLE, so the button being hidden on EventDetail is not
  // enough — somebody will paste the URL, and an old bookmark to a U10 fixture
  // is exactly how a coach would land here. Says WHY rather than "not
  // authorised": they are perfectly entitled to edit this squad, there is simply
  // no sheet to file. instruction 1 on the form is "U11 to u16 Games".
  //
  // ⚠️ AFTER the mayEdit gate, deliberately. Somebody with no business on this
  // squad should be told that first — the age of the squad is not their answer.
  if (isMinisTeam(squadName)) {
    return (
      <Card role="alert" data-testid="match-sheet-not-required" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">No match sheet for this age group</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          RCM&rsquo;s result sheet covers U11 and above. {squadName || 'This squad'} plays
          friendlies, so there is nothing to fill in or send.
        </p>
        <Button onClick={() => navigate('/schedule')} className="mx-auto mt-4">
          Back to the schedule
        </Button>
      </Card>
    )
  }

  const complete = sheet?.status === 'complete'
  const overdue = isOverdue(deadline, new Date())

  return (
    <section>
      {/* ── The controls. Never photographed: the sheet is the artefact. ── */}
      <div className="mb-3.5 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Match sheet</h2>
            <p className="text-[13px] font-medium text-ink-muted">
              {fixtureLabel(event, event.league_team, squadName)}
              {deadline ? ` · ${deadlineLabel(deadline)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" disabled={saving} onClick={() => persist(null).catch(() => {})}>
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
            {/* ⚠️ THE BLOCK IS ONE-WAY: it stops a sheet REACHING complete, and
                never stops one being reopened. A sheet marked ready before this
                gate existed must still be fixable, and refusing to reopen it
                would be the app defending its own rule against the person
                trying to obey it. */}
            <Button
              disabled={saving || (missingLeagueTeam && !complete)}
              onClick={() => persist(complete ? 'draft' : 'complete').catch(() => {})}
            >
              {complete ? 'Reopen' : 'Submit'}
            </Button>
            <Button variant="secondary" disabled={sharing} onClick={share}>
              {sharing ? 'Preparing…' : 'Share'}
            </Button>
          </div>
        </div>

        {/* ⚠️ WORDED AS "READY TO SEND", NEVER "SENT". Nothing in this app can
            know whether RCM received anything — submission is a human dropping
            a file into a WhatsApp group. */}
        {complete && (
          <p className="mt-2.5 rounded-[11px] bg-surface-mute px-3 py-2 text-[12.5px] font-semibold text-ink-muted">
            Marked ready to send. Use <strong className="text-ink">Share</strong> to put it in the
            RCM WhatsApp group — the app cannot send it for you.
          </p>
        )}
        {overdue && !complete && (
          <p className="mt-2.5 rounded-[11px] bg-warn-bg px-3 py-2 text-[12.5px] font-semibold text-warn-ink">
            Past the RCM deadline for this age group.
          </p>
        )}
        {/* ⚠️ THIS SAYS WHAT TO DO, NOT JUST WHAT IS WRONG. The fix is on the
            FIXTURE, not on this form — the TEAM line is stamped from the event
            and cannot be typed here, deliberately, so a coach told only "no
            league team" would hunt for a field that does not exist. */}
        {missingLeagueTeam && (
          <p
            role="alert"
            data-testid="match-sheet-no-league-team"
            className="mt-2.5 rounded-[11px] bg-warn-bg px-3 py-2 text-[12.5px] font-semibold text-warn-ink"
          >
            This fixture has no league team, so RCM&rsquo;s <strong>TEAM</strong> box is empty and
            this sheet cannot be marked ready to send. Edit the fixture and pick the side that
            played — {squadName || 'the squad'} is our own name for the squad, not the name RCM
            knows them by.
          </p>
        )}
        {saved && !saveError && (
          <p className="mt-2.5 text-[12.5px] font-semibold text-ink-muted">Saved.</p>
        )}
        {saveError && (
          <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-brand-deep">
            {saveError.message || "That didn't save. Try again."}
          </p>
        )}

        {/* ── SCORE ─────────────────────────────────────────────────────────
            ⚠️ OUTSIDE THE FACSIMILE, DELIBERATELY. RCM's form has exactly two
            boxes per side — FINAL SCORE and TRIES — and putting conversion,
            penalty and drop-goal boxes into the facsimile would photograph as
            a form the governing body did not issue. The components are how the
            score is ENTERED; the form is what gets sent. This block is inside
            the `print:hidden` controls and is never in the image.

            ⚠️ AND IT IS THE ONLY PLACE THE SCORE CAN BE TYPED. The form's two
            boxes below are now derived text, so the total on the sheet cannot
            disagree with the tries and kicks behind it — which was the point
            of the whole exercise. ── */}
        <Card className="mt-3.5 p-3.5" data-testid="match-sheet-score">
          <h3 className="text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Score
          </h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            {squadName || 'This squad'} records {kindSentence(kinds)}.{' '}
            {overridden ? (
              <>Set for this squad on the Club tab.</>
            ) : (
              <>The default for its age group — a club admin can change it on the Club tab.</>
            )}
          </p>

          {/* ⚠️ A TOURNAMENT MAY RUN ITS OWN SCORING, so the sheet SAYS which
              rules it applied rather than leaving a coach to assume. There is
              deliberately no second per-fixture setting: `competition_type`
              already answers league/tournament/neither, and a second axis is a
              second thing that can disagree with it. */}
          {event.competition_type === 'tournament' && (
            <p className="mt-2 rounded-[11px] bg-surface-mute px-3 py-2 text-[12.5px] font-semibold text-ink-muted">
              This is a tournament fixture. If it ran its own scoring, change the squad&rsquo;s
              scoring on the Club tab before entering the score — these boxes are the squad&rsquo;s
              rules, not the tournament&rsquo;s.
            </p>
          )}

          {/* ⚠️ SURFACED, NOT GUESSED. A fixture marked as a tournament while
              its name says "League" is a contradiction that has already been in
              this data, and it is what left a fixture with no league team and a
              wrong TEAM box. Only the coach knows which one they meant. */}
          {event.competition_type === 'tournament' && /league/i.test(event.competition || '') && (
            <p
              role="alert"
              data-testid="match-sheet-competition-clash"
              className="mt-2 rounded-[11px] bg-warn-bg px-3 py-2 text-[12.5px] font-semibold text-warn-ink"
            >
              This fixture is recorded as a <strong>tournament</strong> but is named &ldquo;
              {event.competition}&rdquo;. Check the fixture — one of the two is wrong, and only you
              know which.
            </p>
          )}

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_58px_58px] items-center gap-x-2 gap-y-2">
            <span aria-hidden="true" />
            {/* Named columns, not "us" and "them": the coach is looking at a
                fixture, and a header reading "Them" beside an opponent's name
                is one more thing to translate on a touchline. */}
            <span className="min-w-0 truncate text-center text-[11.5px] font-extrabold uppercase tracking-[.4px] text-ink-muted">
              {ourName || 'Us'}
            </span>
            <span className="min-w-0 truncate text-center text-[11.5px] font-extrabold uppercase tracking-[.4px] text-ink-muted">
              {event.opponent || 'Them'}
            </span>

            {kinds.map((kind) => (
              <Fragment key={kind}>
                <span className="text-[13px] font-bold text-ink">
                  {SCORE_LABELS[kind]}{' '}
                  <span className="font-semibold text-ink-faint">×{SCORE_POINTS[kind]}</span>
                </span>
                {SIDES.map((side) => (
                  <input
                    key={side}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    aria-label={`${SCORE_LABELS[kind]}, ${side === 'us' ? ourName || 'us' : event.opponent || 'them'}`}
                    value={score[`${kind}_${side}`]}
                    onChange={setComponent(kind, side)}
                    className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-1.5 py-2 text-center text-[16px] text-ink outline-none transition focus:border-brand"
                  />
                ))}
              </Fragment>
            ))}

            <span className="text-[13px] font-extrabold text-ink">Final score</span>
            {/* ⚠️ NOT AN INPUT. The total is computed from the components here
                and computed again by the database on write, from the same three
                thresholds. Letting it be typed is exactly how the two would
                come to disagree. */}
            <output className="rounded-[8px] bg-surface-mute py-2 text-center text-[16px] font-extrabold text-ink">
              {ourTotal ?? '—'}
            </output>
            <output className="rounded-[8px] bg-surface-mute py-2 text-center text-[16px] font-extrabold text-ink">
              {theirTotal ?? '—'}
            </output>
          </div>

          {/* ⚠️ A SCORE WITH NO COMPONENTS IS NOT A BUG, and saying so stops the
              next person "fixing" it. Results typed on the fixture before
              components existed still show, and clearing every box leaves them
              alone rather than zeroing them. */}
          {(hasNoComponents(ourParts) || hasNoComponents(theirParts)) &&
            (event.result_us != null || event.result_them != null) && (
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                Part of this score was entered on the fixture itself, without the tries and kicks
                behind it. Filling the boxes above replaces it; leaving them blank keeps it.
              </p>
            )}
        </Card>

        {/* ── SQUAD ─────────────────────────────────────────────────────────
            ⚠️ THE NAMES COME FROM THE LINEUP, and this card is the only place
            that says so. Before 16 Aug 2026 the 22 boxes were blank on every
            sheet and the only help was the typeahead below — which a coach only
            discovers by starting to type a name, on a phone, at the side of a
            pitch. The lineup already holds who played; the sheet was simply
            never asking it.

            ⚠️ ALSO OUTSIDE THE FACSIMILE. Like the Score card, this is how the
            form is FILLED and never part of what is sent. ── */}
        <Card className="mt-3.5 p-3.5" data-testid="match-sheet-squad">
          <h3 className="text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Squad
          </h3>
          {lineups.length === 0 ? (
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
              No team was picked for this fixture, so the 22 below start blank. Pick one on the{' '}
              <button
                type="button"
                className="font-bold text-brand underline"
                onClick={() => navigate(`/lineup/${eventId}`)}
              >
                team sheet
              </button>{' '}
              and it will fill this form in for you next time.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                Blank rows were filled from the team you picked, starters first. Refill to throw
                away what is on the form and take the lineup as it stands now.{' '}
                {/* ⚠️ SAID OUT LOUD, because FR is a SAFETY declaration and a
                    coach who assumes it came across would file a sheet telling
                    a referee nobody can cover the front row. The lineup records
                    positions, not front-row COVER, and the two are different
                    questions. */}
                <strong className="text-ink">The FR ticks are never filled in for you</strong> — a
                lineup records positions, not who can cover the front row.
              </p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {lineups.map((lineup) =>
                  confirmRefill === lineup.id ? (
                    <Fragment key={lineup.id}>
                      <Button variant="danger" onClick={() => refillFromLineup(lineup)}>
                        Yes, replace the 22
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmRefill(null)}>
                        Keep what&rsquo;s there
                      </Button>
                    </Fragment>
                  ) : (
                    <Button
                      key={lineup.id}
                      variant="dangerQuiet"
                      onClick={() => setConfirmRefill(lineup.id)}
                    >
                      {/* A squad can field two teams in a day (a tournament), so
                          the lineup's own label is what tells them apart. */}
                      Refill from {lineup.label ? `“${lineup.label}”` : 'the team sheet'}
                    </Button>
                  ),
                )}
              </div>
            </>
          )}
        </Card>

        {/* ⚠️ AN INSTRUCTION RATHER THAN AN APOLOGY. The form below is a fixed
            860px because it is a facsimile of a piece of paper; see the note on
            the block itself.

            ⚠️ 900px, NOT THE `sm` BREAKPOINT. The obvious `sm:hidden` is wrong
            by 260px: `sm` is 640, and the form needs 860 plus its own border and
            padding — so on every tablet and small laptop between the two the
            hint would vanish while the sideways scroll it explains is still
            there. The number belongs to the form's width, not to a breakpoint
            scale, which is exactly what an arbitrary variant is for. */}
        <p className="mt-3.5 text-[12.5px] font-semibold text-ink-muted min-[900px]:hidden">
          The form below is RCM&rsquo;s, at its real size. Scroll it sideways, or pinch to zoom out
          and see all of it.
        </p>
      </div>

      {/* ── The facsimile. This block is what html2canvas photographs, so
             everything inside it must read as a COMPLETED FORM rather than as
             an editor: hairline grid, square corners, no brand colour beyond
             the red RCM prints, and inputs invisible until you put a caret in
             one. ──

          ⚠️ A FIXED 860px, NOT `max-w`, AND THE SCROLLER AROUND IT IS THE OTHER
          HALF OF THE SAME FIX (16 Aug 2026). Jay shared a sheet from his phone
          and it arrived mangled: "COMPETITION" printed straight over the
          competition's name, HOME TEAM and FINAL SCORE wrapped and clipped.
          Nothing was wrong with the share. The first row of this table is a
          single `colSpan={8}` instruction strip, so `table-fixed` divides the
          width into EIGHT EQUAL COLUMNS — 103px each at desktop, where it is
          perfect, and ~40px each at 375px, where "COMPETITION" is a single
          unbreakable word half again wider than its cell. html2canvas
          photographs what is on the screen, so the phone's broken layout is
          exactly what reached WhatsApp.

          ⚠️ SO THE WIDTH MUST NOT DEPEND ON THE VIEWPORT AT ALL. A governing
          body's form has a shape; there is no responsive version of it, and
          every attempt to make one produces a document RCM did not issue. Jay
          chose fixed-width-and-scroll on 16 Aug over shrink-to-fit. The
          consequence is deliberate: the PNG is identical from a phone and from
          a laptop, because the layout no longer knows the difference.

          ⚠️ THE `overflow-x-auto` WRAPPER IS LOAD-BEARING, not styling. Without
          it an 860px child at 375px makes the DOCUMENT wider than the viewport,
          which is the failure `harness/check-overflow.mjs` exists to catch — and
          it does not clip politely, it breaks the masthead and every fixed
          element on the page. Run `npm run check:overflow` after touching this.
          ── */}
      <div className="overflow-x-auto">
        <div
          ref={printRef}
          data-testid="match-sheet-facsimile"
          className="mx-auto w-[860px] border border-black bg-white p-3 text-black"
        >
          <header className="mb-2 text-center">
            <h1 className="text-[15px] font-bold leading-tight text-rcm">
              Rugby Club Management (RCM)- OFFICIAL MATCH RESULT SHEET
            </h1>
            <p className="text-[13px] font-bold text-rcm">(to be filled in be each team)</p>
          </header>

          {/* CLUB and TEAM share a line, labels red. TEAM is the LEAGUE team —
              the field that made this project depend on Project 1. */}
          <div className="mb-1.5 flex flex-wrap gap-x-12 gap-y-1 text-[13px]">
            <span>
              <strong className="text-rcm">CLUB:</strong> AD Harlequins
            </span>
            <span>
              <strong className="text-rcm">TEAM:</strong> {ourName}
            </span>
          </div>

          <table className="w-full table-fixed border-collapse text-[11.5px]">
            <tbody>
              <tr>
                <td colSpan={8} className={`${CELL} font-bold uppercase leading-tight`}>
                  Please complete on phone or laptop with full name of all squad memebers as per
                  registration and identify front row replacements with a &ldquo;✓&rdquo; in the FR
                  column;
                </td>
              </tr>
              <tr>
                <th className={`${CELL} text-left`}>HOME TEAM</th>
                <td className={CELL} colSpan={3}>{homeName}</td>
                <th className={`${CELL} text-center`}>vs</th>
                <th className={`${CELL} text-left`}>AWAY TEAM</th>
                <td className={CELL} colSpan={2}>{awayName}</td>
              </tr>
              {/* ⚠️ DERIVED, NOT TYPED — since 12 Aug 2026. These four boxes were
                  free text and are now read out of the fixture's components, via
                  the same totalFor() the database mirrors. The entry boxes are in
                  the Score card above, which is never photographed. A coach who
                  could type here could file a sheet whose FINAL SCORE did not
                  match its own TRIES, and nothing would have said so.

                  ⚠️ THE PAIRS ARE POSITIONAL — HOME then AWAY, never us and them.
                  An away fixture puts our score in the right-hand pair. */}
              <tr>
                <th className={`${CELL} text-left`}>FINAL SCORE</th>
                <td className={CELL} data-testid="sheet-home-score">{homeScore ?? ''}</td>
                <th className={`${CELL} text-left`}>TRIES</th>
                <td className={CELL} data-testid="sheet-home-tries">{homeTries ?? ''}</td>
                {/* ⚠️ THE AWAY TRIES HAD NO BOX UNTIL 16 Aug 2026, and the two
                    halves of this row were not the same shape. The number was
                    printed INSIDE the "TRIES" heading cell — "TRIES 5" — while
                    the eighth column went to an empty spacer sitting mid-row.
                    On a governing body's form that reads as a label somebody
                    scribbled on, not as a filled-in box, and the home side one
                    cell to the left did it properly. Eight cells, four pairs,
                    both sides identical. */}
                <th className={`${CELL} text-left`}>FINAL SCORE</th>
                <td className={CELL} data-testid="sheet-away-score">{awayScore ?? ''}</td>
                <th className={`${CELL} text-left`}>TRIES</th>
                <td className={CELL} data-testid="sheet-away-tries">{awayTries ?? ''}</td>
              </tr>
              <tr>
                <th className={`${CELL} text-left`}>DATE</th>
                <td className={CELL}>{formDate}</td>
                <th className={`${CELL} text-left`}>VENUE</th>
                <td className={CELL} colSpan={3}>{event.venue || ''}</td>
                <th className={`${CELL} text-left`}>KICK OFF TIME</th>
                <td className={CELL}>{eventTimeLabel(event)}</td>
              </tr>
              <tr>
                <th className={`${CELL} text-left`}>COMPETITION</th>
                <td className={CELL} colSpan={7}>{competitionLine}</td>
              </tr>
            </tbody>
          </table>

          {/* ── The 22, in TWO COLUMNS: 1-12 left, 13-22 right, each with FR. ── */}
          <datalist id="squad-players">
            {squad.map((player) => (
              <option key={player.id} value={player.full_name} />
            ))}
          </datalist>
          <table className="mt-1.5 w-full table-fixed border-collapse text-[11.5px]">
            <tbody>
              <tr>
                <th className={`${CELL} w-[26px]`} />
                <th className={`${CELL} text-left`}>TEAM NAME:</th>
                <th className={`${CELL} w-[34px] text-center`}>FR</th>
                <th className={`${CELL} w-[26px]`} />
                <th className={`${CELL} text-left`}>
                  TEAM CAPTAIN:{' '}
                  <Cell
                    list="squad-players"
                    aria-label="Team captain"
                    value={fields.captain_name}
                    onChange={setField('captain_name')}
                  />
                </th>
                <th className={`${CELL} w-[34px] text-center`}>FR</th>
              </tr>
              {LEFT_COLUMN.map((left) => {
                const right = left + LEFT_COLUMN.length
                return (
                  <tr key={left}>
                    <SlotCells slots={slots} index={left - 1} onName={nameChanged} onSet={setSlot} />
                    {right <= SLOT_COUNT ? (
                      <SlotCells slots={slots} index={right - 1} onName={nameChanged} onSet={setSlot} />
                    ) : (
                      <>
                        <td className={CELL} />
                        <td className={CELL} />
                        <td className={CELL} />
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Discipline. Own team only, as the form says. ── */}
          <table className="mt-1.5 w-full table-fixed border-collapse text-[11.5px]">
            <tbody>
              <tr>
                <td colSpan={6} className={`${CELL} text-center font-bold`}>
                  DISCIPLINE – RED OR YELLOW CARDS (Players of your team only; please include timings
                  &amp; half)
                </td>
              </tr>
              <tr>
                <th className={`${CELL} w-[56px]`}>HALF</th>
                <th className={`${CELL} w-[56px]`}>TIME</th>
                <th className={`${CELL} w-[48px]`}>R/Y</th>
                <th className={`${CELL} w-[44px]`}>NO</th>
                <th className={CELL}>FULL NAME</th>
                <th className={CELL}>REASON</th>
              </tr>
              {cardRows.map((card, index) => (
                <tr key={index}>
                  <td className={CELL}>
                    <Cell aria-label={`Card ${index + 1} half`} value={card.half} onChange={setCard(index, 'half')} />
                  </td>
                  <td className={CELL}>
                    <Cell aria-label={`Card ${index + 1} time`} value={card.minute} onChange={setCard(index, 'minute')} />
                  </td>
                  <td className={CELL}>
                    {/* ⚠️ A SELECT, not free text: the column is R or Y, and the
                        colour CHECK constraint accepts nothing else. A typed "yel"
                        would fail the save with a constraint error on a field
                        somebody thought they had filled in correctly. */}
                    <select
                      aria-label={`Card ${index + 1} colour`}
                      value={card.colour}
                      onChange={setCard(index, 'colour')}
                      className="w-full bg-transparent text-[11.5px] outline-none"
                    >
                      <option value="" />
                      <option value="yellow">Y</option>
                      <option value="red">R</option>
                    </select>
                  </td>
                  <td className={CELL}>
                    <Cell aria-label={`Card ${index + 1} number`} value={card.slot} onChange={setCard(index, 'slot')} />
                  </td>
                  <td className={CELL}>
                    <Cell
                      list="squad-players"
                      aria-label={`Card ${index + 1} name`}
                      value={card.full_name}
                      onChange={setCard(index, 'full_name')}
                    />
                  </td>
                  <td className={CELL}>
                    <Cell aria-label={`Card ${index + 1} reason`} value={card.reason} onChange={setCard(index, 'reason')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Medical. ── */}
          <table className="mt-1.5 w-full border-collapse text-[11.5px]">
            <tbody>
              <tr>
                <td className={`${CELL} font-bold uppercase leading-tight`}>
                  Medical issues (concussion &amp; serious injury of your team) or any other medical
                  items of note:
                </td>
              </tr>
              <tr>
                <td className={CELL}>
                  <textarea
                    aria-label="Medical notes"
                    rows={3}
                    value={fields.medical_notes}
                    onChange={setField('medical_notes')}
                    className="w-full resize-none bg-transparent text-[11.5px] outline-none"
                  />
                </td>
              </tr>
            </tbody>
          </table>

          {/* ── Manager. The form marks the signature optional. ── */}
          <table className="mt-1.5 w-full border-collapse text-[11.5px]">
            <tbody>
              <tr>
                <td className={`${CELL} font-bold underline`}>Team Manager/Coach details</td>
              </tr>
              <tr>
                <td className={CELL}>
                  <span className="font-bold">NAME:</span>{' '}
                  <Cell
                    aria-label="Team manager"
                    value={fields.manager_name}
                    onChange={setField('manager_name')}
                  />
                </td>
              </tr>
              {/* ⚠️ PHONE IS NOT ON RCM'S PAPER FORM — it is an addition Jay asked
                  for on 12 Aug 2026, so that whoever receives the sheet can reach
                  the person who filed it. Kept in the same footer block and in the
                  same hand as NAME, because it is part of the same answer to
                  "who filled this in", and a stray field elsewhere on a governing
                  body's form reads as a mistake. */}
              <tr>
                <td className={CELL}>
                  <span className="font-bold">PHONE:</span>{' '}
                  <Cell
                    aria-label="Team manager phone"
                    type="tel"
                    value={fields.manager_phone}
                    onChange={setField('manager_phone')}
                  />
                </td>
              </tr>
              <tr>
                <td className={`${CELL} py-5`}>
                  <span className="font-bold">SIGNATURE:</span>{' '}
                  <span className="text-[10px]">(optional)</span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* ⚠️ THE INSTRUCTIONS ARE REPRODUCED, NOT SUMMARISED. They are the
              authority for the deadline rule, and item 5 is the authority for
              this sheet not applying to the senior competitions at all. */}
          <div className="mt-2 text-[10.5px] leading-snug">
            <p className="font-bold">Instructions:</p>
            <ol className="ml-5 list-decimal">
              <li>All teams to complete this form, per game they play.</li>
              <li>
                All completed forms need to be submitted to RCM through their RCC/CLUB Whatsapp
                group. (Can be saved file or screen shot/picture of form).
              </li>
              <li>
                U11 to u16 Games, QR, Contact, Boys and Girls need to submitted within 24hours of
                completion of game.
              </li>
              <li>U18 Boys &amp; Girls, WXV, W7s need to be submitted 1hour in advance of Kick Off.</li>
              <li>WAP, DIV1, DIV2 Games are completed on sportslive app.</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
