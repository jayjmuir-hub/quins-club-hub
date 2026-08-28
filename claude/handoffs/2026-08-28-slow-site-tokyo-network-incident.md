# Handoff — 28 Aug 2026: live slow-site incident, plus the day's shipped work

History, not instruction (per CLAUDE.md). But the incident below was **still
open** at handoff — read it first.

## ⚠️ LIVE INCIDENT — start here

**Symptom (open at handoff):** intermittent ~15-second request hangs, roughly
**1 in 5 requests**. Surfaces as signup's **"Loading squads…"** never
populating (a club member complained ~1:11 PM local), and **slow desktop page
loads**. Members were complaining. Began 28 Aug.

**Diagnosis (evidence-backed): it is a NETWORK-PATH problem, not the app, the
database, permissions, or the Tokyo *distance*.** On a hung request the TCP+TLS
connection to Supabase establishes in ~50ms, then the server's first byte
**never arrives** (`curl` shows `ttfb: 0.000000`, `total: 15s` timeout) — i.e.
request/response packets are being dropped on the path between the club's
fixed-line internet and Supabase's **Tokyo region** (`ap-northeast-1`). When a
request *does* get through it is fast (~0.25s).

**THE KEY TELL: Jay's mobile (cellular) works fine** on both the installed PWA
and mobile Chrome, while his desktop on the club/CAFNET fixed-line hangs. Same
Supabase, different route → the healthy cellular route works, the fixed-line
route to Tokyo is flaky today. If Supabase's backend were the problem, mobile
would fail too. It doesn't.

**Confirm test still PENDING — ask Jay:** on the desktop, tether to the phone's
**hotspot** (cellular) and load the site. If it's fast on the hotspot, it is
100% the fixed-line route — nothing to fix in app or DB.

**Action already taken:** restarted the Supabase project (dashboard → Settings →
General → Restart project, ~2 min downtime). It did **NOT** fix the hangs —
which is itself evidence the problem is the path, not Supabase's state.

**DEAD ENDS already ruled out — do NOT re-investigate:**
- *Stale service worker* — WRONG (incognito was slow too).
- *"anon lost all its table grants / a blanket REVOKE"* — WRONG; a false alarm
  raised mid-diagnosis. `anon` having **0 direct table SELECTs is BY DESIGN** —
  signup reads squads through the security-definer RPC
  `public.list_signup_squads()` (see `src/data/signupSquads.js`), which returns
  every squad to anon fine when the request gets through. A 401 on a direct
  `from('teams')` as anon is expected and irrelevant.
- *Tokyo distance / latency* — connect+TLS is ~50ms; latency is fine. The route
  is dropping packets today; distance is not the cause.

**Options (for when the fire is out, or if it doesn't self-heal):**
1. **Immediate workaround:** cellular, or a VPN on the desktop — both route
   around the bad fixed-line path.
2. **May self-heal** if it is a transient ISP/peering blip (often clears in
   hours).
3. **Durable fix: migrate the project to a nearer region** — Mumbai
   `ap-south-1`, or a Middle-East region. Better routing from the UAE and lower
   latency, and it answers "why is a UAE club on Tokyo?" (it was a poor default
   at project creation). ⚠️ Supabase has **no in-place region change** — this
   means standing up a NEW project in the new region and migrating schema + data
   + storage + auth users, then repointing the app. A real project, plan it.

**Key facts:** project ref `lusmshimxdcxpnrktlgz`; region Tokyo `ap-northeast-1`;
Pro plan; anon/publishable keys are public by design; a Postgres update was
offered in Service Versions — **do NOT rush it** (unrelated, disruptive).

## Secondary, SEPARATE, real issue — staff photos on the admin home

Not the incident cause, but a genuine slowness worth fixing. The admin home
(`SquadStaffCard`, used in `src/screens/Dashboard.jsx`) loads ~12 staff photos
from Supabase Storage. The app mints a **new signed URL every load**
(`signPhotoUrl` in `src/data/photos.js`), so Supabase's CDN sees a new URL each
time → cache **miss** → a cold origin fetch (~1s each; ~35ms once warm). Phone
caches them (PWA); a fresh desktop re-fetches all ~12 cold. **Fix idea:** persist
the signed-URL cache (localStorage) so reloads reuse the URL → CDN warm, plus
`loading="lazy"` on the images. Helps every photo in the app.

## Shipped today — all live on production (context)

- **Chat polls** — PR #473, squash `59ac0f7`. WhatsApp-style, votes visible to
  the whole chat. Migration `db/migrations/20260827_chat_polls.sql` applied to
  prod; harness `db/tests/chat-polls.sql`.
- **Voice messages** — PR #474, squash `bc41c36`. Tap-to-record (NOT hold — the
  approved fallback), plain-bar playback. Bucket widened for audio
  (`db/migrations/20260828_chat_voice.sql`, applied to prod). ⚠️ **Real-iPhone
  capture is still untested by anyone** — a go-live step nobody has done.
- **Tournaments stat tile** — PR #477 (`51f5546`, four-across) then PR #478
  (`8d7b1a7`, 2×2 on mobile) after four-across overflowed the word "TOURNAMENTS"
  on a phone.

**Changelog one-behind:** the top entry (the 2×2 fix) is intentionally unSHA'd —
the NEXT pull request must backfill `8d7b1a7`.

**Deferred, agreed:** voice hold-to-record gesture + a real per-note waveform.
Both build on what shipped.
