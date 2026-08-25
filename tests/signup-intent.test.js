import { describe, it, expect } from 'vitest'
import {
  claimedRole,
  needsPlayers,
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
