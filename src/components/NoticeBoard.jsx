import { Link } from 'react-router-dom'
import Card from './Card.jsx'
import { audienceLabel, authorLine, pinnedNotices } from '../lib/notices.js'

// The pinned notices, on the Home screen.
//
// ⚠️ IT RENDERS NOTHING WHEN NOTHING IS PINNED, which is the OPPOSITE of
// SquadStaffCard's ruling — and the difference is worth stating because the two
// sit on the same screen. That card always draws, because a parent attached to a
// squad should see that squad named whether or not anyone has been added to it:
// its emptiness is a fact about the club's data. A noticeboard's emptiness is
// just nobody having posted, which is the normal state most weeks, and a
// permanent "No notices" box at the top of the dashboard would be a piece of
// furniture everyone learns to look past.
//
// ⚠️ PINNED ONLY. The full list is /notices. Home is the screen every role opens
// to answer "what is on this week" — the fixture hero is the point of it, and a
// board that grows without limit would push that below the fold.

function NoticeItem({ notice, teamsById, unread }) {
  const author = authorLine(notice)

  return (
    <li className="border-t border-line px-4 py-3 first:border-t-0" data-testid="home-notice">
      <div className="flex items-start gap-2.5">
        {/* ⚠️ SHAPE AS WELL AS COLOUR — the dot is paired with the word "New"
            for screen readers below, never colour alone. Same rule the pitch
            calendar's clash markers carry (claude/specs/accessibility.md). */}
        {unread && (
          <span
            aria-hidden="true"
            className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-brand"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-bold text-ink">{notice.title}</span>
            {unread && <span className="sr-only">New</span>}
            <span className="text-[12px] font-semibold text-ink-muted">
              {audienceLabel(notice, teamsById)}
            </span>
          </div>

          {/* ⚠️ `whitespace-pre-line` — a notice is free text somebody typed
              into a textarea, and a coach who put the meeting point on its own
              line meant it to be on its own line. */}
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-muted">
            {notice.body}
          </p>

          {author && (
            <p className="mt-1.5 text-[12px] font-semibold text-ink-faint">{author}</p>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * @param notices  every notice the person may see (expired ones included —
 *                 pinnedNotices filters them, see src/lib/notices.js)
 * @param readIds  Set of announcement ids this person has read
 * @param teamsById Map of team id -> team, for the scope label
 */
export default function NoticeBoard({ notices, readIds, teamsById, now = Date.now() }) {
  const pinned = pinnedNotices(notices, now)
  if (pinned.length === 0) return null

  return (
    <Card className="mb-3" data-testid="notice-board">
      <ul>
        {pinned.map((notice) => (
          <NoticeItem
            key={notice.id}
            notice={notice}
            teamsById={teamsById}
            unread={!readIds?.has(notice.id)}
          />
        ))}
      </ul>

      {/* ⚠️ ALWAYS OFFERED, EVEN WHEN EVERYTHING IS ALREADY ON SCREEN. A pinned
          notice is a subset of the board by definition, and the only way to
          reach an unpinned one is this link — so hiding it when
          `pinned.length < 3` would strand every ordinary notice behind a
          condition nobody could discover. */}
      <div className="border-t border-line px-4 py-2.5">
        <Link
          to="/notices"
          className="text-[13px] font-bold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          All notices
        </Link>
      </div>
    </Card>
  )
}
