// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  PLAYUP_BOARD_REQUESTED,
  PLAYUP_BOARD_AWAITING_PARENT,
  PLAYUP_BOARD_DECLINED,
  buildPlayupOpsItems,
  openPlayupOpsItems,
  donePlayupOpsItems,
} from '../src/lib/clubOps.js'

// Invented names. Board shape for Club Ops hybrid C (slice 3).

const REQUESTED = {
  id: 'req-1',
  status: 'requested',
  kind: 'host_request',
  note: 'Need a hooker this Saturday',
  player_id: 'p-home',
  home_team_id: 'team-u13',
  guest_team_id: 'team-u14b',
  created_at: '2026-09-05T08:00:00Z',
  players: { full_name: 'Harness Home Alderton' },
  home: { name: 'U13 Mixed' },
  guest: { name: 'U14B' },
}

const APPROVED = {
  ...REQUESTED,
  id: 'req-2',
  status: 'approved',
  player_id: 'p-guest',
  decided_at: '2026-09-05T09:00:00Z',
  players: { full_name: 'Harness Guest Belmont' },
}

const DECLINED = {
  ...REQUESTED,
  id: 'req-3',
  status: 'declined',
  player_id: 'p-no',
  players: { full_name: 'Harness No Carlisle' },
}

const PENDING_GUEST = {
  id: 'p-guest',
  full_name: 'Harness Guest Belmont',
  team_id: 'team-u13',
  guest_of: 'team-u14b',
  playup_consent: 'pending',
  home_team_name: 'U13 Mixed',
  guest_team_name: 'U14B',
}

describe('buildPlayupOpsItems', () => {
  it('lists a requested row first, then awaiting parent, then done', () => {
    const items = buildPlayupOpsItems({
      requests: [DECLINED, REQUESTED, APPROVED],
      pendingGuests: [PENDING_GUEST],
    })
    expect(items.map((row) => row.board)).toEqual([
      PLAYUP_BOARD_REQUESTED,
      PLAYUP_BOARD_AWAITING_PARENT,
      PLAYUP_BOARD_DECLINED,
    ])
    expect(items[0].playerName).toBe('Harness Home Alderton')
    expect(items[0].requestId).toBe('req-1')
    expect(items[1].board).toBe(PLAYUP_BOARD_AWAITING_PARENT)
    expect(items[1].requestId).toBeNull()
  })

  it('does not double-count an approved request that is still awaiting parent', () => {
    const items = buildPlayupOpsItems({
      requests: [APPROVED],
      pendingGuests: [PENDING_GUEST],
    })
    expect(items).toHaveLength(1)
    expect(items[0].board).toBe(PLAYUP_BOARD_AWAITING_PARENT)
  })

  it('splits Open from Done', () => {
    const items = buildPlayupOpsItems({
      requests: [REQUESTED, DECLINED],
      pendingGuests: [PENDING_GUEST],
    })
    expect(openPlayupOpsItems(items).map((row) => row.board)).toEqual([
      PLAYUP_BOARD_REQUESTED,
      PLAYUP_BOARD_AWAITING_PARENT,
    ])
    expect(donePlayupOpsItems(items).map((row) => row.board)).toEqual([PLAYUP_BOARD_DECLINED])
  })

  it('View lands on the roster player sheet, not a second play-ups admin page', () => {
    const [item] = buildPlayupOpsItems({ requests: [REQUESTED] })
    expect(item.viewTo).toBe('/roster?open=p-home')
  })
})
