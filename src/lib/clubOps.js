// Club Ops hybrid C — play-up board items. Pure: fixtures in, board rows out.
// Super-admin Approve still goes through decide_playup_request (42501 for
// everyone else). This file only shapes the inbox, never grants.

export const PLAYUP_BOARD_REQUESTED = 'requested'
export const PLAYUP_BOARD_AWAITING_PARENT = 'awaiting_parent'
export const PLAYUP_BOARD_APPROVED = 'approved'
export const PLAYUP_BOARD_DECLINED = 'declined'

export function isOpenPlayupBoard(board) {
  return board === PLAYUP_BOARD_REQUESTED || board === PLAYUP_BOARD_AWAITING_PARENT
}

function guestKey(playerId, guestTeamId) {
  return `${playerId}:${guestTeamId}`
}

/**
 * Merge open/done play-up requests with pending guest twins into one board.
 * Awaiting-parent wins over a matching `approved` request so the same child
 * is not listed twice.
 */
export function buildPlayupOpsItems({ requests = [], pendingGuests = [] } = {}) {
  const items = []
  const awaiting = new Set()

  for (const guest of pendingGuests) {
    const playerId = guest.id ?? guest.player_id
    const guestTeamId = guest.guest_of ?? guest.team_id
    if (!playerId || !guestTeamId) continue
    if (guest.playup_consent !== 'pending') continue
    awaiting.add(guestKey(playerId, guestTeamId))
    items.push({
      id: `guest:${playerId}:${guestTeamId}`,
      requestId: null,
      board: PLAYUP_BOARD_AWAITING_PARENT,
      playerId,
      playerName: guest.full_name ?? guest.players?.full_name ?? '',
      homeTeamId: guest.team_id && guest.team_id !== guestTeamId ? guest.team_id : guest.home_team_id ?? null,
      homeTeamName: guest.home_team_name ?? guest.home?.name ?? '',
      guestTeamId,
      guestTeamName: guest.guest_team_name ?? guest.guest?.name ?? guest.teams?.name ?? '',
      kind: guest.kind ?? null,
      note: guest.note ?? null,
      createdAt: guest.created_at ?? null,
      decidedAt: null,
      viewTo: `/roster?open=${playerId}`,
    })
  }

  for (const row of requests) {
    const playerId = row.player_id
    const guestTeamId = row.guest_team_id
    const key = guestKey(playerId, guestTeamId)
    if (row.status === 'approved' && awaiting.has(key)) continue

    let board = PLAYUP_BOARD_REQUESTED
    if (row.status === 'approved') board = PLAYUP_BOARD_APPROVED
    else if (row.status === 'declined') board = PLAYUP_BOARD_DECLINED
    else if (row.status !== 'requested') continue

    items.push({
      id: row.id,
      requestId: row.id,
      board,
      playerId,
      playerName: row.players?.full_name ?? '',
      homeTeamId: row.home_team_id,
      homeTeamName: row.home?.name ?? '',
      guestTeamId,
      guestTeamName: row.guest?.name ?? '',
      kind: row.kind ?? null,
      note: row.note ?? null,
      createdAt: row.created_at ?? null,
      decidedAt: row.decided_at ?? null,
      viewTo: `/roster?open=${playerId}`,
    })
  }

  const rank = {
    [PLAYUP_BOARD_REQUESTED]: 0,
    [PLAYUP_BOARD_AWAITING_PARENT]: 1,
    [PLAYUP_BOARD_APPROVED]: 2,
    [PLAYUP_BOARD_DECLINED]: 3,
  }
  items.sort((a, b) => {
    const byBoard = (rank[a.board] ?? 9) - (rank[b.board] ?? 9)
    if (byBoard !== 0) return byBoard
    return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))
  })
  return items
}

export function openPlayupOpsItems(items) {
  return (items ?? []).filter((item) => isOpenPlayupBoard(item.board))
}

export function donePlayupOpsItems(items) {
  return (items ?? []).filter((item) => !isOpenPlayupBoard(item.board))
}
