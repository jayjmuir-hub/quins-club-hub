import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// The slack-eater, measured (25 Aug 2026). Jay's screenshots: a DM with a
// handful of messages left the shell's min-h-screen surplus BELOW the
// composer, so the phone keyboard scrolled the composer to mid-screen over a
// void. The fix bottom-anchors conversation screens; what proves it is a
// NUMBER, not a look: the gap between the composer's bottom edge and the
// true document bottom must be (near) zero, because "document bottom" is
// where the keyboard-triggered pin scrolls to.
//
// Run: `npm run harness` (port 5199), then `node harness/shoot-chat-layout.mjs`.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/chat-layout')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'
// The shell's conversation-screen bottom padding (pb-2) plus a little grace.
const SLACK_ALLOWANCE_PX = 24

const results = []
const chromium = await loadChromium()
const browser = await chromium.launch()

const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
const pageErrors = []
page.on('pageerror', (err) => pageErrors.push(err.message))

await page.goto(`${BASE}/?scenario=dm-thread&at=thread`, { waitUntil: 'networkidle' })
// The stub's photos sign ~900ms late by design; let the thread settle.
await page.waitForTimeout(1400)

const measured = await page.evaluate(() => {
  const form = document.querySelector('main form:has(textarea)') ?? document.querySelector('main form')
  const rect = form?.getBoundingClientRect()
  const docBottom = document.documentElement.scrollHeight
  const formBottomInDoc = rect ? rect.bottom + window.scrollY : null
  return {
    slackBelowComposer: formBottomInDoc == null ? null : Math.round(docBottom - formBottomInDoc),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }
})

await page.screenshot({ path: path.join(outDir, 'dm-thread-mobile.png'), fullPage: false })

const problems = []
if (measured.slackBelowComposer == null) problems.push('composer form not found')
else if (measured.slackBelowComposer > SLACK_ALLOWANCE_PX)
  problems.push(`slack below composer is ${measured.slackBelowComposer}px — the keyboard will maroon it again`)
if (measured.overflow > 1) problems.push(`overflows by ${measured.overflow}px`)
if (pageErrors.length) problems.push(`page errors: ${pageErrors.join(' | ')}`)

console.log(
  `${problems.length ? '✗' : '✓'} dm-thread slack=${measured.slackBelowComposer}px${problems.length ? ' — ' + problems.join('; ') : ''}`,
)

await page.close()
await browser.close()
process.exit(problems.length ? 1 : 0)
