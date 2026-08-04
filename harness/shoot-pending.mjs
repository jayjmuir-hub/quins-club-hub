import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task D browser verification for the pending-access plan
// (claude/plans/2026-08-03-pending-access.md): the "Waiting for
// access" section on Accounts (Task B) and the first-login name prompt
// (Task C). Desktop only at 1280x900 — /accounts is reachable only past the
// 820px `desktop:` breakpoint, and the name prompt's Sheet is width-agnostic.
//
// Every scenario here is DRIVEN and read back, not just photographed. The two
// things worth proving cannot be seen in a static frame:
//
//   1. The subtraction. listPendingProfiles() returns EVERY profile an admin
//      can read — their own, every club member's, and every unattached signup
//      — and the screen subtracts listClubMembers()'s profile_ids. If that
//      subtraction is ever dropped, the section silently lists the club's
//      entire membership as "waiting for access", each with a Give access
//      button. So the check below is not "3 people are waiting": it is that
//      NO member email appears in the section, asserted against the member
//      list actually rendered on the same page.
//   2. Granting moves someone WITHOUT a reload. The screen splices the
//      returned membership row into local state rather than re-querying, so a
//      full page load would mask a broken splice. window.__pendingMarker is
//      set once at load and re-read after the click: it survives a React
//      state update and is wiped by a real navigation.
//
// It also re-runs four PRE-EXISTING scenarios. harness/main.jsx statically
// imports every screen into one bundle, so a single missing export in a
// harness stub is a module-resolution failure that blanks EVERY scenario —
// which is exactly what had happened to this harness before this script was
// written (members.js was missing listPendingProfiles and grantMembership).
// tests/harness-stubs.test.js now guards it in CI; re-shooting untouched
// scenarios is the browser-side confirmation.
//
// Run:
//   PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs \
//   PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node harness/shoot-pending.mjs

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/pending')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'
const VIEWPORT = { width: 1280, height: 900 }

const chromium = await loadChromium()
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {},
)

const results = []

