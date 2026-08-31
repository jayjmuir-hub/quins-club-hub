// @vitest-environment node
// Pure filter logic — no DOM, no jsdom cost. See vite.config.js.
import { describe, it, expect } from 'vitest'
import { filterByType } from '../src/screens/Schedule.jsx'

// Club Diary phase 1, task 8 — claude/plans/2026-08-31-club-diary.md.
//
// ⚠️ THE SECOND ASSERTION IS THE POINT OF THE WHOLE FEATURE. A Club Diary entry
// is type='social', so before this the Socials filter swept up kit collections
// SILENTLY — a parent filtering to Socials was shown the club's admin
// logistics. Adding the Diary pill without narrowing Socials would have left
// that intact and looked finished.

const party = { id: '1', type: 'social', info_only: false }
const kit = { id: '2', type: 'social', info_only: true }
const match = { id: '3', type: 'match' }
const training = { id: '4', type: 'training' }
const legacySocial = { id: '5', type: 'social' } // written before the migration
const all = [party, kit, match, training, legacySocial]

describe('filterByType with Club Diary', () => {
  it('Diary shows only information-only entries', () => {
    expect(filterByType(all, 'diary')).toEqual([kit])
  })

  it('⚠️ Socials no longer sweeps up diary entries', () => {
    expect(filterByType(all, 'social')).toEqual([party, legacySocial])
  })

  it('treats a row with no info_only column as an ordinary social', () => {
    // Rows predating the migration, and any read path that does not select the
    // column, must not vanish from Socials. Strict === true both ways.
    expect(filterByType(all, 'social')).toContain(legacySocial)
    expect(filterByType(all, 'diary')).not.toContain(legacySocial)
  })

  it('leaves the other filters alone', () => {
    expect(filterByType(all, 'match')).toEqual([match])
    expect(filterByType(all, 'training')).toEqual([training])
  })

  it('Everything still shows everything, diary entries included', () => {
    expect(filterByType(all, 'all')).toEqual(all)
  })

  it('an unrecognised filter still returns everything, never nothing', () => {
    // An empty list reads to a parent as "the club has nothing on" rather than
    // "this filter is broken" — the rule this function already carried.
    expect(filterByType(all, 'nonsense')).toEqual(all)
  })
})
