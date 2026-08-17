import { describe, it, expect, vi, beforeEach } from 'vitest'

// Unit tests for src/data/parents.js and src/data/photos.js. Same approach
// and the same reasoning as tests/data.test.js: the Supabase client is fully
// mocked, no network is touched, and the assertions check the *calls* these
// modules make (table, filters, bucket, object key) rather than only their
// return values — a function querying the wrong table would otherwise pass.
//
// The storage half needs a mock tests/data.test.js has never needed, because
// supabase.storage.from(...) returns a different object with upload /
// createSignedUrl(s) / remove on it rather than the chainable query builder.

// Canvas/createImageBitmap do not exist in jsdom. The resize itself is
// covered in tests/image-resize.test.js; here it is stubbed to a pass-through
// so the upload tests assert what upload does, not what the canvas does.
vi.mock('../src/lib/imageResize.js', () => ({
  resizePhoto: (file) => Promise.resolve(file),
}))

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    storage: { from: vi.fn() },
  },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  listParents,
  listParentsForPlayers,
  saveParents,
  deleteParent,
} from '../src/data/parents.js'
import {
  PHOTO_BUCKET,
  uploadPlayerPhoto,
  signPhotoUrl,
  signPhotoUrls,
  deletePlayerPhoto,
  clearPhotoUrlCache,
} from '../src/data/photos.js'

function createQueryBuilder({ data = null, error = null } = {}) {
  const calls = {
    select: [], eq: [], in: [], not: [], order: [], insert: [], update: [], delete: [],
  }
  const builder = {}
  const chain = (name) =>
    vi.fn((...args) => {
      calls[name].push(args)
      return builder
    })
  for (const name of Object.keys(calls)) builder[name] = chain(name)
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error }))
  builder.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject)
  return { builder, calls }
}

function createStorageBucket(responses = {}) {
  return {
    upload: vi.fn(() => Promise.resolve(responses.upload ?? { data: {}, error: null })),
    createSignedUrl: vi.fn(() =>
      Promise.resolve(responses.createSignedUrl ?? { data: null, error: null }),
    ),
    createSignedUrls: vi.fn(() =>
      Promise.resolve(responses.createSignedUrls ?? { data: [], error: null }),
    ),
    remove: vi.fn(() => Promise.resolve(responses.remove ?? { data: [], error: null })),
  }
}

beforeEach(() => {
  supabase.from.mockReset()
  supabase.storage.from.mockReset()
  // The signed-URL cache is module-level and deliberately outlives any one
  // component, so it also outlives any one test. Clear it between tests or a
  // URL signed in an earlier test satisfies a later one that meant to assert
  // a signing failure.
  clearPhotoUrlCache()
})

// --- listParents ------------------------------------------------------

describe('listParents', () => {
  it('queries player_parents for one player, primary first', async () => {
    const rows = [{ id: 'pp-1' }]
    const { builder, calls } = createQueryBuilder({ data: rows })
    supabase.from.mockReturnValue(builder)

    const result = await listParents('player-1')

    expect(supabase.from).toHaveBeenCalledWith('player_parents')
    expect(builder.select).toHaveBeenCalledWith('*')
    expect(calls.eq).toEqual([['player_id', 'player-1']])
    // Primary contact first — the ordering the detail screen relies on.
    expect(calls.order[0]).toEqual(['is_primary', { ascending: false }])
    expect(result).toEqual(rows)
  })

  it('returns [] without querying when there is no player id', async () => {
    expect(await listParents(undefined)).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns [] rather than null when RLS withholds every row', async () => {
    // The normal outcome for a parent viewing a team-mate: not an error.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)
    expect(await listParents('player-1')).toEqual([])
  })

  it('throws when the query errors', async () => {
    const { builder } = createQueryBuilder({ error: new Error('boom') })
    supabase.from.mockReturnValue(builder)
    await expect(listParents('player-1')).rejects.toThrow('boom')
  })
})

// --- listParentsForPlayers --------------------------------------------

