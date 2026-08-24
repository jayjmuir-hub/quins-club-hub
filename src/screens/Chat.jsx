import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ChatHeader from '../components/ChatHeader.jsx'
import { Empty } from '../components/Empty.jsx'
import FixtureCard from '../components/FixtureCard.jsx'
import MentionPicker, { appendMention } from '../components/MentionPicker.jsx'
import MessageRow from '../components/MessageRow.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAvailabilityForEvents } from '../data/availability.js'
import { listEvents } from '../data/events.js'
import {
  clearChannel,
  getChannelSettings,
  listMentionablesFor,
  listMessages,
  listStaffMessages,
  postStaffMessage,
  reportMessage,
  listMyMessageReads,
  markMessagesRead,
  messageReadStats,
  postMessage,
  removeMessage,
  replyToMessage,
  setAnnounceOnly,
  setPinned,
  subscribeMessages,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { autoGrow, composerKeyDown } from '../lib/chatComposer.js'
import { eventTitle } from '../lib/eventFormat.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, visibleTeams } from '../lib/scope.js'
import { shortBand } from './ChatList.jsx'

// One channel's thread — claude/plans/2026-08-23-squad-chat.md, reshaped
// 24 Aug 2026 (claude/plans/2026-08-24-chat-list.md): bubbles, a header bar
// that says who reads this, and NO picker or tabs — the Chats list
// (src/screens/ChatList.jsx) is the only way in, and `Chat` in the nav
// always lands on the list.
//
// /chat                    → ChatList, not this screen
// /chat/club               → the club-wide channel
// /chat/:teamId            → one squad's channel
// /chat/:teamId?channel=staff → its staff channel (its own row in the list)
//
// ⚠️ ANNOUNCE-ONLY IS THE DEFAULT, AND THE COMPOSER SAYS SO. Staff post;
// families reply inside threads. A squad's staff can switch it off from the
// panel at the top of the stream, and the switch is recorded (who, when).
//
// ⚠️ MARKED READ ON ARRIVAL, POSTS ONLY, LIKE NOTICES. "Read by 18 of 27" is
// the strongest claim this can honestly make: it appeared in front of them.
//
// Phase 2 (23 Aug 2026): a post can hang off a fixture (one open thread per
// fixture; anyone in the squad may open it, even under announce-only) and
// carries the fixture's RSVP chips. @mentions push the mentioned.
//   ?thread=<id>   open that thread on arrival
//   ?event=<id>    open the fixture's thread, or prefill the composer to
//                  start one — the event screen's "Squad chat" block

export const CLUB = 'club'

/** { in, maybe, out } per event id, from raw availability rows. */
export function tallyByEvent(rows) {
  const map = new Map()
  for (const row of rows ?? []) {
    const t = map.get(row.event_id) ?? { in: 0, maybe: 0, out: 0 }
    if (t[row.status] !== undefined) t[row.status] += 1
    map.set(row.event_id, t)
  }
  return map
}

export default function Chat() {
  const { teamId: param } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const selfId = user?.id ?? null

  const myTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const admin = isAdmin(memberships)
  const isClub = param === CLUB
  const teamId = isClub ? null : param ?? null
  const team = teamId ? myTeams.find((t) => t.id === teamId) : null
  const canModerate = isClub ? admin : canEditTeam(memberships, teamId)
  const clubId = memberships?.find((m) => m.club_id)?.club_id ?? team?.club_id ?? null

  const [messages, setMessages] = useState(null)
  const [reads, setReads] = useState(() => new Set())
  const [stats, setStats] = useState(() => new Map())
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [draftMentions, setDraftMentions] = useState([])
  const [attachEventId, setAttachEventId] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [tallies, setTallies] = useState(() => new Map())
  const [mentionables, setMentionables] = useState([])
  const [upcoming, setUpcoming] = useState([])
  const bottomRef = useRef(null)
  const threadParam = searchParams.get('thread')
  const eventParam = searchParams.get('event')
  // Phase 3: ?channel=staff — the squad's staff-only stream. Offered only to
  // people who can edit the squad; the policy refuses everybody else anyway.
  const staffChannel = searchParams.get('channel') === 'staff' && !isClub && canModerate

  // A squad the reader is not on redirects below; do not fetch for it first.
  const unknownTeam = !isClub && myTeams.length > 0 && !team

  const load = useCallback(async () => {
    if (!param || unknownTeam) return
    setError(null)
    try {
      const [rows, mine, channel] = await Promise.all([
        staffChannel ? listStaffMessages(teamId) : listMessages(teamId),
        listMyMessageReads(),
        getChannelSettings(teamId),
      ])
      setMessages(rows)
      setReads(mine)
      setSettings(channel)
      // RSVP chips for every fixture thread on screen. Allowed to fail —
      // a thread without chips is still a thread.
      const eventIds = rows.filter((m) => m.event_id && !m.deleted_at).map((m) => m.event_id)
      if (eventIds.length) {
        try {
          setTallies(tallyByEvent(await listAvailabilityForEvents(eventIds)))
        } catch {
          setTallies(new Map())
        }
      }
      // Staff-only, and allowed to fail without breaking the stream.
      if (canModerate && teamId && !staffChannel) {
        try {
          setStats(await messageReadStats(teamId))
        } catch {
          setStats(new Map())
        }
      }
    } catch (err) {
      setError(err.message || 'We could not load the chat just now.')
    }
  }, [param, teamId, canModerate, staffChannel, unknownTeam])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => (param ? subscribeMessages(load) : undefined), [param, load])

  // Who can be mentioned here, and which fixtures could start a thread.
  // Both allowed to fail: the composer still works without either.
  useEffect(() => {
    if (!param) return
    listMentionablesFor(teamId, staffChannel ? 'staff' : 'squad').then(setMentionables).catch(() => setMentionables([]))
    if (!teamId) return
    const from = new Date()
    const to = new Date(from.getTime() + 60 * 24 * 3600 * 1000)
    listEvents({ teamIds: [teamId], from, to }).then(setUpcoming).catch(() => setUpcoming([]))
  }, [param, teamId, staffChannel])

  // ?event= — the event screen sent us here. If the fixture already has a
  // thread, open it; otherwise preselect it in the composer. Consumed once.
  useEffect(() => {
    if (!eventParam || !messages) return
    const existing = messages.find((m) => m.event_id === eventParam && !m.deleted_at)
    if (existing) {
      setSearchParams({ thread: existing.id }, { replace: true })
    } else {
      setAttachEventId(eventParam)
      setSearchParams({}, { replace: true })
    }
  }, [eventParam, messages, setSearchParams])

  // Mark what is on screen read on arrival — posts AND their replies, since
  // 24 Aug 2026: the list's unread badge counts both.
  useEffect(() => {
    if (!messages || !selfId) return
    const unseen = messages
      .flatMap((m) => [m, ...(m.replies ?? [])])
      .filter((m) => !m.deleted_at && !reads.has(m.id) && m.author_id !== selfId)
      .map((m) => m.id)
    if (unseen.length === 0) return
    markMessagesRead(selfId, unseen)
    setReads((prev) => new Set([...prev, ...unseen]))
  }, [messages, selfId, reads])

  // A chat reads downwards: land at the newest, and STAY there as messages
  // arrive — unless the reader has scrolled up into history, which a yank
  // back down would interrupt (Jay, 24 Aug 2026: "should stay at bottom with
  // newest message visible, even as new messages come in").
  const nearBottomRef = useRef(true)
  useEffect(() => {
    function onScroll() {
      const doc = document.documentElement
      nearBottomRef.current = window.innerHeight + window.scrollY >= doc.scrollHeight - 160
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    // Optional-called: jsdom (and some old WebViews) have no scrollIntoView.
    if (messages?.length && nearBottomRef.current) bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages])

  // ── Routing ─────────────────────────────────────────────────────────────
  if (!param || unknownTeam) {
    return <Navigate to="/chat" replace />
  }

  const announceOnly = settings?.announce_only ?? true
  const mayPost = canModerate || (!isClub && !announceOnly)
  const title = isClub ? 'Whole club' : team?.name ?? 'Squad'
  const onReport = async (id, reason) => {
    await reportMessage(id, reason)
  }
  const pinned = (messages ?? []).filter((m) => m.pinned && !m.deleted_at)
  const threadedEventIds = new Set((messages ?? []).filter((m) => m.event_id && !m.deleted_at).map((m) => m.event_id))
  const attachable = upcoming.filter((e) => !threadedEventIds.has(e.id))
  const attachedEvent = attachEventId ? upcoming.find((e) => e.id === attachEventId) ?? null : null
  // A fixture thread may be opened by anyone in the squad — the composer is
  // unlocked for it even under announce-only.
  const composerOpen = mayPost || Boolean(attachEventId)

  async function send(domEvent) {
    domEvent.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      const kept = draftMentions.filter((m) => draft.includes(`@${m.full_name}`)).map((m) => m.profile_id)
      if (staffChannel) await postStaffMessage(teamId, draft, { mentions: kept })
      else await postMessage(teamId, draft, { eventId: attachEventId || null, mentions: kept })
      setDraft('')
      setDraftMentions([])
      setAttachEventId('')
      await load()
    } catch (err) {
      setSendError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  async function onReply(parentId, body, opts) {
    await replyToMessage(parentId, body, opts)
    await load()
  }
  async function onRemove(id) {
    try {
      await removeMessage(id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not remove that.')
    }
  }
  async function onPin(id, pinnedNow) {
    try {
      await setPinned(id, pinnedNow)
      await load()
    } catch (err) {
      setError(err.message || 'Could not pin that.')
    }
  }
  async function toggleAnnounceOnly() {
    try {
      await setAnnounceOnly(teamId, clubId, selfId, !announceOnly)
      await load()
    } catch (err) {
      setError(err.message || 'Could not change that.')
    }
  }

  const subtitle = isClub
    ? 'Club-wide · admins post'
    : staffChannel
      ? 'Staff only · coaches, managers and medics'
      : `${mentionables.length > 0 ? `${mentionables.length} members · ` : ''}${announceOnly ? 'announce-only' : 'open chat'}`
  const headerActions = [
    ...(canModerate && !isClub && !staffChannel && settings
      ? [{ label: announceOnly ? 'Turn announce-only off' : 'Turn announce-only on', onClick: toggleAnnounceOnly }]
      : []),
    // Staff only. Deletes every post in THIS channel for good; the channel
    // stays — it is the squad. Reported posts stay (evidence).
    ...(canModerate ? [{ label: 'Clear chat', onClick: () => setClearing(true), danger: true }] : []),
  ]

  async function clearChat() {
    try {
      await clearChannel(isClub ? null : teamId, staffChannel ? 'staff' : 'squad')
      setClearing(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not clear this chat.')
      setClearing(false)
    }
  }

  return (
    <section className="px-1">
      <ChatHeader
        avatar={
          <span
            aria-hidden="true"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${
              isClub ? 'bg-surface-mute text-ink' : 'bg-brand text-ink-invert'
            }`}
          >
            {isClub ? '🏉' : staffChannel ? '🛡' : shortBand(title)}
          </span>
        }
        title={staffChannel ? `${title} · staff` : title}
        subtitle={subtitle}
        actions={headerActions}
      />

      {clearing && (
        <Card className="mb-3 px-4 py-3" data-testid="clear-chat-confirm">
          <p className="text-[13.5px] font-extrabold text-ink">Clear this chat?</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            Every message here is deleted for everyone. Reported messages stay until the club resolves them. This cannot be undone.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setClearing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={clearChat}>
              Clear chat
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {/* Announce-only lives in the header's ⋯ menu since 24 Aug 2026; this
          line keeps the state visible to staff (data-testid kept for the tests). */}
      {canModerate && !isClub && !staffChannel && settings && (
        <p className="mb-2 px-1 text-[12px] text-ink-muted" data-testid="channel-settings">
          {announceOnly ? 'Announce-only: staff post; families reply inside threads.' : 'Open chat: anyone in the squad can post.'}
          <Button size="sm" variant="ghost" onClick={toggleAnnounceOnly} aria-pressed={announceOnly} className="ml-2">
            {announceOnly ? 'Turn off' : 'Turn on'}
          </Button>
        </p>
      )}

      {/* ── Pinned ──────────────────────────────────────────────────── */}
      {pinned.length > 0 && (
        <div className="mb-3" data-testid="pinned-block">
          <p className="mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">Pinned</p>
          {pinned.map((m) => (
            <Card key={`pin-${m.id}`} className="mb-2 border-l-[3px] border-brand px-3.5 py-2.5">
              <p className="text-[13.5px] leading-[1.4] text-ink">{m.body}</p>
              <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">{m.author?.full_name}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ── Stream ──────────────────────────────────────────────────── */}
      {messages === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}
      {messages?.length === 0 && (
        <Empty
          message={
            mayPost
              ? 'Nothing here yet. Say something to the squad.'
              : 'Nothing here yet. Your squad’s staff will post here.'
          }
        />
      )}
      {messages?.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          selfId={selfId}
          canModerate={canModerate}
          readStat={canModerate ? stats.get(m.id) : undefined}
          unread={!reads.has(m.id)}
          tally={m.event_id ? tallies.get(m.event_id) : undefined}
          mentionables={mentionables}
          forceOpen={threadParam === m.id}
          onReply={onReply}
          onRemove={onRemove}
          onPin={onPin}
          onReport={onReport}
        />
      ))}
      <div ref={bottomRef} />

      {/* ── Composer ────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-2 pt-2">
        {/* Attach a fixture: starts that fixture's thread. Offered to
            everyone in the squad (not only staff) — the fixture's discussion
            belongs to the squad. Only fixtures without an open thread. */}
        {!isClub && !staffChannel && attachable.length > 0 && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <label htmlFor="chat-attach" className="text-[12px] font-bold text-ink-muted">
              Fixture
            </label>
            <select
              id="chat-attach"
              value={attachEventId}
              onChange={(e) => setAttachEventId(e.target.value)}
              className="h-[32px] min-w-0 flex-1 rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
            >
              <option value="">{mayPost ? 'None — a normal post' : 'Pick a fixture to start its thread'}</option>
              {attachable.map((e) => (
                <option key={e.id} value={e.id}>
                  {eventTitle(e)}
                </option>
              ))}
            </select>
          </div>
        )}
        {attachedEvent && (
          <div className="mb-2 px-1">
            <FixtureCard event={attachedEvent} tally={tallies.get(attachedEvent.id)} />
          </div>
        )}
        {composerOpen ? (
          <form onSubmit={send} className="flex items-end gap-2" data-testid="composer">
            <MentionPicker
              people={mentionables}
              onPick={(p) => {
                setDraft((d) => appendMention(d, p))
                setDraftMentions((m) => (m.some((x) => x.profile_id === p.profile_id) ? m : [...m, p]))
              }}
            />
            <label className="sr-only" htmlFor="chat-draft">
              Message
            </label>
            <textarea
              id="chat-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onInput={(e) => autoGrow(e.currentTarget)}
              onKeyDown={composerKeyDown}
              rows={1}
              maxLength={2000}
              placeholder={attachedEvent ? `Start the thread for ${eventTitle(attachedEvent)}` : 'Message'}
              className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
            />
            <Button type="submit" disabled={sending || !draft.trim()}>
              {attachedEvent ? 'Start thread' : 'Send'}
            </Button>
          </form>
        ) : (
          <p className="px-2 py-2 text-[13px] font-semibold text-ink-muted" data-testid="composer-locked">
            Only staff can post here — reply to a thread instead
            {attachable.length > 0 ? ', or pick a fixture above to start its thread' : ''}.
          </p>
        )}
        {sendError && (
          <p role="alert" className="mt-1.5 px-1 text-[12.5px] font-semibold text-danger-ink">
            {sendError}
          </p>
        )}
      </div>
    </section>
  )
}
