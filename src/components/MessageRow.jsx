import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import ChatBubble from './ChatBubble.jsx'
import FixtureCard from './FixtureCard.jsx'
import MentionPicker, { appendMention } from './MentionPicker.jsx'
import { labelForRole } from '../lib/scope.js'

// One post in a channel, as a BUBBLE, with its replies. The bubble itself
// is ChatBubble — the same shell the DM thread and the floating dock use —
// so this file cannot miss a language pass the way it missed #389 and the
// dock missed #410. Channel-only extras (staff pill, nested replies,
// fixture cards, read-stats, Pin, Report) are slots into that shell.
//
// ⚠️ A PURE-PROPS COMPONENT, like NoticeRow and for the same reason: a row
// that needs a database session to be looked at is a row that gets reviewed
// by reading its JSX. This one renders in the harness.

const STAFF_ROLES = new Set(['admin', 'coach', 'manager', 'medic'])

export function isStaffRole(role) {
  return STAFF_ROLES.has(role)
}

function RolePill({ role, title }) {
  return (
    <span className="ml-1 rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
      {title || labelForRole(role) || role}
    </span>
  )
}

function Reply({ reply, selfId, canModerate, onRemove, onAuthor }) {
  const staff = isStaffRole(reply.author_role)
  const mine = reply.author_id === selfId
  const menuItems =
    !reply.deleted_at && (mine || canModerate)
      ? [{ label: 'Delete', onClick: () => onRemove(reply.id), danger: true }]
      : []
  return (
    <div className="py-0.5">
      <ChatBubble
        mine={mine}
        messageId={reply.id}
        testId="message-reply"
        menuItems={menuItems}
        showAuthor={!mine}
        onAuthor={!mine && onAuthor ? () => onAuthor(reply.author_id) : null}
        authorLabel={reply.author?.full_name ?? 'Someone'}
        authorExtra={staff ? <RolePill role={reply.author_role} title={reply.author_title} /> : null}
        forwarded={Boolean(reply.forwarded)}
        deleted={Boolean(reply.deleted_at)}
        createdAt={reply.created_at}
        body={reply.body}
        photoPath={reply.attachment_path}
        edited={Boolean(reply.edited_at)}
        selfId={selfId}
      />
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
 * @param onReport(id, reason)  report a message to the club
 */
export default function MessageRow({
  message,
  selfId,
  canModerate = false,
  reactions = new Map(),
  onReact = null,
  readStat,
  unread = false,
  tally,
  mentionables = [],
  forceOpen = false,
  onReply,
  onRemove,
  onPin,
  onReport,
  // 25 Aug 2026: the squad channel grows the group-DM courtesies — a
  // private reply from the chevron menu, and a tappable author name. Both
  // optional; the screen supplies them only where a DM makes sense.
  onReplyPrivately,
  onAuthor,
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
  const tallies = reactions.get(message.id) ?? []

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

  const menuItems = message.deleted_at
    ? []
    : [
        ...(onReply ? [{ label: 'Reply', onClick: () => setOpen((v) => !v) }] : []),
        ...(!mine && onReplyPrivately
          ? [{ label: 'Reply privately', onClick: () => onReplyPrivately(message) }]
          : []),
        ...(canModerate && onPin ? [{ label: message.pinned ? 'Unpin' : 'Pin', onClick: () => onPin(message.id, !message.pinned) }] : []),
        ...((mine || canModerate) && onRemove ? [{ label: 'Delete', onClick: () => onRemove(message.id), danger: true }] : []),
        ...(!mine && onReport ? [{ label: 'Report', onClick: () => setReporting((v) => !v), danger: true }] : []),
      ]

  return (
    <article
      data-testid="message-row"
      data-staff={staff ? 'true' : 'false'}
      data-mine={mine ? 'true' : 'false'}
    >
      <ChatBubble
        mine={mine}
        messageId={message.id}
        testId="message-bubble"
        menuItems={menuItems}
        pinned={Boolean(message.pinned)}
        showAuthor={!mine}
        onAuthor={!mine && onAuthor ? () => onAuthor(message.author_id) : null}
        authorLabel={
          <>
            {unread && <span className="sr-only">New. </span>}
            {message.author?.full_name ?? 'Someone'}
          </>
        }
        authorExtra={staff ? <RolePill role={message.author_role} title={message.author_title} /> : null}
        forwarded={Boolean(message.forwarded)}
        deleted={Boolean(message.deleted_at)}
        createdAt={message.created_at}
        body={message.body}
        photoPath={message.attachment_path}
        edited={Boolean(message.edited_at)}
        lead={
          message.event ? (
            <div className="mb-2 mt-1">
              <FixtureCard event={message.event} tally={tally} />
            </div>
          ) : null
        }
        extra={
          <>
            {readStat && (
              <span data-testid="read-stat" className={`text-[10px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
                Read by {readStat.reads} of {readStat.audience}
              </span>
            )}
            {replies.length > 0 && !message.deleted_at && (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className={`mt-0.5 block text-[11px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}
                aria-expanded={open}
              >
                {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </>
        }
        reactions={tallies}
        selfId={selfId}
        onReact={onReact}
      />

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
          className="mt-1.5 w-full max-w-[88%] rounded-[12px] bg-surface-mute px-3 py-2"
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
        <p role="alert" className="mt-1 text-[12.5px] font-semibold text-danger-ink">
          {error}
        </p>
      )}

      {open && (
        <div className={`mt-1 w-full max-w-[88%] border-l-2 border-line pl-3 ${mine ? 'ml-auto' : ''}`}>
          {replies.map((reply) => (
            <Reply key={reply.id} reply={reply} selfId={selfId} canModerate={canModerate} onRemove={onRemove} onAuthor={onAuthor} />
          ))}
          {onReply && (
            <form onSubmit={submitReply} className="mt-1.5 flex items-end gap-2">
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
                placeholder="Reply"
                className="min-h-[40px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
              />
              <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
                Send
              </Button>
            </form>
          )}
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
