import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import Spinner from './Spinner.jsx'
import { channelMembers } from '../data/messages.js'

// WHO IS IN THIS CHANNEL — the WhatsApp gesture (tap the header, see the
// people), for every channel kind (claude/plans/2026-08-30-role-channels.md).
// Because a role channel's membership is DERIVED, each row can say WHY the
// person is in it ("Head coach — U10 Mixed", "Admin — chat access"), which a
// hand-ticked group never could.
//
// ⚠️ WHO MAY LOOK IS THE DATABASE'S DECISION. public.channel_members re-checks
// the channel's own read rule and refuses an outsider; this sheet just shows
// its answer or its refusal. The screens additionally only OFFER the sheet on
// channels the person is already reading.
//
// ⚠️ TAP A MEMBER → START A DM. Whether that DM is ALLOWED stays
// open_conversation's call — the same contract every other DM door honours
// (minors, blocks). `onOpenDm(profileId)` is the hook's openDmWith, so the
// refusal message is the database's words.

export default function ChannelMembersSheet({ open, onClose, channel, teamId = null, selfId, onOpenDm }) {
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    let stale = false
    setMembers(null)
    setError(null)
    setQuery('')
    channelMembers(channel, teamId)
      .then((rows) => {
        if (stale) return
        setMembers([...rows].sort((a, b) => a.full_name.localeCompare(b.full_name)))
      })
      .catch((err) => !stale && setError(err.message || 'Could not load the member list.'))
    return () => {
      stale = true
    }
  }, [open, channel, teamId])

  if (!open) return null

  const q = query.trim().toLowerCase()
  const shown = (members ?? []).filter(
    (m) => !q || m.full_name.toLowerCase().includes(q) || (m.reason ?? '').toLowerCase().includes(q),
  )

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 desktop:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Channel members"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card className="flex max-h-[80dvh] w-full max-w-[480px] flex-col rounded-b-none p-0 desktop:rounded-[16px]" data-testid="channel-members-sheet">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h3 className="text-[15px] font-extrabold text-ink">
            Members{members ? ` · ${members.length}` : ''}
          </h3>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        {(members?.length ?? 0) > 8 && (
          <div className="border-b border-line px-4 py-2">
            <label className="sr-only" htmlFor="member-search">
              Search members
            </label>
            <input
              id="member-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members"
              className="w-full rounded-[10px] border border-line bg-surface-card px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {error ? (
            <p role="alert" className="px-2 py-3 text-[13px] font-semibold text-danger-ink">
              {error}
            </p>
          ) : members === null ? (
            <div role="status" className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : shown.length === 0 ? (
            <p className="px-2 py-3 text-[13px] text-ink-faint">Nobody matches that.</p>
          ) : (
            <ul>
              {shown.map((m) => {
                const isSelf = m.profile_id === selfId
                return (
                  <li key={m.profile_id}>
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => {
                        if (isSelf) return
                        onClose()
                        onOpenDm?.(m.profile_id)
                      }}
                      className="flex w-full items-baseline justify-between gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 truncate text-[14.5px] font-bold text-ink">
                        {m.full_name}
                        {isSelf ? ' (you)' : ''}
                      </span>
                      {m.reason && (
                        <span className="shrink-0 text-[12px] font-semibold text-ink-muted">{m.reason}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-ink-faint">
          Tap someone to start a direct message.
        </p>
      </Card>
    </div>
  )
}
