// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The "Somebody has asked to join" push (2 Sep 2026, Jay: "add a push for
// plain access requests") — its trigger, its audience function and its
// push-send branch must agree on the payload key, and the tap must land
// somewhere the audience can open.
//
// ⚠️ A ROT DETECTOR, NOT A BEHAVIOUR TEST, like tests/push-approval-link.test.js:
// push-send is a Deno function with Deno.serve() at module scope, so the
// suite cannot run it. This file fails when the three sources stop saying
// what the deployed pieces must say. The REAL verification is a fresh
// account asking for access and a super admin's phone buzzing.
//
// ⚠️ EVERY ASSERTION CARRIES A CONTROL, so a matcher that finds nothing
// cannot pass by accident.

const root = resolve(import.meta.dirname, '..')
const PUSH = readFileSync(resolve(root, 'supabase/functions/push-send/index.ts'), 'utf8')
const MIGRATION = readFileSync(
  resolve(root, 'db/migrations/20260902_access_request_push.sql'),
  'utf8',
)
const EMAIL = readFileSync(resolve(root, 'supabase/functions/notify-access-request/index.ts'), 'utf8')

const BRANCH = PUSH.slice(
  PUSH.indexOf('} else if (accessRequestId) {'),
  PUSH.indexOf('} else if (messageId) {'),
)

describe('access-request push (rot detector)', () => {
  it('CONTROL: the slice is the access-request branch and known strings are visible', () => {
    expect(PUSH).toContain('} else if (accessRequestId) {')
    expect(PUSH).toContain('} else if (messageId) {')
    expect(BRANCH.length).toBeGreaterThan(200)
    expect(BRANCH).toContain('accessRequestTargets(accessRequestId)')
  })

  it('the trigger and push-send agree on the payload key', () => {
    expect(MIGRATION).toContain("jsonb_build_object('access_request_id', new.id)")
    expect(PUSH).toContain("payload?.access_request_id")
    // CONTROL: the approval pair, which is known to agree.
    expect(PUSH).toContain("payload?.approval_membership_id")
  })

  it('push-send counts the new key in its exactly-one guard', () => {
    const guard = PUSH.slice(PUSH.indexOf('// ⚠️ EXACTLY ONE.'), PUSH.indexOf("return new Response('bad request'", PUSH.indexOf('// ⚠️ EXACTLY ONE.')))
    expect(guard).toContain('(accessRequestId ? 1 : 0)')
    expect(guard).toContain('(approvalMembershipId ? 1 : 0)')
  })

  it('push-send reads the audience from the SQL function the migration defines', () => {
    expect(MIGRATION).toContain('create or replace function public.access_request_push_subscriptions(_request uuid)')
    expect(PUSH).toContain('rpc/access_request_push_subscriptions')
    expect(PUSH).toContain('rpc/approval_push_subscriptions')
  })

  it('the audience is the email’s: super admins only, and the migration says so', () => {
    expect(EMAIL).toContain('memberships?is_super=is.true&status=eq.active')
    expect(MIGRATION).toMatch(/and m\.is_super/)
    expect(MIGRATION).toMatch(/m\.profile_id is distinct from _requester/)
  })

  it('the tap lands on the Accounts screen under /admin, which super admins can open', () => {
    expect(BRANCH).toMatch(/url: `\$\{APP_URL\}\/admin\/accounts`/)
    // CONTROL: the approval branch links elsewhere and the pattern shape finds it.
    expect(PUSH).toMatch(/url: `\$\{APP_URL\}\/approvals`/)
  })

  it('the embed names the profile FK — the ambiguity that 500ed the email on 12 Aug 2026', () => {
    expect(BRANCH).toContain('profiles!access_requests_profile_id_fkey(full_name)')
    expect(EMAIL).toContain('profiles!access_requests_profile_id_fkey(')
  })
})
