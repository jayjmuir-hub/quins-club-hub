import { useEffect, useMemo, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listIdeas, markIdea, removeIdea, signIdeaPhoto } from '../data/socialIdeas.js'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, visibleTeams } from '../lib/scope.js'
import { eventDate, formatTime } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'

// The post-idea inbox. Any member submits; the manager marks and removes.
// Ruling: claude/decisions/2026-08-12-social-media-management.md.
//
// ⚠️ THE `media` RIGHT GATES THIS SCREEN; `is_admin` GATES THE DATA. Both are
// true at once and they are not the same statement — an admin without the
// right can still read every row through the API, and that is deliberate,
// because a right that withheld data would be a security boundary drawn in a
// menu. Do not "tighten" the policy to match the screen.
//
// ⚠️ REMOVE IS ARMED, NOT INSTANT. It is the only irreversible action here and
// the only real control over a photo that should not have been sent, so it
// uses the two-variant destructive cluster this app already has: dangerQuiet
// arms it, danger confirms.

const FILTERS = [
  { key: 'new', label: 'New' },
  { key: 'used', label: 'Used' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
]

export default function SocialIdeas() {
  const { memberships, teams } = useMemberships()
  const [rows, setRows] = useState([])
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('new')
  const [busyId, setBusyId] = useState(null)
  const [arming, setArming] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  const mayManage = hasAdminRight(memberships, 'media')
  const squadsById = useMemo(
    () => new Map(visibleTeams(memberships, teams).map((team) => [team.id, team])),
    [memberships, teams],
  )

  useEffect(() => {
    if (!mayManage) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)

    listIdeas(filter === 'all' ? {} : { status: filter })
      .then(async (found) => {
        if (!mounted) return
        setRows(found)
        // ⚠️ SIGNED URLS ARE NOT STORED, ONLY HELD. They expire, so a stored
        // one is a stored thing that stops working — the same rule
        // src/data/photos.js states for player photos.
        const signed = {}
        for (const row of found) {
          if (row.photo_path) signed[row.id] = await signIdeaPhoto(row.photo_path)
        }
        if (mounted) setPhotos(signed)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setRows([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [mayManage, filter, reloadToken])

  async function act(fn, id) {
    setBusyId(id)
    setActionError(null)
    try {
      await fn()
      setArming(null)
      setReloadToken((token) => token + 1)
    } catch (err) {
      setActionError(err.message || 'That did not work. Try again.')
    } finally {
      setBusyId(null)
    }
  }

  if (!mayManage) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Social Media Management</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Social Media Management hasn&apos;t been added to your account. A super admin can
          add it on the Accounts screen.
        </p>
      </Card>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <Spinner label="Loading ideas…" />
      </div>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the ideas</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          {error.message || 'Something went wrong. Try again.'}
        </p>
        <Button onClick={() => setReloadToken((token) => token + 1)} className="mx-auto mt-4">
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => { setFilter(option.key); setArming(null) }}
            aria-pressed={filter === option.key}
            className={[
              'rounded-[8px] border-[1.5px] px-3 py-1.5 text-[12.5px] font-bold transition',
              filter === option.key
                ? 'border-brand bg-surface-mute text-brand-deep'
                : 'border-line text-ink hover:border-brand hover:text-brand',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {actionError && (
        <Card role="alert" className="mb-3 p-4">
          <p className="text-sm font-medium text-brand-deep">{actionError}</p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <Empty message="Nothing here." />
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((idea) => {
            const squad = squadsById.get(idea.events?.team_id)
            const busy = busyId === idea.id
            return (
              <Card key={idea.id} data-testid="idea-row" className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[14px] font-bold text-ink">
                      {idea.profiles?.full_name || 'A member'}
                    </span>
                    {/* ⚠️ COMPUTED IN THE DATABASE FROM THE SUBMITTER'S OWN
                        MEMBERSHIP, never sent by the browser. */}
                    {idea.from_staff && (
                      <span
                        data-testid="idea-staff-mark"
                        className="ml-2 rounded-[8px] bg-surface-mute px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[.4px] text-ink-muted"
                      >
                        Staff
                      </span>
                    )}
                    <span className="ml-2 text-[12px] text-ink-muted">
                      {new Date(idea.created_at).toLocaleDateString(undefined, {
                        timeZone: 'Asia/Dubai',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  {idea.status !== 'new' && (
                    <span
                      data-testid="idea-status"
                      className="rounded-[8px] bg-surface-mute px-2 py-1 text-[11.5px] font-extrabold uppercase tracking-[.4px] text-ink-muted"
                    >
                      {idea.status}
                    </span>
                  )}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                  {idea.body}
                </p>

                {idea.events && (
                  <p className="mt-1.5 text-[12.5px] text-ink-muted">
                    About:{' '}
                    {fixtureLabel(idea.events, idea.events.league_team, squad?.name ?? 'Squad')}
                    {idea.events.opponent ? ` v ${idea.events.opponent}` : ''}
                    {' · '}
                    {eventDate(idea.events).toLocaleDateString(undefined, {
                      timeZone: 'Asia/Dubai',
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' · '}
                    {formatTime(eventDate(idea.events))}
                  </p>
                )}

                {photos[idea.id] && (
                  <img
                    src={photos[idea.id]}
                    alt=""
                    data-testid="idea-photo"
                    className="mt-3 max-h-64 rounded-[11px] border border-line object-contain"
                  />
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {idea.status !== 'used' && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => act(() => markIdea(idea.id, 'used'), idea.id)}
                    >
                      Mark used
                    </Button>
                  )}
                  {idea.status !== 'dismissed' && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => act(() => markIdea(idea.id, 'dismissed'), idea.id)}
                    >
                      Dismiss
                    </Button>
                  )}

                  {arming === idea.id ? (
                    <>
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => act(() => removeIdea(idea), idea.id)}
                      >
                        Really remove
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => setArming(null)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="dangerQuiet"
                      disabled={busy}
                      onClick={() => { setArming(idea.id); setActionError(null) }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
