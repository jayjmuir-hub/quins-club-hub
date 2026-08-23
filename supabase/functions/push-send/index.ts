// Sends a real browser/OS push notification — not an email.
//
// SIX triggers, ONE function:
//   { feedback_id }     an admin replied to somebody's report
//                       (AFTER UPDATE on public.feedback, when status or
//                        admin_note changes)
//   { announcement_id } somebody posted a notice
//                       (AFTER INSERT on public.announcements, 19 Aug 2026)
//   { squad_push }      a fixture was added, changed or cancelled
//                       (STATEMENT-level triggers on public.events, 19 Aug 2026)
//   { availability_nudge }
//                       a match is close and somebody has not said whether
//                       their child is coming
//                       (pg_cron -> private.send_availability_nudges,
//                        19 Aug 2026)
//   { approval_membership_id }
//                       somebody is waiting to be approved
//                       (AFTER INSERT on public.memberships when pending,
//                        19 Aug 2026)
//   { message_id }      squad staff posted in the squad chat
//                       (AFTER INSERT on public.messages, staff top-level
//                        posts only — the trigger decides, 23 Aug 2026)
//
// ⚠️ `squad_push` AND `availability_nudge` ARRIVE FULLY FORMED — title, body,
// tag and all — WHICH THE OTHER THREE DO NOT, AND A CANCELLATION IS WHY. By the
// time this function runs, a cancelled fixture no longer exists; there is
// nothing left to read. So those triggers build the text and this only
// resolves the audience and encrypts.
//
// ⚠️ THE COUNT IN THE LINE ABOVE SAID "TWO" WHILE THREE WERE LISTED, from
// 19 Aug 2026 until the fifth was added the same day. The sixth (23 Aug)
// changed the number. If you add a seventh, change it again — a header
// nobody maintains is worse than no header.
//
// ⚠️ ONE FUNCTION RATHER THAN TWO, AND THE REASON IS THE CRYPTO. A second
// function would mean a SECOND COPY of hand-rolled ECDH, HKDF, AES-128-GCM and
// ECDSA — the last thing in this codebase that should exist twice. Everything
// below the payload is shared; only the title, body, url and audience differ.
//
// Design: claude/plans/2026-08-18-push-notifications.md and
// claude/plans/2026-08-19-notifications-v2.md.
//
// == WHY THIS EXISTS AT ALL ==
//
// Jay, 18 Aug 2026, on the reply itself: "keep everything in one place
// instead of emails" — no second email when an admin answers. That is a real
// gap: nothing currently tells a reporter their report has moved except
// opening the app and checking. Jay asked for push notifications directly,
// then corrected the first framing of it: "I don't want more emails, I just
// want app push notifications." This is that — a different protocol
// entirely, not a second email under a different name.
//
// == NO THIRD-PARTY PUSH LIBRARY, ON PURPOSE ==
//
// Every primitive here (ECDH, HKDF via HMAC-SHA256, AES-128-GCM, ECDSA) is a
// native Deno/Web Crypto operation. send-email/index.ts sets the precedent
// for this codebase: it hand-rolls Standard Webhooks HMAC verification rather
// than importing a library, reasoning "an unaudited import in the one place
// that decides whether to trust a caller is a poor trade." The same
// reasoning applies to a function that holds the private key identifying
// this club to every push service on earth.
//
// The protocol implemented below is RFC 8291 (message encryption,
// "aes128gcm") + RFC 8292 (VAPID). Verified twice before being trusted:
//   1. A Node-side round trip (encrypt as this function would, decrypt as a
//      browser receiving it would, using only crypto.subtle both sides)
//      before this file was written.
//   2. Smoke-tested LIVE against this deployed function, 18 Aug 2026, with a
//      disposable club/report/subscription and a real (but throwaway) P-256
//      key pair as the "subscriber" — first with an invalid p256dh, which
//      correctly threw "Unexpected error decoding private key" rather than
//      silently sending garbage; then with a real one, which built the VAPID
//      JWT, encrypted the payload, POSTed to a public 410-always endpoint,
//      and deleted the subscription row on the 410 — all logged and
//      confirmed, then the fixture removed.
// Neither proves interop with a REAL push service decrypting in a REAL
// browser — that is the one thing only an actual subscribed device can show.
//
// == THE PRIVATE KEY LIVES IN VAULT, NOT IN AN EDGE FUNCTION SECRET ==
//
// Every other secret an Edge Function in this project reads is set as a
// Function secret via the dashboard or CLI. The VAPID private key instead
// comes from public.get_push_vapid_private_key() — a SECURITY DEFINER
// function granted to service_role ALONE — because Vault is already this
// project's one place secrets live, and adding a second secret store for one
// key is a second thing to remember to rotate together. See that function's
// migration for the full reasoning.
//
// == SECURITY ==
//
// !! MUST be deployed with verify_jwt: false — Postgres calls it with no
// user JWT, exactly like notify-feedback and notify-approval.
//
// !! THE REQUEST BODY IS NOT TRUSTED FOR CONTENT. The caller supplies one
// feedback id; the notification text is built here from a service-role read,
// the same shape notify-feedback already uses.
//
// !! A DEAD SUBSCRIPTION DELETES ITSELF. A push service answers 404 or 410
// when an endpoint no longer exists — the browser was uninstalled, storage
// was cleared, permission was revoked at the OS level. Rather than a separate
// sweep job, the send loop deletes that row the moment it learns the
// endpoint is dead. RLS does not apply here: this runs with the service role.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const NOTIFY_SECRET = Deno.env.get('APPROVAL_NOTIFY_SECRET') ?? ''
const APP_URL = Deno.env.get('APP_URL') ?? 'https://adhquins-clubhub.com'

