import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAvailabilityForEvents } from '../data/availability.js'
import { removeChatPhoto, uploadChatPhoto } from '../data/chatMedia.js'
import { listEvents } from '../data/events.js'
import {
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
  openConversation,
  removeMessage,
  replyToMessage,
  setAnnounceOnly,
  setPinned,
  subscribeMessages,
  subscribeReactions,
  toggleReaction,
} from '../data/messages.js'
import { getMyChatPref, setChatPref } from '../data/chatPrefs.js'
import { createPoll, listPollsFor, setPollVote, subscribePollVotes } from '../data/polls.js'
import { useAuth } from './auth.jsx'
import { DEFAULT_BACKGROUND, resolveBackground } from './chatBackgrounds.js'
import { useMemberships } from './memberships.jsx'
import { canEditTeam, isAdmin, visibleTeams } from './scope.js'
import useStayPinnedToBottom from './useStayPinnedToBottom.js'

const CLUB = 'club'

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

// A channel's entire state and behaviour — squad, staff or club — extracted
// VERBATIM from src/screens/Chat.jsx on 26 Aug 2026 so the full screen and
// the floating dock render the SAME channel (phase 3 of
// claude/plans/2026-08-26-shared-chat-thread.md, the same split as
// src/lib/useDmThread.js). Rendering lives in
// src/components/ChannelThread.jsx; channel MANAGEMENT (announce-only,
// clear chat, wallpaper picking) stays with the screen, which reads this
// hook's meta and calls reload() after mutating.
//
// `param` is the route's shape: 'club', or a team id. `wantStaff` asks for
// the squad's staff channel; the hook grants it only to people who can edit
// the squad (the policy refuses everybody else anyway) and returns the
// decision as `staffChannel`.
//
// `openDm(conversationId, { replyTo })` — the same surface seam as
// useDmThread: the screen navigates, the dock swaps its own panel.
// `scrollRef` points pin-to-bottom at the dock's panel instead of the page.
export default function useChannelThread({ param, wantStaff = false }, { openDm, scrollRef } = {}) {
  const navigate = useNavigate()
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
  const staffChannel = wantStaff && !isClub && canModerate

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
  const [tallies, setTallies] = useState(() => new Map())
  const [reactions, setReactions] = useState(() => new Map())
  // Polls (27 Aug 2026), loaded like reactions; postingPoll gates the composer.
  const [polls, setPolls] = useState(() => new Map())
  const [postingPoll, setPostingPoll] = useState(false)
  const [mentionables, setMentionables] = useState([])
  const [upcoming, setUpcoming] = useState([])
  // Round 2 (claude/plans/2026-08-24-chat-round-2.md): a photo waiting in
  // the composer, and the emoji picker's cursor handle.
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [background, setBackground] = useState(DEFAULT_BACKGROUND)
  // Where "New" starts and what was unread, captured ONCE per visit — the
  // mark-read-on-arrival effect updates `reads` moments later, so a live
  // value would wipe the highlight under the reader. Same stance as the DM
  // thread's newFromRef (24 Aug feedback: "mark for new messages").
  const newFromRef = useRef(undefined)
  const openReadsRef = useRef(null)
  const draftRef = useRef(null)
  const fileRef = useRef(null)

  // A squad the reader is not on: the screen redirects; do not fetch for it.
  const unknownTeam = !isClub && myTeams.length > 0 && !team

  // My wallpaper for THIS chat — chat_prefs, keyed by the list's own row key
  // (rowKey in ChatList.jsx). Decoration: a failure paints the default, never
  // an error. `staffChannel` can flip from false to true when memberships
  // land, so the key is a dependency, not a constant.
  const chatKey = isClub ? 'club-club' : `${staffChannel ? 'staff' : 'squad'}-${teamId}`
  useEffect(() => {
    if (!param || unknownTeam) return
    let stale = false
    getMyChatPref(chatKey)
      .then((pref) => {
        if (!stale && pref?.background) setBackground(resolveBackground(pref.background))
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [param, chatKey, unknownTeam])

  // The picker's landing point: paint now, persist for every device. A failed
  // write keeps the on-screen pick for this session — decoration again.
  function pickBackground(key) {
    setBackground(resolveBackground(key))
    if (selfId) setChatPref(selfId, chatKey, { background: key }).catch(() => {})
  }

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
      // Polls, the same way — a failure leaves the question text standing.
      try {
        const ids = rows.flatMap((m) => [m.id, ...(m.replies ?? []).map((r) => r.id)])
        setPolls(await listPollsFor(ids))
      } catch {
        setPolls(new Map())
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
  useEffect(() => (param ? subscribePollVotes(load) : undefined), [param, load])

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
  useStayPinnedToBottom(messages, scrollRef)

  // The surface's door to a DM. Default: the full screen's routes.
  const goToDm = useCallback(
    (dmId, { replyTo: quote } = {}) => {
      if (openDm) return openDm(dmId, { replyTo: quote })
      if (quote) return navigate(`/chat/dm/${dmId}`, { state: { replyPrivatelyTo: quote } })
      return navigate(`/chat/dm/${dmId}`)
    },
    [openDm, navigate],
  )

  const announceOnly = settings?.announce_only ?? true
  const mayPost = canModerate || (!isClub && !announceOnly)
  const pinned = (messages ?? []).filter((m) => m.pinned && !m.deleted_at)
  const threadedEventIds = new Set((messages ?? []).filter((m) => m.event_id && !m.deleted_at).map((m) => m.event_id))
  const attachable = upcoming.filter((e) => !threadedEventIds.has(e.id))
  const attachedEvent = attachEventId ? upcoming.find((e) => e.id === attachEventId) ?? null : null
  // A fixture thread may be opened by anyone in the squad — the composer is
  // unlocked for it even under announce-only.
  const composerOpen = mayPost || Boolean(attachEventId)

  const onReport = async (id, reason) => {
    await reportMessage(id, reason)
  }

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

  async function vote(optionId, on) {
    try {
      await setPollVote(optionId, selfId, on)
      await load()
    } catch (err) {
      setError(err.message || 'Could not record that vote.')
    }
  }

  // A channel poll — staff or squad/club, carrying the fixture if a thread is
  // attached, exactly as a text post here would (send() above).
  async function sendPoll({ question, options, allowMultiple }) {
    if (postingPoll) return false
    setPostingPoll(true)
    setSendError(null)
    try {
      await createPoll({
        teamId,
        channel: staffChannel ? 'staff' : 'squad',
        eventId: attachEventId || null,
        question,
        options,
        allowMultiple,
      })
      await load()
      return true
    } catch (err) {
      setSendError(err.message || 'Could not post that poll.')
      return false
    } finally {
      setPostingPoll(false)
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

  // The group-DM courtesies, on the squad channel too (25 Aug 2026). Whether
  // a DM with this person is ALLOWED stays open_conversation's call — its
  // refusal is the database's words, the same contract the DM thread's
  // onReplyPrivately documents. DMs and channels share one messages table,
  // so quoting a channel message into the DM is an ordinary quoted_id.
  async function openDmWith(profileId) {
    try {
      const dm = await openConversation(profileId)
      goToDm(dm)
    } catch (err) {
      setError(err.message || 'Could not open a chat with them.')
    }
  }
  async function onReplyPrivately(m) {
    try {
      const dm = await openConversation(m.author_id)
      goToDm(dm, { replyTo: m })
    } catch (err) {
      setError(err.message || 'Could not open a chat with them.')
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

  return {
    selfId,
    param,
    isClub,
    teamId,
    team,
    myTeams,
    admin,
    canModerate,
    clubId,
    staffChannel,
    unknownTeam,
    messages,
    reads,
    openReadsRef,
    newFromRef,
    stats,
    settings,
    announceOnly,
    mayPost,
    pinned,
    attachable,
    attachedEvent,
    attachEventId,
    setAttachEventId,
    composerOpen,
    error,
    setError,
    sendError,
    draft,
    setDraft,
    draftMentions,
    setDraftMentions,
    sending,
    tallies,
    reactions,
    mentionables,
    background,
    pickBackground,
    photo,
    photoPreview,
    clearPhoto,
    pickPhoto,
    draftRef,
    fileRef,
    send,
    onReply,
    onReact,
    polls,
    vote,
    sendPoll,
    postingPoll,
    onRemove,
    onPin,
    onReport,
    openDmWith,
    onReplyPrivately,
    toggleAnnounceOnly,
    reload: load,
  }
}
