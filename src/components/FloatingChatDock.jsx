import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ChannelThread from './ChannelThread.jsx'
import DmThread from './DmThread.jsx'
import Spinner from './Spinner.jsx'
import { chatPath, listChats, listMyConversations, subscribeMessages } from '../data/messages.js'
import { dotState, usePresence } from '../lib/presence.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import useChannelThread from '../lib/useChannelThread.js'
import useDmThread from '../lib/useDmThread.js'
import { RowAvatar, previewLine, scopeChatRows } from '../screens/ChatList.jsx'

// The floating chat dock — claude/plans/2026-08-24-floating-chat-dock.md.
// Jay: "i want the main chat interface to float over the screen when opened"
// and "floating chat button accessible from every page". Option A off the
// design canvas: a bubble bottom-right on every DESKTOP page except /chat
// (the full page IS chat there), opening a compact panel — list, then any
// thread — over whatever you were doing, which never navigates away.
//
// ⚠️ SINCE 26 Aug 2026 THE DOCK IS NOT THIN AT ALL. Jay: it should
// "function exactly as the main chat" — so every thread here IS the full
// screen's own components (claude/plans/2026-08-26-shared-chat-thread.md):
// DMs and groups render src/lib/useDmThread.js + src/components/DmThread.jsx
// (phase 2), and squad, staff and club channels render
// src/lib/useChannelThread.js + src/components/ChannelThread.jsx (phase 4)
// — inline thread replies, @mentions, fixture attach, pins, read stats,
// reports, announce-only, the lot. The hand-rolled bubble/composer copy
// this file used to carry is GONE — do not re-add one; a dock copy is
// exactly the drift the shared components exist to prevent.
//
// What stays behind the header's expand icon is conversation MANAGEMENT
// (rename, leave, block, delete chat, announce-only, wallpaper picking) —
// the spec's scope line, not a capability gap.
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

// A DM or group thread inside the dock: the SAME hook and view the full
// screen renders, scrolled inside the panel instead of the page. Keyed by
// conversation id at the call site, so switching rows remounts with fresh
// state. `initialReplyTo` arms a quote carried across a reply-privately
// hop from one dock thread into another.
function DockDmThread({ row, initialReplyTo, onOpenDm }) {
  const scrollRef = useRef(null)
  const thread = useDmThread(row.conversation_id, { openDm: onOpenDm, consumeReplyState: false, scrollRef })
  const { setReplyTo } = thread
  useEffect(() => {
    if (initialReplyTo) setReplyTo(initialReplyTo)
    // Armed once per mount — the quote belongs to the hop that opened us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={scrollRef} data-testid="dock-thread" className="flex flex-1 flex-col overflow-y-auto bg-surface px-3 py-2">
      <DmThread thread={thread} compact />
    </div>
  )
}

// A squad, staff or club channel inside the dock — phase 4's twin of
// DockDmThread. Same hook and view as src/screens/Chat.jsx; the row's kind
// maps onto the route shapes the hook already speaks.
function DockChannelThread({ row, onOpenDm }) {
  const scrollRef = useRef(null)
  const thread = useChannelThread(
    { param: row.kind === 'club' ? 'club' : row.team_id, wantStaff: row.kind === 'staff' },
    { openDm: onOpenDm, scrollRef },
  )
  return (
    <div ref={scrollRef} data-testid="dock-thread" className="flex flex-1 flex-col overflow-y-auto bg-surface px-3 py-2">
      <ChannelThread thread={thread} compact />
    </div>
  )
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
  const [error, setError] = useState(null)
  const [size, setSize] = useState(loadDockSize)
  // A quote riding a reply-privately hop between dock threads — consumed by
  // the DockDmThread mounted for the destination, then cleared.
  const pendingQuoteRef = useRef(null)
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

  // Presence dots — same pairing the Chats list builds
  // (claude/plans/2026-08-26-last-active-and-presence-dots.md). Decoration:
  // a failure means grey dots, never an error.
  const [dmOthers, setDmOthers] = useState(() => new Map())
  const presenceMap = usePresence(open ? selfId : null)
  const presenceFor = (row) =>
    row.kind === 'dm' ? dotState(presenceMap, dmOthers.get(row.conversation_id)) : null

  const loadList = useCallback(async () => {
    try {
      setRows(await listChats())
    } catch (err) {
      setError(err.message || 'Could not load your chats.')
    }
    try {
      const conversations = await listMyConversations()
      setDmOthers(
        new Map(
          conversations
            .filter((c) => c.kind === 'dm')
            .map((c) => [c.id, c.profile_a === selfId ? c.profile_b : c.profile_a]),
        ),
      )
    } catch {
      setDmOthers(new Map())
    }
  }, [selfId])

  // The threads load and subscribe for themselves (that is the point of the
  // shared hooks); the dock only keeps its LIST fresh while open.
  useEffect(() => {
    if (!open) return undefined
    setError(null)
    loadList()
    return subscribeMessages(loadList)
  }, [open, loadList])

  const scoped = useMemo(() => scopeChatRows(rows, memberships, teams), [rows, memberships, teams])

  // The full chat page owns /chat — a dock there is furniture on furniture.
  if (location.pathname.startsWith('/chat')) return null

  function expand() {
    const target = active ? chatPath(active) : '/chat'
    setOpen(false)
    navigate(target)
  }

  // The dock's answer to the shared hooks' openDm seam: reply-privately and
  // tap-the-author STAY IN THE DOCK, switching its panel to the destination
  // thread. Only a conversation the chat list cannot see yet (brand new,
  // list fetch failed) falls back to the full view.
  async function openDmInDock(dmId, { replyTo: quote } = {}) {
    try {
      const fresh = await listChats()
      setRows(fresh)
      const row = scopeChatRows(fresh, memberships, teams)?.find((r) => r.conversation_id === dmId)
      if (row) {
        pendingQuoteRef.current = quote ?? null
        setActive(row)
        return
      }
    } catch {
      // fall through to the full view
    }
    setOpen(false)
    navigate(`/chat/dm/${dmId}`, quote ? { state: { replyPrivatelyTo: quote } } : undefined)
  }

  const activeIsDm = active && (active.kind === 'dm' || active.kind === 'group')

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
              <button type="button" aria-label="Back to chats" onClick={() => { setActive(null); setError(null); pendingQuoteRef.current = null }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
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
                        <button type="button" data-testid="dock-row" onClick={() => { setActive(row); pendingQuoteRef.current = null }} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-mute">
                          <RowAvatar row={row} presence={presenceFor(row)} />
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

          {activeIsDm && (
            <DockDmThread key={active.conversation_id} row={active} initialReplyTo={pendingQuoteRef.current} onOpenDm={openDmInDock} />
          )}

          {active && !activeIsDm && (
            <DockChannelThread key={`${active.kind}-${active.team_id ?? 'club'}`} row={active} onOpenDm={openDmInDock} />
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
