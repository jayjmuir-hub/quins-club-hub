// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  CLUB_BUCKET,
  chipHours,
  chipFit,
  shelfRowsForSquad,
  blocksFromTemplate,
  chipNeedsConfirm,
  chipReplaceMessage,
  coachLabel,
  groupByCoach,
  countUsedThisWeek,
} from '../src/lib/trainingShelf.js'

// Pure shelf rules. Invented fixtures only — CLAUDE.md rule 9.

const CHIP_LABELS = ['Tackle', 'Passing', 'Ruck', 'Attack', 'Defence']

function contactPack(min, max) {
  return CHIP_LABELS.map((chip_label) => ({
    id: `${chip_label}-${min}-${max}`,
    chip_label,
    name: `${chip_label} U${min}–U${max}`,
    requires_contact: true,
    min_age: min,
    max_age: max,
  }))
}

const THREE_PACKS = [...contactPack(9, 10), ...contactPack(11, 14), ...contactPack(16, 18)]
const U18 = { name: 'U18B', requires_contact: true }
const U12G_QR = { name: 'U12G QR', requires_contact: false }

describe('chipHours', () => {
  it('keeps templates with a chip_label and drops the rest', () => {
    expect(
      chipHours(
        [
          { id: 't1', chip_label: 'Tackle' },
          { id: 't2', chip_label: null },
          { id: 't3', name: 'Skills night' },
        ],
        U18,
      ).map((row) => row.id),
    ).toEqual(['t1'])
  })

  it('is empty-safe — no featured hours yet is not a crash', () => {
    expect(chipHours([], U18)).toEqual([])
    expect(chipHours(undefined, U18)).toEqual([])
  })

  it('emits one chip per label for a U18 contact squad, from the 16–18 pack only', () => {
    const chips = chipHours(THREE_PACKS, U18)
    expect(chips.map((row) => row.chip_label)).toEqual(CHIP_LABELS)
    expect(chips.every((row) => chipFit(U18, row).ok)).toBe(true)
    expect(chips.map((row) => row.id)).toEqual(CHIP_LABELS.map((label) => `${label}-16-18`))
    expect(chips.every((row) => row.min_age === 16 && row.max_age === 18)).toBe(true)
  })

  it('picks the tightest fitting age band when several packs cover the squad', () => {
    const chips = chipHours(
      [
        { id: 'wide', chip_label: 'Passing', requires_contact: true, min_age: 14, max_age: 18 },
        { id: 'tight', chip_label: 'Passing', requires_contact: true, min_age: 16, max_age: 18 },
        { id: 'any', chip_label: 'Passing', requires_contact: false, min_age: null, max_age: null },
      ],
      U18,
    )
    expect(chips).toHaveLength(1)
    expect(chips[0].id).toBe('tight')
  })

  it('shows Tackle once, disabled for contact, on U12G QR — never an enabled U16 hour', () => {
    const chips = chipHours(THREE_PACKS, U12G_QR)
    const tackles = chips.filter((row) => row.chip_label === 'Tackle')
    expect(tackles).toHaveLength(1)
    const fit = chipFit(U12G_QR, tackles[0])
    expect(fit.ok).toBe(false)
    expect(fit.reason).toMatch(/tag/i)
    expect(chips.filter((row) => chipFit(U12G_QR, row).ok)).toEqual([])
  })

  // ⚠️ AGE IS GUIDANCE, NOT A GATE — since 2 Sep 2026. A squad below every
  // pack still gets a working chip, with the band said beside it. (Until then
  // the chip was disabled as "No hour for this age".)
  it('enables an out-of-band hour and says the band as guidance', () => {
    const u7 = { name: 'U7 Mixed', requires_contact: true }
    const chips = chipHours(contactPack(9, 10), u7)
    expect(chips).toHaveLength(5)
    const fit = chipFit(u7, chips[0])
    expect(fit.ok).toBe(true)
    expect(fit.reason).toBeNull()
    expect(fit.guidance).toBe("U7 is outside this template's U9–U10")
  })
  it('falls back to the WIDEST allowed pack when none is in band', () => {
    const u7 = { name: 'U7 Mixed', requires_contact: true }
    const chips = chipHours(THREE_PACKS, u7)
    expect(chips.map((row) => row.id)).toEqual(CHIP_LABELS.map((label) => `${label}-11-14`))
  })
})

