import { supabase } from '../lib/supabase'
import { fetchByIds } from './limits.js'

// Data access for public.membership_audit — who gave whom access, and when.
//
// Jay, 17 Aug 2026: "we need a change log for changes to rights", and then:
// "the log should only be visible by super admins".
//
// ⚠️ THE TABLE HAS BEEN RECORDING SINCE 17 Aug AND NOTHING READ IT. A log
// nobody can open is a log that is not doing its job — it is a table that looks
// like accountability in the schema and provides none at the moment somebody
// asks "who made them an admin?". This module and AdminRightsLog.jsx are the
// half that was missing.
//
// ⚠️ READ-ONLY, AND THERE IS NOTHING TO ADD HERE. The rows are written by the
// `audit_membership` trigger on public.memberships, never by the app — see that
// migration's header. If a future need looks like "write an audit line from the
// client", the answer is a trigger on whatever table the event belongs to. A
// client-side audit is one a new granting path can silently forget to call.
//
// RLS: `private.is_super_admin()` and nothing else. An ordinary club admin
// reading this gets zero rows, because this log records what ADMINS do and the
// audited must not be the only readers of their own audit.

/**
 * The most recent entries, newest first.
 *
 * ⚠️ THE LIMIT IS A REAL DECISION, NOT A GUARD AGAINST NOTHING. Every
 * membership insert, role change and revoke writes a row here forever, and this
 * table has no retention policy on purpose. Unbounded, this screen would get
 * slower every season with no visible cause. 200 is roughly a season of a club
 * this size and is deliberately shown to the reader — see the screen's footer,
 * which says how many it is showing rather than implying it is everything.
 *
 * ⚠️ NO `count`, NO PAGINATION YET. Adding either means deciding what the
 * screen does at the boundary, and the honest answer today is "nobody has
 * needed to scroll past the last 200". Say so rather than building a pager
 * nobody has asked to use.
 */
export async function listMembershipAudit({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('membership_audit')
    .select(
      'id, at, membership_id, profile_id, club_id, team_id, player_id, action, ' +
        'actor_id, actor_kind, old_role, new_role, old_status, new_status, ' +
        'old_is_super, new_is_super, old_rights, new_rights',
    )
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

/**
 * Names for the profiles an audit page mentions — both the SUBJECT and the
 * ACTOR, in one query.
 *
 * ⚠️ A SEPARATE QUERY BECAUSE membership_audit HAS NO FOREIGN KEYS, and that is
 * deliberate rather than an oversight: a key to `memberships` would make it
 * impossible to record a REVOKE, because the row it points at is being deleted.
 * PostgREST builds embeds out of foreign keys, so `profiles(full_name)` cannot
 * work here and never will. The migration's header has the full reasoning.
 *
 * ⚠️ AND A NAME CAN LEGITIMATELY BE MISSING. The audit outlives the profile: a
 * deleted account leaves its history behind, which is the entire point of
 * having no cascade. Callers must render "an account since deleted" rather than
 * a blank space — a blank reads as a bug in the screen, when it is the log
 * working exactly as designed.
 */
export async function listAuditProfiles(ids) {
  const wanted = [...new Set((ids ?? []).filter(Boolean))]
  return fetchByIds(wanted, async (chunk) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', chunk)
    if (error) throw error
    return data ?? []
  })
}
