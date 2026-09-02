import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import { listPitchRequests, requestPitch, withdrawRequest } from '../data/pitchRequests.js'
import { PITCH_TBD } from '../data/pitches.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// "Request a pitch", and the tracking that follows it, on the event sheet.
//
// ⚠️ SELF-CONTAINED ON PURPOSE — it loads and writes its own request rather
// than taking an `onRequest` handler from the screen above. EventDetail
// rendered a DEAD availability button for weeks because Schedule passed the
// handler and the Dashboard did not, and the optional call swallowed every
// tap. A component with no handler to forget cannot be wired up wrongly by the
// next screen that renders it.
//
// ⚠️ THIS IS THE ONLY PLACE A DECLINE IS VISIBLE. Jay ruled that a declined
// request must NOT change the fixture — it keeps `Pitch TBD`, which still
// reads as "not allocated yet". So if this component does not show the
// decline and its reason, the coach has no way of learning they were told no.
// That is why it renders for a decided request too, not only an open one.

const STATUS_TEXT = {
  submitted: 'Waiting for a pitch',
  allocated: 'Pitch allocated',
  declined: 'No pitch available',
}

const STATUS_TONE = {
  submitted: 'bg-surface-mute text-ink-muted',
  allocated: 'bg-danger-bg text-danger-ink',
  declined: 'bg-warn-bg text-warn-ink',
}

export default function PitchRequest({ event, canEdit }) {
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [note, setNote] = useState('')
  const [needsReferee, setNeedsReferee] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    listPitchRequests()
      .then((rows) => {
        if (!mounted) return
        setRequest(rows.find((row) => row.event_id === event.id) ?? null)
      })
      // ⚠️ A failed read is NOT an error state here. This is a small block at
      // the bottom of a sheet whose main job is showing a fixture; refusing to
      // render the sheet because the request table was unreachable would be a
      // worse outcome than not offering the button.
      .catch(() => {
        if (mounted) setRequest(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [event.id])

  // A fixture that already has a real pitch has nothing to ask for.
  const allocatedAlready = Boolean((event.pitch ?? '').trim()) && event.pitch !== PITCH_TBD

  // ⚠️ AN AWAY MATCH IS PLAYED ON SOMEBODY ELSE'S GROUND, so there is no pitch
  // of ours to ask for (Jay, 14 Aug 2026). Offering the button put a request
  // into the allocator's queue for a fixture the club is not hosting.
  //
  // ⚠️ STRICT `=== false`, NOT `!event.home`. The column is nullable and a NULL
  // means "nobody said", not "away" — the dashboard hero already follows this
  // rule and renders no home/away chip for a null rather than claiming Away.
  // `!event.home` would additionally swallow every training and social, whose
  // `home` is written NULL by EventForm, and those DO need a pitch. Getting this
  // wrong hides the button from the majority of the fixtures that want it.
  const isAwayMatch = event.type === 'match' && event.home === false

  if (loading) return null
  // ⚠️ `isAway` JOINS THE *NO REQUEST* BRANCH DELIBERATELY, rather than becoming
  // a blanket early return. A fixture switched to Away AFTER a request was
  // submitted must still show that request and its Withdraw button — otherwise
  // the coach cannot take it back and the allocator is left holding a request
  // for a match nobody is hosting, with nothing on screen pointing at it. Same
  // reasoning as the decided-request case in this file's header: what is
  // suppressed is the OFFER, never the record of one already made.
  if (!request && (!canEdit || allocatedAlready || isAwayMatch)) return null

  async function run(work) {
    setBusy(true)
    setError(null)
    try {
      const next = await work()
      setRequest(next)
      setOpening(false)
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        Pitch
      </h4>

      {request ? (
        <div data-testid="pitch-request-status">
          <span
            className={`inline-block rounded-pill px-3 py-1 text-[12.5px] font-bold ${
              STATUS_TONE[request.status] ?? 'bg-surface-mute text-ink-muted'
            }`}
          >
            {STATUS_TEXT[request.status] ?? request.status}
          </span>

          {request.needs_referee && (
            <span className="ml-2 inline-block rounded-pill bg-surface-mute px-3 py-1 text-[12.5px] font-bold text-ink-muted">
              Referee asked for
            </span>
          )}

          {request.note && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
              You said: {request.note}
            </p>
          )}

          {/* ⚠️ THE REASON IS THE POINT OF A DECLINE. "No pitch available" with
              nothing after it leaves a coach with nothing to act on. */}
          {request.status === 'declined' && request.decision_note && (
            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-warn-ink">
              {request.decision_note}
            </p>
          )}

          {request.status === 'submitted' && canEdit && (
            <div className="mt-2.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(async () => {
                  await withdrawRequest(request.id)
                  return null
                })}
              >
                {busy ? 'Withdrawing…' : 'Withdraw request'}
              </Button>
            </div>
          )}
        </div>
      ) : opening ? (
        <div>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
              Anything they should know
            </span>
            <textarea
              rows={2}
              aria-label="Anything they should know"
              value={note}
              disabled={busy}
              onChange={(domEvent) => setNote(domEvent.target.value)}
              placeholder="We can play early if that helps"
              className="w-full resize-y rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
            />
          </label>

          <label className="mt-2 flex items-center gap-2 text-sm font-bold text-ink">
            <input
              type="checkbox"
              checked={needsReferee}
              disabled={busy}
              onChange={(domEvent) => setNeedsReferee(domEvent.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            This match needs a referee
          </label>

          <div className="mt-2.5 flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(() =>
                  requestPitch({ eventId: event.id, needsReferee, note }),
                )
              }
            >
              {busy ? 'Sending…' : 'Send request'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setOpening(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" full onClick={() => setOpening(true)}>
          Request a pitch
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
          {friendlyMessage(error, "That didn't send. Try again.")}
        </p>
      )}
    </div>
  )
}
