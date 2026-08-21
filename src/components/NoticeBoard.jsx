import { Link } from 'react-router-dom'
import NoticeRow from './NoticeRow.jsx'
import { pinnedNotices } from '../lib/notices.js'

// The pinned notices, on the Home screen.
//
// ⚠️ IT DRAWS THE SAME CARD AS /notices, AND THAT IS THE WHOLE POINT OF THIS
// FILE NOW. Until 16 Aug 2026 it had its own `NoticeItem` — a terser rendering,
// deliberately, on the theory that Home is a pointer to the board rather than
// the board. The moment the board's card was redesigned, the theory produced the
// obvious result: Jay posted one notice and saw it two ways. *"the notice on the
// home page when posted still looks bland, it doesn't look like how the same
// notice looks in the notice section"*.
//
// ⚠️ SO THE TERSER VERSION IS GONE RATHER THAN UPDATED TO MATCH. Updating it
// would have restored the resemblance and kept the mechanism — two renderings of
// one thing, drifting apart again at the next change. This app has already paid
// that bill twice today, on the match sheet's paper-versus-preview split. One
// component, one appearance, by construction.
//
// ⚠️ NO RECEIPTS AND NO DELETE HERE, and that falls out of the props rather than
// out of a flag: NoticeRow renders its footer only when given `stat` or
// `onDelete`, and Home passes neither. Managing a notice is what /notices is
// for; Home is where you read one.
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
    <div className="mb-3" data-testid="notice-board">
      {pinned.map((notice) => (
        <NoticeRow
          key={notice.id}
          notice={notice}
          teamsById={teamsById}
          unread={!readIds?.has(notice.id)}
          // ⚠️ ALWAYS false, AND IT IS NOT AN ASSUMPTION. `pinnedNotices` has
          // dropped the expired ones before this line — pinning is about
          // PROMINENCE, never about exemption, and its own test says so.
          expired={false}
        />
      ))}

      {/* ⚠️ ALWAYS OFFERED, EVEN WHEN EVERYTHING IS ALREADY ON SCREEN. A pinned
          notice is a subset of the board by definition, and the only way to
          reach an unpinned one is this link — so hiding it when
          `pinned.length < 3` would strand every ordinary notice behind a
          condition nobody could discover. */}
      <Link
        to="/notices"
        className="inline-block px-1 text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        All notices
      </Link>
    </div>
  )
}
