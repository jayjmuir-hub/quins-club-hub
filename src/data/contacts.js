import { supabase } from '../lib/supabase'

// The ONE read path for a member's phone/email since Phase 1b (28 Aug 2026).
//
// ⚠️ profiles.email and profiles.phone are REVOKED from direct SELECT for
// `authenticated` (db/migrations/20260828_profiles_contact_revoke.sql), so the
// columns cannot be read off the table — a narrowed admin could otherwise pull
// a parent's login contact with a raw PostgREST query. `public.member_contacts`
// (SECURITY DEFINER) returns them nulled unless the caller is entitled: self, a
// staff/admin target (ruling C — staff are contactable), an allowlisted admin
// (S2), or a coach of the target's squad. db/migrations/20260828_member_contacts_fn.sql.
//
// ⚠️ AN RPC, NOT AN `.in()` — the array rides in the POST body, so there is no
// URL-length cliff and no chunking (unlike fetchByIds).

/**
 * phone/email for many profiles, as a Map keyed by profile id. A denied or
 * missing id maps to {phone:null, email:null}, never throws for absence.
 */
export async function fetchContacts(ids) {
  const wanted = [...new Set((ids ?? []).filter(Boolean))]
  if (!wanted.length) return new Map()
  const { data, error } = await supabase.rpc('member_contacts', { _ids: wanted })
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.id, { phone: row.phone ?? null, email: row.email ?? null }]))
}

/** The empty contact, so a merge target always has the keys. */
export const NO_CONTACT = { phone: null, email: null }
