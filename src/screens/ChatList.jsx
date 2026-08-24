import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { Empty } from '../components/Empty.jsx'
import NewChatPicker, { Avatar } from '../components/NewChatPicker.jsx'
import NewGroupPicker from '../components/NewGroupPicker.jsx'
import Spinner from '../components/Spinner.jsx'
import { chatPath, listChats, listDmCandidates, openConversation, subscribeMessages } from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { postedLabel } from '../lib/notices.js'

// The Chats list — 24 Aug 2026. claude/plans/2026-08-24-chat-list.md.
//
// Jay, the evening DMs shipped: "there is no logical way to send someone a
// DM ... make it more like whatsapp". WhatsApp is CONVERSATION-FIRST: one
// list of everything you are in, newest on top, tap to open, a pencil to
// start a new one. This screen is that list, and `Chat` in the nav ALWAYS
// lands here ("the list always" — Jay).
//
// Rows are whatever public.my_chats() returns: squad channels, the squad's
// staff channel (staff only), the club channel, and DMs. A squad row and a
// DM row look the same on purpose — a conversation is a conversation.
//
// ⚠️ INITIALS, NEVER A PHOTO. No child's face is ever in a chat.

function RowAvatar({ row }) {
  if (row.kind === 'dm') return <Avatar name={row.label} staff={row.detail !== 'Direct message'} />
  const glyph = row.kind === 'club' ? '🏉' : row.kind === 'staff' ? '🛡' : shortBand(row.label)
  return (
    <span
      aria-hidden="true"
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${
        row.kind === 'club' ? 'bg-surface-mute text-ink' : 'bg-brand text-ink-invert'
      }`}
    >
      {glyph}
    </span>
  )
}

/** "U13 Mixed" → "U13"; "Senior Men" → "SM". */
export function shortBand(name) {
  const m = /^(U\d{1,2})/i.exec(name ?? '')
  if (m) return m[1].toUpperCase()
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

/** "Coach Taylor: Kick-off moved" — who said the last thing, then what. */
export function previewLine(row, selfId) {
  if (!row.last_body) return row.kind === 'dm' ? 'No messages yet' : 'Nothing here yet'
  const who = row.last_author_id === selfId ? 'You' : row.kind === 'dm' ? null : row.last_author_name
  return who ? `${who}: ${row.last_body}` : row.last_body
}

export default function ChatList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const selfId = user?.id ?? null
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  // false | 'dm' | 'group' — the pencil opens the DM picker (one tap to a
  // DM, the point of the reshape); its "New group" row switches to the
  // multi-select (claude/plans/2026-08-24-group-chats.md).
  const [picking, setPicking] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRows(await listChats())
    } catch (err) {
      setError(err.message || 'We could not load your chats just now.')
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeMessages(load), [load])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows ?? []
    return (rows ?? []).filter((r) => r.label.toLowerCase().includes(q) || (r.last_body ?? '').toLowerCase().includes(q))
  }, [rows, query])

  async function start(person) {
    try {
      const id = await openConversation(person.profile_id)
      navigate(`/chat/dm/${id}`)
    } catch (err) {
      setError(err.message || 'Could not start that conversation.')
      setPicking(false)
    }
  }

  return (
    <section className="px-1">
      <div className="mb-3 mt-1 flex items-center justify-between gap-3">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink">Chats</h2>
        <button
          type="button"
          onClick={() => setPicking((v) => (v ? false : 'dm'))}
          aria-label="New chat"
          aria-expanded={Boolean(picking)}
          data-testid="new-chat"
          className="grid h-10 w-10 place-items-center rounded-full bg-brand text-ink-invert shadow-card hover:opacity-90"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      <div className="mb-3">
        <label className="sr-only" htmlFor="chat-search">
          Search chats
        </label>
        <input
          id="chat-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-[38px] w-full rounded-[12px] border border-line bg-surface-card px-3.5 text-[14px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
        />
      </div>

      {picking === 'dm' && (
        <NewChatPicker
          load={listDmCandidates}
          onPick={start}
          onClose={() => setPicking(false)}
          onNewGroup={() => setPicking('group')}
        />
      )}
      {picking === 'group' && (
        <NewGroupPicker onCreated={(id) => navigate(`/chat/dm/${id}`)} onClose={() => setPicking(false)} />
      )}

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {rows === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}
      {rows?.length === 0 && <Empty message="No chats yet. Your squad's channel appears here once you are on a squad." />}
      {rows && rows.length > 0 && shown.length === 0 && <Empty message="Nothing matches that." />}

      {shown.length > 0 && (
        <Card className="overflow-hidden">
          <ul>
            {shown.map((row) => {
              const unread = Number(row.unread) > 0
              return (
                <li key={`${row.kind}-${row.team_id ?? row.conversation_id ?? 'club'}`} className="border-b border-line last:border-b-0">
                  <Link
                    to={chatPath(row)}
                    data-testid="chat-row"
                    data-kind={row.kind}
                    className="flex items-center gap-3 px-3.5 py-3 hover:bg-surface-mute"
                  >
                    <RowAvatar row={row} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-[15px] ${unread ? 'font-extrabold' : 'font-bold'} text-ink`}>{row.label}</span>
                        <span className={`shrink-0 text-[11.5px] font-semibold ${unread ? 'text-brand-ink' : 'text-ink-faint'}`}>
                          {postedLabel(row.last_at)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[13px] ${unread ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
                          {previewLine(row, selfId)}
                        </span>
                        {unread && (
                          <span
                            className="shrink-0 rounded-full bg-brand px-1.5 py-px text-[11px] font-extrabold text-ink-invert"
                            aria-label={`${row.unread} unread`}
                          >
                            {row.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </section>
  )
}
