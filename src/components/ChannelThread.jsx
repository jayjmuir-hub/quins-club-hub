import { Fragment, useEffect, useState } from 'react'
import Button from './Button.jsx'
import AttachmentTray from './AttachmentTray.jsx'
import ChatDropZone from './ChatDropZone.jsx'
import Card from './Card.jsx'
import { Empty } from './Empty.jsx'
import FixtureCard from './FixtureCard.jsx'
import MentionPicker, { appendMention } from './MentionPicker.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import MessageRow from './MessageRow.jsx'
import PollComposer from './PollComposer.jsx'
import PollVotes from './PollVotes.jsx'
import Spinner from './Spinner.jsx'
import VoiceComposer from './VoiceComposer.jsx'
import { backgroundStyle } from '../lib/chatBackgrounds.js'
import { autoGrow, composerKeyDown, insertAtCursor, pasteImages } from '../lib/chatComposer.js'
import { PICKER_ACCEPT } from '../lib/imageResize.js'
import { dayLabel, daysDiffer } from '../lib/chatDays.js'
import { eventTitle } from '../lib/eventFormat.js'
import { attachmentPreviewLabel } from '../data/chatMedia.js'

// A channel's RENDERING — pinned block, stream of MessageRows (inline
// threads included), and the composer with its fixture attach and
// @mentions — extracted VERBATIM from src/screens/Chat.jsx on 26 Aug 2026
// so the full screen and the floating dock draw the SAME channel (phase 3
// of claude/plans/2026-08-26-shared-chat-thread.md, the same split as
// DmThread.jsx). All state and behaviour come in as `thread`, the object
// src/lib/useChannelThread.js returns; this file adds nothing on top, so a
// capability can only differ between surfaces if a surface passes a
// different hook — which is the drift this split forbids.
//
// ⚠️ FLAT SINCE 4 Sep 2026 — claude/decisions/2026-09-04-channel-threads-flat-stream.md.
// `thread.visible` is the stream (every message in time order, a reply
// wearing a quote), `thread.focusPost` the fixture filter when the reader
// asked for one, `thread.replyTo` the post the composer is answering, and
// `thread.liveFixtures` the fixture posts whose kick-off is still ahead
// (their cards sit at the top until then). The ?thread= deep link is the
// hook's business now (its `threadParam`), so this component takes no
// `openThreadId` — the prop that used to force-open a folded thread.
// `compact` is a DISPLAY hint for the dock: it may tighten spacing, never
// remove a menu item or capability (spec decision 3).
export default function ChannelThread({ thread, compact = false }) {
  const {
    selfId,
    isClub,
    staffChannel,
    canModerate,
    messages,
    reads,
    openReadsRef,
    newFromRef,
    stats,
    announceOnly,
    mayPost,
    pinned,
    attachable,
    attachedEvent,
    error,
    sendError,
    tallies,
    reactions,
    mentionables,
    background,
  } = thread

  // A #msg-<id> in the address (a starred message, a shared link) scrolls to
  // that post once it is on screen — once, so a later refresh does not yank
  // the reader back. DmThread carries the same anchors on its rows.
  const [jumpedTo, setJumpedTo] = useState(null)
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (!hash.startsWith('#msg-') || jumpedTo === hash) return
    const node = document.getElementById(hash.slice(1))
    if (!node) return
    node.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    setJumpedTo(hash)
  }, [messages, jumpedTo])

  // The stream the reader sees — filtered to one fixture when asked.
  const stream = thread.visible ?? messages

  // Poll create sheet, and the "View votes" sheet (which poll's votes to show).
  const [pollOpen, setPollOpen] = useState(false)
  const [votesFor, setVotesFor] = useState(null)

  return (
    <ChatDropZone onFiles={thread.tray.add}>
      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {/* ── Pinned ──────────────────────────────────────────────────── */}
      {pinned.length > 0 && (
        <div className="mb-3" data-testid="pinned-block">
          <p className="mb-1.5 px-1 text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">Pinned</p>
          {pinned.map((m) => (
            <Card key={`pin-${m.id}`} className="mb-2 border-l-[3px] border-brand px-3.5 py-2.5">
              <p className="text-[13.5px] leading-[1.4] text-ink">{m.body}</p>
              <p className="mt-1 text-[11.5px] font-semibold text-ink-faint">{m.author?.full_name}</p>
            </Card>
          ))}
        </div>
      )}

      {/* ── Stream ──────────────────────────────────────────────────── */}
      {messages === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}
      {messages?.length === 0 && (
        <Empty
          message={
            mayPost
              ? 'Nothing here yet. Say something to the squad.'
              : 'Nothing here yet. Your squad’s staff will post here.'
          }
        />
      )}
      {/* ── Live fixtures (idea 4, Jay, 4 Sep 2026) ────────────────────── */}
      {/* A fixture whose kick-off is still ahead keeps its card here until
          then, so the thing people are replying to stays in view however
          far the chat has moved on. One tap filters to its chat. Hidden
          while a filter is on — the filtered view already leads with the
          card. */}
      {!thread.focusPost && (thread.liveFixtures ?? []).length > 0 && (
        <div className="mb-3" data-testid="live-fixtures">
          {thread.liveFixtures.map((m) => (
            <div key={`live-${m.id}`} className="mb-2">
              <FixtureCard event={m.event} tally={tallies.get(m.event_id)} />
              <button
                type="button"
                data-testid="focus-fixture"
                onClick={() => thread.setFocusId(m.id)}
                className="mt-1 min-h-[32px] px-1 text-[12px] font-bold text-brand-ink"
              >
                Show only this fixture’s chat
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── The fixture filter bar (idea 2) ───────────────────────────── */}
      {/* Nothing is hidden unless the reader asked, and the way back is
          always on screen. This is the whole difference from the fold that
          confused Jay on 4 Sep. */}
      {thread.focusPost && (
        <div className="mb-2 flex items-center gap-2 rounded-[10px] border-l-2 border-brand bg-surface-mute px-2.5 py-1.5" data-testid="focus-bar" role="status">
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-ink">
            Showing {thread.focusPost.event ? eventTitle(thread.focusPost.event) : 'one thread'}
          </p>
          <Button size="sm" variant="ghost" onClick={() => thread.setFocusId(null)}>
            Show everything
          </Button>
        </div>
      )}

      {/* Same paint site as the DM thread: the stream wrapper carries
          data-background (what the tests read), and the photo rides the
          sticky viewport-height layer inside it — NOT the wrapper itself,
          which grows with the thread and stretched the paper blurry (26 Aug
          2026). See the DM thread's comment for the full mechanism. Day
          dividers and gap-1 match DirectMessages Thread so a staff chat
          does not look like a third style. flex-1 + justify-end make the
          wallpaper itself the slack-eater — see the DM thread's comment for
          the 26 Aug screenshot that decided it. */}
      <div className="relative isolate -mx-1 flex flex-1 flex-col justify-end gap-1 rounded-[12px] px-2 py-1" data-background={background}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-clip rounded-[12px]">
        <div data-testid="chat-wallpaper" className="sticky top-0 h-dvh w-full" style={backgroundStyle(background) ?? undefined} />
      </div>
      {/* ⚠️ TOMBSTONE, 4 Sep 2026. For a few hours (#692) a block here
          force-opened a post whose folded thread held an unread reply. The
          fold itself went the same day — see the decision record — so there
          is nothing to open. `stream` is thread.visible: the whole channel,
          or one fixture's messages when the reader asked. */}
      {stream?.map((m, index) => (
        <Fragment key={m.id}>
        {daysDiffer(stream[index - 1]?.created_at, m.created_at) && (
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
        <MessageRow
          message={m}
          selfId={selfId}
          canModerate={canModerate}
          reactions={reactions}
          onReact={thread.onReact}
          readStat={canModerate ? stats.get(m.id) : undefined}
          unread={!(openReadsRef.current ?? reads).has(m.id)}
          tally={m.event_id ? tallies.get(m.event_id) : undefined}
          onReply={thread.onReply}
          onFocus={thread.setFocusId}
          announceOnly={Boolean(announceOnly && !mayPost)}
          onRemove={thread.onRemove}
          onEdit={thread.onEdit}
          onPin={thread.onPin}
          onReport={thread.onReport}
          onReplyPrivately={thread.onReplyPrivately}
          onAuthor={thread.openDmWith}
          poll={thread.polls?.get(m.id) ?? null}
          onVote={thread.vote}
          onViewVotes={() => setVotesFor(thread.polls?.get(m.id) ?? null)}
        />
        </Fragment>
      ))}
      </div>

      {/* ── Composer ────────────────────────────────────────────────── */}
      {/* Chrome-free conversations (25 Aug 2026): no tab bar inside a
          thread, so the composer sits on the bottom edge — the safe-area
          folds into the padding so Send clears the home indicator. */}
      <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 desktop:pb-2">
        {/* Attach a fixture: starts that fixture's thread. Offered to
            everyone in the squad (not only staff) — the fixture's discussion
            belongs to the squad. Only fixtures without an open thread. */}
        {!isClub && !staffChannel && attachable.length > 0 && (
          <div className="mb-2 flex items-center gap-2 px-1">
            <label htmlFor="chat-attach" className="text-[12px] font-bold text-ink-muted">
              Fixture
            </label>
            <select
              id="chat-attach"
              value={thread.attachEventId}
              onChange={(e) => thread.setAttachEventId(e.target.value)}
              className="h-[32px] min-w-0 flex-1 rounded-[8px] border border-line bg-surface-card px-2 text-[13px] text-ink"
            >
              <option value="">{mayPost ? 'None — a normal post' : 'Pick a fixture to start its thread'}</option>
              {attachable.map((e) => (
                <option key={e.id} value={e.id}>
                  {eventTitle(e)}
                </option>
              ))}
            </select>
          </div>
        )}
        {attachedEvent && (
          <div className="mb-2 px-1">
            <FixtureCard event={attachedEvent} tally={tallies.get(attachedEvent.id)} />
          </div>
        )}
        {thread.composerOpen ? (
          <>
            {/* Replying: the same quote preview the DM composer shows (4 Sep
                2026). Cancel drops the quote; under announce-only that also
                re-locks the composer, since the reply was what opened it. */}
            {thread.replyTo && (
              <div className="mb-1.5 flex items-center gap-2 rounded-[10px] border-l-2 border-brand bg-surface-mute px-2.5 py-1.5" data-testid="quote-preview">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-extrabold text-brand-ink">
                    Replying to {thread.replyTo.author_id === selfId ? 'yourself' : thread.replyTo.author?.full_name ?? 'Member'}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {thread.replyTo.event
                      ? eventTitle(thread.replyTo.event)
                      : thread.replyTo.body?.trim()
                        ? thread.replyTo.body
                        : attachmentPreviewLabel(thread.replyTo.attachment_path, thread.replyTo.attachments?.length)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  onClick={() => thread.setReplyTo(null)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            )}
            <AttachmentTray items={thread.tray.items} onRemove={thread.tray.remove} error={thread.tray.error} />
            <form onSubmit={thread.send} className="relative flex items-end gap-2" data-testid="composer">
              <MentionPicker
                people={mentionables}
                onPick={(p) => {
                  thread.setDraft((d) => appendMention(d, p))
                  thread.setDraftMentions((m) => (m.some((x) => x.profile_id === p.profile_id) ? m : [...m, p]))
                }}
              />
              <input ref={thread.fileRef} type="file" multiple accept={PICKER_ACCEPT} className="hidden" onChange={thread.pickPhoto} data-testid="photo-input" />
              <button
                type="button"
                aria-label="Attach a photo"
                onClick={() => thread.fileRef.current?.click?.()}
                className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute"
                data-testid="photo-button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <circle cx="9" cy="10" r="1.6" />
                  <path d="m21 15-4.5-4.5L7 20" />
                </svg>
              </button>
              {mayPost && thread.allowPolls !== false && (
                <button
                  type="button"
                  aria-label="Create a poll"
                  onClick={() => setPollOpen(true)}
                  className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute"
                  data-testid="poll-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 20V10M12 20V4M18 20v-6" />
                  </svg>
                </button>
              )}
              <label className="sr-only" htmlFor="chat-draft">
                Message
              </label>
              <textarea
                id="chat-draft"
                ref={thread.draftRef}
                value={thread.draft}
                onChange={(e) => thread.setDraft(e.target.value)}
                onInput={(e) => autoGrow(e.currentTarget)}
                onKeyDown={composerKeyDown}
                // ⚠️ Ctrl+V a screenshot. Hands off entirely unless the
                // clipboard carries images — see pasteImages.
                onPaste={(e) => pasteImages(e, thread.tray.add)}
                rows={1}
                maxLength={2000}
                placeholder={attachedEvent ? `Start the thread for ${eventTitle(attachedEvent)}` : 'Message'}
                className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
              />
              <EmojiPicker onPick={(emoji) => thread.setDraft(insertAtCursor(thread.draftRef.current, emoji))} />
              {mayPost && !thread.draft.trim() && thread.tray.items.length === 0 && !attachedEvent ? (
                <VoiceComposer onSend={thread.sendVoice} disabled={thread.sending} onError={thread.setSendError} />
              ) : (
                <Button type="submit" disabled={thread.sending || (!thread.draft.trim() && thread.tray.items.length === 0)}>
                  {/* Counts rather than spinning — see DmThread. */}
                  {thread.progress
                    ? <span data-testid="send-progress">{thread.progress}</span>
                    : (attachedEvent ? 'Start thread' : 'Send')}
                </Button>
              )}
            </form>
          </>
        ) : (
          <p className="px-2 py-2 text-[13px] font-semibold text-ink-muted" data-testid="composer-locked">
            Only staff can post here — reply to a thread instead
            {attachable.length > 0 ? ', or pick a fixture above to start its thread' : ''}.
          </p>
        )}
        {sendError && (
          <p role="alert" className="mt-1.5 px-1 text-[12.5px] font-semibold text-danger-ink">
            {sendError}
          </p>
        )}
      </div>

      <PollComposer
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        busy={thread.postingPoll}
        onSubmit={async (fields) => {
          const ok = await thread.sendPoll(fields)
          if (ok) setPollOpen(false)
        }}
      />
      <PollVotes open={Boolean(votesFor)} onClose={() => setVotesFor(null)} poll={votesFor} />
    </ChatDropZone>
  )
}
