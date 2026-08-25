// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Fence: every path that creates a child player either writes player_parents
// (the adult is the parent) or is a documented exception (coach / importer,
// where Needs Attention is supposed to keep telling the truth).
//
// ══ WHY THIS FILE EXISTS ════════════════════════════════════════════════
// Admin Needs Attention counts public.player_parents, not Club Hub accounts.
// Until 20260825_player_parents_from_parent_membership the create paths that
// already knew the adult (register_my_player, apply_signup_intent, an admin
// granting a parent a new child) never wrote that table. Patching one RPC and
// leaving the others would reproduce the same badge on the next door.
//
// A memberships AFTER INSERT trigger is the write. This test fails when a
// new create path appears that inserts a player without also inserting a
// parent-role membership (which fires the trigger) or player_parents itself.
//
// ⚠️ THE CONTROL IS THE FIRST TEST. A regex that matches nothing would make
// the rest pass by vacuous truth.

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'db', 'migrations')
const SRC = join(ROOT, 'src')

const TRIGGER_MIGRATION = '20260825_player_parents_from_parent_membership.sql'

function read(relative) {
  return readFileSync(join(ROOT, relative), 'utf8')
}

function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      walkJs(path, acc)
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      acc.push(path)
    }
  }
  return acc
}

function playerInsertsInSql(sql) {
  return [...sql.matchAll(/insert\s+into\s+(?:public\.)?players\b/gi)]
}

describe('child create paths write player_parents when the adult is the parent', () => {
  it('finds the memberships trigger in the migration at all', () => {
    const sql = read(join('db', 'migrations', TRIGGER_MIGRATION))
    expect(sql).toMatch(/create trigger memberships_write_parent_row/i)
    expect(sql).toMatch(/after insert on public\.memberships/i)
    expect(sql).toMatch(/write_parent_row_from_profile/i)
    expect(sql).toMatch(/role = 'parent'/i)
    // Backfill: parent membership + empty player_parents list.
    expect(sql).toMatch(/not exists \(\s*select 1 from public\.player_parents/i)
  })

  it('finds the live SQL player-create paths the trigger is meant to cover', () => {
    const register = read('db/schema/functions.sql')
    expect(
      playerInsertsInSql(register).length,
      'register_my_player in db/schema/functions.sql no longer inserts players — this fence is searching for nothing',
    ).toBeGreaterThan(0)
    expect(register).toMatch(/insert into public\.memberships/)
    expect(register).toMatch(/else 'parent' end/)

    const signup = read('db/migrations/20260825_signup_before_confirm.sql')
    expect(
      playerInsertsInSql(signup).length,
      'apply_signup_intent no longer inserts players',
    ).toBeGreaterThan(0)
    expect(signup).toMatch(/else\s+'parent'/i)
  })

  // Files dated 20260825 or later that insert a player must also insert a
  // parent-role membership (trigger), write player_parents themselves, or be
  // this trigger/backfill migration. Historical register_my_player bodies
  // before that date are superseded and frozen.
  it('new SQL player-inserts go through a parent membership or write the row', () => {
    const offenders = []
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
      if (file < '20260825') continue
      const sql = read(join('db', 'migrations', file))
      if (playerInsertsInSql(sql).length === 0) continue

      const writesParents = /insert\s+into\s+(?:public\.)?player_parents\b/i.test(sql)
      const writesMembership = /insert\s+into\s+(?:public\.)?memberships\b/i.test(sql)
      const parentRole = /else\s+'parent'|role\s*=\s*'parent'|,\s*'parent'/i.test(sql)
      if (writesParents || (writesMembership && parentRole)) continue
      offenders.push(file)
    }
    expect(
      offenders,
      `${offenders.join(', ')} insert a player without a parent membership or a player_parents write`,
    ).toEqual([])
  })

  it('the only client inserts into players are upsertPlayer and insertPlayers', () => {
    const hits = []
    for (const file of walkJs(SRC)) {
      const src = readFileSync(file, 'utf8')
      if (!/\.from\(\s*['"]players['"]\s*\)/.test(src)) continue
      if (!/\.insert\(/.test(src)) continue
      hits.push(file.slice(ROOT.length + 1).replaceAll('\\', '/'))
    }
    expect(
      hits,
      'a new src file inserts into players — decide whether it should write player_parents',
    ).toEqual(['src/data/players.js'])

    const playersJs = read('src/data/players.js')
    expect(playersJs).toMatch(/export async function upsertPlayer/)
    expect(playersJs).toMatch(/export async function insertPlayers/)
    // Coach form + importer: no parent membership, badge stays truthful.
    expect(playersJs).toMatch(/PLAYER_INSERT_NO_PARENT_ROW/)
  })

  it('the two forms still save parent rows the coach/parent typed', () => {
    const playerForm = read('src/screens/PlayerForm.jsx')
    expect(playerForm).toMatch(/saveParents/)
    expect(playerForm).toMatch(/ParentsEditor/)

    const myForm = read('src/screens/MyPlayerForm.jsx')
    expect(myForm).toMatch(/saveParents/)
    expect(myForm).toMatch(/toSaveRows\(parents\)/)

    const access = read('src/components/AccessBuilder.jsx')
    expect(access).toMatch(/upsertPlayer/)
    expect(access).toMatch(/grantMemberships|onSubmit/)

    const importer = read('src/screens/PlayerImport.jsx')
    expect(importer).toMatch(/insertPlayers/)
  })
})
