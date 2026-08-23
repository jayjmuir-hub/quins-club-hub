import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import FixtureCard from './FixtureCard.jsx'
import MentionPicker, { appendMention } from './MentionPicker.jsx'
import { postedLabel } from '../lib/notices.js'
import { initials } from '../lib/playerFormat.js'
import { labelForRole } from '../lib/scope.js'

// One post in a squad channel, with its replies.
//
// ⚠️ A PURE-PROPS COMPONENT, like NoticeRow and for the same reason: a row
// that needs a database session to be looked at is a row that gets reviewed
// by reading its JSX. This one renders in the harness.
//
// ⚠️ STAFF POSTS LOOK DIFFERENT, AND THAT IS THE WHOLE SIGNAL/NOISE DESIGN.
// A brand-red left rule and a role pill on a coach's or manager's post; a
// plain card for a family's. Colour is not the only channel — the pill says
// the role in words (claude/specs/accessibility.md). The squad chat plan's
// argument was that WhatsApp cannot separate the two; this is where it
// happens.
//
// ⚠️ INITIALS, NEVER A PHOTO. No child's face is ever in a chat, and the
// adults have no photos in the app today anyway.

const STAFF_ROLES = new Set(['admin', 'coach', 'manager', 'medic'])

export function isStaffRole(role) {
  return STAFF_ROLES.has(role)
}

