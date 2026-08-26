import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ChatBubble from '../components/ChatBubble.jsx'
import { usePresence } from '../lib/presence.js'
import ChatHeader from '../components/ChatHeader.jsx'
import EmojiPicker from '../components/EmojiPicker.jsx'
import { Empty } from '../components/Empty.jsx'
import { Avatar, RolePill } from '../components/NewChatPicker.jsx'
import Spinner from '../components/Spinner.jsx'
import NewGroupPicker from '../components/NewGroupPicker.jsx'
import { removeChatPhoto, uploadChatPhoto } from '../data/chatMedia.js'
import { listMyNicknames, setNickname } from '../data/nicknames.js'
import {
  blockDm,
  deleteConversation,
  forwardMessagesTo,
  listChats,
  listMyMessageReads,
  listMyStars,
  listReactions,
  getConversation,
  leaveGroup,
  listDirectMessages,
  listGroupMembers,
  listMyBlocks,
  listMyConversations,
  logWelfareAccess,
  markMessagesRead,
  openConversation,
  removeMessage,
  renameGroup,
  reportMessage,
  sendDirectMessage,
  setPinned,
  subscribeMessages,
  subscribeReactions,
  toggleReaction,
  toggleStar,
  unblockDm,
  listMessageReceipts,
  receiptState,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import ChatBackgroundPicker from '../components/ChatBackgroundPicker.jsx'
import { backgroundStyle, getChatBackground, setChatBackground } from '../lib/chatBackgrounds.js'
import { autoGrow, composerKeyDown, insertAtCursor } from '../lib/chatComposer.js'
import { dayLabel, daysDiffer } from '../lib/chatDays.js'
import { useMemberships } from '../lib/memberships.jsx'
import { postedLabel } from '../lib/notices.js'
import { isAdmin } from '../lib/scope.js'
import useStayPinnedToBottom from '../lib/useStayPinnedToBottom.js'
import { RowAvatar, scopeChatRows } from './ChatList.jsx'

// Direct messages — squad chat phase 3. claude/plans/2026-08-23-squad-chat.md.
//
// /chat/dm/:conversationId  one thread. (/chat/dm, the old inbox, redirects
// to the Chats list since 24 Aug 2026 — the list IS the inbox, and the
// pencil on it is "New message".)
//
// 24 Aug 2026, Jay: "need to be able to delete messages and entire chats".
// Delete on my own bubble (any time — the author's right) deletes it for
// good; "Delete chat" in the header menu deletes the conversation for BOTH
// (db/migrations/20260824_delete_for_good.sql). Jay: "completely".
//
// ⚠️ THE NOTICE AT THE TOP OF EVERY THREAD IS NOT SMALL PRINT. "Club admins
// can review this conversation" is the thing that makes a club DM different
// from a WhatsApp DM, and the reason a parent should prefer it. It cannot be
// dismissed. Jay's ruling, 23 Aug 2026: any admin may read; `welfare` only
// decides who sees the dashboard.
//
// ⚠️ WHO MAY MESSAGE WHOM IS NOT DECIDED HERE. dm_candidates() is the list;
// open_conversation() is the door; the trigger re-checks on every message.
// This screen shows what the database allows and nothing else.
//
// ⚠️ NO READ RECEIPTS IN A DM. Between a coach and a squad they are
// information; between two people they are pressure.

const STAFF = new Set(['admin', 'coach', 'manager', 'medic'])

// ── One thread ──────────────────────────────────────────────────────────────

function Thread({ conversationId }) {
  const { user } = useAuth()
  const { memberships, teams } = useMemberships()
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
  const [deleting, setDeleting] = useState(false)
  // Groups (claude/plans/2026-08-24-group-chats.md): same thread screen,
  // membership from conversation_members instead of the profile_a/b pair.
  const [members, setMembers] = useState(null)
  const [reactions, setReactions] = useState(() => new Map())
  const [renaming, setRenaming] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [addingPeople, setAddingPeople] = useState(false)
  const [leaving, setLeaving] = useState(false)
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
  // nicknames, and the device-level wallpaper.
  const [nicknames, setNicknames] = useState(() => new Map())
  const [nicknaming, setNicknaming] = useState(false)
  const [nickDraft, setNickDraft] = useState('')
  const [background, setBackground] = useState(getChatBackground)
  const [pickingBackground, setPickingBackground] = useState(false)
  // Round 4 (claude/plans/2026-08-24-chat-round-4.md): my private stars.
  const [stars, setStars] = useState(() => new Set())
  // Ticks (26 Aug 2026): receipts for MY messages, message id → sets.
  const [receipts, setReceipts] = useState(() => new Map())
  const online = usePresence(selfId)
  const navigate = useNavigate()
  const location = useLocation()
  const bottomRef = useRef(null)
  const loggedRef = useRef(false)
  const newFromRef = useRef(undefined)
  const draftRef = useRef(null)
  const fileRef = useRef(null)

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
  useStayPinnedToBottom(messages)

  const isGroup = conversation?.kind === 'group'
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
  // every point this screen renders a person.
  const nameFor = (profileId, fallback) => (profileId && nicknames.get(profileId)) || fallback
  const otherName = nameFor(other?.id, other?.name)
  // The WhatsApp header line: first names, "You" for the reader.
  const memberLine = isGroup && members?.length
    ? members
        .map((p) => (p.profile_id === selfId ? 'You' : nameFor(p.profile_id, p.full_name).split(' ')[0] || 'Member'))
        .join(', ')
    : null

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

  async function toggleBlock() {
    if (!other?.id) return
    try {
      if (blocked) await unblockDm(other.id)
      else await blockDm(other.id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not change that.')
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

  async function deleteChat() {
    try {
      await deleteConversation(conversationId)
      navigate('/chat')
    } catch (err) {
      setError(err.message || 'Could not delete this chat.')
      setDeleting(false)
    }
  }

  async function submitRename(domEvent) {
    domEvent.preventDefault()
    if (!newTitle.trim()) return
    try {
      await renameGroup(conversationId, newTitle.trim())
      setRenaming(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not rename the group.')
    }
  }

  async function leaveNow() {
    try {
      await leaveGroup(conversationId)
      navigate('/chat')
    } catch (err) {
      setError(err.message || 'Could not leave the group.')
      setLeaving(false)
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
      navigate(`/chat/dm/${dm}`, { state: { replyPrivatelyTo: m } })
    } catch (err) {
      setError(err.message || 'Could not open a chat with them.')
    }
  }

  // Tapping an author's NAME in a group opens the 1:1 — no quote, just the
  // chat (25 Aug 2026). Same permission contract as onReplyPrivately above.
  async function openDmWith(profileId) {
    try {
      const dm = await openConversation(profileId)
      navigate(`/chat/dm/${dm}`)
    } catch (err) {
      setError(err.message || 'Could not open a chat with them.')
    }
  }

  async function submitNickname(domEvent) {
    domEvent.preventDefault()
    try {
      // Empty = clear: their real name comes back everywhere.
      await setNickname(selfId, other.id, nickDraft)
      setNicknaming(false)
      setNicknames(await listMyNicknames())
    } catch (err) {
      setError(err.message || 'Could not save the nickname.')
    }
  }

  function pickBackground(key) {
    setChatBackground(key)
    setBackground(key)
    setPickingBackground(false)
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

  if (missing) {
    return (
      <section className="px-1">
        <div className="mb-3 mt-1 flex items-center gap-3">
          <Link to="/chat" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
            ← Chats
          </Link>
        </div>
        <Card className="p-6 text-center" data-testid="dm-missing">
          <p className="text-[14px] font-semibold text-ink">This conversation isn’t available to you.</p>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            A conversation between two adults is private to them unless a message in it is reported.
          </p>
        </Card>
      </section>
    )
  }

  // A group's menu is about the GROUP; a DM's is about the other person.
  // No Block in a group (block whom?), and only the owner reshapes it.
  const actions = isGroup
    ? participant
      ? [
          ...(owner
            ? [
                {
                  label: 'Rename group',
                  onClick: () => {
                    setNewTitle(conversation?.title ?? '')
                    setRenaming(true)
                  },
                },
                { label: 'Add people', onClick: () => setAddingPeople(true) },
              ]
            : []),
          { label: 'Chat background', onClick: () => setPickingBackground(true) },
          { label: 'Leave group', onClick: () => setLeaving(true) },
          ...(owner ? [{ label: 'Delete group', onClick: () => setDeleting(true), danger: true }] : []),
        ]
      : []
    : participant && other?.id
      ? [
          {
            label: `Nickname for ${otherName}`,
            onClick: () => {
              setNickDraft(nicknames.get(other.id) ?? '')
              setNicknaming(true)
            },
          },
          { label: 'Chat background', onClick: () => setPickingBackground(true) },
          { label: blocked ? `Unblock ${otherName}` : `Block ${otherName}`, onClick: toggleBlock },
          { label: 'Delete chat', onClick: () => setDeleting(true), danger: true },
        ]
      : []

  return (
    <section className="flex flex-1 flex-col px-1">
      <ChatHeader
        avatar={<Avatar name={isGroup ? conversation?.title : otherName} staff={!isGroup && STAFF.has(other?.role)} size="sm" />}
        title={(isGroup ? conversation?.title : otherName) ?? '…'}
        subtitle={
          reviewing
            ? 'Reviewing as a club admin'
            : isGroup
              ? // Round 3: "at the top it previews who is in the chat under
                // the name of the chat" — first names, You for the reader.
                (memberLine ?? `${members?.length ?? '…'} people`)
              : other?.id && online.has(other.id)
              ? 'Online'
              : `Private · you and ${otherName ?? 'them'}`
        }
        actions={actions}
      />
      {!isGroup && other?.role && STAFF.has(other.role) && (
        <div className="-mt-1 mb-2 px-1">
          <RolePill role={other.role} />
        </div>
      )}

      {renaming && (
        <form onSubmit={submitRename} className="mb-3 rounded-card bg-surface-card p-3 shadow-card" data-testid="rename-form">
          <label htmlFor="group-title" className="text-[12.5px] font-extrabold text-ink">
            Group name
          </label>
          <input
            id="group-title"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={80}
            autoFocus
            className="mt-1.5 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!newTitle.trim()}>
              Save
            </Button>
          </div>
        </form>
      )}

      {nicknaming && (
        <form onSubmit={submitNickname} className="mb-3 rounded-card bg-surface-card p-3 shadow-card" data-testid="nickname-form">
          <label htmlFor="nickname" className="text-[12.5px] font-extrabold text-ink">
            Your nickname for {other?.name}
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">Only you see it. Leave empty to go back to their real name.</p>
          <input
            id="nickname"
            type="text"
            value={nickDraft}
            onChange={(e) => setNickDraft(e.target.value)}
            maxLength={40}
            autoFocus
            className="mt-1.5 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNicknaming(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit">
              Save
            </Button>
          </div>
        </form>
      )}

      <ChatBackgroundPicker open={pickingBackground} onClose={() => setPickingBackground(false)} current={background} onPick={pickBackground} />

      {addingPeople && (
        <NewGroupPicker
          mode="add"
          conversationId={conversationId}
          onCreated={() => {
            setAddingPeople(false)
            load()
          }}
          onClose={() => setAddingPeople(false)}
        />
      )}

      {leaving && (
        <Card className="mb-3 px-4 py-3" data-testid="leave-group-confirm">
          <p className="text-[13.5px] font-extrabold text-ink">Leave this group?</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {(members?.length ?? 0) <= 3
              ? 'You’re one of three — leaving closes this group for everyone.'
              : 'You’ll stop seeing its messages. The group carries on without you.'}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={leaveNow}>
              Leave group
            </Button>
          </div>
        </Card>
      )}

      {deleting && (
        <Card className="mb-3 px-4 py-3" data-testid="delete-chat-confirm">
          <p className="text-[13.5px] font-extrabold text-ink">{isGroup ? 'Delete this group?' : 'Delete this chat?'}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {isGroup
              ? 'Every message in it is deleted for everyone. This cannot be undone.'
              : 'Every message in it is deleted for both of you. This cannot be undone.'}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={deleteChat}>
              {isGroup ? 'Delete group' : 'Delete chat'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── The notice is REVIEWING-ONLY since 26 Aug 2026 — Jay: "remove
             the club admins can review notice", pointing at the dock, which
             never showed it. The member-facing "admins can review" line was
             the 23 Aug permanent-notice ruling; Jay reversed it (addendum in
             claude/decisions/2026-08-24-groups-open-no-warnings.md). The
             REVIEWING banner stays: it is about the admin in the room —
             "this open has been recorded" — not a warning to members, and
             removing it would hide an access that IS logged. ───────────── */}
      {reviewing && (
      <div
        data-testid="dm-notice"
        className="mb-3 flex gap-2 rounded-[10px] bg-warn-bg px-3 py-2 text-[12.5px] leading-snug text-warn-ink"
      >
        <span aria-hidden="true">🛡</span>
        <p>You are reviewing a private conversation as a club admin. This open has been recorded.</p>
      </div>
      )}

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {messages === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}
      {messages?.length === 0 && <Empty message="Say hello." />}
      {/* Round 4: pinned messages ride a banner at the top; tap jumps.
          Anyone in the chat pinned them (the WhatsApp-default ruling). */}
      {(messages ?? []).some((m) => m.pinned && !m.deleted_at) && (
        <div className="mb-2 rounded-[10px] border border-line bg-surface-card px-2.5 py-1.5 shadow-card" data-testid="pinned-banner">
          {(messages ?? []).filter((m) => m.pinned && !m.deleted_at).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => document.getElementById(`msg-${m.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })}
              className="flex w-full items-center gap-2 py-0.5 text-left"
            >
              <span aria-hidden="true" className="text-[12px]">📌</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
                <span className="font-bold text-ink">{m.author_id === selfId ? 'You' : nameFor(m.author_id, m.author?.full_name ?? 'Member')}: </span>
                {m.body?.trim() ? m.body : '📷 Photo'}
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Round 3: the wallpaper — a low-alpha overlay on the stream only,
          so the composer and header stay on the plain surface.
          ⚠️ flex-1 + justify-end MAKE THE WALLPAPER THE SLACK-EATER (26 Aug
          2026, Jay's screenshot: with few messages the paper was a small
          patch over the bubbles and the empty area above was bare surface).
          The wrapper grows to fill main's surplus and bottom-aligns its
          bubbles, so the paper covers the whole message area however short
          the thread — and the composer stays the document bottom, which is
          what the keyboard fix relies on (AppShell's <main> comment). Both
          classes are no-ops once the thread is taller than the viewport. */}
      <div className="-mx-1 flex flex-1 flex-col justify-end gap-1 rounded-[12px] px-2 py-1" style={backgroundStyle(background) ?? undefined} data-background={background}>
        {messages?.map((m, index) => {
          const mine = m.author_id === selfId
          const authorName = mine ? 'You' : nameFor(m.author_id, m.author?.full_name ?? 'Member')
          const tallies = reactions.get(m.id) ?? []
          // Round 4: the chevron menu carries every action; the screen
          // decides the list, ChatBubble only draws it.
          const menuItems = !participant || m.deleted_at || selecting
            ? []
            : [
                { label: 'Reply', onClick: () => { setReplyTo(m); draftRef.current?.focus?.() } },
                { label: 'Forward', onClick: () => startForward(m.id) },
                ...(m.body?.trim() ? [{ label: 'Copy', onClick: () => onCopy(m) }] : []),
                { label: m.pinned ? 'Unpin' : 'Pin', onClick: () => onPin(m) },
                { label: stars.has(m.id) ? 'Unstar' : 'Star', onClick: () => onStar(m) },
                ...(isGroup && !mine ? [{ label: 'Reply privately', onClick: () => onReplyPrivately(m) }] : []),
                ...(mine
                  ? [{ label: 'Delete', onClick: () => onRemove(m.id), danger: true }]
                  : [{ label: 'Report', onClick: () => setReporting(m.id), danger: true }]),
              ]
          // The quote block. A HARD-deleted original nulls quoted_id
          // (FK set null) and the block simply goes; a soft-deleted
          // one keeps the pointer and says so without re-showing a
          // word of the deleted content.
          // ⚠️ `?.id`, NOT truthiness. A reverse-direction embed once
          // made `quoted` an EMPTY ARRAY on every message — truthy —
          // and every bubble grew a phantom chip (24 Aug 2026, live).
          // An object with an id is the only shape worth drawing.
          const quote = m.quoted?.id && !m.deleted_at
            ? (m.quoted.deleted_at ? (
                <p className={`mb-1 mt-0.5 rounded-[8px] border-l-2 px-2 py-1 text-[12px] italic ${mine ? 'border-white/40 bg-white/10 text-white/70' : 'border-line bg-surface-mute text-ink-faint'}`} data-testid="quote-block">
                  Message deleted
                </p>
              ) : (
                <button
                  type="button"
                  data-testid="quote-block"
                  onClick={() => document.getElementById(`msg-${m.quoted.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })}
                  className={`mb-1 mt-0.5 block w-full rounded-[8px] border-l-2 px-2 py-1 text-left ${mine ? 'border-white/40 bg-white/10' : 'border-brand bg-surface-mute'}`}
                >
                  <span className={`block text-[11px] font-extrabold ${mine ? 'text-white/80' : 'text-brand-ink'}`}>
                    {m.quoted.author_id === selfId ? 'You' : nameFor(m.quoted.author_id, m.quoted.author?.full_name ?? 'Member')}
                  </span>
                  <span className={`block truncate text-[12px] ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
                    {m.quoted.body?.trim() ? m.quoted.body : '📷 Photo'}
                  </span>
                </button>
              ))
            : null
          return (
            <Fragment key={m.id}>
              {daysDiffer(messages[index - 1]?.created_at, m.created_at) && (
                <div className="my-1.5 flex justify-center" data-testid="day-divider" role="separator">
                  <span className="rounded-pill bg-surface-mute px-2.5 py-0.5 text-[11px] font-bold text-ink-muted shadow-card">
                    {dayLabel(m.created_at)}
                  </span>
                </div>
              )}
              {newFromRef.current === m.id && (
                <div className="my-1.5 flex items-center gap-2" data-testid="new-divider" role="separator" aria-label="New messages">
                  <span aria-hidden="true" className="h-px flex-1 bg-brand/40" />
                  <span className="font-condensed text-[11px] font-bold uppercase tracking-[.14em] text-brand-ink">New</span>
                  <span aria-hidden="true" className="h-px flex-1 bg-brand/40" />
                </div>
              )}
              <ChatBubble
                mine={mine}
                messageId={m.id}
                receipt={mine ? receiptState(receipts.get(m.id), recipientIds) : null}
                testId="dm-bubble"
                id={`msg-${m.id}`}
                selected={selecting && selected.has(m.id)}
                onSelect={selecting && !m.deleted_at ? () => toggleSelected(m.id) : undefined}
                menuItems={menuItems}
                pinned={Boolean(m.pinned)}
                showAuthor={isGroup && !mine}
                onAuthor={isGroup && !mine ? () => openDmWith(m.author_id) : null}
                authorLabel={authorName}
                forwarded={Boolean(m.forwarded)}
                quote={quote}
                deleted={Boolean(m.deleted_at)}
                createdAt={m.created_at}
                body={m.body}
                photoPath={m.attachment_path}
                reactions={tallies}
                selfId={selfId}
                onReact={participant ? react : null}
                hideTrigger={selecting}
              />
            </Fragment>
          )
        })}
      </div>
      <div ref={bottomRef} />

      {reporting && (
        <form onSubmit={submitReport} className="mt-3 rounded-card bg-surface-card p-3 shadow-card" data-testid="report-form">
          <label htmlFor="report-reason" className="text-[12.5px] font-extrabold text-ink">
            Report this message to the club
          </label>
          <textarea
            id="report-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="What is wrong with it?"
            className="mt-1.5 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setReporting(null)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!reason.trim()}>
              Send report
            </Button>
          </div>
        </form>
      )}

      {forwarding && (
        <Card className="mt-3 p-3" data-testid="forward-sheet">
          <p className="text-[12.5px] font-extrabold text-ink">
            Forward {selected.size === 1 ? 'this message' : `${selected.size} messages`} to
          </p>
          {forwardRows === null ? (
            <div className="py-4">
              <Spinner />
            </div>
          ) : (
            <ul className="mt-1.5">
              {scopeChatRows(forwardRows, memberships, teams)
                ?.filter((row) => row.conversation_id !== conversationId)
                .map((row) => (
                  <li key={`${row.kind}-${row.team_id ?? row.conversation_id ?? 'club'}`} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      data-testid="forward-dest"
                      onClick={() => forwardTo(row)}
                      className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface-mute"
                    >
                      <RowAvatar row={row} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{row.label}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => setForwarding(false)}>
              Back
            </Button>
          </div>
        </Card>
      )}

      {participant && selecting && !forwarding && (
        <div className="sticky bottom-0 -mx-1 mt-3 flex items-center gap-2 border-t border-line bg-surface px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 desktop:pb-2" data-testid="forward-bar">
          <p className="flex-1 text-[13px] font-semibold text-ink">
            {selected.size} selected — tap messages to add
          </p>
          <Button size="sm" variant="ghost" onClick={cancelForward}>
            Cancel
          </Button>
          <Button size="sm" disabled={!selected.size} onClick={openForwardSheet}>
            Forward
          </Button>
        </div>
      )}

      {/* Chrome-free conversations: bottom-0, safe-area in the padding —
          same reasoning as Chat.jsx's composer. */}
      {participant && !selecting && (
        <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 desktop:pb-2">
          {blocked ? (
            <p className="px-2 py-2 text-[13px] font-semibold text-ink-muted" data-testid="dm-blocked">
              You have blocked {otherName}. Unblock to message them.
            </p>
          ) : (
            <>
              {replyTo && (
                <div className="mb-1.5 flex items-center gap-2 rounded-[10px] border-l-2 border-brand bg-surface-mute px-2.5 py-1.5" data-testid="quote-preview">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-extrabold text-brand-ink">
                      Replying to {replyTo.author_id === selfId ? 'yourself' : nameFor(replyTo.author_id, replyTo.author?.full_name ?? 'Member')}
                    </p>
                    <p className="truncate text-[12px] text-ink-muted">{replyTo.body?.trim() ? replyTo.body : '📷 Photo'}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => setReplyTo(null)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              )}
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
              <form onSubmit={send} className="flex items-end gap-2" data-testid="dm-composer">
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
                <label className="sr-only" htmlFor="dm-draft">
                  Message
                </label>
                {/* The greeting is FIRST name only (Jay, 25 Aug 2026) — the
                    full name is the header's job. Groups keep their title. */}
                <textarea
                  id="dm-draft"
                  ref={draftRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onInput={(e) => autoGrow(e.currentTarget)}
                  onKeyDown={composerKeyDown}
                  rows={1}
                  maxLength={2000}
                  placeholder={`Message ${(isGroup ? conversation?.title : otherName?.split(' ')[0]) ?? ''}`}
                  className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
                <EmojiPicker onPick={(emoji) => setDraft(insertAtCursor(draftRef.current, emoji))} />
                <Button type="submit" disabled={sending || (!draft.trim() && !photo)}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      )}
      {reviewing && (
        <p className="mt-3 px-2 text-[12.5px] font-semibold text-ink-muted" data-testid="dm-readonly">
          Read-only. You are not part of this conversation.
        </p>
      )}
    </section>
  )
}

export default function DirectMessages() {
  const { conversationId } = useParams()
  return conversationId ? <Thread conversationId={conversationId} /> : <Navigate to="/chat" replace />
}
