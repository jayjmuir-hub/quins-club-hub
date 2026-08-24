import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ChatHeader from '../components/ChatHeader.jsx'
import { Empty } from '../components/Empty.jsx'
import { Avatar, RolePill } from '../components/NewChatPicker.jsx'
import Spinner from '../components/Spinner.jsx'
import NewGroupPicker from '../components/NewGroupPicker.jsx'
import {
  blockDm,
  deleteConversation,
  getConversation,
  leaveGroup,
  listDirectMessages,
  listGroupMembers,
  listMyBlocks,
  listMyConversations,
  logWelfareAccess,
  markMessagesRead,
  removeMessage,
  renameGroup,
  reportMessage,
  sendDirectMessage,
  subscribeMessages,
  unblockDm,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { postedLabel } from '../lib/notices.js'
import { isAdmin } from '../lib/scope.js'

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
  const [deleting, setDeleting] = useState(false)
  // Groups (claude/plans/2026-08-24-group-chats.md): same thread screen,
  // membership from conversation_members instead of the profile_a/b pair.
  const [members, setMembers] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [addingPeople, setAddingPeople] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const navigate = useNavigate()
  const bottomRef = useRef(null)
  const loggedRef = useRef(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [conv, rows, inbox, blocks] = await Promise.all([
        getConversation(conversationId),
        listDirectMessages(conversationId),
        listMyConversations(),
        listMyBlocks(),
      ])
      setConversation(conv)
      setMessages(rows)
      setMissing(!conv)
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
  useEffect(() => subscribeMessages(load), [load])

  // Mark what I can see as read — so the inbox's unread dot clears.
  useEffect(() => {
    if (!messages || !selfId) return
    const theirs = messages.filter((m) => m.author_id !== selfId).map((m) => m.id)
    if (theirs.length) markMessagesRead(selfId, theirs)
  }, [messages, selfId])

  useEffect(() => {
    if (messages?.length) bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages?.length])

  const isGroup = conversation?.kind === 'group'
  const myMemberRow = isGroup ? members?.find((p) => p.profile_id === selfId) : null
  const participant = isGroup
    ? Boolean(myMemberRow)
    : conversation && selfId && (selfId === conversation.profile_a || selfId === conversation.profile_b)
  const owner = Boolean(myMemberRow?.is_owner)
  const reviewing = conversation && admin && !participant

  async function send(domEvent) {
    domEvent.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      await sendDirectMessage(conversationId, draft)
      setDraft('')
      await load()
    } catch (err) {
      setError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
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
      await removeMessage(id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not remove that.')
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
          { label: 'Leave group', onClick: () => setLeaving(true) },
          ...(owner ? [{ label: 'Delete group', onClick: () => setDeleting(true), danger: true }] : []),
        ]
      : []
    : participant && other?.id
      ? [
          { label: blocked ? `Unblock ${other.name}` : `Block ${other.name}`, onClick: toggleBlock },
          { label: 'Delete chat', onClick: () => setDeleting(true), danger: true },
        ]
      : []

  return (
    <section className="px-1">
      <ChatHeader
        avatar={<Avatar name={isGroup ? conversation?.title : other?.name} staff={!isGroup && STAFF.has(other?.role)} size="sm" />}
        title={(isGroup ? conversation?.title : other?.name) ?? '…'}
        subtitle={
          reviewing
            ? 'Reviewing as a club admin'
            : isGroup
              ? `${members?.length ?? '…'} people`
              : `Private · you and ${other?.name ?? 'them'}`
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

      {/* ── The notice. Permanent on a DM; a GROUP renders none — Jay's
             ruling, claude/decisions/2026-08-24-groups-open-no-warnings.md.
             A reviewing admin still sees the "recorded" line: that one is
             about them, not a warning to members. ──────────────────────── */}
      {(!isGroup || reviewing) && (
      <div
        data-testid="dm-notice"
        className="mb-3 flex gap-2 rounded-[10px] bg-warn-bg px-3 py-2 text-[12.5px] leading-snug text-warn-ink"
      >
        <span aria-hidden="true">🛡</span>
        <p>
          {reviewing
            ? 'You are reviewing a private conversation as a club admin. This open has been recorded.'
            : conversation?.involves_minor
              ? `Private between you and ${other?.name ?? 'them'}. Club admins can review this conversation.`
              : `Private between you and ${other?.name ?? 'them'}. If a message is reported, club admins can review it.`}
        </p>
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
      <div className="flex flex-col gap-1.5">
        {messages?.map((m) => {
          const mine = m.author_id === selfId
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid="dm-bubble" data-mine={mine ? 'true' : 'false'}>
              <div className={`max-w-[80%] rounded-[14px] px-3 py-2 ${mine ? 'bg-chrome text-white' : 'bg-surface-card text-ink shadow-card'}`}>
                {isGroup && !mine && (
                  <p className="mb-0.5 text-[11px] font-extrabold text-brand-ink">{m.author?.full_name ?? 'Member'}</p>
                )}
                {m.deleted_at ? (
                  <p className="text-[13px] italic opacity-70">Message removed</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.4]">{m.body}</p>
                )}
                <div className={`mt-1 flex items-center gap-2 text-[10.5px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
                  <span>{postedLabel(m.created_at)}</span>
                  {mine && !m.deleted_at && (
                    <button type="button" onClick={() => onRemove(m.id)} className="underline-offset-2 hover:underline">
                      Delete
                    </button>
                  )}
                  {!mine && !m.deleted_at && (
                    <button type="button" onClick={() => setReporting(m.id)} className="underline-offset-2 hover:underline">
                      Report
                    </button>
                  )}
                </div>
              </div>
            </div>
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

      {participant && (
        <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-2 pt-2">
          {blocked ? (
            <p className="px-2 py-2 text-[13px] font-semibold text-ink-muted" data-testid="dm-blocked">
              You have blocked {other?.name}. Unblock to message them.
            </p>
          ) : (
            <form onSubmit={send} className="flex items-end gap-2" data-testid="dm-composer">
              <label className="sr-only" htmlFor="dm-draft">
                Message
              </label>
              <textarea
                id="dm-draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                maxLength={2000}
                placeholder={`Message ${(isGroup ? conversation?.title : other?.name) ?? ''}`}
                className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
              />
              <Button type="submit" disabled={sending || !draft.trim()}>
                Send
              </Button>
            </form>
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
