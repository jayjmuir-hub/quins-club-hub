// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isFullWidthPath, mainWidthClass, READABLE_MAX_WIDTH_CLASS, FULL_WIDTH_CLASS,
} from '../src/lib/screenWidth.js'

// UX review item 8 (2 Sep 2026): a readable default width on desktop, with
// the tables, grids and threads opting out to the full width.

describe('isFullWidthPath', () => {
  it('tables, grids, calendars and threads fill the width', () => {
    for (const p of ['/', '/roster', '/schedule', '/chat', '/chat/team-1', '/chat/dm/c1',
      '/pitch-calendar', '/lineup/ev-1', '/admin/accounts', '/admin/allocation',
      '/squad/t1/chat', '/squad/t1/match-roster', '/approvals']) {
      expect(isFullWidthPath(p), p).toBe(true)
    }
  })

  it('⚠️ paragraphs and forms get the readable width — the 38 screens the review named', () => {
    for (const p of ['/more', '/settings', '/notices', '/documents', '/my-reports',
      '/admin', '/admin/club', '/admin/officers', '/admin/social', '/admin/welfare',
      '/admin/training/templates', '/squad/t1', '/squad/t1/training', '/match-sheet/ev-1',
      '/privacy', '/delete-account']) {
      expect(isFullWidthPath(p), p).toBe(false)
    }
  })

  it('a prefix only matches at a path boundary', () => {
    expect(isFullWidthPath('/rosterx')).toBe(false)
    expect(isFullWidthPath('/roster/')).toBe(true)
  })

  it('mainWidthClass hands back the two class strings', () => {
    expect(mainWidthClass('/roster')).toBe(FULL_WIDTH_CLASS)
    expect(mainWidthClass('/settings')).toBe(READABLE_MAX_WIDTH_CLASS)
    // CONTROL: the full-width string is the one the shell used to hard-code.
    expect(FULL_WIDTH_CLASS).toContain('desktop:max-w-none')
    expect(READABLE_MAX_WIDTH_CLASS).toMatch(/^desktop:max-w-\[\d+px\]$/)
  })

  it('⚠️ the shell reads the class from here and no longer hard-codes max-w-none (rot detector)', () => {
    const shell = readFileSync(resolve(import.meta.dirname, '..', 'src/components/AppShell.jsx'), 'utf8')
    expect(shell).toContain('mainWidthClass(')
    // The main element's own class list must not carry the old constant.
    const mainStart = shell.indexOf('id="main-content"')
    const mainClass = shell.slice(mainStart, shell.indexOf('>', shell.indexOf('className=', mainStart)))
    expect(mainStart).toBeGreaterThan(0)
    expect(mainClass).not.toContain('desktop:max-w-none')
    // CONTROL: the masthead still carries it, so the negative matcher can see the string.
    expect(shell).toContain('desktop:max-w-none')
  })
})
