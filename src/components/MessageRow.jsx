import { useState } from 'react'
import Button from './Button.jsx'
import ChatBubble from './ChatBubble.jsx'
import FixtureCard from './FixtureCard.jsx'
import MessageEditor from './MessageEditor.jsx'
import { canStillEdit } from '../lib/messageEdit.js'
import useProfileIcons from '../lib/useProfileIcons.js'
import ProfileIcon from './ProfileIcon.jsx'
import { labelForRole } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { eventTitle } from '../lib/eventFormat.js'
import { attachmentPreviewLabel } from '../data/chatMedia.js'

// One message in a channel, as a BUBBLE. The bubble itself is ChatBubble —
// the same shell the DM thread and the floating dock use — so this file
// cannot miss a language pass the way it missed #389 and the dock missed
// #410. Channel-only extras (staff pill, fixture cards, read-stats, Pin,
// Report) are slots into that shell.
//
// ⚠️ FLAT SINCE 4 Sep 2026 — claude/decisions/2026-09-04-channel-threads-flat-stream.md.
// Until then this file drew a top-level post WITH its replies nested under
// it, folded behind an 11px "N replies" toggle, and carried its own reply
// form. A manager's reply to the second-to-last post in a role channel was
// promised by the chat list and invisible in the chat; Jay's ruling was the
// WhatsApp model: a reply is a message at the foot of the stream, at its
// own time, with a QUOTE of what it answers. So every row is one message
// (`message.parent` is the quoted post, embedded by the loader), Reply arms
// the foot composer, and nothing here nests or folds. The nested `Reply`
// component, `replies`, `forceOpen` and the inline form are gone — do not
// bring a fold back.
//
// ⚠️ A PURE-PROPS COMPONENT, like NoticeRow and for the same reason: a row
// that needs a database session to be looked at is a row that gets reviewed
// by reading its JSX. This one renders in the harness.

const STAFF_ROLES = new Set(['admin', 'coach', 'manager', 'medic'])

export function isStaffRole(role) {
  return STAFF_ROLES.has(role)
}

/**
 * The staff pill. 4 Sep 2026, Jay, from a screenshot of the managers channel:
 * (1) the pill broke across two lines mid-word — whitespace-nowrap and
 * inline-block, so it moves to the next line WHOLE when the name is long;
 * (2) in a club-wide channel it should say which squad — "U11 Mixed · Team
 * Manager". `squad` is messages.author_team (the squad behind the role, stamped
 * by the provenance trigger since db/migrations/20260908_message_author_team.sql).
 * The caller passes it only where it tells the reader something: a squad's own
 * chat already says U11 in its header, so there the pill stays as it was.
 */
export function RolePill({ role, title, squad = null }) {
  const label = title || labelForRole(role) || role
  return (
    <span
      data-testid="role-pill"
      className="ml-1 inline-block whitespace-nowrap rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink"
    >
      {squad ? `${squad} · ${label}` : label}
    </span>
  )
}

/**
 * The quote a reply wears above its text — who and what it answers. Same
 * block the DM thread draws for `quoted`, built here from `parent`.
 *
 * A HARD-deleted parent nulls parent_id (FK set null) and the block simply
 * goes; a soft-deleted one keeps the pointer and says so without re-showing
 * a word of the deleted content. A fixture post has an empty body, so its
 * quote names the fixture. Tapping the quote jumps to the original; on a
 * fixture it FILTERS the stream to that fixture instead (`onFocus`), which
 * is the whole thread in one tap.
 */
