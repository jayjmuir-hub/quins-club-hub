import { supabase } from '../lib/supabase'
import { totalMinutes } from '../lib/trainingPlans.js'

// Training plans — read and write. claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ EVERY WRITE CHECKS FOR THE ZERO-ROW RLS RESULT. A non-admin's update
// arrives as data === null, error === null — a successful nothing — and the
// screen would report a save that never happened. Same guard as teams.js.

const REFUSED = "We couldn't save that — you may not have the Rugby Performance Director right."
const DRILL_EMBED = 'drill:drills(id,title,summary,body,source_name,source_url,minutes,category,requires_contact,min_age,max_age,is_active)'

function must(data, error) {
  if (error) throw new Error(error.message || REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}

/**
 * The drill library. Default (no teamId) is the Director's view — every drill,
 * club and squad-owned alike. Pass `teamId` for a coach's view: the club
 * library (team_id null) plus that ONE squad's own drills, and nothing from
 * another squad. ⚠️ The scoping is here, not in RLS — a drill holds no personal
 * data and a squad-owned one appears inside a family-visible session, so its
 * row must stay readable (see 20260827_coach_training_plans.sql). "Private"
 * means "not in another squad's picker", and this is where that is enforced.
 */
export async function listDrills({ includeRetired = false, teamId = null } = {}) {
  let q = supabase.from('drills').select('*').order('title')
  if (!includeRetired) q = q.eq('is_active', true)
  if (teamId) q = q.or(`team_id.is.null,team_id.eq.${teamId}`)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

/** Drills a coach has suggested for the club library — the Director's queue. */
export async function listSubmittedDrills() {
  const { data, error } = await supabase
    .from('drills')
    .select('*')
    .not('team_id', 'is', null)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/** A coach offers their squad drill to the club library. */
export async function submitDrillToClub(id) {
  const { data, error } = await supabase
    .from('drills')
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

/** The Director accepts a suggestion: it becomes a club drill (team_id null). */
export async function approveDrillToClub(id) {
  const { data, error } = await supabase
    .from('drills')
    .update({ team_id: null, submitted_at: null })
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

/** The Director declines: it stays the squad's own, no longer in the queue. */
export async function dismissDrillSubmission(id) {
  const { data, error } = await supabase
    .from('drills')
    .update({ submitted_at: null })
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

export async function upsertDrill(drill) {
  const { data, error } = await supabase.from('drills').upsert(drill).select().maybeSingle()
  return must(data, error)
}

export async function setDrillActive(id, active) {
  const { data, error } = await supabase.from('drills').update({ is_active: active }).eq('id', id).select().maybeSingle()
  return must(data, error)
}

export async function listTemplates({ includeRetired = false, teamId = null } = {}) {
  let q = supabase
    .from('session_templates')
    .select(`*, blocks:session_template_blocks(id,position,drill_id,minutes,coach_note,${DRILL_EMBED})`)
    .order('name')
  if (!includeRetired) q = q.eq('is_active', true)
  // Same scoping rule as listDrills: a coach sees the club templates plus their
  // own squad's, never another squad's.
  if (teamId) q = q.or(`team_id.is.null,team_id.eq.${teamId}`)
  const { data, error } = await q
  if (error) throw error
  // PostgREST cannot order an embed independently; sort the handful here.
  return (data ?? []).map((t) => ({ ...t, blocks: [...(t.blocks ?? [])].sort((a, b) => a.position - b.position) }))
}

/** Templates a coach has suggested for the club library — the Director's queue. */
export async function listSubmittedTemplates() {
  const { data, error } = await supabase
    .from('session_templates')
    .select(`*, blocks:session_template_blocks(id,position,drill_id,minutes,coach_note,${DRILL_EMBED})`)
    .not('team_id', 'is', null)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((t) => ({ ...t, blocks: [...(t.blocks ?? [])].sort((a, b) => a.position - b.position) }))
}

export async function submitTemplateToClub(id) {
  const { data, error } = await supabase
    .from('session_templates')
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

export async function approveTemplateToClub(id) {
  const { data, error } = await supabase
    .from('session_templates')
    .update({ team_id: null, submitted_at: null })
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

export async function dismissTemplateSubmission(id) {
  const { data, error } = await supabase
    .from('session_templates')
    .update({ submitted_at: null })
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

/**
 * Saves a template and REPLACES its blocks. Positions are renumbered 1..n
 * from the order given, so a reorder in the builder is the only source of
 * truth and no gap or duplicate can reach the UNIQUE (template_id, position).
 */
export async function saveTemplate(template, blocks) {
  const row = { ...template, total_minutes: totalMinutes(blocks) }
  const { data, error } = await supabase.from('session_templates').upsert(row).select().maybeSingle()
  const saved = must(data, error)
  const del = await supabase.from('session_template_blocks').delete().eq('template_id', saved.id)
  if (del.error) throw del.error
  if (blocks.length > 0) {
    const ins = await supabase.from('session_template_blocks').insert(
      blocks.map((b, i) => ({
        template_id: saved.id,
        position: i + 1,
        drill_id: b.drill_id,
        minutes: b.minutes,
        coach_note: b.coach_note ?? null,
      })),
    )
    if (ins.error) throw ins.error
  }
  return saved
}

export async function setTemplateActive(id, active) {
  const { data, error } = await supabase.from('session_templates').update({ is_active: active }).eq('id', id).select().maybeSingle()
  return must(data, error)
}

export async function listFocus() {
  const { data, error } = await supabase.from('training_focus').select('*').order('starts_on', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function upsertFocus(focus) {
  const { data, error } = await supabase.from('training_focus').upsert(focus).select().maybeSingle()
  return must(data, error)
}

/**
 * Removes a focus. A focus is a label, so deleting one loses nothing — but
 * the delete still goes through `must()`: a bare `.delete()` answers
 * `{ error: null }` whether it removed a row or RLS filtered it to nothing,
 * and the screen would then report a removal that never happened and watch
 * the label reappear on reload. `.select()` makes the zero-row case visible.
 */
export async function deleteFocus(id) {
  const { data, error } = await supabase
    .from('training_focus')
    .delete()
    .eq('id', id)
    .select()
    .maybeSingle()
  return must(data, error)
}

async function callPublish({ templateId, teamIds, from, to }, preview) {
  const { data, error } = await supabase.rpc('publish_training', {
    _template: templateId,
    _teams: teamIds,
    _from: from,
    _to: to,
    _preview: preview,
  })
  if (error) throw new Error(error.message || REFUSED)
  return data ?? []
}

/** Per-squad counts, writing nothing. The SAME function as publish(). */
export function previewPublish(args) {
  return callPublish(args, true)
}

export function publish(args) {
  return callPublish(args, false)
}

/**
 * Which of these events have a published session, and how big — a Map of
 * event_id → { id, blockCount, minutes }. One query for the Squad Training
 * screen's whole list; the full plan (drills, notes, focus) stays
 * getSession's job, fetched only for the session somebody actually opens.
 */
export async function listSessionsForEvents(eventIds) {
  const ids = (eventIds ?? []).filter(Boolean)
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase
    .from('training_sessions')
    .select('id, event_id, blocks:training_session_blocks(minutes)')
    .in('event_id', ids)
  if (error) throw error
  const sessions = new Map()
  for (const row of data ?? []) {
    const blocks = row.blocks ?? []
    sessions.set(row.event_id, {
      id: row.id,
      blockCount: blocks.length,
      minutes: totalMinutes(blocks),
    })
  }
  return sessions
}

export async function getSession(eventId) {
  if (!eventId) return null
  const { data, error } = await supabase
    .from('training_sessions')
    .select(`*, blocks:training_session_blocks(id,position,drill_id,minutes,coach_note,${DRILL_EMBED})`)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...data, blocks: [...(data.blocks ?? [])].sort((a, b) => a.position - b.position) }
}

/**
 * A coach builds a plan for an event that has none yet. One session per event
 * (event_id is UNIQUE), so this is the create half of saveSessionBlocks.
 *
 * ⚠️ coach_edited_at IS STAMPED AT BIRTH. publish_training skips any session
 * carrying it, so a coach who plans tonight before the Director publishes a
 * template is never silently overwritten — their plan is theirs. `visibility`
 * defaults to 'staff' (the coach ruling, 27 Aug): a half-built plan is not
 * pushed at families the instant it is saved.
 */
export async function createSession({ eventId, templateId = null, visibility = 'staff', blocks = [], notes = null, createdBy = null }) {
  const ins = await supabase
    .from('training_sessions')
    .insert({
      event_id: eventId,
      template_id: templateId,
      visibility,
      // ⚠️ OMITTED when not given, so the column DEFAULT auth.uid() fills the
      // author. Sending null would OVERRIDE the default with a null and break
      // the draft RLS check. Only the harness passes an explicit id.
      ...(createdBy ? { created_by: createdBy } : {}),
      coach_edited_at: new Date().toISOString(),
      notes: notes ?? null,
    })
    .select()
    .maybeSingle()
  const session = must(ins.data, ins.error)
  if (blocks.length > 0) {
    const insBlocks = await supabase.from('training_session_blocks').insert(
      blocks.map((b, i) => ({
        session_id: session.id,
        position: i + 1,
        drill_id: b.drill_id,
        minutes: b.minutes,
        coach_note: b.coach_note ?? null,
      })),
    )
    if (insBlocks.error) throw insBlocks.error
  }
  return session
}

/** Who sees this plan: draft (the author), staff (the squad's staff), squad. */
export async function setSessionVisibility(sessionId, visibility) {
  const { data, error } = await supabase
    .from('training_sessions')
    .update({ visibility })
    .eq('id', sessionId)
    .select()
    .maybeSingle()
  return must(data, error)
}

/**
 * Save the running order a coach has built as a template for their own squad —
 * squad-owned (team_id set), so it joins their picker and nobody else's until
 * they suggest it to the club. Mirrors saveTemplate's block-replace, but always
 * an insert (a new template) and always squad-scoped.
 */
export async function saveSquadTemplate({ clubId, teamId, name, notes = null, blocks = [] }) {
  const row = {
    club_id: clubId,
    team_id: teamId,
    name,
    notes,
    total_minutes: totalMinutes(blocks),
  }
  const { data, error } = await supabase.from('session_templates').insert(row).select().maybeSingle()
  const saved = must(data, error)
  if (blocks.length > 0) {
    const ins = await supabase.from('session_template_blocks').insert(
      blocks.map((b, i) => ({
        template_id: saved.id,
        position: i + 1,
        drill_id: b.drill_id,
        minutes: b.minutes,
        coach_note: b.coach_note ?? null,
      })),
    )
    if (ins.error) throw ins.error
  }
  return saved
}

/**
 * A coach's adjustment. Replaces the blocks and STAMPS coach_edited_at — the
 * column publish_training reads to leave this session alone from now on.
 */
export async function saveSessionBlocks(sessionId, blocks, notes) {
  const upd = await supabase
    .from('training_sessions')
    .update({ coach_edited_at: new Date().toISOString(), notes: notes ?? null })
    .eq('id', sessionId)
    .select()
    .maybeSingle()
  must(upd.data, upd.error)
  const del = await supabase.from('training_session_blocks').delete().eq('session_id', sessionId)
  if (del.error) throw del.error
  if (blocks.length > 0) {
    const ins = await supabase.from('training_session_blocks').insert(
      blocks.map((b, i) => ({
        session_id: sessionId,
        position: i + 1,
        drill_id: b.drill_id,
        minutes: b.minutes,
        coach_note: b.coach_note ?? null,
      })),
    )
    if (ins.error) throw ins.error
  }
}
