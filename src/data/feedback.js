import { supabase } from '../lib/supabase'

// Reports and suggestions from members. Table + reasoning:
// db/migrations/20260818_feedback.sql, claude/plans/2026-08-18-help-and-feedback.md.
//
// ⚠️ `club_id`, `submitted_by` AND `status` ARE DELIBERATELY ABSENT FROM
// EVERY WRITE BELOW. A BEFORE INSERT trigger stamps all three from the
// submitter's own membership. Adding them here would not make them settable —
// the trigger overwrites — but it would make this file look as though they
// are, which is how the next person reintroduces the hole.

const SELECT = `
  id, ref, kind, body, route, context, status, admin_note,
  handled_by, handled_at, created_at,
  profiles!feedback_submitted_by_fkey(full_name)
`

/** The statuses an admin may move a report through, in the order they appear. */
export const FEEDBACK_STATUSES = ['new', 'in-progress', 'done', 'wontfix']

/**
 * What each status is CALLED, in one place.
 *
 * ⚠️ SHARED BY THE ADMIN LIST AND THE MEMBER'S OWN VIEW ON PURPOSE. Two copies
 * would drift, and the drift would be invisible: the admin would read "Won't
 * fix" while the person who reported it read something else about the same row,
 * and neither would ever see both screens at once to notice.
 */
export const FEEDBACK_STATUS_LABELS = {
  new: 'New',
  'in-progress': 'In progress',
  done: 'Done',
  wontfix: "Won't fix",
}

/** Statuses that still want somebody's attention. Drives the badge count. */
export const OPEN_STATUSES = ['new', 'in-progress']

/**
 * The reference a person can quote back at you — `QCH-0041`.
 *
 * ⚠️ FORMATTING ONLY. `ref` is `generated always as identity`, so this is a
 * presentation of a number the database owns; nothing here may invent one.
 * Padded to four digits and then allowed to grow, rather than truncated — a
 * club that files 10,000 reports gets QCH-10000, not a collision.
 */
export function feedbackRef(ref) {
  if (ref === null || ref === undefined) return null
  return `QCH-${String(ref).padStart(4, '0')}`
}

/**
 * Everything the app knows about where the person was and what they were
 * using, gathered at the moment they tapped send.
 *
 * ⚠️ THIS IS SHOWN TO THE MEMBER BEFORE IT IS SENT, and the panel lists it in
 * plain words. Anything added here has to be something you would be content to
 * read aloud to a parent — that is the test, not whether it is technically
 * useful. No cookies, no storage, no ids beyond the route.
 */
export function captureContext({ route, appVersion } = {}) {
  const nav = typeof navigator === 'undefined' ? null : navigator
  const win = typeof window === 'undefined' ? null : window
  return {
    route: route ?? null,
    app_version: appVersion ?? null,
    user_agent: nav?.userAgent ?? null,
    language: nav?.language ?? null,
    viewport: win ? `${win.innerWidth}x${win.innerHeight}` : null,
    // Whether they are in the installed PWA or a browser tab. Worth having:
    // a bug that only reproduces in standalone mode is otherwise a mystery.
    standalone: win?.matchMedia?.('(display-mode: standalone)')?.matches ?? null,
    reported_at: new Date().toISOString(),
  }
}

/**
 * Files a report or a suggestion.
 *
 * Returns the created row, so the panel can show the reference number without
 * a second round trip.
 */
export async function submitFeedback({ kind, body, route, context }) {
  if (kind !== 'bug' && kind !== 'idea') {
    throw new Error('submitFeedback needs kind "bug" or "idea".')
  }
  const text = (body ?? '').trim()
  if (!text) {
    // ⚠️ The same message the panel shows inline. The check exists in both
    // places on purpose: the database CHECK is the guarantee, this is the
    // courtesy, and neither is a substitute for the other.
    throw new Error('Tell us what happened first.')
  }

  const { data, error } = await supabase
    .from('feedback')
    .insert({ kind, body: text, route: route ?? null, context: context ?? {} })
    .select(SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * The admin triage list — open reports first, newest first.
 *
 * ⚠️ NO CLUB FILTER IN THE QUERY, AND THAT IS NOT AN OVERSIGHT. RLS decides
 * what this returns: an admin sees their club's, anybody else sees only their
 * own. A club_id here would read as though it were the control, and the day
 * somebody removes it thinking it redundant, nothing would change — which is
 * exactly how a filter gets mistaken for a policy.
 *
 * ⚠️ AND THAT IS WHY THE MEMBER'S "YOUR REPORTS" VIEW CALLS THIS SAME FUNCTION.
 * It needs no `submitted_by = me` argument, because the policy already says so
 * — `submitted_by = auth.uid() or private.is_admin(club_id)`. Adding one would
 * be a second, weaker statement of the same rule, and the weaker one is the one
 * somebody would later "simplify".
 */
export async function listFeedback({ open = false } = {}) {
  let query = supabase.from('feedback').select(SELECT)
  if (open) query = query.in('status', OPEN_STATUSES)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Moves a report through triage.
 *
 * ⚠️ `handled_by` AND `handled_at` ARE SET HERE, NOT BY A TRIGGER, and that is
 * a deliberate difference from the insert path. The insert stamps are security
 * boundaries — a client must not choose its own club or author. These two are
 * bookkeeping on an action only an admin can perform at all, and the column
 * grant is what stops anybody else writing them.
 */
export async function setFeedbackStatus(id, status, { adminNote, actorId } = {}) {
  if (!id) throw new Error('setFeedbackStatus needs a feedback id.')
  if (!FEEDBACK_STATUSES.includes(status)) {
    throw new Error(`Unknown feedback status: ${status}`)
  }

  const patch = {
    status,
    handled_by: actorId ?? null,
    handled_at: new Date().toISOString(),
  }
  // ⚠️ ABSENT vs NULL. Omitting the key leaves an existing note alone; sending
  // null would erase it. The triage control changes status far more often than
  // it writes a note, so "leave it alone" has to be the default.
  if (adminNote !== undefined) patch.admin_note = adminNote

  const { data, error } = await supabase
    .from('feedback')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single()

  if (error) throw error
  return data
}
