import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Spinner from '../components/Spinner.jsx'
import { listClubMembers } from '../data/members.js'
import { addClubOfficer, listClubOfficers, removeClubOfficer } from '../data/officers.js'
import { OFFICER_TITLES } from '../lib/identity.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'

// /admin/officers — the club's committee list, super admins only
// (claude/plans/2026-08-26-club-officers.md). Jay: "no special rights with
// those, just titles" — a row here changes what RENDERS (the identity
// badges, the person card, the You card), never what a policy answers.
//
// The super-only shape is the rights-log pattern: the TAB hides via
// portals.js's superOnly, this screen repeats the check because a route is
// linkable, and club_officers' RLS is what actually decides. The check here
// is a "you were not given this job" message, not security.

function NotForYou() {
  return (
    <Card role="alert" className="p-6 text-center">
      <h3 className="text-base font-extrabold text-danger-ink">Not authorised</h3>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
        Club officers are appointed by super admins only. The titles carry no
        access — they are the club&rsquo;s committee list, shown wherever a
        person&rsquo;s name appears.
      </p>
    </Card>
  )
}

export default function AdminOfficers() {
  const { memberships } = useMemberships()
  const viewerIsSuper = isSuperAdmin(memberships)
  const clubId = memberships?.find((m) => m.club_id)?.club_id ?? null

  const [officers, setOfficers] = useState(null)
  const [people, setPeople] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  // One pending pick per title block: title → profile_id.
  const [picks, setPicks] = useState({})

  const load = useCallback(async () => {
    setError(null)
    try {
      setOfficers(await listClubOfficers())
    } catch (err) {
      setError(err.message || 'We could not load the officers just now.')
    }
    // The picker's people — every adult account the admin can already read.
    // Decoration for the ADD control only; a failure leaves remove working.
    try {
      const rows = await listClubMembers()
      const byId = new Map()
      for (const m of rows ?? []) {
        if (!m.profile_id || !m.profiles?.full_name) continue
        if (!byId.has(m.profile_id)) byId.set(m.profile_id, m.profiles.full_name)
      }
      setPeople([...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setPeople([])
    }
  }, [])

  useEffect(() => {
    if (viewerIsSuper) load()
  }, [viewerIsSuper, load])

  const byTitle = useMemo(() => {
    const map = new Map()
    for (const o of officers ?? []) {
      const list = map.get(o.title) ?? []
      list.push(o)
      map.set(o.title, list)
    }
    return map
  }, [officers])

  if (!viewerIsSuper) return <NotForYou />

  async function appoint(title) {
    const profileId = picks[title]
    if (!profileId || saving) return
    setSaving(true)
    setError(null)
    try {
      await addClubOfficer(clubId, profileId, title)
      setPicks((p) => ({ ...p, [title]: '' }))
      await load()
    } catch (err) {
      setError(err.message || 'Could not appoint them.')
    } finally {
      setSaving(false)
    }
  }

  async function unappoint(id) {
    setError(null)
    try {
      await removeClubOfficer(id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not remove that.')
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-base font-extrabold text-ink">Club officers</h3>
      <p className="mb-3 max-w-[64ch] text-sm text-ink-muted">
        Titles only — appointing someone here changes nothing about what they
        can do in Club Hub. The badge appears wherever their name does, and
        they see it on their own profile too.
      </p>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {officers === null && !error ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          {OFFICER_TITLES.map((title) => {
            const holders = byTitle.get(title) ?? []
            return (
              <div key={title} data-testid="officer-title" className="border-b border-line px-4 py-3 last:border-0">
                <h4 className="text-[13px] font-extrabold text-ink">{title}</h4>
                {holders.length === 0 && (
                  <p className="mt-1 text-[12.5px] text-ink-muted">Nobody appointed.</p>
                )}
                <ul>
                  {holders.map((o) => (
                    <li key={o.id} data-testid="officer-holder" className="mt-1.5 flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                        {o.profile?.full_name ?? 'Unknown account'}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => unappoint(o.id)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  <label className="sr-only" htmlFor={`appoint-${title}`}>
                    Appoint {title}
                  </label>
                  <select
                    id={`appoint-${title}`}
                    value={picks[title] ?? ''}
                    onChange={(e) => setPicks((p) => ({ ...p, [title]: e.target.value }))}
                    className="h-[32px] min-w-0 flex-1 rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
                  >
                    <option value="">Choose a person…</option>
                    {people
                      .filter((person) => !holders.some((o) => o.profile_id === person.id))
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" disabled={!picks[title] || saving} onClick={() => appoint(title)}>
                    Appoint
                  </Button>
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
