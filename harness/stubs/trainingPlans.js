// Stub for src/data/trainingPlans.js — the screenshot harness only. Returns
// a fixed, INVENTED training plan (no real people, no real drills) so the
// SquadTraining list, the read view, and the block editor all render populated
// for the coach walkthrough guide. Aliased in harness/vite.config.js. Never
// talks to Supabase; matches the real module's return shapes.
import { totalMinutes } from '../../src/lib/trainingPlans.js'

const drill = (id, title, summary, minutes, category, contact = false) => ({
  id,
  title,
  summary,
  body: null,
  source_name: null,
  source_url: null,
  diagram_url: null,
  minutes,
  category,
  requires_contact: contact,
  min_age: null,
  max_age: null,
  is_active: true,
  team_id: null,
})

const DRILLS = [
  drill('d1', 'Grid handling warm-up', 'Four corners, ball through hands, no dropped ball to win.', 10, 'warm_up'),
  drill('d2', '2-v-1 draw and pass', 'Fix the defender, pass late, hit the runner in space.', 20, 'skill'),
  drill('d3', 'Ruck clear-out technique', 'Low, leg drive, protect the ball — one arriving player at a time.', 15, 'skill', true),
  drill('d4', 'Defensive line speed', 'Up together off the touch, no dog-legs. Reset and go again.', 15, 'conditioning'),
  drill('d5', 'Conditioned game — two-touch', 'Small-sided, two touches then offload. Rewards support lines.', 25, 'game'),
  drill('d6', 'Cool-down and stretch', 'Easy laps, then the full stretch routine as a group.', 5, 'cool_down'),
]

const TEMPLATES = [
  { id: 't-skills', name: 'Skills night — backs', team_id: 't1', requires_contact: false, min_age: null, max_age: null, is_active: true, notes: 'Handling and decision-making focus.' },
  { id: 't-contact', name: 'Contact & conditioning', team_id: null, requires_contact: true, min_age: 11, max_age: null, is_active: true, notes: 'Club template — needs a contact age group.' },
]

// The published plan the "Planned" session shows: 4 blocks, 75 minutes.
const BLOCKS = [
  { id: 'b1', position: 1, drill_id: 'd1', minutes: 15, coach_note: 'Sharp — set the tempo for the night.', drill: DRILLS[0] },
  { id: 'b2', position: 2, drill_id: 'd2', minutes: 20, coach_note: 'Both sides. Watch the timing of the pass.', drill: DRILLS[1] },
  { id: 'b3', position: 3, drill_id: 'd5', minutes: 25, coach_note: 'Let it flow — only stop it for a real error.', drill: DRILLS[4] },
  { id: 'b4', position: 4, drill_id: 'd6', minutes: 15, coach_note: null, drill: DRILLS[5] },
]

const SESSION = {
  id: 'sess-1',
  event_id: null, // filled per-request
  template_id: null,
  visibility: 'squad',
  notes: 'Half the squad away at a tournament — keep numbers even in the game.',
  coach_edited_at: '2026-08-30T12:00:00Z',
  created_by: 'coach-1',
  blocks: BLOCKS,
}

// ---- reads (what the guide screenshots need) ----
export async function listDrills({ teamId = null } = {}) { void teamId; return DRILLS }
export async function listTemplates({ teamId = null } = {}) { void teamId; return TEMPLATES }
export async function listFocus() { return [] }

export async function listSessionsForEvents(eventIds) {
  const ids = (eventIds ?? []).filter(Boolean)
  const map = new Map()
  // First upcoming session is planned; the rest read "No plan yet".
  if (ids[0]) map.set(ids[0], { id: 'sess-1', blockCount: BLOCKS.length, minutes: totalMinutes(BLOCKS), visibility: 'squad' })
  return map
}

export async function getSession(eventId) {
  if (!eventId) return null
  return { ...SESSION, event_id: eventId }
}

// ---- writes (no-ops; the guide never saves, but a stray tap must not crash) ----
export async function createSession({ eventId }) { return { ...SESSION, event_id: eventId } }
export async function saveSessionBlocks() { return {} }
export async function saveSquadTemplate() { return { id: 't-new' } }
export async function setSessionVisibility() { return {} }
export async function submitDrillToClub() { return {} }
export async function submitTemplateToClub() { return {} }
export async function upsertDrill(d) { return { id: 'd-new', ...d } }
