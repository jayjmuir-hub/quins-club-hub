import { useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { upsertEvent } from '../data/events.js'
import { clubDateTimeInputs, clubWallTimeToUtc, eventDate } from '../lib/eventFormat.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// One GAME inside a tournament — a fixture that hangs off the container by
// tournament_id, sharing its date, squad, venue, competition and tier so none
// of that is retyped on the day. Jay, 29 Aug 2026: "per game everything"
// (opponent, kick-off, stage, score, its own team sheet). The team sheet is
// reached from the game's own detail screen, exactly as a standalone match's
// is — a game is an ordinary event with a parent. See
// claude/plans/2026-08-29-tournaments-as-containers.md.
//
// ⚠️ NOT A REUSE OF EventForm. That form is shaped for a top-level entry —
// Type, availability, date, venue, pitch, repeats, multi-squad. A game inherits
// almost all of that from its tournament and asks only the four things that
// differ per game, so a bespoke, small form is honest about what changes rather
// than hiding ten inherited fields.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const FIELD = 'mb-3.5'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

function scoreValue(raw) {
  const trimmed = String(raw).trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isInteger(n) && n >= 0 ? n : NaN
}

export default function AddGameForm({ tournament, game = null, onClose, onSaved }) {
  const editing = Boolean(game?.id)
  // The game runs on the tournament's day; only the time differs. clubDateTimeInputs
  // gives the club-day date string, which every game shares.
  const { date: tournamentDate } = clubDateTimeInputs(eventDate(tournament))

  const [values, setValues] = useState(() => {
    const existing = game ? clubDateTimeInputs(eventDate(game)) : { time: '' }
    return {
      opponent: game?.opponent ?? '',
      time: existing.time ?? '',
      stage: game?.stage ?? '',
      resultUs: game?.result_us != null ? String(game.result_us) : '',
      resultThem: game?.result_them != null ? String(game.result_them) : '',
    }
  })
  const [invalid, setInvalid] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)

  const set = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }))

  async function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (inFlight.current) return

    const us = scoreValue(values.resultUs)
    const them = scoreValue(values.resultThem)
    const nextInvalid = {
      // A game is a fixture against one side, so unlike its container it DOES
      // want an opponent — that is the whole point of recording the game.
      opponent: !values.opponent.trim(),
      time: !values.time,
      // A score is optional (the draw may not be played yet), but a half score
      // or a non-number is not — both or neither, and only whole counts.
      score: Number.isNaN(us) || Number.isNaN(them) || (us == null) !== (them == null),
    }
    setInvalid(nextInvalid)
    if (Object.values(nextInvalid).some(Boolean)) {
      setError(
        new Error(
          nextInvalid.score && !nextInvalid.opponent && !nextInvalid.time
            ? 'Enter both scores, or leave both blank.'
            : 'Fill in the highlighted fields.',
        ),
      )
      return
    }

    const starts_at = clubWallTimeToUtc(tournamentDate, values.time)

    // Everything the game inherits from its tournament is taken from the
    // container here, never re-entered — so a venue or squad change on the
    // tournament is not silently contradicted by a game that kept the old one.
    const payload = {
      ...(editing ? { id: game.id } : {}),
      club_id: tournament.club_id,
      team_id: tournament.team_id,
      tournament_id: tournament.id,
      type: 'match',
      competition_type: 'tournament',
      competition: tournament.competition ?? null,
      tier: tournament.tier ?? null,
      venue: tournament.venue ?? null,
      pitch: tournament.pitch ?? null,
      // A 7s tournament is a 7s day — every game inherits the container's
      // format rather than asking again per game.
      format: tournament.format ?? null,
      opponent: values.opponent.trim(),
      // ⚠️ HOME IS NULL FOR A TOURNAMENT GAME. A festival is played at one
      // neutral host; home/away is a fact about a standalone fixture, not a
      // game within a tournament, and the container already writes it null.
      home: null,
      stage: values.stage.trim() || null,
      starts_at,
      // ⚠️ NO ends_at. A game is short and is never a top-level calendar entry
      // (tournament_id is set, so the feed filters it out), so the per-fixture
      // end time the feed needs does not apply. The tournament carries the day's
      // finish; a game carries only its kick-off.
      ends_at: null,
      time_tbd: false,
      result_us: us ?? null,
      result_them: them ?? null,
    }

    setSaving(true)
    inFlight.current = true
    setError(null)
    try {
      await upsertEvent(payload)
      onSaved?.()
      onClose?.()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
      inFlight.current = false
    }
  }

  return (
    <Sheet open onClose={onClose} title={editing ? 'Edit game' : 'Add game'}>
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <p role="alert" className="mb-3.5 rounded-[9px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
            {friendlyMessage(error, "We couldn't add that game. Try again.")}
          </p>
        )}

        <div className={FIELD}>
          <label className={LABEL} htmlFor="game-opponent">
            Opponent
          </label>
          <input
            id="game-opponent"
            type="text"
            value={values.opponent}
            onChange={set('opponent')}
            aria-invalid={invalid.opponent ? 'true' : undefined}
            placeholder="e.g. Dubai Exiles"
            className={INPUT}
          />
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="game-time">
            Kick-off
          </label>
          <input
            id="game-time"
            type="time"
            value={values.time}
            onChange={set('time')}
            aria-invalid={invalid.time ? 'true' : undefined}
            className={INPUT}
          />
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            On {tournament.competition || 'the tournament'}&apos;s day. Abu Dhabi time.
          </p>
        </div>

        <div className={FIELD}>
          <label className={LABEL} htmlFor="game-stage">
            Stage <span className="font-semibold normal-case tracking-normal text-ink-faint">(optional)</span>
          </label>
          <input
            id="game-stage"
            type="text"
            value={values.stage}
            onChange={set('stage')}
            placeholder="e.g. Pool A, Semi-final"
            className={INPUT}
          />
        </div>

        <div className="mb-3.5 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="game-us">
              Quins score
            </label>
            <input
              id="game-us"
              type="number"
              inputMode="numeric"
              min="0"
              value={values.resultUs}
              onChange={set('resultUs')}
              aria-invalid={invalid.score ? 'true' : undefined}
              placeholder="—"
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="game-them">
              Opponent score
            </label>
            <input
              id="game-them"
              type="number"
              inputMode="numeric"
              min="0"
              value={values.resultThem}
              onChange={set('resultThem')}
              aria-invalid={invalid.score ? 'true' : undefined}
              placeholder="—"
              className={INPUT}
            />
          </div>
        </div>
        <p className="mb-4 -mt-1.5 text-[12.5px] text-ink-muted">
          Leave the scores blank until the game is played. The full team sheet is
          on the game once it&apos;s saved.
        </p>

        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save game' : 'Add game'}
        </Button>
      </form>
    </Sheet>
  )
}