// Not a secret — VAPID public keys are designed to be public, the same value
// is committed as a plain constant in src/lib/push.js. Kept in sync by hand;
// there are only the two places, and changing one without the other makes
// every subscribe attempt fail loudly (a key mismatch the browser rejects),
// not silently.
const VAPID_PUBLIC_KEY = 'BIk1aNY5eXSyvkXrOTVPcSZZypmVXWsXKSqGH5q5TxhWm4kJ4M1oVhhnInX-eniqENr3N6HI23CkGkiHQVEMJGI'
const VAPID_SUBJECT = 'mailto:admin@adhquins-clubhub.com'

/* ---------------- base64url ---------------- */

function b64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// !! CONSTANT TIME, same as notify-feedback and send-email.
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

/* ---------------- VAPID (RFC 8292) ---------------- */

async function importVapidSigningKey(privateKeyB64url: string): Promise<CryptoKey> {
  const rawPublic = b64urlDecode(VAPID_PUBLIC_KEY)
  if (rawPublic.length !== 65 || rawPublic[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY is not a valid uncompressed P-256 point')
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(rawPublic.slice(1, 33)),
    y: b64urlEncode(rawPublic.slice(33, 65)),
    d: privateKeyB64url,
    ext: true,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

/**
 * A short-lived JWT authorising this server to push to `audience` — the push
 * SERVICE's origin (e.g. https://fcm.googleapis.com), not the subscriber's
 * full endpoint URL. Web Crypto's ECDSA signature is already raw r||s
 * (IEEE P1363), which is exactly the JWS ES256 wire format — unlike Node's
 * classic crypto.sign(), no DER-to-raw conversion is needed here.
 */
async function vapidJwt(signingKey: CryptoKey, audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud: audience,
    // 12 hours: comfortably under RFC 8292's implied ceiling (push services
    // commonly reject anything over 24h) and far longer than this function
    // ever runs for.
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  }
  const signingInput =
    `${b64urlEncode(new TextEncoder().encode(JSON.stringify(header)))}.` +
    `${b64urlEncode(new TextEncoder().encode(JSON.stringify(claims)))}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    new TextEncoder().encode(signingInput),
  )
  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`
}

/* ---------------- RFC 8291 message encryption (aes128gcm) ---------------- */

async function hmacSha256(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
}

/**
 * One-block HKDF-Expand (RFC 5869): T(1) = HMAC(PRK, info || 0x01). Every
 * length this function is asked for (32, 16, 12 bytes) fits inside a single
 * SHA-256 block, so this is the whole algorithm for this use, not a
 * shortcut taken against it.
 */
async function hkdfExpandOneBlock(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])))
  return t.slice(0, length)
}

