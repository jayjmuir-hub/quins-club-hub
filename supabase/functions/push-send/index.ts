// Sends a real browser/OS push notification — not an email.
//
// SEVEN triggers, ONE function:
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
//   { access_request_id }
//                       somebody with no membership has asked to join
//                       (AFTER INSERT on public.access_requests when pending,
//                        2 Sep 2026 — db/migrations/20260902_access_request_push.sql)
//   { message_id }      squad staff posted in the squad chat
//                       (AFTER INSERT on public.messages, staff top-level
//                        posts only — the trigger decides, 23 Aug 2026)
//   { document_id }     somebody published a document to a squad
//                       (public.create_document with _notify => true —
//                        an RPC, not a trigger, 31 Aug 2026)
//   { training_suggestion_push: { outbox_id } }
//                       the performance director suggested sessions to a
//                       squad; its staff are told, one push per squad
//                       (private.send_training_suggestion_push from inside
//                        public.suggest_training, 2 Sep 2026 —
//                        db/migrations/20260902_training_suggestion_push.sql)
//
// ⚠️ NO TRIGGER'S TEXT ARRIVES IN THE BODY ANY MORE (Grok item 11, 30 Aug
// 2026 — 20260830_push_hardening.sql). `squad_push` used to arrive fully
// formed because a cancelled fixture no longer exists to read; the copy now
// travels through public.push_outbox (the sender snapshots the strings while
// the row still exists, this function loads them by id and CONSUMES the row —
// single-use, replay-inert). `availability_nudge` is re-derived here from
// event_id. So holding the shared secret is no longer enough to write
// lock-screen text; everything this function sends comes from the database.
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
// ⚠️ HASH BOTH SIDES, THEN COMPARE THE DIGESTS (Grok item 15, 30 Aug 2026).
// The old compare returned early on a length mismatch, which leaked the
// secret's LENGTH through response timing. Digests are fixed-size, so the
// comparison runs the same number of steps whatever was presented.
async function secretMatches(presented: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(presented)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const ua = new Uint8Array(a)
  const ub = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

// ⚠️ THE SAME ALLOWLIST private.push_endpoint_allowed ENFORCES AT REGISTRATION
// (Grok item 12, 20260830_push_hardening.sql) — belt and braces. This function
// POSTs signed requests wherever a subscription row points; a row that predates
// the SQL gate, or one written by any future path around it, must still never
// aim the runtime at an internal host.
function pushEndpointAllowed(endpoint: string): boolean {
  let u: URL
  try {
    u = new URL(endpoint)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const h = u.hostname
  return (
    h === 'fcm.googleapis.com' ||
    h === 'web.push.apple.com' ||
    h === 'updates.push.services.mozilla.com' ||
    h.endsWith('.notify.windows.com') ||
    h.endsWith('.google.com') ||
    h.endsWith('.push.apple.com')
  )
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

// Single-use outbox rows (Grok item 11): consumed the moment they are read,
// so a replayed request finds nothing to send.
async function deleteOutboxRow(id: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/push_outbox?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  })
  if (!response.ok) {
    console.error(`push-send: could not consume outbox row ${id}: ${response.status}`)
  }
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

/**
 * Voice notes ride the SAME bucket and the SAME extension-agnostic storage
 * policies as photos — an attachment is audio or image purely by its key's
 * extension. ⚠️ MIRRORS AUDIO_EXTENSIONS in src/data/chatMedia.js; see
 * messageBody() below for why the copy is unavoidable.
 */
const AUDIO_EXTENSIONS = new Set(['webm', 'm4a', 'mp4', 'aac', 'mp3', 'ogg'])

function isAudioKey(key: unknown): boolean {
  const ext = String(key ?? '').split('.').pop()?.toLowerCase()
  return ext ? AUDIO_EXTENSIONS.has(ext) : false
}

/**
 * The notification body for a chat message: the member's caption when there is
 * one, otherwise a stand-in naming what is attached.
 *
 * ⚠️ WITHOUT THIS A PHOTO-ONLY MESSAGE PUSHES A BLANK BODY. It shipped that
 * way, and albums (#605) made it the normal case rather than the rare one —
 * the whole point of dropping ten photos into a squad chat is that you often
 * type nothing. Every parent in the squad got a sender's name over empty space.
 *
 * ⚠️ NEVER THE FILENAME, though `attachments` carries one. `name` exists so a
 * DOCUMENT keeps its original filename, and a document named after the child it
 * concerns would put that child's name on every parent's lock screen. The
 * payload is required to carry no child's name BY CONSTRUCTION (see the comment
 * above the select). A COUNT keeps that property; a filename destroys it.
 *
 * ⚠️ MUST MATCH attachmentPreviewLabel() in src/data/chatMedia.js. That module
 * is browser JavaScript bundled by Vite; this is a standalone Deno function
 * deployed separately, and there is no shared build between them — the same
 * standing arrangement locationFor() has with venueLine() in the calendar
 * function. A parent reading "10 photos" in the app and "Photo" on their lock
 * screen is the drift this comment exists to prevent. Change both or neither.
 *
 * ⚠️ FALLS BACK TO attachment_path. A phone on a cached service-worker bundle
 * still writes only that column and cannot be forced to update; without this
 * arm its photo would push an empty body exactly as before.
 */
function messageBody(message: {
  body?: unknown
  attachments?: unknown
  attachment_path?: unknown
}): string {
  const caption = escapeHtmlFree(message.body).slice(0, 200)
  if (caption.trim()) return caption

  const list = Array.isArray(message.attachments) ? message.attachments : []
  if (list.length > 1) return `📷 ${list.length} photos`

  const only = list.length === 1
    ? (list[0] as { file?: unknown })?.file
    : message.attachment_path
  if (!only) return caption
  return isAudioKey(only) ? '🎤 Voice message' : '📷 Photo'
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
/** The subscriptions a RESULTS NUDGE goes to — public.results_push_subscriptions. */
async function resultsTargets(competitionId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/results_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _competition: competitionId }),
  })
  if (!response.ok) {
    throw new Error(`results_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

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

/**
 * The subscriptions a PLAIN ACCESS REQUEST should go to — active super
 * admins, never the requester, only while pending, minus `approval`
 * opt-outs. The same recipient rule notify-access-request emails to;
 * db/migrations/20260902_access_request_push.sql owns it in SQL.
 */
async function accessRequestTargets(requestId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/access_request_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _request: requestId }),
  })
  if (!response.ok) {
    throw new Error(`access_request_push_subscriptions failed (${response.status}): ${await response.text()}`)
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

/**
 * The subscriptions a new DOCUMENT should go to.
 *
 * ⚠️ THE SAME DIVISION OF LABOUR AS noticeTargets, AND FOR THE SAME REASON.
 * Club-wide vs targeted squads, the staff_only narrowing to coach/manager/medic,
 * the uploader's own exclusion, the `document` opt-out and the de-duplication of
 * somebody who staffs two targeted squads ALL live in
 * public.document_push_subscriptions (db/migrations/20260831_documents.sql).
 * Who may be told a document exists is a disclosure rule; it belongs beside the
 * RLS policy it narrows, not in a file that deploys separately.
 */
async function documentTargets(documentId: string): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/document_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _document: documentId }),
  })
  if (!response.ok) {
    throw new Error(`document_push_subscriptions failed (${response.status}): ${await response.text()}`)
  }
  return await response.json()
}

/**
 * The subscriptions a TRAINING SUGGESTION should go to: the squad's coaches,
 * managers and medics, never the director who pressed the button, minus the
 * `training` opt-outs. All of that lives in
 * public.training_suggestion_push_subscriptions, beside the read policy on
 * training_suggestions that it mirrors — a disclosure rule belongs in the
 * database, not in a file that deploys separately.
 */
async function trainingSuggestionTargets(team: string, actor: string | null): Promise<Subscription[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/training_suggestion_push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ _team: team, _actor: actor }),
  })
  if (!response.ok) {
    throw new Error(`training_suggestion_push_subscriptions failed (${response.status}): ${await response.text()}`)
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
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  if (!NOTIFY_SECRET) {
    console.error('APPROVAL_NOTIFY_SECRET is unset - refusing.')
    return new Response('not configured', { status: 503 })
  }

  const presented = request.headers.get('x-approval-secret') ?? ''
  if (!(await secretMatches(presented, NOTIFY_SECRET))) {
    return new Response('forbidden', { status: 403 })
  }

  let feedbackId = ''
  let announcementId = ''
  let messageId = ''
  let approvalMembershipId = ''
  let accessRequestId = ''
  let documentId = ''
  let squad: Record<string, string> | null = null
  let nudge: Record<string, string> | null = null
  let training: Record<string, string> | null = null
  // Monday results nudge (4 Sep 2026) — db/migrations/20260906_results_nudge.sql.
  let results: Record<string, string> | null = null
  try {
    const payload = await request.json()
    feedbackId = String(payload?.feedback_id ?? '')
    announcementId = String(payload?.announcement_id ?? '')
    messageId = String(payload?.message_id ?? '')
    approvalMembershipId = String(payload?.approval_membership_id ?? '')
    accessRequestId = String(payload?.access_request_id ?? '')
    documentId = String(payload?.document_id ?? '')
    squad = payload?.squad_push ?? null
    nudge = payload?.availability_nudge ?? null
    training = payload?.training_suggestion_push ?? null
    results = payload?.results_nudge ?? null
  } catch {
    return new Response('bad request', { status: 400 })
  }
  // ⚠️ EXACTLY ONE. More than one would be a caller confused about what it is
  // asking for, and guessing which it meant is how the wrong people get
  // notified.
  if ((feedbackId ? 1 : 0) + (announcementId ? 1 : 0) + (squad ? 1 : 0)
      + (approvalMembershipId ? 1 : 0) + (nudge ? 1 : 0) + (messageId ? 1 : 0)
      + (documentId ? 1 : 0) + (accessRequestId ? 1 : 0) + (training ? 1 : 0) + (results ? 1 : 0) !== 1) {
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
    } else if (training) {
      // ⚠️ THE SAME OUTBOX RULE AS squad_push BELOW: the request carries only
      // an id, the strings were rendered by the SECURITY DEFINER sender, and
      // the row is deleted before sending. What differs is the AUDIENCE —
      // the squad's STAFF, never the families, never the director who pressed
      // it — which public.training_suggestion_push_subscriptions decides
      // beside the policy it narrows (20260902_training_suggestion_push.sql).
      const outboxId = String(training.outbox_id ?? '')
      if (!outboxId) return new Response('bad request', { status: 400 })
      const rows = await db(
        `push_outbox?id=eq.${encodeURIComponent(outboxId)}&select=id,club_id,team_id,actor_id,category,title,body,path,tag`,
      )
      const out = rows?.[0]
      if (!out) return new Response('not found', { status: 404 })
      await deleteOutboxRow(out.id)
      job = {
        title: escapeHtmlFree(out.title),
        body: escapeHtmlFree(out.body).slice(0, 200),
        url: `${APP_URL}${out.path && out.path.startsWith('/') ? out.path : '/'}`,
        tag: escapeHtmlFree(out.tag ?? '') || `training-suggest-${out.team_id}`,
        subscriptions: await trainingSuggestionTargets(out.team_id, out.actor_id ?? null),
      }
    } else if (squad) {
      // ⚠️ THE COPY COMES FROM THE OUTBOX, NEVER THE BODY (Grok item 11,
      // 20260830_push_hardening.sql). The request carries only an id; the
      // rendered strings were written by the SECURITY DEFINER sender into
      // public.push_outbox, which members cannot touch. The row is deleted
      // before sending — single-use, so a replayed request notifies nobody.
      const outboxId = String(squad.outbox_id ?? '')
      if (!outboxId) return new Response('bad request', { status: 400 })
      const rows = await db(
        `push_outbox?id=eq.${encodeURIComponent(outboxId)}&select=id,club_id,team_id,actor_id,category,title,body,path,tag`,
      )
      const out = rows?.[0]
      if (!out) return new Response('not found', { status: 404 })
      await deleteOutboxRow(out.id)
      job = {
        title: escapeHtmlFree(out.title),
        body: escapeHtmlFree(out.body).slice(0, 200),
        // ⚠️ A PATH, NOT A URL — the outbox CHECK constraint enforces the
        // leading slash too; the origin stays this function's business.
        url: `${APP_URL}${out.path && out.path.startsWith('/') ? out.path : '/'}`,
        tag: escapeHtmlFree(out.tag ?? '') || `squad-${out.team_id}`,
        subscriptions: await squadTargets(
          out.club_id, out.team_id, out.actor_id ?? null, out.category || 'fixture',
        ),
      }
    } else if (results) {
      // The division's keepers and the super admins, minus `results`
      // opt-outs — public.results_push_subscriptions holds the rule. The
      // title, body and path are the database's; only the tag is pinned
      // here so a second Monday replaces the first in the tray.
      if (!results.competition_id) return new Response('bad request', { status: 400 })
      job = {
        title: escapeHtmlFree(results.title).slice(0, 80) || 'Results missing',
        body: escapeHtmlFree(results.body).slice(0, 200),
        url: `${APP_URL}${String(results.path || '/').startsWith('/') ? results.path || '/' : '/'}`,
        tag: `results-${results.competition_id}`,
        subscriptions: await resultsTargets(results.competition_id),
      }
    } else if (nudge) {
      // ⚠️ DERIVED FROM THE DATABASE, NOT THE BODY (Grok item 11). The event
      // still exists at nudge time, so title/body/tag are rebuilt here from
      // event_id — any text the request carried is ignored.
      if (!nudge.event_id || !nudge.batch_id) {
        return new Response('bad request', { status: 400 })
      }
      const rows = await db(
        `events?id=eq.${encodeURIComponent(nudge.event_id)}&select=id,title,opponent,starts_at,time_tbd,teams(name)`,
      )
      const ev = rows?.[0]
      if (!ev) return new Response('not found', { status: 404 })
      const squadName = ev?.teams?.name ?? null
      const starts = new Date(ev.starts_at)
      const dateParts = new Intl.DateTimeFormat('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Dubai',
      }).formatToParts(starts)
      const part = (type: string) =>
        dateParts.find((p) => p.type === type)?.value ?? ''
      const whenDate = `${part('weekday')} ${part('day')} ${part('month').slice(0, 3)}`
      const whenTime = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Dubai',
      }).format(starts)
      const whenish = ev.time_tbd ? `${whenDate}, time TBC` : `${whenDate}, ${whenTime}`
      const detail = ev.opponent ? `v ${ev.opponent}` : (ev.title || 'Match')
      job = {
        title: `Availability needed${squadName ? ` — ${squadName}` : ''}`,
        body: escapeHtmlFree(`${detail} · ${whenish}`).slice(0, 200),
        url: `${APP_URL}/schedule`,
        // Per MATCH, so a second nudge about the same fixture replaces the
        // first rather than stacking. It should never happen — the ledger is
        // what prevents it — but the tag means a bug in the ledger costs a
        // notification the tray collapses rather than one the family sees.
        tag: `availability-${ev.id}`,
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
        // ⚠️ `/approvals`, NOT `/admin/accounts` — WHERE THE EMAIL LINKS.
        // This said `/admin/accounts` until 2 Sep 2026, chosen as "the
        // canonical path, not the /accounts redirect" — reasoning that was
        // right about redirects and wrong about the audience. The audience
        // (approval_push_subscriptions) is super admins PLUS the squad's head
        // coach and managers, and /admin is gated on isAdmin() in
        // src/screens/AdminDashboard.jsx before any child renders. A team
        // manager tapped this and got "Not authorised" for a coach request
        // they are allowed to approve. /approvals mounts Accounts directly,
        // which self-gates: admins get the full screen, squad staff get their
        // queue. Still not a redirect, so the 19 Aug cold-start point holds.
        // tests/push-approval-link.test.js pins it.
        url: `${APP_URL}/approvals`,
        // Per REQUEST, so two people waiting are two notifications rather
        // than one replacing the other — unlike a notice, where repeats are
        // about the same thing.
        tag: `approval-${approvalMembershipId}`,
        subscriptions: await approvalTargets(approvalMembershipId),
      }
    } else if (accessRequestId) {
      // ⚠️ THE PROFILE EMBED NAMES ITS FK. access_requests has two foreign
      // keys to profiles (profile_id and decided_by), so a bare `profiles(...)`
      // is ambiguous and PostgREST refuses the whole query — the exact 500
      // that hid the access-request EMAIL for a day on 12 Aug 2026.
      const rows = await db(
        `access_requests?id=eq.${encodeURIComponent(accessRequestId)}` +
          '&select=status,requested_role,profiles!access_requests_profile_id_fkey(full_name),teams(name)',
      )
      const ask = rows?.[0]
      if (!ask) return new Response('not found', { status: 404 })

      // Same guard as the approval branch: pg_net is asynchronous, and an
      // admin who dismissed within seconds must not be buzzed about it.
      if (ask.status !== 'pending') {
        return new Response('ok (no longer pending)', { status: 200 })
      }

      const who = ask?.profiles?.full_name?.trim() || 'Somebody'
      const teamName = ask?.teams?.name ?? null
      // ⚠️ NEVER THE NOTE. It is the one field written by an account the
      // club has not admitted, and this string lands on a lock screen. The
      // email shows it, truncated, inside an authenticated inbox; a
      // notification tray is not that.
      const roleLabel = APPROVAL_ROLE_LABELS[ask.requested_role as string] ?? null

      job = {
        title: 'Somebody has asked to join',
        body: escapeHtmlFree(
          `${who} has asked for access` +
            (roleLabel ? ` as a ${roleLabel}` : '') +
            (teamName ? ` for ${teamName}` : '') +
            '.',
        ).slice(0, 200),
        // ⚠️ /admin/accounts, NOT /approvals. The audience is SUPER ADMINS
        // ONLY (access_request_push_subscriptions), who pass the isAdmin()
        // gate on /admin, and the waiting list lives on Accounts. The
        // approval push links to /approvals because ITS audience includes
        // squad staff who cannot open /admin; that reasoning does not apply
        // here. tests/push-access-request-link.test.js pins it.
        url: `${APP_URL}/admin/accounts`,
        // Per request: two people asking are two notifications.
        tag: `access-request-${accessRequestId}`,
        subscriptions: await accessRequestTargets(accessRequestId),
      }
    } else if (messageId) {
      // ⚠️ THE SQUAD NAME AND THE FIRST LINE — NEVER A CHILD'S NAME BY
      // CONSTRUCTION. The body is the coach's responsibility; the shape is
      // ours. A club-wide post has no squad and says so.
      const rows = await db(
        `messages?id=eq.${encodeURIComponent(messageId)}` +
          '&select=body,team_id,parent_id,channel,conversation_id,author_role,mentions,deleted_at,attachments,attachment_path,teams(name),author:profiles!messages_author_id_fkey(full_name)',
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
          body: messageBody(message),
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
        body: messageBody(message),
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
    } else if (documentId) {
      // ⚠️ DERIVED FROM THE DATABASE, NOT THE BODY (Grok item 11). The request
      // carries an id and nothing else; every word below is read back with the
      // service role. create_document only ever posts { document_id }.
      const rows = await db(
        `documents?id=eq.${encodeURIComponent(documentId)}` +
          '&select=title,staff_only,club_wide',
      )
      const doc = rows?.[0]
      if (!doc) return new Response('not found', { status: 404 })

      // ⚠️ ONE SQUAD NAME, NOT A LIST, AND NEVER A CHILD'S NAME BY
      // CONSTRUCTION. A document can target several squads; naming them all
      // would push a lock-screen string of unbounded length, and the tap goes
      // to the same screen either way. A club-wide document has no squad and
      // says nothing — the title just reads "New document".
      //
      // ⚠️ A SECOND READ RATHER THAN documents?select=document_squads(teams(name)).
      // The nested two-level embed may well work, but every embed already in
      // this file is ONE level deep, so the two-level form would be a shape
      // nothing here has ever proven — and a PostgREST 400 in this position
      // costs the whole notification, not just the squad name.
      let squadName: string | null = null
      if (!doc.club_wide) {
        const squadRows = await db(
          `document_squads?document_id=eq.${encodeURIComponent(documentId)}` +
            '&select=teams(name)&limit=1',
        )
        squadName = squadRows?.[0]?.teams?.name ?? null
      }

      job = {
        // "New document for U12 staff" / "New document for U12" /
        // "New document staff" (club-wide, staff-only) / "New document".
        // ⚠️ THE WORD "staff" IS THE ONLY HINT THE AUDIENCE IS NARROW, and it
        // is worth keeping: a coach who sees it knows not to forward the file
        // to a parents' group chat.
        title: 'New document'
          + (squadName ? ` for ${escapeHtmlFree(squadName)}` : '')
          + (doc.staff_only ? ' staff' : ''),
        // The document's TITLE, not its file name — the title is what a person
        // chose to call it; the file name is whatever their phone produced.
        body: escapeHtmlFree(doc.title).slice(0, 200),
        url: `${APP_URL}/documents`,
        // Per DOCUMENT: two documents in a minute are two notifications, the
        // same way two notices are. Only a repeat about the SAME thing should
        // collapse, and there is no path that pushes one document twice.
        tag: `document-${documentId}`,
        // ⚠️ ONE CALL, AND THE DATABASE DECIDES — see documentTargets.
        subscriptions: await documentTargets(documentId),
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
        // Belt and braces with the SQL allowlist (Grok item 12): never POST
        // outside the known push services, whatever a row says.
        if (!pushEndpointAllowed(subscription.endpoint)) {
          console.error(`push-send: refusing off-allowlist endpoint for subscription ${subscription.id}`)
          continue
        }
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
