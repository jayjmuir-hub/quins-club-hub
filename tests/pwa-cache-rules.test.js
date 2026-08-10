import { describe, it, expect } from 'vitest'
import { isCacheableRestGet } from '../pwa-cache-rules.js'

// Which Supabase reads the service worker may keep on a device, and which it
// may not. See pwa-cache-rules.js for the reasoning; this pins the behaviour.
//
// ⚠️ THE URLS BELOW ARE REAL, not invented. Every one was read out of Cache
// Storage on the deploy preview on 10 Aug 2026 by inspecting a live signed-in
// session. That matters more than it sounds: the whole rule turns on which
// query-string filter a given call carries, and a hand-written approximation of
// a PostgREST url is exactly the kind of fixture that passes while the real
// thing fails.
//
// A note on what this file is NOT. Nothing here is an access-control boundary —
// RLS decides every live request, and none of these decisions affect what the
// server will return to whom. This is only about what is left behind on the
// disk afterwards.

const HOST = 'lusmshimxdcxpnrktlgz.supabase.co'

/** Shapes the two fields Workbox actually passes the predicate. */
function call(pathAndQuery, { method = 'GET', host = HOST } = {}) {
  return isCacheableRestGet({
    url: new URL(`https://${host}${pathAndQuery}`),
    request: { method },
  })
}

const UID = 'df730ef7-dce2-4962-babe-96d9999b0173'
const TEAMS = 'b62d2250-eabe-4618-94e7-6d84c8c34974,2c50bd1e-009d-4573-bd12-59d05a469699'

describe('kept — what somebody needs on a touchline', () => {
  it('age-group names', () => {
    expect(call('/rest/v1/teams?select=*')).toBe(true)
  })

  it('fixtures and training', () => {
    expect(
      call(`/rest/v1/events?select=*&team_id=in.(${TEAMS})&order=starts_at.asc`),
    ).toBe(true)
  })

  it('the squad list', () => {
    expect(
      call(`/rest/v1/players?select=*&team_id=in.(${TEAMS})&order=full_name.asc`),
    ).toBe(true)
  })

  it('who is available', () => {
    expect(call(`/rest/v1/availability?select=*&event_id=eq.${UID}`)).toBe(true)
  })

  it("a player's own contact and parent rows", () => {
    expect(call(`/rest/v1/player_contacts?select=*&player_id=eq.${UID}`)).toBe(true)
    expect(call(`/rest/v1/player_parents?select=*&player_id=eq.${UID}`)).toBe(true)
  })

  // ⚠️ These two are load-bearing rather than nice-to-have: every screen reads
  // the caller's own memberships to know what they may see, and excluding them
  // would leave the app unable to render anything at all offline. That is why
  // the rule keys on the FILTER and not on the table name.
  it("the caller's OWN membership rows", () => {
    expect(
      call(`/rest/v1/memberships?select=*%2Cteams%28*%29&profile_id=eq.${UID}`),
    ).toBe(true)
  })

  it("the caller's OWN profile row", () => {
    expect(
      call(
        `/rest/v1/profiles?select=id%2Cfull_name%2Cfirst_name%2Clast_name%2Cname_confirmed_at%2Cemail%2Cphone%2Ccreated_at&id=eq.${UID}`,
      ),
    ).toBe(true)
  })
})

describe('dropped — the club-wide admin reads', () => {
  // The one that started all of this. Unfiltered, so the url is byte-identical
  // for an admin on /admin/accounts and a coach on /approvals, and it embeds
  // every member's email and phone.
  it('the club-wide member list with emails and phones', () => {
    expect(
      call(
        '/rest/v1/memberships?select=*%2Cprofiles%28full_name%2Cfirst_name%2Clast_name%2Cemail%2Cphone%29%2Cteams%28name%29%2Cplayers%28full_name%29',
      ),
    ).toBe(false)
  })

  it('the unfiltered profiles list', () => {
    expect(
      call('/rest/v1/profiles?select=id%2Cfull_name%2Cemail%2Ccreated_at&order=created_at.desc'),
    ).toBe(false)
  })

  it('the access-request queue', () => {
    expect(
      call(
        '/rest/v1/access_requests?select=id%2Cprofile_id%2Cnote%2Cstatus%2Ccreated_at%2Cdecided_at%2Cdecided_by&order=created_at.desc',
      ),
    ).toBe(false)
  })

  // ⚠️ THE SHARP EDGE. A bare `search.includes('id=eq.')` is satisfied by
  // `club_id=eq.` — so a future club-wide profiles read filtered on some other
  // id column would be silently re-admitted by a check that reads as correct.
  // The match is anchored on ? or & precisely to stop that.
  it('a club-wide read that merely happens to filter on some OTHER id column', () => {
    expect(call(`/rest/v1/profiles?select=*&club_id=eq.${UID}`)).toBe(false)
    expect(call(`/rest/v1/memberships?select=*&club_id=eq.${UID}`)).toBe(false)
  })
})

describe('dropped — unchanged from before', () => {
  it('anything that is not a GET', () => {
    expect(call('/rest/v1/players?select=*', { method: 'POST' })).toBe(false)
    expect(call('/rest/v1/players?select=*', { method: 'PATCH' })).toBe(false)
    expect(call('/rest/v1/players?select=*', { method: 'DELETE' })).toBe(false)
  })

  it('auth, storage and the edge functions', () => {
    expect(call('/auth/v1/token?grant_type=password')).toBe(false)
    expect(call('/storage/v1/object/sign/player-photos/x.jpg')).toBe(false)
    expect(call('/functions/v1/calendar?token=x')).toBe(false)
  })

  it('any other host', () => {
    expect(call('/rest/v1/teams?select=*', { host: 'example.com' })).toBe(false)
  })
})
