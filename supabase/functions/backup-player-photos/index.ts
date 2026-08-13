// Mirror `player-photos` into a private Cloudflare R2 bucket. Append only.
//
// THE GAP THIS CLOSES: the photographs of children are the only unrecoverable
// thing in the club. The database restore was drilled on 13 Aug 2026 and works;
// it also proved that storage objects are NOT in the Supabase backup at all,
// only the database's metadata about them. A restored club therefore has every
// player row pointing at an image that does not exist.
//
// Plan:    claude/plans/2026-08-13-player-photo-backup.md
// Runbook: claude/runbooks/player-photo-backup.md  (deploy, restore, drill)
// SQL:     db/migrations/20260813_photo_backup.sql
//
// !! MUST be deployed with verify_jwt: false. pg_cron calls this through pg_net
// with no user JWT, and with verification on the gateway rejects the call BEFORE
// this code runs — silently, because pg_net never reads the response. The flag
// lives only at deploy time; this repo has no Supabase CLI config, so it cannot
// be encoded here. RESTORE.md records the same trap for the two mail functions.
//
// !! IT IS THEREFORE PUBLICLY REACHABLE AND THE SHARED SECRET IS THE ONLY GATE.
// It FAILS CLOSED: unset secret means every request is refused.
//
// !! IT DELETES NOTHING, EVER — from either side. See plan.ts, which cannot
// express a deletion, and the reasoning there.
//
// !! WHAT THIS FUNCTION RUNNING DOES NOT PROVE. A green run means bytes were
// PUT and R2 answered 200. It does not mean a photograph can be got back. That
// claim belongs to the restore drill in the runbook, and this repo's own
// finding from the database drill is why the distinction is written here: the
// thing everyone predicted would fail restored cleanly, and reasoning is not
// evidence.

import { isPlayerPhotoKey, objectsToCopy, parseListObjectsV2 } from './plan.ts'
import { encodeKeyPath, rfc3986, sha256Hex, signRequest } from './sigv4.ts'

// !! REUSES THE APPROVAL SECRET DELIBERATELY, exactly as notify-access-request
// does. Same trust domain, same caller (Postgres), and a second secret is a
// second thing to rotate and forget — RESTORE.md's reasoning, unchanged.
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// R2, S3-compatible. The region is the literal string "auto" for every R2 bucket.
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? ''
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? ''
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? ''
const R2_BUCKET = Deno.env.get('R2_BUCKET') ?? ''
const R2_REGION = 'auto'
const R2_SERVICE = 's3'

/** The bucket being mirrored. `social-ideas` is a separate decision, not a flag flip. */
const SOURCE_BUCKET = 'player-photos'

// TWO CAPS, AND BOTH ARE REPORTED. A run that copies its maximum and stops must
// never read as a run that finished the job — `more_to_do` on the run row is
// what says so. "No silent caps" is a house rule.
const MAX_COPIES_PER_RUN = 250
// Supabase kills a function well before this; stopping ourselves means the run
// row gets written and says what was left, instead of the row sitting with a
// null finished_at and nobody knowing how far it got.
const COPY_BUDGET_MS = 100_000

const encoder = new TextEncoder()

// !! CONSTANT TIME — a plain === on a secret leaks its length and, in
// principle, its prefix through timing.
function timingSafeEqual(a: string, b: string): boolean {
  const ba = encoder.encode(a)
  const bb = encoder.encode(b)
  if (ba.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ba.length; i += 1) diff |= ba[i] ^ bb[i]
  return diff === 0
}

interface R2Request {
  method: string
  /** Path after the host, starting with `/`, already key-encoded. */
  path: string
  query?: Record<string, string>
  body?: Uint8Array
  contentType?: string
}

async function r2Fetch(request: R2Request): Promise<Response> {
  const signed = await signRequest({
    method: request.method,
    path: request.path,
    query: request.query,
    headers: request.contentType ? { 'content-type': request.contentType } : {},
    payloadHash: await sha256Hex(request.body ?? ''),
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: R2_REGION,
    service: R2_SERVICE,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    now: new Date(),
  })

  return await fetch(signed.url, {
    method: request.method,
    headers: signed.headers,
    body: request.body ? (request.body as unknown as BodyInit) : undefined,
  })
}

/** Every key R2 already holds, following continuation tokens to the end. */
async function listBackupKeys(): Promise<string[]> {
  const keys: string[] = []
  let token: string | null = null
  // 100 pages × 1000 keys. A ceiling far above the club's plausible size, so it
  // is a runaway guard and not a limit — and it THROWS rather than returning a
  // short list, because a short list would silently re-copy everything.
  for (let page = 0; page < 100; page += 1) {
    const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' }
    if (token) query['continuation-token'] = token

    const response = await r2Fetch({ method: 'GET', path: `/${rfc3986(R2_BUCKET)}`, query })
    const text = await response.text()
    if (!response.ok) {
      //   403 -> wrong token, or a token without Object Read on this bucket
      //   404 -> the bucket name is wrong; R2 does not create it for you
      throw new Error(`R2 list failed (${response.status}): ${text.slice(0, 300)}`)
    }

    const listing = parseListObjectsV2(text)
    keys.push(...listing.keys)

    if (!listing.truncated) return keys
    if (!listing.nextToken) {
      // !! A listing that says there is more and cannot say where is a listing
      // whose remainder is UNKNOWN. Reporting the run clean here would state
      // that objects are backed up on the strength of a page never read.
      throw new Error('R2 reported a truncated listing with no continuation token')
    }
    token = listing.nextToken
  }
  throw new Error('R2 listing did not terminate within 100 pages')
}