function importEcdhPublicKey(rawPoint: Uint8Array): Promise<CryptoKey> {
  if (rawPoint.length !== 65 || rawPoint[0] !== 0x04) {
    throw new Error('not a valid uncompressed P-256 point')
  }
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(rawPoint.slice(1, 33)),
    y: b64urlEncode(rawPoint.slice(33, 65)),
    ext: true,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

/**
 * Encrypts `plaintext` for one subscriber, per RFC 8291. Returns the single
 * aes128gcm record this app ever needs to send: a fresh ephemeral key pair,
 * one HKDF derivation chained through the subscriber's auth secret and a
 * random salt, one AES-128-GCM record. A push message is small (a title and
 * a body), always well under the ~4KB single-record ceiling, so there is no
 * multi-record case to implement.
 */
async function encryptPushPayload(
  plaintext: string,
  subscriberPublicKeyB64url: string,
  subscriberAuthB64url: string,
): Promise<Uint8Array> {
  const uaPublicRaw = b64urlDecode(subscriberPublicKeyB64url)
  const uaAuth = b64urlDecode(subscriberAuthB64url)
  const uaPublicKey = await importEcdhPublicKey(uaPublicRaw)

  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asJwk = await crypto.subtle.exportKey('jwk', asKeyPair.privateKey) as JsonWebKey
  const asPublicRaw = concatBytes(
    new Uint8Array([0x04]),
    b64urlDecode(asJwk.x!),
    b64urlDecode(asJwk.y!),
  )

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256),
  )

  // RFC 8291 §3.3-3.4: PRK_key is HMAC-SHA256 keyed on the subscriber's OWN
  // auth secret, over the ECDH shared secret — the auth secret is what stops
  // anyone who merely learns the ECDH secret (e.g. by observing the public
  // keys) from also being able to derive the content-encryption key.
  const authInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    uaPublicRaw,
    asPublicRaw,
  )
  const prkKey = await hmacSha256(uaAuth, ecdhSecret)
  const ikm = await hkdfExpandOneBlock(prkKey, authInfo, 32)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmacSha256(salt, ikm)
  const cek = await hkdfExpandOneBlock(prk, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdfExpandOneBlock(prk, new TextEncoder().encode('Content-Encoding: nonce\0'), 12)

  // RFC 8188 padding: a single (and therefore LAST) record ends with
  // delimiter byte 0x02. No further padding is added — the notification
  // payload is short text, not something whose exact byte length is worth
  // hiding from a network observer.
  const padded = concatBytes(new TextEncoder().encode(plaintext), new Uint8Array([2]))

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded),
  )

  // RFC 8188 record header: salt(16) || record-size(4, big-endian) ||
  // keyid-length(1) || keyid(65, our ephemeral public key). The record size
  // only has to be at least header+ciphertext for a single-record message;
  // 4096 is comfortably larger than anything this app ever sends.
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  const header = concatBytes(salt, recordSize, new Uint8Array([asPublicRaw.length]), asPublicRaw)

  return concatBytes(header, ciphertext)
}

/* ---------------- Supabase REST (service role) ---------------- */

async function db(path: string): Promise<any[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  if (!response.ok) {
    throw new Error(`db read failed (${response.status}) on ${path}: ${await response.text()}`)
  }
  return await response.json()
}

async function deleteSubscription(id: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  if (!response.ok) {
    console.error(`push-send: could not delete dead subscription ${id}: ${response.status}`)
  }
}

