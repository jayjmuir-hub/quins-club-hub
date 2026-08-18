# Plan — real browser push notifications, starting with one trigger

**STATUS: BUILT, DEPLOYED, AND SMOKE-TESTED LIVE — 18 Aug 2026. THE APP IS
NOT MERGED.** Every server-side piece is applied to production: the
`push_subscriptions` table and RLS, the VAPID key pair (private key in Vault),
the `notify_feedback_reply_push` trigger, the `push-send` Edge Function, and
`public.get_push_vapid_private_key()`. All of it was exercised end to end
against a disposable fixture — a real trigger fire, a real Vault-stored key,
a real VAPID JWT, real RFC 8291 encryption, a real HTTP POST, and the
dead-subscription cleanup on a 410 — then the fixture was removed.

⚠️ **ONE THING IS STILL UNVERIFIED, AND ONLY A REAL DEVICE CAN CLOSE IT.**
Nothing here proves a real browser can DECRYPT and DISPLAY a push — that
needs an actual person subscribing from an installed PWA. The Node-side round
trip proves the math; the live smoke test proves the deployed pipeline calls
that math correctly and reaches the network; neither is a real subscriber.

✅ Client work is also done: `src/lib/push.js`, `src/components/
PushNotificationsToggle.jsx` (in More, next to CalendarSubscribe), `public/
push-sw.js` wired in via `workbox.importScripts`. 28 unit/component tests,
one of which caught and fixed a real bug before it shipped — see below.

## Why this, and why now

Jay asked for push notifications directly, then corrected the first framing
of it: **"I don't want more emails, I just want app push notifications."**
That rules out the obvious cheap move — bolting a push send onto the existing
`notify-*` edge functions' email path — and means this is genuinely new
infrastructure: a permission prompt, a subscription record, a signing key,
and a sender that speaks the Web Push protocol rather than SMTP.

## Scope for v1 — one trigger, chosen and justified

**A reply to your own report**, i.e. `public.feedback` — a push fires when an
admin changes `status` or sets `admin_note` on a row (both are UPDATE-only,
gated by `private.is_admin(club_id)` per the `feedback triage` policy, so
every UPDATE on this table is already an admin action; no extra guard needed
in the trigger).

**Why this one first, and not the obvious "you're picked in a lineup" or
"mirror every email":**

- It is a gap Jay created ON PURPOSE, this same day. `claude/plans/2026-08-18
-help-and-feedback.md` and `supabase/functions/notify-feedback/index.ts` both
  record his ruling: *"keep everything in one place instead of emails"* — no
  second email when an admin replies. The acknowledgement email is the ONLY
  thing that currently tells a reporter to go check, and it tells them to
  check by opening the app and tapping a `?` icon. A push closes exactly that
  gap without reopening the "more email" question he just closed.
- It is a single well-bounded event — one table, one UPDATE condition, one
  recipient (`feedback.submitted_by`) — so it proves the whole pipeline
  (permission → subscription → trigger → send → display → tap-through) against
  the smallest possible surface before any second trigger is added.
- Lineup-picked notifications were considered and set aside for v1: they need
  a real design decision this plan should not make quietly — does the whole
  squad get pinged or only the 22, does a non-selection get a softer message —
  and that is Jay's call, not a default to bury inside a "push notifications"
  ticket. **Deferred, not refused.**
- Mirroring the full `notify-*` set (approval, invite, pitch request) was
  set aside for the same reason as above, times four, and because two of
  those already work by email today — the marginal value of a FIRST push
  landing on the newest, least-covered gap is higher than landing on ones
  that already have a working channel.

## What this explicitly is not

- **Not a vendor.** No OneSignal, no Firebase Cloud Messaging, no new ToS to
  read. Jay's call, matching this repo's pattern of caring about exactly this
  trade (Better Stack over UptimeRobot/StatusCake, Resend over Microsoft
  Graph) — the whole notification system stays two things: Supabase and
  Resend, and this adds neither name to that list.
- **Not built on a third-party push library either.** The Web Push protocol
  (RFC 8030 request shape, RFC 8291 `aes128gcm` payload encryption, RFC 8292
  VAPID) is implemented directly against Deno's `crypto.subtle`, matching the
  precedent already in this codebase: `send-email/index.ts` hand-rolls its
  HMAC webhook verification rather than importing a library, with the
  reasoning stated inline — *"an unaudited import in the one place that
  decides whether to trust a caller is a poor trade."* The same reasoning
  applies here, and the primitives (ECDH, HKDF, AES-128-GCM, ECDSA) are all
  native Web Crypto operations.
- **Not a replacement for the acknowledgement email.** That email still fires
  on submit and still tells a reporter where to look if they never grant
  notification permission, or grant it and later revoke it, or read this on
  a browser that does not support push at all.

## ⚠️ The limitation that has to be said out loud

**Push notifications on an iPhone only work if Quins Club Hub has been added
to the Home Screen as an installed app**, and only on iOS 16.4 (September
2023) or later. A parent who has the site open as an ordinary Safari tab will
never receive one, silently — Safari gives no error, the subscribe step
simply is not offered the same way. Given this club's members are
overwhelmingly on phones, this is not a footnote:

