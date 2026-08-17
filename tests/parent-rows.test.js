// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import { parentNameProblem, toEditorRows, toSaveRows } from '../src/lib/parentRows.js'
import { splitPhone } from '../src/lib/phone.js'

// src/lib/parentRows.js — the two shape conversions ParentsEditor needs.
//
// ══ WHY THIS MODULE AND THIS FILE EXIST ═════════════════════════════════
// player_parents stores a phone as one E.164 string; ParentsEditor edits it as
// phoneCountry + phoneNational. PlayerForm converted both ways, inline.
// MyPlayerForm did NEITHER, so:
//
//   1. a stored phone rendered blank for a parent, and
//   2. ⚠️ a number the parent TYPED was discarded — written as null on a new
//      row, or beaten by the stale `phone` key on an existing one. The save
//      reported success either way. Found 9 Aug 2026.
//
// It did NOT destroy a number on an untouched save; a row loaded from the
// database still carried its `phone` key. An earlier version of this comment
// claimed it did, and the fault injection disproved it — reverting the fix left
// the untouched-save test green, which is only possible if the value survived.
//
// The round-trip test below is the one that matters: it is the property the
// bug violated.

// All three name columns, because the real table carries all three —
// private.sync_person_name keeps them in step both ways.
const DB_ROW = {
  id: 'pp-1',
  player_id: 'p-1',
  full_name: 'Hannah Okafor',
  first_name: 'Hannah',
  last_name: 'Okafor',
  relationship: 'Mother',
  email: 'hannah@example.com',
  phone: '+971501234567',
  is_primary: true,
}

describe('toEditorRows', () => {
  it('splits the stored phone into the two fields the editor binds to', () => {
    const [row] = toEditorRows([DB_ROW])
    expect(row.phoneCountry).toBe('AE')
    expect(row.phoneNational).toBe('501234567')
    // The joined string must NOT survive: a stale `phone` key on an editor row
    // is what toSaveRows' ordering exists to defend against.
    expect(row.phone).toBeUndefined()
  })

  it('keeps the id, so a save updates the row rather than duplicating it', () => {
    expect(toEditorRows([DB_ROW])[0].id).toBe('pp-1')
  })

  // ⚠️ NULLS ARE THE COMMON CASE, not an edge case — most parent rows have no
  // phone and many have no relationship. React switches an input to
  // uncontrolled the moment its value goes null, so these must be ''.
  it('turns every null text column into an empty string', () => {
    const [row] = toEditorRows([
      { id: 'pp-2', first_name: null, last_name: null, relationship: null, email: null, phone: null },
    ])
    expect(row.first_name).toBe('')
    expect(row.last_name).toBe('')
    expect(row.relationship).toBe('')
    expect(row.email).toBe('')
    expect(row.phoneNational).toBe('')
    expect(row.phoneCountry).toBe(splitPhone('').country)
  })

  it('never throws on junk, and returns [] rather than undefined', () => {
    expect(toEditorRows(null)).toEqual([])
    expect(toEditorRows(undefined)).toEqual([])
    expect(toEditorRows([null])[0].first_name).toBe('')
  })

  // ⚠️ AN EDITOR ROW HAS NO `full_name` AT ALL, and that is the point rather
  // than an omission: a third value describing the same thing would be free to
  // disagree with the two boxes the moment either is typed in. toSaveRows
  // rebuilds it on the way out, which is the only place it is ever true.
  it('carries no full_name onto an editor row', () => {
    expect(toEditorRows([DB_ROW])[0].full_name).toBeUndefined()
  })

  // ⚠️ `savedEmail` IS WHAT THE DATABASE HOLDS; `email` becomes whatever is
  // being typed. The Invite button compares the two and refuses while they
  // differ, because public.invite_parent emails the address ON THE ROW — so
  // without this pair, a corrected address typed but not saved would send an
  // account to the old one, with nothing on screen looking wrong.
  it('records the stored email separately from the one bound to the input', () => {
    const [row] = toEditorRows([DB_ROW])
    expect(row.email).toBe('hannah@example.com')
    expect(row.savedEmail).toBe('hannah@example.com')
  })

  it('leaves savedEmail empty rather than null when there is no address', () => {
    const [row] = toEditorRows([{ id: 'pp-2', email: null }])
    expect(row.savedEmail).toBe('')
  })

  it('carries invited_at through, and null when nobody has ever been invited', () => {
    expect(toEditorRows([{ ...DB_ROW, invited_at: '2026-08-16T09:00:00Z' }])[0].invited_at).toBe(
      '2026-08-16T09:00:00Z',
    )
    expect(toEditorRows([DB_ROW])[0].invited_at).toBeNull()
  })
})

