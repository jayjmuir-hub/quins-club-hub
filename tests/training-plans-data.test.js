// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The data layer behind the Rugby Performance Director dashboard. Five rules
// are worth a test each; four of them are rules this repo has already been
// bitten by somewhere else.

// Every call made through the mocked client, in the order it was made. A chain
// is one `from(table)` and the methods called on it, so the ARRAY gives the
// order between statements and `ops` gives the order within one.
const calls = []

// What a chain resolves to. Overridden per test to stage a refusal or a row.
const resultFor = vi.fn(() => ({ data: { id: 't1' }, error: null }))

const rpcMock = vi.fn(async () => ({ data: [], error: null }))

// A chainable builder in the shape of postgrest-js: every filter/modifier
// returns itself, and the object is THENABLE so `await q` resolves the same
// way `await q.maybeSingle()` does. That is what lets one helper stand in for
// both the `.maybeSingle()` writes and the bare `await` reads.
const CHAIN_METHODS = [
  'select',
  'eq',
  'neq',
  'in',
  'is',
  'not',
  'or',
  'gte',
  'lte',
  'order',
  'limit',
  'update',
  'upsert',
  'insert',
  'delete',
]

function makeBuilder(table) {
  const chain = { table, ops: [] }
  calls.push(chain)
  const proxy = {}
  for (const name of CHAIN_METHODS) {
    proxy[name] = (...args) => {
      chain.ops.push({ name, args })
      return proxy
    }
  }
  const settle = () => {
    chain.ops.push({ name: 'settle', args: [] })
    return Promise.resolve(resultFor(chain))
  }
  proxy.maybeSingle = settle
  proxy.single = settle
  proxy.then = (onOk, onErr) => Promise.resolve(resultFor(chain)).then(onOk, onErr)
  return proxy
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table) => makeBuilder(table),
    rpc: (...args) => rpcMock(...args),
  },
}))

import {
  previewPublish,
  publish,
  saveTemplate,
  saveSessionBlocks,
  deleteFocus,
  setDrillActive,
  listDrills,
  listTemplates,
  getSession,
  createSession,
  setSessionVisibility,
  saveSquadTemplate,
  submitDrillToClub,
  approveDrillToClub,
  dismissDrillSubmission,
} from '../src/data/trainingPlans.js'

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  resultFor.mockImplementation(() => ({ data: { id: 't1' }, error: null }))
  rpcMock.mockImplementation(async () => ({ data: [], error: null }))
})

/**
 * The payload the named write method was called with, on that table. Searches
 * ACROSS chains, because a replace is two statements against one table and the
 * first of them is the delete.
 */
const payloadFor = (table, method) =>
  calls
    .filter((c) => c.table === table)
    .flatMap((c) => c.ops)
    .find((o) => o.name === method)?.args[0]

// ⚠️ ONE FUNCTION SERVES BOTH BUTTONS, and the ONLY difference is `_preview`.
// If preview ever reached the database as false it would publish sessions the
// director was only asking about — a write dressed up as a question.
describe('previewPublish / publish', () => {
  const args = {
    templateId: 'tpl1',
    teamIds: ['team1', 'team2'],
    from: '2026-09-01',
    to: '2026-09-30',
  }

  it('previewPublish calls the RPC with _preview true and publish with false', async () => {
    rpcMock.mockResolvedValue({ data: [{ team_id: 'team1', sessions: 4 }], error: null })

    const preview = await previewPublish(args)
    expect(rpcMock).toHaveBeenCalledWith('publish_training', {
      _template: 'tpl1',
      _teams: ['team1', 'team2'],
      _from: '2026-09-01',
      _to: '2026-09-30',
      _preview: true,
    })
    expect(preview).toEqual([{ team_id: 'team1', sessions: 4 }])

    rpcMock.mockClear()
    await publish(args)
    expect(rpcMock).toHaveBeenCalledWith(
      'publish_training',
      expect.objectContaining({ _preview: false }),
    )
  })

  it('reports a rows-less answer as an empty list rather than null', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    await expect(previewPublish(args)).resolves.toEqual([])
  })

  it('throws when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'no such template' } })
    await expect(publish(args)).rejects.toThrow(/no such template/)
  })
})

