// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The "Training suggested" push (2 Sep 2026, Part 1 of
// claude/plans/2026-09-02-training-suggestions-and-age-guidance.md) — the SQL
// sender, the audience function and the push-send branch must agree on the
// payload key and the RPC name, and the tap must land on the squad's training
// shelf, which is where Accept / Decline live.
//
// ⚠️ A ROT DETECTOR, NOT A BEHAVIOUR TEST, like tests/push-access-request-link.test.js:
// push-send is a Deno function with Deno.serve() at module scope, so the
// suite cannot run it. The REAL verification is a publish and a coach's phone
// buzzing. ⚠️ EVERY ASSERTION CARRIES A CONTROL.

const root = resolve(import.meta.dirname, '..')
const PUSH = readFileSync(resolve(root, 'supabase/functions/push-send/index.ts'), 'utf8')
const MIGRATION = readFileSync(
  resolve(root, 'db/migrations/20260902_training_suggestion_push.sql'),
  'utf8',
)
const APP = readFileSync(resolve(root, 'src/App.jsx'), 'utf8')

const BRANCH = PUSH.slice(PUSH.indexOf('} else if (training) {'), PUSH.indexOf('} else if (squad) {'))

describe('training suggestion push (rot detector)', () => {
  it('CONTROL: the slice is the training branch and known strings are visible', () => {
    expect(PUSH).toContain('} else if (training) {')
    expect(PUSH).toContain('} else if (squad) {')
    expect(BRANCH.length).toBeGreaterThan(200)
    expect(BRANCH).toContain('trainingSuggestionTargets(out.team_id')
  })

  it('the SQL sender and the edge function agree on the payload key', () => {
    expect(MIGRATION).toContain("jsonb_build_object('training_suggestion_push', jsonb_build_object('outbox_id', outbox))")
    expect(PUSH).toContain("training = payload?.training_suggestion_push ?? null")
    // ...and the key counts towards "exactly one".
    expect(PUSH).toMatch(/\+ \(training \? 1 : 0\) !== 1\)/)
  })

  it('the edge function asks the database for the audience, by the name the migration creates', () => {
    expect(MIGRATION).toContain('create or replace function public.training_suggestion_push_subscriptions(_team uuid, _actor uuid)')
    expect(PUSH).toContain('/rest/v1/rpc/training_suggestion_push_subscriptions')
    expect(PUSH).toContain('JSON.stringify({ _team: team, _actor: actor })')
    // Service role only — a member must not be able to list who is told.
    expect(MIGRATION).toContain('grant execute on function public.training_suggestion_push_subscriptions(uuid, uuid) to service_role')
    expect(MIGRATION).toContain('revoke all on function public.training_suggestion_push_subscriptions(uuid, uuid) from public, anon, authenticated')
  })

  it('the audience is squad STAFF, never the actor, minus the training opt-out', () => {
    const fn = MIGRATION.slice(
      MIGRATION.indexOf('create or replace function public.training_suggestion_push_subscriptions'),
      MIGRATION.indexOf('create or replace function private.send_training_suggestion_push'),
    )
    expect(fn.length).toBeGreaterThan(200)
    expect(fn).toContain("m.role in ('coach','manager','medic')")
    expect(fn).toContain('m.profile_id <> _actor')
    expect(fn).toContain("o.category = 'training'")
    expect(fn).not.toContain('parent')
  })

  it('the tap lands on the squad training shelf, a route that exists', () => {
    expect(MIGRATION).toContain("'/squad/' || _team || '/training'")
    expect(APP).toContain('path="/squad/:teamId/training"')
    // Control: a route that does NOT exist is not claimed.
    expect(APP).not.toContain('path="/squad/:teamId/suggestions"')
  })

  it('suggest_training sends once per squad, only for real, only when something was suggested', () => {
    const fn = MIGRATION.slice(MIGRATION.lastIndexOf('create or replace function public.suggest_training'))
    expect(fn).toContain('if not _preview and will_suggest > 0 then')
    expect(fn).toContain('perform private.send_training_suggestion_push(_club, _team, _me, will_suggest, _from, _to);')
    // Inside the per-squad loop, after the per-event loop, before return next.
    expect(fn.indexOf('end loop;\n\n    if will_suggest = 0')).toBeGreaterThan(-1)
    expect(fn.indexOf('perform private.send_training_suggestion_push')).toBeLessThan(fn.indexOf('return next;'))
  })

  it("the new category is in the constraint AND the app's list", () => {
    expect(MIGRATION).toContain("'document','training'));")
    const prefs = readFileSync(resolve(root, 'src/data/notificationPreferences.js'), 'utf8')
    expect(prefs).toContain("key: 'training'")
  })
})
