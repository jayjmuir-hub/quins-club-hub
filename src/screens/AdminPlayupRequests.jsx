import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { decidePlayupRequest, listPlayupRequests } from '../data/playups.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Thin super-admin inbox for play-up requests (slice 2). Club Ops hybrid C
// is slice 3 and is not this screen.

export default function AdminPlayupRequests() {
  const { memberships } = useMemberships()
  const superAdmin = isSuperAdmin(memberships)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [notes, setNotes] = useState({})
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!superAdmin) {
      setLoading(false)
      setRows([])
      return undefined
    }
    let mounted = true
    setLoading(true)
    listPlayupRequests()
      .then((data) => mounted && setRows(data ?? []))
      .catch((err) => mounted && setError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [superAdmin, reloadToken])

  async function decide(id, yes) {
    setBusyId(id)
    setError(null)
    try {
      await decidePlayupRequest(id, yes, notes[id] ?? '')
      setReloadToken((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
    }
  }

  if (!superAdmin) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-danger-ink">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
          Only a super admin can approve or decline play-up requests.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading play-up requests…" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-3 text-lg font-extrabold text-ink">Play-up requests</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Approve adds the guest and starts parent consent. Decline closes the
        request and tells the person who asked.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, 'Those requests could not be updated.')}
        </p>
      )}
      {rows.length === 0 ? (
        <Card>
          <Empty message="No open play-up requests." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card className="p-4" data-testid="playup-request-row">
                <p className="text-sm font-bold text-ink">{row.players?.full_name}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {row.home?.name} → {row.guest?.name}
                  {row.kind === 'home_nominate' ? ' · Nominated' : ' · Requested'}
                </p>
                {row.note && <p className="mt-2 text-sm text-ink">{row.note}</p>}
                <label className="mt-3 block text-sm">
                  <span className="mb-1 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
                    Note to the requester
                  </span>
                  <textarea
                    aria-label="Note to the requester"
                    value={notes[row.id] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    rows={2}
                    className="w-full rounded-[10px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busyId === row.id} onClick={() => decide(row.id, true)}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="dangerQuiet"
                    disabled={busyId === row.id}
                    onClick={() => decide(row.id, false)}
                  >
                    Decline
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}