# Monitoring — knowing before Jay is told

**Detection today is somebody telling Jay.** That has been in
`claude/open-items.md` since the 13 Aug 2026 readiness audit, and it is still
the honest description until the steps below are done.

⚠️ **THE ACCOUNT CREATIONS ARE JAY'S.** Claude does not create accounts or handle
passwords. This file exists so that doing it is following a checked list rather
than guessing — in particular the `/calendar.ics` assertion, which is inverted
from what anyone would configure by instinct and which is written up below
because getting it wrong produces a monitor that is green precisely when the
thing it watches is broken.

## What the assertions are — run them before configuring anything

```bash
npm run check:live
```

`scripts/live-check.mjs`, no dependencies, no credentials. It asserts against
production what an uptime monitor should assert, so the monitor is configured
from something that has been run rather than from a guess. Point it elsewhere
with `npm run check:live -- https://deploy-preview-171--quins-club-hub.netlify.app`.

⚠️ **IT IS NOT A MONITOR — it runs when somebody runs it.** Its job is to be
right about what "healthy" means.

## ⚠️ The trap: a `/calendar.ics` monitor expecting 200 is green when it breaks

Measured against production, 16 Aug 2026:

| path | status | content-type | |
|---|---|---|---|
| `/` | 200 | `text/html` | the app |
| `/calendar.ics` | **404** | **`text/plain`** | **healthy** |
| any unknown path | 200 | `text/html` | the SPA catch-all |

The `/calendar.ics` rule in `netlify.toml` proxies to a Supabase edge function
with `force = true`. Unauthenticated, that function answers **404 "Not found"**,
which is correct and is the normal state for a probe.

**If that proxy rule were ever lost**, the path would fall through to the SPA
catch-all and answer **200 `text/html`** — every calendar subscription in the
club silently broken, and an uptime check configured for "expect 200" reporting
success. So:

- ✅ **healthy** = `404` **and** `content-type: text/plain`
- ❌ **broken** = `200` `text/html`

⚠️ **DO NOT GIVE THE MONITOR A REAL TOKEN to get a 200 instead.** A calendar
token is an unguessable uuid granting access to one family's fixtures; it does
not belong in a third-party monitoring service. `open-items.md` originally said
to assert `content-type: text/calendar`, which is right for a request carrying a
token and wrong for a monitor, which must not hold one.

## ⚠️ What a green calendar check does NOT tell you

**It cannot detect that Supabase is down.** A token that is not a uuid is
rejected by shape before the function touches the database, and the function
deliberately returns the *same* 404 for "no such token" as for "database
unreachable" — its own comment says that distinguishing them "hands a
token-guesser an oracle". That is the right call, and this is what it costs:
green means the proxy and the edge function are alive, and says nothing about the
database. Do not let anyone read it as more.

## Step 1 — the uptime monitor (Jay, ~10 minutes)

Any provider with a free tier will do; UptimeRobot and Better Stack both have
one. Two monitors:

**Monitor A — the app**
- URL `https://adhquins-clubhub.com/`
- Expect **200**
- Keyword/content check: the response must contain `assets/` — a built SPA whose
  `index.html` has lost its script tag still answers 200, and that is a shape a
  status-code check cannot see.

**Monitor B — the calendar proxy**
- URL `https://adhquins-clubhub.com/calendar.ics`
- Expect **404** — see the trap above; this is not a mistake
- Keyword check: the body must be `Not found`
- If the provider cannot express "expect 404", use a keyword monitor with
  "alert when keyword `Not found` is ABSENT" and ignore the status code

⚠️ **Set the alert destination to an address Jay actually reads on a phone.** The
club's own domain is fine — but if the alert is about the site being down, an
alert routed through anything hosted on the same infrastructure is not an alert.

## Step 2 — ⚠️ prove it fires (Jay, ~5 minutes, and it is not optional)

**A monitor that has never fired is not a monitor** — the same rule `CLAUDE.md`
rule 6 states for tests, and this repo has already shipped a check that had never
failed and was therefore vacuous.

