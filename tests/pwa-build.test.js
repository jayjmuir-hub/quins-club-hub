// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Task 20 (PWA): the brief is explicit that "the built dist/ contains the
// manifest and a service worker" means inspecting a REAL production build's
// output, not just the vite-plugin-pwa config object. A stubbed/mocked check
// of the config would pass even if the plugin were misconfigured in a way
// that only shows up at build time (e.g. a bad icon path, or — as caught
// during this task's development — a runtimeCaching urlPattern function that
// referenced an out-of-scope module-level const and would have thrown at
// service-worker runtime despite looking correct in the config object).
//
// So this test shells out to a real `vite build` (via execFileSync, no
// network involved — a local production build reads only the local
// filesystem and env vars already present in this repo, so it's compatible
// with this codebase's "npm test never touches the network" convention)
// into a disposable temp directory, then asserts on the files it actually
// produced. This is slower (~3s) than the rest of the suite but still fast
// enough to run in the default `npm test` lane rather than being pushed into
// the integration-only lane, and the brief's own wording calls for exactly
// this: real built output, not config intent.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Invoke vite's JS entry with the Node binary already running this test,
// rather than a node_modules/.bin launcher. The .bin route is a cross-platform
// minefield and this file had never actually run on Windows because of it:
// npm writes an extensionless shell script there (the only one that exists on
// macOS/Linux) plus a .cmd and a .ps1 on Windows. execFileSync does no PATHEXT
// resolution, so the extensionless name throws ENOENT on Windows; and since
// Node 20's CVE-2024-27980 fix, pointing at the .cmd instead throws EINVAL
// unless you opt into `shell: true`, which then drags in shell quoting rules
// for every argument. Running the .js entry directly sidesteps all of it and
// guarantees the child uses the same Node as the parent.
const viteBin = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')

let outDir
let manifest

beforeAll(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'quins-pwa-build-'))
  execFileSync(process.execPath, [viteBin, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: projectRoot,
    stdio: 'pipe',
    // vite build must run as a production build regardless of the NODE_ENV the
    // test runner itself was started with (this repo's suite runs under
    // NODE_ENV=test, and some machines export NODE_ENV=production globally).
    env: { ...process.env, NODE_ENV: 'production' },
  })
  manifest = JSON.parse(readFileSync(path.join(outDir, 'manifest.webmanifest'), 'utf-8'))
}, 60_000)

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

describe('PWA production build output', () => {
  it('produces a web app manifest', () => {
    expect(existsSync(path.join(outDir, 'manifest.webmanifest'))).toBe(true)
  })

  it('produces a generated service worker', () => {
    expect(existsSync(path.join(outDir, 'sw.js'))).toBe(true)
  })

  it('manifest declares the exact app name and short_name', () => {
    expect(manifest.name).toBe('Abu Dhabi Harlequins')
    expect(manifest.short_name).toBe('Quins')
  })

  it('manifest declares standalone display and the club theme colour', () => {
    expect(manifest.display).toBe('standalone')
    // Chrome near-black, not the brand red: theme_color tints the OS/browser
    // chrome to blend with the top of the page, and the top of the page is the
    // dark masthead. See the note in vite.config.js.
    // #0a0a0a since the 6 Aug 2026 re-point at the club redesign — still the
    // chrome near-black, just the new one. The value must equal the masthead
    // colour, not merely be dark: a mismatch shows as a seam between the OS
    // status bar and the top of the app.
    expect(manifest.theme_color).toBe('#0a0a0a')
  })

  it('manifest declares start_url and scope covering the whole app', () => {
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
  })

  it('manifest includes 192px and 512px icons for both "any" and "maskable" purposes', () => {
    const bySize = (size, purpose) =>
      manifest.icons.find((icon) => icon.sizes === size && icon.purpose === purpose)

    const any192 = bySize('192x192', 'any')
    const any512 = bySize('512x512', 'any')
    const maskable192 = bySize('192x192', 'maskable')
    const maskable512 = bySize('512x512', 'maskable')

    expect(any192).toBeTruthy()
    expect(any512).toBeTruthy()
    expect(maskable192).toBeTruthy()
    expect(maskable512).toBeTruthy()

    expect(any192.src).toBe('/icons/icon-192.png')
    expect(any512.src).toBe('/icons/icon-512.png')
    expect(maskable192.src).toBe('/icons/maskable-192.png')
    expect(maskable512.src).toBe('/icons/maskable-512.png')

    manifest.icons.forEach((icon) => expect(icon.type).toBe('image/png'))
  })

  it('service worker precaches the app shell and registers a Supabase REST runtime-caching route', () => {
    const sw = readFileSync(path.join(outDir, 'sw.js'), 'utf-8')

    // App shell precaching (index.html + hashed JS/CSS assets).
    expect(sw).toMatch(/precacheAndRoute/)
    expect(sw).toMatch(/index\.html/)

    // Runtime caching for Supabase REST GETs, NOT auth or mutation requests.
    expect(sw).toMatch(/lusmshimxdcxpnrktlgz\.supabase\.co/)
    expect(sw).toMatch(/rest\/v1/)
    expect(sw).toMatch(/NetworkFirst/)
    expect(sw).toMatch(/quins-supabase-rest-get/)
  })

  // ⚠️ ASSERTED ON THE BUILT WORKER, NOT ON THE CONFIG. tests/pwa-cache-rules.js
  // proves the predicate makes the right decisions; this proves the decisions
  // actually SHIPPED. Workbox stringifies the function into sw.js, and this
  // file's own header records the time a urlPattern looked perfect in the
  // config and would have thrown inside the worker. A rule that never reaches
  // the worker excludes nothing, and nothing else in the suite would notice.
  it('service worker carries the club-wide-read exclusions, not just the route', () => {
    const sw = readFileSync(path.join(outDir, 'sw.js'), 'utf-8')

    // ⚠️ SUBSTRING, NOT toMatch, AND THAT IS NOT A STYLE CHOICE. What ships is
    // the SOURCE of a regex literal, so the worker literally contains the
    // characters `[?&]profile_id=eq\.` — backslash included. `toMatch(
    // /profile_id=eq\./)` reads as though it should match that and does not,
    // because there the `\.` means "a dot" rather than "backslash then dot".
    // The first draft of this test failed for exactly that reason while the
    // shipped worker was perfectly correct.
    expect(sw).toContain('/rest/v1/access_requests')
    expect(sw).toContain('[?&]profile_id=eq')
    expect(sw).toContain('[?&]id=eq')
  })
})
