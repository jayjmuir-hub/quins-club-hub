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

export async function listDrills({ includeRetired = false } = {}) {
  let q = supabase.from('drills').select('*').order('title')
  if (!includeRetired) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function upsertDrill(drill) {
  const { data, error } = await supabase.from('drills').upsert(drill).select().maybeSingle()
  return must(data, error)
}

export async function setDrillActive(id, active) {
  const { data, error } = await supabase.from('drills').update({ is_active: active }).eq('id', id).select().maybeSingle()
  return must(data, error)
}

export async function listTemplates({ includeRetired = false } = {}) {
  let q = supabase
    .from('session_templates')
    .select(`*, blocks:session_template_blocks(id,position,drill_id,minutes,coach_note,${DRILL_EMBED})`)
    .order('name')
  if (!includeRetired) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  // PostgREST cannot order an embed independently; sort the handful here.
  return (data ?? []).map((t) => ({ ...t, blocks: [...(t.blocks ?? [])].sort((a, b) => a.position - b.position) }))
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
