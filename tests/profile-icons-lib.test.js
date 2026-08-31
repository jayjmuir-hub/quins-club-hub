import { describe, it, expect } from 'vitest'
import { ICON_LIBRARY, iconEmoji, iconMeaning } from '../src/lib/profileIcons.js'

// The curated library (claude/plans/2026-08-31-profile-icons.md): every icon
// carries a name and a default meaning — that is what makes a tap on
// someone's crown say something. The discriminating assertions: keys are
// db-safe (they are stored), emoji are unique (two crowns for two reasons
// can't be told apart — the argument that killed "any emoji"), and unknown
// keys resolve to NOTHING rather than garbage.

describe('the profile icon library', () => {
  it('holds the 31 ruled icons, crown first', () => {
    expect(ICON_LIBRARY).toHaveLength(31)
    expect(ICON_LIBRARY[0]).toMatchObject({ key: 'crown', emoji: '👑' })
  })

  it('every entry has a db-safe key, an emoji, a name and a meaning', () => {
    for (const entry of ICON_LIBRARY) {
      expect(entry.key).toMatch(/^[a-z0-9_]{1,32}$/)
      expect(entry.emoji.length).toBeGreaterThan(0)
      expect(entry.name.length).toBeGreaterThan(1)
      expect(entry.meaning.length).toBeGreaterThan(5)
    }
  })

  it('keys and emoji are unique', () => {
    const keys = ICON_LIBRARY.map((e) => e.key)
    const emoji = ICON_LIBRARY.map((e) => e.emoji)
    expect(new Set(keys).size).toBe(keys.length)
    expect(new Set(emoji).size).toBe(emoji.length)
  })

  it('lookups resolve, and an unknown key resolves to nothing', () => {
    expect(iconEmoji('crown')).toBe('👑')
    expect(iconMeaning('clipboard')).toMatch(/gaffer/i)
    // A revoked-from-the-library key stored in the db must fail to NOTHING.
    expect(iconEmoji('not_a_real_icon')).toBeNull()
    expect(iconMeaning('not_a_real_icon')).toBeNull()
  })

  it('the coach icon is the clipboard — the whistle tombstone holds', () => {
    // Unicode has no whistle emoji; three SVGs were drawn and rejected
    // (spec §rulings). If someone adds a "whistle" entry, they are
    // re-opening a settled argument — read the spec first.
    expect(ICON_LIBRARY.some((e) => e.key === 'whistle')).toBe(false)
    expect(iconEmoji('clipboard')).toBe('📋')
  })
})
