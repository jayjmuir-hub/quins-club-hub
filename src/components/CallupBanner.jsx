import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './Card.jsx'
import { listCallups } from '../data/callups.js'
import { useMemberships } from '../lib/memberships.jsx'

// A line on Home when a call-up is waiting for THIS family's answer —
// claude/plans/2026-09-02-senior-squads.md Part 3, built 4 Sep 2026. Costs
// nothing when it does not apply: it renders null for anyone with no open
// request for their own child, and fails silently to null.

export default function CallupBanner() {
  const { memberships } = useMemberships()
  const [waiting, setWaiting] = useState([])

  const mine = new Set((memberships ?? []).filter((m) => m.player_id && ['parent', 'player'].includes(m.role)).map((m) => m.player_id))

  useEffect(() => {
    if (mine.size === 0) return undefined
    let mounted = true
    listCallups()
      .then((rows) => mounted && setWaiting(rows.filter((r) => r.status === 'requested' && mine.has(r.player_id))))
      .catch(() => mounted && setWaiting([]))
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships])

  if (waiting.length === 0) return null
  const first = waiting[0]
  return (
    <Card data-testid="callup-banner" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="text-sm font-bold text-ink">
        {first.senior?.name} would like to call up {first.players?.full_name}
        {waiting.length > 1 ? ` — and ${waiting.length - 1} more` : ''}
      </p>
      <Link to="/callups" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
        Say yes or no
      </Link>
    </Card>
  )
}
