// INDEPENDENT controller-side verification of Task 15 (PlayerForm).
// Separate from shoot-t15-verify.mjs: this one drives the gated branches
// directly (?scenario=playerform&pf=...), simulates a REJECTED contact read,
// and records what player_contacts reads were issued.

import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task15-controller')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const log = []
const note = (o) => log.push(o)

const probe = () => {
  const d = document.querySelector('[role="dialog"]')
  const ids = ['player-name', 'player-position', 'player-team', 'player-phone', 'player-email']
  const vis = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      vis: cs.visibility,
      disp: cs.display,
      op: cs.opacity,
      clip: cs.clipPath,
      color: cs.color,
    }
  }
  return {
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    overflow: [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 6)
      .map((el) => `${el.tagName}.${String(el.className).slice(0, 70)}`),
    fields: Object.fromEntries(
      ids.map((id) => [id, document.getElementById(id) ? document.getElementById(id).value : null]),
    ),
    present: Object.fromEntries(
      ids.map((id) => {
        const el = document.getElementById(id)
        return [id, el ? vis(el) : 'ABSENT']
      }),
    ),
    dialogText: d ? d.innerText : null,
    // Everything visually hidden inside the dialog that still holds text.
    hiddenText: d
      ? [...d.querySelectorAll('*')]
          .filter((el) => {
            const cs = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            const t = (el.textContent || '').trim()
            return (
              t &&
              el.children.length === 0 &&
              (cs.visibility === 'hidden' ||
                cs.display === 'none' ||
                cs.opacity === '0' ||
                r.width < 2 ||
                r.height < 2)
            )
          })
          .map((el) => `${el.tagName}[${String(el.className).slice(0, 40)}]: ${el.textContent.trim().slice(0, 60)}`)
      : [],
    alerts: d
      ? [...d.querySelectorAll('[role="alert"]')].map((el) => ({
          text: el.textContent.trim(),
          ...vis(el),
        }))
      : [],
    contactNote: (() => {
      const el = document.getElementById('player-contact-note')
      if (!el) return null
      return { text: el.textContent.trim(), ...vis(el) }
    })(),
    // Anything that looks like a lock/hidden hint.
    lockHints: d
      ? {
          text: /lock|hidden|withheld|restricted|not shown|no permission|not permitted|●●|••|\*\*\*\*/i.test(d.innerText),
          svgCount: d.querySelectorAll('svg').length,
          disabledFields: [...d.querySelectorAll('input,select,textarea')].filter((e) => e.disabled || e.readOnly).map((e) => e.id || e.tagName),
          placeholders: [...d.querySelectorAll('input')].map((e) => `${e.id}=${e.placeholder}`),
        }
      : null,
    buttons: d
      ? [...d.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect()
          return { text: b.textContent.trim().slice(0, 30), disabled: b.disabled, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
        })
      : [],
    dialogBox: d
      ? (() => {
          const r = d.getBoundingClientRect()
          const cs = getComputedStyle(d)
          const inner = d.lastElementChild
          return {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            scrollH: d.scrollHeight,
            innerPadBottom: inner ? getComputedStyle(inner).paddingBottom : null,
            bg: cs.backgroundColor,
          }
        })()
      : null,
    // Any <button> whose own content is UA-centred while being used as a box.
    buttonBoxes: d
      ? [...d.querySelectorAll('button')].map((b) => ({
          text: b.textContent.trim().slice(0, 20),
          display: getComputedStyle(b).display,
          textAlign: getComputedStyle(b).textAlign,
          childCount: b.children.length,
        }))
      : [],
    smallText: d
      ? [...new Set([...d.querySelectorAll('label,legend,p,span')].map((el) => `${getComputedStyle(el).fontSize}|${getComputedStyle(el).color}`))]
      : [],
    activeId: document.activeElement?.id || document.activeElement?.tagName,
    writes: window.__writes ?? [],
    reads: window.__reads ?? [],
    nativeDialogs: window.__nativeDialogs ?? [],
  }
}

