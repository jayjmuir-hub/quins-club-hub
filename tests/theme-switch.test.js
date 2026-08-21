// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STORAGE_KEY,
  storedTheme,
  effectiveTheme,
  applyTheme,
  setTheme,
  toggleTheme,
} from '../src/lib/theme.js'

// src/lib/theme.js — the 2.0 light/dark switch.
//
// ⚠️ THE TEST THAT MATTERS MOST is the last one: index.html carries an INLINE
// copy of this logic so the first paint is themed, and nothing but that test
// notices when the two copies drift. A drifted pair fails silently as a wrong
// flash on every load.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function mockMatchMedia(dark) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: dark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})
afterEach(() => {
  localStorage.clear()
})

describe('theme resolution', () => {
  it('follows the OS when nothing is stored', () => {
    mockMatchMedia(true)
    expect(storedTheme()).toBe(null)
    expect(effectiveTheme()).toBe('dark')
    mockMatchMedia(false)
    expect(effectiveTheme()).toBe('light')
  })

  it('a stored choice beats the OS — both directions', () => {
    // Against the injected fault "OS wins": OS says dark, choice says light,
    // and the choice must win (and vice versa).
    mockMatchMedia(true)
    setTheme('light')
    expect(effectiveTheme()).toBe('light')
    mockMatchMedia(false)
    setTheme('dark')
    expect(effectiveTheme()).toBe('dark')
  })

  it('setTheme(null) hands control back to the OS', () => {
    mockMatchMedia(true)
    setTheme('light')
    setTheme(null)
    expect(storedTheme()).toBe(null)
    expect(effectiveTheme()).toBe('dark')
  })

  it('garbage in storage reads as "follow the OS", not a crash', () => {
    mockMatchMedia(false)
    localStorage.setItem(STORAGE_KEY, 'sparkly')
    expect(storedTheme()).toBe(null)
    expect(effectiveTheme()).toBe('light')
  })
})

describe('the class on <html>', () => {
  it('applyTheme stamps and removes `dark`', () => {
    mockMatchMedia(false)
    setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggleTheme flips from whatever is SHOWING, not whatever is stored', () => {
    // OS dark, nothing stored → showing dark → toggle must choose light.
    mockMatchMedia(true)
    toggleTheme()
    expect(storedTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('the inline no-flash script in index.html', () => {
  const html = readFileSync(path.join(projectRoot, 'index.html'), 'utf8')

  it('uses the same storage key as the lib', () => {
    // Rot anchor: renaming STORAGE_KEY in theme.js without updating
    // index.html gives every returning dark-mode user a white flash.
    expect(html).toContain(`localStorage.getItem('${STORAGE_KEY}')`)
  })

  it("stamps the same 'dark' class on documentElement", () => {
    expect(html).toMatch(/documentElement\.classList\.toggle\('dark'/)
  })
})
