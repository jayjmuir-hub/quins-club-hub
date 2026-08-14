// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'

import {
  amzTimestamps,
  encodeKeyPath,
  hex,
  hmac,
  rfc3986,
  sha256Hex,
  signRequest,
} from '../supabase/functions/backup-player-photos/sigv4.ts'

// SigV4, the part of the photo backup most likely to be silently wrong.
//
// ⚠️ WHY THESE ASSERTIONS AND NOT A SIGNATURE CONSTANT. A wrong signature fails
// as `403 SignatureDoesNotMatch` and names neither the header nor the character
// that caused it, so the temptation is to paste a published example signature
// and call it verified. That would only be worth the accuracy of the number
// recalled. Instead this asserts the two cryptographic primitives against
// values that are fixed facts of the algorithms — the SHA-256 of the empty
// string, and RFC 4231's first HMAC-SHA256 test case — plus every encoding and
// assembly rule the signature is built out of. If all of those hold, the only
// remaining way to be wrong is an assembly order, and that is asserted too.
//
// ⚠️ AND IT STILL DOES NOT PROVE R2 WILL ACCEPT A REQUEST. Nothing here talks to
// Cloudflare. The first real evidence is the drill in
// claude/runbooks/player-photo-backup.md.

const key = (n) => new Uint8Array(Array(n).fill(0x0b))

