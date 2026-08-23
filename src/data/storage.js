import { supabase } from '../lib/supabase'

// What the club's data weighs — the database and each photo bucket, in bytes.
// Admin-only by the function itself (public.storage_usage): a member gets an
// empty list, not an error. See db/migrations/20260823_storage_usage.sql.
//
// ⚠️ THE ALLOWANCES ARE HERE, NOT IN THE DATABASE, AND THEY ARE THE PRO PLAN'S
// as read off the Supabase dashboard on 23 Aug 2026. CLAUDE.md's warning that
// every recorded number rots applies: if the plan changes, this is the one
// place to change.
export const PLAN_LIMITS = {
  database: 8 * 1024 ** 3,
  files: 100 * 1024 ** 3,
}

export async function storageUsage() {
  const { data, error } = await supabase.rpc('storage_usage')
  if (error) throw error
  return data ?? []
}

export function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} kB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(n / 1024 ** 3).toFixed(1)} GB`
}
