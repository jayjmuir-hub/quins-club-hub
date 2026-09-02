import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { Empty } from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { attachmentPreviewLabel } from '../data/chatMedia.js'
import { chatPath, listMyStarredMessages } from '../data/messages.js'
import { listMyNicknames } from '../data/nicknames.js'
import { useAuth } from '../lib/auth.jsx'
import { postedLabel } from '../lib/notices.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Starred messages — round 4 (claude/plans/2026-08-24-chat-round-4.md).
// PRIVATE bookmarks: the message_stars table is owner-only by RLS, so this
// list can only ever be the reader's own. A star whose message has gone
// unreadable (left the group, message hard-deleted) simply drops out —
// the data layer reads messages by id under RLS.
//
// /chat/starred, reached from the star on the Chats list header.

export default function StarredMessages() {
  const { user } = useAuth()
  const selfId = user?.id ?? null
  const [rows, setRows] = useState(null)
  const [names, setNames] = useState(() => new Map())
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [starred, nicknames] = await Promise.all([
          listMyStarredMessages(),
          listMyNicknames().catch(() => new Map()),
        ])
        if (!live) return
        setRows(starred)
        setNames(nicknames)
      } catch (err) {
        if (live) setError(friendlyMessage(err, 'Could not load your starred messages.'))
      }
    })()
    return () => {
      live = false
    }
  }, [])

  return (
    <section className="px-1">
      <div className="mb-3 mt-1 flex items-center gap-3">
        <Link to="/chat" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
          ← Chats
        </Link>
        <h2 className="text-[16px] font-extrabold text-ink">Starred</h2>
      </div>

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
      {rows?.length === 0 && <Empty message="Nothing starred yet. Star a message from its ⌄ menu." />}
      {rows?.length > 0 && (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((m) => (
              <li key={m.id} className="border-b border-line last:border-b-0">
                <Link
                  // ⚠️ #msg-<id> LANDS ON THE MESSAGE, NOT THE CHAT (2 Sep 2026 UX
                  // review, desktop keyboard). The thread scrolls to that id
                  // once the messages are in, the way the pinned banner does.
                  to={`${m.conversation_id ? `/chat/dm/${m.conversation_id}` : chatPath({ kind: m.channel === 'staff' ? 'staff' : 'squad', team_id: m.team_id })}#msg-${m.id}`}
                  className="block px-3.5 py-2.5 hover:bg-surface-mute"
                  data-testid="starred-row"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-extrabold text-ink">
                      {m.author_id === selfId ? 'You' : names.get(m.author_id) ?? m.author?.full_name ?? 'Member'}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-ink-faint">{postedLabel(m.created_at)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-muted">
                    {m.deleted_at ? 'Message removed' : m.body?.trim() ? m.body : attachmentPreviewLabel(m.attachment_path, m.attachments?.length)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
