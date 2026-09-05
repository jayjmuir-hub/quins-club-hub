// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = readFileSync(
  join(process.cwd(), 'db', 'migrations', '20260916_playup_requests.sql'),
  'utf8',
)
const HARNESS = readFileSync(join(process.cwd(), 'db', 'tests', 'junior-playup-request.sql'), 'utf8')

describe('junior play-up request/nominate (rot detector)', () => {
  it('adds a playup_requests queue with requested/approved/declined', () => {
    expect(MIGRATION).toMatch(/create table if not exists public\.playup_requests/i)
    expect(MIGRATION).toMatch(/'requested'/)
    expect(MIGRATION).toMatch(/'approved'/)
    expect(MIGRATION).toMatch(/'declined'/)
    expect(MIGRATION).toMatch(/host_request/)
    expect(MIGRATION).toMatch(/home_nominate/)
  })

  it('the write gate is head coach or age-group manager, not all squad staff', () => {
    expect(MIGRATION).toMatch(/private\.can_request_playup/)
    expect(MIGRATION).toMatch(/is_head_coach/)
    expect(MIGRATION).toMatch(/role = 'manager'/)
    expect(MIGRATION).not.toMatch(/role in \('coach',\s*'manager',\s*'medic'\)/)
  })

  it('approve calls add_junior_playup; decline does not create a guest', () => {
    expect(MIGRATION).toMatch(/add_junior_playup/)
    expect(MIGRATION).toMatch(/decide_playup_request/)
    expect(MIGRATION).toMatch(/if not private\.is_super_admin/)
  })

  it('anon execute is revoked by name on the public RPCs', () => {
    expect(MIGRATION).toMatch(/revoke execute on function public\.request_junior_playups/i)
    expect(MIGRATION).toMatch(/revoke execute on function public\.nominate_junior_playups/i)
    expect(MIGRATION).toMatch(/revoke execute on function public\.decide_playup_request/i)
    expect(MIGRATION).toMatch(/revoke execute on function public\.playup_source_players/i)
    expect(MIGRATION).toMatch(/from anon/i)
  })

  it('the harness proves assistant coach and medic are refused', () => {
    expect(HARNESS).toMatch(/assistant/)
    expect(HARNESS).toMatch(/medic/)
    expect(HARNESS).toContain("select set_config('app.harness', 'on', true);")
  })
})
