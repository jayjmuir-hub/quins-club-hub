// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'

import {
  decodeXmlEntities,
  isPlayerPhotoKey,
  mismatchedEtags,
  normaliseEtag,
  objectsToCopy,
  parseListObjectsV2,
} from '../supabase/functions/backup-player-photos/plan.ts'

// The player-photo mirror, tested where a test can reach it.
//
// ⚠️ THIS IS THE ONLY EDGE-FUNCTION LOGIC IN THIS REPO WITH ANY VITEST COVERAGE,
// and the split that makes it possible is the point. RESTORE.md records that a
// Deno function is not a module the suite imports, so the four deployed
// functions are checked live or not at all. plan.ts is imported by both
// runtimes precisely so the one rule this feature turns on can fail a build.
//
// ⚠️ WHAT THIS FILE DOES NOT PROVE: that anything was ever copied. No test here
// touches Supabase Storage or R2, and a green run says nothing about whether
// the backup exists. That claim is only ever made by the restore drill in
// claude/runbooks/player-photo-backup.md — "a backup is an untested claim until
// a restore has been drilled" is this repo's own finding, from the database
// drill on 13 Aug 2026 whose confident prediction turned out wrong.

// ⚠️ THE PLAYER ID IS THE FIRST PATH SEGMENT — the storage policies depend on
// it (src/data/photos.js). Real-shaped keys, so a shape assertion means
// something.
const ALEX = '3f4a1c22-9b6e-4d51-8a07-2c9e1b7d5f30'
const SAM = '7c2b9d14-6e3f-4a88-b512-0d6a3f9c8e41'

describe('objectsToCopy — the append-only rule', () => {
  it('copies what the backup does not have', () => {
    const source = [`${ALEX}/1786000000000.jpg`, `${SAM}/1786000111111.png`]
    const backup = [`${ALEX}/1786000000000.jpg`]
    expect(objectsToCopy(source, backup)).toEqual([`${SAM}/1786000111111.png`])
  })

  it('copies nothing on a second run — the mirror is idempotent', () => {
    const keys = [`${ALEX}/1786000000000.jpg`, `${SAM}/1786000111111.png`]
    expect(objectsToCopy(keys, keys)).toEqual([])
  })

  // ⚠️ THE ONE THAT MATTERS. This is the exact state the feature exists to
  // produce: a head shot was REPLACED, so uploadPlayerPhoto wrote a new
  // timestamped key and deletePlayerPhoto removed the old one. The old key is
  // now in the backup and NOT in the source.
  //
  // The failure this catches is a future "tidy up" that syncs deletions —
  // which would destroy the only surviving copy of the previous photograph, in
  // the name of making the two sides match. The module has no way to express
  // that, and this asserts the consequence rather than the implementation.
  it('leaves an object the source has DELETED alone — no deletion is even returned', () => {
    const replaced = `${ALEX}/1786000000000.jpg`
    const current = `${ALEX}/1786999999999.jpg`

    const source = [current]
    const backup = [replaced]

    // The only thing to do is copy the new one. Nothing names the old key.
    const work = objectsToCopy(source, backup)
    expect(work).toEqual([current])
    expect(work).not.toContain(replaced)
  })

  it('exports no way to ask what should be deleted', async () => {
    // Injected-fault check for the rule above: if somebody adds a prune path,
    // this goes red. A test that only asserts the happy list would stay green.
    const module = await import('../supabase/functions/backup-player-photos/plan.ts')
    const names = Object.keys(module).join(' ').toLowerCase()
    expect(names).not.toMatch(/delete|prune|remove|sync/)
  })

  it('is deterministic and de-duplicated, so a capped run always starts in the same place', () => {
    const a = `${ALEX}/1786000000000.jpg`
    const b = `${SAM}/1786000111111.png`
    expect(objectsToCopy([b, a, b], [])).toEqual([a, b].sort())
  })

  it('ignores empty keys on either side rather than trying to copy one', () => {
    expect(objectsToCopy(['', `${ALEX}/1.jpg`], ['', ''])).toEqual([`${ALEX}/1.jpg`])
  })
})

describe('isPlayerPhotoKey — reporting, never filtering', () => {
  it('recognises the shape src/data/photos.js writes', () => {
    expect(isPlayerPhotoKey(`${ALEX}/1786000000000.jpg`)).toBe(true)
    expect(isPlayerPhotoKey(`${ALEX}/1786000000000.webp`)).toBe(true)
  })

  it('does not recognise anything else', () => {
    expect(isPlayerPhotoKey('loose-file.jpg')).toBe(false)
    expect(isPlayerPhotoKey(`${ALEX}/notatimestamp.jpg`)).toBe(false)
  })

  // ⚠️ The whole reason this predicate is safe to have around: an unrecognised
  // key is still copied. objectsToCopy never consults it.
  it('an unrecognised key is STILL copied', () => {
    expect(objectsToCopy(['something/else.tiff'], [])).toEqual(['something/else.tiff'])
  })
})