// One browser context for the name-prompt sequence, so localStorage
// (`quins.namePromptSkipped`) genuinely persists across its reloads — the
// whole point of the "does not reappear" check. Every other scenario gets a
// fresh page in the default context.
async function openPage(query, context) {
  const page = context
    ? await context.newPage()
    : await browser.newPage({ viewport: VIEWPORT })
  const consoleErrors = []
  const consoleWarnings = []
  const pageErrors = []
  page.on('console', (msg) => {
    // harness/index.html declares no favicon, so Chromium's automatic
    // /favicon.ico request 404s. Pre-existing harness noise with no app code
    // behind it — filtered exactly (and only) here, matching the convention
    // in shoot-view-as.mjs, so "zero console errors" still means something.
    const isFaviconNoise =
      msg.text().includes('404') && (msg.location()?.url || '').endsWith('/favicon.ico')
    if (msg.type() === 'error' && !isFaviconNoise) consoleErrors.push(msg.text())
    if (msg.type() === 'warning') consoleWarnings.push(msg.text())
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto(`${BASE}/?${query}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    window.__pendingMarker = 'loaded-once'
  })
  await page.waitForTimeout(400)
  return { page, consoleErrors, consoleWarnings, pageErrors }
}

// Read both lists off the SAME rendered page, so the overlap check compares
// what an admin is actually looking at rather than two fixtures.
const READ_ACCOUNTS = () => {
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim()
  const waitingCards = [...document.querySelectorAll('[data-testid="waiting-person"]')]
  const memberEmails = [...document.querySelectorAll('[data-testid="account-email"]')].map(text)
  // Read from the Give access button's aria-label ("Give access to <email>"),
  // not by regexing the card text: adjacent block spans concatenate without
  // whitespace in textContent ("No name yet" + the address), so a regex
  // returns a mangled email — and a mangled email would make the overlap
  // check below unable to spot a real member appearing in this section, which
  // is the one thing it exists to catch.
  const waitingEmails = waitingCards.map((card) => {
    const button = card.querySelector('button[aria-label^="Give access to "]')
    return button ? button.getAttribute('aria-label').replace('Give access to ', '') : null
  })
  return {
    sectionPresent: !!document.querySelector('[data-testid="waiting-for-access"]'),
    heading: [...document.querySelectorAll('h3')].map(text).includes('Waiting for access'),
    waitingCount: waitingCards.length,
    waitingEmails,
    waitingText: waitingCards.map(text),
    memberBlocks: document.querySelectorAll('[data-testid="account-person"]').length,
    memberRows: document.querySelectorAll('[data-testid="account-membership"]').length,
    memberEmails,
    // THE check: any member email showing up in the waiting section means the
    // subtraction is gone. Tested two ways — the extracted addresses, and a
    // substring sweep of the raw section text, so a parsing slip in the line
    // above cannot turn this green.
    overlap: waitingEmails.filter((email) => memberEmails.includes(email)),
    overlapInRawText: memberEmails.filter((email) =>
      waitingCards.some((card) => text(card).includes(email)),
    ),
    emptyState: document.body.textContent.includes('Nobody is waiting for access'),
    grantButtons: document.querySelectorAll('button[aria-label^="Give access to"]').length,
    marker: window.__pendingMarker ?? null,
  }
}

// --- 1. Waiting for access: the subtraction ----------------------------------
{
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    'scenario=accounts-pending',
  )

  const checks = await page.evaluate(READ_ACCOUNTS)
  // What the stub actually handed the screen, for the record: waitingCount
  // being smaller than this is the subtraction doing work.
  const profilesReturned = await page.evaluate(async () => {
    const mod = await import('/stubs/members.js')
    return (await mod.listPendingProfiles()).length
  })

  await page.screenshot({ path: path.join(outDir, 'waiting-list.png'), fullPage: true })
  results.push({
    shot: 'accounts-pending',
    profilesReturnedByStub: profilesReturned,
    checks,
    consoleErrors,
    consoleWarnings,
    pageErrors,
  })
  await page.close()
}

// --- 2. Granting moves the person, with no reload ----------------------------
{
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    'scenario=accounts-pending',
  )

  const before = await page.evaluate(READ_ACCOUNTS)

  // Omar is the middle card: granting the first row would also pass if the
  // splice keyed on index rather than profile id.
  const target = 'omar.farooq@adhq.example'
  await page.selectOption(`select[aria-label="Role for ${target}"]`, 'coach')
  await page.waitForTimeout(150)
  await page.selectOption(`select[aria-label="Age group for ${target}"]`, { label: 'U14 Boys' })
  await page.waitForTimeout(150)
  const midway = await page.evaluate(READ_ACCOUNTS)
  await page.screenshot({ path: path.join(outDir, 'grant-chosen.png'), fullPage: true })

  await page.click(`button[aria-label="Give access to ${target}"]`)
  await page.waitForTimeout(600)

  const after = await page.evaluate(() => {
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim()
    const blocks = [...document.querySelectorAll('[data-testid="account-person"]')]
    const omar = blocks.find((block) => text(block).includes('omar.farooq@adhq.example'))
    return {
      waitingCount: document.querySelectorAll('[data-testid="waiting-person"]').length,
      waitingEmails: [...document.querySelectorAll('button[aria-label^="Give access to "]')].map(
        (button) => button.getAttribute('aria-label').replace('Give access to ', ''),
      ),
      memberBlocks: blocks.length,
      memberRows: document.querySelectorAll('[data-testid="account-membership"]').length,
      omarInMemberList: !!omar,
      omarBlockText: omar ? text(omar) : null,
      // The granted row must carry the role AND the age group that were
      // chosen — a splice that dropped team_id would still add the block, and
      // still read as a pass on counts alone.
      omarRole: omar?.querySelector('select[aria-label^="Role for"]')?.value ?? null,
      omarTeamLabel: (() => {
        const select = omar?.querySelector('select[aria-label^="Age group for"]')
        if (!select) return null
        return select.selectedOptions[0]?.textContent.trim() ?? null
      })(),
      // Set once at load; a real page navigation would wipe it.
      marker: window.__pendingMarker ?? null,
      inlineErrors: [...document.querySelectorAll('[role="alert"]')].map(text),
    }
  })

  await page.screenshot({ path: path.join(outDir, 'grant-done.png'), fullPage: true })
  results.push({
    shot: 'grant',
    before: { waitingCount: before.waitingCount, memberBlocks: before.memberBlocks, memberRows: before.memberRows },
    midwayRoleSelected: midway.waitingCount,
    after,
    consoleErrors,
    consoleWarnings,
    pageErrors,
  })
  await page.close()
}

// --- 3. Empty state, and a failed profiles read ------------------------------
for (const [name, query] of [
  ['waiting-empty', 'scenario=accounts-pending&pending=none'],
  ['waiting-read-failed', 'scenario=accounts-pending&pendingThrow=1'],
]) {
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(query)
  const checks = await page.evaluate(READ_ACCOUNTS)
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true })
  results.push({ shot: name, checks, consoleErrors, consoleWarnings, pageErrors })
  await page.close()
}

// --- 4. The first-login name prompt ------------------------------------------
{
  const context = await browser.newContext({ viewport: VIEWPORT })
  const PROMPT_STATE = () => {
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim()
    const input = document.getElementById('name-prompt-full-name')
    const heading = [...document.querySelectorAll('h2, h3')]
      .map(text)
      .find((t) => t === 'What should we call you?')
    return {
      promptOpen: !!input,
      heading: heading ?? null,
      inputVisible: input ? input.getClientRects().length > 0 : false,
      saveButton: [...document.querySelectorAll('button')].map(text).includes('Save name'),
      skipButton: [...document.querySelectorAll('button')].map(text).includes('Not now'),
      skipFlag: window.localStorage.getItem('quins.namePromptSkipped'),
      // The app underneath must still be there — the prompt never blocks it.
      navPresent: !!document.querySelector('nav'),
      dashboardHeading: !!document.querySelector('h2'),
    }
  }

  // 4a. Control: a profile WITH a name must not be asked.
  {
    const { page, consoleErrors, pageErrors } = await openPage('scenario=name-prompt', context)
    const checks = await page.evaluate(PROMPT_STATE)
    await page.screenshot({ path: path.join(outDir, 'name-prompt-named.png'), fullPage: true })
    results.push({ shot: 'name-prompt:named-control', checks, consoleErrors, pageErrors })
    await page.close()
  }

  // 4b. Blank name -> prompt opens; typing and saving closes it.
  {
    const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
      'scenario=name-prompt&blankName=1',
      context,
    )
    const opened = await page.evaluate(PROMPT_STATE)
    await page.screenshot({ path: path.join(outDir, 'name-prompt-open.png'), fullPage: true })

    await page.fill('#name-prompt-full-name', 'Janice Muir')
    await page.click('button:has-text("Save name")')
    await page.waitForTimeout(500)
    const saved = await page.evaluate(PROMPT_STATE)
    await page.screenshot({ path: path.join(outDir, 'name-prompt-saved.png'), fullPage: true })

    results.push({
      shot: 'name-prompt:save',
      opened,
      saved,
      consoleErrors,
      consoleWarnings,
      pageErrors,
    })
    await page.close()
  }

  // 4c. Skip -> closes, records the flag, and does NOT reappear on the next
  // load in the same browser. The stub still returns a blank name on every
  // read (it is driven by the URL knob, not by the earlier save), so the only
  // thing that can keep the prompt shut here is the skip flag itself — which
  // is the honest test of the no-loop rule.
  {
    const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
      'scenario=name-prompt&blankName=1',
      context,
    )
    const reopened = await page.evaluate(PROMPT_STATE)
    await page.click('button:has-text("Not now")')
    await page.waitForTimeout(300)
    const skipped = await page.evaluate(PROMPT_STATE)
    await page.screenshot({ path: path.join(outDir, 'name-prompt-skipped.png'), fullPage: true })

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const afterReload = await page.evaluate(PROMPT_STATE)

    results.push({
      shot: 'name-prompt:skip',
      reopened,
      skipped,
      afterReload,
      consoleErrors,
      consoleWarnings,
      pageErrors,
    })
    await page.close()
  }

  await context.close()
}

// --- 5. Regression: pre-existing scenarios still render ----------------------
for (const scenario of ['roster-admin', 'schedule-admin', 'accounts-admin', 'view-as']) {
  const { page, consoleErrors, consoleWarnings, pageErrors } = await openPage(
    `scenario=${scenario}`,
  )
  const checks = await page.evaluate(() => ({
    rootChildCount: document.getElementById('root')?.children.length ?? 0,
    bodyTextLength: document.body.textContent.trim().length,
    hasNav: !!document.querySelector('nav'),
  }))
  await page.screenshot({ path: path.join(outDir, `regression-${scenario}.png`), fullPage: true })
  results.push({
    shot: `regression:${scenario}`,
    checks,
    consoleErrors,
    consoleWarnings,
    pageErrors,
  })
  await page.close()
}

await browser.close()
console.log(JSON.stringify(results, null, 2))
