// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The push body for a message that carries attachments and no caption.
//
// ⚠️ THIS IS A ROT DETECTOR, NOT A BEHAVIOUR TEST, exactly like
// tests/calendar-all-day.test.js and for the same reason: push-send is a Deno
// function with Deno.serve() at module scope, so importing it would start a
// server and the suite cannot execute it. What this file can do is fail when
// the source stops saying what the deployed function must say. The REAL
// verification is posting a captionless photo message on the live site and
// reading the notification.
//
// ⚠️ EVERY ASSERTION CARRIES A CONTROL. A source matcher that can silently
// match nothing is the trap this whole file exists to avoid.

const SOURCE = readFileSync(
  resolve(import.meta.dirname, '../supabase/functions/push-send/index.ts'),
  'utf8',
)

/** Just the messageBody() function, so an assertion cannot pass on a hit elsewhere in the file. */
const MESSAGE_BODY = SOURCE.slice(
  SOURCE.indexOf('function messageBody('),
  SOURCE.indexOf('/** `QCH-0041`'),
)

describe('push-send message body (rot detector)', () => {
  it('CONTROL: the matcher can find things known to be present', () => {
    // If these fail the file moved or the read is broken, and every negative
    // below is meaningless.
    expect(SOURCE).toContain('function messageBody(')
    expect(SOURCE).toContain('escapeHtmlFree')
    expect(MESSAGE_BODY.length).toBeGreaterThan(200)
    expect(MESSAGE_BODY).toContain('caption')
  })

  it('⚠️ the select actually fetches the attachment columns', () => {
    // The bug was never in the wording — it was that the row arrived without
    // any attachment column at all, so no wording could have helped.
    expect(SOURCE).toMatch(/&select=[^']*\battachments\b/)
    expect(SOURCE).toMatch(/&select=[^']*\battachment_path\b/)
    // CONTROL: a column that is genuinely absent must not match, or the
    // pattern above would pass against anything.
    expect(SOURCE).not.toMatch(/&select=[^']*\battachment_paths\b/)
  })

  it('⚠️ BOTH composition sites use it — the DM one and the channel one', () => {
    // The 1 Sep handoff records a single site. There are two, and patching
    // one leaves half the bug live for real parents.
    const uses = SOURCE.match(/body: messageBody\(message\),/g) ?? []
    expect(uses).toHaveLength(2)
    // And the old blank-producing expression must be GONE from both, or one
    // path still pushes empty space.
    expect(SOURCE).not.toMatch(/body: escapeHtmlFree\(message\.body\)\.slice\(0, 200\),/)
  })

  it('a caption always wins over the stand-in', () => {
    expect(MESSAGE_BODY).toMatch(/if \(caption\.trim\(\)\) return caption/)
  })

  it('several photos are counted', () => {
    expect(MESSAGE_BODY).toMatch(/list\.length > 1/)
    expect(MESSAGE_BODY).toMatch(/\$\{list\.length\} photos/)
  })

  it('a voice note is named as one, not called a photo', () => {
    expect(MESSAGE_BODY).toContain('Voice message')
    expect(MESSAGE_BODY).toMatch(/isAudioKey\(only\)/)
  })

  it('⚠️ falls back to attachment_path for a phone on a cached bundle', () => {
    // Such a phone writes only the old column and cannot be forced to update.
    // Without this arm its photo pushes an empty body exactly as before.
    expect(MESSAGE_BODY).toContain('message.attachment_path')
  })

  it('⚠️⚠️ SAFEGUARDING: the body is never built from a filename', () => {
    // `attachments` carries `name` so a DOCUMENT keeps its original filename.
    // A document named after the child it concerns would put that child's name
    // on every parent's lock screen. The payload must carry no child's name BY
    // CONSTRUCTION; a count keeps that, a filename destroys it.
    expect(MESSAGE_BODY).not.toMatch(/\.name\b/)
    // CONTROL: the property it DOES read is present, so the negative above is
    // not passing merely because the slice is empty or the field is unread.
    expect(MESSAGE_BODY).toMatch(/\.file\b/)
  })

  it('⚠️ the wording mirrors attachmentPreviewLabel in the app', () => {
    // No shared build between a Vite bundle and a Deno function — the same
    // standing arrangement locationFor() has with venueLine(). A parent
    // reading "10 photos" in the app and "Photo" on their lock screen is the
    // drift this pins. tests/chat-media.test.js pins the app side.
    const app = readFileSync(
      resolve(import.meta.dirname, '../src/data/chatMedia.js'),
      'utf8',
    )
    for (const phrase of ['Voice message', 'Photo']) {
      expect(MESSAGE_BODY).toContain(phrase)
      expect(app).toContain(phrase)
    }
  })
})