- The subscribe UI must say so, not just offer a toggle that does nothing on
  an un-installed iPhone.
- This is a real argument for prompting/reminding people to "Add to Home
  Screen" at some point — **not built here**, and worth its own decision
  once the base feature is proven.
- Android Chrome and desktop browsers have no such restriction.

## Architecture

```
Admin replies to a report
  → UPDATE public.feedback (status or admin_note changes)
    → AFTER UPDATE trigger private.notify_feedback_reply_push()
      → reads push_notify_url / push_notify_secret from Vault
      → net.http_post to the push-send edge function (fire-and-forget,
        exactly the shape private.notify_pending_membership() already uses —
        it cannot fail the UPDATE; pg_net queues and returns immediately)
        → push-send (service_role) reads every push_subscriptions row for
          feedback.submitted_by
          → for each: builds a VAPID JWT (ES256, crypto.subtle.sign),
            encrypts the payload (ECDH + HKDF + AES-128-GCM,
            crypto.subtle throughout), POSTs to the subscription's endpoint
          → a 404/410 response means the endpoint is dead: DELETE that
            subscription row (self-cleaning, no separate sweep needed)
```

Client side:

```
Settings screen: "Notify me when I get a reply" toggle
  → Notification.requestPermission()
  → navigator.serviceWorker.ready
  → registration.pushManager.subscribe({ userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY })  // a plain exported constant
  → upsert the subscription (endpoint, p256dh, auth, profile_id) into
    push_subscriptions — an ordinary RLS-protected insert as the signed-in
    user, no new RPC needed; endpoint is the natural conflict key so a
    browser that resubscribes updates its own row rather than duplicating
public/push-sw.js (loaded into the generated service worker via
vite.config.js's workbox.importScripts, so the existing Workbox
precache/globIgnores tuning is untouched):
  self.addEventListener('push', ...)          → self.registration.showNotification
  self.addEventListener('notificationclick', ...) → focus/open the app
```

## Data

`public.push_subscriptions`:

| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `profile_id` | uuid, not null, fk → `profiles(id)` on delete cascade | |
| `endpoint` | text, not null, **unique** | the natural identity of a subscription |
| `p256dh` | text, not null | the subscription's public key, base64url |
| `auth` | text, not null | the subscription's auth secret, base64url |
| `created_at` | timestamptz, default now() | |

RLS: owner-only, `profile_id = auth.uid()`, ALL commands — the same shape as
`player_parents`'s `parent edit own`. No admin visibility is needed; nobody
but the subscriber and the service-role sender ever reads this table.

## Secrets

- ✅ **`push_vapid_private_key`** — generated 18 Aug 2026 with Node's
  `webcrypto` (no new npm dependency, no keygen library), stored in Vault.
  Verified before storing: round-tripped an ECDSA sign/verify AND an ECDH
  derive using the reconstructed key material, the same reconstruction the
  edge function will do (public key split into x/y, combined with the stored
  scalar into a JWK) — so a format mistake would have been caught here rather
  than in a push that silently never arrives.
- **The public key is NOT a secret and is not in Vault.** VAPID public keys
  are designed to be public — they identify the sending application server,
  the way a public key always does. It lives as a plain exported constant in
  `src/lib/push.js`, committed to the (public) repo, rather than as a
  `VITE_` build-time env var — one fewer piece of Netlify config to get right,
  and nothing is gained by hiding a value whose whole job is to be shown to
  every browser that subscribes.
- ✅ **`push_notify_url`** — the push-send edge function's URL, created in
  Vault matching the naming of `approval_notify_url` / `feedback_notify_url`
  / `pitch_notify_url` / `invite_notify_url` / `access_request_notify_url`.
- **Reuses `approval_notify_secret`** for the `x-approval-secret` header, the
  same shared secret `notify-feedback` reuses rather than minting a new one —
  Edge Function secrets are project-wide, so it is already present.

## What "done" means for v1

- A member can turn the toggle on, a real admin reply on a real (or harness)
  report triggers a real push, tapping it opens the app.
- A dead subscription (uninstalled PWA, revoked permission at the OS level)
  cleans itself up on the next send attempt rather than accumulating forever.
- The iOS limitation is visible in the UI, not just in this document.
- Explicitly NOT done: lineup-picked pushes, mirroring the other `notify-*`
  emails, a "such-and-such needs your attention" digest, or admin-authored
  broadcast pushes. Each is a separate, later decision.

## ⚠️ A real bug the tests caught before it shipped

`needsHomeScreenInstall()`'s first draft required `isPushSupported()` to be
true before it would even ask whether this was an un-installed iPhone. That
made the Home Screen message unreachable everywhere it was used — the one
real device this function exists for is exactly the one whose feature
detection cannot be trusted to answer "supported" consistently, so gating on
it hid the message it was meant to show. `tests/push.test.js` asserted the
message a real non-installed iPhone should see and found the branch dead.
Fixed by making the two checks independent, and checking Home-Screen-needed
FIRST, in both `subscribeToPush()` and the component — see the comments left
at both call sites so nobody re-nests them.
