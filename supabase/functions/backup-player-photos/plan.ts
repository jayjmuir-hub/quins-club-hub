// The decisions the player-photo mirror makes, with none of the I/O.
//
// !! THIS FILE HAS NO IMPORTS AND MUST NEVER GAIN ONE. It is loaded by TWO
// runtimes: the Deno edge function next to it (index.ts) and vitest, through
// tests/photo-backup-plan.test.js. Any `npm:`/`jsr:` specifier would break the
// test, and any node/deno builtin would break one runtime or the other.
//
// WHY IT EXISTS AT ALL. RESTORE.md records that a Deno edge function is not a
// module the suite can import, so the four functions already deployed have no
// vitest coverage and can only be checked live. That is survivable for an email
// - the in-app queue is the record and the mail is a prompt to go and look.
// It is NOT survivable for a backup, where the whole product is a claim that
// something was copied. So the one rule this feature turns on - APPEND ONLY -
// lives here, where a test can fail on it.

/** An object key as `player-photos` writes them: `<player_id>/<timestamp>.<ext>`. */
const PLAYER_PHOTO_KEY = /^[0-9a-f-]{36}\/\d+\.(jpg|jpeg|png|webp)$/i

/**
 * Does this key have the shape src/data/photos.js writes?
 *
 * !! REPORTING ONLY - NOTHING SKIPS AN OBJECT ON THE STRENGTH OF THIS. A backup
 * that quietly declines to copy anything it does not recognise is a backup with
 * a hole in it shaped exactly like the thing nobody predicted. The run log
 * counts these so an unexpected shape is visible; every one of them is still
 * copied.
 */
export function isPlayerPhotoKey(key: string): boolean {
  return PLAYER_PHOTO_KEY.test(key)
}

/**
 * Which source objects are not yet in the backup.
 *
 * !! THIS MODULE CANNOT EXPRESS A DELETION, AND THAT IS THE DESIGN. There is no
 * objectsToDelete(), no `prune` flag and no third return value - so there is no
 * line anyone can flip later that turns the mirror into a faithful replica.
 *
 * A mirror that replicates deletions is no protection against the most likely
 * thing that will go wrong, which is a deletion. In this app a head shot is
 * destroyed by REPLACEMENT: uploadPlayerPhoto writes a NEW key
 * (`<player_id>/<Date.now()>.<ext>`) and deletePlayerPhoto then removes the old
 * one, best-effort. So the old key vanishes from `player-photos` and stays in
 * the backup forever, which is the whole feature.
 *
 * The cost is stated plainly in claude/plans/2026-08-13-player-photo-backup.md:
 * the backup accumulates photographs of children who have left the club. That
 * is a retention question for Jay, not something this function decides.
 *
 * Result is sorted and de-duplicated so a capped run is deterministic - the
 * same backlog produces the same first slice on every attempt, rather than a
 * random subset that could starve one key indefinitely.
 */
export function objectsToCopy(
  sourceKeys: Iterable<string>,
  backupKeys: Iterable<string>,
): string[] {
  const held = new Set<string>()
  for (const key of backupKeys) if (key) held.add(key)

  const missing = new Set<string>()
  for (const key of sourceKeys) if (key && !held.has(key)) missing.add(key)

  return [...missing].sort()
}

/** The five entities an S3 listing may escape a key with. */
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Last, or `&amp;lt;` would decode twice and produce `<`.
    .replace(/&amp;/g, '&')
}

export interface Listing {
  keys: string[]
  /** key -> ETag, quotes stripped. See compareEtags. */
  etags: Record<string, string>
  truncated: boolean
  nextToken: string | null
}