1. Netlify → the `quins-club-hub` project → **Site configuration → Status →
   Pause site** (or stop the Supabase project for monitor B).
2. Wait for the alert to arrive. **Time how long it takes** — that number is the
   real detection window, and it is worth knowing before an outage rather than
   during one.
3. Un-pause. Confirm the recovery notification arrives too.
4. Write the measured delay into `claude/open-items.md`.

⚠️ **Pausing the site IS an outage.** Do it at a time when nobody is looking —
early morning UAE, not before a Saturday fixture.

## Step 3 — error tracking ✅ built, and inert until a DSN exists

`src/lib/errorReporting.js`, wired into `ErrorBoundary.componentDidCatch` and
into `main.jsx`. Jay chose the lazy-load option on 16 Aug 2026.

⚠️ **AND THE NUMBER THAT DECISION WAS TAKEN ON WAS WRONG, IN THE DIRECTION THAT
MAKES IT MORE RIGHT.** This runbook said `@sentry/react` adds "roughly 25-30 KB
gzip — about 11%". **Measured after installing it: the SDK chunk is 482 KB raw /
159 KB gzip.** Against a 260 KB main bundle that is **+61%**, not 11%. Loading it
normally was never the modest option it was presented as.

Measured, both ways:

| build | entry chunk (what every phone downloads) | Sentry |
|---|---|---|
| before | 943 KB raw / **260.0 KB gzip** | — |
| with the DSN unset | 944 KB raw / **259.6 KB gzip** | not emitted at all |
| with a DSN set | 944 KB raw / **259.8 KB gzip** | separate chunk, 159 KB gzip |

Two things worth keeping:

- **With no DSN the whole path is dead-code eliminated.** `import.meta.env` is
  substituted at build time, so `if (!DSN) return` becomes unreachable code and
  Rollup drops the dynamic import — the SDK is not merely unloaded, it is not in
  `dist/` at all. Verified by searching the bundle for `captureException`: absent.
- **With a DSN it splits properly.** The entry chunk grew by 0.2 KB gzip — the
  call site and the config object — and the SDK went to its own chunk, fetched
  only when something throws.

### What it does

- **Render crashes** → `ErrorBoundary.componentDidCatch` → `reportError`.
- **Unhandled promise rejections and window errors** →
  `installGlobalErrorReporting()`, called from `main.jsx` before render.
  ⚠️ **This is not redundant.** An error boundary catches errors thrown during
  RENDER and nothing else; a rejected Supabase call never reaches one, and in
  this app that is where the failures are. Without it, the lazy-load option would
  have bought error tracking for the rarest kind of fault only.
- **A failed `<img>` is not reported.** `window.onerror` fires for those with
  `event.error === null`, and reporting them fills the project with "Script
  error" noise from other people's ad blockers.

⚠️ **NOTHING IS SENT, AND NO CHUNK IS FETCHED, UNTIL `VITE_SENTRY_DSN` EXISTS.**

### Turning it on (Jay, ~5 minutes)

1. Create a Sentry account and a project (**React** platform). Free tier is ample
   — this club will generate almost no events.
2. Copy the project's **DSN**. ⚠️ It is a write-only ingest key and is not a
   secret in the way the Supabase service key is — it ships in the client bundle
   by design. It still does not belong in a chat or a commit.
3. Netlify → the `quins-club-hub` project → **Site configuration → Environment
   variables** → add `VITE_SENTRY_DSN`.
4. ⚠️ **REDEPLOY.** `VITE_*` variables are substituted at BUILD time, so adding
   the variable changes nothing until a build runs.
5. ⚠️ **PROVE IT FIRES**, exactly as with the uptime monitor. Trigger a real
   crash and confirm the event arrives in Sentry — an error tracker that has
   never received an event is not an error tracker.

## Related

- `claude/open-items.md` — the readiness audit entry this closes
- `claude/runbooks/dmarc-reports.md` — the one alerting-shaped thing that DOES
  already arrive daily, and the one line of it worth reacting to
- `db/tests/photo-orphans.sql` — the nightly photo scan, which is monitoring of a
  different kind and reports rather than alerts
