import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from './Button.jsx'
import ChatBubble from './ChatBubble.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import Spinner from './Spinner.jsx'
import { uploadChatPhoto } from '../data/chatMedia.js'
import { listMyNicknames } from '../data/nicknames.js'
import { backgroundStyle, getChatBackground } from '../lib/chatBackgrounds.js'
import { dayLabel, daysDiffer } from '../lib/chatDays.js'
import {
  chatPath,
  listChats,
  listDirectMessages,
  listMessages,
  listReactions,
  listStaffMessages,
  markMessagesRead,
  postMessage,
  postStaffMessage,
  sendDirectMessage,
  subscribeMessages,
  subscribeReactions,
  toggleReaction,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { autoGrow, composerKeyDown, insertAtCursor } from '../lib/chatComposer.js'
import { useMemberships } from '../lib/memberships.jsx'
import { RowAvatar, previewLine, scopeChatRows } from '../screens/ChatList.jsx'

// The floating chat dock — claude/plans/2026-08-24-floating-chat-dock.md.
// Jay: "i want the main chat interface to float over the screen when opened"
// and "floating chat button accessible from every page". Option A off the
// design canvas: a bubble bottom-right on every DESKTOP page except /chat
// (the full page IS chat there), opening a compact panel — list, then any
// thread — over whatever you were doing, which never navigates away.
//
// ⚠️ DELIBERATELY THIN. DMs, groups and channels get stream + composer; the
// database's announce-only refusal is the announce-only UX; everything
// richer (fixture threads, mentions, pins, read stats, reports, group
// admin) lives one click away behind the expand icon. This dock is for
// answering a parent while you're on the Roster, not for moderating.
//
// Mounted once in AppShell so an open panel and a half-written draft survive
// navigation. Mobile never sees it: the tab bar already carries Chat, and a
// bubble would sit on the thumb's composer space.

// ── Panel size (round 2 follow-up, Jay: "can we make the chat box
//    resizeable? this would be beneficial in desktop mode") ───────────────
//
// A custom top-left grip rather than CSS `resize`: the panel is anchored
// bottom-right, so the native handle (always bottom-right) would drag the
// one corner that cannot move. Device-level persistence, deliberately not
// an account setting — the right size belongs to the screen in front of
// you, same ruling as chat-enter-sends (src/lib/chatComposer.js).
const SIZE_KEY = 'chat-dock-size'
const MIN_W = 320
// ⚠️ 1100, not the first cut's 640 — Jay, same evening the grip shipped:
// "on desktop mode we could make it much wider". The real ceiling is the
// viewport (max-w-[calc(100vw-48px)] on the panel), so this number only
// says where the DRAG stops on a monitor wide enough not to care.
const MAX_W = 1100
const MIN_H = 400
const MAX_H = 860
const DEFAULT_SIZE = { w: 380, h: 560 }

export function clampDockSize(size) {
  const w = Number(size?.w)
  const h = Number(size?.h)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return { ...DEFAULT_SIZE }
  return {
    w: Math.min(MAX_W, Math.max(MIN_W, Math.round(w))),
    h: Math.min(MAX_H, Math.max(MIN_H, Math.round(h))),
  }
}

function loadDockSize() {
  try {
    const stored = JSON.parse(localStorage.getItem(SIZE_KEY))
    return stored ? clampDockSize(stored) : { ...DEFAULT_SIZE }
  } catch {
    return { ...DEFAULT_SIZE }
  }
}

function saveDockSize(size) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size))
  } catch {
    // private-mode storage failures: the size just stays per-session
  }
}