describe('listParentsForPlayers', () => {
  it('filters by player id and does NOT select contact details', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await listParentsForPlayers(['p1', 'p2'])

    expect(calls.in).toEqual([['player_id', ['p1', 'p2']]])
    const columns = calls.select[0][0]
    // The point of this query is "does this player have anyone on file", so
    // pulling a whole squad's parent emails and phone numbers into a roster
    // screen would be a wider exposure than the question needs.
    expect(columns).not.toContain('email')
    expect(columns).not.toContain('phone')
  })

  it('does not query at all for an empty list', async () => {
    expect(await listParentsForPlayers([])).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// --- saveParents ------------------------------------------------------

describe('saveParents', () => {
  it('deletes rows the user removed, scoped to this player', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    await saveParents('player-1', [{ id: 'pp-1', full_name: 'Aisha Khan' }])

    expect(calls.delete.length).toBe(1)
    // Scoped by player_id as well as by id: a bad id can never reach another
    // player's row, without leaning on RLS to catch it.
    expect(calls.eq[0]).toEqual(['player_id', 'player-1'])
    expect(calls.not[0]).toEqual(['id', 'in', '(pp-1)'])
  })

  it('deletes everything when the list is empty', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)

    const result = await saveParents('player-1', [])

    expect(calls.delete.length).toBe(1)
    expect(calls.not).toEqual([]) // nothing excluded from the delete
    expect(result).toEqual([])
  })

  it('inserts rows with no id and blanks become null', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'new-1' }] })
    supabase.from.mockReturnValue(builder)

    await saveParents('player-1', [
      { full_name: '  Sara Ahmed  ', relationship: 'Mother', email: '', phone: '050 111 2222' },
    ])

    const inserted = calls.insert[0][0]
    expect(inserted[0]).toMatchObject({
      player_id: 'player-1',
      full_name: 'Sara Ahmed', // trimmed
      relationship: 'Mother',
      email: null, // '' normalised away, so "cleared" and "never set" match
      phone: '050 111 2222',
    })
  })

  it('updates rows that already have an id rather than re-inserting them', async () => {
    const { builder, calls } = createQueryBuilder({ data: { id: 'pp-1' } })
    supabase.from.mockReturnValue(builder)

    await saveParents('player-1', [{ id: 'pp-1', full_name: 'Aisha Khan', phone: '050 999' }])

    expect(calls.update.length).toBe(1)
    expect(calls.insert.length).toBe(0)
    expect(calls.update[0][0]).toMatchObject({ full_name: 'Aisha Khan', phone: '050 999' })
  })

  it('drops rows the user started and left nameless', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'new-1' }] })
    supabase.from.mockReturnValue(builder)

    await saveParents('player-1', [
      { full_name: 'Sara Ahmed' },
      { full_name: '   ', phone: '050 000' }, // abandoned half-typed row
    ])

    expect(calls.insert[0][0]).toHaveLength(1)
  })

  // ⚠️ ALL THREE NAME COLUMNS REACH THE DATABASE, AND THIS IS THE ONLY TEST
  // THAT CAN SEE IT. The screen tests assert what is handed to saveParents;
  // everything below that line is inside this module. Dropping first_name and
  // last_name from toRow left the whole suite green — and would have sent
  // full_name alone, which private.sync_person_name re-splits by taking the LAST
  // word as the family name. "Anna van der Berg" comes back as "Anna van der".
  it('writes first_name and last_name alongside full_name', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'new-1' }] })
    supabase.from.mockReturnValue(builder)

    await saveParents('player-1', [
      { full_name: 'Anna van der Berg', first_name: ' Anna ', last_name: ' van der Berg ' },
    ])

    expect(calls.insert[0][0][0]).toMatchObject({
      full_name: 'Anna van der Berg',
      first_name: 'Anna',
      last_name: 'van der Berg',
    })
  })

  // A blank family name is null rather than '', for the same reason every other
  // blank in this module is: "cleared" and "never set" must be one state.
  it('sends a blank family name as null', async () => {
    const { builder, calls } = createQueryBuilder({ data: [{ id: 'new-1' }] })
    supabase.from.mockReturnValue(builder)

    await saveParents('player-1', [{ full_name: 'Kwame', first_name: 'Kwame', last_name: '' }])

    expect(calls.insert[0][0][0].last_name).toBeNull()
  })

  it('reports a refusal when the database updates nothing', async () => {
    // RLS filtering a write out is a successful "zero rows" as far as
    // PostgREST is concerned — it must not be reported as a save.
    const { builder } = createQueryBuilder({ data: null })
    supabase.from.mockReturnValue(builder)

    await expect(
      saveParents('player-1', [{ id: 'pp-1', full_name: 'Aisha Khan' }]),
    ).rejects.toThrow(/permission/i)
  })

  it('refuses without a player id', async () => {
    await expect(saveParents(null, [])).rejects.toThrow(/player_id/)
  })
})

