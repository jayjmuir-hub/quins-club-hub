import { Fragment, useState } from 'react'
import Button from './Button.jsx'
import AttachmentTray from './AttachmentTray.jsx'
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
import { autoGrow, composerKeyDown, insertAtCursor } from '../lib/chatComposer.js'
import { PICKER_ACCEPT } from '../lib/imageResize.js'
import { dayLabel, daysDiffer } from '../lib/chatDays.js'
import { eventTitle } from '../lib/eventFormat.js'

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
// `openThreadId` force-opens one post's inline thread (the ?thread= deep
// link — the SCREEN owns search params; the dock passes nothing).
// `compact` is a DISPLAY hint for the dock: it may tighten spacing, never
// remove a menu item or capability (spec decision 3).
export default function ChannelThread({ thread, compact = false, openThreadId = null }) {
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

  // Poll create sheet, and the "View votes" sheet (which poll's votes to show).
  const [pollOpen, setPollOpen] = useState(false)
  const [votesFor, setVotesFor] = useState(null)

  return (
    <>
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
      {messages?.map((m, index) => (
        <Fragment key={m.id}>
        {daysDiffer(messages[index - 1]?.created_at, m.created_at) && (
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
          mentionables={mentionables}
          forceOpen={openThreadId === m.id}
          onReply={thread.onReply}
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
    </>
  )
}