const shot = async (page, name) => {
  const p = path.join(outDir, `${name}.png`)
  await page.screenshot({ path: p, fullPage: false })
  return path.basename(p)
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
    await page.evaluate((t) => { window.__nativeDialogs = (window.__nativeDialogs || []).concat(t) }, `${d.type()}: ${d.message()}`).catch(() => {})
    await d.dismiss().catch(() => {})
  })
  await page.goto(`${BASE}/${query}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(350)
  return { page, consoleMsgs }
}

for (const vp of viewports) {
  const V = vp.name

  // --- A: empty create form ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=add')
    await page.getByRole('dialog').waitFor()
    const p = await page.evaluate(probe)
    note({ vp: V, case: 'A-create-empty', shot: await shot(page, `${V}-A-create-empty`), fields: p.fields, present: p.present, contactNote: p.contactNote, buttons: p.buttons, overflow: p.overflow, docWidth: p.docWidth, innerWidth: p.innerWidth, dialogBox: p.dialogBox, hiddenText: p.hiddenText, smallText: p.smallText, buttonBoxes: p.buttonBoxes, reads: p.reads, console: consoleMsgs })
    await page.close()
  }

  // --- B: real per-keystroke typing, no loss, no stray chars ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=add')
    await page.getByRole('dialog').waitFor()
    const NAME = 'Zara Al Mansoori'
    const PHONE = '+971 50 200 1000'
    const EMAIL = 'zara.guardian@example.com'
    const perKey = []
    await page.locator('#player-name').click()
    for (const ch of NAME) {
      await page.keyboard.type(ch, { delay: 25 })
      perKey.push(await page.locator('#player-name').inputValue())
    }
    await page.locator('#player-phone').click()
    for (const ch of PHONE) await page.keyboard.type(ch, { delay: 20 })
    await page.locator('#player-email').click()
    for (const ch of EMAIL) await page.keyboard.type(ch, { delay: 15 })
    const p = await page.evaluate(probe)
    const stepDefects = perKey.filter((v, i) => v !== NAME.slice(0, i + 1))
    note({
      vp: V, case: 'B-typing', shot: await shot(page, `${V}-B-typed`),
      name: { want: NAME, got: p.fields['player-name'], ok: p.fields['player-name'] === NAME },
      phone: { want: PHONE, got: p.fields['player-phone'], ok: p.fields['player-phone'] === PHONE },
      email: { want: EMAIL, got: p.fields['player-email'], ok: p.fields['player-email'] === EMAIL },
      perKeystrokeDefects: stepDefects,
      focusAfterTyping: p.activeId, console: consoleMsgs,
    })
    await page.close()
  }

  // --- C: edit player WITH contact on file; watch for a flash ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=edit&contactDelay=400')
    await page.getByRole('dialog').waitFor()
    const frames = []
    for (let i = 0; i < 10; i++) {
      frames.push(await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]')
        return {
          t: Math.round(performance.now()),
          phone: document.getElementById('player-phone')?.value ?? 'ABSENT',
          email: document.getElementById('player-email')?.value ?? 'ABSENT',
          note: document.getElementById('player-contact-note') ? 'present' : 'absent',
          save: [...d.querySelectorAll('button[type=submit]')][0]?.disabled,
          text: d.innerText.replace(/\s+/g, ' ').slice(0, 300),
        }
      }))
      await page.waitForTimeout(70)
    }
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({ vp: V, case: 'C-edit-with-contact', shot: await shot(page, `${V}-C-edit-prefill`), frames, finalFields: p.fields, contactNote: p.contactNote, reads: p.reads, hiddenText: p.hiddenText, overflow: p.overflow, dialogBox: p.dialogBox, console: consoleMsgs })

    // clear phone, keep email, save -> expect explicit null
    await page.locator('#player-phone').fill('')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(probe)
    note({ vp: V, case: 'C2-clear-phone-save', writes: after.writes, console: consoleMsgs })
    await page.close()
  }

  // --- D: edit player with NO contact on file ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=edit-null')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({ vp: V, case: 'D-edit-no-contact', shot: await shot(page, `${V}-D-no-contact`), fields: p.fields, present: p.present, lockHints: p.lockHints, contactNote: p.contactNote, alerts: p.alerts, hiddenText: p.hiddenText, dialogText: p.dialogText, reads: p.reads, console: consoleMsgs })
    // typing into the blank phone proves it is editable
    await page.locator('#player-phone').click()
    await page.keyboard.type('+971 50 999 0000', { delay: 15 })
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(probe)
    note({ vp: V, case: 'D2-no-contact-save', writes: after.writes })
    await page.close()
  }

  // --- E: contact READ rejects while editing a player WITH contact ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=edit&contactThrow=1&contactDelay=200')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(700)
    const p = await page.evaluate(probe)
    note({ vp: V, case: 'E-contact-read-throws', shot: await shot(page, `${V}-E-read-throws`), present: p.present, fields: p.fields, alerts: p.alerts, dialogText: p.dialogText, hiddenText: p.hiddenText, overflow: p.overflow, console: consoleMsgs })
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(probe)
    note({ vp: V, case: 'E2-save-after-failed-read', writes: after.writes, contactWrites: after.writes.filter((w) => w.table === 'player_contacts') })
    await page.close()
  }

  // --- F: player outside the coach's editable squads ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=edit-foreign')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({ vp: V, case: 'F-foreign-player', shot: await shot(page, `${V}-F-foreign`), dialogText: p.dialogText, alerts: p.alerts, present: p.present, reads: p.reads, contactReadIssued: p.reads.length > 0, hiddenText: p.hiddenText, overflow: p.overflow, dialogBox: p.dialogBox, console: consoleMsgs })
    await page.close()
  }

  // --- G: zero editable squads ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=playerform&pf=no-teams')
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const p = await page.evaluate(probe)
    note({ vp: V, case: 'G-no-editable-squads', shot: await shot(page, `${V}-G-no-squads`), dialogText: p.dialogText, alerts: p.alerts, present: p.present, reads: p.reads, console: consoleMsgs })
    await page.close()
  }

  // --- H: delete flow through the real Roster/PlayerDetail ---
  {
    const { page, consoleMsgs } = await newPage(vp, '?scenario=roster')
    await page.getByRole('heading', { name: /Roster & members/ }).waitFor()
    await page.getByRole('button', { name: /Aaron Whitfield/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.waitForTimeout(400)
    const before = await page.evaluate(probe)
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.waitForTimeout(250)
    const confirming = await page.evaluate(probe)
    note({ vp: V, case: 'H-delete-confirm', shot: await shot(page, `${V}-H-delete-confirm`), buttonsBefore: before.buttons.map((b) => b.text), buttonsConfirming: confirming.buttons.map((b) => b.text), confirmCopy: confirming.dialogText, writesBeforeConfirm: confirming.writes, nativeDialogs: confirming.nativeDialogs, overflow: confirming.overflow })
    await page.getByRole('button', { name: 'Yes, delete' }).click()
    await page.waitForTimeout(400)
    const done = await page.evaluate(probe)
    note({ vp: V, case: 'H2-deleted', writes: done.writes, nativeDialogs: done.nativeDialogs, sheetClosed: !done.dialogBox, console: consoleMsgs })
    await page.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(log, null, 2))
console.log(JSON.stringify(log, null, 2))
