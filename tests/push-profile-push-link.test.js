// @vitest-environment node
// Rot detector for the push-to-named-profiles route (4 Sep 2026, call-ups):
// the SQL sender, the edge function and the audience function agree by name.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = readFileSync(join(process.cwd(), 'db', 'migrations', '20260906_callups.sql'), 'utf8')
const PUSH = readFileSync(join(process.cwd(), 'supabase', 'functions', 'push-send', 'index.ts'), 'utf8')
const HARNESS = readFileSync(join(process.cwd(), 'db', 'tests', 'callups.sql'), 'utf8')

describe('profile push (rot detector)', () => {
  it('the SQL sender and the edge function agree on the payload key', () => {
    expect(MIGRATION).toContain("body    := jsonb_build_object('profile_push', jsonb_build_object(")
    expect(PUSH).toContain('profilePush = payload?.profile_push ?? null')
    expect(PUSH).toMatch(/\+ \(profilePush \? 1 : 0\)/)
  })

  it('the edge function asks the database for the audience, by the name the migration creates', () => {
    expect(MIGRATION).toContain('create or replace function public.profiles_push_subscriptions(_profiles uuid[], _category text)')
    expect(PUSH).toContain('/rest/v1/rpc/profiles_push_subscriptions')
    expect(PUSH).toContain('JSON.stringify({ _profiles: profileIds, _category: category })')
    expect(MIGRATION).toContain('grant execute on function public.profiles_push_subscriptions(uuid[], text) to service_role')
  })

  it('⚠️ the harness switch keeps a production harness from pushing real people', () => {
    expect(MIGRATION).toContain("if current_setting('app.harness', true) = 'on' then return; end if;")
    expect(HARNESS).toContain("select set_config('app.harness', 'on', true);")
  })

  it('⚠️ callup_requests has no write policy: every write is an RPC', () => {
    expect(MIGRATION).toContain("if exists (select 1 from pg_policies where tablename = 'callup_requests' and cmd <> 'SELECT') then")
    expect(MIGRATION).not.toMatch(/create policy "callup (insert|update|delete|manage)"/)
  })
})
