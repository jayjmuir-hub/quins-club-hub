// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATION = readFileSync(
  join(process.cwd(), 'db', 'migrations', '20260914_junior_playup_consent.sql'),
  'utf8',
)
const HARNESS = readFileSync(join(process.cwd(), 'db', 'tests', 'junior-playup-consent.sql'), 'utf8')
const ADD = readFileSync(join(process.cwd(), 'db', 'migrations', '20260913_junior_playup.sql'), 'utf8')

describe('junior play-up consent (rot detector)', () => {
  it('consent is pending|approved on the guest membership, not a boolean and not memberships.status', () => {
    expect(MIGRATION).toMatch(/playup_consent/)
    expect(MIGRATION).toMatch(/'pending'/)
    expect(MIGRATION).toMatch(/'approved'/)
    expect(MIGRATION).toContain('answer_junior_playup')
    expect(MIGRATION).toContain('squad_guest_flags')
  })

  it('add_junior_playup still twins active memberships, and this migration sets them pending', () => {
    expect(ADD).toContain('insert into public.memberships')
    expect(MIGRATION).toMatch(/playup_consent.*pending|pending.*playup_consent/)
  })

  it('lineup_players is refused while consent is pending', () => {
    expect(MIGRATION).toMatch(/lineup_players/)
    expect(MIGRATION).toMatch(/Parent consent is still pending/)
  })

  it('the harness switch keeps a production harness from pushing real people', () => {
    expect(MIGRATION).toContain("if current_setting('app.harness', true) = 'on' then return; end if;")
    expect(HARNESS).toContain("select set_config('app.harness', 'on', true);")
  })

  it('anon execute is revoked by name', () => {
    expect(MIGRATION).toMatch(/revoke execute on function public\.answer_junior_playup/i)
    expect(MIGRATION).toMatch(/from anon/i)
  })
})
