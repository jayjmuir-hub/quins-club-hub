import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listAvailabilityForEvents } from '../data/availability.js'
import { removeChatAttachments, uploadChatFile, uploadChatVoice } from '../data/chatMedia.js'
import { listEvents } from '../data/events.js'
import { useAttachmentTray } from './useAttachmentTray.js'
import { usePendingChatFile } from './usePendingChatFile.js'
import { routeChatAttachments } from './chatComposer.js'
import { uploadAlbum } from './uploadAlbum.js'
import {
  channelMembers,
  editMessage,
  getChannelSettings,
  listMentionablesFor,
  listMessages,
  listRoleMessages,
  listStaffMessages,
  postRoleMessage,
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
import { isRoleChannel } from './roleChannels.js'
import { canEditTeam, isAdmin, visibleTeams } from './scope.js'
import useStayPinnedToBottom from './useStayPinnedToBottom.js'
import { friendlyMessage } from './friendlyError.js'

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
export default function useChannelThread({ param, wantStaff = false, threadParam = null }, { openDm, scrollRef } = {}) {
  const navigate = useNavigate()
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const selfId = user?.id ?? null

  const myTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const admin = isAdmin(memberships)
  const isClub = param === CLUB
  // A role channel rides the same param the club sentinel does (20260830) —
  // a key can never collide with a team id, which is a uuid. Whether the
  // caller BELONGS is the database's call (private.in_role_channel); the list
  // only offers channels my_chats returned, and a pasted URL just reads empty.
  const roleKey = isRoleChannel(param) ? param : null
  const teamId = isClub || roleKey ? null : param ?? null
  const team = teamId ? myTeams.find((t) => t.id === teamId) : null
  const canModerate = isClub || roleKey ? admin : canEditTeam(memberships, teamId)
  const clubId = memberships?.find((m) => m.club_id)?.club_id ?? team?.club_id ?? null
  const staffChannel = wantStaff && !isClub && !roleKey && canModerate

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
  // ⚠️ The composer's photos live in useAttachmentTray, NOT in this hook —
  // the same tray serves the picker, Ctrl+V and drag-and-drop, and the
  // single `photo` state it replaces was byte-identical in BOTH thread
  // hooks (plan 2, task 1).
  const tray = useAttachmentTray()
  const pendingFile = usePendingChatFile()
  // What the Send button says while an album climbs the wire. Null when idle.
  const [progress, setProgress] = useState(null)
  const [background, setBackground] = useState(DEFAULT_BACKGROUND)
  // Where "New" starts and what was unread, captured ONCE per visit — the
  // mark-read-on-arrival effect updates `reads` moments later, so a live
  // value would wipe the highlight under the reader. Same stance as the DM
  // thread's newFromRef (24 Aug feedback: "mark for new messages").
  const newFromRef = useRef(undefined)
  const openReadsRef = useRef(null)
  // 4 Sep 2026 — the flat stream (claude/decisions/2026-09-04-channel-threads-
  // flat-stream.md). A reply is a message at the foot with a quote, so the
  // composer needs to know what it is answering: `replyTo` is that post, armed
  // by Reply in a bubble's menu and shown as the quote preview above the
  // composer, exactly as the DM thread does it. `focusId` is the fixture
  // FILTER — tap a fixture card (or a quote of it) and the stream shows only
  // that post and its replies, with a bar saying so and the way back. It is a
  // filter, never a fold: nothing is hidden unless the reader asked.
  const [replyTo, setReplyTo] = useState(null)
  const [focusId, setFocusId] = useState(null)
  // The ?thread=<postId> deep link (the event screen's "N replies · Open the
  // thread") lands in the filtered view of that fixture.
  useEffect(() => {
    if (threadParam) setFocusId(threadParam)
  }, [threadParam])
  const draftRef = useRef(null)
  const fileRef = useRef(null)
  const docFileRef = useRef(null)

  // A squad the reader is not on: the screen redirects; do not fetch for it.
  const unknownTeam = !isClub && !roleKey && myTeams.length > 0 && !team

  // My wallpaper for THIS chat — chat_prefs, keyed by the list's own row key
  // (rowKey in ChatList.jsx). Decoration: a failure paints the default, never
  // an error. `staffChannel` can flip from false to true when memberships
  // land, so the key is a dependency, not a constant.
  const chatKey = roleKey
    ? `${roleKey}-club`
    : isClub
      ? 'club-club'
      : `${staffChannel ? 'staff' : 'squad'}-${teamId}`
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

  // ⚠️ A STALE LOAD MUST NOT LAND — 5 Sep 2026, the same guard as
  // useDmThread. Chat.jsx keys the screen by `param` so a squad switch
  // remounts (and resets the refs above); the dock reuses this hook, and a
  // realtime reload racing a send needs the ticket just the same.
  const loadTicket = useRef(0)
  const load = useCallback(async () => {
    if (!param || unknownTeam) return
    const ticket = ++loadTicket.current
    const stale = () => ticket !== loadTicket.current
    setError(null)
    try {
      const [rows, channel] = await Promise.all([
        roleKey ? listRoleMessages(roleKey) : staffChannel ? listStaffMessages(teamId) : listMessages(teamId),
        // A role channel has no settings row — open chat by construction.
        roleKey ? Promise.resolve(null) : getChannelSettings(teamId),
      ])
      if (stale()) return
      // My receipts for THESE rows only — see listMyMessageReads.
      const mine = await listMyMessageReads(selfId, rows.map((m) => m.id))
      if (stale()) return
      if (newFromRef.current === undefined) {
        openReadsRef.current = mine
        // Flat since 4 Sep 2026: every row is a message in its own right.
        const first = rows.find((row) => !row.deleted_at && row.author_id !== selfId && !mine.has(row.id))
        newFromRef.current = first?.id ?? null
      }
      setMessages(rows)
      setReads(mine)
      setSettings(channel)
      // Reactions are decoration: a stream without them is still a stream.
      try {
        const ids = rows.map((m) => m.id)
        const reactions = await listReactions(ids)
        if (!stale()) setReactions(reactions)
      } catch {
        if (!stale()) setReactions(new Map())
      }
      if (stale()) return
      // Polls, the same way — a failure leaves the question text standing.
      try {
        const ids = rows.map((m) => m.id)
        const polls = await listPollsFor(ids)
        if (!stale()) setPolls(polls)
      } catch {
        if (!stale()) setPolls(new Map())
      }
      if (stale()) return
      // RSVP chips for every fixture thread on screen. Allowed to fail —
      // a thread without chips is still a thread.
      const eventIds = rows.filter((m) => m.event_id && !m.deleted_at).map((m) => m.event_id)
      if (eventIds.length) {
        try {
          const tallies = tallyByEvent(await listAvailabilityForEvents(eventIds))
          if (!stale()) setTallies(tallies)
        } catch {
          if (!stale()) setTallies(new Map())
        }
      }
      if (stale()) return
      // Staff-only, and allowed to fail without breaking the stream.
      if (canModerate && teamId && !staffChannel) {
        try {
          const stats = await messageReadStats(teamId)
          if (!stale()) setStats(stats)
        } catch {
          if (!stale()) setStats(new Map())
        }
      }
    } catch (err) {
      if (!stale()) setError(friendlyMessage(err, 'We could not load the chat just now.'))
    }
  }, [param, teamId, canModerate, staffChannel, roleKey, unknownTeam, selfId])

  useEffect(() => {
    load()
  }, [load])

  // Which rows on the shared `messages` channel are THIS thread's (5 Sep
  // 2026): a role channel by its key; the club by "channel squad, no squad";
  // a squad by id — its staff channel included, since both live under one
  // team_id and a spare reload is cheaper than a missed one. A DELETE carries
  // no row and always reloads — see messageMatcher.
  const mine = useCallback(
    (row) =>
      roleKey
        ? row.channel === roleKey
        : isClub
          ? row.team_id == null && row.channel === 'squad'
          : row.team_id === teamId,
    [roleKey, isClub, teamId],
  )
  useEffect(() => (param ? subscribeMessages(load, { where: mine }) : undefined), [param, load, mine])
  useEffect(() => (param ? subscribeReactions(load) : undefined), [param, load])
  useEffect(() => (param ? subscribePollVotes(load) : undefined), [param, load])

  // Who can be mentioned here, and which fixtures could start a thread.
  // Both allowed to fail: the composer still works without either.
  useEffect(() => {
    if (!param) return
    // A role channel's audience IS its member list — channel_members returns
    // the same {profile_id, full_name} shape the mention picker reads, plus
    // the reason string the member sheet shows.
    if (roleKey) {
      channelMembers(roleKey).then(setMentionables).catch(() => setMentionables([]))
      return
    }
    listMentionablesFor(teamId, staffChannel ? 'staff' : 'squad').then(setMentionables).catch(() => setMentionables([]))
    if (!teamId) return
    const from = new Date()
    const to = new Date(from.getTime() + 60 * 24 * 3600 * 1000)
    listEvents({ teamIds: [teamId], from, to }).then(setUpcoming).catch(() => setUpcoming([]))
  }, [param, teamId, staffChannel, roleKey])

  // Mark what is on screen read on arrival — posts AND their replies, since
  // 24 Aug 2026: the list's unread badge counts both.
  useEffect(() => {
    if (!messages || !selfId) return
    const unseen = messages
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
  // A role channel is open chat among peers by construction — no
  // announce-only, and every member (the policy's definition) may post.
  const mayPost = roleKey ? true : canModerate || (!isClub && !announceOnly)
  const pinned = (messages ?? []).filter((m) => m.pinned && !m.deleted_at)
  const threadedEventIds = new Set((messages ?? []).filter((m) => m.event_id && !m.deleted_at).map((m) => m.event_id))
  const attachable = upcoming.filter((e) => !threadedEventIds.has(e.id))
  const attachedEvent = attachEventId ? upcoming.find((e) => e.id === attachEventId) ?? null : null
  // A fixture thread may be opened by anyone in the squad — the composer is
  // unlocked for it even under announce-only. So is a REPLY: under announce-
  // only a parent may answer a post, and since 4 Sep 2026 that answer is
  // written in this composer, not in a box under the post.
  const composerOpen = mayPost || Boolean(attachEventId) || Boolean(replyTo)
  // The fixture filter (4 Sep 2026): the focused post and its replies, or
  // everything. `focusPost` is what the bar names; a focus on a post that is
  // not in the stream (a stale link) shows everything and no bar.
  const focusPost = focusId ? (messages ?? []).find((m) => m.id === focusId) ?? null : null
  const visible = focusPost ? (messages ?? []).filter((m) => m.id === focusPost.id || m.parent_id === focusPost.id) : messages
  // Idea 4 (Jay, 4 Sep 2026): a fixture whose kick-off is still ahead keeps
  // its card at the top of the chat until then, so the thing people are
  // replying to stays in view. Live posts only; a past fixture scrolls away.
  const liveFixtures = (messages ?? []).filter(
    (m) => m.event && !m.deleted_at && !m.parent_id && new Date(m.event.starts_at).getTime() >= Date.now(),
  )

  const onReport = async (id, reason) => {
    await reportMessage(id, reason)
  }

  /**
   * The picker door. ⚠️ `accept` on the input filters this door ONLY — the
   * paste and drop doors bypass it entirely — so the real type gate is
   * isAcceptableImage inside the tray (photos) and validateChatFile /
   * routeChatAttachments (documents).
   */
  function pickPhoto(domEvent) {
    const files = Array.from(domEvent.target.files ?? [])
    // Reset FIRST: without this, picking the same file twice in a row fires
    // no change event the second time.
    domEvent.target.value = ''
    pendingFile.clear()
    tray.add(files)
  }

  function pickFile(domEvent) {
    const files = Array.from(domEvent.target.files ?? [])
    domEvent.target.value = ''
    tray.clear()
    pendingFile.pick(files)
  }

  function attachIncoming(files) {
    routeChatAttachments(files, { addPhotos: tray.add, pickFile: pendingFile.pick })
  }

  async function send(domEvent) {
    domEvent.preventDefault()
    if ((!draft.trim() && tray.items.length === 0 && !pendingFile.file) || sending) return
    setSending(true)
    setSendError(null)
    try {
      const kept = draftMentions.filter((m) => draft.includes(`@${m.full_name}`)).map((m) => m.profile_id)
      // Photos first, message second — WhatsApp order, same as the DM thread.
      // ⚠️ uploadAlbum is all-or-nothing: a failure has already taken back
      // anything it managed to upload, so the throw leaves nothing behind.
      // A document is a separate door: one file, `attachments` jsonb only.
      const attachments = pendingFile.file
        ? [await uploadChatFile(selfId, pendingFile.file)]
        : await uploadAlbum(selfId, tray.items, setProgress)
      // A reply is a message answering `replyTo` — the parent link is what
      // draws the quote and what the event screen counts.
      if (replyTo) await replyToMessage(replyTo.id, draft, { mentions: kept, attachments })
      else if (roleKey) await postRoleMessage(roleKey, draft, { mentions: kept, attachments })
      else if (staffChannel) await postStaffMessage(teamId, draft, { mentions: kept, attachments })
      else await postMessage(teamId, draft, { eventId: attachEventId || null, mentions: kept, attachments })
      setDraft('')
      setDraftMentions([])
      setAttachEventId('')
      setReplyTo(null)
      tray.clear()
      pendingFile.clear()
      await load()
    } catch (err) {
      // ⚠️ The draft and the tray SURVIVE a failure — the retry costs one
      // tap, which matters most on the slow connection that caused it.
      setSendError(friendlyMessage(err, 'Could not send that.'))
    } finally {
      setProgress(null)
      setSending(false)
    }
  }

  // Reply, from a bubble's menu or the announce-only affordance: arm the
  // quote and put the cursor in the composer. The send itself is `send`.
  // (Until 4 Sep 2026 this took (parentId, body, opts) and wrote the reply
  // from a form under the post; that form is gone with the fold.)
  function onReply(message) {
    setReplyTo(message)
    draftRef.current?.focus?.()
  }
  // Author-only, 15 minutes — the database's rule (private.touch_message).
  // Thrown refusals surface in the editor, in the database's own words.
  async function onEdit(id, body) {
    await editMessage(id, body)
    await load()
  }
  async function onReact(messageId, emoji, on) {
    try {
      await toggleReaction(messageId, selfId, emoji, on)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not react to that.'))
    }
  }

  async function vote(optionId, on) {
    try {
      await setPollVote(optionId, selfId, on)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not record that vote.'))
    }
  }

  // A voice note posts like a photo — an audio attachment, no words, into
  // whichever channel this is (staff/squad/club), carrying a fixture if one is
  // attached, exactly as send() does above.
  async function sendVoice(blob, ext) {
    if (sending) return
    setSending(true)
    setSendError(null)
    try {
      const attachmentPath = await uploadChatVoice(selfId, blob, ext)
      if (roleKey) await postRoleMessage(roleKey, '', { attachmentPath })
      else if (staffChannel) await postStaffMessage(teamId, '', { attachmentPath })
      else await postMessage(teamId, '', { eventId: attachEventId || null, attachmentPath })
      await load()
    } catch (err) {
      setSendError(friendlyMessage(err, 'Could not send that voice message.'))
    } finally {
      setSending(false)
    }
  }

  // A channel poll — staff or squad/club, carrying the fixture if a thread is
  // attached, exactly as a text post here would (send() above).
  async function sendPoll({ question, options, allowMultiple }) {
    if (postingPoll) return false
    // Polls are squad/staff plumbing (create_poll takes a team) — not wired
    // for role channels in v1. The composer hides the button (allowPolls).
    if (roleKey) return false
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
      setSendError(friendlyMessage(err, 'Could not post that poll.'))
      return false
    } finally {
      setPostingPoll(false)
    }
  }

  async function onRemove(id) {
    try {
      const gone = (messages ?? []).find((m) => m.id === id)
      await removeMessage(id)
      // Own-folder-only storage policy: only the author's delete reaches the
      // object (src/data/chatMedia.js); a moderator's remove orphans it,
      // readable by nobody but its owner.
      if (gone && gone.author_id === selfId) await removeChatAttachments(gone)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not remove that.'))
    }
  }
  async function onPin(id, pinnedNow) {
    try {
      await setPinned(id, pinnedNow)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not pin that.'))
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
      setError(friendlyMessage(err, 'Could not open a chat with them.'))
    }
  }
  async function onReplyPrivately(m) {
    try {
      const dm = await openConversation(m.author_id)
      goToDm(dm, { replyTo: m })
    } catch (err) {
      setError(friendlyMessage(err, 'Could not open a chat with them.'))
    }
  }

  async function toggleAnnounceOnly() {
    try {
      await setAnnounceOnly(teamId, clubId, selfId, !announceOnly)
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not change that.'))
    }
  }

  return {
    selfId,
    param,
    isClub,
    roleKey,
    allowPolls: !roleKey,
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
    replyTo,
    setReplyTo,
    focusId,
    setFocusId,
    focusPost,
    visible,
    liveFixtures,
    error,
    setError,
    sendError,
    setSendError,
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
    tray,
    pendingFile,
    progress,
    pickPhoto,
    pickFile,
    attachIncoming,
    draftRef,
    fileRef,
    docFileRef,
    send,
    onReply,
    onEdit,
    onReact,
    polls,
    vote,
    sendPoll,
    postingPoll,
    sendVoice,
    onRemove,
    onPin,
    onReport,
    openDmWith,
    onReplyPrivately,
    toggleAnnounceOnly,
    reload: load,
  }
}
