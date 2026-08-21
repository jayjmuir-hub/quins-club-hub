import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { Empty } from '../components/Empty.jsx'
import NoticeComposer from '../components/NoticeComposer.jsx'
import NoticeRow from '../components/NoticeRow.jsx'
import Spinner from '../components/Spinner.jsx'
import { Sheet } from '../components/Sheet.jsx'
import {
  deleteNotice,
  listMyReads,
  listNotices,
  markNoticesRead,
  noticeAudience,
  noticeStats,
  subscribeNotices,
} from '../data/announcements.js'
import { useAuth } from '../lib/auth.jsx'
import { formatTableDate, formatTime } from '../lib/eventFormat.js'
import { useMemberships } from '../lib/memberships.jsx'
import {
  canPostNotice,
  collapseGroups,
  currentNotices,
  scopeNotices,
  isExpired,
  noticeRowIds,
  postableTeams,
} from '../lib/notices.js'
import { visibleTeams } from '../lib/scope.js'

// The noticeboard — /notices. Phase 1 of claude/plans/2026-08-14-notices.md.
//
// ⚠️ THIS SCREEN IS DELIBERATELY NOT UNDER /admin, and it is the same reason
// that put /approvals and /match-sheet/:eventId outside it: AdminDashboard gates
// on isAdmin() before rendering its <Outlet/>, and THE PEOPLE WHO POST SQUAD
// NOTICES ARE COACHES AND TEAM MANAGERS. Nesting this under /admin would show
// every coach "not authorised" on the one screen written for them.
//
// ⚠️ ONE SCREEN, NOT TWO. Reading and posting are the same list — like Accounts,
// which self-gates rather than having a second copy of the approvals queue that
// could drift. The composer appears for whoever may post; the receipts open on
// a notice whose numbers the caller is allowed to see. Everything else is the
// same board every member reads.
//
// ⚠️ EVERY GATE HERE IS COSMETIC. `announcement create`, `announcement edit`,
// `announcement remove` and the two SECURITY DEFINER functions are the
// enforcement. This file decides what to OFFER, so that nobody writes three
// paragraphs and is then refused.

const ALL = 'all'





/* ══════════════════════════════════════════════════════════════════════════
   Read receipts
   ══════════════════════════════════════════════════════════════════════════ */

