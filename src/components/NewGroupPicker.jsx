import { useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import Spinner from './Spinner.jsx'
import { Avatar, RolePill } from './NewChatPicker.jsx'
import { addGroupMembers, createGroup, listGroupCandidates } from '../data/messages.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// "New group" — the pencil's second option (claude/plans/2026-08-24-group-chats.md).
// A MULTI-select over group_candidates(): the same audience rule as DMs with
// the minor arm removed — the 24 Aug ruling, decided in the database, not here.
// ⚠️ NO SAFEGUARDING COPY ANYWHERE IN THIS COMPONENT — Jay's ruling, recorded
// in claude/decisions/2026-08-24-groups-open-no-warnings.md. The >=3 floor is
// the database's rule; the disabled button below is only its reflection.
//
// `mode="add"` reuses the whole picker inside an existing group's ⋯ menu:
// no name field, and the button adds to `conversationId` instead of creating.

const STAFF = new Set(['admin', 'coach', 'manager', 'medic'])

/**
 * @param mode           'create' (default) or 'add'
 * @param conversationId required when mode='add'
 * @param onCreated      (conversationId) => void — fires after create OR add
 * @param onClose        () => void
 * @param loadCandidates () => Promise<candidates> — injected so tests can stub it
 * @param create         (title, memberIds) => Promise<conversationId> — injected
 * @param add            (conversationId, memberIds) => Promise<void> — injected
 */
export default function NewGroupPicker({
  mode = 'create',
  conversationId = null,
  onCreated,
  onClose,
  loadCandidates = listGroupCandidates,
  create = createGroup,
  add = addGroupMembers,
}) {
  const adding = mode === 'add'
  const [candidates, setCandidates] = useState(null)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    loadCandidates()
      .then((rows) => mounted && setCandidates(rows))
      .catch(() => mounted && setCandidates([]))
    return () => {
      mounted = false
    }
  }, [loadCandidates])

  const byId = useMemo(() => new Map((candidates ?? []).map((p) => [p.profile_id, p])), [candidates])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = (candidates ?? []).filter((p) => !q || p.full_name.toLowerCase().includes(q))
    const map = new Map()
    for (const p of rows) {
      const key = p.via_team ?? 'Club staff'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return [...map.entries()]
  }, [candidates, query])

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Create needs a name and two others (you are the third); Add needs one pick.
  const ready = adding ? selected.size >= 1 : name.trim().length > 0 && selected.size >= 2

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      if (adding) {
        await add(conversationId, [...selected])
        onCreated(conversationId)
      } else {
        onCreated(await create(name.trim(), [...selected]))
      }
    } catch (err) {
      setError(friendlyMessage(err, 'Could not save the group just now.'))
      setBusy(false)
    }
  }

  return (
    <Card className="mb-3 overflow-hidden" data-testid="group-picker">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
          {adding ? 'Add people' : 'New group'}
        </p>
        <button type="button" onClick={onClose} className="text-[12px] font-bold text-ink-muted hover:text-ink">
          Close
        </button>
      </div>

      {!adding && (
        <div className="border-b border-line px-3 py-2">
          <label className="sr-only" htmlFor="group-name">
            Group name
          </label>
          <input
            id="group-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            maxLength={80}
            autoFocus
            className="h-[38px] w-full rounded-[12px] border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
          />
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
          {[...selected].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="flex items-center gap-1.5 rounded-pill bg-brand-deep py-1 pl-2.5 pr-1.5 text-[12px] font-bold text-ink-invert"
            >
              {byId.get(id)?.full_name ?? '?'}
              <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded-full bg-white/25 text-[10px]">
                ✕
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="border-b border-line px-3 py-2">
        <label className="sr-only" htmlFor="group-search">
          Search people
        </label>
        <input
          id="group-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="h-[36px] w-full rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
        />
      </div>

      {candidates === null ? (
        <div className="py-6">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-muted">
          {query ? 'Nobody matches that.' : 'Nobody yet — the people in your squads appear here once they have joined.'}
        </p>
      ) : (
        groups.map(([group, people]) => (
          <div key={group}>
            <p className="bg-surface-mute px-4 py-1 text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">{group}</p>
            <ul>
              {people.map((p) => (
                <li key={p.profile_id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggle(p.profile_id)}
                    aria-pressed={selected.has(p.profile_id)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-mute"
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border text-[11px] font-bold ${
                        selected.has(p.profile_id)
                          ? 'border-brand-deep bg-brand-deep text-ink-invert'
                          : 'border-line bg-surface-card'
                      }`}
                    >
                      {selected.has(p.profile_id) ? '✓' : ''}
                    </span>
                    <Avatar name={p.full_name} staff={STAFF.has(p.role)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-ink">{p.full_name}</span>
                    <RolePill role={p.role} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {error && (
        <p role="alert" className="border-t border-line px-4 py-2 text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}

      <div className="border-t border-line p-3">
        <Button type="button" full disabled={!ready || busy} onClick={submit}>
          {adding ? `Add · ${selected.size}` : `Create group · ${selected.size + 1} people`}
        </Button>
      </div>

      <p className="border-t border-line bg-surface-mute px-4 py-2 text-[11.5px] text-ink-muted">
        Only people from your squads appear here.
      </p>
    </Card>
  )
}
