import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { Empty } from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  blockDm,
  getConversation,
  listDirectMessages,
  listDmCandidates,
  listMyBlocks,
  listMyConversations,
  logWelfareAccess,
  markMessagesRead,
  openConversation,
  reportMessage,
  sendDirectMessage,
  subscribeMessages,
  unblockDm,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { postedLabel } from '../lib/notices.js'
import { initials } from '../lib/playerFormat.js'
import { isAdmin, labelForRole } from '../lib/scope.js'

// Direct messages — squad chat phase 3. claude/plans/2026-08-23-squad-chat.md.
//
// /chat/dm                  the inbox, and "New message"
// /chat/dm/:conversationId  one thread
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

function Avatar({ name, staff }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-ink-invert ${
        staff ? 'bg-monogram-coach' : 'bg-monogram-manager'
      }`}
    >
      {initials(name ?? '?')}
    </span>
  )
}

function RolePill({ role }) {
  if (!STAFF.has(role)) return null
  return (
    <span className="rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
      {labelForRole(role) ?? role}
    </span>
  )
}

// ── The inbox ───────────────────────────────────────────────────────────────

function Inbox() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [picking, setPicking] = useState(false)
  const [candidates, setCandidates] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRows(await listMyConversations())
    } catch (err) {
      setError(err.message || 'We could not load your messages just now.')
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeMessages(load), [load])

  async function openPicker() {
    setPicking(true)
    if (candidates === null) {
      try {
        setCandidates(await listDmCandidates())
      } catch {
        setCandidates([])
      }
    }
  }

  async function start(person) {
    try {
      const id = await openConversation(person.profile_id)
      navigate(`/chat/dm/${id}`)
    } catch (err) {
      setError(err.message || 'Could not start that conversation.')
      setPicking(false)
    }
  }

  return (
    <section className="px-1">
      <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Kicker>Direct messages</Kicker>
          <AccentTitle lead="Your" accent="messages." />
        </div>
        <div className="flex items-center gap-2">
          <Link to="/chat" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
            Squads
          </Link>
          <Button size="sm" onClick={openPicker} data-testid="new-message">
            New message
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {picking && (
        <Card className="mb-3 overflow-hidden" data-testid="dm-picker">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-[12px] font-extrabold uppercase tracking-[.5px] text-ink-muted">People you can message</p>
            <button type="button" onClick={() => setPicking(false)} className="text-[12px] font-bold text-ink-muted hover:text-ink">
              Close
            </button>
          </div>
          {candidates === null ? (
            <div className="py-6">
              <Spinner />
            </div>
          ) : candidates.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-muted">Nobody yet — the people in your squads appear here once they have joined.</p>
          ) : (
            <ul>
              {candidates.map((p) => (
                <li key={p.profile_id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => start(p)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-mute"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-extrabold text-ink">{p.full_name}</span>
                      {p.via_team && <span className="block text-[11.5px] font-semibold text-ink-faint">{p.via_team}</span>}
                    </span>
                    <RolePill role={p.role} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* ⚠️ THE LINE THAT EXPLAINS THE LIST. Other families in other
              squads are not an omission; the squad channel is for them. */}
          <p className="border-t border-line bg-surface-mute px-4 py-2 text-[11.5px] text-ink-muted">
            Only people you share a squad with, and the club&rsquo;s staff. For anyone else, use the squad channel.
          </p>
        </Card>
      )}

      {rows === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}
      {rows?.length === 0 && !picking && <Empty message="No messages yet. Start one with New message." />}
      {rows?.map((c) => (
        <Link
          key={c.conversation_id}
          to={`/chat/dm/${c.conversation_id}`}
          data-testid="conversation-row"
          className="mb-2 flex items-center gap-3 rounded-card bg-surface-card px-3.5 py-3 shadow-card hover:bg-surface-mute"
        >
          <Avatar name={c.other_name} staff={STAFF.has(c.other_role)} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[14px] font-extrabold text-ink">{c.other_name}</span>
                <RolePill role={c.other_role} />
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold text-ink-faint">{postedLabel(c.last_at)}</span>
            </span>
            <span className={`block truncate text-[13px] ${c.unread ? 'font-bold text-ink' : 'text-ink-muted'}`}>
              {c.last_body ?? 'No messages yet'}
            </span>
          </span>
          {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
        </Link>
      ))}
    </section>
  )
}

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
      const mine = inbox.find((c) => c.conversation_id === conversationId)
      const otherId = conv ? (conv.profile_a === selfId ? conv.profile_b : conv.profile_a) : null
      setOther(
        mine
          ? { id: mine.other_id, name: mine.other_name, role: mine.other_role }
          : { id: otherId, name: rows.find((m) => m.author_id !== selfId)?.author?.full_name ?? 'Conversation', role: null },
      )
      setBlocked(otherId ? blocks.has(otherId) : false)
      // An admin reading somebody else's conversation: record it, once per
      // visit. A participant's own open is not a review and logs nothing.
      if (conv && admin && selfId && selfId !== conv.profile_a && selfId !== conv.profile_b && !loggedRef.current) {
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

  const participant = conversation && selfId && (selfId === conversation.profile_a || selfId === conversation.profile_b)
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
          <Link to="/chat/dm" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
            ← Messages
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

  return (
    <section className="px-1">
      <div className="mb-3 mt-1 flex items-center gap-3">
        <Link to="/chat/dm" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
          ← Messages
        </Link>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={other?.name} staff={STAFF.has(other?.role)} />
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-extrabold leading-tight text-ink">{other?.name ?? '…'}</h2>
          <div className="mt-0.5 flex items-center gap-1.5">
            <RolePill role={other?.role} />
            {participant && other?.id && (
              <button type="button" onClick={toggleBlock} className="text-[11.5px] font-semibold text-ink-faint underline-offset-2 hover:underline">
                {blocked ? 'Unblock' : 'Block'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── The notice. Permanent. ─────────────────────────────────────── */}
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
                {m.deleted_at ? (
                  <p className="text-[13px] italic opacity-70">Message removed</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.4]">{m.body}</p>
                )}
                <div className={`mt-1 flex items-center gap-2 text-[10.5px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
                  <span>{postedLabel(m.created_at)}</span>
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
                placeholder={`Message ${other?.name ?? ''}`}
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
  return conversationId ? <Thread conversationId={conversationId} /> : <Inbox />
}
