// INDEPENDENT controller-side verification of Task 16 (Availability RSVP /
// coach team-sheet). Same pattern as shoot-t15-verify.mjs: real Chromium,
// real keystrokes/clicks, real getComputedStyle/getBoundingClientRect
// measurements instead of eyeballing screenshots.

import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task16-availability')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const log = []
const note = (o) => log.push(o)

const probe = () => {
  const dialog = document.querySelector('[role="dialog"]')
  const rows = [...document.querySelectorAll('[role="dialog"] ul > li')]
  return {
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
    dialogText: dialog ? dialog.innerText.slice(0, 400) : null,
    heading: dialog?.querySelector('h3')?.textContent ?? null,
    statusRoles: [...document.querySelectorAll('[role="status"]')].map((el) => ({
      label: el.getAttribute('aria-label'),
      visible: getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden',
    })),
    rows: rows.map((li) => {
      const nameEl = li.querySelector('span.truncate') || li.querySelector('span')
      const buttons = [...li.querySelectorAll('button')]
      const rowRect = li.getBoundingClientRect()
      return {
        text: li.textContent.trim().slice(0, 80),
        name: nameEl ? nameEl.textContent : null,
        buttonCount: buttons.length,
        buttons: buttons.map((b) => {
          const r = b.getBoundingClientRect()
          const cs = getComputedStyle(b)
          return {
            text: b.textContent.trim(),
            disabled: b.disabled,
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            // Row-baseline check: is the button vertically centred with the
            // row (the "button as layout box" defect class), not floating
            // top-left / bottom of an oversized box.
            rowTop: Math.round(rowRect.top),
            rowHeight: Math.round(rowRect.height),
            centeredWithinRow: Math.abs(r.top + r.height / 2 - (rowRect.top + rowRect.height / 2)) < 6,
          }
        }),
        readOnlyLabel: (() => {
          const span = [...li.querySelectorAll('span')].find((s) => /No response|^In$|^Maybe$|^Out$/.test(s.textContent.trim()))
          if (!span || li.querySelector('button')) return null
          const cs = getComputedStyle(span)
          return { text: span.textContent.trim(), color: cs.color }
        })(),
      }
    }),
    // Any muted-style text colour actually rendered in this dialog, so the
    // #5c5854-vs-#77726e contrast question is answered from computed style,
    // not guessed from the source.
    mutedColors: [
      ...new Set(
        [...document.querySelectorAll('[role="dialog"] p, [role="dialog"] span')]
          .filter((el) => el.children.length === 0 && el.textContent.trim())
          .map((el) => getComputedStyle(el).color),
      ),
    ],
    jerseyAnywhere: /jersey|shirt number|squad number|\bno\.\s*\d/i.test(dialog?.innerText ?? ''),
    clickableRowCount: rows.filter((li) => li.querySelector('button')).length,
    totalRows: rows.length,
    writes: window.__writes ?? [],
    console: window.__consoleErrors ?? [],
  }
}

const shot = async (page, name) => {
  const p = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: p })
  return p
}

const chromium = await loadChromium()
const browser = await chromium.launch()

