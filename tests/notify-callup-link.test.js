// @vitest-environment node
// Rot detector for the call-up email (4 Sep 2026): the SQL sender, the vault
// derivation and the edge function agree by name and payload key.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = readFileSync(join(process.cwd(), 'db', 'migrations', '20260907_callup_email_and_clash.sql'), 'utf8')
const FN = readFileSync(join(process.cwd(), 'supabase', 'functions', 'notify-callup', 'index.ts'), 'utf8')

describe('notify-callup (rot detector)', () => {
  it('the endpoint is derived from approval_notify_url by an anchored replace', () => {
    expect(MIGRATION).toContain("regexp_replace(base, '/notify-approval$', '/notify-callup')")
    expect(MIGRATION).toContain("'callup_notify_url'")
  })
  it('the SQL sender and the function agree on the payload key and the gate', () => {
    expect(MIGRATION).toContain("body    := jsonb_build_object('request_id', _request)")
    expect(FN).toContain("requestId = String(body?.request_id ?? '')")
    expect(MIGRATION).toContain("'x-approval-secret', secret")
    expect(FN).toContain("request.headers.get('x-approval-secret')")
    expect(FN).toContain("Deno.env.get('APPROVAL_NOTIFY_SECRET')")
  })
  it('the family, and only the family, is mailed', () => {
    expect(FN).toContain('&status=eq.active&role=in.(parent,player)&select=profiles(email)')
    expect(FN).not.toMatch(/date_of_birth|phone/)
  })
  it('the harness switch silences it, and a Resend outage cannot fail the ask', () => {
    expect(MIGRATION).toContain("if current_setting('app.harness', true) = 'on' then return; end if;")
    expect(MIGRATION).toContain("raise warning 'notify_callup_email: %', sqlerrm;")
  })
})
