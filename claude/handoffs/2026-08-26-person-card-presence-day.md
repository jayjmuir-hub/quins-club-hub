# Handoff — 26 Aug 2026: the person card, last active, presence dots

Session record. History, not instruction — read `claude/state-of-play.md`
and the changelog for current truth.

## Shipped today by this session (all squash-merged, all verified live unless noted)

- **#434 `abef0d7` — the person card.** Tap any adult's name anywhere →
  contact card (Call/WhatsApp/Email/Chat). Ruling C recorded in
  `claude/decisions/2026-08-26-staff-contacts-club-wide.md`. Two migrations
  applied (`member_contact_card`, `_dedupe`).
- **#435 `f7dce1c` — follow-ups from Jay's first minutes.** Squad-name
  dedupe (server-side, re-verified on the live card); the Edit-person sheet
  gained the contact row (Chat verified live: one tap → DM).
- **#438 `6f9bbe7` — last active + presence dots.** `profiles.last_seen_at`
  (backfilled 82 rows, VERIFIED live on /admin/accounts — Jay's own row
  said "Active 26 Aug" minutes after deploy) + three-state dots.
- **#441 — OPEN at handoff.** The list-dot pairing fix (thread header was
  green while list rows sat grey; `listMyConversations` returns the INBOX
  shape and the pairing read table columns). Locally 9/9 green; **first CI
  run failed on the new chat-list test with provider errors that do not
  reproduce locally — rerun in flight at handoff.** Jay's standing
  instruction: merge when green. ⚠️ After it merges, the NEXT PR cites its
  squash SHA for the changelog's "(unmerged)" entry.

A parallel session shipped #433, #436, #437, #439, #440, #442 the same day;
coordination was by cross-session messages and it worked — five conflicts,
all resolved by composition, none by picking a side.

## What is NOT yet verified

- **The dots live, end to end.** Verified: thread-header dot green for a
  connected account (both directions). NOT verified: list dots after the
  #441 fix (blocked on its merge), the yellow away-state on a real
  backgrounded phone, and grey on close. Jay now has his yahoo admin
  account signed in on his phone for exactly this walk.
- **`touch_last_seen` at the 12h boundary in the wild** — harness-proven
  only.

## Traps found today, for whoever meets them next

- **Postgres freezes `now()` per transaction.** A throttle assert comparing
  an immediate re-touch PASSED against the injected fault (identical
  timestamp). Back-date the fixture instead. Written into
  `db/tests/last-seen.sql`.
- **`listMyConversations()` is the `my_conversations` RPC** —
  `{ conversation_id, other_id, … }`, not conversation-table rows. The
  screen-level test in `tests/chat-list.test.jsx` now guards the shape.
- **Component tests cannot catch pairing bugs.** The dot component was
  fully tested and the feature still shipped broken — the screen-level test
  with the RPC's real row shape is the discriminating kind.
- **Jay's yahoo reset mail was filtered by his own Yahoo rule** — the whole
  send chain (hook → send-email → Resend, all 200s) was innocent. Read the
  auth logs before suspecting the stack; they name the failing half in
  seconds.
- **A background `until`-loop that greps with `jq` dies silently if `jq`
  is not on that shell's PATH** — it spun forever while the PR sat CLEAN.
  Watchers built from plain grep survived.

## Open questions parked for Jay

- Yahoo deliverability generally: his reset mail was his own filter, but
  Yahoo-hosted parents may still junk club mail — worth a Resend dashboard
  glance someday, not an incident.