// --- deleteParent -----------------------------------------------------

describe('deleteParent', () => {
  it('deletes by id and throws when nothing was removed', async () => {
    const { builder } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)
    await expect(deleteParent('pp-1')).rejects.toThrow(/permission/i)
  })
})

// --- photos -----------------------------------------------------------

describe('uploadPlayerPhoto', () => {
  it('writes to <player_id>/<timestamp>.<ext> in the photo bucket', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)

    const file = { type: 'image/jpeg', size: 1000 }
    const key = await uploadPlayerPhoto('player-1', file)

    expect(supabase.storage.from).toHaveBeenCalledWith(PHOTO_BUCKET)
    // The storage policies read the first path segment as the player id and
    // resolve the squad from it — this shape is load-bearing, not cosmetic.
    expect(key).toMatch(/^player-1\/\d+\.jpg$/)
    expect(bucket.upload).toHaveBeenCalledWith(
      key,
      file,
      expect.objectContaining({ contentType: 'image/jpeg' }),
    )
  })

  it('rejects a non-image before touching the network', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)

    await expect(uploadPlayerPhoto('player-1', { type: 'application/pdf', size: 10 })).rejects.toThrow(
      /not a photo/i,
    )
    expect(bucket.upload).not.toHaveBeenCalled()
  })

  it('rejects a file over 5 MB', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)

    await expect(
      uploadPlayerPhoto('player-1', { type: 'image/png', size: 6 * 1024 * 1024 }),
    ).rejects.toThrow(/too large/i)
  })

  it('gives each upload a new key so a replaced photo is not served from cache', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)

    const first = await uploadPlayerPhoto('player-1', { type: 'image/jpeg', size: 10 })
    vi.setSystemTime?.(Date.now() + 1000)
    const second = await uploadPlayerPhoto('player-1', { type: 'image/png', size: 10 })

    expect(first).not.toBe(second)
  })
})

describe('signPhotoUrl', () => {
  it('signs a key and returns the url', async () => {
    const bucket = createStorageBucket({
      createSignedUrl: { data: { signedUrl: 'https://signed/1.jpg' }, error: null },
    })
    supabase.storage.from.mockReturnValue(bucket)

    expect(await signPhotoUrl('player-1/1.jpg')).toBe('https://signed/1.jpg')
    // A finite TTL, not a permanent handle on a child's photograph.
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('player-1/1.jpg', expect.any(Number))
  })

  it('returns null for no path, without calling storage', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    expect(await signPhotoUrl(null)).toBeNull()
    expect(bucket.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns null rather than throwing when signing fails', async () => {
    // The screen falls back to the initials tile; an error box where a face
    // should be is worse than a monogram, and there is nothing to retry.
    const bucket = createStorageBucket({
      createSignedUrl: { data: null, error: new Error('nope') },
    })
    supabase.storage.from.mockReturnValue(bucket)
    expect(await signPhotoUrl('player-1/1.jpg')).toBeNull()
  })
})

