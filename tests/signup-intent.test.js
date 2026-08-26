import { describe, it, expect } from 'vitest'
import {
  claimedRole,
  needsPlayers,
  needsSquads,
  buildSignupIntent,
  NOTHING_TICKED,
  NO_SQUAD_CHOSEN,
} from '../src/lib/signupIntent.js'

describe('claimedRole', () => {
  it('picks staff first, even when they also have a child', () => {
    expect(claimedRole({ staff: true, child: true }, 'coach')).toBe('coach')
  })

  it('picks parent over volunteer', () => {
    expect(claimedRole({ child: true, helper: true })).toBe('parent')
  })

  it('needs a staff role string when they ticked staff', () => {
    expect(claimedRole({ staff: true }, '')).toBe(null)
  })
})

describe('buildSignupIntent', () => {
  const base = {
    firstName: 'Anne',
    lastName: 'Granelli',
    answers: { child: true },
    squadIds: ['team-u12'],
  }

  it('refuses a blank family name', () => {
    expect(buildSignupIntent({ ...base, lastName: '' }).error).toMatch(/family name/i)
  })

  it('refuses no ticks', () => {
    expect(buildSignupIntent({ ...base, answers: {} }).error).toBe(NOTHING_TICKED)
  })

  it('refuses no squad', () => {
    expect(buildSignupIntent({ ...base, squadIds: [] }).error).toBe(NO_SQUAD_CHOSEN)
  })

  // ⚠️ 26 Aug 2026 — a real committee member was walled out by the squad
  // requirement the day after the wizard shipped. Jay reversed his 17 Aug
  // "keep the requirement" ruling: helper-ONLY skips squads
  // (claude/decisions/2026-08-26-volunteer-no-squad.md). The controls
  // matter as much as the fix: any other tick alongside helper still
  // demands one, or the 16 Aug who-are-you rule quietly dies for everyone.
  it('a helper-only signup needs no squad and claims volunteer', () => {
    const { intent, error } = buildSignupIntent({
      ...base,
      answers: { helper: true },
      squadIds: [],
    })
    expect(error).toBeUndefined()
    expect(intent.claimed_role).toBe('volunteer')
    expect(intent.squad_ids).toEqual([])
  })

  it('…but helper plus any squad-shaped tick still demands one', () => {
    expect(
      buildSignupIntent({ ...base, answers: { helper: true, child: true }, squadIds: [] }).error,
    ).toBe(NO_SQUAD_CHOSEN)
    expect(
      buildSignupIntent({
        ...base,
        answers: { helper: true, staff: true },
        staffRole: 'coach',
        squadIds: [],
      }).error,
    ).toBe(NO_SQUAD_CHOSEN)
  })

  it('needsSquads is false only for the sole-helper shape', () => {
    expect(needsSquads({ helper: true })).toBe(false)
    expect(needsSquads({})).toBe(true)
    expect(needsSquads({ helper: true, self: true })).toBe(true)
    expect(needsSquads({ child: true })).toBe(true)
  })

  it('packs a parent intent the trigger can read', () => {
    const { intent, error } = buildSignupIntent(base)
    expect(error).toBeUndefined()
    expect(intent.claimed_role).toBe('parent')
    expect(intent.first_name).toBe('Anne')
    expect(intent.squad_ids).toEqual(['team-u12'])
    expect(needsPlayers(intent.answers)).toBe(true)
  })

  it('keeps coach-parent as a coach claim with player rows', () => {
    const { intent } = buildSignupIntent({
      ...base,
      answers: { child: true, staff: true },
      staffRole: 'coach',
      staffTeamId: 'team-u16',
      players: [
        {
          firstName: 'Amina',
          lastName: 'Khan',
          dob: '2014-03-01',
          teamId: 'team-u12',
          gender: null,
          selfRegister: false,
          playUpConsent: false,
        },
      ],
    })
    expect(intent.claimed_role).toBe('coach')
    expect(intent.staff_role).toBe('coach')
    expect(intent.players).toHaveLength(1)
    expect(intent.players[0].first_name).toBe('Amina')
  })
})
