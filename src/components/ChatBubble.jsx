import ChatPhoto from './ChatPhoto.jsx'
import MessageMenu from './MessageMenu.jsx'
import ReactionBar, { ReactionTrigger } from './ReactionBar.jsx'
import { stampLabel } from '../lib/notices.js'

// The round 3/4 message bubble — ONE shell.
//
// DirectMessages Thread invented this language (bc971f8 / #389). MessageRow
// caught up in 7ea4c79 / #410. The floating dock was the next miss (Jay,
// 25 Aug 2026, production screenshot of a 1:1: name in brand-red on every
// incoming paper bubble, rectangular green own bubbles, stamp/emoji that
// did not match the thread). Every surface that DRAW a chat message now
// renders this component so a fourth copy cannot drift.
//
// Shape: rounded-[14px], max-w-[80%], paper theirs / quins-green mine.
// Stamp INSIDE. No "You" on own. Author name only when `showAuthor` (1:1
// chrome already names them; groups / staff / squad still need the name
// on THEIRS). MessageMenu chevron, not a permanent action row. Reaction
// trigger BESIDE the bubble; tallies as a corner pill.
//
// Channel-only extras (staff pill, fixture card, nested replies, read-stats)
// and DM-only extras (quote jump, pin mark, selecting) are slots, not a
// second style.

/**
 * @param mine         the viewer wrote it
 * @param messageId    database id — reactions key off this
 * @param testId       'dm-bubble' | 'message-bubble' | 'dock-bubble' | 'message-reply'
 * @param showAuthor   incoming name. False on a 1:1; true on groups/channels
 * @param quote        already-built quote node, or null
 * @param extra        fixture / read-stat / "N replies in full view"
 * @param onReact      omit (or null) when this surface cannot react
 */
export default function ChatBubble({
  mine,
  messageId,
  testId,
  id,
  selected = false,
  onSelect,
  menuItems = [],
  pinned = false,
  showAuthor = false,
  authorLabel,
  authorExtra = null,
  // Tapping the author's NAME opens a chat with them (25 Aug 2026, Jay:
  // "click on any username … and have the option to chat with them"). Null
  // keeps the name plain text — the caller decides, because only the screen
  // knows whether a DM with this author is even sensible (own messages and
  // 1:1 threads pass nothing).
  onAuthor = null,
  forwarded = false,
  lead = null,
  quote = null,
  deleted = false,
  createdAt,
  body = null,
  photoPath = null,
  photoCompact = false,
  edited = false,
  extra = null,
  reactions = [],
  selfId,
  onReact = null,
  hideTrigger = false,
}) {
  const canReact = Boolean(onReact) && !deleted
  const tallies = reactions ?? []
  const stamp = (
    <span className={`float-right ml-2 mt-1.5 text-[10px] font-semibold leading-none ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
      {stampLabel(createdAt)}
    </span>
  )

  return (
    <div
      className={`flex items-center gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
      data-testid={testId}
      data-mine={mine ? 'true' : 'false'}
      id={id}
    >
      {mine && canReact && !hideTrigger && (
        <ReactionTrigger messageId={messageId} reactions={tallies} selfId={selfId} onToggle={onReact} align="right" />
      )}
      <div
        className={`relative max-w-[80%] rounded-[14px] px-2.5 py-1.5 ${tallies.length ? 'mb-3' : ''} ${
          mine ? 'bg-accent-deep text-white' : 'bg-surface-card text-ink shadow-card'
        } ${selected ? 'ring-2 ring-brand' : ''}`}
        onClick={onSelect}
        data-selected={selected ? 'true' : undefined}
      >
        <MessageMenu items={menuItems} mine={mine} />
        {pinned && !deleted && (
          <span
            aria-label="Pinned"
            className={`absolute right-7 top-1.5 text-[10px] ${mine ? 'text-white/70' : 'text-ink-faint'}`}
            data-testid="pin-mark"
          >
            📌
          </span>
        )}
        {showAuthor && !mine && (
          <p className={`text-[11px] font-extrabold text-brand-ink ${menuItems.length ? 'pr-10' : ''}`}>
            {onAuthor ? (
              // The RolePill stays OUTSIDE the button: the tap target is the
              // person, and a pill inside it would announce as button text.
              <button
                type="button"
                onClick={onAuthor}
                data-testid="author-chat"
                className="underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                {authorLabel}
              </button>
            ) : (
              authorLabel
            )}
            {authorExtra}
          </p>
        )}
        {lead}
        {forwarded && !deleted && (
          <p className={`text-[11px] italic ${mine ? 'text-white/70' : 'text-ink-faint'}`} data-testid="forwarded-tag">
            Forwarded
          </p>
        )}
        {!deleted && quote}
        {deleted ? (
          <p className={`text-[13.5px] italic ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
            Message removed
            {stamp}
          </p>
        ) : (
          <>
            {photoPath && <ChatPhoto path={photoPath} compact={photoCompact} />}
            {body?.trim() ? (
              <p className={`whitespace-pre-wrap break-words text-[14.5px] leading-[1.4] ${menuItems.length ? 'pr-5' : ''}`}>
                {body}
                {edited && (
                  <span className={`ml-1.5 text-[11px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>(edited)</span>
                )}
                {stamp}
              </p>
            ) : (
              <p className="text-right leading-none">{stamp}</p>
            )}
          </>
        )}
        {extra}
        {!deleted && tallies.length > 0 && (
          <div className={`absolute -bottom-3 ${mine ? 'right-2' : 'left-2'}`} data-testid="reaction-pill">
            <ReactionBar
              messageId={messageId}
              reactions={tallies}
              selfId={selfId}
              onToggle={onReact}
              disabled={!onReact}
              showAdd={false}
            />
          </div>
        )}
      </div>
      {!mine && canReact && !hideTrigger && (
        <ReactionTrigger messageId={messageId} reactions={tallies} selfId={selfId} onToggle={onReact} align="left" />
      )}
    </div>
  )
}
