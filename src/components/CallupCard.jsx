import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { BlockTitle } from './Editorial.jsx'
import { listCallupCandidates, requestCallup } from '../data/callups.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// "U18 players you can call up" — on a SENIOR squad's Squad Hub, for its
// staff. claude/plans/2026-09-02-senior-squads.md Part 3, built 4 Sep 2026.
//
// ⚠️ THE LIST COMES FROM callup_candidates AND SHOWS ONLY WHAT IT RETURNS:
// name, home squad, state. No birthday, no contact, nobody under the floor
// — those never leave the database. A refusal (not this squad's staff)
// renders nothing rather than an error, because the card sits on a screen
// other people can open.

const STATE = {
  consent_needed: { label: 'Consent needed', action: 'Ask the family' },
  consent_given: { label: 'Consent given', action: 'Add to squad' },
  requested: { label: 'Asked — waiting', action: null },
  refused: { label: 'Declined recently', action: null },
  in_squad: { label: 'In this squad', action: null },
}

export default function CallupCard({ team }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!team?.id || !team?.is_senior) return undefined
    let mounted = true
    listCallupCandidates(team.id)
      .then((data) => mounted && setRows(data))
      .catch(() => mounted && setRows(null))
    return () => {
      mounted = false
    }
  }, [team?.id, team?.is_senior, reloadToken])

  if (!team?.is_senior || rows == null) return null

  async function ask(playerId) {
    setBusy(playerId)
    setError(null)
    try {
      await requestCallup(playerId, team.id)
      setReloadToken((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-4" data-testid="callup-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <BlockTitle>U18 players you can call up</BlockTitle>
        <Link to="/callups" className="shrink-0 text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
          Call-ups
        </Link>
      </div>
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-muted">Nobody in the U18s is old enough yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => {
              const s = STATE[row.state] ?? { label: row.state, action: null }
              return (
                <li key={row.player_id} data-testid="callup-candidate" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{row.full_name}</p>
                    <p className="text-xs text-ink-muted">{row.home_team} · {s.label}</p>
                  </div>
                  {s.action && (
                    <Button size="sm" variant="secondary" disabled={busy === row.player_id} onClick={() => ask(row.player_id)}>
                      {s.action}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className="m-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
            {friendlyMessage(error, "We couldn't ask for that call-up.")}
          </p>
        )}
        <p className="px-4 py-2 text-xs text-ink-faint">The family says yes or no; the U18 staff are told. Consent lasts the season.</p>
      </Card>
    </section>
  )
}