export default function FloatingChatDock({ badge = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { memberships, teams } = useMemberships()
  const selfId = user?.id ?? null

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(null)
  const [active, setActive] = useState(null) // a my_chats row, or null for the list
  const [thread, setThread] = useState(null)
  const [reactions, setReactions] = useState(() => new Map())
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Round 2: a photo waiting in the dock's composer, and the picker's handle.
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [size, setSize] = useState(loadDockSize)
  // Round 3: my private labels, and the shared device wallpaper.
  const [nicknames, setNicknames] = useState(() => new Map())
  const bottomRef = useRef(null)
  const draftRef = useRef(null)
  const fileRef = useRef(null)
  // The drag's fixed point: pointer position and size at pointerdown. The
  // panel grows LEFT and UP from its anchored corner, so dragging the grip
  // left/up makes it bigger — dx/dy are subtracted, not added.
  const dragRef = useRef(null)

  function startResize(domEvent) {
    domEvent.preventDefault()
    dragRef.current = { x: domEvent.clientX, y: domEvent.clientY, w: size.w, h: size.h }
    function onMove(moveEvent) {
      const start = dragRef.current
      if (!start) return
      setSize(clampDockSize({ w: start.w - (moveEvent.clientX - start.x), h: start.h - (moveEvent.clientY - start.y) }))
    }
    function onUp() {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // Read back through the setter so the SAVED value is the clamped one
      // actually on screen, not a stale closure.
      setSize((current) => {
        saveDockSize(current)
        return current
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const loadList = useCallback(async () => {
    try {
      setRows(await listChats())
    } catch (err) {
      setError(err.message || 'Could not load your chats.')
    }
    // Decoration — a failure renders real names, never an error.
    try {
      setNicknames(await listMyNicknames())
    } catch {
      setNicknames(new Map())
    }
  }, [])

  const loadThread = useCallback(async () => {
    if (!active) return
    try {
      let list
      if (active.kind === 'dm' || active.kind === 'group') list = await listDirectMessages(active.conversation_id)
      else if (active.kind === 'staff') list = await listStaffMessages(active.team_id)
      else list = await listMessages(active.team_id ?? null)
      setThread(list)
      try {
        setReactions(await listReactions(list.map((m) => m.id)))
      } catch {
        setReactions(new Map())
      }
      const theirs = list.filter((m) => m.author_id !== selfId && !m.deleted_at).map((m) => m.id)
      if (theirs.length && selfId) markMessagesRead(selfId, theirs)
    } catch (err) {
      setError(err.message || 'Could not load this chat.')
    }
  }, [active, selfId])

  useEffect(() => {
    if (!open) return undefined
    setError(null)
    loadList()
    loadThread()
    const offMessages = subscribeMessages(() => {
      loadList()
      loadThread()
    })
    const offReactions = subscribeReactions(loadThread)
    return () => {
      offMessages()
      offReactions()
    }
  }, [open, loadList, loadThread])

  useEffect(() => {
    if (thread?.length) bottomRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [thread])

  const scoped = useMemo(() => scopeChatRows(rows, memberships, teams), [rows, memberships, teams])

  // The full chat page owns /chat — a dock there is furniture on furniture.
  if (location.pathname.startsWith('/chat')) return null

  function clearPhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(null)
    setPhotoPreview(null)
  }

  function pickPhoto(domEvent) {
    const file = domEvent.target.files?.[0]
    domEvent.target.value = ''
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    try {
      setPhotoPreview(URL.createObjectURL(file))
    } catch {
      setPhotoPreview(null)
    }
  }

  async function send(domEvent) {
    domEvent.preventDefault()
    if ((!draft.trim() && !photo) || sending || !active) return
    setSending(true)
    setError(null)
    try {
      // Photo first, message second — same order as the full thread.
      const attachmentPath = photo ? await uploadChatPhoto(selfId, photo) : null
      if (active.kind === 'dm' || active.kind === 'group') await sendDirectMessage(active.conversation_id, draft, { attachmentPath })
      else if (active.kind === 'staff') await postStaffMessage(active.team_id, draft, { attachmentPath })
      else await postMessage(active.team_id ?? null, draft, { attachmentPath })
      setDraft('')
      clearPhoto()
      await loadThread()
      await loadList()
    } catch (err) {
      setError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  async function react(messageId, emoji, on) {
    try {
      await toggleReaction(messageId, selfId, emoji, on)
      await loadThread()
    } catch (err) {
      setError(err.message || 'Could not react to that.')
    }
  }

  function expand() {
    const target = active ? chatPath(active) : '/chat'
    setOpen(false)
    navigate(target)
  }

  // ⚠️ THE BOTTOM-RIGHT CORNER IS OURS ONLY BECAUSE HELP LEFT IT. The first
  // cut sat under the floating HelpButton and Help ate every click (found in
  // the harness, 24 Aug 2026). Help then RETIRED from the corner into the
  // AccountMenu (claude/plans/2026-08-24-help-into-account-menu.md, PR #367)
  // — so this component MUST NOT MERGE BEFORE #367, or the collision comes
  // straight back. If a floating anything returns to this corner, the two
  // need stacking again, not sharing.
  return (
    <div className="fixed bottom-5 right-6 z-30 hidden flex-col items-end gap-3 desktop:flex" data-testid="chat-dock">
      {open && (
        <div
          className="relative flex max-h-[calc(100vh-120px)] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-[18px] border border-line bg-surface-card shadow-[0_18px_50px_-12px_rgba(16,17,22,.35)]"
          style={{ width: size.w, height: size.h }}
          data-testid="dock-panel"
        >
          <button
            type="button"
            aria-label="Resize chat"
            data-testid="dock-resize-grip"
            onPointerDown={startResize}
            className="absolute left-0 top-0 z-10 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-br-[10px] text-white/50 hover:text-white"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M10 4 4 10M16 4 4 16" />
            </svg>
          </button>
          {/* pl-9, not px-3.5: the resize grip owns the top-left corner and
              the back button must not sit under it.
              Round 3, Jay: "need a better color than black for the group
              name area" — quins green (accent.deep), white text measured in
              the contrast gate. */}
          <div className="flex items-center gap-2.5 bg-accent-deep py-2.5 pl-9 pr-3.5 text-white">
            {active ? (
              <button type="button" aria-label="Back to chats" onClick={() => { setActive(null); setThread(null); setError(null) }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{active ? active.label : 'Chats'}</p>
              {active && <p className="truncate text-[11px] text-white/70">{active.detail}</p>}
            </div>
            <button type="button" aria-label="Open full view" onClick={expand} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
            </button>
            <button type="button" aria-label="Close chat" onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>

          {error && (
            <p role="alert" className="border-b border-line bg-danger-bg px-3.5 py-2 text-[12.5px] font-semibold text-danger-ink">
              {error}
            </p>
          )}

          {!active && (
            <div className="flex-1 overflow-y-auto">
              {scoped === null || rows === null ? (
                <div className="py-8"><Spinner /></div>
              ) : scoped.length === 0 ? (
                <p className="px-4 py-6 text-[13px] text-ink-muted">No chats yet.</p>
              ) : (
                <ul>
                  {scoped.map((row) => {
                    const unread = Number(row.unread) > 0
                    return (
                      <li key={`${row.kind}-${row.team_id ?? row.conversation_id ?? 'club'}`} className="border-b border-line last:border-b-0">
                        <button type="button" data-testid="dock-row" onClick={() => { setActive(row); setThread(null) }} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-mute">
                          <RowAvatar row={row} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-[14px] ${unread ? 'font-extrabold' : 'font-bold'} text-ink`}>{row.label}</span>
                            <span className={`block truncate text-[12.5px] ${unread ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{previewLine(row, selfId)}</span>
                          </span>
                          {unread && (
                            <span className="shrink-0 rounded-full bg-brand px-1.5 py-px text-[10.5px] font-extrabold text-ink-invert" aria-label={`${row.unread} unread`}>
                              {row.unread}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {active && (
            <>
              <div className="flex flex-1 flex-col gap-1 overflow-y-auto bg-surface px-3 py-2" style={backgroundStyle(getChatBackground()) ?? undefined}>
                {thread === null && <div className="py-8"><Spinner /></div>}
                {thread?.length === 0 && <p className="px-1 py-4 text-[13px] text-ink-muted">Nothing here yet.</p>}
                {thread?.map((m, index) => {
                  const mine = m.author_id === selfId
                  const authorName = nicknames.get(m.author_id) ?? m.author?.full_name ?? 'Someone'
                  const tallies = reactions.get(m.id) ?? []
                  // 1:1 chrome already names them. Groups, staff and squad
                  // channels still need the name on THEIRS — same rule as
                  // DirectMessages Thread / MessageRow.
                  const named = active.kind !== 'dm'
                  const quote = m.quoted?.id && !m.deleted_at ? (
                    <p
                      className={`mb-0.5 truncate rounded-[6px] border-l-2 px-1.5 py-0.5 text-[11px] ${mine ? 'border-white/40 bg-white/10 text-white/70' : 'border-brand bg-surface-mute text-ink-muted'}`}
                      data-testid="quote-block"
                    >
                      {m.quoted.deleted_at ? 'Message deleted' : (m.quoted.body?.trim() ? m.quoted.body : '📷 Photo')}
                    </p>
                  ) : null
                  return (
                    <Fragment key={m.id}>
                      {daysDiffer(thread[index - 1]?.created_at, m.created_at) && (
                        <div className="my-1 flex justify-center" data-testid="day-divider" role="separator">
                          <span className="rounded-pill bg-surface-mute px-2 py-0.5 text-[10.5px] font-bold text-ink-muted shadow-card">
                            {dayLabel(m.created_at)}
                          </span>
                        </div>
                      )}
                      <ChatBubble
                        mine={mine}
                        messageId={m.id}
                        testId="dock-bubble"
                        showAuthor={named && !mine}
                        authorLabel={authorName}
                        forwarded={Boolean(m.forwarded)}
                        quote={quote}
                        deleted={Boolean(m.deleted_at)}
                        createdAt={m.created_at}
                        body={m.body}
                        photoPath={m.attachment_path}
                        extra={
                          !m.deleted_at && m.replies?.length ? (
                            <p className={`mt-0.5 text-[10px] font-semibold ${mine ? 'text-white/70' : 'text-ink-faint'}`}>
                              {m.replies.length} repl{m.replies.length === 1 ? 'y' : 'ies'} in full view
                            </p>
                          ) : null
                        }
                        reactions={tallies}
                        selfId={selfId}
                        onReact={react}
                      />
                    </Fragment>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <div className="border-t border-line bg-surface-card p-2.5">
                {photoPreview && (
                  <div className="mb-1.5 flex items-center gap-2 rounded-[10px] bg-surface-mute px-2 py-1" data-testid="photo-preview">
                    <img src={photoPreview} alt="Photo to send" className="h-9 w-9 rounded-[7px] object-cover" />
                    <p className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">{photo?.name ?? 'Photo'}</p>
                    <button type="button" aria-label="Remove photo" onClick={clearPhoto} className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                )}
                <form onSubmit={send} className="flex items-end gap-2" data-testid="dock-composer">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickPhoto} data-testid="photo-input" />
                  <button
                    type="button"
                    aria-label="Attach a photo"
                    onClick={() => fileRef.current?.click?.()}
                    className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute"
                    data-testid="photo-button"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="9" cy="10" r="1.6" />
                      <path d="m21 15-4.5-4.5L7 20" />
                    </svg>
                  </button>
                  <label className="sr-only" htmlFor="dock-draft">Message</label>
                  <textarea
                    id="dock-draft"
                    ref={draftRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onInput={(e) => autoGrow(e.currentTarget, 110)}
                    onKeyDown={composerKeyDown}
                    rows={1}
                    maxLength={2000}
                    placeholder={`Message ${active.kind === 'dm' ? active.label.split(' ')[0] : active.label}`}
                    className="min-h-[38px] flex-1 resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                  />
                  <EmojiPicker onPick={(emoji) => setDraft(insertAtCursor(draftRef.current, emoji))} />
                  <Button type="submit" size="sm" disabled={sending || (!draft.trim() && !photo)}>
                    Send
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        aria-label={open ? 'Hide chat' : 'Open chat'}
        aria-expanded={open}
        data-testid="dock-bubble-button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-14 w-14 place-items-center rounded-full bg-brand text-ink-invert shadow-brand-glow hover:bg-brand-deep"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
        </svg>
        {badge && !open && (
          <span data-testid="dock-badge" className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-surface bg-chrome" aria-label="Unread messages" />
        )}
      </button>
    </div>
  )
}