describe('saveTemplate', () => {
  const blocks = [
    { drill_id: 'd1', minutes: 20 },
    { drill_id: 'd2', minutes: 15, coach_note: 'both feet' },
    { drill_id: 'd3', minutes: 25 },
  ]

  // ⚠️ `total_minutes` IS DERIVED, NEVER TYPED. A stored total that disagrees
  // with the blocks under it is a number nobody can correct from the screen.
  // And positions are renumbered from the ORDER GIVEN, so a drag in the builder
  // is the single source of truth — a carried-over position is how a gap or a
  // duplicate reaches UNIQUE (template_id, position).
  it('writes total_minutes from the blocks and renumbers positions from 1', async () => {
    await saveTemplate({ id: 't1', name: 'Handling hour' }, blocks)

    expect(payloadFor('session_templates', 'upsert')).toEqual({
      id: 't1',
      name: 'Handling hour',
      total_minutes: 60,
    })

    const inserted = payloadFor('session_template_blocks', 'insert')
    expect(inserted.map((b) => b.position)).toEqual([1, 2, 3])
    expect(inserted.map((b) => b.drill_id)).toEqual(['d1', 'd2', 'd3'])
    expect(inserted.every((b) => b.template_id === 't1')).toBe(true)
    // A missing note is NULL, not undefined — undefined is dropped from the
    // JSON body and would leave an old note in place on a re-save.
    expect(inserted[0].coach_note).toBeNull()
    expect(inserted[1].coach_note).toBe('both feet')
  })

  // ⚠️ THE DELETE MUST LAND FIRST. An edit that appended would collide with
  // UNIQUE (template_id, position) the moment a template is saved twice, and
  // the failure reads as a database bug rather than an ordering one.
  it('deletes the old blocks BEFORE inserting the new ones', async () => {
    await saveTemplate({ id: 't1', name: 'Handling hour' }, blocks)

    const blockChains = calls.filter((c) => c.table === 'session_template_blocks')
    const shapes = blockChains.map((c) =>
      c.ops
        .map((o) => o.name)
        .filter((n) => n !== 'settle')
        .join('.'),
    )
    expect(shapes[0]).toBe('delete.eq')
    expect(shapes[1]).toBe('insert')
    expect(blockChains[0].ops.find((o) => o.name === 'eq').args).toEqual(['template_id', 't1'])
  })

  it('does not insert at all when the template is emptied', async () => {
    await saveTemplate({ id: 't1', name: 'Handling hour' }, [])
    const blockChains = calls.filter((c) => c.table === 'session_template_blocks')
    expect(blockChains.map((c) => c.ops[0].name)).toEqual(['delete'])
    expect(payloadFor('session_templates', 'upsert').total_minutes).toBe(0)
  })
})

