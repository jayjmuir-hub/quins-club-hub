import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import ChatPhoto from './ChatPhoto.jsx'
import FixtureCard from './FixtureCard.jsx'
import MentionPicker, { appendMention } from './MentionPicker.jsx'
import MessageMenu from './MessageMenu.jsx'
import { stampLabel } from '../lib/notices.js'
import ReactionBar, { ReactionTrigger } from './ReactionBar.jsx'
import { labelForRole } from '../lib/scope.js'

// One post in a channel, as a BUBBLE, with its replies. Same visual
// language as the DM/group Thread in src/screens/DirectMessages.jsx
// (round 3/4): quins-green own bubbles, paper theirs, stamp INSIDE,
// MessageMenu chevron, reaction trigger BESIDE the bubble, tallies as a
// pill overlapping the corner. No "You" label, no avatars, no permanent
// Reply/Pin/Delete/Report row under every bubble — Jay, 25 Aug 2026,
// production screenshot of U11 Mixed · staff. DirectMessages was already
// there (bc971f8 / #389); this file was the miss.
//
// ⚠️ A PURE-PROPS COMPONENT, like NoticeRow and for the same reason: a row
// that needs a database session to be looked at is a row that gets reviewed
// by reading its JSX. This one renders in the harness.
//
// Channel-only capabilities stay: a staff role pill on THEIR name (the
// pill says the role in words — claude/specs/accessibility.md), nested
// replies, fixture cards, read-stats, announce-only's reply path, Pin for
// staff, Report. They live in the chevron / inside the bubble, not as a
// text-action row.

const STAFF_ROLES = new Set(['admin', 'coach', 'manager', 'medic'])

export function isStaffRole(role) {
  return STAFF_ROLES.has(role)
}

function Body({ message, mine, stamp, padded }) {
  if (message.deleted_at) {
    return (
      <p className={`text-[13.5px] italic ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
        Message removed
        {stamp}
      </p>
    )
  }
  // Round 2: a forward wears its tag, a photo renders above whatever text
  // rode with it, and a photo-only message renders no empty paragraph.
  return (
    <>
      {message.forwarded && (
        <p className={`text-[11px] italic ${mine ? 'text-white/70' : 'text-ink-faint'}`} data-testid="forwarded-tag">
          Forwarded
        </p>
      )}
      {message.attachment_path && <ChatPhoto path={message.attachment_path} />}
      {message.body?.trim() ? (
        <p className={`whitespace-pre-wrap break-words text-[14.5px] leading-[1.4] ${padded ? 'pr-5' : ''}`}>
          {message.body}
          {message.edited_at && (
            <span className={`ml-1.5 text-[11px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>(edited)</span>
          )}
          {stamp}
        </p>
      ) : stamp ? (
        <p className="text-right leading-none">{stamp}</p>
      ) : null}
    </>
  )
}

function RolePill({ role, title }) {
  return (
    <span className="ml-1 rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
      {title || labelForRole(role) || role}
    </span>
  )
}

