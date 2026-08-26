// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The 21% week — 26 Aug 2026. Three notifiers sent `to: [MAIL_FROM]`, the
// noreply@ on the SENDING subdomain, which nothing receives: every send
// logged a transient bounce against that recipient while the bcc copies
// delivered fine, and 83 of the week's 396 emails "bounced". A sustained
// bounce rate is what gets a sending domain suspended, and auth mail rides
// the same domain. The `to` must be an address with a real inbox — MAIL_TO,
// which falls back to the root-domain shared mailbox.
//
// Source-text on purpose, like tests/harness-stubs.test.js: these are Deno
// modules jsdom cannot import, and the property under test is a literal in
// the request body.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FUNCTIONS = path.join(ROOT, 'supabase', 'functions')

const senders = fs
  .readdirSync(FUNCTIONS)
  .filter((d) => fs.existsSync(path.join(FUNCTIONS, d, 'index.ts')))
  .map((d) => [d, fs.readFileSync(path.join(FUNCTIONS, d, 'index.ts'), 'utf8')])
  // The `bcc,` BODY PROPERTY, not the word — notify-invite's comments say
  // "there is NO bcc" and must not be swept in by saying so.
  .filter(([, src]) => /^\s*bcc,$/m.test(src))
  .filter(([, src]) => src.includes('api.resend.com'))

describe('every bcc-style notifier addresses a mailbox that can receive', () => {
  it('found the notifiers at all (a moved directory must not pass silently)', () => {
    expect(senders.map(([name]) => name).sort()).toEqual([
      'notify-access-request',
      'notify-approval',
      'notify-pitch-request',
    ])
  })

  it.each(senders)('%s never uses MAIL_FROM as the to-address', (name, src) => {
    expect(src, name).not.toMatch(/to:\s*\[?\s*MAIL_FROM/)
    expect(src, name).toMatch(/to:\s*\[MAIL_TO\]/)
    // The fallback derivation: root-domain mailbox from the send subdomain.
    expect(src, name).toContain("Deno.env.get('MAIL_TO') || MAIL_FROM.replace('@send.', '@')")
  })
})
