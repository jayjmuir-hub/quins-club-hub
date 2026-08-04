import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task 5 browser verification for the view-as switcher and the admin Accounts
// screen (plan: claude/plans/2026-08-03-view-as-and-accounts.md).
// Desktop-only at 1280x900: both features are gated at the 820px `desktop:`
// breakpoint (the switcher trigger and the /accounts nav item), so phone width
// has nothing to add that the jsdom class assertions do not already cover.
//
// This script does more than screenshot. Each scenario is DRIVEN — the sheet
// is opened, a persona is clicked, Exit preview is clicked — and the resulting
// DOM is read back, because "the banner appears and clears" is a state
// transition, not a static frame.
//
// It also re-runs two PRE-EXISTING scenarios (roster-admin, schedule-admin).
// harness/main.jsx statically imports every screen, so one missing export in
// a harness stub blanks EVERY scenario, not just the new one — that regression
// has happened here before (players.js/insertPlayers). Re-shooting untouched
// scenarios is the only cheap proof that stub drift has not been reintroduced.
//
// Run:
//   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs \
//   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node harness/shoot-view-as.mjs

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/view-as')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'
const VIEWPORT = { width: 1280, height: 900 }

const chromium = await loadChromium()
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {}
const browser = await chromium.launch(launchOptions)

const results = []

