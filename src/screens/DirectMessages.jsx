import { Fragment, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import ChatHeader from '../components/ChatHeader.jsx'
import DmThread from '../components/DmThread.jsx'
import { Avatar } from '../components/NewChatPicker.jsx'
import NewGroupPicker from '../components/NewGroupPicker.jsx'
import PersonCard from '../components/PersonCard.jsx'
import PersonName from '../components/PersonName.jsx'
import PresenceDot from '../components/PresenceDot.jsx'
import { dotState } from '../lib/presence.js'
import { listMyNicknames, setNickname } from '../data/nicknames.js'
import IdentityBadges from '../components/IdentityBadges.jsx'
import { blockDm, deleteConversation, leaveGroup, renameGroup, unblockDm } from '../data/messages.js'
import ChatBackgroundPicker from '../components/ChatBackgroundPicker.jsx'
import useDmThread from '../lib/useDmThread.js'

// Direct messages — squad chat phase 3. claude/plans/2026-08-23-squad-chat.md.
//
// /chat/dm/:conversationId  one thread. (/chat/dm, the old inbox, redirects
// to the Chats list since 24 Aug 2026 — the list IS the inbox, and the
// pencil on it is "New message".)
//
// ⚠️ SINCE 26 Aug 2026 THE THREAD ITSELF LIVES ELSEWHERE — state and
// behaviour in src/lib/useDmThread.js, rendering in
// src/components/DmThread.jsx — shared with the floating dock so the two
// can never drift (claude/plans/2026-08-26-shared-chat-thread.md). This
// screen is the CHROME: header, and the conversation-management sheets
// (rename, add people, nickname, block, leave, delete chat, wallpaper
// picking), which stay full-view on purpose.
//
// 24 Aug 2026, Jay: "need to be able to delete messages and entire chats".
// Delete on my own bubble (any time — the author's right) deletes it for
// good; "Delete chat" in the header menu deletes the conversation for BOTH
// (db/migrations/20260824_delete_for_good.sql). Jay: "completely".
//
// ⚠️ WHO MAY MESSAGE WHOM IS NOT DECIDED HERE. dm_candidates() is the list;
// open_conversation() is the door; the trigger re-checks on every message.
// This screen shows what the database allows and nothing else.
//
// ⚠️ NO READ RECEIPTS IN A DM. Between a coach and a squad they are
// information; between two people they are pressure.

const STAFF = new Set(['admin', 'coach', 'manager', 'medic'])

// ── One thread ──────────────────────────────────────────────────────────────

function Thread({ conversationId }) {
  const thread = useDmThread(conversationId)
  const {
    conversation,
    missing,
    other,
    members,
    blocked,
    nicknames,
    setNicknames,
    online,
    setError,
    isGroup,
    participant,
    owner,
    reviewing,
    otherName,
    nameFor,
    selfId,
    reload,
  } = thread

  // The person card: the tapped member-line name's profile id, or null.
  const [cardFor, setCardFor] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [addingPeople, setAddingPeople] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [nicknaming, setNicknaming] = useState(false)
  const [nickDraft, setNickDraft] = useState('')
  const [pickingBackground, setPickingBackground] = useState(false)
  const navigate = useNavigate()

  async function toggleBlock() {
    if (!other?.id) return
    try {
      if (blocked) await unblockDm(other.id)
      else await blockDm(other.id)
      await reload()
    } catch (err) {
      setError(err.message || 'Could not change that.')
    }
  }

  async function deleteChat() {
    try {
      await deleteConversation(conversationId)
      navigate('/chat')
    } catch (err) {
      setError(err.message || 'Could not delete this chat.')
      setDeleting(false)
    }
  }

  async function submitRename(domEvent) {
    domEvent.preventDefault()
    if (!newTitle.trim()) return
    try {
      await renameGroup(conversationId, newTitle.trim())
      setRenaming(false)
      await reload()
    } catch (err) {
      setError(err.message || 'Could not rename the group.')
    }
  }

  async function leaveNow() {
    try {
      await leaveGroup(conversationId)
      navigate('/chat')
    } catch (err) {
      setError(err.message || 'Could not leave the group.')
      setLeaving(false)
    }
  }

  async function submitNickname(domEvent) {
    domEvent.preventDefault()
    try {
      // Empty = clear: their real name comes back everywhere.
      await setNickname(thread.selfId, other.id, nickDraft)
      setNicknaming(false)
      setNicknames(await listMyNicknames())
    } catch (err) {
      setError(err.message || 'Could not save the nickname.')
    }
  }

  function pickBackground(key) {
    thread.pickBackground(key)
    setPickingBackground(false)
  }

  // The WhatsApp header line: first names, "You" for the reader. Each name is
  // a PersonName door to the contact card (claude/plans/2026-08-26-person-card.md);
  // "You" stays plain text via its self branch. Carried across from #434 when
  // the thread moved into useDmThread — the JSX needs this screen's cardFor,
  // so the line is derived HERE from the hook's members and nameFor.
  const memberLine = isGroup && members?.length
    ? members.map((p, index) => (
        <Fragment key={p.profile_id}>
          {index > 0 && ', '}
          <PersonName profileId={p.profile_id} selfId={selfId} onOpen={setCardFor}>
            {p.profile_id === selfId ? 'You' : nameFor(p.profile_id, p.full_name).split(' ')[0] || 'Member'}
          </PersonName>
        </Fragment>
      ))
    : null

  if (missing) {
    return (
      <section className="px-1">
        <div className="mb-3 mt-1 flex items-center gap-3">
          <Link to="/chat" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
            ← Chats
          </Link>
        </div>
        <Card className="p-6 text-center" data-testid="dm-missing">
          <p className="text-[14px] font-semibold text-ink">This conversation isn’t available to you.</p>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            A conversation between two adults is private to them unless a message in it is reported.
          </p>
        </Card>
      </section>
    )
  }

  // A group's menu is about the GROUP; a DM's is about the other person.
  // No Block in a group (block whom?), and only the owner reshapes it.
  const actions = isGroup
    ? participant
      ? [
          ...(owner
            ? [
                {
                  label: 'Rename group',
                  onClick: () => {
                    setNewTitle(conversation?.title ?? '')
                    setRenaming(true)
                  },
                },
                { label: 'Add people', onClick: () => setAddingPeople(true) },
              ]
            : []),
          { label: 'Chat background', onClick: () => setPickingBackground(true) },
          { label: 'Leave group', onClick: () => setLeaving(true) },
          ...(owner ? [{ label: 'Delete group', onClick: () => setDeleting(true), danger: true }] : []),
        ]
      : []
    : participant && other?.id
      ? [
          {
            label: `Nickname for ${otherName}`,
            onClick: () => {
              setNickDraft(nicknames.get(other.id) ?? '')
              setNicknaming(true)
            },
          },
          { label: 'Chat background', onClick: () => setPickingBackground(true) },
          { label: blocked ? `Unblock ${otherName}` : `Block ${otherName}`, onClick: toggleBlock },
          { label: 'Delete chat', onClick: () => setDeleting(true), danger: true },
        ]
      : []

  return (
    <section className="flex flex-1 flex-col px-1">
      {/* ⚠️ STICKY, AND THE IDENTITY RIDES INSIDE IT (26 Aug 2026, Jay: the
          badges "scroll off the screen in longer chats… they should always
          be visible"). The mirror of the composer's sticky bottom-0: name
          and badges hold the top while the stream scrolls between them.
          Every hat renders — claude/plans/2026-08-26-dm-identity-rows.md
          replaced the single best-role pill the same day it shipped. */}
      <div data-testid="dm-header" className="sticky top-0 z-20 -mx-1 bg-surface px-1">
        <ChatHeader
          avatar={
            // In a 1:1 the avatar carries the presence dot — the at-a-glance
            // replacement for the subtitle's retired 'Online' word. A group
            // is not a person and gets no dot.
            isGroup ? (
              <Avatar name={conversation?.title} staff={false} size="sm" />
            ) : (
              <span className="relative shrink-0">
                <Avatar name={otherName} staff={STAFF.has(other?.role)} size="sm" />
                <PresenceDot state={dotState(online, other?.id)} />
              </span>
            )
          }
          title={(isGroup ? conversation?.title : otherName) ?? '…'}
          subtitle={
            reviewing
              ? 'Reviewing as a club admin'
              : isGroup
                ? // Round 3: "at the top it previews who is in the chat under
                  // the name of the chat" — first names, You for the reader.
                  (memberLine ?? `${members?.length ?? '…'} people`)
                : // The subtitle's 'Online' word retired 26 Aug 2026 — the
                  // avatar's presence dot says it at a glance instead
                  // (claude/plans/2026-08-26-last-active-and-presence-dots.md).
                  `Private · you and ${otherName ?? 'them'}`
          }
          actions={actions}
        />
        {!isGroup && <IdentityBadges profileId={other?.id} className="-mt-1 px-1 pb-2" />}
      </div>

      {renaming && (
        <form onSubmit={submitRename} className="mb-3 rounded-card bg-surface-card p-3 shadow-card" data-testid="rename-form">
          <label htmlFor="group-title" className="text-[12.5px] font-extrabold text-ink">
            Group name
          </label>
          <input
            id="group-title"
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={80}
            autoFocus
            className="mt-1.5 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={!newTitle.trim()}>
              Save
            </Button>
          </div>
        </form>
      )}

      {nicknaming && (
        <form onSubmit={submitNickname} className="mb-3 rounded-card bg-surface-card p-3 shadow-card" data-testid="nickname-form">
          <label htmlFor="nickname" className="text-[12.5px] font-extrabold text-ink">
            Your nickname for {other?.name}
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">Only you see it. Leave empty to go back to their real name.</p>
          <input
            id="nickname"
            type="text"
            value={nickDraft}
            onChange={(e) => setNickDraft(e.target.value)}
            maxLength={40}
            autoFocus
            className="mt-1.5 w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNicknaming(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit">
              Save
            </Button>
          </div>
        </form>
      )}

      <ChatBackgroundPicker open={pickingBackground} onClose={() => setPickingBackground(false)} current={thread.background} onPick={pickBackground} />

      {addingPeople && (
        <NewGroupPicker
          mode="add"
          conversationId={conversationId}
          onCreated={() => {
            setAddingPeople(false)
            reload()
          }}
          onClose={() => setAddingPeople(false)}
        />
      )}

      {leaving && (
        <Card className="mb-3 px-4 py-3" data-testid="leave-group-confirm">
          <p className="text-[13.5px] font-extrabold text-ink">Leave this group?</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {(members?.length ?? 0) <= 3
              ? 'You’re one of three — leaving closes this group for everyone.'
              : 'You’ll stop seeing its messages. The group carries on without you.'}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={leaveNow}>
              Leave group
            </Button>
          </div>
        </Card>
      )}

      {deleting && (
        <Card className="mb-3 px-4 py-3" data-testid="delete-chat-confirm">
          <p className="text-[13.5px] font-extrabold text-ink">{isGroup ? 'Delete this group?' : 'Delete this chat?'}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">
            {isGroup
              ? 'Every message in it is deleted for everyone. This cannot be undone.'
              : 'Every message in it is deleted for both of you. This cannot be undone.'}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={deleteChat}>
              {isGroup ? 'Delete group' : 'Delete chat'}
            </Button>
          </div>
        </Card>
      )}

      <DmThread thread={thread} />

      <PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />
    </section>
  )
}

export default function DirectMessages() {
  const { conversationId } = useParams()
  return conversationId ? <Thread conversationId={conversationId} /> : <Navigate to="/chat" replace />
}
