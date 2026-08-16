# Monitoring

**Detection used to be somebody telling Jay.** Two uptime monitors now watch the
site, and an error tracker is built but switched off.

## What is live — set up 16 Aug 2026

**Better Stack**, free tier. Both monitors check every 3 minutes and alert by
e-mail.

| monitor | URL | check |
|---|---|---|
| `adhquins-clubhub.com` | `https://adhquins-clubhub.com/` | URL becomes unavailable |
| `Quins calendar feed` | `/calendar.ics?token=<Jay's token>` | URL becomes unavailable |

Jay's token comes from **More → Add to calendar** in the app. It exposes fixtures
for squads he can already see — which this repo treats as not sensitive — and it
can be rotated. Do not use a parent's.

✅ **BOTH PROVEN, 16 Aug 2026 — the drill was actually run, not just written
down.** E-mail delivery via *Send test alert*, and detection by disabling the
live site. Numbers below.

## ⚠️ Keyword matching is a PAID feature — do not select it

The **Alert us when** dropdown carries a **Billable** badge and the note
*"Upgrade your account to enable more options."* Its keyword and status-code
options are visible in the UI but are **not on the free plan**, and selecting one
risks moving the account onto a paid tier.

⚠️ **AN EARLIER VERSION OF THIS FILE TOLD YOU TO USE A KEYWORD MONITOR WITH
`BEGIN:VCALENDAR`.** That was written from research rather than from the signup
screen, and it was wrong. Both monitors use the free *"URL becomes unavailable"*
check.

**What that costs, which is less than it sounds** — because the calendar monitor
carries a real token, the feed only answers 200 when it genuinely built:

| failure | caught |
|---|---|
| Site down | ✅ |
| Calendar edge function down | ✅ |
| Supabase down | ✅ |
| `/calendar.ics` proxy rule deleted from `netlify.toml` → 200 with the app's HTML | ❌ |

Only the last slips through, and only somebody editing `netlify.toml` can cause
it. ⚠️ **Do not switch provider to close it.** UptimeRobot's free tier does
include keyword monitors, but its free plan is **personal, non-commercial use
only** (since Dec 2024), and StatusCake deactivates an account that does not log
in every 90 days. Neither trade is worth one rare, self-inflicted regression.

## ✅ The drill — run 16 Aug 2026

**A monitor that has never fired is not a monitor.** The test alert proved the
e-mail PATH only, so the site was actually taken down.

| | |
|---|---|
| Disabled | **09:44:04 UTC** |
| Site returning 404 | 09:44:05 |
| **Incident opened, both monitors** | **09:44** — *"Status 404"* |
| E-mail alerts received | confirmed by Jay |
| Re-enabled | **09:48:19** |
| Site serving 200 again | 09:48:20 — under a second |
| Incidents auto-resolved | by 09:52 |
| **Total outage** | **4m 15s** |

⚠️ **DETECTION WAS UNDER A MINUTE, NOT THE THREE THE INTERVAL IMPLIES.** The
check frequency is 3 minutes, so the obvious expectation is up to 3 minutes of
blindness; the incident opened within the same minute as the pause. Do not
"correct" the check interval on the strength of the 3-minute number — the
measured behaviour is better than the setting suggests.

⚠️ **THE CONTROL IS NOT CALLED "PAUSE".** Netlify → `quins-club-hub` →
**Project configuration → General → Danger zone → Project availability →
Disable project**, and **Enable project** in the same place to restore. It is
reversible — Netlify's own words are *"You can re-enable your project anytime"* —
and restoration was effectively instant.
⚠️ **`Delete this project` SITS DIRECTLY BELOW IT** in the same Danger zone, and
that one has no undo. Read the button before clicking it.

**Redo this if the provider, the alert address or the monitor set changes.** It
is the only thing that distinguishes a monitor from a decoration.

## ✅ Error tracking — LIVE since 16 Aug 2026

`src/lib/errorReporting.js`, sending to the **EU** Sentry region. Proven by
firing `Promise.reject(new Error(…))` on the live site: the SDK chunk loaded on
demand, POSTed to the ingest endpoint, got **200**, and the issue appeared in
Sentry. An error tracker that has never received an event is not one; this one
has.

Measured on the deployed bundle:

| | |
|---|---|
| Entry chunk | 944 KB raw / **259.9 KB gzip** (259.6 before the DSN) |
| `captureException` in the entry | **1** — our call site only |
| Sentry SDK | its own chunk, **159.3 KB gzip**, fetched only on a crash |

⚠️ **THE ENTRY GREW BY 0.3 KB. THE SDK IS NOT IN IT** — verify by counting
`captureException` in the entry bundle: **1 is our call site, 11 would be the
SDK**. If that number is ever 11, the lazy import has been "tidied" into a
top-level one and every phone is paying 159 KB for it.

⚠️ **STACK TRACES ARE MINIFIED — SEEN, NOT PREDICTED.** The smoke-test issue
shows its location as `?(<anonymous>)`. No source maps are uploaded, so an error
gives you the MESSAGE, the page, the browser and the number of people affected,
but not a file and line. Usually enough in a codebase this size. Uploading source
maps needs a Sentry auth token as a build secret plus a Vite plugin — deliberately
not done. **The honest trigger for revisiting is the first real error nobody can
place**, not a tidiness urge.

### If it ever needs setting up again

1. Sentry project, platform **React**. ⚠️ The data region is chosen at signup and
   **cannot be changed later** — pick EU.
2. Copy the **DSN**. ⚠️ **Ignore the onboarding wizard** — `npx @sentry/wizard`
   would install a second copy and undo the lazy-loading.
3. Netlify → **Site configuration → Environment variables** →
   `VITE_SENTRY_DSN`. Do NOT tick "Contains secret values": the DSN is a
   write-only ingest key that ships in the client bundle by design, and marking
   it secret only complicates the build.
4. ⚠️ **REDEPLOY — AND "Deploy project" IS THE WRONG ONE IF THE LAST COMMITS WERE
   DOCS.** `scripts/netlify-ignore.mjs` compares the diff and will CANCEL the
   build, so the variable never gets baked in and nothing looks wrong. Use
   **Trigger deploy → Deploy project without cache**, which the gate always
   builds ("no cached commit to compare against"). Predict it first:
   `CACHED_COMMIT_REF=<last built> COMMIT_REF=<head> node scripts/netlify-ignore.mjs`
   — exit 0 means it would skip.
5. Prove it fires: on the live site console, run
   `Promise.reject(new Error('sentry smoke test'))`.

⚠️ **The SDK is lazy-loaded and must stay that way** — 159 KB gzip against a
260 KB bundle. See `src/lib/errorReporting.js`.