// ⚠️ `coach_edited_at` IS THE FLAG publish_training READS to leave a session
// alone. Without the stamp, the next publish would overwrite the coach's own
// adjustment — silently, and only on the night it mattered.
describe('saveSessionBlocks', () => {
  it('stamps coach_edited_at', async () => {
    const before = Date.now()
    await saveSessionBlocks('s1', [{ drill_id: 'd1', minutes: 30 }], 'wet pitch')

    const payload = payloadFor('training_sessions', 'update')
    expect(payload.notes).toBe('wet pitch')
    expect(typeof payload.coach_edited_at).toBe('string')
    const stamped = Date.parse(payload.coach_edited_at)
    expect(Number.isNaN(stamped)).toBe(false)
    expect(stamped).toBeGreaterThanOrEqual(before - 1000)
    expect(payload.template_id).toBeUndefined()
  })

  it('writes template_id only when the chip-apply extras bag names one', async () => {
    await saveSessionBlocks('s1', [{ drill_id: 'd1', minutes: 30 }], null, { templateId: 'tpl-tackle' })
    expect(payloadFor('training_sessions', 'update').template_id).toBe('tpl-tackle')
  })

  it('replaces the blocks, delete before insert, numbered from 1', async () => {
    await saveSessionBlocks(
      's1',
      [
        { drill_id: 'd1', minutes: 30 },
        { drill_id: 'd2', minutes: 30 },
      ],
      null,
    )
    const blockChains = calls.filter((c) => c.table === 'training_session_blocks')
    expect(blockChains[0].ops[0].name).toBe('delete')
    expect(blockChains[1].ops[0].name).toBe('insert')
    const inserted = blockChains[1].ops[0].args[0]
    expect(inserted.map((b) => b.position)).toEqual([1, 2])
    expect(inserted.every((b) => b.session_id === 's1')).toBe(true)
  })

  // The stamp is the whole point of the call, so a refused update must not be
  // followed by a delete that empties the session's blocks anyway.
  it('refuses without touching the blocks when RLS filters the update out', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'training_sessions' ? { data: null, error: null } : { data: [], error: null },
    )
    await expect(
      saveSessionBlocks('s1', [{ drill_id: 'd1', minutes: 30 }], null),
    ).rejects.toThrow(/Rugby Performance Director/)
    expect(calls.some((c) => c.table === 'training_session_blocks')).toBe(false)
  })
})

// ⚠️ RLS filters a refused row OUT rather than erroring, so PostgREST answers
// with a perfectly successful empty result — data null, error null. Treating
// that as success is how a save the database rejected looks like one that
// worked. Same guard, same reason, as the other write paths in src/data/.
describe('setDrillActive', () => {
  it('returns the updated row', async () => {
    resultFor.mockImplementation(() => ({ data: { id: 'd1', is_active: false }, error: null }))
    await expect(setDrillActive('d1', false)).resolves.toEqual({ id: 'd1', is_active: false })
    expect(payloadFor('drills', 'update')).toEqual({ is_active: false })
  })

  it('throws REFUSED when RLS filters the write to zero rows', async () => {
    resultFor.mockImplementation(() => ({ data: null, error: null }))
    await expect(setDrillActive('d1', false)).rejects.toThrow(/Rugby Performance Director/)
  })

  it('surfaces a real error message rather than the refusal wording', async () => {
    resultFor.mockImplementation(() => ({
      data: null,
      error: { message: 'column is_active does not exist' },
    }))
    await expect(setDrillActive('d1', false)).rejects.toThrow(/column is_active/)
  })
})

// ⚠️ A bare `.delete()` cannot see a refusal: it returns `{ error: null }` for
// zero rows exactly as it does for one. deleteFocus therefore selects the
// deleted row back and runs it through the same guard as every other write.
describe('deleteFocus', () => {
  it('throws REFUSED when RLS filters the delete to zero rows', async () => {
    resultFor.mockImplementation(() => ({ data: null, error: null }))
    await expect(deleteFocus('f1')).rejects.toThrow(/Rugby Performance Director/)
  })

  it('returns the removed row when the delete landed', async () => {
    resultFor.mockImplementation(() => ({ data: { id: 'f1' }, error: null }))
    await expect(deleteFocus('f1')).resolves.toEqual({ id: 'f1' })
    const chain = calls.find((c) => c.table === 'training_focus')
    expect(chain.ops.map((o) => o.name)).toEqual(['delete', 'eq', 'select', 'settle'])
  })
})

