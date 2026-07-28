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
const viteBin = path.join(projectRoot, 'node_modules', '.bin', 'vite')

let outDir
let manifest

beforeAll(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'quins-pwa-build-'))
  execFileSync(viteBin, ['build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: projectRoot,
    stdio: 'pipe',
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
    expect(manifest.theme_color).toBe('#C21F32')
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
})
