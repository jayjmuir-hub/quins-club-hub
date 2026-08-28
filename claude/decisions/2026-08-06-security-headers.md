# Decision — baseline security headers, and what the service worker does to them

*6 Aug 2026. Commit `28d9a02`.*

Item 1 of an infrastructure audit Jay asked for. **The header change is small; the finding
underneath it is the valuable part.**

## Before

Netlify sent exactly one security header, its own default:

```
Strict-Transport-Security: max-age=31536000
```

No framing protection, no `nosniff`, no `Referrer-Policy`, no `Permissions-Policy`. On an
app holding children's names, dates of birth, parent contact numbers and photographs.

## What was added

A `[[headers]]` block in `netlify.toml` for `/*`:

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), payment=(), usb=()` |

**CSP is deliberately ONLY `frame-ancestors`.** CSP directives are independent — naming one
restricts that one and leaves the rest unrestricted. A real content policy needs a tested
`connect-src` for Supabase REST, Auth, Storage and the edge functions, plus `style-src`, and
a wrong one breaks the app *silently* for anyone whose service worker has already cached a
page. Separate, tested job.

**`Referrer-Policy` is the load-bearing one here, not boilerplate.** Magic-link and
calendar-feed URLs both carry a **bearer token in the query string**; without a policy a
browser can put the whole URL in an outbound `Referer`.

**⚠️ `camera` is deliberately ABSENT from `Permissions-Policy`.** Nothing calls
`getUserMedia`, and `PhotoField.jsx` is a plain `<input type="file">` with **no `capture`
attribute** (checked before writing the policy), so restricting it buys almost nothing —
while the parent-adds-a-photo-from-a-phone flow has **never been smoke-tested on a real
device**. Do not add `camera=()` until it has been. A silent break there reads as "the app
won't take my photo" and nobody would connect it to a header.

> **⚠️ SUPERSEDED 28 Aug 2026 — `microphone` is now `microphone=(self)`, not `()`.**
> The line above ("Nothing calls `getUserMedia`") stopped being true when voice messages
> shipped (`src/lib/voiceRecorder.js`). `microphone=()` then blocked recording on every
> Chromium browser (Chrome/Android/PWA) while Safari/iOS ignored the policy — so the mic
> "did nothing" everywhere but iPhone. Fixed in `netlify.toml`. The camera paragraph's own
> warning came true for the microphone: a header silently broke a feature and nobody
> connected the two. Do not restore `microphone=()` while voice notes exist.

## ⚠️ THE FINDING: the service worker serves the app document with NO headers

`curl` said every header was present on `/` and on `/schedule`. **That was true and
misleading.** Driving a real browser found:

```
sw_controlled: true
fetch('/')  ->  x-frame-options: null,  content-security-policy: null,  referrer-policy: null
same-origin iframe of the app  ->  LOADED, document readable
```

Workbox **precaches `index.html`** and serves it from Cache Storage. A cached `Response`
replays the headers it had *when it was cached* — and this copy was cached before the
headers existed. So for every returning user, the app's own HTML document currently carries
**none** of these headers.

**It does not self-heal on a headers-only deploy.** The precache entry is keyed by a content
revision hash of `index.html`. Changing `netlify.toml` changes no built asset, so Workbox
sees nothing new and never re-fetches. The cached copy picks the headers up only on the
**next deploy that actually changes the bundle**.

> **⚠️ SUPERSEDED 28 Aug 2026 — headers-only deploys DO self-heal now, because EVERY deploy
> changes the bundle.** The paragraph above was true on 6 Aug but stopped being true when
> `__BUILD_REF__` (`vite.config.js`, added ~18 Aug for the Help sheet's version line) began
> baking the deploy's `COMMIT_REF` into the JS bundle (`src/components/HelpSheet.jsx`). Every
> deploy has a distinct `COMMIT_REF`, so a built chunk changes, so `index.html`'s precache
> revision changes, so `sw.js` changes and `autoUpdate` re-fetches `index.html` — with the
> live response headers — on the user's next visit. A `netlify.toml`-only change is a new
> commit → new `COMMIT_REF` → new bundle, so it propagates like any other.
>
> **Measured 28 Aug 2026 (prove-it, not trust-the-doc):** two production builds differing
> ONLY in `COMMIT_REF` produce different `sw.js` AND `index.html`; the SAME `COMMIT_REF`
> twice produces byte-identical output (deterministic control, so the difference is the ref,
> not build noise); and the live bundle carries the deployed commit SHA (`56e399a`), so
> `COMMIT_REF` is real in production, not the `'dev'` fallback. This is why the 28 Aug
> `microphone=()` → `microphone=(self)` fix (PR #490) reached installed PWAs on next open.
> The clickjacking analysis below never depended on this paragraph and is unaffected.

### But the attack that matters is still blocked

Framed **cross-origin from `example.com`, the real clickjacking shape — Chrome REFUSED it**
(the grey broken-document placeholder). Framed **same-origin, it loaded.**

The explanation is third-party **storage partitioning**: an iframe of
`adhquins-clubhub.com` inside another site gets a partitioned storage bucket in which this
app's service worker is *not* registered, so that request goes to the network and gets the
real `X-Frame-Options`. The victim's cached, header-less copy is unreachable from the
attacker's page.

So:

- **Cross-origin framing — blocked.** Verified in a real browser, not inferred.
- **Same-origin framing — allowed.** Not a clickjacking vector: an attacker who can already
  serve a page on this origin has worse options than framing.

⚠️ **Confidence note:** the partitioning behaviour is Chrome's, verified in Chrome only.
A browser that does not partition service-worker registrations by top-level site could
serve the attacker's frame from cache and permit it. Not treated as urgent — but it is the
reason the finding below is recorded rather than closed.

### The durable lesson

**~~Any future header-based protection will silently not apply to installed users.~~**
⚠️ **No longer true since `__BUILD_REF__` (see the SUPERSEDED note above): a header change
reaches installed users on their next visit after any deploy.** The lasting lesson is the
verification one, which still holds: `curl` sees the network response, not the SW-served
cached document — so **verify security headers from inside a controlled browser, never from
`curl` alone.** (The 28 Aug microphone case cut the other way — `curl` was right and the
cache was the victim — but the rule is the same: measure the surface the user actually gets.)

The heavier fix — stop serving navigations from precache (network-first for the document,
cache as fallback) — is **still deliberately NOT done, and the reason is now simpler:
`__BUILD_REF__` already delivers header changes on every deploy, so the rework buys nothing.**
⚠️ **Do not justify keeping the precache by "offline support" — Jay, 28 Aug 2026: nobody uses
this app offline, and stale offline data (scores, availability) would mislead, not help.**
The precache earns its keep on *online* grounds instead: instant launches, and riding out
flaky pitch-side signal and Supabase blips (the data cache is `NetworkFirst`, so online it is
always fresh and only falls back to last-seen when the live fetch fails — which is what the
provider-resilience plan leans on). So: do not migrate the SW to `injectManifest` for the
header question — it is already answered — and weigh any future SW simplification on load
speed and blip-resilience, not on offline use.

## HSTS left alone

Still Netlify's `max-age=31536000` with no `includeSubDomains` and no `preload`. Adding
`preload` is close to a one-way door — removal from the browser preload list takes months —
and there is no case for it here.

## Verified

- All five headers present on `/` and on the SPA fallback route `/schedule`.
- **The `/calendar.ics` proxy is unaffected**: still `200 text/calendar`, 2 VEVENTs,
  `Pitch 3` present, `Cache-Control: private,max-age=0,no-store` preserved. Netlify's custom
  headers do not apply to proxied responses; the `nosniff` on that response comes from the
  edge function itself.
- Framing behaviour tested in a real browser, cross-origin and same-origin, with the
  cross-origin refusal confirmed visually.
