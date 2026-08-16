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

## Step 3 — error tracking (not done, and it needs a decision first)

`ErrorBoundary.componentDidCatch` already has the hook — it calls
`this.props.onError` when given one and falls back to `console.error`. Wiring
Sentry in is small.

⚠️ **THE DECISION IS BUNDLE SIZE, AND IT IS JAY'S.** Measured 16 Aug 2026: the
main bundle is **260 KB gzip**. `@sentry/react` adds roughly 25-30 KB gzip —
about 11% — to an app opened on phones on pitch-side mobile data.

Three options, and none is obviously right:

1. **Lazy-load Sentry inside `componentDidCatch`** — `await import('@sentry/react')`
   only once a crash has already happened. Costs nothing for the people who never
   crash, which is nearly everyone. Loses breadcrumbs and global handlers, so an
   unhandled promise rejection (the likelier failure in a data-fetching app) is
   not captured unless a small `window.onunhandledrejection` hook is added
   alongside it.
2. **Load it normally** — full fidelity, 11% bigger for everyone.
3. **Neither** — keep `console.error` and accept that a crash is only ever
   diagnosed by asking the person what it said.

⚠️ **DO NOT ADD THE DEPENDENCY BEFORE THE DSN EXISTS.** A Sentry account and its
DSN are an account creation, so they are Jay's, and code that ships an
uninitialised SDK is 30 KB doing nothing.

## Related

- `claude/open-items.md` — the readiness audit entry this closes
- `claude/runbooks/dmarc-reports.md` — the one alerting-shaped thing that DOES
  already arrive daily, and the one line of it worth reacting to
- `db/tests/photo-orphans.sql` — the nightly photo scan, which is monitoring of a
  different kind and reports rather than alerts