function Avatar({ name, staff }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-ink-invert ${
        staff ? 'bg-monogram-coach' : 'bg-monogram-manager'
      }`}
    >
      {initials(name ?? '?')}
    </span>
  )
}

function Body({ message }) {
  if (message.deleted_at) {
    return <p className="text-[14px] italic text-ink-faint">Message removed</p>
  }
  return (
    <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45] text-ink">
      {message.body}
      {message.edited_at && (
        <span className="ml-1.5 text-[11px] font-semibold text-ink-faint">(edited)</span>
      )}
    </p>
  )
}

function Reply({ reply, selfId, canModerate, onRemove }) {
  const staff = isStaffRole(reply.author_role)
  const mine = reply.author_id === selfId
  return (
    <div className="flex gap-2.5 py-2" data-testid="message-reply">
      <Avatar name={reply.author?.full_name} staff={staff} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-extrabold text-ink">{reply.author?.full_name ?? 'Someone'}</span>
          {staff && (
            <span className="rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
              {reply.author_title || labelForRole(reply.author_role) || reply.author_role}
            </span>
          )}
          <span className="text-[11.5px] font-semibold text-ink-faint">{postedLabel(reply.created_at)}</span>
          {!reply.deleted_at && (mine || canModerate) && (
            <button
              type="button"
              onClick={() => onRemove(reply.id)}
              className="text-[11.5px] font-semibold text-ink-faint underline-offset-2 hover:text-danger-ink hover:underline"
            >
              Remove
            </button>
          )}
        </div>
        <Body message={reply} />
      </div>
    </div>
  )
}

/**
 * @param message      a top-level post with `replies`
 * @param selfId       the viewer's profile id
 * @param canModerate  squad staff — may remove any message and pin
 * @param readStat     { reads, audience } for staff, else undefined
 * @param unread       true when the viewer has not read it yet
 * @param tally        { in, maybe, out } for a fixture thread, if loaded
 * @param mentionables people the reply composer may @mention
 * @param forceOpen    open the thread on mount (the ?thread= deep link)
 * @param onReply(id, body, { mentions }), onRemove(id), onPin(id, pinned)
 * @param onReport(id, reason)  phase 3 — report a message to the club
 */
export default function MessageRow({
  message,
  selfId,
  canModerate = false,
  readStat,
  unread = false,
  tally,
  mentionables = [],
  forceOpen = false,
  onReply,
  onRemove,
  onPin,
  onReport,
}) {
  const [open, setOpen] = useState(forceOpen)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [draft, setDraft] = useState('')
  const [mentions, setMentions] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  const staff = isStaffRole(message.author_role)
  const mine = message.author_id === selfId
  const replies = message.replies ?? []

  async function submitReply(domEvent) {
    domEvent.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      // Only ids whose @Name is still in the text — deleting the name
      // un-mentions. The trigger filters to the squad regardless.
      const kept = mentions.filter((m) => draft.includes(`@${m.full_name}`)).map((m) => m.profile_id)
      await onReply(message.id, draft, { mentions: kept })
      setDraft('')
      setMentions([])
    } catch (err) {
      setError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  return (
    <article
      data-testid="message-row"
      data-staff={staff ? 'true' : 'false'}
      className={`mb-2.5 overflow-hidden rounded-card bg-surface-card shadow-card ${
        staff ? 'border-l-[3px] border-brand' : ''
      }`}
    >
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <Avatar name={message.author?.full_name} staff={staff} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-extrabold leading-tight text-ink">
              {unread && (
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand align-middle" aria-hidden="true" />
              )}
              {unread && <span className="sr-only">New. </span>}
              {message.author?.full_name ?? 'Someone'}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {staff && (
                <span className="rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
                  {message.author_title || labelForRole(message.author_role) || message.author_role}
                </span>
              )}
              {message.pinned && (
                <span className="rounded-[6px] bg-surface-mute px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[.4px] text-ink-muted">
                  Pinned
                </span>
              )}
            </div>
          </div>
          <span className="shrink-0 self-start text-[11.5px] font-semibold text-ink-faint">
            {postedLabel(message.created_at)}
          </span>
        </div>

        {message.event && (
          <div className="mt-2.5">
            <FixtureCard event={message.event} tally={tally} />
          </div>
        )}

        <div className="mt-2.5">
          <Body message={message} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-ink-muted">
          {!message.deleted_at && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="text-brand-ink underline-offset-2 hover:underline"
              aria-expanded={open}
            >
              {replies.length === 0 ? 'Reply' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
            </button>
          )}
          {/* ⚠️ THE ONE THING WHATSAPP CANNOT TELL A COACH. Staff only — the
              stats function returns rows to nobody else. */}
          {readStat && (
            <span data-testid="read-stat">
              Read by {readStat.reads} of {readStat.audience}
            </span>
          )}
          {canModerate && !message.deleted_at && (
            <button type="button" onClick={() => onPin(message.id, !message.pinned)} className="hover:text-ink">
              {message.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {!message.deleted_at && (mine || canModerate) && (
            <button type="button" onClick={() => onRemove(message.id)} className="hover:text-danger-ink">
              Remove
            </button>
          )}
          {!message.deleted_at && !mine && onReport && (
            <button type="button" onClick={() => setReporting((v) => !v)} className="hover:text-ink" aria-expanded={reporting}>
              Report
            </button>
          )}
        </div>
        {reporting && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!reason.trim()) return
              try {
                await onReport(message.id, reason)
                setReporting(false)
                setReason('')
              } catch (err) {
                setError(err.message || 'Could not send the report.')
              }
            }}
            className="mt-2 rounded-[10px] bg-surface-mute px-3 py-2"
            data-testid="report-form"
          >
            <label htmlFor={`report-${message.id}`} className="text-[12px] font-extrabold text-ink">
              Report this message to the club
            </label>
            <textarea
              id={`report-${message.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="What is wrong with it?"
              className="mt-1 w-full rounded-[8px] border border-line bg-surface-card px-2.5 py-1.5 text-[13px] text-ink"
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setReporting(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" disabled={!reason.trim()}>
                Send report
              </Button>
            </div>
          </form>
        )}
        {error && !open && (
          <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-danger-ink">
            {error}
          </p>
        )}
      </div>

      {open && (
        <div className="border-t border-line bg-surface-mute/60 px-3.5 pb-3 pt-1">
          {replies.map((reply) => (
            <Reply key={reply.id} reply={reply} selfId={selfId} canModerate={canModerate} onRemove={onRemove} />
          ))}
          <form onSubmit={submitReply} className="mt-2 flex items-end gap-2">
            <MentionPicker
              people={mentionables}
              onPick={(p) => {
                setDraft((d) => appendMention(d, p))
                setMentions((m) => (m.some((x) => x.profile_id === p.profile_id) ? m : [...m, p]))
              }}
            />
            <label className="sr-only" htmlFor={`reply-${message.id}`}>
              Reply
            </label>
            <textarea
              id={`reply-${message.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              maxLength={2000}
              placeholder="Reply to the thread"
              className="min-h-[40px] flex-1 resize-none rounded-[10px] border border-line bg-surface-card px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
            />
            <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
              Send
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-danger-ink">
              {error}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
