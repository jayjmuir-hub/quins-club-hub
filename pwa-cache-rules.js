// Which Supabase REST reads the service worker may keep on the device for
// offline use — and, more to the point, which it may not.
//
// ══ ⚠️ THIS FUNCTION IS STRINGIFIED INTO THE SERVICE WORKER ══════════════
// Workbox calls .toString() on it and writes the SOURCE into dist/sw.js, which
// does not share this module's scope. So the body must reference NOTHING from
// outside itself — no imports, no module-level consts, not even the Supabase
// host, which is why that is a literal below and duplicated from
// VITE_SUPABASE_URL. A reference that reads perfectly here throws at
// service-worker runtime, and tests/pwa-build.test.js exists partly because
// exactly that has already happened once in this project.
//
// It lives in its own file ONLY so the tests can import and exercise it against
// real urls. The isolation rule is unchanged by that: do not be tempted to pull
// a shared constant in at the top and use it below.
//
// ══ WHY ANYTHING IS EXCLUDED ═════════════════════════════════════════════
// The cache is keyed by URL and scoped to the ORIGIN, not to the person. Since
// 10 Aug 2026 src/lib/apiCache.js purges it whenever the signed-in person
// changes, which closes the one-device-two-people hole — but it cannot help
// with a phone left unlocked or a laptop stolen. For that, the answer is not to
// store the sensitive things at all.
//
// The line is drawn by what somebody actually needs on a touchline:
//
//   KEPT     fixtures, training times, age-group names, squad lists,
//            availability, a player's own contact and parent rows, and the
//            caller's OWN membership and profile rows — the app cannot render
//            at all without those last two.
//
//   DROPPED  the three club-wide admin reads. All three are UNFILTERED: they
//            return everyone the caller may see rather than anything about the
//            caller. That is what makes them the most sensitive thing this app
//            fetches (every family's name, email and phone) and, not by
//            coincidence, what made their urls byte-identical for every caller.
//
// A coach on a pitch needs the team sheet. Nobody on a pitch needs the club's
// entire contact database, and the screens that do need it are used at a desk.
//
// ⚠️ THE FILTER IS THE DISCRIMINATOR, NOT THE TABLE. `memberships` and
// `profiles` are each read two different ways — once scoped to the caller and
// once club-wide — and only the second is excluded. Matching on the path alone
// would break the app offline; matching on the presence of the caller's own id
// is what separates them.
export function isCacheableRestGet({ url, request }) {
  if (url.hostname !== 'lusmshimxdcxpnrktlgz.supabase.co') return false
  if (request.method !== 'GET') return false
  if (!url.pathname.startsWith('/rest/v1/')) return false

  // listAccessRequests() — the admin triage queue. No scoped variant exists.
  if (url.pathname === '/rest/v1/access_requests') return false

  // listPendingProfiles() is unfiltered; getMyProfile() carries `id=eq.<uuid>`.
  //
  // ⚠️ ANCHORED ON `?` OR `&`, NOT A BARE SUBSTRING. `search.includes('id=eq.')`
  // would also be satisfied by `club_id=eq.` or `team_id=eq.` — so a future
  // club-wide read that happened to filter on some OTHER id column would be
  // silently re-admitted to the cache by a check that looks correct.
  if (url.pathname === '/rest/v1/profiles' && !/[?&]id=eq\./.test(url.search)) return false

  // listClubMembers() is unfiltered — this is the club-wide list with every
  // member's email and phone embedded. loadMyMemberships() carries
  // `profile_id=eq.<uuid>` and is what every screen reads to know who you are.
  if (url.pathname === '/rest/v1/memberships' && !/[?&]profile_id=eq\./.test(url.search)) {
    return false
  }

  // ⚠️ CHILDREN'S PRIVATE DATA NEVER TOUCHES THE ON-DISK CACHE — 30 Aug 2026
  // (Grok item 6, D3: all five). These are excluded BY TABLE, unlike the
  // scoped/unscoped splits above, because no variant of them belongs on a
  // shared or stolen unlocked device: chat messages (children's DMs included),
  // player_private (DOB), squad-wide parent contacts, and poll_votes (named
  // votes). NetworkFirst still serves them ONLINE at full speed — only the
  // offline/cached copy goes away, and apiCache.js's owner-purge is unchanged.
  if (
    url.pathname === '/rest/v1/messages' ||
    url.pathname === '/rest/v1/player_private' ||
    url.pathname === '/rest/v1/player_contacts' ||
    url.pathname === '/rest/v1/player_parents' ||
    url.pathname === '/rest/v1/poll_votes'
  ) {
    return false
  }

  return true
}
