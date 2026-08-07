# Decision — the calendar feed is served from our own domain

*6 Aug 2026. Commits `b68d341` (Netlify proxy) and `782086e` (app + service worker).*

## The question Jay asked

> "When I go to add to your calendar, why does the link start with `lushmshimxdc`?"

Because it was the Supabase project reference. `calendarFeedUrl()` built the link from
`VITE_SUPABASE_URL`, so what the app handed a human was:

```
https://lusmshimxdcxpnrktlgz.supabase.co/functions/v1/calendar?token=<uuid>
```

## Why it mattered enough to change

**The calendar feed is the only URL this app gives to a HUMAN to paste into another
application.** Every other Supabase call is made by our own JavaScript, where the hostname
is invisible and irrelevant. This one gets copied into Google Calendar or Apple Calendar
by a parent.

**⚠️ THE REAL REASON, not the cosmetic one: a subscribed calendar URL cannot be changed
remotely.** There is no mechanism — the address lives inside the subscriber's Google or
Apple account and only they can edit it. So whatever hostname reaches one parent is
permanent. If the Supabase project were ever moved, restored into a new project, or the
functions hostname changed, **every subscribed calendar in the club would silently stop
updating**, and the only remedy would be emailing several hundred parents asking them to
re-subscribe by hand. A stale calendar looks exactly like a club with no new fixtures, so
nobody would even report it as a fault.

The cosmetic reason is real too — a twenty-character random string reads as a phishing
link — but the permanence is what forced the timing.

