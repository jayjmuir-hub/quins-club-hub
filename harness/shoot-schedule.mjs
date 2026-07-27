import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task 11 visual verification. Same pattern as shoot.mjs, but each shot can
// drive real component state first (the Upcoming/Results/Calendar sub-tabs
// and the EventDetail sheet are useState inside Schedule, not props), and
// each records document scrollWidth vs innerWidth so horizontal overflow at
// 375px is measured rather than eyeballed.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task11')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const shots = [
  { file: 'upcoming', scenario: 'schedule', steps: async () => {} },
  {
    file: 'results',
    scenario: 'schedule',
    steps: async (page) => {
      await page.getByRole('button', { name: 'Results' }).click()
    },
  },
  {
    file: 'calendar',
    scenario: 'schedule',
    steps: async (page) => {
      await page.getByRole('button', { name: 'Calendar' }).click()
    },
  },
  {
    file: 'detail',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      // First unscored fixture in the Upcoming list -> opens EventDetail.
      await page.locator('button', { hasText: 'U12 Squad Training' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.waitForTimeout(400)
    },
  },
  {
    file: 'detail-scrolled',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await page.locator('button', { hasText: 'U12 Squad Training' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.waitForTimeout(400)
      await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await page.waitForTimeout(150)
    },
  },
  {
    file: 'detail-result',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await page.getByRole('button', { name: 'Results' }).click()
      await page.locator('button', { hasText: 'Dubai Exiles' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.waitForTimeout(400)
    },
  },
  { file: 'upcoming-admin', scenario: 'schedule-admin', steps: async () => {} },
  {
    file: 'upcoming-bottom',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(200)
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
    await page.waitForTimeout(250)
    await shot.steps(page)
    await page.waitForTimeout(200)

    const metrics = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth
      const wide = [...document.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map((el) => `${el.tagName}.${el.className?.toString?.().slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`)
      const nav = document.querySelector('nav[aria-label="Primary"]')
      const navRect = nav ? nav.getBoundingClientRect() : null
      const cells = [...document.querySelectorAll('.grid-cols-7 > *')].slice(7, 12).map((el) => {
        const r = el.getBoundingClientRect()
        return `${Math.round(r.width)}x${Math.round(r.height)}`
      })
      const hero = document.querySelector('[role="dialog"] > div:nth-child(3) > div:first-child')
      const panel = document.querySelector('[role="dialog"]')
      return {
        docWidth,
        innerWidth: window.innerWidth,
        overflowing: wide,
        navRect: navRect && { top: Math.round(navRect.top), height: Math.round(navRect.height) },
        calCellSizes: cells,
        heroRect: hero && {
          left: Math.round(hero.getBoundingClientRect().left),
          right: Math.round(hero.getBoundingClientRect().right),
        },
        panelRect: panel && {
          left: Math.round(panel.getBoundingClientRect().left),
          right: Math.round(panel.getBoundingClientRect().right),
        },
      }
    })

    const outPath = path.join(outDir, `${shot.file}-${vp.name}.png`)
    await page.screenshot({ path: outPath, fullPage: !shot.viewportOnly })

    results.push({ shot: shot.file, viewport: vp.name, file: outPath, metrics, consoleErrors, consoleWarnings, pageErrors })
    await page.close()
  }
}

await browser.close()
console.log(JSON.stringify(results, null, 2))
