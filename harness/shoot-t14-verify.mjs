// INDEPENDENT controller-side verification of Task 14 (EventForm/EventDetail).
// Written separately from shoot-eventform.mjs on purpose: this one types with
// real keystrokes, measures character loss, checks conditional fields are
// ABSENT (not hidden), counts clicks needed for delete, and reads back the
// exact UTC instant written under a hostile TZ.

import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task14-verify')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'
const HOSTILE_TZ = 'America/New_York'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const log = []
const note = (o) => log.push(o)

const probe = () =>
  ({
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    overflow: [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
    fields: Object.fromEntries(
      ['event-opponent', 'event-title', 'event-date', 'event-time', 'event-team', 'event-competition', 'event-venue', 'event-result-us', 'event-result-them'].map(
        (id) => [id, document.getElementById(id) ? document.getElementById(id).value : null],
      ),
    ),
    present: Object.fromEntries(
      ['event-opponent', 'event-title', 'event-competition', 'event-result-us'].map((id) => {
        const el = document.getElementById(id)
        if (!el) return [id, 'absent']
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return [id, `present ${r.width}x${r.height} vis=${cs.visibility} disp=${cs.display} op=${cs.opacity}`]
      }),
    ),
    teamOptions: [...(document.getElementById('event-team')?.options ?? [])].map((o) => o.text),
    activeId: document.activeElement?.id || document.activeElement?.tagName,
    alerts: [...document.querySelectorAll('[role="dialog"] [role="alert"]')].map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { text: el.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display, color: cs.color, bg: cs.backgroundColor }
    }),
    invalidFields: [...document.querySelectorAll('[role="dialog"] [aria-invalid="true"]')].map((el) => ({
      id: el.id,
      border: getComputedStyle(el).borderTopColor,
    })),
    segs: [...document.querySelectorAll('[role="dialog"] fieldset label > span')].map((el) => {
      const r = el.getBoundingClientRect()
      return { text: el.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }
    }),
    mutedColors: [
      ...new Set(
        [...document.querySelectorAll('[role="dialog"] label, [role="dialog"] legend, [role="dialog"] p, [role="dialog"] span')]
          .map((el) => getComputedStyle(el).color),
      ),
    ],
    dialogPadBottom: (() => {
      const d = document.querySelector('[role="dialog"]')
      const last = d?.lastElementChild
      return last ? getComputedStyle(last).paddingBottom : null
    })(),
    dialogBox: (() => {
      const d = document.querySelector('[role="dialog"]')
      if (!d) return null
      const r = d.getBoundingClientRect()
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), scrollH: d.scrollHeight }
    })(),
    writes: window.__writes ?? [],
    nativeDialogs: window.__nativeDialogs ?? [],
  })

const shot = async (page, name) => {
  const p = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: p })
  return p
}

const chromium = await loadChromium()
const browser = await chromium.launch()

async function newPage(vp, scenario) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, timezoneId: HOSTILE_TZ })
  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`))
  // If the app ever reaches for a native confirm()/alert(), Playwright would
  // hang. Auto-dismiss and record it as a defect instead.
  page.on('dialog', async (d) => {
    await page.evaluate((t) => { window.__nativeDialogs = (window.__nativeDialogs || []).concat(t) }, `${d.type()}: ${d.message()}`).catch(() => {})
    await d.dismiss().catch(() => {})
  })
  await page.goto(`${BASE}/?scenario=${scenario}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return { page, consoleMsgs }
}