async function newPage(vp, query, opts = {}) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    timezoneId: opts.timezoneId,
  })
  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`))
  await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return { page, consoleMsgs }
}

for (const vp of viewports) {
  // ---- 1: coach — every row clickable, measure layout ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=coach&team=t1')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '1-coach-t1',
      shot: await shot(page, `${vp.name}-1-coach-t1`),
      heading: p.heading,
      totalRows: p.totalRows,
      clickableRowCount: p.clickableRowCount,
      rows: p.rows,
      mutedColors: p.mutedColors,
      jerseyAnywhere: p.jerseyAnywhere,
      overflow: p.overflow,
      docWidth: p.docWidth,
      innerWidth: p.innerWidth,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 2: admin — every row clickable ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=admin&team=t1')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '2-admin-t1',
      totalRows: p.totalRows,
      clickableRowCount: p.clickableRowCount,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 3: coach of the OTHER team only — zero clickable rows ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=coach-foreign&team=t1')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '3-coach-foreign',
      shot: await shot(page, `${vp.name}-3-coach-foreign`),
      totalRows: p.totalRows,
      clickableRowCount: p.clickableRowCount,
      rows: p.rows.map((r) => ({ name: r.name, buttonCount: r.buttonCount, readOnlyLabel: r.readOnlyLabel })),
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 4: parent, child on THIS roster — exactly one clickable row ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=parent-own&team=t1')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    const domCheck = await page.evaluate(() => ({
      buttonCountInDialog: document.querySelectorAll('[role="dialog"] ul button').length,
      querySelectorAllButtons: [...document.querySelectorAll('[role="dialog"] ul button')].map((b) => b.closest('li')?.querySelector('span.truncate')?.textContent),
    }))
    note({
      vp: vp.name,
      case: '4-parent-own-t1',
      shot: await shot(page, `${vp.name}-4-parent-own`),
      totalRows: p.totalRows,
      clickableRowCount: p.clickableRowCount,
      rows: p.rows.map((r) => ({ name: r.name, buttonCount: r.buttonCount })),
      domCheck,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 5: SAME parent, viewing t2 (child not on t2's roster) — zero clickable, verify absence not just hidden ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=parent-own&team=t2')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    const absenceCheck = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[role="dialog"] ul button')]
      return {
        querySelectorAllButtonCount: buttons.length,
        anyHiddenButtons: [...document.querySelectorAll('[role="dialog"] button')].filter((b) => {
          const cs = getComputedStyle(b)
          return cs.display === 'none' || cs.visibility === 'hidden'
        }).length,
      }
    })
    note({
      vp: vp.name,
      case: '5-parent-foreign-team',
      shot: await shot(page, `${vp.name}-5-parent-foreign-team`),
      totalRows: p.totalRows,
      clickableRowCount: p.clickableRowCount,
      absenceCheck,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 6: parent linked to THIS team but to a player id not on the roster — zero clickable ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=parent-foreign&team=t1')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '6-parent-mismatched-player-id',
      totalRows: p.totalRows,
      clickableRowCount: p.clickableRowCount,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 7: click In/Maybe/Out on a coach row; measure toggle rects at this viewport ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=availability&who=coach&team=t1')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const before = await page.evaluate(probe)
    const firstRow = page.locator('[role="dialog"] ul > li').first()
    await firstRow.getByRole('button', { name: 'Maybe' }).click()
    await page.waitForTimeout(300)
    const after = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '7-toggle-click',
      shot: await shot(page, `${vp.name}-7-after-toggle`),
      beforeFirstRow: before.rows[0],
      afterFirstRow: after.rows[0],
      writes: after.writes,
      console: consoleMsgs,
    })
    await page.close()
  }
}

// ---- 8: first-load vs refresh — hold the refetch open, confirm no spinner tears the tally out ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=schedule-admin',
  )
  await page.locator('button', { hasText: 'U12 Squad Training' }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(300)
  await page.getByRole('dialog').getByRole('button', { name: /set availability/i }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(500)
  const firstLoad = await page.evaluate(probe)

  // Simulate a realtime-triggered refetch that takes a while: navigate is not
  // an option (would remount), so instead trigger the subscribeAvailability
  // callback directly is not exposed here; the harness stub's realtime is a
  // no-op subscribe. Emulate the "refresh in flight" condition the report
  // claims a ref protects by re-running with the SAME event but delayed
  // fetch, and check the loading spinner is not shown once already settled.
  await page.close()

  const { page: page2, consoleMsgs: c2 } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=availability&who=coach&team=t1&availDelay=600',
  )
  await page2.waitForTimeout(150) // still loading — first-ever load SHOULD show a spinner
  const midFirstLoad = await page2.evaluate(probe)
  await page2.waitForTimeout(700)
  const settledFirstLoad = await page2.evaluate(probe)
  note({
    vp: 'desktop',
    case: '8a-first-load-spinner-then-settle',
    shot1: await shot(page2, 'desktop-8a-mid-first-load'),
    shot2: await shot(page2, 'desktop-8b-settled'),
    midFirstLoad: { statusRoles: midFirstLoad.statusRoles, heading: midFirstLoad.heading },
    settledFirstLoad: { statusRoles: settledFirstLoad.statusRoles, totalRows: settledFirstLoad.totalRows },
    console: c2,
  })
  await page2.close()

  note({ vp: 'desktop', case: '8-first-load-note', firstLoad: { statusRoles: firstLoad.statusRoles, heading: firstLoad.heading }, console: consoleMsgs })
}

// ---- 9: availabilityOpen reset race — switch events while Availability is open on the first ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=schedule-admin&playersDelay=500',
  )
  // Open event A (U12 Squad Training, team t1) and its Availability sheet.
  await page.locator('button', { hasText: 'U12 Squad Training' }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(200)
  await page.getByRole('dialog').getByRole('button', { name: /set availability/i }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(700) // let event A's roster settle fully first
  const stateA = await page.evaluate(probe)

  // Now force-click the OTHER team's fixture row underneath the open sheet
  // (a real click would fail actionability — the overlay covers it — so this
  // uses the DOM click() directly, exercising the same setSelectedEventId
  // code path any future caller could trigger while the sheet is open).
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('U14 Contact & Conditioning'))
    btn?.click()
  })

  // Capture immediately (same tick / next microtask) and then at short
  // intervals, to catch any frame where event B's header is shown together
  // with event A's stale roster/tally, or vice versa.
  const immediate = await page.evaluate(probe)
  await page.waitForTimeout(50)
  const at50 = await page.evaluate(probe)
  await page.waitForTimeout(150)
  const at200 = await page.evaluate(probe)
  await page.waitForTimeout(600)
  const settled = await page.evaluate(probe)

  note({
    vp: 'desktop',
    case: '9-availabilityOpen-race',
    shotSettled: await shot(page, 'desktop-9-settled'),
    stateA: { heading: stateA.heading, totalRows: stateA.totalRows },
    immediate: { heading: immediate.heading, dialogText: immediate.dialogText?.slice(0, 200) },
    at50: { heading: at50.heading, dialogText: at50.dialogText?.slice(0, 200) },
    at200: { heading: at200.heading, dialogText: at200.dialogText?.slice(0, 200) },
    settled: { heading: settled.heading, totalRows: settled.totalRows, dialogText: settled.dialogText?.slice(0, 200) },
    console: consoleMsgs,
  })
  await page.close()
}

// ---- 10: EventDetail entry-point button visible/clickable for a parent (cannot edit fixture) ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'mobile', width: 375, height: 812 },
    '?scenario=schedule-parent',
  )
  await page.locator('button', { hasText: 'Dubai Exiles' }).first().click().catch(() => {})
  // schedule-parent scope is only team t1's fixtures; find whichever
  // unscored fixture row is present.
  const rows = await page.getByRole('button').all()
  const dialogOpenedAlready = await page.getByRole('dialog').count()
  if (dialogOpenedAlready === 0) {
    await page.locator('button', { hasText: 'U12 Squad Training' }).first().click()
  }
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(300)
  const dialog = page.getByRole('dialog')
  const setBtn = dialog.getByRole('button', { name: /set my availability/i })
  const count = await setBtn.count()
  let clickable = false
  let clickError = null
  if (count > 0) {
    try {
      await setBtn.click({ trial: true })
      clickable = true
    } catch (e) {
      clickError = e.message
    }
  }
  note({
    vp: 'mobile',
    case: '10-parent-entry-point',
    shot: await shot(page, 'mobile-10-parent-entry-point'),
    buttonPresent: count > 0,
    clickable,
    clickError,
    console: consoleMsgs,
  })
  await page.close()
}

// ---- 11: Dubai-anchored date/time under a hostile TZ ----
{
  const { page, consoleMsgs } = await newPage(
    { name: 'desktop', width: 1280, height: 900 },
    '?scenario=availability&who=coach&team=t1',
    { timezoneId: 'America/New_York' },
  )
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400)
  const tzInfo = await page.evaluate(() => ({
    subline: document.querySelector('[role="dialog"] p')?.textContent ?? null,
    browserTZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }))
  note({
    vp: 'desktop',
    case: '11-hostile-tz',
    shot: await shot(page, 'desktop-11-hostile-tz'),
    tzInfo,
    console: consoleMsgs,
  })
  await page.close()
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
