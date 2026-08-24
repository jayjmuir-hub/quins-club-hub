import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Button from './Button.jsx'
import Spinner from './Spinner.jsx'
import {
  chatPath,
  listChats,
  listDirectMessages,
  listMessages,
  listStaffMessages,
  markMessagesRead,
  postMessage,
  postStaffMessage,
  sendDirectMessage,
  subscribeMessages,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { autoGrow, composerKeyDown } from '../lib/chatComposer.js'
import { useMemberships } from '../lib/memberships.jsx'
import { stampLabel } from '../lib/notices.js'
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
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const loadList = useCallback(async () => {
    try {
      setRows(await listChats())
    } catch (err) {
      setError(err.message || 'Could not load your chats.')
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
    return subscribeMessages(() => {
      loadList()
      loadThread()
    })
  }, [open, loadList, loadThread])

  useEffect(() => {
    if (thread?.length) bottomRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [thread])

  const scoped = useMemo(() => scopeChatRows(rows, memberships, teams), [rows, memberships, teams])

  // The full chat page owns /chat — a dock there is furniture on furniture.
  if (location.pathname.startsWith('/chat')) return null

  async function send(domEvent) {
    domEvent.preventDefault()
    if (!draft.trim() || sending || !active) return
    setSending(true)
    setError(null)
    try {
      if (active.kind === 'dm' || active.kind === 'group') await sendDirectMessage(active.conversation_id, draft)
      else if (active.kind === 'staff') await postStaffMessage(active.team_id, draft)
      else await postMessage(active.team_id ?? null, draft)
      setDraft('')
      await loadThread()
      await loadList()
    } catch (err) {
      setError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
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
        <div className="flex h-[560px] w-[380px] max-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-[18px] border border-line bg-surface-card shadow-[0_18px_50px_-12px_rgba(16,17,22,.35)]">
          <div className="flex items-center gap-2.5 bg-chrome px-3.5 py-2.5 text-white">
            {active ? (
              <button type="button" aria-label="Back to chats" onClick={() => { setActive(null); setThread(null); setError(null) }} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/10">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{active ? active.label : 'Chats'}</p>
              {active && <p className="truncate text-[11px] text-white/60">{active.detail}</p>}
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
              <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto bg-surface px-3 py-3">
                {thread === null && <div className="py-8"><Spinner /></div>}
                {thread?.length === 0 && <p className="px-1 py-4 text-[13px] text-ink-muted">Nothing here yet.</p>}
                {thread?.map((m) => {
                  const mine = m.author_id === selfId
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-testid="dock-bubble">
                      <div className={`max-w-[85%] rounded-[13px] px-3 py-1.5 ${mine ? 'bg-chrome text-white' : 'bg-surface-card text-ink shadow-card'}`}>
                        <p className={`text-[11px] font-extrabold ${mine ? 'text-white/80' : 'text-brand-ink'}`}>{mine ? 'You' : m.author?.full_name ?? 'Someone'}</p>
                        {m.deleted_at ? (
                          <p className="text-[12.5px] italic opacity-70">Message removed</p>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.4]">{m.body}</p>
                        )}
                        <p className={`mt-0.5 text-[10px] font-semibold ${mine ? 'text-white/60' : 'text-ink-faint'}`}>
                          {stampLabel(m.created_at)}
                          {m.replies?.length ? ` · ${m.replies.length} repl${m.replies.length === 1 ? 'y' : 'ies'} in full view` : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-surface-card p-2.5" data-testid="dock-composer">
                <label className="sr-only" htmlFor="dock-draft">Message</label>
                <textarea
                  id="dock-draft"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onInput={(e) => autoGrow(e.currentTarget, 110)}
                  onKeyDown={composerKeyDown}
                  rows={1}
                  maxLength={2000}
                  placeholder={`Message ${active.label}`}
                  className="min-h-[38px] flex-1 resize-none rounded-[12px] border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
                />
                <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
                  Send
                </Button>
              </form>
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
