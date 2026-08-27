// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = []
const resultFor = vi.fn(() => ({ data: { id: 's1' }, error: null }))
const rpcMock = vi.fn(async () => ({ data: [], error: null }))

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

import { applyChipHour, toggleDrillLike, toggleDrillFavorite } from '../src/data/trainingShelf.js'

const TACKLE = {
  id: 'tpl-tackle',
  chip_label: 'Tackle',
  notes: null,
  blocks: [
    { position: 2, drill_id: 'd-b', minutes: 15, coach_note: null },
    { position: 1, drill_id: 'd-a', minutes: 15, coach_note: 'warm' },
  ],
}

beforeEach(() => {
  calls.length = 0
  rpcMock.mockClear()
  resultFor.mockReset()
  resultFor.mockImplementation((chain) =>
    chain.table === 'training_sessions' ? { data: { id: 's-new' }, error: null } : { data: null, error: null },
  )
})

function payloadFor(table, op) {
  const chain = calls.find((c) => c.table === table && c.ops.some((o) => o.name === op))
  return chain?.ops.find((o) => o.name === op)?.args[0]
}

/** setSessionVisibility writes only `{ visibility }` — not saveSessionBlocks. */
function visibilityWrites() {
  return calls
    .filter((c) => c.table === 'training_sessions')
    .map((c) => {
      const upd = c.ops.find((o) => o.name === 'update')
      const payload = upd?.args[0]
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'visibility')) return null
      const idEq = c.ops.find((o) => o.name === 'eq' && o.args[0] === 'id')
      return { id: idEq?.args[1], visibility: payload.visibility, keys: Object.keys(payload) }
    })
    .filter(Boolean)
}

describe('applyChipHour', () => {
  it('copies blocks in order, writes template_id, stamps coach_edited_at, does not call publish_training', async () => {
    const result = await applyChipHour({ eventId: 'e-tue', session: null, template: TACKLE })
    expect(result.applied).toBe(true)
    const inserted = payloadFor('training_sessions', 'insert')
    expect(inserted.event_id).toBe('e-tue')
    expect(inserted.template_id).toBe('tpl-tackle')
    expect(typeof inserted.coach_edited_at).toBe('string')
    const blocks = payloadFor('training_session_blocks', 'insert')
    expect(blocks.map((b) => b.drill_id)).toEqual(['d-a', 'd-b'])
    expect(blocks.map((b) => b.position)).toEqual([1, 2])
    expect(rpcMock).not.toHaveBeenCalled()
    expect(rpcMock.mock.calls.some((c) => c[0] === 'publish_training')).toBe(false)
  })

  it('refuses to write when the session is already coach-edited and confirm is false', async () => {
    const result = await applyChipHour({
      eventId: 'e-tue',
      session: { id: 's-1', coach_edited_at: '2026-08-21T05:00:00.000Z', notes: 'keep' },
      template: TACKLE,
      confirmed: false,
    })
    expect(result).toEqual({ applied: false, needsConfirm: true })
    expect(calls.filter((c) => c.table === 'training_sessions')).toHaveLength(0)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('replaces blocks and keeps stamping coach_edited_at once confirmed', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'training_sessions' ? { data: { id: 's-1' }, error: null } : { data: null, error: null },
    )
    const result = await applyChipHour({
      eventId: 'e-tue',
      session: { id: 's-1', coach_edited_at: '2026-08-21T05:00:00.000Z', notes: 'keep' },
      template: TACKLE,
      confirmed: true,
    })
    expect(result.applied).toBe(true)
    const payload = payloadFor('training_sessions', 'update')
    expect(payload.template_id).toBe('tpl-tackle')
    expect(typeof payload.coach_edited_at).toBe('string')
    expect(payload.notes).toBe('keep')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('an empty night ends as staff, never publish_training', async () => {
    const result = await applyChipHour({ eventId: 'e-tue', session: null, template: TACKLE })
    expect(result.applied).toBe(true)
    expect(visibilityWrites()).toEqual([{ id: 's-new', visibility: 'staff', keys: ['visibility'] }])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('replace-confirm on a draft ends as staff', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'training_sessions' ? { data: { id: 's-draft' }, error: null } : { data: null, error: null },
    )
    const result = await applyChipHour({
      eventId: 'e-tue',
      session: {
        id: 's-draft',
        visibility: 'draft',
        coach_edited_at: '2026-08-21T05:00:00.000Z',
        notes: null,
      },
      template: TACKLE,
      confirmed: true,
    })
    expect(result.applied).toBe(true)
    expect(visibilityWrites()).toEqual([{ id: 's-draft', visibility: 'staff', keys: ['visibility'] }])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('replace-confirm on staff stays staff', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'training_sessions' ? { data: { id: 's-staff' }, error: null } : { data: null, error: null },
    )
    const result = await applyChipHour({
      eventId: 'e-tue',
      session: {
        id: 's-staff',
        visibility: 'staff',
        coach_edited_at: '2026-08-21T05:00:00.000Z',
        notes: null,
      },
      template: TACKLE,
      confirmed: true,
    })
    expect(result.applied).toBe(true)
    const vis = visibilityWrites()
    expect(vis.every((row) => row.visibility === 'staff')).toBe(true)
    expect(vis.some((row) => row.visibility === 'draft' || row.visibility === 'squad')).toBe(false)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('already-squad stays squad — chip apply does not downgrade', async () => {
    resultFor.mockImplementation((chain) =>
      chain.table === 'training_sessions' ? { data: { id: 's-squad' }, error: null } : { data: null, error: null },
    )
    const result = await applyChipHour({
      eventId: 'e-tue',
      session: {
        id: 's-squad',
        visibility: 'squad',
        coach_edited_at: '2026-08-21T05:00:00.000Z',
        notes: null,
      },
      template: TACKLE,
      confirmed: true,
    })
    expect(result.applied).toBe(true)
    expect(visibilityWrites()).toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })
})

describe('likes vs favorites', () => {
  it('a like insert is the drill_likes row; a favorite is a separate table', async () => {
    resultFor.mockImplementation(() => ({ data: null, error: null }))
    await toggleDrillLike({ id: 'd-clamp', profileId: 'p-coach', on: true })
    await toggleDrillFavorite({ id: 'd-clamp', profileId: 'p-coach', on: true })
    const likeInsert = calls.find((c) => c.table === 'drill_likes')
    const favInsert = calls.find((c) => c.table === 'drill_favorites')
    expect(likeInsert.ops[0].args[0]).toEqual({ drill_id: 'd-clamp', profile_id: 'p-coach' })
    expect(favInsert.ops[0].args[0]).toEqual({ drill_id: 'd-clamp', profile_id: 'p-coach' })
    expect(likeInsert.table).not.toBe(favInsert.table)
  })
})
