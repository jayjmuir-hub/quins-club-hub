import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { Empty } from '../components/Empty.jsx'
import NewChatPicker, { Avatar } from '../components/NewChatPicker.jsx'
import NewGroupPicker from '../components/NewGroupPicker.jsx'
import PresenceDot from '../components/PresenceDot.jsx'
import Spinner from '../components/Spinner.jsx'
import { attachmentPreviewLabel } from '../data/chatMedia.js'
import { listMyChatPrefs, setChatPref } from '../data/chatPrefs.js'
import {
  chatPath,
  listChats,
  listDmCandidates,
  listMyConversations,
  openConversation,
  subscribeMessages,
} from '../data/messages.js'
import { dotState, usePresence } from '../lib/presence.js'
import { ROLE_CHANNELS, isRoleChannel } from '../lib/roleChannels.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
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

export function RowAvatar({ row, presence = null }) {
  if (row.kind === 'dm') {
    const face = <Avatar name={row.label} staff={row.detail !== 'Direct message'} />
    // The presence dot rides only when the screen passes a state — pickers
    // pass nothing, and channels below never get one: a channel is not a
    // person (claude/plans/2026-08-26-last-active-and-presence-dots.md).
    if (!presence) return face
    return (
      <span className="relative shrink-0">
        {face}
        <PresenceDot state={presence} />
      </span>
    )
  }
  const glyph = isRoleChannel(row.kind)
    ? ROLE_CHANNELS[row.kind].glyph
    : row.kind === 'club'
      ? '🏉'
      : row.kind === 'staff'
        ? '🛡'
        : shortBand(row.label)
  return (
    <span
      aria-hidden="true"
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${
        row.kind === 'club' || isRoleChannel(row.kind) ? 'bg-surface-mute text-ink' : 'bg-brand text-ink-invert'
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
  const who = row.last_author_id === selfId ? 'You' : row.kind === 'dm' ? null : row.last_author_name
  const withWho = (text) => (who ? `${who}: ${text}` : text)
  if (row.last_body) return withWho(row.last_body)
  // A message with no words is still a message. A photo or voice note is stored
  // with an empty body and an attachment (the messages_body_check constraint
  // yields the ">= 1 char" arm to attachment_path), and my_chats surfaces that
  // path as last_attachment_path — see db/migrations/20260828_my_chats_last_attachment.sql.
  // Preview the medium ("📷 Photo" / "🎤 Voice message"), not "No messages yet",
  // which is why this DM looked empty over a long history. Only a genuinely empty
  // thread — no last message, so no author — says so.
  if (row.last_attachment_path) return withWho(attachmentPreviewLabel(row.last_attachment_path))
  return row.kind === 'dm' ? 'No messages yet' : 'Nothing here yet'
}

/**
 * A BlockTitle that folds its section — same anatomy (slash, label, the
 * gradient rule) as Editorial's BlockTitle, plus the chevron, the count,
 * and aria-expanded. Local to the chat list; the fold itself is the
 * screen's state, remembered per device.
 */
function FoldTitle({ label, count, folded, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!folded}
      data-testid={`fold-${label.toLowerCase().replace(/\W+/g, '-')}`}
      className="mb-2.5 ml-0.5 flex w-full items-center gap-2.5 rounded-[8px] font-display text-[17px] uppercase tracking-[0.03em] text-ink hover:bg-surface-mute"
    >
      <span aria-hidden="true" className="font-accent text-[15px] font-semibold italic leading-none text-brand-ink">/</span>
      <span>{label}</span>
      {folded && <span className="text-[12px] font-bold normal-case text-ink-muted">{count}</span>}
      <span aria-hidden="true" className="h-[2px] flex-1 rounded-sm bg-[image:linear-gradient(90deg,theme(colors.brand.DEFAULT),transparent)]" />
      <svg
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        className={`shrink-0 text-ink-faint transition-transform ${folded ? '' : 'rotate-180'}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
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
  // Chat navigation (claude/plans/2026-08-24-chat-navigation.md): the
  // category filter lives in the URL so the sidebar's deep-links and the
  // chip row are ONE mechanism; the folds live on the device like
  // chat-enter-sends.
  const [searchParams, setSearchParams] = useSearchParams()
  const filter = ['unread', 'squads', 'dms'].includes(searchParams.get('filter')) ? searchParams.get('filter') : null
  const [folds, setFolds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('chat-folds')) ?? {}
    } catch {
      return {}
    }
  })
  function toggleFold(key, currentlyFolded) {
    setFolds((prev) => {
      const next = { ...prev, [key]: !currentlyFolded }
      try {
        localStorage.setItem('chat-folds', JSON.stringify(next))
      } catch {
        // private mode: the fold just stays per-session
      }
      return next
    })
  }

  // Round 6: my pins and my archive — decoration; a failure renders the
  // plain list, never an error.
  const [prefs, setPrefs] = useState(() => new Map())
  // Presence dots (claude/plans/2026-08-26-last-active-and-presence-dots.md):
  // which person a DM row is with. my_chats() deliberately does not return
  // the other profile id, so the pairs come from listMyConversations — a
  // light second fetch, and decoration: a failure means grey dots, never an
  // error.
  const [dmOthers, setDmOthers] = useState(() => new Map())
  const presenceMap = usePresence(selfId)
  const presenceFor = (row) =>
    row.kind === 'dm' ? dotState(presenceMap, dmOthers.get(row.conversation_id)) : null

  const load = useCallback(async () => {
    setError(null)
    try {
      setRows(await listChats())
    } catch (err) {
      setError(err.message || 'We could not load your chats just now.')
    }
    try {
      setPrefs(await listMyChatPrefs())
    } catch {
      setPrefs(new Map())
    }
    try {
      // ⚠️ my_conversations RPC rows: { conversation_id, other_id, … } — the
      // INBOX shape, not the conversations table. The first wiring filtered
      // on table columns (kind/id/profile_a) that do not exist here, built
      // an empty map, and every list dot fell to grey while the thread
      // header (which pairs from other.id directly) was green. Found live by
      // Jay minutes after deploy, 26 Aug 2026.
      const conversations = await listMyConversations()
      setDmOthers(
        new Map(conversations.filter((c) => c.other_id).map((c) => [c.conversation_id, c.other_id])),
      )
    } catch {
      setDmOthers(new Map())
    }
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => subscribeMessages(load), [load])

  // ⚠️ SCOPED AT RENDER, NOT IN THE FETCH — the memberships.jsx contract
  // every other screen follows ("RLS still returns club-wide rows; the app
  // simply declines to display them"). my_chats() runs as the REAL account,
  // so an admin under "View as" was shown every squad's channel (Jay,
  // 24 Aug 2026). Cosmetic, never a boundary: a real coach's rows are
  // already narrowed by the database.
  const { memberships, teams } = useMemberships()
  const scoped = useMemo(() => scopeChatRows(rows, memberships, teams), [rows, memberships, teams])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scoped
    return scoped.filter((r) => r.label.toLowerCase().includes(q) || (r.last_body ?? '').toLowerCase().includes(q))
  }, [scoped, query])

  // The home shape's derived pieces — all from the same my_chats() rows.
  const searching = query.trim().length > 0
  const prefFor = (r) => prefs.get(rowKey(r)) ?? {}
  // Archived chats leave the sections AND the unread arithmetic — an
  // archived chat is one you asked to stop hearing about (WhatsApp's own
  // rule). Search still finds them.
  const active = useMemo(() => scoped.filter((r) => !prefFor(r).archived), [scoped, prefs])
  const archivedRows = useMemo(() => scoped.filter((r) => prefFor(r).archived), [scoped, prefs])
  const unreadTotal = useMemo(() => active.reduce((n, r) => n + Number(r.unread || 0), 0), [active])
  const unreadChats = useMemo(() => active.filter((r) => Number(r.unread) > 0).length, [active])
  const hero = useMemo(() => active.find((r) => r.kind === 'club') ?? null, [active])
  // Pinned first (round 6), then unread, then recency — and the category
  // filter narrows before the sections split.
  const unreadFirst = (rows) =>
    rows.slice().sort(
      (a, b) =>
        Boolean(prefFor(b).pinned) - Boolean(prefFor(a).pinned) ||
        (Number(b.unread) > 0) - (Number(a.unread) > 0) ||
        new Date(b.last_at ?? 0) - new Date(a.last_at ?? 0),
    )
  const filtered = useMemo(
    () => {
      const base = searching ? shown : shown.filter((r) => !prefFor(r).archived)
      return filter === 'unread' ? base.filter((r) => Number(r.unread) > 0) : base
    },
    [shown, filter, prefs, searching],
  )
  const squadRows = useMemo(
    // Role channels (20260830) sit with the squads: they are channels, and a
    // head coach expects Club Head Coaches beside their squad rows, not among
    // their DMs.
    () =>
      filter === 'dms'
        ? []
        : unreadFirst(filtered.filter((r) => r.kind === 'squad' || r.kind === 'staff' || isRoleChannel(r.kind))),
    [filtered, filter],
  )
  const dmRows = useMemo(
    () => (filter === 'squads' ? [] : unreadFirst(filtered.filter((r) => r.kind === 'dm' || r.kind === 'group'))),
    [filtered, filter],
  )

  async function togglePref(row, patch) {
    try {
      await setChatPref(selfId, rowKey(row), patch)
      setPrefs(await listMyChatPrefs())
    } catch (err) {
      setError(err.message || 'Could not change that.')
    }
  }

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
        <span className="flex items-center gap-2">
        {/* Round 4: the private starred-messages list. Only ever yours —
            message_stars is owner-only by RLS. */}
        <Link
          to="/chat/starred"
          aria-label="Starred messages"
          data-testid="starred-link"
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-card text-ink-muted shadow-card hover:text-ink"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z" />
          </svg>
        </Link>
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
        </span>
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

      {/* The category chips — WhatsApp's own answer, and the ONLY one that
          exists on a phone, where the sidebar's copies of these do not. */}
      <div className="mb-3 flex flex-wrap gap-1.5" data-testid="chat-filters">
        {[
          { key: null, label: 'All' },
          { key: 'unread', label: unreadChats > 0 ? `Unread · ${unreadChats}` : 'Unread' },
          { key: 'dms', label: 'Groups & DMs' },
          { key: 'squads', label: 'Squads' },
        ].map((chip) => (
          <button
            key={chip.key ?? 'all'}
            type="button"
            aria-pressed={filter === chip.key}
            onClick={() => setSearchParams(chip.key ? { filter: chip.key } : {}, { replace: true })}
            className={`rounded-pill px-3 py-1 text-[12.5px] font-bold ${
              filter === chip.key
                ? 'bg-chrome text-white'
                : 'border border-line bg-surface-card text-ink-muted hover:text-ink'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Absent at zero — a "0 unread" line is furniture. */}
      {unreadTotal > 0 && (
        <div data-testid="unread-strip" className="mb-2 flex items-center gap-2 px-1">
          <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-brand px-1.5 text-[12px] font-extrabold text-ink-invert">
            {unreadTotal}
          </span>
          <span className="text-[13px] font-semibold text-ink-muted">
            unread in {unreadChats} chat{unreadChats === 1 ? '' : 's'}
          </span>
        </div>
      )}

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

      {/* The home shape (claude/plans/2026-08-24-member-chat-home.md): hero
          and sections while browsing; the flat list of matches while
          searching. The rows themselves are identical either way. */}
      {!searching && !filter && hero && (
        <Link to={chatPath(hero)} data-testid="chat-hero" data-kind="club" className="mb-1 block">
          <Card className="flex items-start gap-3 px-4 py-3.5 hover:bg-surface-mute">
            <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-monogram-coach text-ink-invert">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11v3" />
                <path d="M7 10v5" />
                <path d="M21 6v12l-10-3H7v-6h4l10-3Z" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-extrabold text-ink">{hero.label}</span>
                <span className="shrink-0 text-[11.5px] font-semibold text-ink-faint">{postedLabel(hero.last_at)}</span>
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-ink-muted">{previewLine(hero, selfId)}</span>
              <span className="mt-1.5 flex gap-1.5">
                {hero.detail?.includes('admins post') && (
                  <span className="rounded-pill bg-danger-bg px-2 py-0.5 font-condensed text-[10.5px] font-bold uppercase tracking-[.1em] text-danger-ink">
                    Announce-only
                  </span>
                )}
                <span className="rounded-pill bg-surface-mute px-2 py-0.5 font-condensed text-[10.5px] font-bold uppercase tracking-[.1em] text-ink-muted">
                  Pinned
                </span>
              </span>
            </span>
          </Card>
        </Link>
      )}

      {/* ⚠️ THE WRAPPER CARRIES THE 18px, NOT THE TITLE — BlockTitle's
          `first:mt-0` zeroes its own top margin the moment a <section>
          makes it a first child, and the title then sat 4px off the card
          above (Jay, 24 Aug 2026: "the Direct Messages text touches the
          chip above it"). Dashboard's blocks compensate the same way. */}
      {/* DMs FIRST (Jay, 25 Aug 2026: "DMs should always be at the top of
          the chat screen instead of having to scroll down"). The chips and
          the sidebar sub-items carry the same order. */}
      {/* Desktop fills the width by putting the two parallel lists side by
          side (26 Aug 2026); each section is conditional, so a person with
          only one of them gets a single column that spans. Archived and
          search results stay full-width below. */}
      <div className="desktop:grid desktop:grid-cols-2 desktop:items-start desktop:gap-x-[18px]">
      {!searching && dmRows.length > 0 && (
        <section data-testid="section-dms" className="mt-[18px]">
          <FoldTitle label="Direct messages" count={dmRows.length} folded={Boolean(folds.dms)} onToggle={() => toggleFold('dms', Boolean(folds.dms))} />
          {!folds.dms && (
            <Card className="overflow-hidden">
              <ul>
                {dmRows.map((row) => (
                  <ChatRow key={rowKey(row)} row={row} selfId={selfId} pref={prefs.get(rowKey(row))} onPref={togglePref} presence={presenceFor(row)} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {!searching && squadRows.length > 0 && (
        <section data-testid="section-squads" className="mt-[18px]">
          <FoldTitle label="Your squads" count={squadRows.length} folded={Boolean(folds.squads)} onToggle={() => toggleFold('squads', Boolean(folds.squads))} />
          {!folds.squads && (
            <Card className="overflow-hidden">
              <ul>
                {squadRows.map((row) => (
                  <ChatRow key={rowKey(row)} row={row} selfId={selfId} pref={prefs.get(rowKey(row))} onPref={togglePref} presence={presenceFor(row)} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}
      </div>

      {!searching && archivedRows.length > 0 && (
        <section data-testid="section-archived" className="mt-[18px]">
          <FoldTitle
            label="Archived"
            count={archivedRows.length}
            folded={folds.archived !== false}
            onToggle={() => toggleFold('archived', folds.archived !== false)}
          />
          {folds.archived === false && (
            <Card className="overflow-hidden">
              <ul>
                {archivedRows.map((row) => (
                  <ChatRow key={rowKey(row)} row={row} selfId={selfId} pref={prefs.get(rowKey(row))} onPref={togglePref} presence={presenceFor(row)} />
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {searching && shown.length > 0 && (
        <Card className="overflow-hidden">
          <ul>
            {shown.map((row) => (
              <ChatRow key={rowKey(row)} row={row} selfId={selfId} presence={presenceFor(row)} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function rowKey(row) {
  return `${row.kind}-${row.team_id ?? row.conversation_id ?? 'club'}`
}

/**
 * ⚠️ SCOPED AT RENDER, NOT IN THE FETCH — the memberships.jsx contract every
 * screen follows ("RLS still returns club-wide rows; the app simply declines
 * to display them"). my_chats() runs as the REAL account, so an admin under
 * "View as" was shown every squad's channel (Jay, 24 Aug 2026). Cosmetic,
 * never a boundary: a real coach's rows are already narrowed by the database.
 * Exported so the floating dock and this screen cannot drift.
 */
export function scopeChatRows(rows, memberships, teams) {
  // Not loaded yet: show what the database sent rather than flashing an
  // empty list — the database has already scoped it for real users.
  if (!memberships || !teams) return rows ?? []
  const visible = new Set(visibleTeams(memberships, teams).map((t) => t.id))
  return (rows ?? []).filter((r) => {
    if (r.kind === 'staff') return canEditTeam(memberships, r.team_id)
    if (r.team_id) return visible.has(r.team_id)
    // A DM nobody has ever messaged in is hidden until somebody does (26 Aug
    // 2026, Jay: "no need to save a chat like that if it wasn't used") — the
    // person card's Chat button creates the conversation on TAP, so a look
    // without a message was littering both people's lists. last_author_id is
    // the signal: my_chats fills it from the newest VISIBLE message, so a
    // photo-only chat keeps its author and stays. Groups are deliberate
    // creations and always show; the row returns the moment a message lands.
    if (r.kind === 'dm') return r.last_author_id != null
    return true // club and groups are not squad-scoped
  })
}

function ChatRow({ row, selfId, pref = null, onPref = null, presence = null }) {
  const unread = Number(row.unread) > 0
  const pinned = Boolean(pref?.pinned)
  const archived = Boolean(pref?.archived)
  // Round 6: the row's own tiny menu — Pin and Archive are per-person list
  // shape, so they live on the row, not in the thread.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!menuOpen) return undefined
    function close(domEvent) {
      if (!menuRef.current?.contains(domEvent.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-center hover:bg-surface-mute">
      <Link
        to={chatPath(row)}
        data-testid="chat-row"
        data-kind={row.kind}
        className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3"
      >
        <RowAvatar row={row} presence={presence} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`flex min-w-0 items-baseline gap-1.5 truncate text-[15px] ${unread ? 'font-extrabold' : 'font-bold'} text-ink`}>
              {pinned && <span aria-label="Pinned" data-testid="row-pin" className="text-[11px]">📌</span>}
              <span className="truncate">{row.label}</span>
            </span>
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
      {onPref && (
        <div className="relative shrink-0 pr-2" ref={menuRef}>
          <button
            type="button"
            aria-label={`Options for ${row.label}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-faint hover:bg-surface hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
          </button>
          {menuOpen && (
            <ul role="menu" className="absolute right-2 top-9 z-20 min-w-[150px] overflow-hidden rounded-card border border-line bg-surface-card py-1 shadow-card">
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPref(row, { pinned: !pinned }) }} className="block w-full px-3 py-1.5 text-left text-[13px] font-semibold text-ink hover:bg-surface-mute">
                  {pinned ? 'Unpin' : 'Pin'}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPref(row, { archived: !archived }) }} className="block w-full px-3 py-1.5 text-left text-[13px] font-semibold text-ink hover:bg-surface-mute">
                  {archived ? 'Unarchive' : 'Archive'}
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
      </div>
    </li>
  )
}
