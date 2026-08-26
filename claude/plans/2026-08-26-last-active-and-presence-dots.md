# Last active for admins, and presence dots in chat

**Status: NOT SHIPPED — design approved by Jay 26 Aug 2026 (option B for the
admin fact; grey offline dot chosen over no-dot); implementation not started.**

Jay, 26 Aug 2026: "admin should be able to see a last logged in item on every
account, sort of like the account created item" — and, on learning the 25 Aug
Online feature was a single word in one header: "fold that in, green dot for
online, yellow dot for away" … "use the grey dot".

Two halves, one piece of work. They answer different questions with different
mechanisms and deliberately different retention:

| | Question | Mechanism | Stored? |
|---|---|---|---|
| **Last active** | "Is this account alive?" (admin, per account) | day-level `profiles.last_seen_at` | YES — coarse, admin-facing |
| **Presence dots** | "Are they there right now?" (chat) | the existing Realtime presence channel | NO — ephemeral, unchanged ruling |

## Half 1 — Last active (option B, chosen over raw last-sign-in)

**Why not `auth.users.last_sign_in_at` alone:** the PWA keeps people signed
in for weeks; that timestamp only moves on an actual sign-in, so the club's
most active parent could read "3 weeks ago". Option A (surface it as-is) was
rejected for exactly that misreading; C (show both) rejected as clutter.

### Recording

- Migration: `profiles.last_seen_at timestamptz` + RPC
  `public.touch_last_seen()` — SECURITY DEFINER, **no arguments**, stamps the
  CALLER's own row only (structurally cannot touch anyone else's), and
  refuses to move a value younger than 12 hours (server-side throttle).
- Client: one fire-and-forget call when the app starts, throttled to once
  per day per device via localStorage. A failure changes nothing visible.
- **Day granularity is the privacy line.** Coarse enough not to be
  surveillance; enough to answer the admin's question. This is the
  deliberate, admin-only exception to the chat no-stored-presence ruling —
  the dots below stay inside that ruling.
- **Backfill at migration time** from `auth.users.last_sign_in_at` (a true
  "active at least then" floor — measured: 82 of 86 logins have one), so the
  screen is useful on day one and only gets more accurate.

### Display (admin screens only)

- Edit-person sheet: a "LAST ACTIVE" line beside the email block — "Last
  active 26 Aug 2026", same voice as the access rows' "Joined 21 Aug 2026".
- Accounts list rows: appended to the second line ("… · Active 26 Aug") so
  the whole club can be scanned without opening anyone.
- An account with nothing recorded says **"Never signed in"** — never a blank
  (the four real cases are logins that never completed a sign-in).

### Proof

- Harness (rolled back, invented names): the RPC stamps the caller's own row;
  a second call inside the throttle window does NOT move it, with the control
  that a back-dated row DOES; the backfill matches the auth value on a
  fixture user; grants captured (docs:check rule 7).
- Unit: once-a-day client throttle; both renders incl. "Never signed in".

## Half 2 — Presence dots (green / yellow / grey)

The 25 Aug Online feature shipped as one subtitle word in the 1:1 DM header,
visible only while both people are in the app — which is why Jay never saw
it. The channel already broadcasts everything needed; this half is display.

### The states — a dot on the person's avatar, ringed so it reads on photos

- **Green — online:** app open and in the foreground (tab visible).
- **Yellow — away:** app running but backgrounded, or untouched 5+ minutes.
- **Grey — offline:** not connected. Jay chose a grey dot over no-dot: with
  three explicit states, "no dot" no longer ambiguously means either
  "offline" or "the feature broke".
- Presence payloads gain a `state: 'online' | 'away'` field driven by the
  Page Visibility API plus an idle timer; everything stays EPHEMERAL — gone
  when the tab closes, nothing stored, the no-stored-presence ruling intact.

### Where

1. Chat list — DM rows' avatars
2. DM thread header avatar (the subtitle's "Online" word retires — the dot
   replaces it; "Private · you and X" stays)
3. The floating dock's DM rows
4. **Groups get nothing** — a group is not online; inside a thread the
   member line already opens the person card.

### Accessibility

Never colour alone: each dot carries an accessible label ("Online" / "Away"
/ "Offline") — claude/specs/accessibility.md.

### Proof

- Unit: the dot renders the state the presence set reports, all three
  states, labels asserted by role/name; the header stops rendering the
  subtitle word; group rows assert NO dot (the discriminating negative).
- Live after deploy: two real devices, one backgrounds the app → yellow
  within the idle window; closes it → grey.

## Out of scope

- Presence anywhere outside chat (roster, admin screens — the admin fact is
  last_seen_at, not a live dot).
- Any member-facing view of `last_seen_at` ("last seen 2h ago" under a DM
  header is exactly what the chat ruling refused; it stays refused).
- Changing DM rules, the person card, or the ticks.
