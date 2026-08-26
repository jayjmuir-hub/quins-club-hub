import { Fragment } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import ChatBubble from './ChatBubble.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import { Empty } from './Empty.jsx'
import Spinner from './Spinner.jsx'
import { receiptState } from '../data/messages.js'
import { backgroundStyle } from '../lib/chatBackgrounds.js'
import { autoGrow, composerKeyDown, insertAtCursor } from '../lib/chatComposer.js'
import { dayLabel, daysDiffer } from '../lib/chatDays.js'
import { useMemberships } from '../lib/memberships.jsx'
import { RowAvatar, scopeChatRows } from '../screens/ChatList.jsx'

// The DM/group thread's RENDERING — message stream, composer, and every
// message-level overlay (report form, forward select/sheet) — extracted
// VERBATIM from src/screens/DirectMessages.jsx on 26 Aug 2026 so the full
// screen and the floating dock draw the SAME thread
// (claude/plans/2026-08-26-shared-chat-thread.md). All state and behaviour
// come in as `thread`, the object src/lib/useDmThread.js returns; this file
// adds nothing on top, so a capability can only differ between surfaces if a
// surface passes a different hook — which is the drift this split forbids.
//
// `compact` is a DISPLAY hint for the dock: it may tighten spacing, never
// remove a menu item or capability (spec decision 3).
export default function DmThread({ thread, compact = false }) {
  const { memberships, teams } = useMemberships()
  const {
    selfId,
    conversation,
    messages,
    reactions,
    stars,
    receipts,
    error,
    background,
    isGroup,
    participant,
    reviewing,
    recipientIds,
    nameFor,
    otherName,
    newFromRef,
    blocked,
  } = thread

  return (
    <>
      {/* ── The notice is REVIEWING-ONLY since 26 Aug 2026 — Jay: "remove
             the club admins can review notice", pointing at the dock, which
             never showed it. The member-facing "admins can review" line was
             the 23 Aug permanent-notice ruling; Jay reversed it (addendum in
             claude/decisions/2026-08-24-groups-open-no-warnings.md). The
             REVIEWING banner stays: it is about the admin in the room —
             "this open has been recorded" — not a warning to members, and
             removing it would hide an access that IS logged. ───────────── */}
      {reviewing && (
      <div
        data-testid="dm-notice"
        className="mb-3 flex gap-2 rounded-[10px] bg-warn-bg px-3 py-2 text-[12.5px] leading-snug text-warn-ink"
      >
        <span aria-hidden="true">🛡</span>
        <p>You are reviewing a private conversation as a club admin. This open has been recorded.</p>
      </div>
      )}

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
      {/* Round 4: pinned messages ride a banner at the top; tap jumps.
          Anyone in the chat pinned them (the WhatsApp-default ruling). */}
      {(messages ?? []).some((m) => m.pinned && !m.deleted_at) && (
        <div className="mb-2 rounded-[10px] border border-line bg-surface-card px-2.5 py-1.5 shadow-card" data-testid="pinned-banner">
          {(messages ?? []).filter((m) => m.pinned && !m.deleted_at).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => document.getElementById(`msg-${m.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })}
              className="flex w-full items-center gap-2 py-0.5 text-left"
            >
              <span aria-hidden="true" className="text-[12px]">📌</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">
                <span className="font-bold text-ink">{m.author_id === selfId ? 'You' : nameFor(m.author_id, m.author?.full_name ?? 'Member')}: </span>
                {m.body?.trim() ? m.body : '📷 Photo'}
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Round 3: the wallpaper — a low-alpha overlay on the stream only,
          so the composer and header stay on the plain surface.
          ⚠️ flex-1 + justify-end MAKE THE WALLPAPER THE SLACK-EATER (26 Aug
          2026, Jay's screenshot: with few messages the paper was a small
          patch over the bubbles and the empty area above was bare surface).
          The wrapper grows to fill main's surplus and bottom-aligns its
          bubbles, so the paper covers the whole message area however short
          the thread — and the composer stays the document bottom, which is
          what the keyboard fix relies on (AppShell's <main> comment). Both
          classes are no-ops once the thread is taller than the viewport.
          ⚠️ THE PHOTO IS NOT ON THIS WRAPPER — 26 Aug 2026, Jay: cover on
          the growing stream stretched the paper over the whole thread
          height, so long chats went blurry. WhatsApp-style instead: a
          sticky, viewport-height layer inside an absolute clip. It pins to
          whichever scrollport owns the thread (the document on the full
          screen, the panel in the dock), so the photo is always painted at
          screen size and messages scroll over it.
          ⚠️ NO min-h-full HERE — measured in the harness, 26 Aug 2026: 100%
          of the absolute clip is the WRAPPER height, so it silently grew the
          layer back to the full stream and the stretch survived. h-dvh only;
          a browser without dvh (pre-2022) shows plain surface, not a blur.
          NOT background-attachment: fixed — broken on iOS. `isolate` traps
          the layer's -z-10 under the bubbles without touching them.
          ⚠️ overflow-CLIP on the clip div, not overflow-hidden — measured in
          the harness, 26 Aug 2026: hidden makes the clip div the sticky
          layer's scrollport (a scroll container that never scrolls), so the
          paper never pinned and a bare band opened above the composer.
          `overflow: clip` clips without becoming a scroll container. */}
      <div className="relative isolate -mx-1 flex flex-1 flex-col justify-end gap-1 rounded-[12px] px-2 py-1" data-background={background}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-clip rounded-[12px]">
          <div data-testid="chat-wallpaper" className="sticky top-0 h-dvh w-full" style={backgroundStyle(background) ?? undefined} />
        </div>
        {messages?.map((m, index) => {
          const mine = m.author_id === selfId
          const authorName = mine ? 'You' : nameFor(m.author_id, m.author?.full_name ?? 'Member')
          const tallies = reactions.get(m.id) ?? []
          // Round 4: the chevron menu carries every action; the thread
          // decides the list, ChatBubble only draws it.
          const menuItems = !participant || m.deleted_at || thread.selecting
            ? []
            : [
                { label: 'Reply', onClick: () => { thread.setReplyTo(m); thread.draftRef.current?.focus?.() } },
                { label: 'Forward', onClick: () => thread.startForward(m.id) },
                ...(m.body?.trim() ? [{ label: 'Copy', onClick: () => thread.onCopy(m) }] : []),
                { label: m.pinned ? 'Unpin' : 'Pin', onClick: () => thread.onPin(m) },
                { label: stars.has(m.id) ? 'Unstar' : 'Star', onClick: () => thread.onStar(m) },
                ...(isGroup && !mine ? [{ label: 'Reply privately', onClick: () => thread.onReplyPrivately(m) }] : []),
                ...(mine
                  ? [{ label: 'Delete', onClick: () => thread.onRemove(m.id), danger: true }]
                  : [{ label: 'Report', onClick: () => thread.setReporting(m.id), danger: true }]),
              ]
          // The quote block. A HARD-deleted original nulls quoted_id
          // (FK set null) and the block simply goes; a soft-deleted
          // one keeps the pointer and says so without re-showing a
          // word of the deleted content.
          // ⚠️ `?.id`, NOT truthiness. A reverse-direction embed once
          // made `quoted` an EMPTY ARRAY on every message — truthy —
          // and every bubble grew a phantom chip (24 Aug 2026, live).
          // An object with an id is the only shape worth drawing.
          const quote = m.quoted?.id && !m.deleted_at
            ? (m.quoted.deleted_at ? (
                <p className={`mb-1 mt-0.5 rounded-[8px] border-l-2 px-2 py-1 text-[12px] italic ${mine ? 'border-white/40 bg-white/10 text-white/70' : 'border-line bg-surface-mute text-ink-faint'}`} data-testid="quote-block">
                  Message deleted
                </p>
              ) : (
                <button
                  type="button"
                  data-testid="quote-block"
                  onClick={() => document.getElementById(`msg-${m.quoted.id}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })}
                  className={`mb-1 mt-0.5 block w-full rounded-[8px] border-l-2 px-2 py-1 text-left ${mine ? 'border-white/40 bg-white/10' : 'border-brand bg-surface-mute'}`}
                >
                  <span className={`block text-[11px] font-extrabold ${mine ? 'text-white/80' : 'text-brand-ink'}`}>
                    {m.quoted.author_id === selfId ? 'You' : nameFor(m.quoted.author_id, m.quoted.author?.full_name ?? 'Member')}
                  </span>
                  <span className={`block truncate text-[12px] ${mine ? 'text-white/70' : 'text-ink-muted'}`}>
                    {m.quoted.body?.trim() ? m.quoted.body : '📷 Photo'}
                  </span>
                </button>
              ))
            : null
          return (
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
              <ChatBubble
                mine={mine}
                messageId={m.id}
                receipt={mine ? receiptState(receipts.get(m.id), recipientIds) : null}
                testId="dm-bubble"
                id={`msg-${m.id}`}
                selected={thread.selecting && thread.selected.has(m.id)}
                onSelect={thread.selecting && !m.deleted_at ? () => thread.toggleSelected(m.id) : undefined}
                menuItems={menuItems}
                pinned={Boolean(m.pinned)}
                showAuthor={isGroup && !mine}
                onAuthor={isGroup && !mine ? () => thread.openDmWith(m.author_id) : null}
                authorLabel={authorName}
                forwarded={Boolean(m.forwarded)}
                quote={quote}
                deleted={Boolean(m.deleted_at)}
                createdAt={m.created_at}
                body={m.body}
                photoPath={m.attachment_path}
                photoCompact={compact}
                reactions={tallies}
                selfId={selfId}
                onReact={participant ? thread.react : null}
                hideTrigger={thread.selecting}
              />
            </Fragment>
          )
        })}
      </div>

      {thread.reporting && (
        <form onSubmit={thread.submitReport} className="mt-3 rounded-card bg-surface-card p-3 shadow-card" data-testid="report-form">
          <label htmlFor="report-reason" className="text-[12.5px] font-extrabold text-ink">
            Report this message to the club
          </label>
          <textarea
            id="report-reason"
            value={thread.reason}
            onChange={(e) => thread.setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="What is wrong with it?"
            className="mt-1.5 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => thread.setReporting(null)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!thread.reason.trim()}>
              Send report
            </Button>
          </div>
        </form>
      )}

      {thread.forwarding && (
        <Card className="mt-3 p-3" data-testid="forward-sheet">
          <p className="text-[12.5px] font-extrabold text-ink">
            Forward {thread.selected.size === 1 ? 'this message' : `${thread.selected.size} messages`} to
          </p>
          {thread.forwardRows === null ? (
            <div className="py-4">
              <Spinner />
            </div>
          ) : (
            <ul className="mt-1.5">
              {scopeChatRows(thread.forwardRows, memberships, teams)
                ?.filter((row) => row.conversation_id !== thread.conversationId)
                .map((row) => (
                  <li key={`${row.kind}-${row.team_id ?? row.conversation_id ?? 'club'}`} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      data-testid="forward-dest"
                      onClick={() => thread.forwardTo(row)}
                      className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface-mute"
                    >
                      <RowAvatar row={row} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{row.label}</span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={() => thread.setForwarding(false)}>
              Back
            </Button>
          </div>
        </Card>
      )}

      {participant && thread.selecting && !thread.forwarding && (
        <div className="sticky bottom-0 -mx-1 mt-3 flex items-center gap-2 border-t border-line bg-surface px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 desktop:pb-2" data-testid="forward-bar">
          <p className="flex-1 text-[13px] font-semibold text-ink">
            {thread.selected.size} selected — tap messages to add
          </p>
          <Button size="sm" variant="ghost" onClick={thread.cancelForward}>
            Cancel
          </Button>
          <Button size="sm" disabled={!thread.selected.size} onClick={thread.openForwardSheet}>
            Forward
          </Button>
        </div>
      )}

      {/* Chrome-free conversations: bottom-0, safe-area in the padding —
          same reasoning as Chat.jsx's composer. */}
      {participant && !thread.selecting && (
        <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 desktop:pb-2">
          {blocked ? (
            <p className="px-2 py-2 text-[13px] font-semibold text-ink-muted" data-testid="dm-blocked">
              You have blocked {otherName}. Unblock to message them.
            </p>
          ) : (
            <>
              {thread.replyTo && (
                <div className="mb-1.5 flex items-center gap-2 rounded-[10px] border-l-2 border-brand bg-surface-mute px-2.5 py-1.5" data-testid="quote-preview">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-extrabold text-brand-ink">
                      Replying to {thread.replyTo.author_id === selfId ? 'yourself' : nameFor(thread.replyTo.author_id, thread.replyTo.author?.full_name ?? 'Member')}
                    </p>
                    <p className="truncate text-[12px] text-ink-muted">{thread.replyTo.body?.trim() ? thread.replyTo.body : '📷 Photo'}</p>
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
              {thread.photoPreview && (
                <div className="mb-1.5 flex items-center gap-2 rounded-[10px] bg-surface-mute px-2.5 py-1.5" data-testid="photo-preview">
                  <img src={thread.photoPreview} alt="Photo to send" className="h-12 w-12 rounded-[8px] object-cover" />
                  <p className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">{thread.photo?.name ?? 'Photo'}</p>
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={thread.clearPhoto}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
              )}
              <form onSubmit={thread.send} className="flex items-end gap-2" data-testid="dm-composer">
                <input ref={thread.fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" onChange={thread.pickPhoto} data-testid="photo-input" />
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
                <label className="sr-only" htmlFor="dm-draft">
                  Message
                </label>
                {/* The greeting is FIRST name only (Jay, 25 Aug 2026) — the
                    full name is the header's job. Groups keep their title. */}
                <textarea
                  id="dm-draft"
                  ref={thread.draftRef}
                  value={thread.draft}
                  onChange={(e) => thread.setDraft(e.target.value)}
                  onInput={(e) => autoGrow(e.currentTarget)}
                  onKeyDown={composerKeyDown}
                  rows={1}
                  maxLength={2000}
                  placeholder={`Message ${(isGroup ? conversation?.title : otherName?.split(' ')[0]) ?? ''}`}
                  className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
                <EmojiPicker onPick={(emoji) => thread.setDraft(insertAtCursor(thread.draftRef.current, emoji))} />
                <Button type="submit" disabled={thread.sending || (!thread.draft.trim() && !thread.photo)}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      )}
      {reviewing && (
        <p className="mt-3 px-2 text-[12.5px] font-semibold text-ink-muted" data-testid="dm-readonly">
          Read-only. You are not part of this conversation.
        </p>
      )}
    </>
  )
}
