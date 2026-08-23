import { useEffect, useMemo, useState } from 'react'
import Card from './Card.jsx'
import Spinner from './Spinner.jsx'
import { initials } from '../lib/playerFormat.js'
import { labelForRole } from '../lib/scope.js'

// "New chat" — the pencil on the Chats list. A people picker over
// dm_candidates(): only the people the database lets this person message.
// Who that is, is not decided here (private.can_dm). Grouped by the squad
// they share with you, with a search box, because a club is a long list.
//
// ⚠️ INITIALS, NEVER A PHOTO. No child's face is ever in a chat.

const STAFF = new Set(['admin', 'coach', 'manager', 'medic'])

export function Avatar({ name, staff, size = 'md' }) {
  const dims = size === 'lg' ? 'h-11 w-11 text-[13px]' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-[12px]'
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-extrabold text-ink-invert ${dims} ${
        staff ? 'bg-monogram-coach' : 'bg-monogram-manager'
      }`}
    >
      {initials(name ?? '?')}
    </span>
  )
}

export function RolePill({ role }) {
  if (!STAFF.has(role)) return null
  return (
    <span className="rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
      {labelForRole(role) ?? role}
    </span>
  )
}

/**
 * @param load   () => Promise<candidates>  — listDmCandidates, injected so the harness can stub it
 * @param onPick (person) => void
 * @param onClose () => void
 */
export default function NewChatPicker({ load, onPick, onClose }) {
  const [candidates, setCandidates] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let mounted = true
    load()
      .then((rows) => mounted && setCandidates(rows))
      .catch(() => mounted && setCandidates([]))
    return () => {
      mounted = false
    }
  }, [load])

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

  return (
    <Card className="mb-3 overflow-hidden" data-testid="dm-picker">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-extrabold uppercase tracking-[.5px] text-ink-muted">New chat</p>
        <button type="button" onClick={onClose} className="text-[12px] font-bold text-ink-muted hover:text-ink">
          Close
        </button>
      </div>
      <div className="border-b border-line px-3 py-2">
        <label className="sr-only" htmlFor="new-chat-search">
          Search people
        </label>
        <input
          id="new-chat-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          autoFocus
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
                    onClick={() => onPick(p)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-mute"
                  >
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
      {/* ⚠️ THE LINE THAT EXPLAINS THE LIST. Other families in other squads
          are not an omission; the squad channel is for them. */}
      <p className="border-t border-line bg-surface-mute px-4 py-2 text-[11.5px] text-ink-muted">
        Only people you share a squad with, and the club&rsquo;s staff. For anyone else, use the squad channel.
      </p>
    </Card>
  )
}
