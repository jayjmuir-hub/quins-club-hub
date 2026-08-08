import { describe, it, expect } from 'vitest'
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  checkPassword,
  isPasswordValid,
} from '../src/lib/password.js'

// These tests pin the rules against the REAL server behaviour, measured by
// probing https://<project>.supabase.co/auth/v1/signup on 8 Aug 2026. Each
// case below is annotated with what GoTrue actually did, so a future change to
// the dashboard that desyncs this file fails here rather than in front of a
// parent.

describe('password rules mirror the live Supabase config', () => {
  it('requires 8 characters, matching the dashboard', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('has exactly the five rules the server enforces', () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      'length',
      'lower',
      'upper',
      'digit',
      'symbol',
    ])
  })
})

describe('checkPassword', () => {
  it('accepts a password the server accepted', () => {
    // Server: 200. (Also 43 appearances in HIBP — we deliberately do not
    // check that; see claude/decisions/2026-08-08-parent-self-registration.md)
    expect(isPasswordValid('Harlequins1!')).toBe(true)
  })

  it.each([
    // [password, the rule that should fail, what the server actually returned]
    ['abc', 'length', '422 weak_password — too short AND missing three classes'],
    ['password', 'upper', '422 weak_password'],
    ['password1', 'upper', '422 weak_password'],
    ['Password1', 'symbol', '422 weak_password — the near-miss case'],
    ['PASSWORD1!', 'lower', '422 weak_password'],
    ['Password!', 'digit', '422 weak_password'],
    ['Pa1!', 'length', '422 weak_password'],
  ])('rejects %s on the %s rule', (password, failingRule) => {
    const { rules, valid } = checkPassword(password)
    expect(valid).toBe(false)
    expect(rules.find((r) => r.id === failingRule)?.met).toBe(false)
  })

  it('accepts every symbol GoTrue lists, not just the common ones', () => {
    // The 422 message enumerates its symbol set. If our class is narrower we
    // nag people about a password the server would have taken.
    const symbols = '!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~'.split('')
    for (const s of symbols) {
      const pw = 'Abcdefg1' + s
      expect(isPasswordValid(pw), `symbol ${s} should be accepted`).toBe(true)
    }
  })

  it('does not treat a space as a symbol', () => {
    // Not in GoTrue's list. If we counted it, the checklist would go green on
    // "Abcdefg1 " and the server would refuse it.
    expect(isPasswordValid('Abcdefg1 ')).toBe(false)
  })

  it('survives a non-string without throwing', () => {
    // An uncontrolled input hands this undefined on first render. A crash on
    // the sign-up screen is worse than an all-red checklist.
    expect(() => checkPassword(undefined)).not.toThrow()
    expect(checkPassword(undefined).valid).toBe(false)
    expect(checkPassword(null).valid).toBe(false)
    expect(checkPassword(12345678).valid).toBe(false)
  })

  it('reports every rule, met or not, so the UI can show a full checklist', () => {
    const { rules } = checkPassword('')
    expect(rules).toHaveLength(5)
    expect(rules.every((r) => r.met === false)).toBe(true)
    expect(rules.every((r) => typeof r.label === 'string' && r.label.length > 0)).toBe(true)
  })
})
