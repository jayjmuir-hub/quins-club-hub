// INDEPENDENT controller-side verification of Task 17 (Admin overview). Same
// pattern as shoot-availability.mjs: real Chromium, real clicks, real
// getComputedStyle/getBoundingClientRect measurements instead of eyeballing
// screenshots.

import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task17-admin')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const log = []
const note = (o) => log.push(o)

const probe = () => {
  const jerseyRe = /jersey|shirt number|squad number/i
  const bodyText = document.body.innerText
  const teamRows = [...document.querySelectorAll('[data-testid="member-row"]')]
  return {
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
    bodyTextSnippet: bodyText.slice(0, 600),
    notAuthorised: /not authorised/i.test(bodyText),
    heading: document.querySelector('h2')?.textContent ?? null,
    manageLinks: [...document.querySelectorAll('a[href="/roster"], a[href="/schedule"]')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim(),
    })),
    statusRoles: [...document.querySelectorAll('[role="status"]')].map((el) => ({
      label: el.getAttribute('aria-label'),
    })),
    alertRoles: [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent.trim().slice(0, 200)),
    navItemCount: document.querySelectorAll('nav[aria-label="Primary"] a').length,
    navLabels: [...document.querySelectorAll('nav[aria-label="Primary"] a span')].map((s) => s.textContent),
    jerseyAnywhere: jerseyRe.test(bodyText),
    memberRowCount: teamRows.length,
    memberInitials: [...document.querySelectorAll('[data-testid="member-row"] [aria-hidden="true"]')].map(
      (s) => s.textContent,
    ),
    console: window.__consoleErrors ?? [],
  }
}

const shot = async (page, name) => {
  const p = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: p, fullPage: true })
  return p
}

const chromium = await loadChromium()
const browser = await chromium.launch()

async function newPage(vp, query, pathname = '') {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`))
  await page.goto(`${BASE}${pathname}/${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return { page, consoleMsgs }
}

// Measure a set of elements' rects + computed color, given a page-level
// selector list built from data already probed.
async function measureRows(page, selector) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((row) => {
      const rowRect = row.getBoundingClientRect()
      const link = row.querySelector('a, button')
      const linkRect = link ? link.getBoundingClientRect() : null
      return {
        text: row.textContent.trim().slice(0, 60),
        rowTop: Math.round(rowRect.top),
        rowHeight: Math.round(rowRect.height),
        linkRect: linkRect
          ? {
              x: Math.round(linkRect.left),
              y: Math.round(linkRect.top),
              w: Math.round(linkRect.width),
              h: Math.round(linkRect.height),
              centeredWithinRow: Math.abs(
                linkRect.top + linkRect.height / 2 - (rowRect.top + rowRect.height / 2),
              ) < 6,
            }
          : null,
      }
    })
  }, selector)
}

