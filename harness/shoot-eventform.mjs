import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Task 14 visual + behavioural verification of src/screens/EventForm.jsx and
// the Edit/Delete footer it opens from.
//
// The browser context runs in America/New_York on purpose. The form's job on
// submit is to read the typed date and time as ABU DHABI wall-clock; under a
// UTC browser a naive implementation looks correct, under New York it is
// four hours out. The `writes` field recorded per shot is what the form
// actually handed to the data layer, so the timezone claim is measured in a
// real browser rather than only in jsdom.
//
// Also measured per shot: horizontal overflow at 375px, the computed colours
// of the form's muted labels (the --muted-on-paper contrast defect that has
// shipped twice), and the geometry of the segmented-control options (the
// button-as-layout-box misalignment trap — these are <span>s precisely to
// avoid it, and this is the check that proves it).

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task14')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const openAddForm = async (page) => {
  await page.getByRole('button', { name: 'Add fixture' }).click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(350)
}

const openEditForm = async (page) => {
  await page.locator('button', { hasText: 'Sharjah Wanderers' }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.waitForTimeout(350)
}

const shots = [
  // The sheet is position:fixed, so a fullPage shot renders it clipped at
  // viewport height with the page behind it running on — every form shot is
  // viewport-only, with an explicit scrolled variant for the lower half.
  { file: 'add-match', scenario: 'schedule', viewportOnly: true, steps: openAddForm },
  {
    file: 'add-match-scrolled',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openAddForm(page)
      await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await page.waitForTimeout(200)
    },
  },
  {
    file: 'add-training',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openAddForm(page)
      await page.getByRole('radio', { name: 'Training' }).click({ force: true })
      await page.waitForTimeout(150)
    },
  },
  {
    file: 'add-away',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openAddForm(page)
      await page.getByRole('radio', { name: 'Away' }).click({ force: true })
      await page.waitForTimeout(150)
    },
  },
  {
    file: 'validation',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openAddForm(page)
      await page.getByRole('button', { name: 'Add event' }).click()
      await page.waitForTimeout(150)
    },
  },
  {
    // The load-bearing one: type a real Abu Dhabi kick-off from a New York
    // browser and read back what the form wrote.
    file: 'typed-and-saved',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openAddForm(page)
      await page.getByLabel('Opponent').fill('Jebel Ali Dragons')
      await page.getByLabel('Date').fill('2026-07-30')
      await page.getByLabel('Time').fill('20:00')
      await page.getByLabel('Venue').fill('The Sevens, Dubai')
      await page.waitForTimeout(100)
      await page.getByRole('button', { name: 'Add event' }).click()
      await page.waitForTimeout(350)
    },
  },
  {
    // Sheet used to re-run its focus effect on every render, yanking focus
    // out of the field after each character. fill() would not catch that;
    // pressSequentially types one key at a time, like a person.
    file: 'typed-slowly',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openAddForm(page)
      await page.getByLabel('Opponent').pressSequentially('Jebel Ali Dragons', { delay: 25 })
      await page.getByLabel('Competition').pressSequentially('West Asia Premiership', { delay: 25 })
      await page.waitForTimeout(150)
    },
  },
  { file: 'edit-match', scenario: 'schedule', viewportOnly: true, steps: openEditForm },
  {
    file: 'edit-match-scrolled',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await openEditForm(page)
      await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await page.waitForTimeout(200)
    },
  },
  {
    file: 'detail-footer',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await page.locator('button', { hasText: 'Sharjah Wanderers' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await page.waitForTimeout(350)
    },
  },
  {
    file: 'delete-confirm',
    scenario: 'schedule',
    viewportOnly: true,
    steps: async (page) => {
      await page.locator('button', { hasText: 'Sharjah Wanderers' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('button', { name: 'Delete' }).click()
      await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await page.waitForTimeout(250)
    },
  },
  {
    file: 'detail-footer-parent',
    scenario: 'schedule-parent',
    viewportOnly: true,
    steps: async (page) => {
      await page.locator('button', { hasText: 'Sharjah Wanderers' }).first().click()
      await page.getByRole('dialog').waitFor()
      await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await page.waitForTimeout(350)
    },
  },
  { file: 'schedule-head-admin', scenario: 'schedule-admin', steps: async () => {} },
  { file: 'schedule-head-parent', scenario: 'schedule-parent', steps: async () => {} },
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
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      timezoneId: 'America/New_York',
    })
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
      const overflowing = [...document.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 6)
        .map((el) => `${el.tagName}.${el.className?.toString?.().slice(0, 50)}`)

      const panel = document.querySelector('[role="dialog"]')
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        }
      }

      // Segmented-control options: same size, same baseline, text top-aligned
      // the same way in each. A <button> laid out as a box would centre its
      // content and break exactly this.
      const segs = [...document.querySelectorAll('fieldset label > span')].map((el) => ({
        text: el.textContent.trim(),
        ...box(el),
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
        borderColor: getComputedStyle(el).borderTopColor,
        textAlign: getComputedStyle(el).textAlign,
      }))

      const labels = [...document.querySelectorAll('[role="dialog"] label, [role="dialog"] legend')]
        .filter((el) => el.className && el.className.toString().includes('uppercase'))
        .map((el) => ({ text: el.textContent.trim(), color: getComputedStyle(el).color }))

      const submit = document.querySelector('[role="dialog"] button[type="submit"]')
      const alert = document.querySelector('[role="dialog"] [role="alert"]')

      // Everything the form handed the data layer this page-load.
      const writes = window.__writes ?? []

      return {
        innerWidth: window.innerWidth,
        docWidth: document.documentElement.scrollWidth,
        overflowing,
        browserZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        panel: box(panel),
        segs,
        labelColors: [...new Set(labels.map((l) => l.color))],
        submit: submit && { text: submit.textContent.trim(), ...box(submit), disabled: submit.disabled },
        alert: alert && alert.textContent.trim(),
        fieldValues: {
          date: document.getElementById('event-date')?.value ?? null,
          time: document.getElementById('event-time')?.value ?? null,
          opponent: document.getElementById('event-opponent')?.value ?? null,
          team: document.getElementById('event-team')?.value ?? null,
          teamOptions: [...(document.getElementById('event-team')?.options ?? [])].map((o) => o.text),
          competition: document.getElementById('event-competition')?.value ?? null,
          activeElementId: document.activeElement?.id ?? null,
        },
        writes,
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
