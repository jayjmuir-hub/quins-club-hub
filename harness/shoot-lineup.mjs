import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// The three-view roster builder (25 Aug 2026) — visual verification, and the
// ONLY place the drag reorder is proven: jsdom has no layout, so
// tests/lineup-views.test.jsx deliberately stops at "the handle exists" and
// this script does the actual dragging with a real pointer in a real browser.
//
// Run: `npm run harness` in one terminal (port 5199), then
//      `node harness/shoot-lineup.mjs`.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/lineup-views')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const shots = [
  { file: 'quick', url: '/?scenario=lineup', steps: async () => {} },
  { file: 'slots', url: '/?scenario=lineup&view=slots', steps: async () => {} },
  {
    file: 'slots-after-drag',
    url: '/?scenario=lineup&view=slots',
    // ⚠️ THE POINT OF THIS FILE. Drag shirt 1's handle down past two rows and
    // assert the ORDER CHANGED — a screenshot alone would show a list that
    // looks fine whether or not the drop committed.
    steps: async (page, record) => {
      const firstName = await page
        .locator('li:has([aria-label^="Drag to move"]) span.truncate')
        .first()
        .innerText()
      const handle = page.locator('[aria-label^="Drag to move"]').first()
      const from = await handle.boundingBox()
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      // Two small moves then the real one — a single jump can outrun the
      // browser's pointermove coalescing and land as no movement at all.
      await page.mouse.move(from.x + from.width / 2, from.y + 40, { steps: 5 })
      await page.mouse.move(from.x + from.width / 2, from.y + 96, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const namesAfter = await page
        .locator('li:has(span.truncate) span.truncate')
        .allInnerTexts()
      const landedAt = namesAfter.indexOf(firstName)
      record('drag', { dragged: firstName, landedAt })
      if (landedAt === 0) throw new Error('drag did not move the row — the reorder never committed')
    },
  },
  { file: 'pitch', url: '/?scenario=lineup&view=pitch', steps: async () => {} },
  {
    file: 'pitch-after-drag',
    url: '/?scenario=lineup&view=pitch',
    // Phase 2: drag a filled circle onto an empty one with a real pointer and
    // assert the MOVE committed — shirt 1 empties, shirt 9 gains the player.
    steps: async (page, record) => {
      const source = page.locator('[aria-label^="Shirt 1:"]')
      const before = await source.getAttribute('aria-label')
      const target = page.locator('[aria-label="Shirt 9: empty"]')
      const from = await source.boundingBox()
      const to = await target.boundingBox()
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 4 })
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const afterOne = await page.locator('[aria-label^="Shirt 1:"]').getAttribute('aria-label')
      const afterNine = await page.locator('[aria-label^="Shirt 9:"]').getAttribute('aria-label')
      record('pitchDrag', { before, afterOne, afterNine })
      if (afterOne !== 'Shirt 1: empty') throw new Error('pitch drag did not empty the source circle')
      if (afterNine === 'Shirt 9: empty') throw new Error('pitch drag did not fill the target circle')
    },
  },
  {
    file: 'sheet-pitch-style',
    url: '/?scenario=lineup&view=pitch',
    // Desktop only: the step drags the 720px facsimile into the page flow to
    // photograph it, which OVERFLOWS a 375px viewport by construction — the
    // element is off-screen in real life and its PNG is identical either way.
    desktopOnly: true,
    // The pitch-STYLE share sheet: flip the toggle, drag the off-screen
    // facsimile into view, and photograph the element itself — this is the
    // actual PNG parents would receive.
    steps: async (page, record) => {
      await page.getByRole('button', { name: 'Pitch', pressed: false }).click()
      await page.evaluate(() => {
        const wrapper = document.querySelector('.force-light').parentElement
        wrapper.className = ''
        wrapper.style.position = 'static'
      })
      await page.waitForTimeout(200)
      const facsimile = page.locator('.force-light')
      const box = await facsimile.boundingBox()
      record('sheet', { width: Math.round(box.width) })
      await facsimile.screenshot({
        path: `${outDir}/sheet-pitch-style-card.png`,
      })
    },
  },
  {
    file: 'pitch-swap',
    url: '/?scenario=lineup&view=pitch',
    // Tap two filled circles and assert the shirts swapped in the aria labels.
    steps: async (page, record) => {
      const one = page.locator('[aria-label^="Shirt 1:"]')
      const two = page.locator('[aria-label^="Shirt 2:"]')
      const beforeOne = await one.getAttribute('aria-label')
      const beforeTwo = await two.getAttribute('aria-label')
      await one.click()
      await two.click()
      await page.waitForTimeout(150)
      const afterOne = await one.getAttribute('aria-label')
      record('swap', { beforeOne, beforeTwo, afterOne })
      if (afterOne === beforeOne) throw new Error('tap-tap swap did not change shirt 1')
    },
  },
]

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const results = []
const chromium = await loadChromium()
const browser = await chromium.launch()

for (const shot of shots) {
  for (const vp of viewports) {
    if (shot.desktopOnly && vp.name !== 'desktop') continue
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    const consoleErrors = []
    const pageErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const extras = {}
    const record = (key, value) => {
      extras[key] = value
    }

    let failure = null
    try {
      await page.goto(`${BASE}${shot.url}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(300)
      await shot.steps(page, record)
      await page.waitForTimeout(200)
    } catch (err) {
      failure = err.message
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    const file = path.join(outDir, `${shot.file}-${vp.name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    results.push({
      shot: `${shot.file}-${vp.name}`,
      overflow,
      consoleErrors,
      pageErrors,
      failure,
      ...extras,
    })
    await page.close()
  }
}

await browser.close()

let bad = 0
for (const r of results) {
  const problems = []
  if (r.overflow > 1) problems.push(`overflows by ${r.overflow}px`)
  if (r.consoleErrors.length) problems.push(`console errors: ${r.consoleErrors.join(' | ')}`)
  if (r.pageErrors.length) problems.push(`page errors: ${r.pageErrors.join(' | ')}`)
  if (r.failure) problems.push(r.failure)
  const extra = r.drag
    ? ` drag→index ${r.drag.landedAt}`
    : r.swap
      ? ' swap ok'
      : r.pitchDrag
        ? ` pitch-drag: 1→9 (${r.pitchDrag.afterNine})`
        : r.sheet
          ? ` sheet ${r.sheet.width}px`
          : ''
  console.log(`${problems.length ? '✗' : '✓'} ${r.shot}${extra}${problems.length ? ' — ' + problems.join('; ') : ''}`)
  if (problems.length) bad += 1
}
process.exit(bad ? 1 : 0)
