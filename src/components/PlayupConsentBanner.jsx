import { useEffect, useState } from 'react'
import Card from './Card.jsx'
import Button from './Button.jsx'
import Sheet from './Sheet.jsx'
import { answerJuniorPlayup, listMyPendingPlayups } from '../data/playups.js'
import { useMemberships } from '../lib/memberships.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// Sticky Home card when a junior play-up is waiting for THIS family's
// answer. Null for everyone else. Slice 1 of
// claude/plans/2026-09-05-playup-consent-and-ops.md.

export default function PlayupConsentBanner() {
  const { memberships } = useMemberships()
  const [waiting, setWaiting] = useState([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const mine = (memberships ?? []).some(
    (m) => m.player_id && ['parent', 'player'].includes(m.role),
  )

  useEffect(() => {
    if (!mine) return undefined
    let mounted = true
    listMyPendingPlayups()
      .then((rows) => mounted && setWaiting(rows ?? []))
      .catch(() => mounted && setWaiting([]))
    return () => {
      mounted = false
    }
  }, [memberships, mine])

  if (!mine || waiting.length === 0) return null
  const first = waiting[0]
  const childName = first.players?.full_name ?? 'your child'
  const squadName = first.teams?.name ?? 'another age group'

  async function decide(yes) {
    setBusy(true)
    setError(null)
    try {
      await answerJuniorPlayup(first.player_id, first.team_id, yes)
      setWaiting((rows) => rows.filter((row) => row !== first))
      setSheetOpen(false)
    } catch (failure) {
      setError(friendlyMessage(failure, 'That answer could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card data-testid="playup-consent-banner" className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm font-bold text-ink">
          {squadName} would like {childName} to play up
          {waiting.length > 1 ? ` — and ${waiting.length - 1} more` : ''}
        </p>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline"
        >
          Say yes or no
        </button>
      </Card>
      <Sheet open={sheetOpen} onClose={() => !busy && setSheetOpen(false)} title="Play-up consent">
        <p className="mb-3 text-sm text-ink-muted">
          {squadName} has added {childName} as a guest. They can train and use that
          squad&apos;s chat now. They cannot be picked for a match until you agree.
          There is no time limit.
        </p>
        {error && (
          <p role="alert" className="mb-3 text-sm font-semibold text-danger-ink">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => decide(true)}>
            Yes, they can play
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => decide(false)}>
            Not this time
          </Button>
        </div>
      </Sheet>
    </>
  )
}
