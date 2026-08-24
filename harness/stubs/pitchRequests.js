// Harness stub replacing src/data/pitchRequests.js via a Vite alias.
//
// ⚠️ EVERY EXPORT THE REAL MODULE HAS, including the ones no scenario calls.
// A missing export is a module-resolution failure that blanks the whole
// harness, not just this screen.

export const REQUEST_STATUSES = ['submitted', 'allocated', 'declined', 'cancelled']

export function isOpen(request) {
  return request?.status === 'submitted'
}

// One request waiting, because the queue is the half of this screen that is not
// the grid — and an empty queue renders nothing at all, so a scenario with none
// would silently stop covering it.
const REQUESTS = [
  {
    id: 'pr-1',
    status: 'submitted',
    needs_referee: true,
    note: 'Any pitch with posts, please — we are practising conversions.',
    requested_by: 'pr-coach',
    events: {
      id: 'e-req',
      team_id: 't2',
      title: null,
      opponent: 'Dubai Exiles',
      starts_at: '2026-08-15T05:00:00.000Z',
      pitch: null,
    },
  },
]

export async function listPitchRequests({ status } = {}) {
  return status ? REQUESTS.filter((request) => request.status === status) : REQUESTS
}

export async function requestPitch(payload) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'request-pitch', payload })
  return { id: 'pr-new', status: 'submitted', ...payload }
}

export async function allocatePitch(payload) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'allocate-pitch', payload })
  return { id: payload?.requestId, status: 'allocated' }
}

export async function setEventPitch(eventId, pitch) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'set-event-pitch', payload: { eventId, pitch } })
  return { id: eventId, pitch }
}

export async function declinePitch(payload) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'decline-pitch', payload })
  return { id: payload?.requestId, status: 'declined' }
}

export async function withdrawRequest(requestId) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'withdraw-request', payload: { requestId } })
}
