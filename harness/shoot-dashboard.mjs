import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task 13 visual verification. Same pattern as shoot-roster.mjs. The
// measurements matter as much as the pictures: the quick-action stack mixes
// <button>s and <a>s used as layout boxes, and Chromium's UA stylesheet
// centres a button's content but not an anchor's — a difference jsdom can
// never see. Every shot therefore records each action's height and its text's
// offset from its own top edge, so a dropped `flex items-center justify-center`
// shows up as a number, not a vibe. It also records the hero's rendered date
// and time text, which must be Abu Dhabi's, not the machine's.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task13')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const shots = [
  { file: 'coach', scenario: 'dashboard' },
  { file: 'admin', scenario: 'dashboard-admin' },
  { file: 'parent', scenario: 'dashboard-parent' },
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
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    const consoleErrors = []
    const consoleWarnings = []
    const pageErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
      if (msg.type() === 'warning') consoleWarnings.push(msg.text())
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(`${BASE}/?scenario=${shot.scenario}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    const metrics = await page.evaluate(() => {
      const text = (sel) => document.querySelector(sel)?.innerText.replace(/\n+/g, ' | ') ?? null

      const overflowing = [...document.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map(
          (el) =>
            `${el.tagName}.${el.className?.toString?.().slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`,
        )

      // Anything laid out to zero size, or clipped away, is content the
      // jsdom tests would still have called "visible".
      const collapsed = [...document.querySelectorAll('[data-testid]')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width < 1 || r.height < 1
        })
        .map((el) => el.dataset.testid)

      // The UA-centring check, for both the <button> and <a> variants.
      const actions = [...document.querySelectorAll('a[href], button')]
        .filter((el) => el.className.includes('w-full'))
        .map((el) => {
          const box = el.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(el)
          const inner = range.getBoundingClientRect()
          return {
            tag: el.tagName,
            label: el.innerText.trim(),
            disabled: el.disabled === true,
            h: Math.round(box.height),
            w: Math.round(box.width),
            textOffsetTop: Math.round(inner.top - box.top),
          }
        })

      const statGrid = document.querySelector('[data-testid="stat-players"]')?.parentElement
      const cols = statGrid ? getComputedStyle(statGrid).gridTemplateColumns : null

      const dashCols = document.querySelector('[data-testid="upcoming-list"]')?.closest('div')
        ?.parentElement
      const box = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }
      }

      return {
        docWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowing,
        collapsed,
        hero: text('[data-testid="next-fixture"]'),
        countdown: text('[data-testid="countdown"]'),
        stats: ['stat-players', 'stat-fixtures', 'stat-groups'].map((id) =>
          text(`[data-testid="${id}"]`),
        ),
        statGridColumns: cols,
        dashColumns: dashCols ? getComputedStyle(dashCols).gridTemplateColumns : null,
        upcomingBox: box('[data-testid="upcoming-list"]'),
        lastResultBox: box('[data-testid="last-result"]'),
        upcomingRows: document.querySelectorAll('[data-testid="upcoming-list"] [data-testid="fixture-row"]')
          .length,
        lastResult: text('[data-testid="last-result"]'),
        actions,
      }
    })

    const outPath = path.join(outDir, `${shot.file}-${vp.name}.png`)
    await page.screenshot({ path: outPath, fullPage: true })

    results.push({ shot: shot.file, viewport: vp.name, file: outPath, metrics, consoleErrors, consoleWarnings, pageErrors })
    await page.close()
  }
}

await browser.close()
console.log(JSON.stringify(results, null, 2))