/**
 * Keys whose backup copy is NOT byte-identical to the source.
 *
 * !! WHY AN ETag COMPARISON IS PROOF AND A SIZE COMPARISON IS NOT. Both R2 and
 * Supabase Storage report an ETag that, for a single-part upload, IS the MD5 of
 * the object body. Two files of identical length are routinely different files;
 * two files with the same MD5 are not, for any cause this backup can plausibly
 * suffer - a truncated transfer, a re-encode, the wrong object copied under the
 * right key.
 *
 * !! A MISSING ETag ON EITHER SIDE IS REPORTED AS A MISMATCH, NOT SKIPPED. "We
 * could not check" and "we checked and it matched" must never collapse into the
 * same green number - that is the whole failure mode this feature exists to
 * avoid, one level up.
 *
 * !! MULTIPART UPLOADS BREAK THIS AND THAT IS ACCEPTED. An object assembled from
 * parts gets an ETag of the form `<hash>-<partcount>`, which is not the MD5 of
 * the body. Player photographs are resized to tens of kilobytes before upload
 * (src/lib/imageResize.js), so nothing here is remotely near a multipart
 * threshold. If that ever changes, this reports a mismatch rather than a false
 * pass, which is the correct direction to fail in.
 */
export function mismatchedEtags(
  sourceEtags: Record<string, string>,
  backupEtags: Record<string, string>,
): string[] {
  const bad: string[] = []
  for (const key of Object.keys(sourceEtags).sort()) {
    const source = normaliseEtag(sourceEtags[key])
    const backup = normaliseEtag(backupEtags[key])
    // Not in the backup yet is not a mismatch - it is work still to do, and
    // objectsToCopy already reports it.
    if (backup === '') continue
    if (source === '' || source !== backup) bad.push(key)
  }
  return bad
}

/** Strip the quotes S3 wraps an ETag in, and lower-case the hex. */
export function normaliseEtag(value: string | undefined | null): string {
  if (!value) return ''
  // !! TRIM FIRST, THEN STRIP QUOTES. The other order leaves the quotes in place
  // whenever there is surrounding whitespace, because they are no longer at the
  // string boundary - and a quoted hash never equals an unquoted one, so EVERY
  // object would report as corrupted. Caught by a test before this ever ran.
  return value.trim().replace(/^"+|"+$/g, '').trim().toLowerCase()
}

/**
 * Reads the keys out of an S3 ListObjectsV2 response.
 *
 * !! A REGEX AND NOT AN XML PARSER, DELIBERATELY. The alternative is a
 * third-party DOM parser, which this file is not allowed to import (see the
 * header) and which the other four edge functions manage without. The risk a
 * real parser would remove is a key containing markup, and decodeXmlEntities
 * covers that - `&` and `<` arrive escaped and come back out intact.
 *
 * !! TRUNCATION IS RETURNED, NEVER SWALLOWED. A listing that stops at 1000 keys
 * and reports itself as complete makes the backup think R2 is missing objects
 * it already holds. That direction is merely wasteful. The caller still MUST
 * fail loudly on `truncated` without a `nextToken`, because a listing that
 * cannot be continued is a listing whose remainder is unknown, and an unknown
 * remainder must never be reported as a clean run.
 */
export function parseListObjectsV2(xml: string): Listing {
  const keys: string[] = []
  const etags: Record<string, string> = {}

  // !! PER <Contents> BLOCK, NOT TWO INDEPENDENT SWEEPS. Scanning all the <Key>
  // elements and all the <ETag> elements separately and zipping them by index
  // would pair them correctly right up until one entry lacks an ETag, at which
  // point every subsequent photograph is checked against the WRONG object's
  // hash - and the mismatches would look like real corruption.
  for (const block of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = /<Key>([\s\S]*?)<\/Key>/.exec(block[1])
    if (!key) continue
    const name = decodeXmlEntities(key[1])
    keys.push(name)

    const etag = /<ETag>([\s\S]*?)<\/ETag>/.exec(block[1])
    if (etag) etags[name] = normaliseEtag(decodeXmlEntities(etag[1]))
  }

  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml)
  const token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)

  return {
    keys,
    etags,
    truncated,
    nextToken: token ? decodeXmlEntities(token[1]) : null,
  }
}
