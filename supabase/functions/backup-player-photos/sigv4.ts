// AWS Signature Version 4, for talking to Cloudflare R2's S3 API.
//
// !! NO IMPORTS, SAME RULE AS plan.ts. Loaded by the Deno function next door and
// by vitest (tests/photo-backup-sigv4.test.js). Web Crypto only, which both
// runtimes have.
//
// !! WHY THIS IS HAND-ROLLED. The other four edge functions import nothing, and
// this one holds the credentials to the club's only backup of children's
// photographs — a dependency here is a supply chain nobody in this club audits.
// The algorithm is ~60 lines and has not changed since 2014.
//
// !! WHY IT IS ITS OWN FILE RATHER THAN PART OF index.ts. A wrong signature
// fails as `403 SignatureDoesNotMatch`, which names no header, no character and
// no step. Split out, the primitives and the canonical-string assembly can be
// asserted in the suite instead of guessed at against a live bucket.

const encoder = new TextEncoder()

export function hex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  return hex(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource))
}

export async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)))
}

/**
 * RFC 3986 encoding, which is NOT encodeURIComponent.
 *
 * !! THE FIVE EXTRA CHARACTERS ARE THE WHOLE POINT. encodeURIComponent leaves
 * ! ' ( ) * alone; SigV4 requires them percent-encoded. A signature computed
 * over a differently-encoded string fails with SignatureDoesNotMatch, an error
 * that names neither the character nor the step.
 */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Encode an object key for a URL path: every segment escaped, separators kept. */
export function encodeKeyPath(key: string): string {
  return key.split('/').map(rfc3986).join('/')
}

/** `20260813T180000Z` and `20260813`, the two forms every signature needs. */
export function amzTimestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

export interface SignInput {
  method: string
  /** Path after the host, starting with `/`, already key-encoded. */
  path: string
  query?: Record<string, string>
  /** Headers to sign, besides host/x-amz-date/x-amz-content-sha256. */
  headers?: Record<string, string>
  payloadHash: string
  host: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  now: Date
}

export interface Signed {
  url: string
  headers: Record<string, string>
  /** Exposed for tests; nothing in the request path reads these. */
  canonicalRequest: string
  stringToSign: string
}

export async function signRequest(input: SignInput): Promise<Signed> {
  const { amzDate, dateStamp } = amzTimestamps(input.now)

  const headers: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
    host: input.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate,
  }

  // Canonical headers: lower-cased names, sorted, trimmed values, one per line.
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join('')
  const signedHeaders = names.join(';')

  const query = input.query ?? {}
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join('&')

  const canonicalRequest = [
    input.method,
    input.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n')

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  let key = encoder.encode(`AWS4${input.secretAccessKey}`)
  for (const part of [dateStamp, input.region, input.service, 'aws4_request']) {
    key = await hmac(key, part)
  }
  const signature = hex(await hmac(key, stringToSign))

  // !! `host` IS SIGNED BUT NOT SENT. fetch() sets Host itself and throws if it
  // is handed one; leaving it in this map is a TypeError at request time.
  const sendable: Record<string, string> = { ...headers }
  delete sendable.host

  return {
    url: `https://${input.host}${input.path}${canonicalQuery ? `?${canonicalQuery}` : ''}`,
    headers: {
      ...sendable,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    canonicalRequest,
    stringToSign,
  }
}
