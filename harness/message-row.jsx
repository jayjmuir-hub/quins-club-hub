// The squad chat's message rows, in a real browser.
//
// Same reason as notice-row.jsx: the /chat screen reads three tables and an
// RPC, so it cannot be harnessed whole — but the thing Jay looks at is the
// row, and src/components/MessageRow.jsx is pure props for exactly this.
//
// ⚠️ THE FOUR ROWS ARE THE FOUR STATES THAT LOOK DIFFERENT: a staff post
// with replies (red rule, role pill, read stat), a family's post in an open
// channel (plain), a removed message, and a pinned staff post. Everything
// invented — CLAUDE.md rule 9.
import MessageRow from '../src/components/MessageRow.jsx'

const MIN = 60 * 1000
const ago = (ms) => new Date(Date.parse('2026-08-22T12:00:00Z') - ms).toISOString()

const base = {
  club_id: 'c1',
  team_id: 't2',
  channel: 'squad',
  parent_id: null,
  event_id: null,
  pinned: false,
  edited_at: null,
  deleted_at: null,
}

const ROWS = [
  {
    ...base,
    id: 'm1',
    author_id: 'u-coach',
    author_role: 'manager',
    author_title: 'Team Manager',
    body: 'Bus leaves the club at 07:45 sharp on Saturday. Reply here if you need a seat — I will close the list Friday 6pm.',
    created_at: ago(140 * MIN),
    author: { full_name: 'Priya Raghunathan' },
    replies: [
      { ...base, id: 'r1', parent_id: 'm1', author_id: 'u-p1', author_role: 'parent', author_title: null, body: 'Two seats for us please, Arjun and me.', created_at: ago(120 * MIN), author: { full_name: 'Daniel Kowalczyk' } },
      { ...base, id: 'r2', parent_id: 'm1', author_id: 'u-p2', author_role: 'parent', author_title: null, body: 'We’ll drive — can take two extra if anyone is stuck.', created_at: ago(95 * MIN), author: { full_name: 'Fatima Rahimi' } },
      { ...base, id: 'r3', parent_id: 'm1', author_id: 'u-coach', author_role: 'manager', author_title: 'Team Manager', body: 'Bus list so far: 11.', created_at: ago(40 * MIN), author: { full_name: 'Priya Raghunathan' } },
    ],
  },
  {
    ...base,
    id: 'm2',
    author_id: 'u-p3',
    author_role: 'parent',
    author_title: null,
    body: 'Does anyone have a spare size 4 ball we could borrow for the week? Ours has gone over the fence again.',
    created_at: ago(70 * MIN),
    author: { full_name: 'Leo Marchetti' },
    replies: [],
  },
  {
    ...base,
    id: 'm3',
    author_id: 'u-p4',
    author_role: 'parent',
    author_title: null,
    body: '(removed)',
    deleted_at: ago(30 * MIN),
    created_at: ago(33 * MIN),
    author: { full_name: 'Sam Whitcombe' },
    replies: [],
  },
  {
    ...base,
    id: 'm4',
    pinned: true,
    author_id: 'u-hc',
    author_role: 'coach',
    author_title: 'Head Coach',
    body: 'Training moves to Pitch 3 for the rest of August. Kit: black shorts, white socks.',
    created_at: ago(12 * MIN),
    author: { full_name: 'Tom Achterberg' },
    replies: [],
  },
]

const STATS = new Map([
  ['m1', { reads: 22, audience: 27 }],
  ['m4', { reads: 9, audience: 27 }],
])

export default function MessageRowScenario() {
  const noop = async () => {}
  return (
    <div className="mx-auto max-w-[640px] px-3 py-4">
      {ROWS.map((m) => (
        <MessageRow
          key={m.id}
          message={m}
          selfId="u-p1"
          canModerate
          readStat={STATS.get(m.id)}
          unread={m.id === 'm4'}
          onReply={noop}
          onRemove={noop}
          onPin={noop}
        />
      ))}
    </div>
  )
}