for (const vp of viewports) {
  // ---- 1: admin — real overview shows ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=admin&who=admin')
    await page.waitForSelector('h2')
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)

    // Manage links: measure whether the two <a> tags are properly laid out
    // (flex/centered) not defaulting to a block box with content pinned
    // top-left (the "button as layout box" trap).
    const manageMeasure = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a[href="/roster"], a[href="/schedule"]')]
      return links.map((a) => {
        const r = a.getBoundingClientRect()
        const cs = getComputedStyle(a)
        // Where is the text actually rendered vs the box's vertical/horizontal center?
        const range = document.createRange()
        range.selectNodeContents(a)
        const textRect = range.getBoundingClientRect()
        return {
          href: a.getAttribute('href'),
          box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
          display: cs.display,
          justifyContent: cs.justifyContent,
          alignItems: cs.alignItems,
          textCenteredV: Math.abs(textRect.top + textRect.height / 2 - (r.top + r.height / 2)) < 6,
          textCenteredH: Math.abs(textRect.left + textRect.width / 2 - (r.left + r.width / 2)) < 20,
        }
      })
    })

    // Team rows layout measurement (not links/buttons themselves, but check
    // the count text is vertically aligned with the team name, i.e. no
    // layout-box defect on the flex row).
    const teamRowMeasure = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('h3 ~ div.overflow-hidden > div, div.overflow-hidden > div')].slice(0, 20)
      return rows.slice(0, 3).map((row) => {
        const spans = [...row.querySelectorAll('span')]
        const rects = spans.map((s) => s.getBoundingClientRect())
        return {
          text: row.textContent.trim().slice(0, 40),
          spanTops: rects.map((r) => Math.round(r.top)),
          rowHeight: Math.round(row.getBoundingClientRect().height),
        }
      })
    })

    // Contrast: compute color for every muted-looking leaf text node.
    const mutedColors = await page.evaluate(() => {
      return [
        ...new Set(
          [...document.querySelectorAll('h3, p, span')]
            .filter((el) => el.children.length === 0 && el.textContent.trim())
            .map((el) => getComputedStyle(el).color),
        ),
      ]
    })

    // Mobile-only: confirm the bottom tab bar doesn't obscure the last row
    // of the Club members list, and check there's no double-scrollbar (the
    // content scrolls with the page, not in some inner scroll container).
    let bottomTabCheck = null
    if (vp.name === 'mobile') {
      bottomTabCheck = await page.evaluate(() => {
        const navRect = document.querySelector('nav[aria-label="Primary"]').getBoundingClientRect()
        const rows = [...document.querySelectorAll('[data-testid="member-row"]')]
        const lastRow = rows[rows.length - 1]
        // Scroll main content to the very bottom, then re-measure.
        window.scrollTo(0, document.body.scrollHeight)
        const lastRowRectAfterScroll = lastRow.getBoundingClientRect()
        return {
          navTop: Math.round(navRect.top),
          navHeight: Math.round(navRect.height),
          lastRowBottomBeforeScroll: Math.round(lastRow.getBoundingClientRect().bottom),
          lastRowBottomAfterScroll: Math.round(lastRowRectAfterScroll.bottom),
          viewportHeight: window.innerHeight,
          lastRowFullyAboveNav: lastRowRectAfterScroll.bottom <= navRect.top + 1,
          bodyScrollHeight: document.body.scrollHeight,
          docScrollHeight: document.documentElement.scrollHeight,
        }
      })
    }

    note({
      vp: vp.name,
      case: '1-admin-overview',
      shot: await shot(page, `${vp.name}-1-admin-overview`),
      bottomTabCheck,
      heading: p.heading,
      bodyTextSnippet: p.bodyTextSnippet,
      manageLinks: p.manageLinks,
      manageMeasure,
      teamRowMeasure,
      mutedColors,
      memberRowCount: p.memberRowCount,
      memberInitials: p.memberInitials,
      jerseyAnywhere: p.jerseyAnywhere,
      navItemCount: p.navItemCount,
      navLabels: p.navLabels,
      overflow: p.overflow,
      docWidth: p.docWidth,
      innerWidth: p.innerWidth,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 2,3,4: coach/parent/player all see ONLY "not authorised", zero admin data ----
  for (const who of ['coach', 'parent', 'player']) {
    const { page, consoleMsgs } = await newPage(vp, `?scenario=admin&who=${who}`)
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: `2-not-authorised-${who}`,
      shot: vp.name === 'mobile' ? await shot(page, `${vp.name}-2-not-authorised-${who}`) : undefined,
      notAuthorised: p.notAuthorised,
      bodyTextSnippet: p.bodyTextSnippet,
      memberRowCount: p.memberRowCount,
      manageLinks: p.manageLinks,
      hasAgeGroupsHeading: /Age groups/i.test(p.bodyTextSnippet),
      hasClubMembersHeading: /Club members/i.test(p.bodyTextSnippet),
      console: consoleMsgs,
    })
    await page.close()
  }
}

// ---- 5: nav integrity — exactly 4 items, unchanged, on the admin route ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=admin&who=admin',
  )
  await page.waitForTimeout(300)
  const p = await page.evaluate(probe)
  note({
    vp: 'desktop',
    case: '5-nav-integrity',
    navItemCount: p.navItemCount,
    navLabels: p.navLabels,
    console: consoleMsgs,
  })
  await page.close()
}