**Done now because there was exactly ONE token issued** (`select count(*) from
calendar_tokens` → 1, Jay's own). Nobody else is subscribed. This was the cheapest it
would ever be, and the window closes the moment the committee is invited.

## What was built

**A Netlify proxy, not a redirect.** `netlify.toml` gains a `/calendar.ics` rule with
`status = 200`, above the SPA catch-all.

- **`status = 200` is the whole point.** It makes Netlify fetch the Supabase URL
  server-side and pass the response through, so the Supabase hostname never reaches the
  client at all. A 301/302 would hand the client the Supabase URL, and clients that follow
  and remember the final address would end up pinned to it anyway — the exact failure the
  rule exists to prevent.
- **Order matters.** Netlify applies the first matching rule; the `/*` → `index.html`
  catch-all would otherwise answer the feed with the app's HTML.

**The origin is a hard-coded constant, NOT `window.location.origin`.** `CALENDAR_ORIGIN`
in `src/data/calendar.js`. Deriving it from the current origin would mint permanent links
pointing at `app.adhjrt.com` for anyone arriving on the old alias — a domain that may be
deleted — and at deploy-preview hosts from preview builds. The trade is that a preview
build shows a production link, which is correct for a link this permanent.

**The service worker had to be told to leave it alone.** Workbox's `navigateFallback`
answers *any* unrecognised same-origin navigation with `index.html`. Without a denylist,
an installed user opening their own feed URL in a browser to check it would get the app's
HTML — indistinguishable from a broken feed, and invisible server-side because the service
worker answers before the request leaves the device. `navigateFallbackDenylist:
[/^\/calendar\.ics$/]` in `vite.config.js`. Calendar clients are unaffected either way;
Google and Apple fetch from their own servers where no service worker exists. **This
protects the human sanity-checking the link, which is exactly who would have hit it.**

The existing `runtimeCaching` rule needed nothing — it only matches `/rest/v1/` on the
Supabase host.

## Verified live, with faults injected

The proxy was deployed **alone first** (`b68d341`), with the app still emitting the old
URL, so the proxy could be proved before anything depended on it.

| Request to `adhquins-clubhub.com/calendar.ics` | Result |
|---|---|
| real token | `200 text/calendar` — 755 bytes, 2 VEVENTs, byte-identical to the Supabase URL |
| valid uuid that is not a token | `200` — 254 bytes, **empty calendar**, no leak |
| no token | `404 Not found` |
| malformed token | `404 Not found` |
| **`?tokenx=` instead of `?token=`** | **`404 Not found`** |
| `/schedule` (unrelated path) | `200 text/html` — SPA catch-all still works |

**The `?tokenx=` row is the one that matters.** It is what proves Netlify genuinely
forwards the query string rather than the function ignoring it — if the parameter were
being stripped, that row and the first row would behave identically. They do not.

The `404 Not found` responses are `text/plain` from the Deno function, not Netlify's own
404 page, which proves the request really reached Supabase.

Response headers survive the proxy intact: `Cache-Control: private,max-age=0,no-store`,
`Content-Disposition: inline; filename="quins.ics"`, `Content-Type: text/calendar`, and
`Server: Netlify` — no Supabase hostname anywhere.

**The new test was proved by breaking it.** `tests/calendar-subscribe.test.jsx` gained
*"never exposes the Supabase project hostname in a subscribable link"*. Reinstating the old
URL in `calendarFeedUrl` made **2 of 10 fail** with the expected messages; restoring gave
1028/1028 across 44 files.

**The shipped artefacts were read back, not assumed.** The deployed production bundle
contains `/calendar.ics?token=` and `adhquins-clubhub.com`, and **does not contain
`functions/v1/calendar`**. The deployed `sw.js` contains
`denylist:[/^\/calendar\.ics$/]` on its `NavigationRoute`.

## ✅ Proved end to end by a real subscription — the same day

Jay subscribed Google Calendar to the new URL and it worked. **This is a stronger proof of
the proxy than anything run from a terminal**: the fetch came from Google's own
infrastructure, an external client with no relationship to this network, not `curl` on the
machine that built it.

It also closed the **last open question about the pitch**, which no synthetic check could
reach — no event in the database had a pitch set when the feature was verified, so the
`venue · pitch` branch had never run on real data. It has now, and both branches appear in
the same response:

```
SUMMARY:U16 v Dubai Exiles
LOCATION:Zayed Sports City\, Abu Dhabi

SUMMARY:U13 - First Training Session
LOCATION:Zayed Sports City\, Abu Dhabi · Pitch 3
```

So `locationFor()` is not merely running — **the conditional discriminates**, in one
response, against live data. Google renders the second as
`Zayed Sports City, Abu Dhabi · Pitch 3` under the event title, which is exactly the
"which pitch am I standing at" case the field exists for.

Also confirmed from the same response: `DTSTART:20260831T140000Z` / `DTEND` 90 minutes
later renders in Google as **6:00 – 7:30pm** Abu Dhabi — the zone maths and the
`DURATION_MINUTES.training` assumption are both right in a real client — and the RFC 5545
`\,` escaping renders as a plain comma rather than leaking a backslash.

⚠️ **Trap: the `·` came back as `?` in the Windows PowerShell console.** That is the
console's encoding, not the feed. Google rendering it correctly is the evidence the bytes
are right. **Do not diagnose a character-encoding fault from a terminal dump on this
machine** — check a real client before believing it.

## Known and deliberately not addressed

- **A valid-looking uuid that is not a token returns `200` with an empty calendar**, while
  a malformed one returns `404`. That is a small oracle — it distinguishes "well-formed but
  unknown" from "malformed". Judged worthless to an attacker (knowing a random uuid is not
  a token tells you nothing) and not worth a code change to the deployed function.
- **The token is still a bearer credential.** Anyone holding the URL sees that person's
  fixtures. Inherent to calendar subscriptions — a calendar client cannot sign in. This
  change moves the hostname, not the security model.
- **`UID:${event.id}@quins.adhjrt.com` inside the feed is unchanged**, on purpose. An
  iCalendar UID is a uniqueness string, never fetched; changing it makes every subscriber's
  calendar treat every event as new.
- **Jay's own earlier subscription pointed at the Supabase URL** and would have kept
  working — that URL is untouched and still live. He has now subscribed on the new address
  as well; if the old subscription is still present it will show the same fixtures twice
  and should be removed.
- **Refresh latency is Google's, not ours.** The feed advertises `REFRESH-INTERVAL:PT1H`
  but Google treats that as a hint and has historically refreshed on its own schedule,
  sometimes several hours. **A fixture edit will not appear in a parent's calendar
  immediately, and that is not a bug** — expect it to be reported as one.
