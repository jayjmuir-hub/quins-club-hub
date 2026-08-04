// Controller-side visual check of the 4 Aug 2026 PlayerDetail rework: bigger
// photo with name/position/age group beside it, and the Parents block laid
// out like the player contact block. jsdom applies no Tailwind, so the
// assertions in tests/player-form.test.jsx can only check class tokens —
// this is what actually looks at the rendered box.
import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/playerdetail')
fs.mkdirSync(outDir, { recursive: true })
const BASE = 'http://localhost:5199'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const chromium = await loadChromium()
// The repo pins a playwright whose expected Chromium build isn't the one in
// this sandbox, so point it at the installed binary rather than downloading
// a second copy. Harmless if unset elsewhere.
const executablePath = process.env.PW_CHROME || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const report = []

for (const vp of viewports) {
  for (const [label, playerName] of [['photo', 'Aaron Whitfield'], ['monogram', 'Bilal Haddad']]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.goto(`${BASE}/?scenario=roster-admin`, { waitUntil: 'networkidle' })
    // The roster fills in from an async stub after first paint; clicking a row
    // mid-rerender lands on an element React then replaces, and the click is
    // silently lost.
    await page.waitForTimeout(800)
    // The roster is a card list on mobile and a table on desktop. BOTH are in
    // the DOM at every width with one CSS-hidden, so the selector has to be
    // chosen by viewport - a combined one picks the hidden copy and the click
    // silently does nothing.
    // ...and the ROW ITSELF only opens the sheet on mobile. The desktop table
    // edits position/age group/captain in place, so its row click is an edit
    // affordance and the sheet has its own "Open" button in the last column.
    if (vp.width >= 820) {
      await page
        .locator('[data-testid="roster-table-row"]', { hasText: playerName })
        .first()
        .getByRole('button', { name: 'Open' })
        .click()
    } else {
      await page.locator('[data-testid="player-row"]', { hasText: playerName }).first().click()
    }
    // Deliberately a settle-then-assert rather than locator.waitFor(): the
    // Sheet mounts synchronously on click, so if it is not there after this
    // pause it is not coming, and a 30s waitFor only delays the diagnosis.
    await page.waitForTimeout(1200)
    const dialogCount = await page.locator('[role="dialog"]').count()
    if (dialogCount !== 1) {
      throw new Error(
        `${vp.name}/${label}: expected exactly one dialog, saw ${dialogCount}. ` +
          `Body: ${(await page.evaluate(() => document.body.innerText)).slice(0, 400)}`,
      )
    }

    const probe = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')
      const heading = dialog.querySelector('h3')
      const column = heading.parentElement
      const hero = column.parentElement
      const avatar = hero.firstElementChild
      const r = (el) => {
        const b = el.getBoundingClientRect()
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
      }
      return {
        hero: r(hero),
        avatar: r(avatar),
        avatarTag: avatar.tagName,
        column: r(column),
        // The whole point: is the text to the RIGHT of the photo, vertically
        // overlapping it, rather than underneath?
        textIsRightOfPhoto: r(column).x >= r(avatar).x + r(avatar).w - 1,
        overflowing: [...dialog.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)}`),
        callLinks: [...dialog.querySelectorAll('a')].filter((a) => /call/i.test(a.textContent)).length,
        emailLinks: [...dialog.querySelectorAll('a')].filter((a) => /^email$/i.test(a.textContent.trim())).length,
        bannerText: /read-only/i.test(dialog.innerText),
        text: dialog.innerText.split('\n').filter(Boolean).slice(0, 14),
      }
    })
    report.push({ viewport: vp.name, case: label, ...probe })

    await page.locator('[role="dialog"]').first().screenshot({ path: path.join(outDir, `${vp.name}-${label}.png`) })
    await page.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
