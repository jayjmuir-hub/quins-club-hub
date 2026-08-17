// @vitest-environment node
// Nothing here touches the DOM. The measurement and the rule are in vite.config.js.
import { describe, expect, it } from 'vitest'
import { missingForFamily, missingForMe, missingForPlayer } from '../src/lib/completeness.js'

// src/lib/completeness.js — what the club is still missing about a person.
//
// ══ THE CONTRACT EVERY CASE BELOW DEFENDS ════════════════════════════════
// The card that reads this DISAPPEARS when the list is empty. A chase with no
// visible end is ignored by about the third sign-in, and once ignored it is
// worse than nothing: it trains people to skip the one place the club asks them
// for something.
//
// So the assertions that matter are not "it finds the gap". They are the ones
// about what it REFUSES to chase.

const U12 = { id: 't-u12', name: 'U12 Mixed' }
const U16G = { id: 't-u16g', name: 'U16G Contact' }
const ADA = { id: 'p-1', first_name: 'Ada', full_name: 'Ada Okafor', gender: null }

describe('a child', () => {
  it('is silent when everything is on file', () => {
    expect(
      missingForPlayer({ player: ADA, team: U12, dateOfBirth: '2014-03-04', parentCount: 2 }),
    ).toEqual([])
  })

  it('names the birthday, and names the child', () => {
    const gaps = missingForPlayer({ player: ADA, team: U12, dateOfBirth: null, parentCount: 1 })
    expect(gaps.map((g) => g.id)).toEqual(['dob'])
    expect(gaps[0].label).toMatch(/Ada/)
  })

  it('asks for a parent when there is none', () => {
    const gaps = missingForPlayer({ player: ADA, team: U12, dateOfBirth: '2014-03-04', parentCount: 0 })
    expect(gaps.map((g) => g.id)).toEqual(['parent'])
  })

  // ⚠️ AN UNKNOWN IS NOT A GAP. `undefined` means "we did not look" — a parent
  // reading a team-mate gets null from RLS, and treating that as "no birthday on
  // file" would put a card in front of somebody about a child that is not theirs
  // and that they cannot fix.
  it('says nothing about what it was not told', () => {
    expect(missingForPlayer({ player: ADA, team: U12 })).toEqual([])
    expect(missingForPlayer({ player: ADA, team: U12, dateOfBirth: undefined })).toEqual([])
  })

  // ⚠️ ONLY WHERE THE SQUAD ASKS. Gender is required on a single-gender squad
  // and optional everywhere else, so chasing it on a mixed squad would be the
  // app demanding something it does not itself require.
  it('asks about gender only on a single-gender squad', () => {
    const mixed = missingForPlayer({ player: ADA, team: U12, dateOfBirth: '2014-03-04', parentCount: 1 })
    expect(mixed.map((g) => g.id)).not.toContain('gender')

    const single = missingForPlayer({ player: ADA, team: U16G, dateOfBirth: '2011-03-04', parentCount: 1 })
    expect(single.map((g) => g.id)).toEqual(['gender'])
  })

  // ⚠️ THE ASSERTION THAT KEEPS THE CARD FINISHABLE, AND THE ONE MOST LIKELY TO
  // BE "FIXED" BY SOMEBODY LATER. Position fails both tests for inclusion: it is
  // a coach's judgement rather than a parent's to set, and at 23 of 26 players
  // (measured 17 Aug 2026) it is the NORMAL state of a youth club rather than a
  // gap. Listing it would put a card on almost every screen, permanently.
  it('never chases a position', () => {
    const gaps = missingForPlayer({
      player: { ...ADA, position: null, unit: null },
      team: U12,
      dateOfBirth: '2014-03-04',
      parentCount: 1,
    })
    expect(gaps).toEqual([])
  })

  it('never throws on junk', () => {
    expect(missingForPlayer()).toEqual([])
    expect(missingForPlayer({})).toEqual([])
  })
})

describe('the adult themselves', () => {
  it('asks for a phone number, and says what it is for', () => {
    const gaps = missingForMe({ profile: { id: 'u1', phone: null } })
    expect(gaps.map((g) => g.id)).toEqual(['phone'])
    expect(gaps[0].label).toMatch(/coach can reach you/i)
  })

  it('is silent once there is one', () => {
    expect(missingForMe({ profile: { id: 'u1', phone: '+971501234567' } })).toEqual([])
  })

  it('treats whitespace as missing', () => {
    expect(missingForMe({ profile: { id: 'u1', phone: '   ' } }).map((g) => g.id)).toEqual(['phone'])
  })

  // ⚠️ THE FAMILY NAME IS DELIBERATELY ABSENT. Zero adults are missing one, and
  // the sign-in gate and the roll-call both already require it — a rule here
  // would be a third place enforcing a fact that cannot be missing, and the
  // first to go stale when either of the other two changes.
  it('does not chase a family name', () => {
    const gaps = missingForMe({ profile: { id: 'u1', phone: '+971501234567', last_name: null } })
    expect(gaps).toEqual([])
  })
})

describe('a whole family', () => {
  it('gathers the adult and every child into one list', () => {
    const gaps = missingForFamily({
      profile: { id: 'u1', phone: null },
      children: [
        { player: ADA, team: U12, dateOfBirth: null, parentCount: 1 },
        { player: { id: 'p-2', first_name: 'Kwame' }, team: U12, dateOfBirth: '2015-01-01', parentCount: 0 },
      ],
    })
    expect(gaps.map((g) => g.id)).toEqual(['phone', 'p-1:dob', 'p-2:parent'])
  })

  // ⚠️ THE WHOLE CONTRACT IN ONE ASSERTION. An empty list is what makes the card
  // disappear, and a card that can be finished is one people finish.
  it('is empty when a family is complete', () => {
    expect(
      missingForFamily({
        profile: { id: 'u1', phone: '+971501234567' },
        children: [{ player: ADA, team: U12, dateOfBirth: '2014-03-04', parentCount: 2 }],
      }),
    ).toEqual([])
  })

  it('is empty for somebody with no children and nothing missing', () => {
    expect(missingForFamily({ profile: { id: 'u1', phone: '+971501234567' } })).toEqual([])
    expect(missingForFamily()).toEqual([])
  })

  // Two children missing the same thing must not collide as React keys.
  it('keeps each child’s gaps distinct', () => {
    const gaps = missingForFamily({
      profile: { id: 'u1', phone: '+971501234567' },
      children: [
        { player: ADA, team: U12, dateOfBirth: null, parentCount: 1 },
        { player: { id: 'p-2', first_name: 'Kwame' }, team: U12, dateOfBirth: null, parentCount: 1 },
      ],
    })
    expect(new Set(gaps.map((g) => g.id)).size).toBe(2)
  })
})