async function getVapidPrivateKey(): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_push_vapid_private_key`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  if (!response.ok) {
    throw new Error(`could not read the VAPID private key (${response.status}): ${await response.text()}`)
  }
  const key = await response.json()
  if (!key || typeof key !== 'string') throw new Error('push_vapid_private_key is not set in Vault')
  return key
}

/* ---------------- helpers ---------------- */

function escapeHtmlFree(value: unknown): string {
  // Notification text has no markup to escape — it renders as plain text in
  // the OS notification tray, never as HTML. Kept as a named pass-through
  // rather than inlining String(value ?? '') at each call site, so the
  // absence of escaping here reads as a decision, not an omission.
  return String(value ?? '')
}

/** `QCH-0041`. Must match feedbackRef() in src/data/feedback.js. */
function ref(n: unknown): string {
  return `QCH-${String(n ?? '').padStart(4, '0')}`
}

/**
 * Has this person switched this category off?
 *
 * ⚠️ ABSENCE MEANS ON. `notification_opt_outs` stores opt-OUTS, so a person
 * with no row wants everything — which is what makes "categories default to
 * on" true without a backfill. db/migrations/20260819_notice_push.sql.
 */
async function hasOptedOut(profileId: string, category: string): Promise<boolean> {
  const rows = await db(
    `notification_opt_outs?profile_id=eq.${encodeURIComponent(profileId)}` +
      `&category=eq.${encodeURIComponent(category)}&select=category`,
  )
  return rows.length > 0
}

/**
 * The subscriptions a NOTICE should go to.
 *
 * ⚠️ THE AUDIENCE IS DECIDED IN THE DATABASE, NOT HERE. This calls one
 * SECURITY DEFINER function and sends to whatever comes back. Who may be told
 * about a notice is a disclosure rule — it belongs beside the RLS policy it
 * deliberately narrows, not in a file that deploys separately. Splitting a
 * rule across two deploy targets is exactly how the deep-link bug survived on
 * 19 Aug: push-send and push-sw.js each held half of it.
 */
async function squadTargets(
  club: string, team: string, actor: string | null, category: string,
): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/squad_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _club: club, _team: team, _actor: actor, _category: category }),
  })
  if (!response.ok) {
    throw new Error(`squad_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

/**
 * The subscriptions one claimed batch of AVAILABILITY NUDGES should go to.
 *
 * ⚠️ KEYED ON THE BATCH, NOT ON "who has not answered yet". The scheduler
 * claims its people into `availability_nudges` BEFORE queueing this, so by now
 * the candidate query would return nobody — and sending to "everyone
 * unanswered" would re-buzz anybody an earlier run already nudged.
 * db/migrations/20260819_availability_nudge.sql owns that reasoning.
 */
