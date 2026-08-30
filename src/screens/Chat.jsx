import { useEffect, useState } from 'react'
import { friendlyMessage } from '../lib/friendlyError.js'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ChannelMembersSheet from '../components/ChannelMembersSheet.jsx'
import ChannelThread from '../components/ChannelThread.jsx'
import ChatHeader from '../components/ChatHeader.jsx'
import ChatBackgroundPicker from '../components/ChatBackgroundPicker.jsx'
import { clearChannel } from '../data/messages.js'
import { ROLE_CHANNELS } from '../lib/roleChannels.js'
import useChannelThread, { tallyByEvent as tallyByEventImpl } from '../lib/useChannelThread.js'
import { shortBand } from './ChatList.jsx'

// One channel's thread — claude/plans/2026-08-23-squad-chat.md, reshaped
// 24 Aug 2026 (claude/plans/2026-08-24-chat-list.md): bubbles, a header bar
// that says who reads this, and NO picker or tabs — the Chats list
// (src/screens/ChatList.jsx) is the only way in, and `Chat` in the nav
// always lands on the list.
//
// /chat                    → ChatList, not this screen
// /chat/club               → the club-wide channel
// /chat/:teamId            → one squad's channel
// /chat/:teamId?channel=staff → its staff channel (its own row in the list)
//
// ⚠️ SINCE 26 Aug 2026 THE CHANNEL ITSELF LIVES ELSEWHERE — state and
// behaviour in src/lib/useChannelThread.js, rendering in
// src/components/ChannelThread.jsx — shared with the floating dock so the
// two can never drift (claude/plans/2026-08-26-shared-chat-thread.md,
// phase 3; the same split DirectMessages.jsx got in phase 1). This screen
// is the CHROME: header, the ?thread=/?event= deep links, and channel
// management (announce-only, clear chat, wallpaper picking), which stays
// full-view on purpose.
//
// ⚠️ ANNOUNCE-ONLY IS THE DEFAULT, AND THE COMPOSER SAYS SO. Staff post;
// families reply inside threads. A squad's staff can switch it off from the
// panel at the top of the stream, and the switch is recorded (who, when).
//
// ⚠️ MARKED READ ON ARRIVAL, POSTS ONLY, LIKE NOTICES. "Read by 18 of 27" is
// the strongest claim this can honestly make: it appeared in front of them.
//
// Phase 2 (23 Aug 2026): a post can hang off a fixture (one open thread per
// fixture; anyone in the squad may open it, even under announce-only) and
// carries the fixture's RSVP chips. @mentions push the mentioned.
//   ?thread=<id>   open that thread on arrival
//   ?event=<id>    open the fixture's thread, or prefill the composer to
//                  start one — the event screen's "Squad chat" block

export const CLUB = 'club'

// Re-exported from the hook so existing importers keep one home for it.
export const tallyByEvent = tallyByEventImpl

