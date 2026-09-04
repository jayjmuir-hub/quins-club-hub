import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { BlockTitle } from '../components/Editorial.jsx'
import { answerCallup, endCallup, listCallups } from '../data/callups.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Call-ups — claude/plans/2026-09-02-senior-squads.md Part 3, built 4 Sep 2026.
//
// One screen, three seats, decided by RLS and the RPCs rather than here:
//   the FAMILY sees a request for their child and says yes or no;
//   the SENIOR squad's staff see their asks and can end an active call-up;
//   the HOME squad's staff see everything about their players — inform only,
//   no button (Jay: "inform only, no veto").
// What is offered is derived from memberships; what is allowed is the
// database's decision, and a refused call shows its message.

const STATUS = {
  requested: { label: 'Waiting for the family', tone: 'bg-warn-bg text-warn-ink' },
  consented: { label: 'Called up', tone: 'bg-accent-bg text-accent-ink' },
  refused: { label: 'Declined', tone: 'bg-surface-mute text-ink-muted' },
  removed: { label: 'Ended', tone: 'bg-surface-mute text-ink-muted' },
}

export default function Callups() {
  const { memberships } = useMemberships()
  const admin = isAdmin(memberships)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    listCallups()
      .then((data) => mounted && setRows(data))
      .catch((err) => mounted && setError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [reloadToken])

  // The family: a membership carrying this player's id.
  const isFamilyOf = (playerId) =>
    (memberships ?? []).some((m) => m.player_id === playerId && ['parent', 'player'].includes(m.role))

  async function act(id, fn) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      setReloadToken((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading call-ups…" />
      </div>
    )
  }

  const open = rows.filter((r) => r.status === 'requested')
  const rest = rows.filter((r) => r.status !== 'requested')

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-[22px] font-extrabold tracking-tight text-ink">Call-ups</h1>
      {error && (
        <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, "We couldn't do that.")}
        </p>
      )}
      {rows.length === 0 ? (
        <Empty message="No call-ups yet. A senior squad's staff ask from their Squad Hub; the family answers here." />
      ) : (
        <>
          {open.length > 0 && (
            <section className="mb-5">
              <BlockTitle>Waiting for an answer</BlockTitle>
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {open.map((r) => (
                    <li key={r.id} data-testid="callup-open" className="px-4 py-3">
                      <p className="text-sm font-bold text-ink">
                        {r.senior?.name} would like to call up {r.players?.full_name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        From {r.home?.name} · asked {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </p>
                      {isFamilyOf(r.player_id) ? (
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, () => answerCallup(r.id, true))}>
                            Yes, they can play
                          </Button>
                          <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => act(r.id, () => answerCallup(r.id, false))}>
                            Not this time
                          </Button>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-ink-faint">The family decides. You are told what they say.</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
          {rest.length > 0 && (
            <section className="mb-5">
              <BlockTitle>Decided</BlockTitle>
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {rest.map((r) => {
                    const s = STATUS[r.status] ?? { label: r.status, tone: '' }
                    const mayEnd = r.status === 'consented' && (admin || canEditTeam(memberships, r.senior_team_id))
                    return (
                      <li key={r.id} data-testid="callup-decided" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-ink">
                            {r.players?.full_name} · {r.senior?.name}
                          </p>
                          <p className="text-xs text-ink-muted">From {r.home?.name}</p>
                        </div>
                        <span className={`rounded-[7px] px-1.5 py-0.5 text-[11px] font-bold ${s.tone}`}>{s.label}</span>
                        {mayEnd && (
                          <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => act(r.id, () => endCallup(r.id))}>
                            End call-up
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
      <p className="text-xs text-ink-faint">
        A called-up player keeps everything they had in their home squad. Ending a call-up removes only the senior squad.{' '}
        <Link to="/seniors" className="font-bold text-brand-ink underline-offset-2 hover:underline">Senior section</Link>
      </p>
    </div>
  )
}