async function availabilityTargets(eventId: string, batchId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/availability_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _event: eventId, _batch: batchId }),
  })
  if (!response.ok) {
    throw new Error(`availability_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

/**
 * The subscriptions an APPROVAL REQUEST should go to.
 *
 * ⚠️ THE SAME RULE THE EMAIL USES, HELD IN SQL — super admins plus that
 * squad's head coach and manager(s), never the requester, and only while the
 * row is still pending. db/migrations/20260819_approval_push.sql owns it, and
 * its header explains why that rule is currently written twice.
 */
async function approvalTargets(membershipId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/approval_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _membership: membershipId }),
  })
  if (!response.ok) {
    throw new Error(`approval_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

async function messageTargets(messageId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/message_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _message: messageId }),
  })
  if (!response.ok) {
    throw new Error(`message_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

async function noticeTargets(announcementId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/notice_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _announcement: announcementId }),
  })
  if (!response.ok) {
    throw new Error(`notice_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

interface Subscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

/** What one push is: who it goes to, and what it says. */
interface Job {
  title: string
  body: string
  url: string
  tag: string
  subscriptions: Subscription[]
}

/**
 * How each claimable role reads in a sentence.
 *
 * ⚠️ THE SAME THREE notify-approval USES, AND AN UNKNOWN ROLE FALLS BACK TO
 * "volunteer" RATHER THAN PRINTING THE RAW VALUE. 'admin' is deliberately
 * absent — it is never requestable (public.request_staff_role refuses it) —
 * and 'parent'/'player' always carry a player and take the other branch.
 */
const APPROVAL_ROLE_LABELS: Record<string, string> = {
  coach: 'coach',
  manager: 'team manager',
  medic: 'medic or physio',
}

const STATUS_WORD: Record<string, string> = {
  new: 'New',
  'in-progress': 'In progress',
  done: 'Done',
  wontfix: "Won't fix",
}

/* ---------------- handler ---------------- */

Deno.serve(async (request) => {
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is unset - refusing.')
    return new Response('not configured', { status: 503 })
  }

  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!timingSafeEqual(presented, NOTIFY_SECRET)) {
    return new Response('forbidden', { status: 403 })
  }

  let feedbackId = ''
  let announcementId = ''
  let messageId = ''
  let approvalMembershipId = ''
  let squad: Record<string, string> | null = null
  let nudge: Record<string, string> | null = null
  try {
    const payload = await request.json()
    feedbackId = String(payload?.feedback_id ?? '')
    announcementId = String(payload?.announcement_id ?? '')
    messageId = String(payload?.message_id ?? '')
    approvalMembershipId = String(payload?.approval_membership_id ?? '')
    squad = payload?.squad_push ?? null
    nudge = payload?.availability_nudge ?? null
  } catch {
    return new Response('bad request', { status: 400 })
  }
  // ⚠️ EXACTLY ONE. More than one would be a caller confused about what it is
  // asking for, and guessing which it meant is how the wrong people get
  // notified.
  if ((feedbackId ? 1 : 0) + (announcementId ? 1 : 0) + (squad ? 1 : 0)
      + (approvalMembershipId ? 1 : 0) + (nudge ? 1 : 0) + (messageId ? 1 : 0) !== 1) {
    return new Response('bad request', { status: 400 })
  }

  try {
    let job: Job

    if (feedbackId) {
      const rows = await db(
        `feedback?id=eq.${encodeURIComponent(feedbackId)}&select=ref,status,admin_note,submitted_by`,
      )
      const report = rows?.[0]
      if (!report) return new Response('not found', { status: 404 })

      // ⚠️ THE REPLY CATEGORY IS OPT-OUTABLE TOO, as of 19 Aug 2026. Absence
      // means on, so this changes nothing for anybody who has not chosen.
      if (await hasOptedOut(report.submitted_by, 'feedback_reply')) {
        return new Response('ok (opted out)', { status: 200 })
      }

      const subscriptions = await db(
        `push_subscriptions?profile_id=eq.${encodeURIComponent(report.submitted_by)}&select=id,endpoint,p256dh,auth`,
      )

      const reference = ref(report.ref)
      const statusWord = STATUS_WORD[report.status] ?? report.status
      job = {
        title: `Your report ${reference}`,
        body: report.admin_note
          ? escapeHtmlFree(report.admin_note)
          : `Now marked: ${statusWord}`,
        url: `${APP_URL}/my-reports`,
        tag: `feedback-${feedbackId}`,
        subscriptions,
      }
    } else if (squad) {
      if (!squad.club_id || !squad.team_id || !squad.title) {
        return new Response('bad request', { status: 400 })
      }
      job = {
        title: escapeHtmlFree(squad.title),
        body: escapeHtmlFree(squad.body).slice(0, 200),
        // ⚠️ A PATH, NOT A URL. The trigger names the screen; the origin is
        // this function's business. A caller that could set the whole url
        // could send somebody anywhere from a notification.
        url: `${APP_URL}${squad.path && squad.path.startsWith('/') ? squad.path : '/'}`,
        tag: escapeHtmlFree(squad.tag) || `squad-${squad.team_id}`,
        subscriptions: await squadTargets(
          squad.club_id, squad.team_id, squad.actor_id ?? null, squad.category || 'fixture',
        ),
      }
    } else if (nudge) {
      if (!nudge.event_id || !nudge.batch_id || !nudge.title) {
        return new Response('bad request', { status: 400 })
      }
      job = {
        title: escapeHtmlFree(nudge.title),
        body: escapeHtmlFree(nudge.body).slice(0, 200),
        // ⚠️ A PATH, NOT A URL — same rule as squad_push. A caller that could
        // set the whole url could send somebody anywhere from a notification.
        url: `${APP_URL}${nudge.path && nudge.path.startsWith('/') ? nudge.path : '/'}`,
        // Per MATCH, so a second nudge about the same fixture replaces the
        // first rather than stacking. It should never happen — the ledger is
        // what prevents it — but the tag means a bug in the ledger costs a
        // notification the tray collapses rather than one the family sees.
        tag: escapeHtmlFree(nudge.tag) || `availability-${nudge.event_id}`,
        subscriptions: await availabilityTargets(nudge.event_id, nudge.batch_id),
      }
    } else if (approvalMembershipId) {
      const rows = await db(
        `memberships?id=eq.${encodeURIComponent(approvalMembershipId)}` +
          '&select=status,role,profiles(full_name),players(full_name),teams(name)',
      )
      const ask = rows?.[0]
      if (!ask) return new Response('not found', { status: 404 })

      // ⚠️ THE SAME GUARD THE EMAIL MAKES, AND IT IS NOT BELT-AND-BRACES.
      // pg_net is asynchronous: an admin who approves within a few seconds
      // would otherwise be buzzed about a queue that is already empty.
      // approval_push_subscriptions also filters on this, so the audience
      // would be empty anyway — this returns the clearer body instead of
      // 'ok (no subscriptions)', which is the line that tells the two cases
      // apart when reading net._http_response afterwards.
      if (ask.status !== 'pending') {
        return new Response('ok (no longer pending)', { status: 200 })
      }

      const parentName = ask?.profiles?.full_name ?? 'Somebody'
      const playerName = ask?.players?.full_name ?? null
      const teamName = ask?.teams?.name ?? 'the club'
      // ⚠️ AN UNKNOWN ROLE READS AS "volunteer" RATHER THAN PRINTING THE RAW
      // VALUE — copied deliberately from notify-approval, and it matters more
      // here than it does there. The role is chosen by the person asking, and
      // this string lands on a lock screen.
      const roleLabel = APPROVAL_ROLE_LABELS[ask.role as string] ?? 'volunteer'

      job = {
        title: 'Waiting to be approved',
        // The same sentence the email sends, so the two never describe the
        // same request differently. supabase/functions/notify-approval.
        body: escapeHtmlFree(
          playerName
            ? `${parentName} has registered ${playerName} in ${teamName}.`
            : `${parentName} says they are a ${roleLabel} for ${teamName}.`,
        ).slice(0, 200),
        // ⚠️ THE CANONICAL PATH, NOT `/accounts`. That one still exists but is
        // only a <Navigate> redirect to this (src/App.jsx). A notification is
        // the worst place to spend a redirect: the tap already costs a cold
        // start, and the deep-link fix of 19 Aug is what makes it land at all.
        url: `${APP_URL}/admin/accounts`,
        // Per REQUEST, so two people waiting are two notifications rather
        // than one replacing the other — unlike a notice, where repeats are
        // about the same thing.
        tag: `approval-${approvalMembershipId}`,
        subscriptions: await approvalTargets(approvalMembershipId),
      }
    } else if (messageId) {
      // ⚠️ THE SQUAD NAME AND THE FIRST LINE — NEVER A CHILD'S NAME BY
      // CONSTRUCTION. The body is the coach's responsibility; the shape is
      // ours. A club-wide post has no squad and says so.
      const rows = await db(
        `messages?id=eq.${encodeURIComponent(messageId)}` +
          '&select=body,team_id,parent_id,channel,conversation_id,author_role,mentions,deleted_at,teams(name),author:profiles!messages_author_id_fkey(full_name)',
      )
      const message = rows?.[0]
      if (!message || message.deleted_at) return new Response('not found', { status: 404 })

      // Phase 3 (23 Aug 2026): a direct message. The title is the sender;
      // the body is the first line; the tray collapses per conversation.
      // ⚠️ NO SQUAD NAME AND NO OTHER NAME — the payload names the sender
      // only, which the recipient already knows. The database decided the
      // one recipient (message_push_subscriptions, category direct_messages).
      if (message.channel === 'dm') {
        const sender = escapeHtmlFree(message.author?.full_name ?? 'Somebody')
        job = {
          title: sender,
          body: escapeHtmlFree(message.body).slice(0, 200),
          url: `${APP_URL}/chat/dm/${encodeURIComponent(message.conversation_id)}`,
          tag: `dm-${message.conversation_id}`,
          subscriptions: await messageTargets(messageId),
        }
      } else {
      const squadName = message.teams?.name ?? 'Whole club'
      // Phase 2 (23 Aug 2026): a mention reaches only the mentioned, and the
      // tray should say so. A staff top-level post still reads as the
      // channel. The database decided WHO (message_push_subscriptions); this
      // only decides the words.
      const staffPost = !message.parent_id
        && ['admin', 'coach', 'manager', 'medic'].includes(String(message.author_role ?? ''))
      const mentioned = Array.isArray(message.mentions) && message.mentions.length > 0
      const who = escapeHtmlFree(message.author?.full_name ?? 'Somebody')
      job = {
        title: !staffPost && mentioned
          ? `${who} mentioned you · ${escapeHtmlFree(squadName)}`
          : message.channel === 'staff'
            ? `${escapeHtmlFree(squadName)} staff`
            : `${escapeHtmlFree(squadName)} chat`,
        body: escapeHtmlFree(message.body).slice(0, 200),
        url: message.team_id
          ? `${APP_URL}/chat/${encodeURIComponent(message.team_id)}${message.channel === 'staff' ? '?channel=staff' : ''}`
          : `${APP_URL}/chat/club`,
        // Per SQUAD, not per message: three posts in a minute collapse into
        // the latest one rather than stacking. A chat is the one place where
        // "newest replaces previous" is what the tray should do.
        tag: `chat-${message.channel === 'staff' ? 'staff-' : ''}${message.team_id ?? 'club'}`,
        subscriptions: await messageTargets(messageId),
      }
      }
    } else {
      const rows = await db(
        `announcements?id=eq.${encodeURIComponent(announcementId)}&select=title,body`,
      )
      const notice = rows?.[0]
      if (!notice) return new Response('not found', { status: 404 })

      job = {
        title: escapeHtmlFree(notice.title),
        // ⚠️ TRIMMED, BECAUSE A NOTIFICATION IS NOT THE NOTICE. Android and
        // iOS both truncate a long body in the tray anyway; cutting it here
        // means the encrypted payload stays comfortably inside the single
        // aes128gcm record this function implements, rather than relying on
        // nobody ever writing a long notice.
        body: escapeHtmlFree(notice.body).slice(0, 200),
        url: `${APP_URL}/notices`,
        tag: `notice-${announcementId}`,
        // ⚠️ ONE CALL, AND THE DATABASE DECIDES. Author exclusion, squad
        // scoping, opt-outs and expiry all live in
        // public.notice_push_subscriptions.
        subscriptions: await noticeTargets(announcementId),
      }
    }

    if (job.subscriptions.length === 0) {
      // Not an error - most people have never turned the toggle on.
      return new Response('ok (no subscriptions)', { status: 200 })
    }

    const payloadJson = JSON.stringify({
      title: job.title,
      body: job.body,
      // ⚠️ A REAL DESTINATION, NOT THE APP ROOT. It was `${APP_URL}/` until
      // 19 Aug 2026, when Jay tapped the club's first real push notification
      // and landed on whatever screen he already had open. Half the fix; the
      // other half is public/push-sw.js, which used to focus an open window
      // WITHOUT navigating it, so this url was read only when nothing was
      // open. Changing either one alone fixes nothing.
      // claude/plans/2026-08-19-notifications-v2.md.
      url: job.url,
      // Lets the service worker collapse several pushes about the SAME thing
      // into one notification instead of stacking a tray full of them - see
      // the `tag` handling in public/push-sw.js. Per report, or per notice.
      tag: job.tag,
    })

    const privateKey = await getVapidPrivateKey()
    const signingKey = await importVapidSigningKey(privateKey)

    for (const subscription of job.subscriptions) {
      try {
        const endpointUrl = new URL(subscription.endpoint)
        const audience = `${endpointUrl.protocol}//${endpointUrl.host}`
        const jwt = await vapidJwt(signingKey, audience)
        const encrypted = await encryptPushPayload(payloadJson, subscription.p256dh, subscription.auth)

        const response = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            TTL: '86400',
            Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: encrypted,
        })

        if (response.status === 404 || response.status === 410) {
          // The push service is telling us this endpoint will never work
          // again - the browser was uninstalled, storage was cleared, or the
          // OS-level permission was revoked. Self-cleaning: no separate sweep
          // job is needed for the ordinary case.
          await deleteSubscription(subscription.id)
        } else if (!response.ok) {
          console.error(
            `push-send: ${subscription.endpoint} answered ${response.status}: ${await response.text()}`,
          )
        }
      } catch (error) {
        // One bad subscription (a malformed endpoint URL, say) must not stop
        // this person's OTHER devices from being notified.
        console.error(
          `push-send: failed for subscription ${subscription.id}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('push-send:', error instanceof Error ? error.message : error)
    return new Response('error', { status: 500 })
  }
})
