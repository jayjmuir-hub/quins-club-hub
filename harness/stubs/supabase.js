// The supabase client, gone inert. Every un-stubbed data module lands here
// in the harness instead of on src/lib/supabase.js.
//
// ⚠️ WHY THIS EXISTS — MEASURED ON PRODUCTION, 30 Aug 2026. The harness
// promises "no Supabase session or any network access" (harness/main.jsx),
// but it kept that promise one data module at a time, by aliasing each
// '../data/X.js' to a stub as somebody noticed the escape. The alias list's
// own comment names the standing cost: "a new importer at a different depth
// silently escapes" — and it was not only depth. Every data module that was
// simply never aliased (leagueTeams, trainingPlans, polls, nicknames,
// chatPrefs' siblings, activity's touch_last_seen…) imported the REAL client
// and fired at the LIVE database, with the harness's stub fixture ids in the
// filters. Supabase's dashboard for 29–30 Aug showed ~36,000 failed requests
// in 24h — `league_teams?team_id=eq.t-u12`, `availability?event_id=eq.e2`,
// thousands of 401s on rpc/touch_last_seen — all traced back to harness runs
// on Jay's own machines. RLS held (nothing was readable), so the cost was
// noise and load, not disclosure. But a screenshot rig that talks to
// production is wrong regardless of what production says back.
//
// So the client itself is now swapped out, and the per-module stubs are only
// the DATA layer — this file is the SAFETY layer underneath them. A data
// module nobody thought to stub now gets an inert client instead of a real
// one: queries resolve to { data: null, error }, nothing leaves the process,
// and the scenario renders its empty/error state — exactly what the real 401
// produced, minus the production traffic.
//
// ⚠️ A PROXY, NOT A HAND-MAINTAINED MOCK, on purpose. supabase-js's builder
// surface is wide (from().select().eq().order().range().single()…, rpc(),
// storage.from().createSignedUrl(), channel().on().subscribe(), auth.*) and
// grows; a mock that enumerates methods is a mock that rots. The proxy
// returns itself for every property and call, so ANY chain works, and only
// `await` has a concrete meaning: the chain settles to { data: null, error }.
// The few call sites that destructure synchronously (onAuthStateChange's
// { data: { subscription } }, getPublicUrl's { data: { publicUrl } }) read
// properties off the proxy, which are again the proxy — defined, truthy,
// harmless.

const INERT_RESULT = {
  data: null,
  error: {
    message: 'harness: network disabled (inert supabase client, stubs/supabase.js)',
    code: 'HARNESS_INERT',
  },
  count: null,
  status: 400,
  statusText: 'harness inert',
}

function makeInert() {
  const target = () => {}
  const proxy = new Proxy(target, {
    get(_t, prop) {
      // `await proxy` / `.then(...)`: settle to the inert result. Returning
      // undefined for `then` on non-await access would break chains that
      // store the builder, so the thenable IS the contract here.
      if (prop === 'then') {
        return (resolve) => resolve(INERT_RESULT)
      }
      if (prop === 'catch' || prop === 'finally') {
        return (fn) => (prop === 'finally' ? (fn?.(), proxy) : proxy)
      }
      // Symbol.toPrimitive / toString land in logs, not exceptions.
      if (prop === Symbol.toPrimitive || prop === 'toString') {
        return () => '[harness inert supabase]'
      }
      return proxy
    },
    apply() {
      return proxy
    },
  })
  return proxy
}

export const supabase = makeInert()

// The real module's other exports, mirrored so an escaped importer that
// destructures them fails no earlier and no louder than it would today.
// Only tests import these, and vitest resolves the REAL module — these are
// here purely so the harness build cannot crash on a missing export.
export class SessionExpiredError extends Error {
  constructor() {
    super('Signed out: the session expired (harness inert client).')
    this.name = 'SessionExpiredError'
  }
}

export function createSessionGuard() {
  return { fetch: () => Promise.resolve(new Response(null, { status: 400 })), disarm() {}, isArmed: () => false }
}

export const sessionGuard = createSessionGuard()