describe('toSaveRows', () => {
  it('joins the two fields back into one E.164 string', () => {
    const [row] = toSaveRows([{ phoneCountry: 'AE', phoneNational: '501234567' }])
    expect(row.phone).toBe('+971501234567')
  })

  it('carries the rest of the row through untouched', () => {
    const [row] = toSaveRows([
      { id: 'pp-1', first_name: 'Hannah', last_name: 'Okafor', relationship: 'Mother',
        email: 'h@e.com', is_primary: true, phoneCountry: 'AE', phoneNational: '501234567' },
    ])
    expect(row).toMatchObject({
      id: 'pp-1', first_name: 'Hannah', last_name: 'Okafor', relationship: 'Mother',
      email: 'h@e.com', is_primary: true,
    })
  })

  // ⚠️ REBUILT FROM THE TWO BOXES, AND FILTERED RATHER THAN TEMPLATED. A
  // missing family name must give "Kwame", never "Kwame " — the trigger splits
  // on whitespace, and a trailing space makes the last name an empty string
  // instead of a null one.
  it('rebuilds full_name from the two boxes', () => {
    expect(toSaveRows([{ first_name: 'Hannah', last_name: 'Okafor' }])[0].full_name).toBe(
      'Hannah Okafor',
    )
    expect(toSaveRows([{ first_name: 'Kwame', last_name: '' }])[0].full_name).toBe('Kwame')
    expect(toSaveRows([{ first_name: ' Hannah ', last_name: ' Okafor ' }])[0].full_name).toBe(
      'Hannah Okafor',
    )
  })

  // ⚠️ A MULTI-WORD FAMILY NAME IS THE CASE THAT MAKES THE SPLIT COLUMNS WORTH
  // WRITING AT ALL. The trigger takes the LAST word as the family name, so a
  // row sent as full_name only would come back as "Anna van der" / "Berg".
  // Sending first_name and last_name takes the names-win branch instead.
  it('keeps a two-word family name intact in the columns it writes', () => {
    const [row] = toSaveRows([{ first_name: 'Anna', last_name: 'van der Berg' }])
    expect(row.first_name).toBe('Anna')
    expect(row.last_name).toBe('van der Berg')
    expect(row.full_name).toBe('Anna van der Berg')
  })

  // ⚠️ THE ORDERING. `...row` first, `phone` last. Reversed, a stale `phone`
  // key on the editor row would win over the freshly joined value — which is
  // the original bug wearing a different hat.
  it('lets the joined value win over a stale phone key on the row', () => {
    const [row] = toSaveRows([
      { phone: '+971999999999', phoneCountry: 'AE', phoneNational: '501234567' },
    ])
    expect(row.phone).toBe('+971501234567')
  })

  // NULL, not ''. joinPhone returns null for an empty number and that is the
  // right answer — the column is nullable and an empty string would sort and
  // compare as a real value. (My first version of this test asserted '' and
  // was simply wrong about the contract.)
  it('writes null, not an empty string, when there is no number', () => {
    const [row] = toSaveRows([{ phoneCountry: 'AE', phoneNational: '' }])
    expect(row.phone).toBeNull()
  })

  it('never throws on junk', () => {
    expect(toSaveRows(null)).toEqual([])
    expect(toSaveRows([null])[0].phone).toBeNull()
  })
})

// ══ BOTH NAMES, ONCE, FOR BOTH SCREENS ══════════════════════════════════
// PlayerForm and MyPlayerForm are the only two writers of public.player_parents
// — no RPC and no importer touches it — so this function is the whole rule.
// Written twice, it would be a rule free to disagree with itself, and the copy
// nobody tested would be the one that let a one-word name through.
describe('parentNameProblem', () => {
  const NAMED = { first_name: 'Hannah', last_name: 'Okafor' }

  it('passes a row with both names', () => {
    expect(parentNameProblem([NAMED])).toBeNull()
  })

  it('refuses a first name on its own — the bug this item exists to fix', () => {
    expect(parentNameProblem([{ first_name: 'Hannah' }])).toMatch(/family name/i)
  })

  it('refuses a family name on its own, which reads as a name and is not one', () => {
    expect(parentNameProblem([{ last_name: 'Okafor' }])).toMatch(/first name/i)
  })

  // ⚠️ ADDING A PARENT AND CHANGING YOUR MIND IS NOT AN ERROR. saveParents
  // drops a row with no name anyway, so refusing here would block a save over a
  // row that was never going to be written.
  it('ignores a row nobody typed anything into', () => {
    expect(parentNameProblem([{ first_name: '', last_name: '', email: '', phoneNational: '' }])).toBeNull()
    expect(parentNameProblem([])).toBeNull()
  })

  // ...but a row with contact details in it HAS been started, and a phone
  // number attached to half a name is exactly the record that helps nobody.
  it('counts a row as started once it carries an email or a phone', () => {
    expect(parentNameProblem([{ email: 'h@e.com' }])).toMatch(/first name/i)
    expect(parentNameProblem([{ phoneNational: '501234567' }])).toMatch(/first name/i)
  })

  it('checks every row, not just the first', () => {
    expect(parentNameProblem([NAMED, { first_name: 'Mark' }])).toMatch(/family name/i)
  })

  it('never throws on junk', () => {
    expect(parentNameProblem(null)).toBeNull()
    expect(parentNameProblem([null])).toBeNull()
  })
})

// ══ THE PROPERTY THE BUG VIOLATED ═══════════════════════════════════════
// Load a row, change nothing, save it: the phone must come back out exactly as
// it went in. Both screens now do load -> toEditorRows -> ParentsEditor ->
// toSaveRows -> save, so this is the whole path with the editor removed.
describe('the round trip', () => {
  it('returns the phone unchanged when nothing was edited', () => {
    const [saved] = toSaveRows(toEditorRows([DB_ROW]))
    expect(saved.phone).toBe(DB_ROW.phone)
  })

  it('survives being round-tripped repeatedly', () => {
    // A parent who opens and saves their details three times in a week must
    // not lose a digit on the third.
    let rows = [DB_ROW]
    for (let i = 0; i < 3; i += 1) rows = toSaveRows(toEditorRows(rows))
    expect(rows[0].phone).toBe(DB_ROW.phone)
  })

  it('leaves a row with no phone as null rather than inventing one', () => {
    const [saved] = toSaveRows(toEditorRows([{ ...DB_ROW, phone: null }]))
    expect(saved.phone).toBeNull()
  })
})
