import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ChatHeader from '../components/ChatHeader.jsx'
import { Empty } from '../components/Empty.jsx'
import FixtureCard from '../components/FixtureCard.jsx'
import MentionPicker, { appendMention } from '../components/MentionPicker.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import MessageRow from '../components/MessageRow.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAvailabilityForEvents } from '../data/availability.js'
import ChatBackgroundPicker from '../components/ChatBackgroundPicker.jsx'
import { backgroundStyle, getChatBackground, setChatBackground } from '../lib/chatBackgrounds.js'
import { removeChatPhoto, uploadChatPhoto } from '../data/chatMedia.js'
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
  listReactions,
  markMessagesRead,
  messageReadStats,
  postMessage,
  removeMessage,
  replyToMessage,
  setAnnounceOnly,
  setPinned,
  subscribeMessages,
  subscribeReactions,
  toggleReaction,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { autoGrow, composerKeyDown, insertAtCursor } from '../lib/chatComposer.js'
import { eventTitle } from '../lib/eventFormat.js'
import { useMemberships } from '../lib/memberships.jsx'
import useStayPinnedToBottom from '../lib/useStayPinnedToBottom.js'
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
  const [reactions, setReactions] = useState(() => new Map())
  const [mentionables, setMentionables] = useState([])
  const [upcoming, setUpcoming] = useState([])
  // Round 2 (claude/plans/2026-08-24-chat-round-2.md): a photo waiting in
  // the composer, and the emoji picker's cursor handle.
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  // The device wallpaper — the DM thread had this since round 3 while this
  // screen ignored it, despite the picker promising "for every chat"
  // (claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md).
  const [background, setBackground] = useState(getChatBackground)
  const [pickingBackground, setPickingBackground] = useState(false)
  const bottomRef = useRef(null)
  // Where "New" starts and what was unread, captured ONCE per visit — the
  // mark-read-on-arrival effect updates `reads` moments later, so a live
  // value would wipe the highlight under the reader. Same stance as the DM
  // thread's newFromRef (24 Aug feedback: "mark for new messages").
  const newFromRef = useRef(undefined)
  const openReadsRef = useRef(null)
  const draftRef = useRef(null)
  const fileRef = useRef(null)
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
      if (newFromRef.current === undefined) {
        openReadsRef.current = mine
        const first = rows.find(
          (row) =>
            !row.deleted_at &&
            ((row.author_id !== selfId && !mine.has(row.id)) ||
              (row.replies ?? []).some((r) => !r.deleted_at && r.author_id !== selfId && !mine.has(r.id))),
        )
        newFromRef.current = first?.id ?? null
      }
      setMessages(rows)
      setReads(mine)
      setSettings(channel)
      // Reactions are decoration: a stream without them is still a stream.
      try {
        const ids = rows.flatMap((m) => [m.id, ...(m.replies ?? []).map((r) => r.id)])
        setReactions(await listReactions(ids))
      } catch {
        setReactions(new Map())
      }
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
  }, [param, teamId, canModerate, staffChannel, unknownTeam, selfId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => (param ? subscribeMessages(load) : undefined), [param, load])
  useEffect(() => (param ? subscribeReactions(load) : undefined), [param, load])

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
  // newest message visible, even as new messages come in"). The whole story
  // lives in src/lib/useStayPinnedToBottom.js.
  useStayPinnedToBottom(messages)

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

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview(null)
  }

  function pickPhoto(domEvent) {
    const file = domEvent.target.files?.[0]
    domEvent.target.value = ''
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    try {
      setPhotoPreview(URL.createObjectURL(file))
    } catch {
      setPhotoPreview(null)
    }
  }

  async function send(domEvent) {
    domEvent.preventDefault()
    if ((!draft.trim() && !photo) || sending) return
    setSending(true)
    setSendError(null)
    try {
      const kept = draftMentions.filter((m) => draft.includes(`@${m.full_name}`)).map((m) => m.profile_id)
      // Photo first, message second — WhatsApp order, same as the DM thread.
      const attachmentPath = photo ? await uploadChatPhoto(selfId, photo) : null
      if (staffChannel) await postStaffMessage(teamId, draft, { mentions: kept, attachmentPath })
      else await postMessage(teamId, draft, { eventId: attachEventId || null, mentions: kept, attachmentPath })
      setDraft('')
      setDraftMentions([])
      setAttachEventId('')
      clearPhoto()
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
  async function onReact(messageId, emoji, on) {
    try {
      await toggleReaction(messageId, selfId, emoji, on)
      await load()
    } catch (err) {
      setError(err.message || 'Could not react to that.')
    }
  }

  async function onRemove(id) {
    try {
      const gone = (messages ?? []).flatMap((m) => [m, ...(m.replies ?? [])]).find((m) => m.id === id)
      await removeMessage(id)
      // Own-folder-only storage policy: only the author's delete reaches the
      // object (src/data/chatMedia.js); a moderator's remove orphans it,
      // readable by nobody but its owner.
      if (gone?.attachment_path && gone.author_id === selfId) await removeChatPhoto(gone.attachment_path)
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
  function pickBackground(key) {
    setChatBackground(key)
    setBackground(key)
    setPickingBackground(false)
  }

  const headerActions = [
    { label: 'Chat background', onClick: () => setPickingBackground(true) },
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

      <ChatBackgroundPicker open={pickingBackground} onClose={() => setPickingBackground(false)} current={background} onPick={pickBackground} />

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
      {/* Same paint site as the DM thread: the stream wrapper, wearing the
          device wallpaper; data-background is what the tests read. */}
      <div className="-mx-1 rounded-[12px] px-1" style={backgroundStyle(background) ?? undefined} data-background={background}>
      {messages?.map((m) => (
        <Fragment key={m.id}>
        {newFromRef.current === m.id && (
          <div className="my-1.5 flex items-center gap-2" data-testid="new-divider" role="separator" aria-label="New messages">
            <span aria-hidden="true" className="h-px flex-1 bg-brand/40" />
            <span className="font-condensed text-[11px] font-bold uppercase tracking-[.14em] text-brand-ink">New</span>
            <span aria-hidden="true" className="h-px flex-1 bg-brand/40" />
          </div>
        )}
        <MessageRow
          message={m}
          selfId={selfId}
          canModerate={canModerate}
          reactions={reactions}
          onReact={onReact}
          readStat={canModerate ? stats.get(m.id) : undefined}
          unread={!(openReadsRef.current ?? reads).has(m.id)}
          tally={m.event_id ? tallies.get(m.event_id) : undefined}
          mentionables={mentionables}
          forceOpen={threadParam === m.id}
          onReply={onReply}
          onRemove={onRemove}
          onPin={onPin}
          onReport={onReport}
        />
        </Fragment>
      ))}
      </div>
      <div ref={bottomRef} />

      {/* ── Composer ────────────────────────────────────────────────── */}
      {/* Chrome-free conversations (25 Aug 2026): no tab bar inside a
          thread, so the composer sits on the bottom edge — the safe-area
          folds into the padding so Send clears the home indicator. */}
      <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 desktop:pb-2">
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
          <>
            {photoPreview && (
              <div className="mb-1.5 flex items-center gap-2 rounded-[10px] bg-surface-mute px-2.5 py-1.5" data-testid="photo-preview">
                <img src={photoPreview} alt="Photo to send" className="h-12 w-12 rounded-[8px] object-cover" />
                <p className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{photo?.name ?? 'Photo'}</p>
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={clearPhoto}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            )}
            <form onSubmit={send} className="flex items-end gap-2" data-testid="composer">
              <MentionPicker
                people={mentionables}
                onPick={(p) => {
                  setDraft((d) => appendMention(d, p))
                  setDraftMentions((m) => (m.some((x) => x.profile_id === p.profile_id) ? m : [...m, p]))
                }}
              />
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} data-testid="photo-input" />
              <button
                type="button"
                aria-label="Attach a photo"
                onClick={() => fileRef.current?.click?.()}
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute"
                data-testid="photo-button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="1.6" />
                  <path d="m21 15-4.5-4.5L7 20" />
                </svg>
              </button>
              <label className="sr-only" htmlFor="chat-draft">
                Message
              </label>
              <textarea
                id="chat-draft"
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onInput={(e) => autoGrow(e.currentTarget)}
                onKeyDown={composerKeyDown}
                rows={1}
                maxLength={2000}
                placeholder={attachedEvent ? `Start the thread for ${eventTitle(attachedEvent)}` : 'Message'}
                className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
              />
              <EmojiPicker onPick={(emoji) => setDraft(insertAtCursor(draftRef.current, emoji))} />
              <Button type="submit" disabled={sending || (!draft.trim() && !photo)}>
                {attachedEvent ? 'Start thread' : 'Send'}
              </Button>
            </form>
          </>
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