function Reply({ reply, selfId, canModerate, onRemove }) {
  const staff = isStaffRole(reply.author_role)
  const mine = reply.author_id === selfId
  const menuItems =
    !reply.deleted_at && (mine || canModerate)
      ? [{ label: 'Delete', onClick: () => onRemove(reply.id), danger: true }]
      : []
  const stamp = (
    <span className={`float-right ml-2 mt-1.5 text-[10px] font-semibold leading-none ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
      {stampLabel(reply.created_at)}
    </span>
  )
  return (
    <div className={`flex items-center gap-1.5 py-0.5 ${mine ? 'justify-end' : 'justify-start'}`} data-testid="message-reply">
      <div className={`relative max-w-[80%] rounded-[14px] px-2.5 py-1.5 ${mine ? 'bg-accent-deep text-white' : 'bg-surface-card text-ink shadow-card'}`}>
        <MessageMenu items={menuItems} mine={mine} />
        {!mine && (
          <p className={`text-[11px] font-extrabold text-brand-ink ${menuItems.length ? 'pr-10' : ''}`}>
            {reply.author?.full_name ?? 'Someone'}
            {staff && <RolePill role={reply.author_role} title={reply.author_title} />}
          </p>
        )}
        <Body message={reply} mine={mine} stamp={stamp} padded={menuItems.length > 0} />
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
        ...(canModerate && onPin ? [{ label: message.pinned ? 'Unpin' : 'Pin', onClick: () => onPin(message.id, !message.pinned) }] : []),
        ...((mine || canModerate) && onRemove ? [{ label: 'Delete', onClick: () => onRemove(message.id), danger: true }] : []),
        ...(!mine && onReport ? [{ label: 'Report', onClick: () => setReporting((v) => !v), danger: true }] : []),
      ]

  // The stamp rides INSIDE the bubble, WhatsApp style (round 3: "the time
  // stamp is not totally below the message"). Same markup as the DM Thread.
  const stamp = (
    <span className={`float-right ml-2 mt-1.5 text-[10px] font-semibold leading-none ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
      {stampLabel(message.created_at)}
    </span>
  )

  return (
    <article
      data-testid="message-row"
      data-staff={staff ? 'true' : 'false'}
      data-mine={mine ? 'true' : 'false'}
    >
      {/* items-center, not items-end (Jay, 25 Aug 2026: "put the reaction
          button centered on every message") — same as the DM Thread. */}
      <div
        className={`flex items-center gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
        data-testid="message-bubble"
      >
        {mine && onReact && !message.deleted_at && (
          <ReactionTrigger messageId={message.id} reactions={tallies} selfId={selfId} onToggle={onReact} align="right" />
        )}
        <div
          className={`relative max-w-[80%] rounded-[14px] px-2.5 py-1.5 ${tallies.length ? 'mb-3' : ''} ${
            mine ? 'bg-accent-deep text-white' : 'bg-surface-card text-ink shadow-card'
          }`}
        >
          <MessageMenu items={menuItems} mine={mine} />
          {message.pinned && !message.deleted_at && (
            <span
              aria-label="Pinned"
              className={`absolute right-7 top-1.5 text-[10px] ${mine ? 'text-white/70' : 'text-ink-faint'}`}
              data-testid="pin-mark"
            >
              📌
            </span>
          )}
          {!mine && (
            <p className={`text-[11px] font-extrabold text-brand-ink ${menuItems.length ? 'pr-10' : ''}`}>
              {unread && <span className="sr-only">New. </span>}
              {message.author?.full_name ?? 'Someone'}
              {staff && <RolePill role={message.author_role} title={message.author_title} />}
            </p>
          )}

          {message.event && (
            <div className="mb-2 mt-1">
              <FixtureCard event={message.event} tally={tally} />
            </div>
          )}

          <Body message={message} mine={mine} stamp={stamp} padded={menuItems.length > 0} />

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
          {/* Round 4: the tallies are a pill OVERLAPPING the bubble's bottom
              corner, where WhatsApp puts them — left of theirs, right of
              yours. The mb-3 on the bubble is the room it hangs into. */}
          {!message.deleted_at && tallies.length > 0 && (
            <div className={`absolute -bottom-3 ${mine ? 'right-2' : 'left-2'}`} data-testid="reaction-pill">
              <ReactionBar
                messageId={message.id}
                reactions={tallies}
                selfId={selfId}
                onToggle={onReact}
                disabled={!onReact}
                showAdd={false}
              />
            </div>
          )}
        </div>
        {!mine && onReact && !message.deleted_at && (
          <ReactionTrigger messageId={message.id} reactions={tallies} selfId={selfId} onToggle={onReact} align="left" />
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
        <div className={`mt-1 w-full max-w-[88%] border-l-2 border-line pl-3 ${mine ? 'ml-auto' : ''}`}>
          {replies.map((reply) => (
            <Reply key={reply.id} reply={reply} selfId={selfId} canModerate={canModerate} onRemove={onRemove} />
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