describe('shelfRowsForSquad', () => {
  const copies = [
    { id: 'd-u16', title: '4 v 2 Continuous Touch', min_age: 16, max_age: 18, requires_contact: true },
    { id: 'd-u9', title: '4 v 2 Continuous Touch', min_age: 9, max_age: 10, requires_contact: true },
    { id: 'd-u11', title: '4 v 2 Continuous Touch', min_age: 11, max_age: 14, requires_contact: true },
  ]

  // ⚠️ IN-BAND FIRST, THE REST AFTER — never hidden. Since 2 Sep 2026 age is
  // guidance; this used to return only 'd-u16'.
  it('orders the in-band copy first and keeps the others, in their own order', () => {
    expect(shelfRowsForSquad(copies, U18).map((row) => row.id)).toEqual(['d-u16', 'd-u9', 'd-u11'])
  })

  it('hides a contact drill from a tag squad even when the age would fit', () => {
    const u12copies = [
      { id: 'd-contact-u12', title: 'Live Tackle', min_age: 11, max_age: 14, requires_contact: true },
      { id: 'd-tag-u12', title: 'Rip and roll', min_age: 11, max_age: 14, requires_contact: false },
    ]
    expect(shelfRowsForSquad(u12copies, U12G_QR).map((row) => row.id)).toEqual(['d-tag-u12'])
  })

  // Jay 4 Sep 2026: greyed-out junior cards on a senior picker "doesn't make
  // any sense". Hide them. Youth still keep the out-of-band rows (test above).
  it('omits junior-capped drills for an is_senior squad and keeps any-age and adult-open', () => {
    const senior = { name: 'Senior Men - 1st XV', is_senior: true, requires_contact: true }
    const rows = [
      { id: 'd-u9', title: 'U10 passing', min_age: 8, max_age: 10, requires_contact: false },
      { id: 'd-any', title: 'Grid passing', min_age: null, max_age: null, requires_contact: false },
      { id: 'd-open', title: 'Adult ruck', min_age: 16, max_age: null, requires_contact: true },
    ]
    expect(shelfRowsForSquad(rows, senior).map((row) => row.id)).toEqual(['d-any', 'd-open'])
  })

})

describe('chipHours for seniors', () => {
  it('omits a junior-only chip label on an is_senior squad instead of offering the U9 pack', () => {
    const senior = { name: 'Senior Men - 1st XV', is_senior: true, requires_contact: true }
    const chips = chipHours(contactPack(9, 10), senior)
    expect(chips).toEqual([])
  })
  it('keeps the in-band adult pack for an is_senior squad', () => {
    const senior = { name: 'Senior Men - 1st XV', is_senior: true, requires_contact: true }
    const chips = chipHours([...contactPack(9, 10), ...contactPack(16, 18)], senior)
    expect(chips.map((row) => row.id)).toEqual(CHIP_LABELS.map((label) => `${label}-16-18`))
  })
})

describe('blocksFromTemplate', () => {
  it('copies blocks in stored order as numbers, with coach notes', () => {
    const template = {
      blocks: [
        { position: 2, drill_id: 'd-b', minutes: '8', coach_note: 'tight' },
        { position: 1, drill_id: 'd-a', minutes: 15, coach_note: null },
      ],
    }
    expect(blocksFromTemplate(template)).toEqual([
      { drill_id: 'd-a', minutes: 15, coach_note: null },
      { drill_id: 'd-b', minutes: 8, coach_note: 'tight' },
    ])
  })
})

describe('chip confirm', () => {
  it('asks before replacing a coach-edited session', () => {
    expect(chipNeedsConfirm({ coach_edited_at: '2026-08-21T05:00:00.000Z' })).toBe(true)
    expect(chipNeedsConfirm({ coach_edited_at: null })).toBe(false)
    expect(chipNeedsConfirm(null)).toBe(false)
  })

  it('names the hour in the replace sentence', () => {
    expect(chipReplaceMessage('Tackle')).toBe('Replace your edits with the Tackle hour?')
  })
})

describe('browse-by-coach', () => {
  const names = new Map([
    ['p-row', 'Coach Rowan'],
    ['p-nia', 'Coach Nia'],
  ])

  it('groups on created_by and buckets null as Club / World Rugby', () => {
    const groups = groupByCoach(
      [
        { id: 'd1', created_by: 'p-row', title: 'Clamp' },
        { id: 'd2', created_by: null, title: 'Activate' },
        { id: 'd3', created_by: 'p-nia', title: 'Rip' },
        { id: 'd4', created_by: null, title: 'Track' },
      ],
      names,
    )
    expect(groups.map((g) => g.coach)).toEqual(['Coach Rowan', CLUB_BUCKET, 'Coach Nia'])
    expect(groups.find((g) => g.coach === CLUB_BUCKET).items.map((i) => i.id)).toEqual(['d2', 'd4'])
  })

  it('an unknown id is still the club bucket, never a blank card', () => {
    expect(coachLabel('p-missing', names)).toBe(CLUB_BUCKET)
    expect(coachLabel(null, names)).toBe(CLUB_BUCKET)
  })
})

describe('used this week', () => {
  // Club time is Asia/Dubai. A Thursday 27 Aug 2026 10:00 +04 window:
  // last 7 club days are Fri 21 → Thu 27 inclusive. Fri 20 is out.
  const now = new Date('2026-08-27T06:00:00.000Z') // 10:00 in Dubai
  const rows = [
    { eventId: 'e-today', startsAt: '2026-08-27T15:00:00.000Z' },
    { eventId: 'e-today', startsAt: '2026-08-27T15:00:00.000Z' }, // same event twice
    { eventId: 'e-week', startsAt: '2026-08-21T15:00:00.000Z' },
    { eventId: 'e-old', startsAt: '2026-08-20T15:00:00.000Z' },
  ]

  it('counts distinct training events in the last 7 club days, not row repeats', () => {
    expect(countUsedThisWeek(rows, { now })).toBe(2)
  })

  it('does not take a likes array — likes cannot change the number', () => {
    expect(countUsedThisWeek(rows, { now })).toBe(countUsedThisWeek(rows, { now }))
    expect(countUsedThisWeek([], { now })).toBe(0)
  })
})