export function ReplyQuote({ parent, selfId, mine, onFocus }) {
  if (!parent?.id) return null
  const tone = mine ? 'border-white/40 bg-white/10' : 'border-brand bg-surface-mute'
  if (parent.deleted_at) {
    return (
      <p
        className={`mb-1 mt-0.5 rounded-[8px] border-l-2 px-2 py-1 text-[12px] italic ${mine ? 'border-white/40 bg-white/10 text-white/70' : 'border-line bg-surface-mute text-ink-faint'}`}
        data-testid="quote-block"
      >
        Message deleted
      </p>
    )
  }
  const who = parent.author_id === selfId ? 'You' : parent.author?.full_name ?? 'Member'
  const what = parent.event
    ? eventTitle(parent.event)
    : parent.body?.trim()
      ? parent.body
      : attachmentPreviewLabel(parent.attachment_path, parent.attachments?.length)
  return (
    <button
      type="button"
      data-testid="quote-block"
      data-fixture={parent.event ? 'true' : undefined}
      onClick={() => {
        if (parent.event && onFocus) return onFocus(parent.id)
        document.getElementById(`msg-${parent.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      }}
      className={`mb-1 mt-0.5 block w-full rounded-[8px] border-l-2 px-2 py-1 text-left ${tone}`}
    >
      <span className={`block text-[11px] font-extrabold ${mine ? 'text-white/80' : 'text-brand-ink'}`}>
        {parent.event ? `${who} · Fixture` : who}
      </span>
      <span className={`block truncate text-[12px] ${mine ? 'text-white/70' : 'text-ink-muted'}`}>{what}</span>
    </button>
  )
}

/**
 * @param message      one message — a post, or a reply carrying `parent`
 * @param selfId       the viewer's profile id
 * @param canModerate  squad staff — may remove any message and pin
 * @param readStat     { reads, audience } for staff, else undefined
 * @param unread       true when the viewer has not read it yet
 * @param tally        { in, maybe, out } for a fixture post, if loaded
 * @param onReply(message)  arm the foot composer to answer this message
 * @param onFocus(postId)   filter the stream to this fixture post and its replies
 * @param onRemove(id), onPin(id, pinned), onEdit(id, body)
 * @param onReport(id, reason)  report a message to the club
 * @param announceOnly  the reader may not start a post here — show the
 *                      Reply affordance under each post (2 Sep 2026, High)
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
  onReply,
  onFocus = null,
  onRemove,
  onEdit,
  onPin,
  onReport,
  // 27 Aug 2026: polls. `poll` is this message's poll (or null); vote/viewVotes
  // are the bubble's handlers. Replies are never polls (top-level only).
  poll = null,
  onVote = null,
  onViewVotes = null,
  // 25 Aug 2026: the squad channel grows the group-DM courtesies — a
  // private reply from the chevron menu, and a tappable author name. Both
  // optional; the screen supplies them only where a DM makes sense.
  onReplyPrivately,
  onAuthor,
  // 2 Sep 2026 (UX review, High): in an announce-only channel the locked
  // composer says "reply to a thread instead", but a post showed no reply
  // control at all — only the 20px chevron menu. When this is set, a post
  // gets a visible Reply button under the bubble. Off for ordinary
  // channels, where the composer at the foot is the obvious route and a
  // button on every post is noise.
  announceOnly = false,
}) {
  const iconFor = useProfileIcons()
  const [editing, setEditing] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)

  const staff = isStaffRole(message.author_role)
  const mine = message.author_id === selfId
  const tallies = reactions.get(message.id) ?? []

  async function submitReport(domEvent) {
    domEvent.preventDefault()
    if (!reason.trim()) return
    try {
      await onReport(message.id, reason)
      setReporting(false)
      setReason('')
    } catch (err) {
      setError(friendlyMessage(err, 'Could not send the report.'))
    }
  }

  const menuItems = message.deleted_at
    ? []
    : [
        ...(mine && onEdit && canStillEdit(message)
          ? [{ label: 'Edit', onClick: () => setEditing(true) }]
          : []),
        ...(onReply ? [{ label: 'Reply', onClick: () => onReply(message) }] : []),
        ...(!mine && onReplyPrivately
          ? [{ label: 'Reply privately', onClick: () => onReplyPrivately(message) }]
          : []),
        // Pin is for POSTS. A reply pinned on its own would lose its quote's
        // meaning in the pinned block.
        ...(canModerate && onPin && !message.parent_id
          ? [{ label: message.pinned ? 'Unpin' : 'Pin', onClick: () => onPin(message.id, !message.pinned) }]
          : []),
        ...((mine || canModerate) && onRemove ? [{ label: 'Delete', onClick: () => onRemove(message.id), danger: true }] : []),
        ...(!mine && onReport ? [{ label: 'Report', onClick: () => setReporting((v) => !v), danger: true }] : []),
      ]

  if (editing) {
    return (
      <article className={`flex py-0.5 ${mine ? 'justify-end' : 'justify-start'}`} data-testid="message-row">
        <MessageEditor
          body={message.body}
          onCancel={() => setEditing(false)}
          onSave={async (text) => {
            await onEdit(message.id, text)
            setEditing(false)
          }}
        />
      </article>
    )
  }

  return (
    <article
      className={`flex flex-col py-0.5 ${mine ? 'items-end' : 'items-start'}`}
      id={`msg-${message.id}`}
      data-testid="message-row"
      data-staff={staff ? 'true' : 'false'}
      data-mine={mine ? 'true' : 'false'}
      data-reply={message.parent_id ? 'true' : undefined}
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
            <ProfileIcon emoji={iconFor(message.author_id)} />
          </>
        }
        authorExtra={
          staff ? (
            <RolePill
              role={message.author_role}
              title={message.author_title}
              // Club-wide channels only (team_id null): a squad chat says its squad already.
              squad={message.team_id ? null : message.author_team?.name ?? null}
            />
          ) : null
        }
        forwarded={Boolean(message.forwarded)}
        deleted={Boolean(message.deleted_at)}
        createdAt={message.created_at}
        body={message.body}
        photoPath={message.attachment_path}
        attachments={message.attachments}
        edited={Boolean(message.edited_at)}
        quote={<ReplyQuote parent={message.parent} selfId={selfId} mine={mine} onFocus={onFocus} />}
        lead={
          message.event ? (
            <div className="mb-2 mt-1">
              <FixtureCard event={message.event} tally={tally} />
              {/* Idea 2 (Jay, 4 Sep 2026): the fixture's chat is a FILTER you
                  ask for, never a fold. This is the door; the quote on each
                  reply is the other. */}
              {onFocus && !message.deleted_at && (
                <button
                  type="button"
                  data-testid="focus-fixture"
                  onClick={() => onFocus(message.id)}
                  className={`mt-1 block min-h-[32px] text-[12px] font-bold ${mine ? 'text-white/80' : 'text-brand-ink'}`}
                >
                  Show only this fixture’s chat
                </button>
              )}
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
            {announceOnly && onReply && !message.deleted_at && (
              <button
                type="button"
                data-testid="reply-affordance"
                onClick={() => onReply(message)}
                className={`mt-0.5 block min-h-[44px] text-[12px] font-semibold ${mine ? 'text-white/80' : 'text-brand-ink'}`}
              >
                Reply
              </button>
            )}
          </>
        }
        reactions={tallies}
        selfId={selfId}
        onReact={onReact}
        poll={poll}
        onVote={poll ? onVote : null}
        onViewVotes={poll ? onViewVotes : null}
      />

      {reporting && (
        <form
          onSubmit={submitReport}
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
      {error && (
        <p role="alert" className="mt-1 text-[12.5px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
    </article>
  )
}
