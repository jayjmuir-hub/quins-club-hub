import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../screenshots')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://localhost:5199'

const scenarios = [
  { key: 'login', file: 'login' },
  { key: 'shell-coach', file: 'shell-coach' },
  { key: 'shell-no-membership', file: 'shell-no-membership' },
  { key: 'shell-error', file: 'shell-error' },
  { key: 'shell-loading', file: 'shell-loading' },
]

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
]

const results = []

const browser = await chromium.launch()

for (const scenario of scenarios) {
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    const consoleMsgs = []
    const pageErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleMsgs.push(msg.text())
    })
    page.on('pageerror', (err) => {
      pageErrors.push(err.message)
    })

    const url = `${BASE}/?scenario=${scenario.key}`
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.waitForTimeout(200)

    const outPath = path.join(outDir, `${scenario.file}-${vp.name}.png`)
    await page.screenshot({ path: outPath, fullPage: true })

    results.push({
      scenario: scenario.key,
      viewport: vp.name,
      file: outPath,
      consoleErrors: consoleMsgs,
      pageErrors,
    })

    await page.close()
  }
}

await browser.close()

console.log(JSON.stringify(results, null, 2))
