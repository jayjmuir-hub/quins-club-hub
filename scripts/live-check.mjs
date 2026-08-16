#!/usr/bin/env node
// Assert that the LIVE site is serving what it is supposed to serve.
//
//   npm run check:live
//   npm run check:live -- https://deploy-preview-171--quins-club-hub.netlify.app
//
// WHY THIS EXISTS. `claude/open-items.md` has carried "no monitoring, alerting
// or error tracking — detection today is somebody telling Jay" since the 13 Aug
// readiness audit. An uptime monitor is the answer and it needs an account, so
// it is Jay's to create. This is the half that does not: the ASSERTIONS a
// monitor should make, written down and runnable, so that setting the monitor up
// is copying a checked list rather than guessing at one.
//
// ⚠️ IT IS NOT A MONITOR. It runs when somebody runs it. Its job is to be right
// about what "healthy" means, so the thing that runs every five minutes is
// configured correctly. See claude/runbooks/monitoring.md.
//
// ══ ⚠️ THE TRAP THIS FILE EXISTS FOR ═══════════════════════════════════════
//
// **A monitor on `/calendar.ics` that expects HTTP 200 goes GREEN exactly when
// the calendar feed breaks.** Measured against production 16 Aug 2026:
//
//   /                          200  text/html      ← the app
//   /calendar.ics              404  text/plain     ← healthy!
//   /definitely-not-a-real     200  text/html      ← the SPA catch-all
//
// The `/calendar.ics` rule in netlify.toml proxies to a Supabase edge function
// with `force = true`. Without a token that function answers **404 "Not found"**
// — which is correct behaviour and the normal state for an unauthenticated
// probe. If that proxy rule were ever lost, the path would fall through to the
// SPA catch-all and return **200 text/html**: every calendar subscription in the
// club silently broken, and a naive uptime check reporting success.
//
// So the assertion is inverted on purpose: 404 with `text/plain` is HEALTHY, and
// 200 with `text/html` is the FAILURE SIGNATURE. `open-items.md` half-caught
// this — it said to assert `content-type: text/calendar` rather than a 200,
// which is right for a request carrying a real token and wrong for a monitor,
// because a monitor must not hold one. A calendar token is an unguessable uuid
// that grants access to a family's fixtures; it does not belong in a third-party
// monitoring service.
//
// ══ ⚠️ WHAT THIS CANNOT TELL YOU, AND WHY THAT IS DELIBERATE ═══════════════
//
// **A tokenless probe cannot detect that Supabase is down.** A token that is not
// a uuid is rejected by shape before the function touches the database, and the
// function deliberately returns the SAME 404 for "no such token" as for
// "database unreachable" — its own comment says distinguishing them "hands a
// token-guesser an oracle". That is the right call and it costs us this: a green
// calendar check means the proxy and the edge function are alive, and says
// NOTHING about the database. Do not let anyone read it as more.

const DEFAULT_ORIGIN = 'https://adhquins-clubhub.com'
const origin = (process.argv[2] || DEFAULT_ORIGIN).replace(/\/$/, '')

const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
}

async function probe(path) {
  const url = `${origin}${path}`
  try {
    // `redirect: 'manual'` so a redirect is VISIBLE rather than silently
    // followed — "the app moved" is a thing worth failing on.
    // ⚠️ `connection: close` IS NOT POLITENESS, IT IS WHAT LETS THIS PROCESS
    // EXIT. See the note beside the verdict below: a lingering keep-alive socket
    // turns `process.exit()` into a libuv assertion on Windows.
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': 'quins-live-check', connection: 'close' },
    })
    return {
      status: res.status,
      type: (res.headers.get('content-type') || '').toLowerCase(),
      body: await res.text().catch(() => ''),
    }
  } catch (err) {
    return { status: 0, type: '', body: '', error: err.message }
  }
}

// ── 1. The app itself ──────────────────────────────────────────────────────
const root = await probe('/')
record(
  'GET / is the app',
  root.status === 200 && root.type.includes('text/html'),
  `status=${root.status} type=${root.type || '(none)'}${root.error ? ` error=${root.error}` : ''}`,
)

// A built SPA whose index.html has no script tag is a broken deploy that still
// answers 200 — the shape of failure a status-code check cannot see.
record(
  'GET / carries a script bundle',
  /<script[^>]+src="[^"]*assets\/[^"]+\.js"/.test(root.body),
  root.body ? `${root.body.length} bytes of html` : 'no body',
)

// ── 2. The calendar proxy ──────────────────────────────────────────────────
//
// ⚠️ 404 IS THE PASS. See the note at the top of this file before "fixing" it.
const cal = await probe('/calendar.ics')
record(
  'GET /calendar.ics reaches the edge function (404 text/plain expected)',
  cal.status === 404 && cal.type.includes('text/plain'),
  `status=${cal.status} type=${cal.type || '(none)'}${cal.error ? ` error=${cal.error}` : ''}`,
)

// ⚠️ THE ASSERTION THAT ACTUALLY CATCHES THE REGRESSION, stated separately so
// its failure message names the real fault rather than "expected 404, got 200".
record(
  'GET /calendar.ics is NOT the SPA catch-all',
  !(cal.status === 200 && cal.type.includes('text/html')),
  cal.status === 200 && cal.type.includes('text/html')
    ? 'the netlify.toml proxy rule is GONE — every calendar subscription in the club is broken'
    : 'proxy rule intact',
)

// ── 3. The control ─────────────────────────────────────────────────────────
//
// ⚠️ WITHOUT THIS THE CHECK ABOVE IS UNFALSIFIABLE. If the site were entirely
// down, every path would fail and the "not the catch-all" assertion would pass
// for the wrong reason. This proves the catch-all IS live and IS serving
// index.html — so `/calendar.ics` not doing so means something.
const bogus = await probe('/quins-live-check-not-a-real-path')
record(
  'an unknown path DOES fall through to the SPA (the control)',
  bogus.status === 200 && bogus.type.includes('text/html'),
  `status=${bogus.status} type=${bogus.type || '(none)'}`,
)

// ── Verdict ────────────────────────────────────────────────────────────────
console.log(`live-check: ${origin}\n`)
for (const r of results) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}`)
  if (!r.ok) console.log(`        ${r.detail}`)
}

const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log(`\n${failed.length} problem(s).`)
  // ⚠️ `exitCode`, NOT `process.exit(1)`, AND THE DIFFERENCE WAS MEASURED RATHER
  // THAN PREFERRED. `process.exit()` tears the loop down while undici still holds
  // a keep-alive socket, and on Windows/Node 24 that trips a libuv assertion —
  // `!(handle->flags & UV_HANDLE_CLOSING)` — so the process CRASHES instead of
  // exiting. Measured here: **exit code 127, not 1.** A CI job would report a
  // broken script rather than a failed check, which is the failure mode most
  // likely to get a check ignored. Setting `exitCode` lets Node unwind normally;
  // `connection: close` above stops the socket lingering while it does.
  process.exitCode = 1
} else {
  console.log('\nAll live checks passed.')
}
