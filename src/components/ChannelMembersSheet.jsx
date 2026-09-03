import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import Spinner from './Spinner.jsx'
import { channelMembers } from '../data/messages.js'
import { listChannelSeats, seatInChannel, unseatFromChannel } from '../data/channelSeats.js'
import { listClubMembers } from '../data/members.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { isRoleChannel } from '../lib/roleChannels.js'

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
//
// SEATS (3 Sep 2026, claude/plans/2026-09-03-channel-seats-and-committee.md):
// on a ROLE channel a SUPER sees "Seat someone" — a person plus a required
// reason — and an Unseat control on rows that are seats. Derived rows carry
// no control: the sheet explains them, it does not edit them, and there is
// deliberately no way to exclude a derived member. `canSeat` is the client's
// mirror of `seats write super`; RLS refuses anyone else regardless.

export default function ChannelMembersSheet({
  open,
  onClose,
  channel,
  teamId = null,
  selfId,
  onOpenDm,
  canSeat = false,
  clubId = null,
}) {
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  // Seats: seat rows for this channel (id ↔ profile), the picker's people,
  // and the pending pick. Loaded only when a super is looking at a role
  // channel — decoration for the seating controls, never for the list.
  const [seats, setSeats] = useState([])
  const [people, setPeople] = useState([])
  const [pick, setPick] = useState('')
  const [reason, setReason] = useState('')
  const [seatError, setSeatError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const seatable = canSeat && isRoleChannel(channel)

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
      .catch((err) => !stale && setError(friendlyMessage(err, 'Could not load the member list.')))
    if (seatable) {
      listChannelSeats(channel)
        .then((rows) => !stale && setSeats(rows))
        .catch(() => !stale && setSeats([]))
      listClubMembers()
        .then((rows) => {
          if (stale) return
          const byId = new Map()
          for (const m of rows ?? []) {
            if (!m.profile_id || !m.profiles?.full_name) continue
            if (!byId.has(m.profile_id)) byId.set(m.profile_id, m.profiles.full_name)
          }
          setPeople([...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
        })
        .catch(() => !stale && setPeople([]))
    }
    return () => {
      stale = true
    }
  }, [open, channel, teamId, seatable, reloadToken])

  if (!open) return null

  const seatByProfile = new Map(seats.map((s) => [s.profile_id, s]))
  const memberIds = new Set((members ?? []).map((m) => m.profile_id))

  async function seat() {
    if (!pick || saving) return
    setSaving(true)
    setSeatError(null)
    try {
      await seatInChannel({ clubId, profileId: pick, channel, reason })
      setPick('')
      setReason('')
      setReloadToken((t) => t + 1)
    } catch (err) {
      setSeatError(friendlyMessage(err, 'Could not seat them.'))
    } finally {
      setSaving(false)
    }
  }

  async function unseat(seatId) {
    if (saving) return
    setSaving(true)
    setSeatError(null)
    try {
      await unseatFromChannel(seatId)
      setReloadToken((t) => t + 1)
    } catch (err) {
      setSeatError(friendlyMessage(err, 'Could not remove that seat.'))
    } finally {
      setSaving(false)
    }
  }

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
                const seatRow = seatable ? seatByProfile.get(m.profile_id) : null
                return (
                  <li key={m.profile_id} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => {
                        if (isSelf) return
                        onClose()
                        onOpenDm?.(m.profile_id)
                      }}
                      className="flex min-w-0 flex-1 items-baseline justify-between gap-3 rounded-[10px] px-2 py-2.5 text-left hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span className="min-w-0 truncate text-[14.5px] font-bold text-ink">
                        {m.full_name}
                        {isSelf ? ' (you)' : ''}
                      </span>
                      {m.reason && (
                        <span className="shrink-0 text-[12px] font-semibold text-ink-muted">{m.reason}</span>
                      )}
                    </button>
                    {seatRow && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => unseat(seatRow.id)}
                        aria-label={`Unseat ${m.full_name}`}
                      >
                        Unseat
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {seatable && (
          <div className="border-t border-line px-4 py-3" data-testid="seat-someone">
            <h4 className="text-[12.5px] font-extrabold uppercase tracking-[.4px] text-ink-muted">Seat someone</h4>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              Adds a person the roles would not. Members by role cannot be removed here.
            </p>
            {seatError && (
              <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-danger-ink">
                {seatError}
              </p>
            )}
            <div className="mt-2 flex flex-col gap-2">
              <label className="sr-only" htmlFor="seat-person">
                Person to seat
              </label>
              <select
                id="seat-person"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="h-[36px] rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
              >
                <option value="">Choose a person…</option>
                {people
                  .filter((person) => !memberIds.has(person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
              </select>
              <label className="sr-only" htmlFor="seat-reason">
                Reason
              </label>
              <input
                id="seat-reason"
                type="text"
                value={reason}
                maxLength={120}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why — shown to the channel"
                className="h-[36px] rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink placeholder:text-ink-faint"
              />
              <Button size="sm" disabled={!pick || !reason.trim() || saving} onClick={seat}>
                Seat
              </Button>
            </div>
          </div>
        )}

        <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-ink-faint">
          Tap someone to start a direct message.
        </p>
      </Card>
    </div>
  )
}
