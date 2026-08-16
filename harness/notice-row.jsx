// The noticeboard card, in a real browser.
//
// ⚠️ THIS SCENARIO EXISTS BECAUSE THE /notices SCREEN HAS NEVER HAD ONE. It
// reads three tables, so it was never harnessed — the `notices` scenario in
// main.jsx covers the HOME card (NoticeBoard) and its own comment says the
// screen is not represented here. A card nobody can look at without a database
// session gets reviewed by reading its JSX, and on 16 Aug 2026 Jay looked at the
// real thing and said "i don't like how the notice looks, too bland".
//
// src/components/NoticeRow.jsx was extracted the same day so this is possible at
// all. Pure props in, no data layer.
//
// ⚠️ THE THREE ROWS ARE THE THREE STATES THAT LOOK DIFFERENT, not a gallery:
// a pinned club-wide notice (red), an ordinary squad one (green), and an expired
// one (grey, and it must NOT still be shouting). The long body is the
// measurement — a notice is free text and the card has to hold a paragraph.
import NoticeRow from '../src/components/NoticeRow.jsx'

// Invented names and squads, as everything published from this repo must be.
const TEAMS = new Map([
  ['t2', { id: 't2', name: 'U14B Contact' }],
  ['t3', { id: 't3', name: 'U16 Girls' }],
])

const HOURS = 3600 * 1000
const ago = (ms) => new Date(Date.parse('2026-08-16T12:00:00Z') - ms).toISOString()

const ROWS = [
  {
    notice: {
      id: 'n1',
      team_id: null,
      pinned: true,
      title: 'Kit collection moved to Saturday',
      body: 'The container will be open from 9am by pitch 3. Bring last season’s shirt if you still have it — we are short on mediums, and anything that still fits a younger sibling is worth passing down rather than replacing.',
      created_at: ago(2 * HOURS),
      author: { full_name: 'Rory Ellingham', title: 'Club Secretary' },
    },
    unread: true,
    expired: false,
    stat: { seen_count: 41, audience_count: 168 },
  },
  {
    notice: {
      id: 'n2',
      team_id: 't2',
      pinned: false,
      title: 'No training this Tuesday',
      body: 'Pitch is being re-laid. Back to normal the following week, same time.',
      created_at: ago(26 * HOURS),
      author: { full_name: 'Priya Raghunathan', title: 'Head Coach' },
    },
    unread: true,
    expired: false,
    stat: { seen_count: 12, audience_count: 18 },
  },
  {
    notice: {
      id: 'n3',
      team_id: 't3',
      pinned: false,
      title: 'Photo day reminder',
      body: 'Squad photos at 10am sharp. Full kit, socks up.',
      created_at: ago(40 * 24 * HOURS),
      author: { full_name: 'Devan Sivaraman' },
    },
    unread: false,
    expired: true,
    stat: null,
  },
]

export default function NoticeVariants() {
  return (
    <div className="px-4 py-4">
      <h2 className="mb-1 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink">
        The noticeboard card
      </h2>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
        Pinned club-wide, ordinary squad, and expired.
      </p>
      {ROWS.map((row) => (
        <NoticeRow
          key={row.notice.id}
          notice={row.notice}
          teamsById={TEAMS}
          unread={row.unread}
          expired={row.expired}
          stat={row.stat}
          onOpenReceipts={() => {}}
          onDelete={row.expired ? undefined : async () => {}}
        />
      ))}
    </div>
  )
}
