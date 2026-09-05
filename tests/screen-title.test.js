// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screenName, documentTitleFor, CLUB_NAME } from '../src/lib/screenTitle.js'

// UX review item 7 (2 Sep 2026): the tab title comes from the path, through
// one table, in the same words the nav uses.

describe('screenName', () => {
  it('names the top-level screens in the nav’s own words', () => {
    expect(screenName('/')).toBe('Home')
    expect(screenName('/roster')).toBe('Roster')
    expect(screenName('/schedule')).toBe('Schedule')
    expect(screenName('/chat')).toBe('Chat')
    expect(screenName('/squad')).toBe('Squad Hub')
    expect(screenName('/documents')).toBe('Documents')
    expect(screenName('/notices')).toBe('Notices')
    expect(screenName('/admin')).toBe('Admin')
  })

  it('⚠️ a longer prefix wins — /chat never swallows /chat/starred', () => {
    expect(screenName('/chat/starred')).toBe('Starred')
    expect(screenName('/chat/dm')).toBe('Direct messages')
    expect(screenName('/admin/accounts')).toBe('Accounts')
    expect(screenName('/admin/social/ideas')).toBe('Social ideas')
    expect(screenName('/admin/training/templates')).toBe('Session templates')
  })

  it('a path with an id in it takes the parent’s name, never the id', () => {
    expect(screenName('/chat/team-abc')).toBe('Chat')
    expect(screenName('/chat/dm/conv-1')).toBe('Direct messages')
    expect(screenName('/lineup/ev-9')).toBe('Team sheet')
    expect(screenName('/match-sheet/ev-9')).toBe('Match sheet')
    expect(screenName('/squad/team-abc')).toBe('Squad Hub')
  })

  it('Squad Hub sub-screens are matched by shape', () => {
    expect(screenName('/squad/team-abc/chat')).toBe('Squad chat')
    expect(screenName('/squad/team-abc/match-roster')).toBe('Match roster')
    expect(screenName('/squad/team-abc/training')).toBe('Training')
    expect(screenName('/squad/team-abc/callups')).toBe('Call-ups')
    expect(screenName('/squad/team-abc/playups')).toBe('Play-ups')
  })

  it('a prefix only matches at a path boundary', () => {
    // '/rosterx' is not the roster.
    expect(screenName('/rosterx')).toBeNull()
    expect(screenName('/roster/')).toBe('Roster')
  })

  it('an unlisted path is null, and the title falls back to the club name alone', () => {
    expect(screenName('/nowhere')).toBeNull()
    expect(documentTitleFor('/nowhere')).toBe(CLUB_NAME)
  })

  it('the title is "Screen · Club"', () => {
    expect(documentTitleFor('/roster')).toBe(`Roster · ${CLUB_NAME}`)
    expect(documentTitleFor('/')).toBe(`Home · ${CLUB_NAME}`)
  })

  it('⚠️ every route in App.jsx has a name — a new screen must be added to the table', () => {
    const app = readFileSync(resolve(import.meta.dirname, '..', 'src/App.jsx'), 'utf8')
    const paths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1])
    // CONTROL: the matcher sees the routes at all.
    expect(paths).toContain('/roster')
    expect(paths.length).toBeGreaterThan(20)
    const unnamed = paths
      .filter((p) => p !== '*')
      // Nested admin routes are relative; resolve them under /admin.
      .map((p) => (p.startsWith('/') ? p : `/admin/${p}`))
      // Params become a made-up id, which the table must still name.
      .map((p) => p.replace(/:[a-zA-Z]+/g, 'x'))
      .filter((p) => screenName(p) === null)
    expect(unnamed).toEqual([])
  })

  it('the base title matches index.html, so a cold load and a navigation agree', () => {
    const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8')
    expect(html).toContain(`<title>${CLUB_NAME}</title>`)
  })
})
