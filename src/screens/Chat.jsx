import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { Empty } from '../components/Empty.jsx'
import MessageRow from '../components/MessageRow.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  getChannelSettings,
  listMessages,
  listMyMessageReads,
  markMessagesRead,
  messageReadStats,
  postMessage,
  removeMessage,
  replyToMessage,
  setAnnounceOnly,
  setPinned,
  subscribeMessages,
} from '../data/messages.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, visibleTeams } from '../lib/scope.js'

// Squad chat, phase 1 — claude/plans/2026-08-23-squad-chat.md.
//
// /chat            → the only squad, or a picker when there is more than one
// /chat/club       → the club-wide channel
// /chat/:teamId    → one squad's channel
//
// ⚠️ ANNOUNCE-ONLY IS THE DEFAULT, AND THE COMPOSER SAYS SO. Staff post;
// families reply inside threads. A squad's staff can switch it off from the
// panel at the top of the stream, and the switch is recorded (who, when).
//
// ⚠️ MARKED READ ON ARRIVAL, POSTS ONLY, LIKE NOTICES. "Read by 18 of 27" is
// the strongest claim this can honestly make: it appeared in front of them.

export const CLUB = 'club'

function Picker({ teams, showClub }) {
  return (
    <section className="px-1">
      <div className="mb-3.5 mt-1">
        <Kicker>Squad chat</Kicker>
        <AccentTitle lead="Pick a" accent="channel." />
      </div>
      <div className="grid gap-2.5">
        {showClub && (
          <Card as={Link} to={`/chat/${CLUB}`} className="px-4 py-3.5 font-extrabold text-ink">
            Whole club
          </Card>
        )}
        {teams.map((team) => (
          <Card key={team.id} as={Link} to={`/chat/${team.id}`} className="px-4 py-3.5 font-extrabold text-ink">
            {team.name}
          </Card>
        ))}
      </div>
    </section>
  )
}

export default function Chat() {
  const { teamId: param } = useParams()
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const selfId = user?.id ?? null

  const myTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const admin = isAdmin(memberships)
  const isClub = param === CLUB
  const teamId = isClub ? null : param ?? null
  const team = teamId ? myTeams.find((t) => t.id === teamId) : null
  const canModerate = isClub ? admin : canEditTeam(memberships, teamId)
  const clubId = memberships?.find((m) => m.club_id)?.club_id ?? team?.club_id ?? null

  const [messages, setMessages] = useState(null)
  const [reads, setReads] = useState(() => new Set())
  const [stats, setStats] = useState(() => new Map())
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    if (!param) return
    setError(null)
    try {
      const [rows, mine, channel] = await Promise.all([
        listMessages(teamId),
        listMyMessageReads(),
        getChannelSettings(teamId),
      ])
      setMessages(rows)
      setReads(mine)
      setSettings(channel)
      // Staff-only, and allowed to fail without breaking the stream.
      if (canModerate && teamId) {
        try {
          setStats(await messageReadStats(teamId))
        } catch {
          setStats(new Map())
        }
      }
    } catch (err) {
      setError(err.message || 'We could not load the chat just now.')
    }
  }, [param, teamId, canModerate])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => (param ? subscribeMessages(load) : undefined), [param, load])

  // Mark posts read on arrival — top-level only.
  useEffect(() => {
    if (!messages || !selfId) return
    const unseen = messages.filter((m) => !m.deleted_at && !reads.has(m.id)).map((m) => m.id)
    if (unseen.length === 0) return
    markMessagesRead(selfId, unseen)
    setReads((prev) => new Set([...prev, ...unseen]))
  }, [messages, selfId, reads])

  // A chat reads downwards: land at the newest.
  useEffect(() => {
    // Optional-called: jsdom (and some old WebViews) have no scrollIntoView.
    if (messages?.length) bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages?.length])

  // ── Routing ─────────────────────────────────────────────────────────────
  if (!param) {
    if (myTeams.length === 1 && !admin) return <Navigate to={`/chat/${myTeams[0].id}`} replace />
    return <Picker teams={myTeams} showClub />
  }
  if (!isClub && myTeams.length > 0 && !team) {
    return <Navigate to="/chat" replace />
  }

  const announceOnly = settings?.announce_only ?? true
  const mayPost = canModerate || (!isClub && !announceOnly)
  const title = isClub ? 'Whole club' : team?.name ?? 'Squad'
  const pinned = (messages ?? []).filter((m) => m.pinned && !m.deleted_at)

  async function send(domEvent) {
    domEvent.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    setSendError(null)
    try {
      await postMessage(teamId, draft)
      setDraft('')
      await load()
    } catch (err) {
      setSendError(err.message || 'Could not send that.')
    } finally {
      setSending(false)
    }
  }

  async function onReply(parentId, body) {
    await replyToMessage(parentId, body)
    await load()
  }
  async function onRemove(id) {
    try {
      await removeMessage(id)
      await load()
    } catch (err) {
      setError(err.message || 'Could not remove that.')
    }
  }
  async function onPin(id, pinnedNow) {
    try {
      await setPinned(id, pinnedNow)
      await load()
    } catch (err) {
      setError(err.message || 'Could not pin that.')
    }
  }
  async function toggleAnnounceOnly() {
    try {
      await setAnnounceOnly(teamId, clubId, selfId, !announceOnly)
      await load()
    } catch (err) {
      setError(err.message || 'Could not change that.')
    }
  }

  return (
    <section className="px-1">
      <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Kicker>Squad chat</Kicker>
          <AccentTitle lead={title} accent="chat." />
        </div>
        {myTeams.length > 1 || admin ? (
          <Link to="/chat" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
            Other channels
          </Link>
        ) : null}
      </div>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {/* ── Staff panel: announce-only ───────────────────────────────── */}
      {canModerate && !isClub && settings && (
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="channel-settings">
          <div>
            <p className="text-[13.5px] font-extrabold text-ink">Announce-only</p>
            <p className="text-[12px] text-ink-muted">
              {announceOnly
                ? 'Staff post; families reply inside threads.'
                : 'Anyone in the squad can post.'}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={toggleAnnounceOnly} aria-pressed={announceOnly}>
            {announceOnly ? 'Turn off' : 'Turn on'}
          </Button>
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
      {messages?.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          selfId={selfId}
          canModerate={canModerate}
          readStat={canModerate ? stats.get(m.id) : undefined}
          unread={!reads.has(m.id)}
          onReply={onReply}
          onRemove={onRemove}
          onPin={onPin}
        />
      ))}
      <div ref={bottomRef} />

      {/* ── Composer ────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-1 mt-3 border-t border-line bg-surface px-1 pb-2 pt-2">
        {mayPost ? (
          <form onSubmit={send} className="flex items-end gap-2" data-testid="composer">
            <label className="sr-only" htmlFor="chat-draft">
              Message
            </label>
            <textarea
              id="chat-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={1}
              maxLength={2000}
              placeholder={`Post to ${title}`}
              className="min-h-[44px] flex-1 resize-none rounded-[12px] border border-line bg-surface-card px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
            />
            <Button type="submit" disabled={sending || !draft.trim()}>
              Post
            </Button>
          </form>
        ) : (
          <p className="px-2 py-2 text-[13px] font-semibold text-ink-muted" data-testid="composer-locked">
            Only staff can post here — reply to a thread instead.
          </p>
        )}
        {sendError && (
          <p role="alert" className="mt-1.5 px-1 text-[12.5px] font-semibold text-danger-ink">
            {sendError}
          </p>
        )}
      </div>
    </section>
  )
}