const openAdd = async (page) => {
  await page.getByRole('button', { name: 'Add fixture' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400)
}

for (const vp of viewports) {
  // ---- 1/2/3: empty create form, real keystroke typing, type switching ----
  {
    const { page, consoleMsgs } = await newPage(vp, 'schedule')
    await openAdd(page)
    note({ step: '1-create-empty', vp: vp.name, file: await shot(page, `1-create-empty-${vp.name}`), probe: await page.evaluate(probe) })

    // Real keystrokes, one at a time — the stale-focus class of bug.
    const opp = page.locator('#event-opponent')
    await opp.click()
    await opp.pressSequentially('Sharjah RFC', { delay: 60 })
    await page.waitForTimeout(120)
    const midOpp = await opp.inputValue()
    const midActive = await page.evaluate(() => document.activeElement?.id)
    note({ step: '2a-typed-opponent', vp: vp.name, typed: 'Sharjah RFC', got: midOpp, match: midOpp === 'Sharjah RFC', focusAfter: midActive, file: await shot(page, `2a-typed-opponent-${vp.name}`) })

    const comp = page.locator('#event-competition')
    await comp.click()
    await comp.pressSequentially('West Asia Premiership', { delay: 40 })
    const midComp = await comp.inputValue()

    const us = page.locator('#event-result-us')
    await us.click()
    await us.pressSequentially('31', { delay: 60 })
    const them = page.locator('#event-result-them')
    await them.click()
    await them.pressSequentially('19', { delay: 60 })
    note({
      step: '2b-typed-scores', vp: vp.name,
      competition: { typed: 'West Asia Premiership', got: midComp, match: midComp === 'West Asia Premiership' },
      us: await us.inputValue(), them: await them.inputValue(),
      file: await shot(page, `2b-typed-scores-${vp.name}`),
    })

    // 3. type switching
    for (const t of ['Training', 'Social', 'Match']) {
      await page.getByRole('radio', { name: t }).click({ force: true })
      await page.waitForTimeout(200)
      note({ step: `3-type-${t.toLowerCase()}`, vp: vp.name, file: await shot(page, `3-type-${t.toLowerCase()}-${vp.name}`), probe: await page.evaluate(probe) })
    }
    note({ step: 'console-create', vp: vp.name, consoleMsgs })
    await page.close()
  }

  // ---- 4: validation with required fields empty ----
  {
    const { page, consoleMsgs } = await newPage(vp, 'schedule')
    await openAdd(page)
    // clear the prefilled date too, so date+time+opponent all fail
    await page.locator('#event-date').fill('')
    await page.getByRole('button', { name: 'Add event' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(200)
    note({ step: '4-validation', vp: vp.name, file: await shot(page, `4-validation-${vp.name}`), probe: await page.evaluate(probe) })
    note({ step: 'console-validation', vp: vp.name, consoleMsgs })
    await page.close()
  }

  // ---- 5: edit prefill under hostile TZ ----
  {
    const { page, consoleMsgs } = await newPage(vp, 'schedule')
    // e8 Sharjah Wanderers: 2026-07-30T15:00:00Z => Dubai 19:00 on 30 Jul.
    await page.locator('button', { hasText: 'Sharjah Wanderers' }).first().click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({
      step: '5-edit-prefill', vp: vp.name, file: await shot(page, `5-edit-prefill-${vp.name}`),
      storedUtc: '2026-07-30T15:00:00Z', expected: { date: '2026-07-30', time: '19:00' },
      got: { date: p.fields['event-date'], time: p.fields['event-time'] },
      newYorkWouldShow: '2026-07-30 / 11:00',
      probe: p,
    })

    // Now retype date/time and submit; read the UTC instant written.
    await page.locator('#event-date').fill('2026-08-01')
    await page.locator('#event-time').fill('20:00')
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(500)
    const writes = await page.evaluate(() => window.__writes ?? [])
    note({ step: '5b-edit-submit-utc', vp: vp.name, expectedStartsAt: '2026-08-01T16:00:00.000Z', writes, file: await shot(page, `5b-edit-submit-${vp.name}`) })
    note({ step: 'console-edit', vp: vp.name, consoleMsgs })
    await page.close()
  }

  // ---- 5c: create-path submit UTC ----
  {
    const { page, consoleMsgs } = await newPage(vp, 'schedule')
    await openAdd(page)
    await page.locator('#event-opponent').fill('Jebel Ali Dragons')
    await page.locator('#event-date').fill('2026-12-15')
    await page.locator('#event-time').fill('00:30')
    await page.getByRole('button', { name: 'Add event' }).click()
    await page.waitForTimeout(500)
    const writes = await page.evaluate(() => window.__writes ?? [])
    note({ step: '5c-create-submit-utc', vp: vp.name, expectedStartsAt: '2026-12-14T20:30:00.000Z', writes, consoleMsgs })
    await page.close()
  }

  // ---- 6: delete flow, click counting ----
  {
    const { page, consoleMsgs } = await newPage(vp, 'schedule')
    await page.locator('button', { hasText: 'Sharjah Wanderers' }).first().click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(300)
    note({ step: '6a-detail-footer', vp: vp.name, file: await shot(page, `6a-detail-footer-${vp.name}`) })

    await page.getByRole('button', { name: 'Delete' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await page.waitForTimeout(200)
    const afterFirst = await page.evaluate(() => ({
      writes: window.__writes ?? [],
      nativeDialogs: window.__nativeDialogs ?? [],
      buttons: [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent.trim()),
      confirmText: [...document.querySelectorAll('[role="dialog"] p')].map((p) => p.textContent.trim()).filter((t) => /delete/i.test(t)),
    }))
    note({ step: '6b-after-first-click', vp: vp.name, deletedAlready: afterFirst.writes.length > 0, ...afterFirst, file: await shot(page, `6b-delete-confirm-${vp.name}`) })

    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await page.waitForTimeout(500)
    const afterSecond = await page.evaluate(() => ({ writes: window.__writes ?? [], dialogOpen: !!document.querySelector('[role="dialog"]') }))
    note({ step: '6c-after-second-click', vp: vp.name, ...afterSecond, file: await shot(page, `6c-after-delete-${vp.name}`) })

    // "Keep it" path: does the first click reverse cleanly?
    note({ step: 'console-delete', vp: vp.name, consoleMsgs })
    await page.close()
  }

  // ---- 7: squad dropdown scoping ----
  for (const scenario of ['schedule-one-team', 'schedule-admin-15']) {
    const { page, consoleMsgs } = await newPage(vp, scenario)
    await openAdd(page)
    const p = await page.evaluate(probe)
    note({ step: `7-team-options-${scenario}`, vp: vp.name, count: p.teamOptions.length, options: p.teamOptions, file: await shot(page, `7-${scenario}-${vp.name}`), consoleMsgs })
    await page.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