async function supabaseJson(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`db call failed (${response.status}) on ${path}: ${text}`)
  return text ? JSON.parse(text) : null
}

/** Every key in the source bucket, keyset-paginated through the SQL helper. */
async function listSourceKeys(): Promise<string[]> {
  const keys: string[] = []
  const pageSize = 1000
  let after = ''
  for (let page = 0; page < 100; page += 1) {
    const rows: Array<{ name: string }> = await supabaseJson('rpc/photo_backup_list_objects', {
      method: 'POST',
      body: JSON.stringify({ _bucket: SOURCE_BUCKET, _after: after, _limit: pageSize }),
    })
    for (const row of rows) keys.push(row.name)
    if (rows.length < pageSize) return keys
    after = rows[rows.length - 1].name
  }
  throw new Error('source listing did not terminate within 100 pages')
}

/** Download one object with the service role, which bypasses the storage policies. */
async function readSourceObject(key: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${SOURCE_BUCKET}/${encodeKeyPath(key)}`,
    { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } },
  )
  if (!response.ok) {
    throw new Error(`read ${key} failed (${response.status}): ${(await response.text()).slice(0, 200)}`)
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  }
}

async function writeBackupObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const response = await r2Fetch({
    method: 'PUT',
    path: `/${rfc3986(R2_BUCKET)}/${encodeKeyPath(key)}`,
    body: bytes,
    contentType,
  })
  const text = await response.text() // also drains the body for connection reuse
  if (!response.ok) {
    throw new Error(`R2 put ${key} failed (${response.status}): ${text.slice(0, 300)}`)
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is not set - refusing every request.')
    return new Response('not configured', { status: 503 })
  }
  if (!timingSafeEqual(request.headers.get('x-approval-secret') ?? '', NOTIFY_SECRET)) {
    // Plain text, like the other four. JSON here would mean the gateway
    // answered and verify_jwt is wrongly ON.
    return new Response('unauthorised', { status: 401 })
  }

  // !! FAIL LOUDLY ON MISSING CONFIGURATION RATHER THAN RECORDING AN EMPTY RUN.
  // A run row saying "0 copied" against an unconfigured bucket is worse than no
  // row: it is a clean-looking record of nothing having happened.
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    console.error('R2 is not configured - refusing to run. See claude/runbooks/player-photo-backup.md')
    return new Response('not configured', { status: 503 })
  }

  // Body is optional: `{}` from cron, or overrides when a human is catching up
  // or rehearsing. Nothing in it can cause a deletion, because nothing can.
  let dryRun = false
  let maxCopies = MAX_COPIES_PER_RUN
  try {
    const body = await request.json()
    dryRun = body?.dry_run === true
    if (Number.isFinite(body?.max_copies)) maxCopies = Math.max(1, Math.min(2000, body.max_copies))
  } catch {
    // No body, or not JSON. Cron sends `{}`; a bare call is fine too.
  }

  // Open the run row FIRST. If this function is killed mid-run — a timeout, a
  // deploy, an R2 outage that hangs — the row survives with a null finished_at,
  // which is the only way anybody would know a run started and vanished.
  let runId: string | null = null
  try {
    if (!dryRun) {
      const [row] = await supabaseJson('photo_backup_runs', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ bucket: SOURCE_BUCKET }),
      })
      runId = row?.id ?? null
    }

    const [sourceKeys, backupKeys] = await Promise.all([listSourceKeys(), listBackupKeys()])
    const missing = objectsToCopy(sourceKeys, backupKeys)

    const summary = {
      dry_run: dryRun,
      source_objects: sourceKeys.length,
      backup_objects: backupKeys.length,
      to_copy: missing.length,
      copied: 0,
      failed: 0,
      unrecognised: sourceKeys.filter((k) => !isPlayerPhotoKey(k)).length,
      more_to_do: false,
      // !! THE DISCRIMINATING NUMBER, and the runbook's drill turns on it:
      // objects the backup holds that the source no longer does. Every one is a
      // photograph that would otherwise have been lost, and it is the figure a
      // mirror quietly syncing deletions could never produce. Zero is expected
      // until the first head shot is replaced; it is not a failure.
      only_in_backup: objectsToCopy(backupKeys, sourceKeys).length,
    }

    if (!dryRun) {
      const deadline = Date.now() + COPY_BUDGET_MS
      for (const key of missing) {
        if (summary.copied >= maxCopies || Date.now() > deadline) {
          summary.more_to_do = true
          break
        }
        try {
          const object = await readSourceObject(key)
          await writeBackupObject(key, object.bytes, object.contentType)
          summary.copied += 1
        } catch (error) {
          // One bad object must not abandon the rest of the run. The count goes
          // on the row; the reason goes in the log.
          summary.failed += 1
          console.error('copy failed:', key, error instanceof Error ? error.message : error)
        }
      }

      if (runId) {
        await supabaseJson(`photo_backup_runs?id=eq.${runId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            finished_at: new Date().toISOString(),
            source_objects: summary.source_objects,
            backup_objects: summary.backup_objects,
            copied: summary.copied,
            failed: summary.failed,
            unrecognised: summary.unrecognised,
            more_to_do: summary.more_to_do,
          }),
        })
      }
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('backup-player-photos failed:', message)
    if (runId) {
      // Best effort: if the database is the thing that broke, this fails too and
      // the row keeps its null finished_at, which still reads as "did not finish".
      try {
        await supabaseJson(`photo_backup_runs?id=eq.${runId}`, {
          method: 'PATCH',
          body: JSON.stringify({ finished_at: new Date().toISOString(), error: message.slice(0, 1000) }),
        })
      } catch { /* ignore */ }
    }
    return new Response('error', { status: 500 })
  }
})