// PostgREST cannot order an embed independently, so both readers sort the
// blocks by `position` in JS. The fixtures arrive DELIBERATELY out of order —
// a test fed already-sorted rows would pass with the sort deleted.
describe('embed sort', () => {
  const SHUFFLED = [
    { id: 'b3', position: 3 },
    { id: 'b1', position: 1 },
    { id: 'b2', position: 2 },
  ]

  it('listTemplates sorts each template’s blocks by position', async () => {
    resultFor.mockImplementation(() => ({
      data: [{ id: 't1', blocks: [...SHUFFLED] }, { id: 't2', blocks: null }],
      error: null,
    }))
    const rows = await listTemplates()
    expect(rows[0].blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    // A missing embed is an empty list, never a crash on null.
    expect(rows[1].blocks).toEqual([])
  })

  it('getSession sorts the session’s blocks by position', async () => {
    resultFor.mockImplementation(() => ({
      data: { id: 's1', blocks: [...SHUFFLED] },
      error: null,
    }))
    const session = await getSession('ev1')
    expect(session.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
  })
})

// ── Coach training plans (27 Aug 2026) ──────────────────────────────────────
describe('coach scoping and suggestions', () => {
  const opFor = (table, name) =>
    calls.filter((c) => c.table === table).flatMap((c) => c.ops).find((o) => o.name === name)

  it('listDrills without a team asks for the whole library (no or-filter)', async () => {
    resultFor.mockImplementation(() => ({ data: [], error: null }))
    await listDrills()
    expect(opFor('drills', 'or')).toBeUndefined()
  })

  it('listDrills with a team scopes to the club library plus that squad', async () => {
    resultFor.mockImplementation(() => ({ data: [], error: null }))
    await listDrills({ teamId: 'team-9' })
    expect(opFor('drills', 'or').args[0]).toBe('team_id.is.null,team_id.eq.team-9')
  })

  it('createSession stamps coach_edited_at and the author, then inserts blocks', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'training_sessions'
        ? { data: { id: 's-new' }, error: null }
        : { data: null, error: null },
    )
    await createSession({
      eventId: 'ev1',
      visibility: 'staff',
      createdBy: 'coach-1',
      blocks: [{ drill_id: 'd1', minutes: 20 }],
      notes: 'wet',
    })
    const inserted = opFor('training_sessions', 'insert').args[0]
    expect(inserted.event_id).toBe('ev1')
    expect(inserted.visibility).toBe('staff')
    expect(inserted.created_by).toBe('coach-1')
    expect(inserted.coach_edited_at).toBeTruthy()
    // The block insert carries position 1..n against the new session id.
    const blockIns = opFor('training_session_blocks', 'insert').args[0]
    expect(blockIns).toEqual([{ session_id: 's-new', position: 1, drill_id: 'd1', minutes: 20, coach_note: null }])
  })

  it('createSession throws on a refused session write (RLS zero-row)', async () => {
    resultFor.mockImplementation(() => ({ data: null, error: null }))
    await expect(createSession({ eventId: 'ev1', blocks: [] })).rejects.toThrow()
  })

  it('setSessionVisibility updates the one column', async () => {
    resultFor.mockImplementation(() => ({ data: { id: 's1' }, error: null }))
    await setSessionVisibility('s1', 'squad')
    expect(opFor('training_sessions', 'update').args[0]).toEqual({ visibility: 'squad' })
  })

  it('saveSquadTemplate inserts a team-owned template with its blocks', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'session_templates'
        ? { data: { id: 'tpl-new' }, error: null }
        : { data: null, error: null },
    )
    await saveSquadTemplate({ clubId: 'c1', teamId: 't9', name: 'Mine', blocks: [{ drill_id: 'd1', minutes: 30 }] })
    const row = opFor('session_templates', 'insert').args[0]
    expect(row.team_id).toBe('t9')
    expect(row.club_id).toBe('c1')
    expect(row.total_minutes).toBe(30)
  })

  it('submit / approve / dismiss move a drill through the queue', async () => {
    resultFor.mockImplementation(() => ({ data: { id: 'd1' }, error: null }))
    await submitDrillToClub('d1')
    expect(opFor('drills', 'update').args[0].submitted_at).toBeTruthy()

    calls.length = 0
    await approveDrillToClub('d1')
    expect(opFor('drills', 'update').args[0]).toEqual({ team_id: null, submitted_at: null })

    calls.length = 0
    await dismissDrillSubmission('d1')
    expect(opFor('drills', 'update').args[0]).toEqual({ submitted_at: null })
  })
})
