import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// Screenshot the capture node with Chrome + Club Hub Inter so the golden PNG
// is the card, not a 5×7 bitmap dump. Invented fixture text only.
// `--headless=new` + `--virtual-time-budget` hung this VM; old `--headless`
// writes the PNG in under a second. Spec: claude/specs/2026-08-27-session-plan-share.md

const REPO = process.cwd()
const FONTS = join(REPO, 'public/fonts')

function captureLines(root) {
  const lines = []
  function walk(node) {
    if (node.nodeType !== 1) return
    const testid = node.getAttribute('data-testid')
    if (testid === 'session-plan-share-category') {
      const text = node.textContent.replace(/\s+/g, ' ').trim()
      if (text) lines.push(text)
      return
    }
    let direct = ''
    for (const child of node.childNodes) {
      if (child.nodeType === 3) direct += child.textContent
    }
    direct = direct.replace(/\s+/g, ' ').trim()
    const tag = node.tagName
    const style = node.getAttribute('style') ?? ''
    const isBlock =
      tag === 'P' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || /display:\s*block/i.test(style)
    if (isBlock && direct) lines.push(direct)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return lines
}

function findChrome() {
  // Prefer the real binary. `/usr/local/bin/google-chrome` on this VM is a
  // wrapper that forces `--remote-debugging-port=9222` and hangs headless.
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  return candidates.find((path) => existsSync(path)) ?? null
}

function fontFace(weight, file) {
  const bytes = readFileSync(join(FONTS, file))
  return `@font-face{font-family:Inter;font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');}`
}

function previewDocument(innerHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${fontFace(400, 'inter-400.woff2')}
${fontFace(600, 'inter-600.woff2')}
${fontFace(700, 'inter-700.woff2')}
${fontFace(800, 'inter-800.woff2')}
html,body{margin:0;padding:0;background:#ffffff;}
body{width:360px;font-family:Inter,system-ui,sans-serif;}
</style>
</head>
<body>${innerHtml}</body>
</html>`
}

function cropWhiteBottom(src, dest) {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src],
    { encoding: 'utf8', timeout: 8000 },
  )
  const [width, height] = (probe.stdout || '').trim().split(',').map(Number)
  if (!width || !height) {
    copyFileSync(src, dest)
    return
  }
  const raw = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 30_000_000, timeout: 8000 },
  )
  const pixels = raw.stdout
  const rowBytes = width * 3
  if (!Buffer.isBuffer(pixels) || pixels.length < rowBytes) {
    copyFileSync(src, dest)
    return
  }
  let lastInk = 0
  for (let y = 0; y < height; y++) {
    const offset = y * rowBytes
    for (let x = 0; x < rowBytes; x++) {
      if (pixels[offset + x] < 248) {
        lastInk = y
        break
      }
    }
  }
  const cropH = Math.min(height, lastInk + 40)
  const crop = spawnSync('ffmpeg', ['-y', '-i', src, '-vf', `crop=${width}:${cropH}:0:0`, dest], {
    encoding: 'utf8',
    timeout: 8000,
  })
  if (crop.status !== 0 || !existsSync(dest)) copyFileSync(src, dest)
}

function screenshotWithChrome(element, dest, chrome) {
  const dir = mkdtempSync(join(tmpdir(), 'session-plan-share-'))
  const htmlPath = join(dir, 'capture.html')
  const shotPath = join(dir, 'shot.png')
  writeFileSync(htmlPath, previewDocument(element.outerHTML), 'utf8')
  const result = spawnSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      '--window-size=360,1800',
      '--default-background-color=ffffffff',
      '--screenshot=shot.png',
      `file://${htmlPath}`,
    ],
    { encoding: 'utf8', cwd: dir, timeout: 20000, killSignal: 'SIGKILL' },
  )
  if (result.status !== 0 || !existsSync(shotPath)) {
    throw new Error(
      `Chrome failed to screenshot the session-plan capture (${result.status}): ${result.stderr || result.stdout || result.error}`,
    )
  }
  mkdirSync(dirname(dest), { recursive: true })
  cropWhiteBottom(shotPath, dest)
}

export function writeSessionPlanCapturePng(element, dest) {
  const lines = captureLines(element)
  // The golden is committed. CI (and a normal `npm test`) must not spawn
  // Chrome: GitHub's ubuntu runner ships google-chrome, headless hangs past
  // vitest's 15s, and the suite goes red while the html2canvas spy was already
  // green. Refresh the PNG with UPDATE_SESSION_PLAN_PNG=1 on a machine whose
  // Chrome can screenshot (not the /usr/local/bin wrapper).
  const refresh =
    process.env.UPDATE_SESSION_PLAN_PNG === '1' || !existsSync(dest)
  const inCi = process.env.CI === 'true'
  const chrome = refresh && !inCi ? findChrome() : null
  if (chrome) {
    try {
      screenshotWithChrome(element, dest, chrome)
    } catch (failure) {
      if (!existsSync(dest)) throw failure
    }
  } else if (!existsSync(dest)) {
    throw new Error(
      'Chrome is required to write the session-plan share golden PNG (Inter, not a bitmap dump).',
    )
  }
  return { dest, lines }
}
