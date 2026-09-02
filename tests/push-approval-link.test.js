// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Where the "Waiting to be approved" push lands when it is tapped.
//
// THE BUG (2 Sep 2026): a team manager was pushed about a coach registering
// for their squad — correctly, the audience is super admins plus that squad's
// head coach and managers (db/migrations/20260819_approval_push.sql) — and the
// tap opened /admin/accounts. /admin is gated on isAdmin() in
// src/screens/AdminDashboard.jsx before any child renders, so the manager saw
// "Not authorised" for a request they are allowed to approve. The email for
// the same request (supabase/functions/notify-approval) links to /approvals,
// which mounts Accounts directly and self-gates: admins get the full screen,
// squad staff get their approvals queue. The push must link where the email
// links.
//
// ⚠️ THIS IS A ROT DETECTOR, NOT A BEHAVIOUR TEST, exactly like
// tests/push-body-attachments.test.js and for the same reason: push-send is a
// Deno function with Deno.serve() at module scope, so the suite cannot run
// it. This file fails when the source stops saying what the deployed function
// must say. The REAL verification is a non-admin manager tapping a live push.
//
// ⚠️ EVERY ASSERTION CARRIES A CONTROL, so a matcher that finds nothing
// cannot pass by accident.

const root = resolve(import.meta.dirname, '..')
const PUSH = readFileSync(resolve(root, 'supabase/functions/push-send/index.ts'), 'utf8')
const EMAIL = readFileSync(resolve(root, 'supabase/functions/notify-approval/index.ts'), 'utf8')
const APP = readFileSync(resolve(root, 'src/App.jsx'), 'utf8')

/** Just the approval branch, so a hit elsewhere in push-send cannot satisfy an assertion. */
const APPROVAL_BRANCH = PUSH.slice(
  PUSH.indexOf('} else if (approvalMembershipId) {'),
  PUSH.indexOf('} else if (messageId) {'),
)

describe('approval push deep link (rot detector)', () => {
  it('CONTROL: the slice is the approval branch and the matcher can see known strings', () => {
    expect(PUSH).toContain('} else if (approvalMembershipId) {')
    expect(PUSH).toContain('} else if (messageId) {')
    expect(APPROVAL_BRANCH.length).toBeGreaterThan(200)
    expect(APPROVAL_BRANCH).toContain("title: 'Waiting to be approved'")
    expect(APPROVAL_BRANCH).toContain('approvalTargets(approvalMembershipId)')
  })

  it('the push lands on /approvals, the route that self-gates for squad staff', () => {
    expect(APPROVAL_BRANCH).toMatch(/url: `\$\{APP_URL\}\/approvals`/)
    // The bug, spelled out: anything under /admin is refused for a non-admin
    // before the child route renders.
    expect(APPROVAL_BRANCH).not.toMatch(/url: `\$\{APP_URL\}\/admin/)
    // CONTROL: the negative matcher is capable of matching — the fixture push
    // in the same file links under a different path and the pattern shape
    // finds it. If this line fails the regex is broken, not the source.
    expect(PUSH).toMatch(/url: `\$\{APP_URL\}\/schedule`/)
  })

  it('the push and the email for the same request link to the same place', () => {
    // If somebody moves the queue they must move both, or one of the two
    // channels sends squad staff somewhere they cannot go.
    expect(EMAIL).toContain('`${APP_URL}/approvals`')
    expect(EMAIL).not.toContain('/admin/accounts')
  })

  it('/approvals is a real route that mounts Accounts directly, not a redirect', () => {
    expect(APP).toMatch(/<Route path="\/approvals" element=\{<AppShell><Accounts \/><\/AppShell>\} \/>/)
    // CONTROL: /accounts IS a redirect, and the matcher can tell the two apart.
    expect(APP).toMatch(/<Route path="\/accounts" element=\{<Navigate to="\/admin\/accounts" replace \/>\} \/>/)
  })
})
