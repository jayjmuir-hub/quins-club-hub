// @vitest-environment node
// Nothing here touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import { eventChipKind } from '../src/lib/eventFormat.js'

// Club Diary phase 1, task 2 — claude/plans/2026-08-31-club-diary.md.
//
// ⚠️ THIS IS THE DEFECT THE WHOLE HELPER EXISTS FOR. A Club Diary entry IS
// `type = 'social'`, and Chip keys both its colour and its icon off `type`. Left
// alone, a kit collection draws the People icon under the word "Social" — the
// app asserting something false, not a cosmetic slip.

describe('eventChipKind', () => {
  it('returns diary for an info-only event, whatever its type says', () => {
    expect(eventChipKind({ type: 'social', info_only: true })).toBe('diary')
  })

  it('leaves ordinary events alone', () => {
    expect(eventChipKind({ type: 'social', info_only: false })).toBe('social')
    expect(eventChipKind({ type: 'match', info_only: false })).toBe('match')
    expect(eventChipKind({ type: 'training' })).toBe('training')
  })

  it('treats a missing or non-true info_only as false', () => {
    // ⚠️ STRICT === true, matching the calendar feed's convention for time_tbd.
    // A row written before the migration, or read through a path that does not
    // select the column, must read as an ordinary event rather than as a diary
    // entry. `undefined` must not be truthy-tested into 'diary'.
    expect(eventChipKind({ type: 'social' })).toBe('social')
    expect(eventChipKind({ type: 'social', info_only: null })).toBe('social')
    expect(eventChipKind({ type: 'social', info_only: undefined })).toBe('social')
  })

  it('survives a missing event without inventing a kind', () => {
    // Absence is the honest answer — the same rule EVENT_TYPE_ICONS follows in
    // rendering an unrecognised type as the neutral pill rather than guessing.
    expect(eventChipKind(null)).toBe(null)
    expect(eventChipKind(undefined)).toBe(null)
  })
})
