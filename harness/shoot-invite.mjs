// INDEPENDENT controller-side verification of Task 18 (Invite flow).
// Priority 1 is the cross-route AppShell-remount flash/jank risk flagged by
// the code reviewer (App.jsx restructured from one shared <AppShell><Routes>
// to per-route <AppShell> wrapping); the rest follows the task brief's
// checklist for the invite-creation and invite-acceptance screens.

import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task18-invite')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'

const log = []
const note = (o) => log.push(o)

async function newPage(browser, vp, pathname, query, opts = {}) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`))
  const requests = []
  page.on('request', (r) => requests.push({ url: r.url(), resourceType: r.resourceType() }))
  await page.goto(`${BASE}${pathname}${query}`, { waitUntil: opts.waitUntil ?? 'networkidle' })
  await page.waitForTimeout(opts.settle ?? 300)
  return { page, consoleMsgs, requests }
}

const shot = async (page, name) => {
  const p = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: p })
  return p
}

function overflowProbe() {
  return {
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
  }
}

const chromium = await loadChromium()
const browser = await chromium.launch()

// ============================================================
// 1. TOP PRIORITY — cross-route navigation flash/jank check
// ============================================================
{
  const vp = { width: 1280, height: 900 }
  const { page, consoleMsgs, requests } = await newPage(browser, vp, '/', '?scenario=full-app')
  await page.waitForSelector('nav[aria-label="Primary"]')
  requests.length = 0 // reset so only post-load navigations count below

  const pairs = [
    { from: 'Home', to: 'Schedule', link: /^Schedule$/ },
    { from: 'Schedule', to: 'Roster', link: /^Roster$/ },
    { from: 'Roster', to: 'More', link: /^More$/ },
    { from: 'More', to: 'Home', link: /^Home$/ },
  ]

  const navResults = []
  for (const pair of pairs) {
    // Focus the target nav link first via keyboard-equivalent DOM focus,
    // then click it, to also observe focus behaviour across the remount.
    const before = await shot(page, `nav-${pair.from}-to-${pair.to}-before`)

    // Header signature before the click: crest src, gradient computed bg,
    // nav active label — used to diff against post-click frames.
    const headerBefore = await page.evaluate(() => {
      const header = document.querySelector('header')
      const crest = document.querySelector('header img')
      const activeLink = document.querySelector('nav[aria-label="Primary"] a[aria-current="page"]')
      return {
        headerPresent: !!header,
        headerBg: header ? getComputedStyle(header).backgroundImage.slice(0, 40) : null,
        crestSrc: crest?.getAttribute('src') ?? null,
        crestComplete: crest?.complete ?? null,
        activeLinkText: activeLink?.textContent?.trim() ?? null,
      }
    })

    const link = page.getByRole('link', { name: pair.link })
    await link.focus()
    const focusedBeforeClick = await page.evaluate(() => document.activeElement?.tagName)

    await link.click()

    // Capture frames at 0ms, 16ms, 50ms, 150ms after the click resolves.
    const frames = {}
    for (const delayMs of [0, 16, 50, 150]) {
      if (delayMs > 0) await page.waitForTimeout(delayMs)
      frames[`t${delayMs}`] = await page.evaluate(() => {
        const header = document.querySelector('header')
        const crest = document.querySelector('header img')
        const main = document.querySelector('main')
        const activeLink = document.querySelector('nav[aria-label="Primary"] a[aria-current="page"]')
        return {
          headerPresent: !!header,
          headerVisible: header ? getComputedStyle(header).visibility !== 'hidden' && header.getBoundingClientRect().height > 0 : false,
          crestSrc: crest?.getAttribute('src') ?? null,
          crestComplete: crest?.complete ?? null,
          mainEmpty: main ? main.textContent.trim().length === 0 : null,
          activeLinkText: activeLink?.textContent?.trim() ?? null,
          bodyBlank: document.body.textContent.trim().length === 0,
          activeElementTag: document.activeElement?.tagName,
          activeElementIsBody: document.activeElement === document.body,
        }
      })
    }

    const after = await shot(page, `nav-${pair.from}-to-${pair.to}-after`)

    navResults.push({
      pair: `${pair.from} -> ${pair.to}`,
      headerBefore,
      focusedBeforeClick,
      frames,
      before,
      after,
    })
  }

  // Rapid repeated navigation: click through all 4 routes quickly, 5+ times,
  // watching for console/page errors specifically under rapid remounts.
  const rapidConsoleBefore = consoleMsgs.length
  for (let i = 0; i < 6; i++) {
    await page.getByRole('link', { name: /^Schedule$/ }).click()
    await page.getByRole('link', { name: /^Roster$/ }).click()
    await page.getByRole('link', { name: /^More$/ }).click()
    await page.getByRole('link', { name: /^Home$/ }).click()
  }
  await page.waitForTimeout(300)
  const rapidNewConsoleMsgs = consoleMsgs.slice(rapidConsoleBefore)

  // Crest network-request measurement: did <img src={crest}> issue a new
  // network request on every navigation, or is it cache-served?
  const crestRequests = requests.filter((r) => /crest/i.test(r.url))

  note({
    case: '1-cross-route-nav-flash-jank',
    navResults,
    rapidNavConsoleErrors: rapidNewConsoleMsgs,
    crestRequestCount: crestRequests.length,
    crestRequestUrls: [...new Set(crestRequests.map((r) => r.url))],
    initialConsoleErrors: consoleMsgs.slice(0, rapidConsoleBefore),
  })
  await page.close()
}

// ============================================================
// 2 & 3. /accept-invite/:token routing fix + successful accept flow
// ============================================================
{
  const vp = { width: 1280, height: 900 }
  const { page, consoleMsgs } = await newPage(
    browser,
    vp,
    '/accept-invite/tok-good-1234',
    '?scenario=full-app&start=none&acceptDelay=700',
    { settle: 50 },
  )

  // Immediately after load (well inside the 700ms accept delay): confirm the
  // REAL AcceptInvite screen renders, NOT NoMembershipState / AppShell chrome.
  const midState = await page.evaluate(() => {
    const bodyText = document.body.innerText
    return {
      hasHeader: !!document.querySelector('header'),
      hasNav: !!document.querySelector('nav[aria-label="Primary"]'),
      hasNoMembershipHeading: /You.re signed in/.test(bodyText),
      hasAcceptingText: /Accepting your invite/i.test(bodyText),
      bodyTextSnippet: bodyText.slice(0, 300),
      overflow: {
        innerWidth: window.innerWidth,
        docWidth: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
      },
    }
  })
  const midShot = await shot(page, '2-accept-invite-loading-unchromed')

  // Wait past the 700ms accept delay + reload()-then-Navigate to "/".
  await page.waitForTimeout(900)
  const settledUrl = page.url()
  const settledState = await page.evaluate(() => {
    const bodyText = document.body.innerText
    return {
      hasHeader: !!document.querySelector('header'),
      hasNav: !!document.querySelector('nav[aria-label="Primary"]'),
      hasNoMembershipHeading: /You.re signed in/.test(bodyText),
      dashboardVisible: /Dashboard|Upcoming|Quick actions/i.test(bodyText) || !!document.querySelector('h2'),
      bodyTextSnippet: bodyText.slice(0, 400),
    }
  })
  const settledShot = await shot(page, '3-accept-invite-success-redirected-to-dashboard')

  note({
    case: '2-3-accept-invite-routing-and-success-flow',
    url: page.url(),
    midShot,
    midState,
    settledUrl,
    settledShot,
    settledState,
    console: consoleMsgs,
  })
  await page.close()
}

// ============================================================
// 4. Failed accept flow, at both 375px and 1280px
// ============================================================
for (const vp of [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]) {
  const { page, consoleMsgs } = await newPage(
    browser,
    vp,
    '/accept-invite/tok-bad-9999',
    `?scenario=full-app&start=none&acceptThrow=1&acceptError=${encodeURIComponent(
      'This invite has already been used.',
    )}`,
  )
  await page.waitForTimeout(300)
  const state = await page.evaluate(() => {
    const alertEl = document.querySelector('[role="alert"]')
    return {
      alertText: alertEl?.textContent?.trim() ?? null,
      alertPresent: !!alertEl,
      overflow: {
        innerWidth: window.innerWidth,
        docWidth: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
      },
    }
  })
  const shotPath = await shot(page, `4-accept-invite-error-${vp.name}`)
  note({
    case: `4-accept-invite-failure-${vp.name}`,
    state,
    shotPath,
    console: consoleMsgs,
  })
  await page.close()
}

// ============================================================
// 5. InviteForm in the Sheet, opened from Admin.jsx
// ============================================================
{
  const vp = { width: 1280, height: 900 }
  const { page, consoleMsgs } = await newPage(browser, vp, '/', '?scenario=admin&who=admin')
  await page.waitForSelector('h2')
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: /invite a member/i }).click()
  await page.waitForTimeout(250)
  const openShot = await shot(page, '5a-invite-sheet-open')

  const domState = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const teamSelect = document.getElementById('invite-team')
    const roleSelect = document.getElementById('invite-role')
    const mutedEls = [...document.querySelectorAll('label, p')].filter(
      (el) => el.children.length === 0 && el.textContent.trim(),
    )
    const mutedColors = [...new Set(mutedEls.map((el) => getComputedStyle(el).color))]
    return {
      dialogPresent: !!dialog,
      teamFieldPresentInitially: !!teamSelect,
      roleValue: roleSelect?.value ?? null,
      mutedColors,
      playerSelectPresent: !!document.getElementById('invite-player'),
      playerOptionsText: [...document.querySelectorAll('#invite-player option')].map((o) => o.textContent),
    }
  })

  // Switch role to admin: confirm the age-group field is genuinely ABSENT
  // from the DOM (not just CSS-hidden).
  await page.selectOption('#invite-role', 'admin')
  await page.waitForTimeout(150)
  const afterAdminSwitch = await page.evaluate(() => ({
    teamFieldInDom: !!document.getElementById('invite-team'),
    teamFieldOuterHTMLIfPresent: document.getElementById('invite-team')?.outerHTML ?? null,
  }))
  const adminSwitchShot = await shot(page, '5b-invite-sheet-role-admin')

  // Switch back to coach + pick a team to check the player picker for
  // jersey numbers.
  await page.selectOption('#invite-role', 'coach')
  await page.waitForTimeout(100)
  const teamOptions = await page.evaluate(() =>
    [...document.querySelectorAll('#invite-team option')].map((o) => ({ value: o.value, text: o.textContent })),
  )
  const firstRealTeam = teamOptions.find((o) => o.value)
  if (firstRealTeam) {
    await page.selectOption('#invite-team', firstRealTeam.value)
    await page.waitForTimeout(400)
  }
  const playerPickerState = await page.evaluate(() => {
    const sel = document.getElementById('invite-player')
    return {
      present: !!sel,
      optionsText: sel ? [...sel.querySelectorAll('option')].map((o) => o.textContent) : [],
      jerseyAnywhere: /jersey|shirt number|squad number|#\d/i.test(document.body.innerText),
    }
  })

  // Fill email + submit to reach the success state, then verify the accept
  // link input is genuinely focus-to-select.
  await page.fill('#invite-email', 'new.parent@example.com')
  await page.getByRole('button', { name: /send invite/i }).click()
  await page.waitForTimeout(300)
  const successShot = await shot(page, '5c-invite-sheet-success-link')
  const linkFieldState = await page.evaluate(() => {
    const input = document.getElementById('invite-link')
    return {
      present: !!input,
      value: input?.value ?? null,
      readOnly: input?.readOnly ?? null,
    }
  })

  // Click into the read-only input; confirm focus-to-select actually
  // selects the text (selectionStart/End span the whole value).
  await page.click('#invite-link')
  await page.waitForTimeout(100)
  const selectionState = await page.evaluate(() => {
    const input = document.getElementById('invite-link')
    return {
      selectionStart: input?.selectionStart,
      selectionEnd: input?.selectionEnd,
      valueLength: input?.value?.length,
      isFullSelection: input && input.selectionStart === 0 && input.selectionEnd === input.value.length,
    }
  })

  note({
    case: '5-invite-form-in-sheet',
    openShot,
    domState,
    afterAdminSwitch,
    adminSwitchShot,
    playerPickerState,
    successShot,
    linkFieldState,
    selectionState,
    console: consoleMsgs,
  })
  await page.close()
}

// ============================================================
// 6. No horizontal overflow at 375px on InviteForm + AcceptInvite; general
//    console-error sweep across every case above is folded into each note().
// ============================================================
{
  const vp = { name: 'mobile', width: 375, height: 812 }
  const { page, consoleMsgs } = await newPage(browser, vp, '/', '?scenario=admin&who=admin')
  await page.waitForSelector('h2')
  await page.getByRole('button', { name: /invite a member/i }).click()
  await page.waitForTimeout(250)
  const overflow = await page.evaluate(overflowProbe)
  const shotPath = await shot(page, '6-invite-sheet-375px')
  note({
    case: '6-invite-form-375px-overflow',
    overflow,
    shotPath,
    console: consoleMsgs,
  })
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
