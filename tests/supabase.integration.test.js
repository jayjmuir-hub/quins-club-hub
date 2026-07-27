import { describe, it, expect } from 'vitest'
import { supabase } from '../src/lib/supabase.js'

// Real network call against the live Supabase project. Run with:
//   npm run test:integration
// Requires a local .env with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set
// (see .env.example). Excluded from the default `npm test` run.
//
// FINDING (2026-07-27): RLS on `teams` ("team read" policy) requires a
// matching `memberships` row for auth.uid(). An anonymous client has no
// auth.uid(), so the query succeeds (no error) but every row is filtered out
// by RLS — count is 0, not the 15 seeded age groups. This is a real behaviour
// of the live database, not a test bug: the anon/publishable key can connect,
// but cannot read team data until Task 3/6 wires up authenticated sessions
// (or a policy change makes `teams` readable to any authenticated user, or to
// anon, is deliberately added). See task-2-report.md for detail.
describe('Supabase connection (integration)', () => {
  it('connects successfully but sees zero teams as an unauthenticated client (RLS)', async () => {
    const { count, error } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })

    expect(error).toBeNull()
    expect(count).toBe(0)
  })
})
