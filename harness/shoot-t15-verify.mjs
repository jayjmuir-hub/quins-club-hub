// INDEPENDENT controller-side verification of Task 15 (PlayerForm /
// PlayerDetail footer / Roster "Add player"). Types with real keystrokes and
// measures character loss, checks the two-writes-not-one contract on the
// recorded payloads, checks the blank-both and prefill contact cases, counts
// clicks needed for delete, and reads back contrast/overflow/layout.

import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task15-verify')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const log = []
const note = (o) => log.push(o)

// Inlined inside probe() below rather than closed over: page.evaluate
// serialises the function, so an outer-scope constant would be undefined in
// the page.

const probe = () => ({
  innerWidth: window.innerWidth,
  docWidth: document.documentElement.scrollWidth,
  overflow: [...document.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
    .slice(0, 5)
    .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
  fields: Object.fromEntries(
    ['player-name', 'player-position', 'player-team', 'player-phone', 'player-email'].map((id) => [id, document.getElementById(id) ? document.getElementById(id).value : null]),
  ),
  present: Object.fromEntries(
    ['player-name', 'player-position', 'player-team', 'player-phone', 'player-email'].map((id) => {
      const el = document.getElementById(id)
      if (!el) return [id, 'absent']
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return [id, `present ${Math.round(r.width)}x${Math.round(r.height)} vis=${cs.visibility} disp=${cs.display} op=${cs.opacity}`]
    }),
  ),
  jerseyAnywhere: /jersey|shirt number|squad number/i.test(document.body.innerText),
  teamOptions: [...(document.getElementById('player-team')?.options ?? [])].map((o) => o.text),
  positionOptions: [...(document.getElementById('player-position')?.options ?? [])].map((o) => o.text),
  saveButton: (() => {
    const b = [...document.querySelectorAll('[role="dialog"] button[type="submit"]')][0]
    if (!b) return null
    const r = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    return { text: b.textContent.trim(), disabled: b.disabled, w: Math.round(r.width), h: Math.round(r.height), color: cs.color, bg: cs.backgroundColor }
  })(),
  activeId: document.activeElement?.id || document.activeElement?.tagName,
  alerts: [...document.querySelectorAll('[role="dialog"] [role="alert"]')].map((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return { text: el.textContent.trim().slice(0, 160), w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display, color: cs.color, bg: cs.backgroundColor }
  }),
  invalidFields: [...document.querySelectorAll('[role="dialog"] [aria-invalid="true"]')].map((el) => ({
    id: el.id,
    border: getComputedStyle(el).borderTopColor,
  })),
  segs: [...document.querySelectorAll('[role="dialog"] fieldset label > span')].map((el) => {
    const r = el.getBoundingClientRect()
    return { text: el.textContent.trim(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor }
  }),
  smallTextColors: [
    ...new Set(
      [...document.querySelectorAll('[role="dialog"] label, [role="dialog"] legend, [role="dialog"] p')].map(
        (el) => `${getComputedStyle(el).fontSize} ${getComputedStyle(el).color}`,
      ),
    ),
  ],
  dialogBox: (() => {
    const d = document.querySelector('[role="dialog"]')
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), scrollH: d.scrollHeight }
  })(),
  footerButtons: [...document.querySelectorAll('[role="dialog"] button')]
    .map((b) => {
      const r = b.getBoundingClientRect()
      return { text: b.textContent.trim().slice(0, 24), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
    })
    .filter((b) => b.text && b.text !== ''),
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

async function newPage(vp, query) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
  const consoleMsgs = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${e.message}`))
  page.on('dialog', async (d) => {
    await page
      .evaluate((t) => {
        window.__nativeDialogs = (window.__nativeDialogs || []).concat(t)
      }, `${d.type()}: ${d.message()}`)
      .catch(() => {})
    await d.dismiss().catch(() => {})
  })
  await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  return { page, consoleMsgs }
}

// The roster scenarios render Roster directly inside AppShell at /roster, so
// there is no tab to click — the screen is already up.
const gotoRoster = async (page) => {
  await page.getByRole('heading', { name: /Roster & members/ }).waitFor()
}

for (const vp of viewports) {
  // ---- 1: empty create form, real keystroke typing ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster')
    await gotoRoster(page)
    await page.getByRole('button', { name: 'Add player' }).click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)

    const NAME = 'Faisal Al Mansoori'
    const PHONE = '+971 50 200 1000'
    const EMAIL = 'guardian@example.com'
    await page.locator('#player-name').click()
    await page.keyboard.type(NAME, { delay: 18 })
    await page.locator('#player-phone').click()
    await page.keyboard.type(PHONE, { delay: 18 })
    await page.locator('#player-email').click()
    await page.keyboard.type(EMAIL, { delay: 18 })

    const typed = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '1-add-typing',
      shot: await shot(page, `${vp.name}-1-add-typed`),
      expectedName: NAME,
      gotName: typed.fields['player-name'],
      nameLoss: NAME.length - (typed.fields['player-name'] || '').length,
      expectedPhone: PHONE,
      gotPhone: typed.fields['player-phone'],
      phoneLoss: PHONE.length - (typed.fields['player-phone'] || '').length,
      expectedEmail: EMAIL,
      gotEmail: typed.fields['player-email'],
      emailLoss: EMAIL.length - (typed.fields['player-email'] || '').length,
      focusAfterTyping: typed.activeId,
      jerseyAnywhere: typed.jerseyAnywhere,
      teamOptions: typed.teamOptions,
      positionOptions: typed.positionOptions,
      saveButton: typed.saveButton,
      segs: typed.segs,
      smallTextColors: typed.smallTextColors,
      overflow: typed.overflow,
      docWidth: typed.docWidth,
      innerWidth: typed.innerWidth,
      dialogBox: typed.dialogBox,
      console: consoleMsgs,
    })

    await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click()
    await page.waitForTimeout(500)
    const after = await page.evaluate(probe)
    note({ vp: vp.name, case: '1b-add-submitted', writes: after.writes, sheetStillOpen: Boolean(after.dialogBox), console: consoleMsgs })
    await page.close()
  }

  // ---- 2: validation blocks submit ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster')
    await gotoRoster(page)
    await page.getByRole('button', { name: 'Add player' }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click()
    await page.waitForTimeout(300)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '2-validation',
      shot: await shot(page, `${vp.name}-2-validation`),
      alerts: p.alerts,
      invalidFields: p.invalidFields,
      writes: p.writes,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 3: blank-both contact on a new player writes NO contact row ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster')
    await gotoRoster(page)
    await page.getByRole('button', { name: 'Add player' }).click()
    await page.getByRole('dialog').waitFor()
    await page.locator('#player-name').click()
    await page.keyboard.type('Nathan Cole', { delay: 12 })
    await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click()
    await page.waitForTimeout(500)
    const p = await page.evaluate(probe)
    note({ vp: vp.name, case: '3-blank-contact', writes: p.writes, console: consoleMsgs })
    await page.close()
  }

  // ---- 4: edit prefills BOTH tables; clearing contact writes nulls ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster&contactDelay=250')
    await gotoRoster(page)
    await page.getByRole('button', { name: /Aaron Whitfield/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click()
    await page.waitForTimeout(80)
    const loading = await page.evaluate(probe)
    await page.waitForTimeout(600)
    const ready = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '4-edit-prefill',
      shot: await shot(page, `${vp.name}-4-edit-prefill`),
      whileContactLoading: { saveButton: loading.saveButton, present: loading.present },
      afterContactLoaded: { saveButton: ready.saveButton, fields: ready.fields },
      console: consoleMsgs,
    })

    await page.locator('#player-phone').fill('')
    await page.locator('#player-email').fill('')
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(500)
    const cleared = await page.evaluate(probe)
    note({ vp: vp.name, case: '4b-clear-contact', writes: cleared.writes, console: consoleMsgs })
    await page.close()
  }

  // ---- 5: player with NO contact on file -> blank editable fields, no hint ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster')
    await gotoRoster(page)
    // p4 (Dhruv Ramachandran) is the stub's null-contact player.
    await page.getByRole('button', { name: /Dhruv Ramachandran/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click()
    await page.waitForTimeout(500)
    const p = await page.evaluate(probe)
    const bodyText = await page.evaluate(() => document.querySelector('[role="dialog"]').innerText)
    note({
      vp: vp.name,
      case: '5-no-contact-on-file',
      shot: await shot(page, `${vp.name}-5-no-contact`),
      fields: p.fields,
      present: p.present,
      alerts: p.alerts,
      mentionsHidden: /hidden|withheld|not permitted|no permission/i.test(bodyText),
      console: consoleMsgs,
    })
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(probe)
    note({ vp: vp.name, case: '5b-no-contact-save', writes: after.writes })
    await page.close()
  }

  // ---- 6: contact write refused -> distinct message, sheet stays open ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster&contactFail=1')
    await gotoRoster(page)
    await page.getByRole('button', { name: 'Add player' }).click()
    await page.getByRole('dialog').waitFor()
    await page.locator('#player-name').click()
    await page.keyboard.type('Tom Fletcher', { delay: 12 })
    await page.locator('#player-phone').click()
    await page.keyboard.type('+971 50 111 2222', { delay: 12 })
    await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click()
    await page.waitForTimeout(600)
    const p = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '6-contact-refused',
      shot: await shot(page, `${vp.name}-6-contact-refused`),
      alerts: p.alerts,
      writes: p.writes,
      sheetStillOpen: Boolean(p.dialogBox),
      typedValuesKept: p.fields,
      console: consoleMsgs,
    })
    // Retry: must UPDATE the player, not insert a second one.
    await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click()
    await page.waitForTimeout(600)
    const retry = await page.evaluate(probe)
    note({ vp: vp.name, case: '6b-retry', writes: retry.writes })
    await page.close()
  }

  // ---- 7: PlayerDetail footer, two-step delete, no native confirm ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster')
    await gotoRoster(page)
    await page.getByRole('button', { name: /Aaron Whitfield/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const detail = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '7-detail-footer',
      shot: await shot(page, `${vp.name}-7-detail-footer`),
      buttons: detail.footerButtons,
      overflow: detail.overflow,
      dialogBox: detail.dialogBox,
    })

    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.waitForTimeout(300)
    const confirming = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '7b-confirm',
      shot: await shot(page, `${vp.name}-7b-confirm`),
      buttons: confirming.footerButtons,
      writesBeforeConfirm: confirming.writes,
      nativeDialogs: confirming.nativeDialogs,
    })

    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await page.waitForTimeout(500)
    const deleted = await page.evaluate(probe)
    note({
      vp: vp.name,
      case: '7c-deleted',
      writes: deleted.writes,
      sheetClosed: !deleted.dialogBox,
      nativeDialogs: deleted.nativeDialogs,
      console: consoleMsgs,
    })
    await page.close()
  }

  // ---- 8: parent sees no Add player and no footer buttons ----
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster-parent')
    await gotoRoster(page)
    await page.waitForTimeout(300)
    const addCount = await page.getByRole('button', { name: 'Add player' }).count()
    await page.getByRole('button', { name: /Aaron Whitfield/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    const bodyText = await page.evaluate(() => document.querySelector('[role="dialog"]').innerText)
    note({
      vp: vp.name,
      case: '8-parent',
      shot: await shot(page, `${vp.name}-8-parent`),
      addPlayerButtons: addCount,
      buttons: p.footerButtons,
      readOnlyNote: /read-only/i.test(bodyText),
      console: consoleMsgs,
    })
    await page.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
