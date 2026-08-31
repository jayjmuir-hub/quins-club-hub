# Monitoring

**Detection used to be somebody telling Jay.** Two uptime monitors now watch the
site, and **Sentry is LIVE** — proved 16 Aug 2026 by firing a real error on the
live site and watching it arrive. A **heartbeat on the nightly db-check is
wired but waiting on Jay** — see its section below for the four steps.

⚠️ **THIS LINE SAID "an error tracker is built but switched off" UNTIL 19 Aug
2026, AND THAT WAS ALREADY THE SECOND TIME.** `CLAUDE.md` records the first: the
claim outlived the truth by five days, a code review read it and recommended
DELETING `@sentry/react` as dead weight. It was corrected there and in the body
of this file — see "Error tracking — LIVE since 16 Aug 2026" below — **but not
in this opening summary, which is the part anybody actually reads.**

⚠️ **THE LESSON IS ABOUT WHERE STATUS LIVES, NOT ABOUT SENTRY.** A file that
states its own status twice will eventually disagree with itself, and the
summary is the copy that rots unseen because the detail below it looks
authoritative. **If you change a status in this file, change the top of it too
— or say it once and link.**

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

## The nightly-check heartbeat — wired 24 Aug 2026, waiting on Jay

⚠️ **"GitHub emails Jay when the run FAILS" was this section's opening claim,
and it was DISPROVEN by events: the nightly was red every night from 22 to
30 Aug 2026 — nine runs — and no human reacted.** Whatever those emails were
doing, they were not functioning as an alert. Since 31 Aug a red run **opens or
bumps a GitHub issue** ("The db-check nightly is red", one issue bumped per red
run, closed when green) — visible on the repo, no secret to configure, and it
notifies through issue notifications, a channel with a pulse. **Nothing tells
anyone when the run stops HAPPENING** — GitHub disables a `schedule` after 60 days without
repo activity, a workflow can be deleted, a cron line can rot. A heartbeat
inverts the signal: the workflow pings Better Stack after every genuine green
run, and **silence past the period + grace raises the alert**.

The workflow side is done (`.github/workflows/db-check.yml`, the Heartbeat
step). ⚠️ **It pings only when the harnesses actually ran and passed** — never
on the "SUPABASE_DB_URL is not set" exit — because a heartbeat that stays
green while the check it vouches for is off would be worse than none. Until
the secret below exists the step says "no heartbeat sent" and passes: inert,
not red, same pattern as the harnesses themselves.

**Jay's steps — in this order, because the order itself is the firing proof:**

1. **In Better Stack:** Heartbeats → **Create heartbeat**. Name
   `db-check nightly`, period **1 day**, grace **6 hours** (the run starts
   03:20 UTC; grace covers a slow queue without hiding a missed day). Alert
   e-mail as for the other monitors. Copy the heartbeat URL it shows.
2. **Wait for the alert to fire once — do not add the secret yet.** The
   workflow is not pinging, so within a day Better Stack must raise
   "heartbeat missing". That alert IS the drill: it proves silence is
   detected, before the heartbeat is ever trusted. A monitor that has never
   fired is not a monitor.
3. **In GitHub:** repo → Settings → Secrets and variables → Actions →
   New repository secret, name **`DB_CHECK_HEARTBEAT_URL`**, value the URL
   from step 1. ⚠️ The URL is a capability secret — anyone holding it can
   keep the heartbeat green — so it lives only here. Claude never handles it.
4. **In GitHub:** Actions → "DB harnesses" → **Run workflow** (manual run).
   Green run → the Better Stack incident resolves itself. That closes the
   loop: fired on silence, resolved on the first real ping.

**What it will and won't catch:** it catches the run stopping (disabled
schedule, deleted workflow, GitHub outage lasting past grace) and doubles the
failure alert (a red run sends no ping). It does not catch a harness that
passes wrongly — that is what the self-tests inside `db/tests/` are for.

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

⚠️ **`integrations: []` DOES NOT STOP SENTRY'S OWN `unhandledrejection`
HANDLER.** JAVASCRIPT-REACT-3 (25 Aug 2026) arrived with mechanism
`auto.browser.global_handlers.onunhandledrejection` and the Outlook Safe
Links / CefSharp scanner payload `Object Not Found Matching Id:…`. That
is not Club Hub. `src/lib/errorReporting.js` drops the pattern in
`reportError` and in the global handler, and `Sentry.init` lists it plus
`Non-Error promise rejection captured` in `ignoreErrors` so Sentry's
auto handler cannot page Jay either. A real `Error` still reports.


## Bot sign-ups, and the threshold for turning on Turnstile

Jay asked on 17 Aug 2026 whether to add Cloudflare Turnstile. **Not yet — and
here is the number that would change the answer**, so it is a decision with a
trigger rather than a hunch.

⚠️ **A BOT ACCOUNT GETS NOTHING HERE, WHICH IS WHY THIS IS NOT URGENT.** A signup
with no membership reads zero rows from every table that matters — that is the
whole point of the approval gate. Junk signups are noise in the waiting list on
`/accounts`, not a breach. Measured 17 Aug: 29 accounts, all confirmed, none
stranded.

⚠️ **THE RISK IS NOT JUNK ACCOUNTS, IT IS EMAIL REPUTATION.** Every signup
attempt sends a confirmation through Resend, on the SAME sending domain as the
auth mail. A signup flood would not breach anything, but it could get
`send.adhquins-clubhub.com` flagged — **and that takes SIGN-IN down with it**,
which is the failure `supabase/functions/notify-approval/index.ts` already warns
about at length.

**So watch `/signup` volume, not account count.** The query, over the last 24
hours (Supabase keeps logs for a limited window — this cannot answer "last
month"):

```sql
-- Sign-up attempts by hour, and how many were refused.
select formatDateTime(timestamp, '%Y-%m-%d %H:00') as hour,
       count(*)                                    as attempts,
       countIf(log_attributes['error'] != '')      as refused
  from logs
 where source = 'auth_logs' and log_attributes['path'] = '/signup'
 group by hour order by hour desc
```

**The trigger: sign-up attempts an order of magnitude above the club's own
onboarding rate, from addresses nobody recognises.** A busy real day is a squad's
worth of parents; a bot day is hundreds. If that happens, Turnstile is the right
tool and **Supabase supports it natively** — Authentication → Attack Protection →
CAPTCHA (hCaptcha or Turnstile), a project setting plus a token passed from the
client. It is not a build.

⚠️ **DO NOT TURN IT ON PRE-EMPTIVELY.** It puts a challenge in front of every
real parent to solve a problem that is not happening, on the one screen where
losing somebody costs the club a member.
