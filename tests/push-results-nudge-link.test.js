// @vitest-environment node
// Rot detector for the Monday results nudge (4 Sep 2026): the SQL sender, the
// edge function and the audience function agree by name, so a rename on one
// side goes red here rather than silent on a Monday.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = readFileSync(join(process.cwd(), 'db', 'migrations', '20260906_results_nudge.sql'), 'utf8')
const PUSH = readFileSync(join(process.cwd(), 'supabase', 'functions', 'push-send', 'index.ts'), 'utf8')

describe('results nudge (rot detector)', () => {
  it('the SQL sender and the edge function agree on the payload key', () => {
    expect(MIGRATION).toContain("body    := jsonb_build_object('results_nudge', jsonb_build_object(")
    expect(PUSH).toContain('results = payload?.results_nudge ?? null')
    expect(PUSH).toMatch(/\+ \(results \? 1 : 0\)/)
  })

  it('the edge function asks the database for the audience, by the name the migration creates', () => {
    expect(MIGRATION).toContain('create or replace function public.results_push_subscriptions(_competition uuid)')
    expect(PUSH).toContain('/rest/v1/rpc/results_push_subscriptions')
    expect(PUSH).toContain('JSON.stringify({ _competition: competitionId })')
    expect(MIGRATION).toContain('grant execute on function public.results_push_subscriptions(uuid) to service_role')
  })

  it('the audience is the keepers plus super admins, minus the results opt-out', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('create or replace function public.results_push_subscriptions'),
      MIGRATION.indexOf('create or replace function private.send_results_nudges'),
    )
    expect(fn).toContain('from public.competition_keepers k')
    expect(fn).toContain("m.role = 'admin' and m.status = 'active' and m.is_super")
    expect(fn).toContain("o.category = 'results'")
  })

  it('runs on Monday and tags per division', () => {
    expect(MIGRATION).toContain("'30 1 * * 1'")
    expect(MIGRATION).toContain("'tag',   'results-' || comp.id")
    expect(PUSH).toContain('tag: `results-${results.competition_id}`')
  })
})
