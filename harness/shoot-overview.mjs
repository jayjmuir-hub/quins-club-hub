import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task 5 visual verification for the Overview screen (see the plan's Task 5:
// docs/superpowers/plans/2026-08-03-club-overview-dashboard.md). Same
// pattern as shoot-dashboard.mjs, but desktop-only: Overview is a desktop-
// only screen by design (gated at the `desktop:` Tailwind breakpoint in
// Nav.jsx/AppShell.jsx), so there is nothing meaningful to screenshot at
// phone width — the nav item not appearing on mobile is already covered by
// Task 4's jsdom tests.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/overview')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const shots = [
  { file: 'admin', scenario: 'overview-admin' },
  { file: 'coach', scenario: 'overview-coach' },
]

const viewports = [
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

    const overviewChecks = await page.evaluate(() => ({
      hasOverviewNavLink: !!document.querySelector('a[href="/overview"]'),
      fixtureRowCount: document.querySelectorAll('[data-testid="fixture-row"]').length,
      rosterGapRowCount: document.querySelectorAll('[data-testid^="roster-gap-"]').length,
    }))

    const outPath = path.join(outDir, `${shot.file}-${vp.name}.png`)
    await page.screenshot({ path: outPath, fullPage: true })

    results.push({
      shot: shot.file,
      viewport: vp.name,
      file: outPath,
      overviewChecks,
      consoleErrors,
      consoleWarnings,
      pageErrors,
    })
    await page.close()
  }
}

await browser.close()
console.log(JSON.stringify(results, null, 2))
