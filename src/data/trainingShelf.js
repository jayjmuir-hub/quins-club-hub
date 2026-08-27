import { supabase } from '../lib/supabase'
import { createSession, saveSessionBlocks } from './trainingPlans.js'
import {
  blocksFromTemplate,
  chipNeedsConfirm,
  countUsedThisWeek,
  inLastClubDays,
} from '../lib/trainingShelf.js'

// Squad Training shelf — likes, favorites, chip apply, used-this-week.
// Spec: claude/specs/2026-08-27-training-shelf.md
//
// ⚠️ DOES NOT CALL publish_training. Applying a chip is createSession /
// saveSessionBlocks on TONIGHT's event. Publish onto calendars stays the
// Director's RPC.

const WEEK_MS = 8 * 24 * 60 * 60 * 1000

function must(data, error) {
  if (error) throw new Error(error.message || "We couldn't save that.")
  if (!data) throw new Error("We couldn't save that.")
  return data
}

/** Apply a chip hour to tonight. Never publish_training. */
export async function applyChipHour({ eventId, session, template, confirmed = false, notes = null }) {
  if (chipNeedsConfirm(session) && !confirmed) {
    return { applied: false, needsConfirm: true }
  }
  const blocks = blocksFromTemplate(template)
  if (!session) {
    await createSession({
      eventId,
      templateId: template.id,
      blocks,
      notes: notes ?? template.notes ?? null,
    })
  } else {
    await saveSessionBlocks(session.id, blocks, notes ?? session.notes ?? null, {
      templateId: template.id,
    })
  }
  return { applied: true, needsConfirm: false }
}

export async function appendDrillsToSession({ eventId, session, drills }) {
  const extra = (drills ?? []).map((drill) => ({
    drill_id: drill.id,
    minutes: Number(drill.minutes) || 10,
    coach_note: null,
  }))
  if (extra.length === 0) return session
  if (!session) {
    return createSession({ eventId, blocks: extra })
  }
  const existing = (session.blocks ?? []).map((block) => ({
    drill_id: block.drill_id ?? block.drill?.id,
    minutes: Number(block.minutes),
    coach_note: block.coach_note ?? null,
  }))
  await saveSessionBlocks(session.id, [...existing, ...extra], session.notes ?? null)
  return session
}

export async function listLikes(table, idColumn) {
  const { data, error } = await supabase.from(table).select(`${idColumn}, profile_id`)
  if (error) throw error
  return data ?? []
}

export async function togglePair({ table, idColumn, id, profileId, on }) {
  if (on) {
    const { error } = await supabase.from(table).insert({ [idColumn]: id, profile_id: profileId })
    if (error) throw error
  } else {
    const { error } = await supabase.from(table).delete().eq(idColumn, id).eq('profile_id', profileId)
    if (error) throw error
  }
}

export function toggleDrillLike(args) {
  return togglePair({ table: 'drill_likes', idColumn: 'drill_id', ...args })
}
export function toggleTemplateLike(args) {
  return togglePair({ table: 'template_likes', idColumn: 'template_id', ...args })
}
export function toggleDrillFavorite(args) {
  return togglePair({ table: 'drill_favorites', idColumn: 'drill_id', ...args })
}
export function toggleTemplateFavorite(args) {
  return togglePair({ table: 'template_favorites', idColumn: 'template_id', ...args })
}

export async function listCoachNames(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))]
  if (unique.length === 0) return new Map()
  const { data, error } = await supabase.from('profiles').select('id, full_name').in('id', unique)
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.id, row.full_name]))
}

/**
 * Recent training sessions with enough to count used-this-week in club time.
 * Fetches a slightly wide UTC window; the 7 Asia/Dubai days are applied in JS.
 */
export async function listRecentTrainingUsage({ now = new Date() } = {}) {
  const from = new Date(now.getTime() - WEEK_MS).toISOString()
  const { data, error } = await supabase
    .from('events')
    .select('id, starts_at, sessions:training_sessions(id, template_id, blocks:training_session_blocks(drill_id))')
    .eq('type', 'training')
    .gte('starts_at', from)
  if (error) throw error
  const rows = []
  for (const event of data ?? []) {
    if (!inLastClubDays(event.starts_at, { now })) continue
    for (const session of event.sessions ?? []) {
      if (session.template_id) {
        rows.push({
          kind: 'template',
          id: session.template_id,
          eventId: event.id,
          startsAt: event.starts_at,
        })
      }
      for (const block of session.blocks ?? []) {
        if (!block.drill_id) continue
        rows.push({
          kind: 'drill',
          id: block.drill_id,
          eventId: event.id,
          startsAt: event.starts_at,
        })
      }
    }
  }
  return rows
}

export function usedThisWeekById(usageRows, kind, id, opts) {
  return countUsedThisWeek(
    (usageRows ?? []).filter((row) => row.kind === kind && row.id === id),
    opts,
  )
}

export function likeCounts(rows, idColumn) {
  const counts = new Map()
  for (const row of rows ?? []) {
    const id = row[idColumn]
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

export function idsForProfile(rows, idColumn, profileId) {
  return new Set((rows ?? []).filter((row) => row.profile_id === profileId).map((row) => row[idColumn]))
}

export { must }