// ---- 6: loading spinner then settle (delayed players+members fetch) ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=admin&who=admin&playersDelay=1800&membersDelay=1800',
  )
  // newPage() already waits 300ms past load before returning; check
  // immediately — still well inside the 1800ms delay window.
  const mid = await page.evaluate(probe)
  const midShot = await shot(page, 'desktop-6a-mid-loading')
  await page.waitForTimeout(1800)
  const settled = await page.evaluate(probe)
  const settledShot = await shot(page, 'desktop-6b-settled')
  note({
    vp: 'desktop',
    case: '6-loading-then-settle',
    midShot,
    settledShot,
    midStatusRoles: mid.statusRoles,
    midBodySnippet: mid.bodyTextSnippet,
    settledStatusRoles: settled.statusRoles,
    settledMemberRowCount: settled.memberRowCount,
    console: consoleMsgs,
  })
  await page.close()
}

// ---- 7: error state + working retry ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=admin&who=admin&membersThrow=1&membersDelay=500',
  )
  await page.waitForTimeout(700)
  const errState = await page.evaluate(probe)
  const errShot = await shot(page, 'desktop-7a-error')

  // Click retry. Since membersThrow/membersDelay stay in the URL (we can't
  // change them from the page), retry will legitimately fail AGAIN after the
  // same 500ms delay — which is exactly how we prove it actually re-fetches
  // (a real spinner reappears mid-flight) rather than just re-rendering
  // stale state.
  const retryBtn = page.getByRole('button', { name: /try again/i })
  const retryCount = await retryBtn.count()
  let sawSpinnerOnRetry = false
  if (retryCount > 0) {
    await retryBtn.click()
    await page.waitForTimeout(150)
    const justAfterClick = await page.evaluate(probe)
    sawSpinnerOnRetry = justAfterClick.statusRoles.length > 0 || /Loading/i.test(justAfterClick.bodyTextSnippet)
    await page.waitForTimeout(600)
  }
  const afterRetry = await page.evaluate(probe)
  const afterRetryShot = await shot(page, 'desktop-7b-after-retry')

  note({
    vp: 'desktop',
    case: '7-error-and-retry',
    errShot,
    afterRetryShot,
    errAlertRoles: errState.alertRoles,
    retryButtonPresent: retryCount > 0,
    sawSpinnerOnRetry,
    afterRetryAlertRoles: afterRetry.alertRoles,
    console: consoleMsgs,
  })
  await page.close()
}

// ---- 8: Manage links — real navigation, SPA vs hard reload ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=admin-nav',
    '/more',
  )
  await page.waitForTimeout(300)

  // Roster link.
  await page.evaluate(() => {
    window.__navMarker = 'harness-loaded'
  })
  const beforeUrl = page.url()
  await page.getByRole('link', { name: /manage roster/i }).click()
  await page.waitForTimeout(400)
  const afterRosterUrl = page.url()
  const markerAfterRoster = await page.evaluate(() => window.__navMarker).catch(() => undefined)

  // Go back to /more the same client-routed way is not available (no nav
  // link to admin visible on Roster necessarily) — reload the admin-nav URL
  // fresh instead for the schedule-link check, to keep the two checks
  // independent.
  const { page: page2, consoleMsgs: c2 } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=admin-nav',
    '/more',
  )
  await page2.waitForTimeout(300)
  await page2.evaluate(() => {
    window.__navMarker = 'harness-loaded'
  })
  await page2.getByRole('link', { name: /manage schedule/i }).click()
  await page2.waitForTimeout(400)
  const afterScheduleUrl = page2.url()
  const markerAfterSchedule = await page2.evaluate(() => window.__navMarker).catch(() => undefined)

  note({
    vp: 'desktop',
    case: '8-manage-links-navigation',
    beforeUrl,
    afterRosterUrl,
    markerAfterRoster,
    rosterNavWasHardReload: markerAfterRoster !== 'harness-loaded',
    afterScheduleUrl,
    markerAfterSchedule,
    scheduleNavWasHardReload: markerAfterSchedule !== 'harness-loaded',
    console: [...consoleMsgs, ...c2],
  })
  await page.close()
  await page2.close()
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
