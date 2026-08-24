import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import ChatPhoto from './ChatPhoto.jsx'
import FixtureCard from './FixtureCard.jsx'
import MentionPicker, { appendMention } from './MentionPicker.jsx'
import { postedLabel, stampLabel } from '../lib/notices.js'
import ReactionBar from './ReactionBar.jsx'
import { initials } from '../lib/playerFormat.js'
import { labelForRole } from '../lib/scope.js'

// One post in a channel, as a BUBBLE, with its replies — 24 Aug 2026, the
// WhatsApp reshape. Mine on the right, everyone else's on the left with
// their name. Same props, same test ids as the card it replaced.
//
// ⚠️ A PURE-PROPS COMPONENT, like NoticeRow and for the same reason: a row
// that needs a database session to be looked at is a row that gets reviewed
// by reading its JSX. This one renders in the harness.
//
// ⚠️ STAFF POSTS STILL LOOK DIFFERENT, AND THAT IS THE WHOLE SIGNAL/NOISE
// DESIGN. A brand-red rule down the left of a coach's or manager's bubble and
// a role pill by their name; a plain bubble for a family's. Colour is not the
// only channel — the pill says the role in words (claude/specs/accessibility.md).
//
// ⚠️ INITIALS, NEVER A PHOTO. No child's face is ever in a chat.

const STAFF_ROLES = new Set(['admin', 'coach', 'manager', 'medic'])

export function isStaffRole(role) {
  return STAFF_ROLES.has(role)
}

function Avatar({ name, staff }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-7 w-7 shrink-0 place-items-center self-end rounded-full text-[10px] font-extrabold text-ink-invert ${
        staff ? 'bg-monogram-coach' : 'bg-monogram-manager'
      }`}
    >
      {initials(name ?? '?')}
    </span>
  )
}

function Body({ message, mine }) {
  if (message.deleted_at) {
    return <p className={`text-[13.5px] italic ${mine ? 'text-white/70' : 'text-ink-faint'}`}>Message removed</p>
  }
  // Round 2: a forward wears its tag, a photo renders above whatever text
  // rode with it, and a photo-only message renders no empty paragraph.
  return (
    <>
      {message.forwarded && (
        <p className={`text-[11px] italic ${mine ? 'text-white/60' : 'text-ink-faint'}`} data-testid="forwarded-tag">
          Forwarded
        </p>
      )}
      {message.attachment_path && <ChatPhoto path={message.attachment_path} />}
      {message.body?.trim() ? (
        <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.4]">
          {message.body}
          {message.edited_at && <span className={`ml-1.5 text-[11px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>(edited)</span>}
        </p>
      ) : null}
    </>
  )
}

function RolePill({ role, title }) {
  return (
    <span className="rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
      {title || labelForRole(role) || role}
    </span>
  )
}

function Reply({ reply, selfId, canModerate, onRemove }) {
  const staff = isStaffRole(reply.author_role)
  const mine = reply.author_id === selfId
  return (
    <div className="flex gap-2 py-1.5" data-testid="message-reply">
      <Avatar name={reply.author?.full_name} staff={staff} />
      <div className="min-w-0 flex-1 rounded-[12px] rounded-bl-[4px] bg-surface-card px-3 py-2 shadow-card">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[12.5px] font-extrabold text-ink">{reply.author?.full_name ?? 'Someone'}</span>
          {staff && <RolePill role={reply.author_role} title={reply.author_title} />}
          <span className="text-[11px] font-semibold text-ink-faint">{postedLabel(reply.created_at)}</span>
          {!reply.deleted_at && (mine || canModerate) && (
            <button
              type="button"
              onClick={() => onRemove(reply.id)}
              className="text-[11px] font-semibold text-ink-faint underline-offset-2 hover:text-danger-ink hover:underline"
            >
              Delete
            </button>
          )}
        </div>
        <div className="text-ink">
          <Body message={reply} mine={false} />
        </div>
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

  const meta = mine ? 'text-white/70' : 'text-ink-faint'

  return (
    <article
      data-testid="message-row"
      data-staff={staff ? 'true' : 'false'}
      data-mine={mine ? 'true' : 'false'}
      className={`mb-2 flex flex-col ${mine ? 'items-end' : 'items-start'}`}
    >
      <div className={`flex max-w-[88%] gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
        {!mine && <Avatar name={message.author?.full_name} staff={staff} />}
        <div
          className={`min-w-0 rounded-[16px] px-3.5 py-2.5 ${
            mine
              ? 'rounded-br-[4px] bg-chrome text-white'
              : `rounded-bl-[4px] bg-surface-card text-ink shadow-card ${staff ? 'border-l-[3px] border-brand' : ''}`
          }`}
        >
          {/* 24 Aug feedback: your own messages say so. */}
          {mine && <div className="mb-0.5 text-[12.5px] font-extrabold text-white/80">You</div>}
          {!mine && (
            <div className="mb-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {unread && <span className="inline-block h-2 w-2 rounded-full bg-brand" aria-hidden="true" />}
              {unread && <span className="sr-only">New. </span>}
              <span className={`text-[12.5px] font-extrabold ${staff ? 'text-brand-ink' : 'text-ink'}`}>
                {message.author?.full_name ?? 'Someone'}
              </span>
              {staff && <RolePill role={message.author_role} title={message.author_title} />}
            </div>
          )}

          {message.event && (
            <div className="mb-2 mt-1">
              <FixtureCard event={message.event} tally={tally} />
            </div>
          )}

          <Body message={message} mine={mine} />

          <div className={`mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-semibold ${meta}`}>
            <span>{stampLabel(message.created_at)}</span>
            {message.pinned && <span className="uppercase tracking-[.4px]">Pinned</span>}
            {/* ⚠️ THE ONE THING WHATSAPP CANNOT TELL A COACH. Staff only — the
                stats function returns rows to nobody else. */}
            {readStat && <span data-testid="read-stat">Read by {readStat.reads} of {readStat.audience}</span>}
          </div>
          {onReact && !message.deleted_at && (
            <ReactionBar
              messageId={message.id}
              reactions={reactions.get(message.id) ?? []}
              selfId={selfId}
              onToggle={onReact}
            />
          )}
        </div>
      </div>

      {/* Actions sit under the bubble, outside it — a tap target row. */}
      <div className={`mt-0.5 flex flex-wrap items-center gap-x-3 px-1 text-[12px] font-semibold text-ink-muted ${mine ? 'flex-row-reverse' : 'pl-10'}`}>
        {!message.deleted_at && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-brand-ink underline-offset-2 hover:underline" aria-expanded={open}>
            {replies.length === 0 ? 'Reply' : `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </button>
        )}
        {canModerate && !message.deleted_at && (
          <button type="button" onClick={() => onPin(message.id, !message.pinned)} className="hover:text-ink">
            {message.pinned ? 'Unpin' : 'Pin'}
          </button>
        )}
        {!message.deleted_at && (mine || canModerate) && (
          <button type="button" onClick={() => onRemove(message.id)} className="hover:text-danger-ink">
            Delete
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
        <div className={`mt-1 w-full max-w-[88%] border-l-2 border-line pl-3 ${mine ? '' : 'ml-9'}`}>
          {replies.map((reply) => (
            <Reply key={reply.id} reply={reply} selfId={selfId} canModerate={canModerate} onRemove={onRemove} />
          ))}
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
