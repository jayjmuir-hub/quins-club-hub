# Monitoring

**Detection used to be somebody telling Jay.** Two uptime monitors and an error
tracker fix that. Both are account creations, so both are Jay's.

## The two monitors

Provider: **Better Stack** free tier — 10 monitors, 3-minute checks, no
non-commercial restriction. (UptimeRobot's free tier is personal-use-only since
Dec 2024; StatusCake deactivates an account that does not log in every 90 days.
Both were ruled out on that, not on features.)

| | URL | expect |
|---|---|---|
| **1. The app** | `https://adhquins-clubhub.com/` | 200 |
| **2. The calendar feed** | `https://adhquins-clubhub.com/calendar.ics?token=<Jay's token>` | 200, body contains `BEGIN:VCALENDAR` |

Jay's token is the one in his own calendar subscribe URL, from the app.

⚠️ **THE CALENDAR MONITOR NEEDS THE TOKEN, AND AN EARLIER VERSION OF THIS FILE
WENT TO SOME LENGTHS TO AVOID IT.** Without a token that URL returns 404, so the
monitor had to be configured to treat 404 as healthy — which reads as a mistake
to anyone who sees it, ruled out most free tiers, and bought a WEAKER check: the
edge function deliberately returns the same 404 whether the token is missing or
Supabase is unreachable, so a tokenless monitor stays green through a database
outage. With the token, an ordinary "expect 200" catches that too.

⚠️ **THE KEYWORD IS NOT DECORATION.** If the `/calendar.ics` proxy rule in
`netlify.toml` were ever lost, the path would fall through to the SPA catch-all
and return **200 with the app's HTML** — every calendar subscription in the club
broken, and a status-code-only check reporting success. `BEGIN:VCALENDAR` is what
notices.

⚠️ **The token exposes fixtures for the squads Jay can see**, which this repo
already treats as not sensitive (it is why pending members can read them). It is
his own token and can be rotated. Do not use a parent's.

## ⚠️ Then prove it fires — this is the step that matters

**A monitor that has never fired is not a monitor.**

1. At a quiet time — early morning UAE, not before a Saturday fixture; **this is
   a real outage** — Netlify → `quins-club-hub` → **Site configuration → Status →
   Pause site**.
2. Wait for the alert. **Time it.** That is the real detection window.
3. Un-pause, and confirm the recovery alert arrives too.

This is also how to find out whether the free tier sends phone push or only
email, which is worth knowing before an outage rather than during one.

## Error tracking

Built and merged, and **sends nothing until a DSN exists** — with none set, the
Sentry SDK is not even in the bundle. `src/lib/errorReporting.js`.

1. Create a Sentry project (platform **React**) and copy the **DSN**.
2. Netlify → **Site configuration → Environment variables** →
   `VITE_SENTRY_DSN = <the DSN>`.
3. ⚠️ **Redeploy.** `VITE_*` is substituted at BUILD time, so the variable alone
   changes nothing.
4. Prove it fires: open the live site, and in the browser console run
   `Promise.reject(new Error('sentry smoke test'))`. It should appear in Sentry
   within a minute. Same rule as above — an error tracker that has never received
   an event is not one.

⚠️ **The SDK is lazy-loaded and must stay that way.** It is 159 KB gzip against a
260 KB bundle; loading it normally would be a 61% tax on every phone for code
that does nothing until something crashes. See `src/lib/errorReporting.js`.
