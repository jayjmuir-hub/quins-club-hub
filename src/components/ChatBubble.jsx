import ChatAudio from './ChatAudio.jsx'
import ChatPhoto from './ChatPhoto.jsx'
import ChatAlbum from './ChatAlbum.jsx'
import { isAudioAttachment } from '../data/chatMedia.js'
import MessageMenu from './MessageMenu.jsx'
import PollBubble from './PollBubble.jsx'
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
// An emoji-only message renders BIG — WhatsApp's rule, because a lone 👍 at
// body-text size reads as an afterthought when it IS the message (Jay,
// 30 Aug 2026). "Emoji-only" means 1–3 glyphs, every one pictographic:
// grapheme clusters via Intl.Segmenter so 👍🏽 and 👨‍👩‍👧 count as ONE glyph
// (a naive [...str] splits them and the skin tone fails the test). Plain
// digits and *|# are Emoji in Unicode but NOT Extended_Pictographic, so "3"
// stays text — the property choice is the whole correctness of this.
// Exported for its test.
const SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter() : null
export function emojiOnlyCount(body) {
  const text = (body ?? '').trim()
  // 24 chars comfortably holds three of the longest ZWJ families; anything
  // longer is prose and skips the segmenter walk entirely.
  if (!text || text.length > 24) return 0
  const glyphs = (SEGMENTER ? [...SEGMENTER.segment(text)].map((s) => s.segment) : [...text]).filter(
    (g) => g.trim().length > 0,
  )
  if (glyphs.length === 0 || glyphs.length > 3) return 0
  return glyphs.every((g) => /\p{Extended_Pictographic}/u.test(g)) ? glyphs.length : 0
}

// WhatsApp's vocabulary, kept exactly because every parent already reads it:
// one tick = sent, two grey = delivered to their device, two accent = viewed.
// Colour alone is not the signal — aria-label says the word, and the
// second tick's presence (not only its colour) separates delivered from sent.
function Ticks({ state }) {
  const double = state === 'delivered' || state === 'read'
  return (
    <span
      data-testid="message-ticks"
      data-state={state}
      role="img"
      aria-label={state === 'read' ? 'Viewed' : state === 'delivered' ? 'Delivered' : 'Sent'}
      className={`inline-flex ${state === 'read' ? 'text-sky-300' : 'text-white/70'}`}
    >
      <svg width="14" height="10" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m1 6 3 3 5.5-7" />
        {double && <path d="m7 6.5 2.5 2.5L15 2" />}
      </svg>
    </span>
  )
}

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
  // The full attachment list, when the message has one. ⚠️ `photoPath` is the
  // trigger-derived FIRST photo and stays the fallback: a phone on a cached
  // service-worker bundle still writes only that column and cannot be forced to
  // update, so its photo must keep rendering. That is also why plan 4 cannot
  // drop the column yet.
  attachments = [],
  photoCompact = false,
  edited = false,
  extra = null,
  reactions = [],
  selfId,
  onReact = null,
  hideTrigger = false,
  // 'sent' | 'delivered' | 'read' | null — WhatsApp's ticks, own messages in
  // DMs and groups only (26 Aug 2026). Null renders nothing, which is what
  // squad channels and incoming bubbles pass.
  receipt = null,
  // A poll (src/data/polls.js shape), or null. The question is the body above;
  // this renders the options + voting. onVote(optionId, nextOn) casts/removes;
  // onViewVotes opens the who-voted sheet. Null onVote makes it read-only.
  poll = null,
  onVote = null,
  onViewVotes = null,
}) {
  const album = Array.isArray(attachments) ? attachments : []
  const canReact = Boolean(onReact) && !deleted
  const tallies = reactions ?? []
  const stamp = (
    <span className={`float-right ml-2 mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold leading-none ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
      {stampLabel(createdAt)}
      {mine && receipt && !deleted && <Ticks state={receipt} />}
    </span>
  )

  return (
    <div
      className={`flex items-center gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}
      data-testid={testId}
      data-mine={mine ? 'true' : 'false'}
      id={id}
    >
      {/* ⚠️ A REAL CHECKBOX WHILE SELECTING (2 Sep 2026 UX review, extra
          findings): the bubble's own onClick is the tap route; this is the
          keyboard and screen-reader one. Not role="button" on the bubble —
          it holds the message menu, and a button inside a button is invalid. */}
      {onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label="Select message"
          className="h-5 w-5 shrink-0 self-center accent-brand"
          data-testid="select-message"
        />
      )}
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
              // Dotted underline retired 31 Aug 2026 (Jay: "do we need the
              // giant row of dots?") — the colored bold name is the
              // affordance; desktop gets a hover underline, phones never
              // showed hover anyway. PersonName carries the same change.
              <button
                type="button"
                onClick={onAuthor}
                data-testid="author-chat"
                className="underline-offset-2 hover:underline"
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
            {album.length > 1 ? (
              <ChatAlbum attachments={album} compact={photoCompact} />
            ) : (
              photoPath &&
              (isAudioAttachment(photoPath) ? (
                <ChatAudio path={photoPath} messageId={messageId} mine={mine} />
              ) : (
                <ChatPhoto path={photoPath} compact={photoCompact} />
              ))
            )}
            {body?.trim() ? (
              (() => {
                // A photo caption stays body-sized — the emoji annotates the
                // picture rather than being the message.
                const bigEmoji = photoPath || album.length ? 0 : emojiOnlyCount(body)
                return (
                  <p
                    className={`whitespace-pre-wrap break-words ${
                      bigEmoji === 1
                        ? 'text-[44px] leading-[1.15]'
                        : bigEmoji > 1
                          ? 'text-[32px] leading-[1.2]'
                          : 'text-[14.5px] leading-[1.4]'
                    } ${menuItems.length ? 'pr-5' : ''}`}
                    data-emoji-only={bigEmoji > 0 ? 'true' : undefined}
                  >
                    {body}
                    {edited && (
                      <span className={`ml-1.5 text-[11px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>(edited)</span>
                    )}
                    {stamp}
                  </p>
                )
              })()
            ) : (
              <p className="text-right leading-none">{stamp}</p>
            )}
          </>
        )}
        {!deleted && poll && (
          <PollBubble poll={poll} selfId={selfId} mine={mine} onVote={onVote} onViewVotes={onViewVotes} />
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
