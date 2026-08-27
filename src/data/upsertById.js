import { supabase } from '../lib/supabase'

// Insert-or-update a single row, keyed by the presence of `row.id`:
//   id present → UPDATE ... WHERE id = row.id
//   id absent  → INSERT
// The id is only ever the filter, never written as a column either way.
//
// ⚠️ A REFUSED WRITE COMES BACK AS `data === null` WITH NO ERROR. RLS filters a
// write the caller may not perform to zero rows, and PostgREST still answers
// 200 — so "no row back" is a refusal, NOT a success. Without the `!data`
// branch a non-permitted save would report success and change nothing. Every
// upsert in src/data hand-wrote this trap; it now lives here once.
//
// Callers keep their differences through the options:
//   embed          the select() projection for the returned row (default '*')
//   refusedMessage the message thrown when RLS filters the write to zero rows
//   mapError       turns a RAISED db error into the Error to throw; omit to
//                  rethrow the raw PostgREST error unchanged (the default that
//                  events/pitches/players relied on)
export async function upsertById(
  table,
  row,
  { embed = '*', refusedMessage = "We couldn't save that.", mapError } = {},
) {
  const { id, ...fields } = row ?? {}

  const query = id
    ? supabase.from(table).update(fields).eq('id', id).select(embed).maybeSingle()
    : supabase.from(table).insert(fields).select(embed).maybeSingle()

  const { data, error } = await query
  if (error) throw mapError ? mapError(error) : error
  if (!data) throw new Error(refusedMessage)
  return data
}
