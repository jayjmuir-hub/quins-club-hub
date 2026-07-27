import { loadChromium } from './playwright.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

// Independent controller-side verification of the Task 12 Roster screens.
// Deliberately NOT a copy of shoot-roster.mjs's assertions: this one uses the
// three-age-group scenario, measures the things a reviewer would look for
// (UA content-centring on the <button> rows, overflow, nav overlap, computed
// colours of anything that could be quinsGreen-on-white), and dumps the full
// dialog DOM for the contact-absent case so "nothing hints at withheld data"
// can be checked against the markup, not just the picture.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots/task12-verify')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const openPlayer = (name) => async (page) => {
  await page.locator('[data-testid="player-row"]', { hasText: name }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.waitForTimeout(400)
}

const shots = [
  { file: '1-age-groups', scenario: 'roster-three', steps: async () => {} },
  { file: '2-positions-one-team', scenario: 'roster-one-team', steps: async () => {} },
  {
    file: '3a-search-active',
    scenario: 'roster-three',
    steps: async (page) => {
      await page.getByRole('searchbox').fill('wing')
      await page.waitForTimeout(200)
    },
  },
  {
    file: '3b-team-pill-selected',
    scenario: 'roster-three',
    steps: async (page) => {
      await page.getByRole('button', { name: /^U16 Boys/ }).click()
      await page.waitForTimeout(200)
    },
  },
  {
    file: '3c-search-plus-pill',
    scenario: 'roster-three',
    steps: async (page) => {
      await page.getByRole('searchbox').fill('a')
      await page.waitForTimeout(150)
      await page.getByRole('button', { name: /^U14 Boys/ }).click()
      await page.waitForTimeout(200)
    },
  },
  {
    file: '4-detail-contact-present',
    scenario: 'roster-three',
    viewportOnly: true,
    steps: openPlayer('Gabriel Santos'),
  },
  {
    file: '5-detail-contact-absent',
    scenario: 'roster-three',
    viewportOnly: true,
    steps: openPlayer('Dhruv Ramachandran'),
  },
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
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    const consoleErrors = []
    const consoleWarnings = []
    const pageErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
      if (msg.type() === 'warning') consoleWarnings.push(msg.text())
    })
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(`${BASE}/?scenario=${shot.scenario}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    await shot.steps(page)
    await page.waitForTimeout(250)

    const metrics = await page.evaluate(() => {
      const px = (n) => Math.round(n)
      const vw = window.innerWidth
      const vh = window.innerHeight

      const overflowing = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.right > vw + 1
        })
        .slice(0, 8)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)} right=${px(el.getBoundingClientRect().right)}`)

      // UA content-centring probe. For a <button> used as a layout box, an
      // un-overridden UA stylesheet centres content both ways. Measure the
      // gap above AND below the tallest child of each row: if the row is
      // taller than its content and the gaps are equal, content is centred
      // by the UA rather than laid out.
      const rows = [...document.querySelectorAll('[data-testid="player-row"]')].map((row) => {
        const r = row.getBoundingClientRect()
        const cs = getComputedStyle(row)
        const kids = [...row.children].map((k) => k.getBoundingClientRect())
        const top = Math.min(...kids.map((k) => k.top))
        const bottom = Math.max(...kids.map((k) => k.bottom))
        return {
          name: row.querySelector('[data-testid="player-name"]')?.textContent,
          h: px(r.height),
          w: px(r.width),
          display: cs.display,
          alignItems: cs.alignItems,
          justifyContent: cs.justifyContent,
          textAlign: cs.textAlign,
          padTop: cs.paddingTop,
          gapAbove: px(top - r.top),
          gapBelow: px(r.bottom - bottom),
          tileLeft: px(kids[0].left - r.left),
          tileSize: `${px(kids[0].width)}x${px(kids[0].height)}`,
          scrollW: row.scrollWidth,
          clientW: row.clientWidth,
        }
      })

      // Anything hidden that shouldn't be.
      const hiddenish = [...document.querySelectorAll('[data-testid="player-row"] span, [role="dialog"] *')]
        .filter((el) => {
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return (
            (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' ||
              (r.width === 0 && el.textContent.trim() !== '')) && el.textContent.trim() !== ''
          )
        })
        .slice(0, 10)
        .map((el) => `${el.tagName}[${el.textContent.trim().slice(0, 30)}]`)

      const nav = document.querySelector('nav[aria-label="Primary"]')
      const navRect = nav ? nav.getBoundingClientRect() : null
      const navFixed = nav ? getComputedStyle(nav).position : null

      // Bottom-tab overlap: is the last row's bottom edge reachable, i.e. can
      // the page scroll far enough that nothing sits under the fixed nav?
      window.scrollTo(0, document.documentElement.scrollHeight)
      const allRows = [...document.querySelectorAll('[data-testid="player-row"]')]
      const lastRow = allRows[allRows.length - 1]
      const lastRowRectAfterScroll = lastRow ? lastRow.getBoundingClientRect() : null
      const navRectAfterScroll = nav ? nav.getBoundingClientRect() : null
      const lastRowCoveredBy =
        lastRowRectAfterScroll && navRectAfterScroll && navFixed === 'fixed'
          ? px(lastRowRectAfterScroll.bottom - navRectAfterScroll.top)
          : null
      window.scrollTo(0, 0)

      // Colour audit: every text node's computed colour vs its effective bg.
      const greenTextOnLight = [...document.querySelectorAll('body *')]
        .filter((el) => el.textContent.trim() && el.children.length === 0)
        .map((el) => ({ el, c: getComputedStyle(el).color }))
        .filter(({ c }) => {
          const m = c.match(/\d+/g)
          if (!m) return false
          const [r, g, b] = m.map(Number)
          // near quinsGreen #7DC351 / quinsGreenSoft #87C97F
          return Math.abs(r - 125) < 24 && Math.abs(g - 195) < 24 && Math.abs(b - 81) < 40
        })
        .slice(0, 8)
        .map(({ el, c }) => `${el.tagName}[${el.textContent.trim().slice(0, 24)}] color=${c}`)

      const searchInput = document.querySelector('input[type="search"]')
      const searchWrap = searchInput?.parentElement
      const searchCs = searchInput ? getComputedStyle(searchInput) : null
      const wrapCs = searchWrap ? getComputedStyle(searchWrap) : null

      const dialog = document.querySelector('[role="dialog"]')

      return {
        vw,
        vh,
        docScrollWidth: document.documentElement.scrollWidth,
        overflowing,
        hiddenish,
        groups: [...document.querySelectorAll('[data-testid="group-label"]')].map((el, i) => ({
          label: el.textContent,
          count: document.querySelectorAll('[data-testid="group-count"]')[i]?.textContent,
        })),
        pills: [...document.querySelectorAll('button[aria-pressed]')].map(
          (b) => `${b.textContent}${b.getAttribute('aria-pressed') === 'true' ? ' *SELECTED*' : ''}`,
        ),
        subtitle: document.querySelector('h2')?.nextElementSibling?.textContent,
        rowCount: allRows.length,
        rows: rows.slice(0, 6),
        rowsAllSameGap: rows.every((r) => r.gapAbove === rows[0].gapAbove),
        captainBadges: [...document.querySelectorAll('[data-testid="player-row"] span')]
          .filter((s) => s.textContent.trim() === 'Capt')
          .map((s) => {
            const cs = getComputedStyle(s)
            const r = s.getBoundingClientRect()
            return `Capt visible=${r.width > 0 && r.height > 0} color=${cs.color} bg=${cs.backgroundColor}`
          }),
        navFixed,
        navTop: navRect ? px(navRect.top) : null,
        lastRowCoveredByNavPx: lastRowCoveredBy,
        greenTextOnLight,
        search: searchCs && {
          wrapH: px(searchWrap.getBoundingClientRect().height),
          wrapShadow: wrapCs.boxShadow,
          wrapRadius: wrapCs.borderRadius,
          inputFont: searchCs.fontSize,
          inputColor: searchCs.color,
          inputW: px(searchInput.getBoundingClientRect().width),
          appearanceCancel: 'suppressed-via-class',
        },
        dialogText: dialog ? dialog.innerText.replace(/\n+/g, ' | ') : null,
        dialogHtml: dialog ? dialog.innerHTML : null,
        dialogRect: dialog
          ? {
              top: px(dialog.getBoundingClientRect().top),
              bottom: px(dialog.getBoundingClientRect().bottom),
              w: px(dialog.getBoundingClientRect().width),
              h: px(dialog.getBoundingClientRect().height),
              scrollH: dialog.scrollHeight,
              clientH: dialog.clientHeight,
            }
          : null,
      }
    })

    const outPath = path.join(outDir, `${shot.file}-${vp.name}.png`)
    await page.screenshot({ path: outPath, fullPage: !shot.viewportOnly })

    results.push({ shot: shot.file, viewport: vp.name, file: outPath, metrics, consoleErrors, consoleWarnings, pageErrors })
    await page.close()
  }
}

await browser.close()
fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(results, null, 2))
console.log(
  JSON.stringify(
    results.map((r) => ({ ...r, metrics: { ...r.metrics, dialogHtml: r.metrics.dialogHtml ? '[see metrics.json]' : null } })),
    null,
    2,
  ),
)
