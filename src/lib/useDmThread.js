import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { removeChatPhoto, uploadChatPhoto } from '../data/chatMedia.js'
import { listMyNicknames } from '../data/nicknames.js'
import {
  forwardMessagesTo,
  listChats,
  listMyMessageReads,
  listMyStars,
  listReactions,
  getConversation,
  listDirectMessages,
  listGroupMembers,
  listMyBlocks,
  listMyConversations,
  logWelfareAccess,
  markMessagesRead,
  openConversation,
  removeMessage,
  reportMessage,
  sendDirectMessage,
  setPinned,
  subscribeMessages,
  subscribeReactions,
  toggleReaction,
  toggleStar,
  listMessageReceipts,
} from '../data/messages.js'
import { getMyChatPref, setChatPref } from '../data/chatPrefs.js'
import { useAuth } from './auth.jsx'
import { DEFAULT_BACKGROUND, resolveBackground } from './chatBackgrounds.js'
import { useMemberships } from './memberships.jsx'
import { usePresence } from './presence.js'
import { isAdmin } from './scope.js'
import useStayPinnedToBottom from './useStayPinnedToBottom.js'

// The DM/group thread's entire state and behaviour, extracted VERBATIM from
// src/screens/DirectMessages.jsx on 26 Aug 2026 so the full screen and the
// floating dock render the SAME thread instead of two hand-rolled copies —
// claude/plans/2026-08-26-shared-chat-thread.md. The rendering lives in
// src/components/DmThread.jsx; conversation MANAGEMENT (rename, nickname,
// block, leave, delete chat, wallpaper picking) stays with the screen, which
// reads this hook's meta and calls reload() after mutating.
//
// `openDm(conversationId, { replyTo })` is the one seam the surfaces differ
// on: the screen navigates to /chat/dm/:id, the dock swaps its own panel.
// Omitted, it defaults to navigation. `consumeReplyState` gates the
// arrived-with-a-quote effect (location.state.replyPrivatelyTo) — true on
// the screen, off in the dock, which must not rewrite history it never made.
// `scrollRef` points pin-to-bottom at the dock's panel instead of the page.
export default function useDmThread(conversationId, { openDm, consumeReplyState = true, scrollRef } = {}) {
  const { user } = useAuth()
  const { memberships } = useMemberships()
  const selfId = user?.id ?? null
  const admin = isAdmin(memberships)

  const [conversation, setConversation] = useState(null)
  // The database answered and there is no such conversation FOR THIS READER —
  // a typo in the URL, or an adults-only DM an admin may not review.
  const [missing, setMissing] = useState(false)
  const [messages, setMessages] = useState(null)
  const [other, setOther] = useState(null)
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [reporting, setReporting] = useState(null)
  const [reason, setReason] = useState('')
  // Groups (claude/plans/2026-08-24-group-chats.md): same thread, membership
  // from conversation_members instead of the profile_a/b pair.
  const [members, setMembers] = useState(null)
  const [reactions, setReactions] = useState(() => new Map())
  // Round 2 (claude/plans/2026-08-24-chat-round-2.md): reply-with-quote,
  // multi-select forwarding, and a photo waiting in the composer.
  const [replyTo, setReplyTo] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [forwardRows, setForwardRows] = useState(null)
  const [forwarding, setForwarding] = useState(false)
  // Round 3 (claude/plans/2026-08-24-chat-round-3-design.md): private
  // nicknames, and the wallpaper — per-chat and cross-device via chat_prefs
  // since 26 Aug 2026 (see src/lib/chatBackgrounds.js).
  const [nicknames, setNicknames] = useState(() => new Map())
  const [background, setBackground] = useState(DEFAULT_BACKGROUND)
  // Round 4 (claude/plans/2026-08-24-chat-round-4.md): my private stars.
  const [stars, setStars] = useState(() => new Set())
  // Ticks (26 Aug 2026): receipts for MY messages, message id → sets.
  const [receipts, setReceipts] = useState(() => new Map())
  const online = usePresence(selfId)
  const navigate = useNavigate()
  const location = useLocation()
  const loggedRef = useRef(false)
  const newFromRef = useRef(undefined)
  const draftRef = useRef(null)
  const fileRef = useRef(null)

  // The surface's door to another DM. Default: the full screen's routes.
  const goToDm = useCallback(
    (dmId, { replyTo: quote } = {}) => {
      if (openDm) return openDm(dmId, { replyTo: quote })
      if (quote) return navigate(`/chat/dm/${dmId}`, { state: { replyPrivatelyTo: quote } })
      return navigate(`/chat/dm/${dmId}`)
    },
    [openDm, navigate],
  )

  const load = useCallback(async () => {
    setError(null)
    try {
      const [conv, rows, inbox, blocks, reads] = await Promise.all([
        getConversation(conversationId),
        listDirectMessages(conversationId),
        listMyConversations(),
        listMyBlocks(),
        listMyMessageReads(),
      ])
      // Where "New" starts, captured ONCE per visit — the screen marks
      // everything read moments later, so a live value would vanish under
      // the reader (24 Aug feedback: "mark for new messages").
      if (newFromRef.current === undefined) {
        const first = rows.find((m) => m.author_id !== selfId && !reads.has(m.id))
        newFromRef.current = first?.id ?? null
      }
      setConversation(conv)
      setMessages(rows)
      setMissing(!conv)
      // Reactions are decoration: a thread without them is still a thread.
      try {
        setReactions(await listReactions(rows.map((m) => m.id)))
      } catch {
        setReactions(new Map())
      }
      // So are nicknames — a failure renders real names, never an error.
      try {
        setNicknames(await listMyNicknames())
      } catch {
        setNicknames(new Map())
      }
      // And stars.
      try {
        setStars(await listMyStars())
      } catch {
        setStars(new Set())
      }
      // And the ticks — decoration with the same stance: a thread whose
      // receipts failed is still a thread, showing single ticks.
      try {
        setReceipts(await listMessageReceipts(selfId, rows.filter((m) => m.author_id === selfId).map((m) => m.id)))
      } catch {
        setReceipts(new Map())
      }
      const group = conv?.kind === 'group'
      const people = group ? await listGroupMembers(conversationId) : null
      setMembers(people)
      const mine = inbox.find((c) => c.conversation_id === conversationId)
      const otherId = conv && !group ? (conv.profile_a === selfId ? conv.profile_b : conv.profile_a) : null
      setOther(
        mine
          ? { id: mine.other_id, name: mine.other_name, role: mine.other_role }
          : { id: otherId, name: rows.find((m) => m.author_id !== selfId)?.author?.full_name ?? 'Conversation', role: null },
      )
      setBlocked(otherId ? blocks.has(otherId) : false)
      // An admin reading somebody else's conversation: record it, once per
      // visit. A participant's own open is not a review and logs nothing.
      const isParticipant = group
        ? Boolean(people?.some((p) => p.profile_id === selfId))
        : conv && selfId && (selfId === conv.profile_a || selfId === conv.profile_b)
      if (conv && admin && selfId && !isParticipant && !loggedRef.current) {
        loggedRef.current = true
        logWelfareAccess(conversationId)
      }
    } catch (err) {
      setError(err.message || 'We could not load this conversation.')
    }
  }, [conversationId, selfId, admin])

  useEffect(() => {
    load()
  }, [load])

  // Reply-privately (round 4): arriving from a group with a message to
  // quote, passed through navigation state so nothing is refetched. Armed
  // once, then cleared so a back-and-forward does not re-arm it.
  useEffect(() => {
    if (!consumeReplyState) return
    const quote = location.state?.replyPrivatelyTo
    if (quote) {
      setReplyTo(quote)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => subscribeMessages(load), [load])
  useEffect(() => subscribeReactions(load), [load])

  // Mark what I can see as read — so the inbox's unread dot clears.
  useEffect(() => {
    if (!messages || !selfId) return
    const theirs = messages.filter((m) => m.author_id !== selfId).map((m) => m.id)
    if (theirs.length) markMessagesRead(selfId, theirs)
  }, [messages, selfId])

  // Stay pinned to the newest message unless the reader scrolled up into
  // history — the whole story lives in src/lib/useStayPinnedToBottom.js.
  useStayPinnedToBottom(messages, scrollRef)

  const isGroup = conversation?.kind === 'group'

  // My wallpaper for THIS chat — chat_prefs, keyed by the list's own row key
  // (rowKey in ChatList.jsx: 'dm-<id>' or 'group-<id>'). The kind arrives
  // with the conversation, so the fetch waits for it. Decoration: a failure
  // paints the default, never an error.
  const chatKey = conversation ? `${isGroup ? 'group' : 'dm'}-${conversationId}` : null
  useEffect(() => {
    if (!chatKey) return undefined
    let stale = false
    getMyChatPref(chatKey)
      .then((pref) => {
        if (!stale && pref?.background) setBackground(resolveBackground(pref.background))
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [chatKey])

  // The picker's landing point: paint now, persist for every device. A failed
  // write keeps the on-screen pick for this session — decoration again.
  function pickBackground(key) {
    setBackground(resolveBackground(key))
    if (selfId && chatKey) setChatPref(selfId, chatKey, { background: key }).catch(() => {})
  }

  const myMemberRow = isGroup ? members?.find((p) => p.profile_id === selfId) : null
  // Everyone in the chat but me — the set the ticks answer for. WhatsApp's
  // rule: ALL of them delivered/read, or the tick stays at the lower state.
  const recipientIds = isGroup
    ? (members ?? []).map((p) => p.profile_id).filter((id) => id !== selfId)
    : other?.id
      ? [other.id]
      : []
  const participant = isGroup
    ? Boolean(myMemberRow)
    : conversation && selfId && (selfId === conversation.profile_a || selfId === conversation.profile_b)
  const owner = Boolean(myMemberRow?.is_owner)
  const reviewing = conversation && admin && !participant

  // Round 3: my private label for somebody, or their real name. Applied at
  // every point a surface renders a person.
  const nameFor = (profileId, fallback) => (profileId && nicknames.get(profileId)) || fallback
  const otherName = nameFor(other?.id, other?.name)
  // The member line lives in the SCREEN since #434's person card: each name
  // is a PersonName needing the screen's cardFor state, so the screen builds
  // the JSX from `members` and `nameFor` here.

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
    setError(null)
    try {
      // Photo first, message second — the WhatsApp order, so a reader never
      // meets a message whose image has not arrived yet.
      const attachmentPath = photo ? await uploadChatPhoto(selfId, photo) : null
      await sendDirectMessage(conversationId, draft, { quotedId: replyTo?.id ?? null, attachmentPath })
      setDraft('')
      setReplyTo(null)
      clearPhoto()
      await load()
    } catch (err) {
      setError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  async function react(messageId, emoji, on) {
    try {
      await toggleReaction(messageId, selfId, emoji, on)
      await load()
    } catch (err) {
      setError(err.message || 'Could not react to that.')
    }
  }

  async function onRemove(id) {
    try {
      const gone = messages?.find((m) => m.id === id)
      await removeMessage(id)
      // The storage policy is own-folder-only, so only the author's delete
      // can reach the object; anybody else's remove leaves an orphan nobody
      // but its owner can read (src/data/chatMedia.js).
      if (gone?.attachment_path && gone.author_id === selfId) await removeChatPhoto(gone.attachment_path)
      await load()
    } catch (err) {
      setError(err.message || 'Could not remove that.')
    }
  }

  function startForward(id) {
    setSelecting(true)
    setSelected(new Set([id]))
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function cancelForward() {
    setSelecting(false)
    setSelected(new Set())
    setForwarding(false)
  }

  async function openForwardSheet() {
    setForwarding(true)
    if (forwardRows === null) {
      try {
        setForwardRows(await listChats())
      } catch (err) {
        setError(err.message || 'Could not load your chats.')
        setForwarding(false)
      }
    }
  }

  async function forwardTo(dest) {
    try {
      await forwardMessagesTo(dest, (messages ?? []).filter((m) => selected.has(m.id)))
      cancelForward()
      await load()
    } catch (err) {
      // The same refusal a typed message would get — can_dm, announce-only,
      // blocks — worded by the database, surfaced here.
      setError(err.message || 'Could not forward that.')
    }
  }

  async function onCopy(m) {
    try {
      await navigator.clipboard?.writeText?.(m.body ?? '')
    } catch {
      setError('Could not copy that.')
    }
  }

  async function onPin(m) {
    try {
      await setPinned(m.id, !m.pinned)
      await load()
    } catch (err) {
      setError(err.message || 'Could not pin that.')
    }
  }

  async function onStar(m) {
    try {
      await toggleStar(selfId, m.id, !stars.has(m.id))
      setStars(await listMyStars())
    } catch (err) {
      setError(err.message || 'Could not star that.')
    }
  }

  // From a group, quote this message into a DM with its author. Whether
  // the DM is allowed stays open_conversation's call; its refusal is the
  // database's words, same as the staff-tile button.
  async function onReplyPrivately(m) {
    try {
      const dm = await openConversation(m.author_id)
      goToDm(dm, { replyTo: m })
    } catch (err) {
      setError(err.message || 'Could not open a chat with them.')
    }
  }

  // Tapping an author's NAME in a group opens the 1:1 — no quote, just the
  // chat (25 Aug 2026). Same permission contract as onReplyPrivately above.
  async function openDmWith(profileId) {
    try {
      const dm = await openConversation(profileId)
      goToDm(dm)
    } catch (err) {
      setError(err.message || 'Could not open a chat with them.')
    }
  }

  async function submitReport(domEvent) {
    domEvent.preventDefault()
    try {
      await reportMessage(reporting, reason)
      setReporting(null)
      setReason('')
    } catch (err) {
      setError(err.message || 'Could not send the report.')
    }
  }

  return {
    selfId,
    conversationId,
    conversation,
    missing,
    messages,
    other,
    blocked,
    members,
    reactions,
    nicknames,
    setNicknames,
    stars,
    receipts,
    online,
    error,
    setError,
    background,
    pickBackground,
    isGroup,
    participant,
    owner,
    reviewing,
    recipientIds,
    nameFor,
    otherName,
    newFromRef,
    draft,
    setDraft,
    sending,
    replyTo,
    setReplyTo,
    photo,
    photoPreview,
    clearPhoto,
    pickPhoto,
    send,
    draftRef,
    fileRef,
    react,
    onRemove,
    onCopy,
    onPin,
    onStar,
    onReplyPrivately,
    openDmWith,
    selecting,
    selected,
    startForward,
    toggleSelected,
    cancelForward,
    forwardRows,
    forwarding,
    setForwarding,
    openForwardSheet,
    forwardTo,
    reporting,
    setReporting,
    reason,
    setReason,
    submitReport,
    reload: load,
  }
}
