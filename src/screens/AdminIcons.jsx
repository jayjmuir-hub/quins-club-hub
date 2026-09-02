import { useCallback, useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Spinner from '../components/Spinner.jsx'
import { listClubMembers } from '../data/members.js'
import { grantIcon, listIconGrants, revokeIcon, setPrimaryIcon } from '../data/profileIcons.js'
import { ICON_LIBRARY, iconEmoji, iconMeaning } from '../lib/profileIcons.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// /admin/icons — recognition emoji, super admins only
// (claude/plans/2026-08-31-profile-icons.md). Jay's idea: crown the U11
// staff. A grant here changes what RENDERS beside a name in chat and on the
// person card, never what a policy answers.
//
// The super-only shape is AdminOfficers' pattern: the door hides via
// portals.js's superOnly, this screen repeats the check because a route is
// linkable, and profile_icons' RLS is what actually decides.

function NotForYou() {
  return (
    <Card role="alert" className="p-6 text-center">
      <h3 className="text-base font-extrabold text-danger-ink">Not authorised</h3>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
        Profile icons are handed out by super admins only. They carry no
        access — just recognition, shown beside a person&rsquo;s name.
      </p>
    </Card>
  )
}

export default function AdminIcons() {
  const { memberships, teams } = useMemberships()
  const viewerIsSuper = isSuperAdmin(memberships)
  const clubId = memberships?.find((mm) => mm.club_id)?.club_id ?? null

  const [grants, setGrants] = useState(null)
  const [people, setPeople] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [icon, setIcon] = useState('')
  const [teamId, setTeamId] = useState('')
  const [profileId, setProfileId] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setError(null)
    try {
      setGrants(await listIconGrants())
    } catch (err) {
      setError(friendlyMessage(err, 'We could not load the grants just now.'))
    }
    // The person picker — decoration for the ADD control only, a failure
    // leaves revoke working (AdminOfficers' stance).
    try {
      const rows = await listClubMembers()
      const byId = new Map()
      for (const mm of rows ?? []) {
        if (!mm.profile_id || !mm.profiles?.full_name) continue
        if (!byId.has(mm.profile_id)) byId.set(mm.profile_id, mm.profiles.full_name)
      }
      setPeople([...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      setPeople([])
    }
  }, [])

  useEffect(() => {
    if (viewerIsSuper) load()
  }, [viewerIsSuper, load])

  if (!viewerIsSuper) return <NotForYou />

  // Exactly one target — both picked is the shape the database refuses, so
  // the button refuses it first.
  const oneTarget = (teamId !== '') !== (profileId !== '')
  const ready = icon !== '' && oneTarget && !saving

  async function grant() {
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      await grantIcon({
        clubId,
        teamId: teamId || null,
        profileId: profileId || null,
        icon,
        reason: reason.trim(),
      })
      setIcon('')
      setTeamId('')
      setProfileId('')
      setReason('')
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not grant that.'))
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id) {
    setError(null)
    try {
      await revokeIcon(id)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not revoke that.'))
    }
  }

  async function makePrimary(id) {
    setError(null)
    try {
      await setPrimaryIcon(id)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not make that the primary.'))
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-base font-extrabold text-ink">Profile icons</h3>
      <p className="mb-3 max-w-[64ch] text-sm text-ink-muted">
        Recognition, not access. Pin an icon to a whole squad&rsquo;s staff —
        it follows whoever holds the job — or to one person. It shows beside
        their name in chat, and a tap on their card says why.
      </p>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      <Card className="mb-3 px-4 py-3">
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-extrabold text-ink" htmlFor="icon-pick">
            Icon
          </label>
          <select
            id="icon-pick"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-[36px] rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
          >
            <option value="">Choose an icon…</option>
            {ICON_LIBRARY.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.emoji} {entry.name} — {entry.meaning}
              </option>
            ))}
          </select>

          <label className="text-[13px] font-extrabold text-ink" htmlFor="icon-team">
            A squad&rsquo;s staff
          </label>
          <select
            id="icon-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="h-[36px] rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
          >
            <option value="">Not a squad grant</option>
            {(teams ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label className="text-[13px] font-extrabold text-ink" htmlFor="icon-person">
            A person
          </label>
          <select
            id="icon-person"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="h-[36px] rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
          >
            <option value="">Not a person grant</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>

          <label className="text-[13px] font-extrabold text-ink" htmlFor="icon-reason">
            Why (optional)
          </label>
          <input
            id="icon-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Shown when someone taps the icon"
            className="h-[36px] rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink placeholder:text-ink-faint"
          />

          <div>
            <Button size="sm" disabled={!ready} onClick={grant}>
              Grant
            </Button>
          </div>
        </div>
      </Card>

      {grants === null && !error ? (
        <Spinner />
      ) : grants.length === 0 ? (
        <p className="text-[13px] text-ink-muted">Nothing granted yet — the crown awaits.</p>
      ) : (
        <Card className="overflow-hidden">
          {grants.map((g) => (
            <div key={g.id} data-testid="icon-grant" className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="text-[20px]" aria-hidden="true">
                {iconEmoji(g.icon) ?? '·'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">
                  {g.team_id ? `${g.teams?.name ?? 'Squad'} staff` : g.profiles?.full_name ?? 'Unknown account'}
                  {g.is_primary ? ' · primary' : ''}
                </p>
                <p className="truncate text-[12.5px] text-ink-muted">{g.reason ?? iconMeaning(g.icon) ?? g.icon}</p>
              </div>
              {!g.is_primary && (
                <Button size="sm" variant="ghost" onClick={() => makePrimary(g.id)}>
                  Make primary
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => revoke(g.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