function Receipts({ notice, onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    if (!notice) return undefined
    setRows(null)
    setError(null)
    noticeAudience(notice.id)
      .then((data) => {
        if (mounted) setRows(data)
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Could not load who has seen this.')
      })
    return () => {
      mounted = false
    }
  }, [notice])

  const unread = (rows ?? []).filter((row) => !row.read_at)
  // ⚠️ BOTH HALVES ARE DRAWN, AND FOR A WHILE ONLY ONE WAS. The sheet shipped
  // on 14 Aug 2026 showing "1 of 6 seen" over a list of the five who had NOT —
  // with no way to find out who the one was. `announcement_audience` had
  // returned `read_at` for every member the whole time; the seen half was
  // counted and never rendered. Found by Jay on the first real notice posted.
  //
  // ⚠️ THE CHASE LIST STAYS FIRST. It is the half a coach acts on: the seen
  // list answers "did it land?", the unseen list answers "who do I ring?".
  const seen = (rows ?? [])
    .filter((row) => row.read_at)
    .sort((a, b) => new Date(a.read_at) - new Date(b.read_at))

  return (
    <Sheet open={Boolean(notice)} onClose={onClose} title={notice?.title ?? 'Seen by'}>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}

      {!rows && !error && <Spinner />}

      {rows && (
        <>
          <p className="text-[15px] font-bold text-ink">
            {rows.length - unread.length} of {rows.length} seen
          </p>

          {/* ⚠️ SAID OUT LOUD, BECAUSE THE NUMBER IS WEAKER THAN IT LOOKS. A
              read is recorded when the notice was drawn on somebody's screen,
              which is not the same as their having read it — and a coach acting
              on "18 of 24" deserves to know that. This sentence is the whole
              honesty of the feature; do not delete it as clutter. */}
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            Counted when the notice appeared on someone&apos;s screen. That isn&apos;t proof
            they read it.
          </p>

          {unread.length === 0 ? (
            <p className="mt-3.5 text-[13px] text-ink-muted">Everyone has seen this.</p>
          ) : (
            <>
              <h4 className="mb-2 mt-4 text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Not seen yet — {unread.length}
              </h4>
              <ul className="rounded-[11px] border border-line">
                {unread.map((row) => (
                  <li
                    key={row.profile_id}
                    data-testid="receipt-unread"
                    className="border-t border-line px-3 py-2 text-[14px] text-ink first:border-t-0"
                  >
                    {/* A member who has never set a name is a real state — the
                        profiles row is created by a trigger with an empty
                        full_name. Showing a blank row would read as a bug. */}
                    {row.full_name?.trim() || 'Name not set'}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="mb-2 mt-4 text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
            Seen — {seen.length}
          </h4>
          {seen.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No one has seen this yet.</p>
          ) : (
            <ul className="rounded-[11px] border border-line">
              {seen.map((row) => (
                <li
                  key={row.profile_id}
                  data-testid="receipt-seen"
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-line px-3 py-2 first:border-t-0"
                >
                  <span className="text-[14px] text-ink">
                    {row.full_name?.trim() || 'Name not set'}
                  </span>
                  {/* ⚠️ THE TIME IS THE POINT, NOT DECORATION. "Did they see it
                      before training?" is the actual question behind a read
                      receipt, and a bare name cannot answer it. Rendered in the
                      CLUB's zone like every other time in this app — a coach in
                      Dubai reading "07:15" must not be seeing UTC. */}
                  <span className="text-[12.5px] tabular-nums text-ink-muted">
                    {formatTableDate(new Date(row.read_at))} · {formatTime(new Date(row.read_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   The screen
   ══════════════════════════════════════════════════════════════════════════ */

export default function Notices() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()

  const [allNotices, setNotices] = useState(null)
  // ⚠️ SCOPED AT RENDER, NOT IN THE FETCH. "View as" is a browser filter over
  // an admin's session, which the server rightly hands every notice; this
  // narrows them to the effective memberships, as every other block does
  // through visibleTeams(). A real member's rows are unchanged. It is NOT in
  // the fetch effect's deps — memberships is rebuilt per render in preview,
  // and a first cut that refetched on it looped forever (21 Aug 2026).
  const notices = useMemo(
    () => (allNotices ? scopeNotices(allNotices, memberships, teams) : allNotices),
    [allNotices, memberships, teams],
  )
  const [readIds, setReadIds] = useState(() => new Set())
  const [stats, setStats] = useState(() => new Map())
  const [error, setError] = useState(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [receiptsFor, setReceiptsFor] = useState(null)
  const [filter, setFilter] = useState(ALL)

  const myTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamsById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams])
  const composerTeams = useMemo(
    () => postableTeams(memberships, teams),
    [memberships, teams],
  )
  const mayPost = canPostNotice(memberships)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [rows, reads] = await Promise.all([listNotices(), listMyReads()])
      // ⚠️ COLLAPSED HERE AND NOT IN listNotices(). That function also feeds
      // the receipts sheet, which counts reads per ROW and would be wrong if it
      // were handed one entry standing for three.
      setNotices(collapseGroups(rows))
      setReadIds(reads)

      // ⚠️ THE STATS CALL IS ALLOWED TO FAIL WITHOUT BREAKING THE BOARD. It is
      // the only request on this screen an ordinary member has no use for, and
      // a noticeboard that refuses to render because a coach's counter is
      // unavailable would be the tail wagging the dog.
      try {
        setStats(await noticeStats())
      } catch {
        setStats(new Map())
      }
    } catch (err) {
      setError(err.message || 'We could not load the notices just now.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ⚠️ THE BOARD ITSELF ALSO NEEDED THIS, not just Home. Somebody sitting on
  // /notices while a coach posts one would have watched an unchanged screen —
  // and this is the screen where a person came specifically to read them, so
  // silence here is the more misleading of the two.
  useEffect(() => subscribeNotices(load), [load])

  // ⚠️ MARKED READ ON ARRIVAL, AND ONLY THE ONES ON SCREEN. This is what makes
  // the count mean "it appeared in front of them" — which is the strongest claim
  // this feature can honestly make, and the Receipts sheet says so in words.
  //
  // ⚠️ EXPIRED NOTICES ARE NOT MARKED. They are not rendered to a member, so
  // recording them as seen would be a lie told to a coach's counter.
  useEffect(() => {
    if (!notices || !user?.id) return
    // ⚠️ EVERY ROW BEHIND THE CARD, NOT JUST THE ONE IT IS KEYED ON. A notice
    // sent to three squads is three rows; marking only the first read leaves
    // the unread dot coming back on the next load.
    const unseen = currentNotices(notices)
      .filter((notice) => !readIds.has(notice.id))
      .flatMap((notice) => noticeRowIds(notice))
    if (unseen.length === 0) return

    markNoticesRead(user.id, unseen)
    // Optimistic: the dot clears immediately rather than on the next load.
    // markNoticesRead never throws (see its header), so there is no failure
    // path that would leave this out of step with the database in a way the
    // person could act on.
    setReadIds((previous) => {
      const next = new Set(previous)
      for (const id of unseen) next.add(id)
      return next
    })
  }, [notices, readIds, user])

  const shown = useMemo(() => {
    if (!notices) return []
    // ⚠️ AN AUTHOR OR ADMIN SEES EXPIRED NOTICES; A MEMBER DOES NOT. The row is
    // readable to both (the policy keeps it so deliberately), and the person who
    // posted it needs to find it again to read its receipts. `stats` is exactly
    // the set the database will give numbers for, so it is the right test —
    // rather than a second client-side copy of "am I an admin".
    const list = notices.filter((notice) => !isExpired(notice) || stats.has(notice.id))
    if (filter === ALL) return list
    return list.filter((notice) => notice.team_id === filter)
  }, [notices, stats, filter])

  async function handleDelete(notice) {
    try {
      await deleteNotice(notice.id)
      await load()
    } catch (err) {
      setError(err.message || 'That notice could not be removed.')
    }
  }

  return (
    <section>
      {/* ⚠️ `flex-wrap` IS LOAD-BEARING — tests/page-header-wrap.test.js. The
          action group is shrink-0, so without it a long title plus the button
          pushes the whole DOCUMENT wider than the phone, which shows up as a
          clipped masthead and a cut-off sheet three screens away. */}
      <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Kicker>Club notices</Kicker>
          <AccentTitle lead="From the" accent="committee." />
        </div>
        {mayPost && (
          <Button data-testid="post-notice" onClick={() => setComposerOpen(true)}>
            Post a notice
          </Button>
        )}
      </div>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {/* ⚠️ HIDDEN BELOW TWO SQUADS, the same rule Schedule and Roster follow —
          a single pill that cannot change anything is furniture. */}
      {myTeams.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilter(ALL)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
              filter === ALL
                ? 'border-ink bg-ink text-surface-card'
                : 'border-line bg-surface-card text-ink-muted'
            }`}
          >
            All
          </button>
          {myTeams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => setFilter(team.id)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
                filter === team.id
                  ? 'border-ink bg-ink text-surface-card'
                  : 'border-line bg-surface-card text-ink-muted'
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {!notices && !error && <Spinner />}

      {notices && shown.length === 0 && (
        <Empty
          message={
            mayPost
              ? 'Nothing on the board. Post a notice and everyone in the squad will see it next time they open the app.'
              : 'Nothing on the board. When a coach or the club posts something, it will show up here.'
          }
        />
      )}

      {shown.map((notice) => (
        <NoticeRow
          key={notice.id}
          notice={notice}
          teamsById={teamsById}
          unread={!readIds.has(notice.id)}
          expired={isExpired(notice)}
          stat={stats.get(notice.id)}
          onOpenReceipts={setReceiptsFor}
          // ⚠️ OFFERED ONLY WHERE THE DATABASE WOULD ALLOW IT. `stats` holds
          // exactly the notices the caller authored plus, for an admin, the
          // club's — which is the same set "announcement remove" permits. A
          // button that draws itself and is then refused is the defect this
          // repo has already shipped once, on the availability control.
          onDelete={stats.has(notice.id) ? handleDelete : null}
        />
      ))}

      {mayPost && (
        <NoticeComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          teams={composerTeams}
          clubWide={(memberships ?? []).some((m) => m.role === 'admin' && m.status === 'active')}
          onPosted={load}
        />
      )}

      <Receipts notice={receiptsFor} onClose={() => setReceiptsFor(null)} />
    </section>
  )
}
