// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, expect, it } from 'vitest'
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  dialCodeFor,
  formatNationalPhone,
  formatPhone,
  isValidPhone,
  joinPhone,
  splitPhone,
  whatsappUrl,
} from '../src/lib/phone.js'
import { RELATIONSHIPS, isKnownRelationship } from '../src/lib/relationships.js'

describe('COUNTRIES', () => {
  it('covers the world and carries code, name and dial code', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200)
    const uae = COUNTRIES.find((c) => c.code === 'AE')
    expect(uae).toMatchObject({ code: 'AE', dial: '971' })
    expect(uae.name).toMatch(/emirates/i)
  })

  it('is sorted by name, because that is how a person scans a picker', () => {
    const names = COUNTRIES.map((c) => c.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('includes the countries this expat club actually needs', () => {
    const codes = COUNTRIES.map((c) => c.code)
    for (const code of ['AE', 'GB', 'IE', 'ZA', 'NZ', 'AU', 'FR', 'IN', 'PK', 'PH', 'US']) {
      expect(codes).toContain(code)
    }
  })
})

describe('dialCodeFor', () => {
  it('returns the dial code without a plus', () => {
    expect(dialCodeFor('AE')).toBe('971')
    expect(dialCodeFor('GB')).toBe('44')
  })

  it('returns null for junk rather than throwing', () => {
    expect(dialCodeFor('ZZ')).toBeNull()
    expect(dialCodeFor(undefined)).toBeNull()
  })
})

describe('splitPhone', () => {
  it('splits a stored E.164 number into country and national part', () => {
    expect(splitPhone('+971501234567')).toEqual({ country: 'AE', national: '501234567' })
    expect(splitPhone('+441134960000')).toEqual({ country: 'GB', national: '1134960000' })
  })

  it('opens an empty field on the default country when there is nothing stored', () => {
    expect(splitPhone('')).toEqual({ country: DEFAULT_COUNTRY, national: '' })
    expect(splitPhone(null)).toEqual({ country: DEFAULT_COUNTRY, national: '' })
    expect(splitPhone(undefined)).toEqual({ country: DEFAULT_COUNTRY, national: '' })
  })

  it('keeps a legacy free-form number instead of discarding it', () => {
    // player_contacts.phone has accepted free text since the app shipped, so
    // rows like this already exist. Losing the digits on edit would be data
    // destruction; re-attributing them to a country we cannot confirm would
    // be a lie. Keep them, show the default flag, let the user correct it.
    const result = splitPhone('050 111 2222')
    expect(result.national).toBe('050 111 2222')
    expect(result.country).toBe(DEFAULT_COUNTRY)
  })
})

describe('joinPhone', () => {
  it('builds E.164 from a country and typed digits', () => {
    expect(joinPhone('AE', '501234567')).toBe('+971501234567')
    expect(joinPhone('AE', '050 123 4567')).toBe('+971501234567')
  })

  it('returns null when nothing was typed', () => {
    expect(joinPhone('AE', '')).toBeNull()
    expect(joinPhone('AE', '   ')).toBeNull()
    expect(joinPhone('AE', undefined)).toBeNull()
  })

  it('still stores an unrecognised number rather than refusing it', () => {
    // A satellite phone or a prefix newer than the bundled metadata must
    // still be recordable. Validity drives a warning, not a wall.
    expect(joinPhone('AE', '12')).toBe('+97112')
  })

  it('falls back to the default country when handed a junk country code', () => {
    expect(joinPhone('ZZ', '501234567')).toBe('+971501234567')
  })
})

describe('isValidPhone', () => {
  it('accepts a real number for that country', () => {
    expect(isValidPhone('AE', '501234567')).toBe(true)
    expect(isValidPhone('GB', '1134960000')).toBe(true)
  })

  it('rejects a number that is wrong for that country', () => {
    expect(isValidPhone('AE', '12')).toBe(false)
  })

  it('treats an empty field as fine, because the field is optional', () => {
    expect(isValidPhone('AE', '')).toBe(true)
  })
})

describe('formatPhone', () => {
  it('formats a stored number for reading', () => {
    expect(formatPhone('+971501234567')).toBe('+971 50 123 4567')
  })

  it('returns a legacy free-form number untouched rather than blanking it', () => {
    expect(formatPhone('050 111 2222')).toBe('050 111 2222')
  })

  it('returns an empty string for nothing stored', () => {
    expect(formatPhone(null)).toBe('')
  })
})

describe('formatNationalPhone', () => {
  it('groups digits the way the selected country writes them', () => {
    expect(formatNationalPhone('AE', '501234567')).toBe('050 123 4567')
  })

  it('returns a part-typed number unchanged rather than mangling it', () => {
    expect(formatNationalPhone('AE', '50')).toBe('50')
    expect(formatNationalPhone('AE', '')).toBe('')
  })
})

describe('shared dial codes', () => {
  it('resolves +44 numbers to the right jurisdiction, not just "UK"', () => {
    // The case that rules out a hand-rolled dial-code list: +44 is shared
    // between the UK, Guernsey, Jersey and the Isle of Man, and +1 covers
    // some two dozen countries. Only real metadata gets these right.
    expect(splitPhone('+447911123456').country).toBe('GG')
    expect(splitPhone('+441134960000').country).toBe('GB')
  })
})

describe('RELATIONSHIPS', () => {
  it('is exactly the agreed list, common cases first', () => {
    expect(RELATIONSHIPS).toEqual([
      'Mother',
      'Father',
      'Step-mother',
      'Step-father',
      'Aunt',
      'Uncle',
      'Grandmother',
      'Grandfather',
      'Guardian',
    ])
  })

  it('puts the two common answers at the top, not in alphabetical order', () => {
    expect(RELATIONSHIPS[0]).toBe('Mother')
    expect(RELATIONSHIPS[1]).toBe('Father')
  })

  it('recognises its own values and nothing else', () => {
    expect(isKnownRelationship('Mother')).toBe(true)
    expect(isKnownRelationship('mum')).toBe(false)
  })
})

describe('whatsappUrl', () => {
  // ⚠️ `wa.me` TAKES BARE DIGITS. Given a `+` or a space it opens WhatsApp on
  // an error rather than on a conversation, and it fails quietly enough to
  // ship — nothing throws, the app looks fine, and the button just does not
  // work. E.164 storage is what makes the strip a one-liner.
  it('strips the plus from a stored E.164 number', () => {
    expect(whatsappUrl('+971500000001')).toBe('https://wa.me/971500000001')
  })

  it('strips spaces and punctuation from a number typed by hand', () => {
    expect(whatsappUrl('+971 50 (123) 4567')).toBe('https://wa.me/971501234567')
  })

  // A tappable control that opens nothing is worse than no control, so the
  // caller needs a null it can branch on rather than a broken link.
  it.each([null, undefined, '', '   ', 'not a number'])('returns null for %j', (value) => {
    expect(whatsappUrl(value)).toBeNull()
  })
})