export default function Chat() {
  const { teamId: param } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const wantStaff = searchParams.get('channel') === 'staff'
  const thread = useChannelThread({ param, wantStaff })
  const {
    isClub,
    roleKey,
    team,
    admin,
    canModerate,
    staffChannel,
    unknownTeam,
    messages,
    settings,
    announceOnly,
    mentionables,
    setError,
    toggleAnnounceOnly,
    reload,
  } = thread

  const [clearing, setClearing] = useState(false)
  const [pickingBackground, setPickingBackground] = useState(false)
  const [showingMembers, setShowingMembers] = useState(false)
  const threadParam = searchParams.get('thread')
  const eventParam = searchParams.get('event')

  // ?event= — the event screen sent us here. If the fixture already has a
  // thread, open it; otherwise preselect it in the composer. Consumed once.
  useEffect(() => {
    if (!eventParam || !messages) return
    const existing = messages.find((m) => m.event_id === eventParam && !m.deleted_at)
    if (existing) {
      setSearchParams({ thread: existing.id }, { replace: true })
    } else {
      thread.setAttachEventId(eventParam)
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventParam, messages, setSearchParams])

  // ── Routing ─────────────────────────────────────────────────────────────
  if (!param || unknownTeam) {
    return <Navigate to="/chat" replace />
  }

  const roleChannel = roleKey ? ROLE_CHANNELS[roleKey] : null
  const title = roleChannel ? roleChannel.label : isClub ? 'Whole club' : team?.name ?? 'Squad'
  // Role channels AND staff channels wear their MEMBERS as the subtitle,
  // WhatsApp-style — "You, Aran, Bruno…" — because a small circle's whole
  // identity is who is in it (Jay, 30 Aug 2026: "they don't appear under the
  // channel name"). First names, self first as "You"; the header truncates
  // the overflow, and tapping it opens the full sheet. The squad channel
  // keeps its count — forty first names is noise, not information — and the
  // club channel keeps its wording (its member sheet is admin-only).
  const memberPreview =
    roleChannel || staffChannel
      ? [
          // channel_members (role) includes the caller; chat_mentionables
          // (staff) deliberately excludes them — a picker never offers you
          // yourself. Either way the reader IS in the room they are reading.
          'You',
          ...mentionables
            .filter((m) => m.profile_id !== thread.selfId)
            .map((m) => (m.full_name ?? '').split(/\s+/)[0])
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b)),
        ].join(', ')
      : ''
  const subtitle = roleChannel
    ? memberPreview || 'By role — tap for members'
    : isClub
      ? 'Club-wide · admins post'
      : staffChannel
        ? memberPreview || 'Staff only · coaches, managers and medics'
        : `${mentionables.length > 0 ? `${mentionables.length} members · ` : ''}${announceOnly ? 'announce-only' : 'open chat'}`

  // The member sheet: role channels for every member; a squad or staff channel
  // for anyone reading it; the club channel for admins only (channel_members
  // enforces that server-side — names are squad-scoped for everyone else).
  const canSeeMembers = Boolean(roleKey) || Boolean(team) || (isClub && admin)
  const membersChannel = roleKey ?? (isClub ? 'club' : staffChannel ? 'staff' : 'squad')

  function pickBackground(key) {
    thread.pickBackground(key)
    setPickingBackground(false)
  }

  const headerActions = [
    // The WhatsApp gesture: see who reads this, and why (role channels carry
    // the reason each person is in). Tap a member to start a DM.
    ...(canSeeMembers ? [{ label: 'View members', onClick: () => setShowingMembers(true) }] : []),
    { label: 'Chat background', onClick: () => setPickingBackground(true) },
    ...(canModerate && !isClub && !roleKey && !staffChannel && settings
      ? [{ label: announceOnly ? 'Turn announce-only off' : 'Turn announce-only on', onClick: toggleAnnounceOnly }]
      : []),
    // Staff only. Deletes every post in THIS channel for good; the channel
    // stays — it is the squad. Reported posts stay (evidence). Not offered on
    // role channels in v1 — clear_channel is squad/club plumbing.
    ...(canModerate && !roleKey ? [{ label: 'Clear chat', onClick: () => setClearing(true), danger: true }] : []),
  ]

  async function clearChat() {
    try {
      await clearChannel(isClub ? null : thread.teamId, staffChannel ? 'staff' : 'squad')
      setClearing(false)
      await reload()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not clear this chat.'))
      setClearing(false)
    }
  }

  return (
    <section className="flex flex-1 flex-col px-1">
      <ChatHeader
        avatar={
          <span
            aria-hidden="true"
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${
              isClub ? 'bg-surface-mute text-ink' : 'bg-brand text-ink-invert'
            }`}
          >
            {roleChannel ? roleChannel.glyph : isClub ? '🏉' : staffChannel ? '🛡' : shortBand(title)}
          </span>
        }
        title={staffChannel ? `${title} · staff` : title}
        subtitle={subtitle}
        actions={headerActions}
        // The WhatsApp gesture (Jay, 30 Aug): tap the name block, see the
        // members. Same sheet the ⋯ menu offers; two doors, one room.
        onInfoClick={canSeeMembers ? () => setShowingMembers(true) : undefined}
      />

      {clearing && (
        <Card className="mb-3 px-4 py-3" data-testid="clear-chat-confirm">
          <p className="text-[13.5px] font-extrabold text-ink">Clear this chat?</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            Every message here is deleted for everyone. Reported messages stay until the club resolves them. This cannot be undone.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setClearing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={clearChat}>
              Clear chat
            </Button>
          </div>
        </Card>
      )}

      <ChatBackgroundPicker open={pickingBackground} onClose={() => setPickingBackground(false)} current={thread.background} onPick={pickBackground} />

      <ChannelMembersSheet
        open={showingMembers}
        onClose={() => setShowingMembers(false)}
        channel={membersChannel}
        teamId={thread.teamId}
        selfId={thread.selfId}
        onOpenDm={thread.openDmWith}
      />

      {/* Announce-only lives in the header's ⋯ menu since 24 Aug 2026; this
          line keeps the state visible to staff (data-testid kept for the tests). */}
      {canModerate && !isClub && !staffChannel && settings && (
        <p className="mb-2 px-1 text-[12px] text-ink-muted" data-testid="channel-settings">
          {announceOnly ? 'Announce-only: staff post; families reply inside threads.' : 'Open chat: anyone in the squad can post.'}
          <Button size="sm" variant="ghost" onClick={toggleAnnounceOnly} aria-pressed={announceOnly} className="ml-2">
            {announceOnly ? 'Turn off' : 'Turn on'}
          </Button>
        </p>
      )}

      <ChannelThread thread={thread} openThreadId={threadParam} />
    </section>
  )
}
