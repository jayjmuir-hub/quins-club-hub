// Sends a real browser/OS push notification — not an email — when an admin
// replies to somebody's report.
//
// Fired by an AFTER UPDATE trigger on public.feedback, WHEN status or
// admin_note changes. Design: claude/plans/2026-08-18-push-notifications.md.
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
  try {
    const payload = await request.json()
    feedbackId = String(payload?.feedback_id ?? '')
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (!feedbackId) return new Response('bad request', { status: 400 })

  try {
    const rows = await db(
      `feedback?id=eq.${encodeURIComponent(feedbackId)}&select=ref,status,admin_note,submitted_by`,
    )
    const report = rows?.[0]
    if (!report) return new Response('not found', { status: 404 })

    const subscriptions = await db(
      `push_subscriptions?profile_id=eq.${encodeURIComponent(report.submitted_by)}&select=id,endpoint,p256dh,auth`,
    )
    if (subscriptions.length === 0) {
      // Not an error - most reporters have never turned the toggle on. The
      // acknowledgement email sent at submit time is what tells them where
      // to look either way.
      return new Response('ok (no subscriptions)', { status: 200 })
    }

    const reference = ref(report.ref)
    const statusWord = STATUS_WORD[report.status] ?? report.status
    const title = `Your report ${reference}`
    const body = report.admin_note
      ? escapeHtmlFree(report.admin_note)
      : `Now marked: ${statusWord}`

    const payloadJson = JSON.stringify({
      title,
      body,
      url: `${APP_URL}/`,
      // Lets the service worker collapse several rapid replies to the SAME
      // report into one notification instead of stacking a tray full of
      // them - see the `tag` handling in public/push-sw.js.
      tag: `feedback-${feedbackId}`,
    })

    const privateKey = await getVapidPrivateKey()
    const signingKey = await importVapidSigningKey(privateKey)

    for (const subscription of subscriptions) {
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