async function openPage(query) {
  const page = await browser.newPage({ viewport: VIEWPORT })
  const consoleErrors = []
  const consoleWarnings = []
  const pageErrors = []
  page.on('console', (msg) => {
    // harness/index.html declares no favicon, so Chromium's automatic
    // /favicon.ico request 404s on whichever scenario happens to load first
    // in a browser session (later pages reuse the cached 404 and stay
    // silent). Pre-existing harness noise with no app code behind it —
    // filtered out so "zero console errors" means something. Verified by
    // reproducing it on an untouched scenario (roster-admin) loaded first.
    const isFaviconNoise =
      msg.text().includes('404') && (msg.location()?.url || '').endsWith('/favicon.ico')
    if (msg.type() === 'error' && !isFaviconNoise) consoleErrors.push(msg.text())
    if (msg.type() === 'warning') consoleWarnings.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto(`${BASE}/?${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return { page, consoleErrors, consoleWarnings, pageErrors }
}

// --- 1. Accounts, as an admin ------------------------------------------------
{
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    'scenario=accounts-admin',
  )

  const checks = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="account-membership"]')]
    const linked = [...document.querySelectorAll('[data-testid="account-linked-player"]')].map(
      (el) => el.textContent.trim(),
    )
    return {
      personBlocks: document.querySelectorAll('[data-testid="account-person"]').length,
      membershipRows: rows.length,
      names: [...document.querySelectorAll('[data-testid="account-name"]')].map((el) =>
        el.textContent.trim(),
      ),
      emails: [...document.querySelectorAll('[data-testid="account-email"]')].map((el) =>
        el.textContent.trim(),
      ),
      linkedPlayers: linked,
      linkedWithName: linked.filter((text) => text && text !== 'No linked player—').length,
      placeholders: linked.filter((text) => text === 'No linked player—').length,
      roleSelects: document.querySelectorAll('select[aria-label^="Role for"]').length,
      notAuthorised: document.body.textContent.includes('Not authorised'),
    }
  })

  await page.screenshot({ path: path.join(outDir, 'accounts-admin.png'), fullPage: true })
  results.push({ shot: 'accounts-admin', checks, consoleErrors, consoleWarnings, pageErrors })
  await page.close()
}

// --- 2. Accounts, as a coach (the gate) --------------------------------------
{
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    'scenario=accounts-admin&who=coach',
  )

  const checks = await page.evaluate(() => ({
    notAuthorised: document.body.textContent.includes('Not authorised'),
    membershipRows: document.querySelectorAll('[data-testid="account-membership"]').length,
  }))

  await page.screenshot({ path: path.join(outDir, 'accounts-coach.png'), fullPage: true })
  results.push({ shot: 'accounts-coach', checks, consoleErrors, consoleWarnings, pageErrors })
  await page.close()
}

// --- 3. The view-as switcher, driven end to end ------------------------------
{
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage('scenario=view-as')

  const readState = () =>
    page.evaluate(() => {
      const banner = document.querySelector('[data-testid="view-as-banner"]')
      const trigger = document.querySelector('[data-testid="view-as-trigger"]')
      return {
        triggerPresent: !!trigger,
        // The trigger is `hidden desktop:flex`; at 1280px it must actually be
        // laid out, not merely present in the DOM.
        triggerVisible: trigger ? trigger.getClientRects().length > 0 : false,
        triggerLabel: trigger ? trigger.textContent.trim() : null,
        bannerPresent: !!banner,
        bannerText: banner ? banner.textContent.replace(/\s+/g, ' ').trim() : null,
        // Roster's own scope reporting is the visible proof of re-scoping:
        // the age-group filter pills (TeamPills renders aria-pressed toggle
        // buttons, no testid), the "N players · N age groups" subtitle, and
        // the ScopeNote that only a non-admin sees.
        // TeamPills carries no testid, and RosterTable's own cells use
        // aria-pressed too (the captain toggles), so the pill row is located
        // via its "All" pill and read from that button's parent — not from a
        // bare aria-pressed sweep, which would drag 26 captain cells in.
        agePills: (() => {
          const all = [...document.querySelectorAll('button[aria-pressed]')].find((el) =>
            el.textContent.trim().startsWith('All'),
          )
          const row = all?.parentElement
          return row ? [...row.children].map((el) => el.textContent.trim()) : []
        })(),
        scopeSummary: document.querySelector('h2 + p')?.textContent.trim() ?? null,
        scopeNote: document.body.textContent.includes('every other age group is hidden'),
        // Desktop roster renders RosterTable, not the phone player-row list.
        playerRows: document.querySelectorAll('[data-testid="roster-table-row"]').length,
      }
    })

  const before = await readState()
  await page.screenshot({ path: path.join(outDir, 'view-as-admin.png'), fullPage: true })

  await page.click('[data-testid="view-as-trigger"]')
  await page.waitForTimeout(300)
  const sheetOpen = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
    return {
      personaButtons: buttons.filter(
        (t) => t.startsWith('Coach of') || t.startsWith('Parent in') || t.includes('All age groups'),
      ),
    }
  })
  await page.screenshot({ path: path.join(outDir, 'view-as-sheet.png'), fullPage: true })

  // Pick "Coach of U14 Boys" — a squad that is NOT the first, so a re-scope
  // that silently defaulted to the first team would still be caught.
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Coach of U14 Boys',
    )
    button.click()
  })
  await page.waitForTimeout(400)
  const previewing = await readState()
  await page.screenshot({ path: path.join(outDir, 'view-as-coach.png'), fullPage: true })

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Exit preview',
    )
    button.click()
  })
  await page.waitForTimeout(400)
  const after = await readState()
  await page.screenshot({ path: path.join(outDir, 'view-as-exited.png'), fullPage: true })

  results.push({
    shot: 'view-as',
    before,
    sheetOpen,
    previewing,
    after,
    consoleErrors,
    consoleWarnings,
    pageErrors,
  })
  await page.close()
}

// --- 4. The switcher must not exist for a non-admin --------------------------
{
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    'scenario=view-as&who=non-admin',
  )
  const checks = await page.evaluate(() => ({
    triggerPresent: !!document.querySelector('[data-testid="view-as-trigger"]'),
    bannerPresent: !!document.querySelector('[data-testid="view-as-banner"]'),
  }))
  results.push({ shot: 'view-as-non-admin', checks, consoleErrors, consoleWarnings, pageErrors })
  await page.close()
}

// --- 5. Regression: pre-existing scenarios still render ----------------------
for (const scenario of ['roster-admin', 'schedule-admin']) {
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    `scenario=${scenario}`,
  )
  const checks = await page.evaluate(() => ({
    rootChildCount: document.getElementById('root')?.children.length ?? 0,
    bodyTextLength: document.body.textContent.trim().length,
    hasNav: !!document.querySelector('nav'),
  }))
  await page.screenshot({ path: path.join(outDir, `regression-${scenario}.png`), fullPage: true })
  results.push({ shot: `regression:${scenario}`, checks, consoleErrors, consoleWarnings, pageErrors })
  await page.close()
}

await browser.close()
console.log(JSON.stringify(results, null, 2))
