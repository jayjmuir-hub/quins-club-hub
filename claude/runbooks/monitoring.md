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

✅ **E-mail delivery is PROVEN** — Jay ran *Send test alert* on 16 Aug and it
arrived. ⬜ **Detection is NOT yet proven**; see the pause drill below.

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

## ⚠️ The pause drill — still outstanding

**A monitor that has never fired is not a monitor.** The test alert proved the
e-mail PATH; it did not prove the monitors notice an outage.

1. Pick a quiet time — early morning UAE, not before a Saturday fixture.
   **This is a real outage.**
2. Netlify → `quins-club-hub` → **Site configuration → Status → Pause site**.
3. Both monitors should go red. **Time how long it takes** — that is the real
   detection window, and it belongs in `claude/open-items.md`.
4. Un-pause; confirm the recovery alerts arrive.

## Error tracking — built, switched off

`src/lib/errorReporting.js`. **Sends nothing until a DSN exists** — with none
set, the Sentry SDK is not even in the bundle.

1. Create a Sentry project (platform **React**). ⚠️ The data region is chosen at
   signup and **cannot be changed later** — pick EU.
2. Copy the **DSN**. ⚠️ **Ignore the onboarding wizard** — the code is already
   written, and `npx @sentry/wizard` would install a second copy and undo the
   lazy-loading.
3. Netlify → **Site configuration → Environment variables** →
   `VITE_SENTRY_DSN = <the DSN>`.
4. ⚠️ **Redeploy.** `VITE_*` is substituted at BUILD time, so the variable alone
   changes nothing.
5. Prove it fires: on the live site, in the browser console, run
   `Promise.reject(new Error('sentry smoke test'))`. It should reach Sentry
   within a minute.

⚠️ **The SDK is lazy-loaded and must stay that way** — 159 KB gzip against a
260 KB bundle. See `src/lib/errorReporting.js`.