describe('the primitives', () => {
  it('sha256 of the empty string', async () => {
    // The payload hash on every GET this function signs.
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('sha256 accepts bytes as well as text', async () => {
    expect(await sha256Hex(new Uint8Array([]))).toBe(await sha256Hex(''))
  })

  // RFC 4231, test case 1: key = 20 bytes of 0x0b, data = "Hi There".
  it('hmac-sha256 matches RFC 4231 case 1', async () => {
    expect(hex(await hmac(key(20), 'Hi There'))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    )
  })

  it('hex pads a byte below 0x10 rather than dropping a nibble', () => {
    expect(hex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff')
  })
})

describe('rfc3986', () => {
  // ⚠️ The five characters encodeURIComponent leaves alone. This is the single
  // most likely cause of a SignatureDoesNotMatch that looks like a credentials
  // problem.
  it("encodes ! ' ( ) *", () => {
    expect(rfc3986("!'()*")).toBe('%21%27%28%29%2A')
  })

  it('encodes a slash — segments are encoded one at a time, not the whole path', () => {
    expect(rfc3986('a/b')).toBe('a%2Fb')
  })

  it('leaves the unreserved set alone', () => {
    expect(rfc3986('AZaz09-_.~')).toBe('AZaz09-_.~')
  })
})

describe('encodeKeyPath', () => {
  it('keeps the separators and escapes the segments', () => {
    expect(encodeKeyPath('3f4a1c22-9b6e-4d51-8a07-2c9e1b7d5f30/1786000000000.jpg')).toBe(
      '3f4a1c22-9b6e-4d51-8a07-2c9e1b7d5f30/1786000000000.jpg',
    )
    expect(encodeKeyPath('odd name/a+b.jpg')).toBe('odd%20name/a%2Bb.jpg')
  })
})

describe('amzTimestamps', () => {
  it('produces the basic-format timestamp and its date', () => {
    const { amzDate, dateStamp } = amzTimestamps(new Date('2026-08-13T18:04:05.678Z'))
    expect(amzDate).toBe('20260813T180405Z')
    expect(dateStamp).toBe('20260813')
  })
})

// A fixed input, so the assembled strings can be read rather than trusted.
const input = {
  method: 'GET',
  path: '/quins-player-photos',
  query: { 'list-type': '2', 'max-keys': '1000' },
  payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  host: 'abc123.r2.cloudflarestorage.com',
  region: 'auto',
  service: 's3',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  now: new Date('2026-08-13T18:04:05Z'),
}

describe('signRequest', () => {
  it('assembles the canonical request in the documented order', async () => {
    const signed = await signRequest(input)
    expect(signed.canonicalRequest).toBe(
      [
        'GET',
        '/quins-player-photos',
        'list-type=2&max-keys=1000',
        'host:abc123.r2.cloudflarestorage.com\n' +
          'x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
          'x-amz-date:20260813T180405Z\n',
        'host;x-amz-content-sha256;x-amz-date',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ].join('\n'),
    )
  })

  it('scopes the string-to-sign to the day, the region and s3', async () => {
    const signed = await signRequest(input)
    const lines = signed.stringToSign.split('\n')
    expect(lines[0]).toBe('AWS4-HMAC-SHA256')
    expect(lines[1]).toBe('20260813T180405Z')
    expect(lines[2]).toBe('20260813/auto/s3/aws4_request')
    expect(lines[3]).toBe(await sha256Hex(signed.canonicalRequest))
  })

  it('sorts query parameters, not just joins them', async () => {
    const signed = await signRequest({
      ...input,
      query: { 'max-keys': '1000', 'continuation-token': 'a/b+c', 'list-type': '2' },
    })
    expect(signed.canonicalRequest.split('\n')[2]).toBe(
      'continuation-token=a%2Fb%2Bc&list-type=2&max-keys=1000',
    )
  })

  // ⚠️ COUNTED FROM THE END, NOT THE START. The canonical headers are a block of
  // one line per header, so the signed-headers line moves whenever a header is
  // added — indexing from the front makes this assertion depend on how many
  // headers the request happens to carry. The last two lines are always
  // signed-headers and payload hash.
  const signedHeadersLine = (canonical) => canonical.split('\n').at(-2)

  it('sorts and lower-cases headers, and signs the extra ones it is given', async () => {
    const signed = await signRequest({ ...input, headers: { 'Content-Type': 'image/jpeg' } })
    expect(signedHeadersLine(signed.canonicalRequest)).toBe(
      'content-type;host;x-amz-content-sha256;x-amz-date',
    )
    expect(signed.headers['content-type']).toBe('image/jpeg')
  })

  it('signs exactly three headers when no extra one is given', async () => {
    const signed = await signRequest(input)
    expect(signedHeadersLine(signed.canonicalRequest)).toBe(
      'host;x-amz-content-sha256;x-amz-date',
    )
  })

  // ⚠️ fetch() sets Host itself and THROWS if it is handed one. Signing it while
  // not sending it is required, and getting that backwards is a TypeError at
  // request time rather than a signing error, so it would not look like this.
  it('signs host but does not return it as a header to send', async () => {
    const signed = await signRequest(input)
    expect(signed.canonicalRequest).toContain('host:abc123.r2.cloudflarestorage.com')
    expect(Object.keys(signed.headers).map((h) => h.toLowerCase())).not.toContain('host')
  })

  it('builds the Authorization header in the shape S3 parses', async () => {
    const signed = await signRequest(input)
    expect(signed.headers.Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260813\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    )
  })

  it('puts the query on the url as well as in the signature', async () => {
    const signed = await signRequest(input)
    expect(signed.url).toBe(
      'https://abc123.r2.cloudflarestorage.com/quins-player-photos?list-type=2&max-keys=1000',
    )
  })

  it('is deterministic for the same instant, and changes when the payload does', async () => {
    const a = await signRequest(input)
    const b = await signRequest(input)
    const c = await signRequest({ ...input, payloadHash: 'f'.repeat(64) })
    expect(a.headers.Authorization).toBe(b.headers.Authorization)
    expect(c.headers.Authorization).not.toBe(a.headers.Authorization)
  })

  it('changes when the secret changes — the key derivation is actually used', async () => {
    const a = await signRequest(input)
    const b = await signRequest({ ...input, secretAccessKey: `${input.secretAccessKey}x` })
    expect(b.headers.Authorization).not.toBe(a.headers.Authorization)
  })
})