describe('signPhotoUrls', () => {
  it('signs a whole squad in one call and returns a path → url map', async () => {
    const bucket = createStorageBucket({
      createSignedUrls: {
        data: [
          { path: 'p1/a.jpg', signedUrl: 'https://signed/a' },
          { path: 'p2/b.jpg', signedUrl: 'https://signed/b' },
        ],
        error: null,
      },
    })
    supabase.storage.from.mockReturnValue(bucket)

    expect(await signPhotoUrls(['p1/a.jpg', 'p2/b.jpg'])).toEqual({
      'p1/a.jpg': 'https://signed/a',
      'p2/b.jpg': 'https://signed/b',
    })
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('omits keys that failed to sign instead of failing the batch', async () => {
    const bucket = createStorageBucket({
      createSignedUrls: {
        data: [
          { path: 'p1/a.jpg', signedUrl: 'https://signed/a' },
          { path: 'p2/b.jpg', signedUrl: null, error: 'not found' },
        ],
        error: null,
      },
    })
    supabase.storage.from.mockReturnValue(bucket)

    const urls = await signPhotoUrls(['p1/a.jpg', 'p2/b.jpg'])
    expect(urls).toEqual({ 'p1/a.jpg': 'https://signed/a' })
  })

  it('skips empty paths and returns {} for an empty list', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    expect(await signPhotoUrls([null, undefined, ''])).toEqual({})
    expect(bucket.createSignedUrls).not.toHaveBeenCalled()
  })
})

describe('deletePlayerPhoto', () => {
  it('removes the object and reports success', async () => {
    const bucket = createStorageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    expect(await deletePlayerPhoto('p1/a.jpg')).toBe(true)
    expect(bucket.remove).toHaveBeenCalledWith(['p1/a.jpg'])
  })

  it('resolves false rather than throwing, so a tidy-up failure cannot break a save', async () => {
    const bucket = createStorageBucket({ remove: { data: null, error: new Error('nope') } })
    supabase.storage.from.mockReturnValue(bucket)
    expect(await deletePlayerPhoto('p1/a.jpg')).toBe(false)
  })
})

// --- signed-URL caching -----------------------------------------------

describe('signed-URL caching', () => {
  it('does not re-sign a path it has already signed', async () => {
    const bucket = createStorageBucket({
      createSignedUrl: { data: { signedUrl: 'https://signed/1.jpg' }, error: null },
    })
    supabase.storage.from.mockReturnValue(bucket)

    const first = await signPhotoUrl('player-1/1.jpg')
    const second = await signPhotoUrl('player-1/1.jpg')

    expect(second).toBe(first)
    // The point isn't saving the signing call — it's that a NEW signed URL is
    // a new resource to the browser, so re-signing re-downloads the image.
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('asks only for the keys it does not already hold', async () => {
    const bucket = createStorageBucket({
      createSignedUrls: {
        data: [{ path: 'p1/a.jpg', signedUrl: 'https://signed/a' }],
        error: null,
      },
    })
    supabase.storage.from.mockReturnValue(bucket)

    await signPhotoUrls(['p1/a.jpg'])

    bucket.createSignedUrls.mockResolvedValue({
      data: [{ path: 'p2/b.jpg', signedUrl: 'https://signed/b' }],
      error: null,
    })
    const urls = await signPhotoUrls(['p1/a.jpg', 'p2/b.jpg'])

    // Only the uncached key was requested the second time...
    expect(bucket.createSignedUrls).toHaveBeenLastCalledWith(['p2/b.jpg'], expect.any(Number))
    // ...but the caller still gets both.
    expect(urls).toEqual({ 'p1/a.jpg': 'https://signed/a', 'p2/b.jpg': 'https://signed/b' })
  })

  it('skips the network entirely when everything is cached', async () => {
    const bucket = createStorageBucket({
      createSignedUrls: {
        data: [{ path: 'p1/a.jpg', signedUrl: 'https://signed/a' }],
        error: null,
      },
    })
    supabase.storage.from.mockReturnValue(bucket)

    await signPhotoUrls(['p1/a.jpg'])
    bucket.createSignedUrls.mockClear()
    const urls = await signPhotoUrls(['p1/a.jpg'])

    expect(bucket.createSignedUrls).not.toHaveBeenCalled()
    expect(urls).toEqual({ 'p1/a.jpg': 'https://signed/a' })
  })

  it('forgets a path when its photo is deleted', async () => {
    const bucket = createStorageBucket({
      createSignedUrl: { data: { signedUrl: 'https://signed/1.jpg' }, error: null },
    })
    supabase.storage.from.mockReturnValue(bucket)

    await signPhotoUrl('player-1/1.jpg')
    await deletePlayerPhoto('player-1/1.jpg')
    await signPhotoUrl('player-1/1.jpg')

    // A deleted photo's URL must not keep being served from memory.
    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('clears everything on demand, for sign-out', async () => {
    const bucket = createStorageBucket({
      createSignedUrl: { data: { signedUrl: 'https://signed/1.jpg' }, error: null },
    })
    supabase.storage.from.mockReturnValue(bucket)

    await signPhotoUrl('player-1/1.jpg')
    clearPhotoUrlCache()
    await signPhotoUrl('player-1/1.jpg')

    expect(bucket.createSignedUrl).toHaveBeenCalledTimes(2)
  })
})
