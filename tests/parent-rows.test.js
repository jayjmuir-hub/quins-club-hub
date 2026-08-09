import { describe, it, expect } from 'vitest'
import { toEditorRows, toSaveRows } from '../src/lib/parentRows.js'
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

const DB_ROW = {
  id: 'pp-1',
  player_id: 'p-1',
  full_name: 'Hannah Okafor',
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
      { id: 'pp-2', full_name: null, relationship: null, email: null, phone: null },
    ])
    expect(row.full_name).toBe('')
    expect(row.relationship).toBe('')
    expect(row.email).toBe('')
    expect(row.phoneNational).toBe('')
    expect(row.phoneCountry).toBe(splitPhone('').country)
  })

  it('never throws on junk, and returns [] rather than undefined', () => {
    expect(toEditorRows(null)).toEqual([])
    expect(toEditorRows(undefined)).toEqual([])
    expect(toEditorRows([null])[0].full_name).toBe('')
  })
})

describe('toSaveRows', () => {
  it('joins the two fields back into one E.164 string', () => {
    const [row] = toSaveRows([{ phoneCountry: 'AE', phoneNational: '501234567' }])
    expect(row.phone).toBe('+971501234567')
  })

  it('carries the rest of the row through untouched', () => {
    const [row] = toSaveRows([
      { id: 'pp-1', full_name: 'Hannah', relationship: 'Mother', email: 'h@e.com', is_primary: true,
        phoneCountry: 'AE', phoneNational: '501234567' },
    ])
    expect(row).toMatchObject({
      id: 'pp-1', full_name: 'Hannah', relationship: 'Mother', email: 'h@e.com', is_primary: true,
    })
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
