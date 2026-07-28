import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task 12 visual verification. Same pattern as shoot-schedule.mjs. The
// measurements matter more than the pictures here: a player row is a
// <button> used as a layout box, and Chromium's UA stylesheet centres a
// button's content — the exact class of bug that shipped in Task 11's
// calendar cells and that jsdom can never see. So every shot records the
// initials tile's offset from its row's top edge, at both widths: if the row's
// explicit flex layout were dropped, those numbers would drift apart between
// short and tall rows.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task12')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const openPlayer = (name) => async (page) => {
  await page.locator('[data-testid="player-row"]', { hasText: name }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400)
}

const shots = [
  { file: 'age-groups', scenario: 'roster', steps: async () => {} },
  { file: 'positions', scenario: 'roster-one-team', steps: async () => {} },
  {
    file: 'team-selected',
    scenario: 'roster',
    steps: async (page) => {
      await page.getByRole('button', { name: /^U14 Boys/ }).click()
      await page.waitForTimeout(150)
    },
  },
  {
    file: 'search',
    scenario: 'roster',
    steps: async (page) => {
      await page.getByRole('searchbox').fill('prop')
      await page.waitForTimeout(150)
    },
  },
  {
    file: 'search-no-match',
    scenario: 'roster',
    steps: async (page) => {
      await page.getByRole('searchbox').fill('zzzz')
      await page.waitForTimeout(150)
    },
  },
  { file: 'admin', scenario: 'roster-admin', steps: async () => {} },
  // p7 Gabriel Santos has a contact row -> full contact block.
  { file: 'detail-contact', scenario: 'roster', viewportOnly: true, steps: openPlayer('Gabriel Santos') },
  // The in-flight state, held open by a 3s stub delay: the contact block must
  // render NOTHING while it waits — no spinner, no heading, no reserved box —
  // rather than announcing itself and then collapsing on a null row.
  {
    file: 'detail-contact-inflight',
    scenario: 'roster',
    query: '&contactDelay=3000',
    viewportOnly: true,
    steps: async (page) => {
      await page.locator('[data-testid="player-row"]', { hasText: 'Gabriel Santos' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.waitForTimeout(500)
    },
  },
  // p4 Dhruv Ramachandran is the captain AND the RLS-withheld contact case:
  // the sheet must show the Role row and absolutely nothing about contact.
  { file: 'detail-no-contact', scenario: 'roster', viewportOnly: true, steps: openPlayer('Dhruv Ramachandran') },
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

    await page.goto(`${BASE}/?scenario=${shot.scenario}${shot.query ?? ''}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    await shot.steps(page)
    await page.waitForTimeout(200)

    const metrics = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth
      const overflowing = [...document.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map(
          (el) =>
            `${el.tagName}.${el.className?.toString?.().slice(0, 60)} right=${Math.round(el.getBoundingClientRect().right)}`,
        )

      // The UA-centring check. For each row, how far is the initials tile's top
      // from the row's top? Identical across rows of differing heights means
      // the explicit flex layout is doing its job.
      const rows = [...document.querySelectorAll('[data-testid="player-row"]')].slice(0, 8).map((row) => {
        const rowRect = row.getBoundingClientRect()
        const tile = row.firstElementChild.getBoundingClientRect()
        return {
          h: Math.round(rowRect.height),
          tileOffsetTop: Math.round(tile.top - rowRect.top),
          tile: `${Math.round(tile.width)}x${Math.round(tile.height)}`,
        }
      })

      const dialog = document.querySelector('[role="dialog"]')
      return {
        docWidth,
        innerWidth: window.innerWidth,
        overflowing,
        groups: [...document.querySelectorAll('[data-testid="group-label"]')].map((el) => el.textContent),
        rowCount: document.querySelectorAll('[data-testid="player-row"]').length,
        rows,
        dialogText: dialog ? dialog.innerText.replace(/\n+/g, ' | ') : null,
        dialogHeight: dialog ? Math.round(dialog.getBoundingClientRect().height) : null,
        dialogBottomGap: dialog
          ? Math.round(window.innerHeight - dialog.getBoundingClientRect().bottom)
          : null,
        liveRegions: dialog
          ? [...dialog.querySelectorAll('[role="status"],[role="alert"]')].map(
              (el) => el.getAttribute('aria-label') || el.textContent,
            )
          : [],
        lastLinkGap: dialog
          ? (() => {
              const links = [...dialog.querySelectorAll('a')]
              if (!links.length) return null
              const last = links[links.length - 1].getBoundingClientRect()
              return Math.round(window.innerHeight - last.bottom)
            })()
          : null,
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