describe('parseListObjectsV2', () => {
  const listing = (inner) =>
    `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${inner}</ListBucketResult>`

  it('reads the keys out of a page', () => {
    const xml = listing(
      `<Name>quins-player-photos</Name><IsTruncated>false</IsTruncated>` +
        `<Contents><Key>${ALEX}/1.jpg</Key><Size>4</Size></Contents>` +
        `<Contents><Key>${SAM}/2.png</Key><Size>5</Size></Contents>`,
    )
    const result = parseListObjectsV2(xml)
    expect(result.keys).toEqual([`${ALEX}/1.jpg`, `${SAM}/2.png`])
    expect(result.truncated).toBe(false)
    expect(result.nextToken).toBeNull()
  })

  it('reports an empty bucket as empty rather than throwing', () => {
    const result = parseListObjectsV2(listing('<KeyCount>0</KeyCount><IsTruncated>false</IsTruncated>'))
    expect(result.keys).toEqual([])
    expect(result.truncated).toBe(false)
  })

  // ⚠️ A listing that stops at 1000 keys and calls itself complete makes the
  // mirror believe R2 is missing objects it already holds. That direction only
  // wastes a copy — but the caller cannot tell the difference between "wasteful"
  // and "the remainder is unknown" unless this reports truncation faithfully.
  it('reports truncation and hands back the continuation token', () => {
    const result = parseListObjectsV2(
      listing(
        `<IsTruncated>true</IsTruncated><Contents><Key>${ALEX}/1.jpg</Key></Contents>` +
          '<NextContinuationToken>1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=</NextContinuationToken>',
      ),
    )
    expect(result.truncated).toBe(true)
    expect(result.nextToken).toBe('1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=')
  })

  it('decodes an escaped key rather than corrupting it', () => {
    const result = parseListObjectsV2(listing('<Contents><Key>odd &amp; name/1.jpg</Key></Contents>'))
    expect(result.keys).toEqual(['odd & name/1.jpg'])
  })
})

describe('mismatchedEtags — byte-identity, not a matching size', () => {
  const A = `${ALEX}/1.jpg`
  const B = `${SAM}/2.png`

  it('says nothing when every backed-up copy has the source hash', () => {
    expect(mismatchedEtags({ [A]: 'abc', [B]: 'def' }, { [A]: 'abc', [B]: 'def' })).toEqual([])
  })

  // ⚠️ THE POINT OF THE WHOLE FUNCTION. Two files of the same length are
  // routinely different files — a truncated transfer, a re-encode, or the wrong
  // object stored under the right key all preserve plausibility and change the
  // hash. Sizes matching is what we could already see; this is what proves it.
  it('flags a copy whose hash differs', () => {
    expect(mismatchedEtags({ [A]: 'abc' }, { [A]: 'WRONG' })).toEqual([A])
  })

  it('ignores a key not backed up yet — that is work to do, not corruption', () => {
    expect(mismatchedEtags({ [A]: 'abc', [B]: 'def' }, { [A]: 'abc' })).toEqual([])
  })

  // ⚠️ "COULD NOT CHECK" MUST NOT LOOK LIKE "CHECKED AND FINE". This is the same
  // failure this whole feature exists to prevent, one level up: a green number
  // that was never actually measured.
  it('treats a MISSING source hash as a mismatch rather than a pass', () => {
    expect(mismatchedEtags({ [A]: '' }, { [A]: 'abc' })).toEqual([A])
  })

  it('is deterministic in its ordering', () => {
    expect(mismatchedEtags({ [B]: 'x', [A]: 'x' }, { [B]: 'no', [A]: 'no' })).toEqual([A, B].sort())
  })
})

describe('normaliseEtag', () => {
  // S3 wraps ETags in literal quotes; Supabase stores them quoted too. Comparing
  // a quoted hash against an unquoted one fails for every single object, which
  // would read as total corruption rather than as a formatting difference.
  it('strips the quotes S3 wraps them in', () => {
    expect(normaliseEtag('"c4d690e0b6df6539e5ce1c3947ba579d"')).toBe('c4d690e0b6df6539e5ce1c3947ba579d')
  })

  it('lower-cases and trims, so case alone is never a mismatch', () => {
    expect(normaliseEtag('  "ABCDEF"  ')).toBe('abcdef')
  })

  it('maps absent values to the empty string', () => {
    expect(normaliseEtag(null)).toBe('')
    expect(normaliseEtag(undefined)).toBe('')
  })
})

describe('parseListObjectsV2 — ETags are paired within their own Contents block', () => {
  const listing = (inner) => `<ListBucketResult>${inner}</ListBucketResult>`

  it('reads each key with its own ETag', () => {
    const result = parseListObjectsV2(
      listing(
        '<Contents><Key>a/1.jpg</Key><ETag>&quot;aaa&quot;</ETag></Contents>' +
          '<Contents><Key>b/2.jpg</Key><ETag>&quot;bbb&quot;</ETag></Contents>',
      ),
    )
    expect(result.keys).toEqual(['a/1.jpg', 'b/2.jpg'])
    expect(result.etags).toEqual({ 'a/1.jpg': 'aaa', 'b/2.jpg': 'bbb' })
  })

  // ⚠️ THE BUG THIS SHAPE EXISTS TO PREVENT. Sweeping all <Key> elements and all
  // <ETag> elements separately and zipping by index pairs correctly until one
  // entry lacks an ETag — after which every later photograph is checked against
  // the WRONG object's hash, and the mismatches look like real corruption.
  it('does not shift the pairing when an entry has no ETag', () => {
    const result = parseListObjectsV2(
      listing(
        '<Contents><Key>a/1.jpg</Key></Contents>' +
          '<Contents><Key>b/2.jpg</Key><ETag>&quot;bbb&quot;</ETag></Contents>',
      ),
    )
    expect(result.etags['b/2.jpg']).toBe('bbb')
    expect(result.etags['a/1.jpg']).toBeUndefined()
  })
})

describe('decodeXmlEntities', () => {
  it('handles all five entities', () => {
    expect(decodeXmlEntities('&lt;a&gt; &quot;b&quot; &apos;c&apos; &amp;')).toBe(`<a> "b" 'c' &`)
  })

  // ⚠️ &amp; LAST, or `&amp;lt;` — a literal "&lt;" in a key — decodes twice
  // and comes back as "<", which is a different key from the one R2 holds.
  it('does not double-decode', () => {
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;')
  })
})
