import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Spinner from '../components/Spinner.jsx'
import { getEvent } from '../data/events.js'
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
import { canEditTeam } from '../lib/scope.js'
import { eventDate, formatTime } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { deadlineLabel, isOverdue, matchSheetDeadline } from '../lib/matchSheetDeadline.js'

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

  const [event, setEvent] = useState(null)
  const [squad, setSquad] = useState([])
  const [sheet, setSheet] = useState(null)
  const [slots, setSlots] = useState(emptySlots)
  const [cardRows, setCardRows] = useState(emptyCards)
  const [fields, setFields] = useState({
    captain_name: '',
    manager_name: '',
    score_us: '',
    tries_us: '',
    score_them: '',
    tries_them: '',
    medical_notes: '',
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [sharing, setSharing] = useState(false)
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

        // ⚠️ SCOPED TO THE FIXTURE'S SQUAD. A club-wide roster on this form
        // would let a coach file a player from another age group, which the
        // governing body receives as a wrong team sheet rather than an obvious
        // slip — the same reasoning listLeagueTeams' teamId argument carries.
        const [players, existing] = await Promise.all([
          listPlayers({ teamIds: [row.team_id] }).catch(() => []),
          getMatchSheet(eventId),
        ])
        if (!mounted) return

        setSquad(players)
        if (existing) {
          setSheet(existing)
          setSlots(slotsFrom(existing.slots))
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
            score_us: existing.score_us ?? '',
            tries_us: existing.tries_us ?? '',
            score_them: existing.score_them ?? '',
            tries_them: existing.tries_them ?? '',
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

  // ⚠️ HOME AND AWAY, NOT US AND THEM. The form has two score pairs and they
  // are positional: playing away puts our score in the RIGHT-hand pair. The
  // columns stay `score_us` / `score_them` because that is what the rest of the
  // app means by a result (see hasResult and resultScore in eventFormat), so
  // the mapping happens here and nowhere else.
  const weAreHome = event?.home !== false
  const homeScore = weAreHome ? fields.score_us : fields.score_them
  const homeTries = weAreHome ? fields.tries_us : fields.tries_them
  const awayScore = weAreHome ? fields.score_them : fields.score_us
  const awayTries = weAreHome ? fields.tries_them : fields.tries_us

  const setScore = (side, what) => (domEvent) => {
    const ours = (side === 'home') === weAreHome
    const key = `${what}_${ours ? 'us' : 'them'}`
    setSaved(false)
    setFields((current) => ({ ...current, [key]: domEvent.target.value }))
  }

  const ourName = event?.league_team?.rcm_name ?? squadName
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
        const row = await saveMatchSheet({
          ...(sheet?.id ? { id: sheet.id } : { event_id: eventId }),
          // ⚠️ STAMPED FROM THE FIXTURE, NOT TYPED. The TEAM: line must be the
          // league team the fixture actually recorded, or the sheet and the app
          // disagree about who played.
          league_team_id: event?.league_team_id ?? null,
          captain_name: fields.captain_name.trim() || null,
          manager_name: fields.manager_name.trim() || null,
          score_us: numeric(fields.score_us),
          tries_us: numeric(fields.tries_us),
          score_them: numeric(fields.score_them),
          tries_them: numeric(fields.tries_them),
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
    [sheet, eventId, event, fields, slots, cardRows],
  )

  /**
   * Renders the sheet to a PNG and hands it to the OS share sheet.
   *
   * ⚠️ WHATSAPP CANNOT BE SENT A FILE BY A LINK. `wa.me/?text=` carries text
   * only, and RCM's own instruction 2 asks for a "saved file or screen
   * shot/picture of form" — so a one-click share has to PRODUCE a file. Jay
   * accepted the ~194KB html2canvas dependency for exactly this, 12 Aug 2026,
   * overturning the plan's "no new dependency" line.
   *
   * ⚠️ IMPORTED LAZILY. It is a fifth of a megabyte used by one button on one
   * screen; a static import would put it in the bundle every parent downloads
   * to look at a fixture list.
   *
   * ⚠️ DESKTOP BROWSERS LARGELY CANNOT FILE-SHARE, so the download fallback is
   * not an error path — it is the normal desktop route.
   */
  async function share() {
    setSharing(true)
    setSaveError(null)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(printRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('The sheet could not be turned into an image.')

      const file = new File([blob], `match-sheet-${eventId}.png`, { type: 'image/png' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'RCM match sheet' })
        return
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      URL.revokeObjectURL(url)
    } catch (failure) {
      // ⚠️ An ABORTED share is the person changing their mind, not a failure.
      if (failure?.name !== 'AbortError') setSaveError(failure)
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
            <Button
              disabled={saving}
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
        {saved && !saveError && (
          <p className="mt-2.5 text-[12.5px] font-semibold text-ink-muted">Saved.</p>
        )}
        {saveError && (
          <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-brand-deep">
            {saveError.message || "That didn't save. Try again."}
          </p>
        )}
      </div>

      {/* ── The facsimile. This block is what html2canvas photographs, so
             everything inside it must read as a COMPLETED FORM rather than as
             an editor: hairline grid, square corners, no brand colour beyond
             the red RCM prints, and inputs invisible until you put a caret in
             one. ── */}
      <div
        ref={printRef}
        data-testid="match-sheet-facsimile"
        className="mx-auto max-w-[860px] border border-black bg-white p-3 text-black"
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
            <tr>
              <th className={`${CELL} text-left`}>FINAL SCORE</th>
              <td className={CELL}>
                <Cell aria-label="Home final score" value={homeScore} onChange={setScore('home', 'score')} />
              </td>
              <th className={`${CELL} text-left`}>TRIES</th>
              <td className={CELL}>
                <Cell aria-label="Home tries" value={homeTries} onChange={setScore('home', 'tries')} />
              </td>
              <td className={CELL} />
              <th className={`${CELL} text-left`}>FINAL SCORE</th>
              <td className={CELL}>
                <Cell aria-label="Away final score" value={awayScore} onChange={setScore('away', 'score')} />
              </td>
              <th className={`${CELL} text-left`}>
                TRIES{' '}
                <Cell aria-label="Away tries" value={awayTries} onChange={setScore('away', 'tries')} />
              </th>
            </tr>
            <tr>
              <th className={`${CELL} text-left`}>DATE</th>
              <td className={CELL}>{formDate}</td>
              <th className={`${CELL} text-left`}>VENUE</th>
              <td className={CELL} colSpan={3}>{event.venue || ''}</td>
              <th className={`${CELL} text-left`}>KICK OFF TIME</th>
              <td className={CELL}>{formatTime(kickOff)}</td>
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
    </section>
  )
}
