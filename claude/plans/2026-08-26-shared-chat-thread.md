# One chat thread everywhere — full parity for the floating dock

**Date:** 26 Aug 2026 · **STATUS: not shipped — spec awaiting Jay's approval; no code yet**

Jay, 26 Aug 2026: the floating dock's chevron menu had only Reply, Copy and
"More in full view" while the full screens carry Delete, Report, Reply
privately, Pin and threads. Asked why the dock can't "function exactly as
the main chat", heard the two options (copy features in and maintain them
twice, or extract one shared thread component both surfaces render), and
chose the proper fix: **the shared component**. His reasoning, verified in
code: the dock is desktop-only (`hidden desktop:flex`, breakpoint 820px in
`tailwind.config.js`), so the phone app never sees it and the small-screen
argument for keeping it thin does not apply.

## The goal, in one sentence

A message in the floating dock and the same message in the full screen are
rendered by the SAME component, so the dock can never again drift behind —
the class of bug that produced the thin chevron menu is removed by
construction, not patched.

## Why this is the right fix (and the arguments against, for the record)

**For:** today there are three renderings of "a chat thread" — 
`src/screens/DirectMessages.jsx` (Thread, ~900 lines of it), 
`src/screens/Chat.jsx` (~550 lines), and `src/components/FloatingChatDock.jsx`
(its own slimmed copy). They already share the data layer and the bubble
(`src/components/ChatBubble.jsx` — the "same shell" pattern this spec
extends upward). Every feature added to a screen since 24 Aug has had to be
re-added to the dock by hand, and the chevron menu is the one that got
missed. One shared thread ends that treadmill.

**Against — considered and answered:**
- *"Just copy Delete and Report into the dock — an afternoon, not a
  refactor."* True, and it was offered. It leaves the drift machine
  running: the next feature (edits, polls, whatever) misses the dock again.
  Rejected by Jay in favour of the permanent fix.
- *"The dock hasn't room for richer UI."* Was believed, was wrong twice
  over: the dock is desktop-only, and squad-channel threads turn out to be
  an INLINE expansion under the message (`src/components/MessageRow.jsx`,
  the `open &&` block) — vertical content in a scrolling list, which fits
  any width. No side panel exists anywhere in chat.
- *"Refactoring the two most-touched screens is risky."* It is, and the
  answer is the phasing below: every phase is behaviour-preserving on the
  screens, lands separately, and keeps the whole suite green before push.

## What "exactly as the main chat" means — scope line

**In scope — message-level parity.** Everything you can do TO a message
must work identically in the dock: reply (quote in DMs/groups, inline
thread in channels), react, copy, delete, report, reply privately, pin
(staff), star, forward, tap-the-author, photo lightbox, read ticks, read
stats, fixture cards, @mentions in channel replies, day dividers,
wallpapers, nicknames.

**Out of scope — chat management stays in the full view.** Rename group,
leave group, delete chat, block, announce-only toggle, wallpaper PICKING
(the dock renders the chosen wallpaper already). These are header-menu
actions about the conversation, not about a message; they are rare, they
open confirm sheets, and keeping them in one place costs nothing because
the dock's expand button is one click. The chevron's "More in full view"
item DISAPPEARS (the menu is complete now); the header's expand button
remains the route to management. If Jay later wants these in the dock too,
they ride the same shared components and it is a small follow-up, not a
re-litigation.

## Architecture: what gets extracted

The pattern is the one `ChatBubble.jsx` already proved: a shared component
owns the rendering and behaviour; the surface (screen or dock) supplies
layout and navigation. Two new shared components, because DMs and channels
are genuinely different beasts (flat list + quotes vs posts + inline
threads):

**1. `src/components/DmThread.jsx`** — extracted from the body of
`Thread` in `src/screens/DirectMessages.jsx`. Owns: loading and realtime
refresh of one conversation, the message list (bubbles, quotes, ticks, day
dividers, unread marker), reactions, the composer (text, photo, quote
reply, emoji), and the per-message actions (copy, delete, star, forward,
report, reply-privately hook). Props:

```
<DmThread
  conversationId={id}
  compact={false}          // dock passes true: tighter paddings, smaller type
  onOpenDm={(profileId)=>…} // surface decides how to navigate to a new DM
/>
```

**2. `src/components/ChannelThread.jsx`** — extracted from the body of
`Chat` in `src/screens/Chat.jsx`. Owns: loading one channel (squad, staff
or club), the `MessageRow` list (inline thread replies, pins, read stats,
fixture cards, report form), reactions, the composer with `MentionPicker`,
and realtime refresh. Props mirror `DmThread`:

```
<ChannelThread
  kind="squad"|"staff"|"club"
  teamId={teamId}          // null for club
  compact={false}
  onOpenDm={(profileId)=>…}
/>
```

**The screens become chrome around these.** `DirectMessages.jsx` keeps the
conversation list, the header, and the management sheets (rename, leave,
block, delete chat, wallpaper picker, forward destination sheet — the
forward SHEET stays screen/dock-local but the "start forwarding" action is
in the shared thread). `Chat.jsx` keeps the channel tabs, header,
announce-only and clear-chat. The dock keeps its list, resizer and header,
and swaps its entire hand-rolled thread rendering — bubbles, menu, quote
banner, composer, photo picking — for the two components above.

**Data functions do not move.** `src/data/messages.js` and friends are
already shared; this refactor touches rendering only. No migration, no RLS
change, no deploy-time risk beyond the JS bundle.

## Design decisions a builder must not re-open

1. **Two components, not one.** A single `ChatThread` switching on kind
   would carry every prop of both worlds and satisfy neither — the exact
   shape `MessageRow`'s header comment warns about. The shared layer below
   them (`ChatBubble`, `MessageMenu`, wallpaper, lightbox) is where the
   common ground already lives.
2. **The components load their own data.** A pure-props version pushes the
   loading/subscription code back into every surface — recreating the
   drift this spec exists to kill. The harness keeps its stubs: it stubs
   the data layer, not the components.
3. **`compact` is a display hint only.** It may shrink paddings and hide
   read-stats detail; it must never remove a menu item or a capability.
   Capability differences are what caused this spec.
4. **Overlays (report already inline; forward sheet, lightbox) render as
   normal app-level overlays** even when triggered from the dock. `Sheet`
   is a fixed-position portal; on a desktop screen a sheet over the page
   is fine and needs no dock-sized variant.
5. **No real names in fixtures or docs** — rule 9. Invented names only,
   in the harness stubs and in every example this work produces.

## Phasing — each phase is one PR, shippable, whole suite green

**Phase 1 — extract `DmThread`, screens unchanged in behaviour.**
Move the thread body out of `DirectMessages.jsx`; the screen renders
`<DmThread>`. Pure refactor: every existing `tests/chat-*.test.jsx` and
DM test must pass UNCHANGED — the tests are the proof the extraction
preserved behaviour. New tests: none needed beyond a mount test.

**Phase 2 — the dock adopts `DmThread`.**
`FloatingChatDock.jsx` renders `<DmThread compact>` for `dm` and `group`
rows; its own bubble/composer code for those kinds is DELETED (tombstone
comment pointing here). New discriminating tests in
`tests/floating-dock.test.jsx`: the dock's chevron menu now carries
Delete on own messages and Report on others' (assertions that FAIL against
today's three-item menu — run them against the pre-phase dock to prove
they discriminate, per the testing rule); forward and star reachable;
ticks render. The dock's quote-reply tests keep passing via the shared
composer.

**Phase 3 — extract `ChannelThread`, screens unchanged in behaviour.**
Same shape as phase 1, out of `Chat.jsx`. Existing channel tests pass
unchanged.

**Phase 4 — the dock adopts `ChannelThread`.**
Dock renders it for `squad`, `staff` and `club` rows; remaining dock
thread code deleted. Discriminating tests: inline thread replies open and
send from the dock (fails against today's dock, which sends channel
replies to the full view); pin appears for staff; report form submits.
"More in full view" leaves the chevron menu in this phase.

**Phase 5 — sweep and record.**
Delete any now-dead dock helpers, update `claude/changelog.md` and
`claude/state-of-play.md`, flip this file's STATUS, and note in
`claude/open-items.md` if anything was deliberately left (e.g. management
actions in the dock). Run the harness screenshots that cover chat so the
parent-facing guides still match reality.

Order matters: 1→2 proves the whole pattern end-to-end on the richer
surface (DMs) before the channel work starts; if phase 2 surfaces a bad
seam in the component boundary, it is corrected before it is copied.

## Testing and verification contract

- Before any push: `npm install --include=dev`, full `npm test` (~40s),
  `npm run docs:check`. While editing: `npm run test:watch`.
- Every NEW assertion is proven against an injected fault (run it against
  the pre-refactor dock, or comment out the feature, and watch it fail).
- After each production deploy: verify live on adhquins-clubhub.com —
  open the dock, exercise one action the phase added (e.g. delete an own
  test message in a DM), and read the RESPONSE if anything errors.
- Existing tests are the behaviour contract for phases 1 and 3: they must
  pass WITHOUT EDITS. A phase-1/3 change that needs a test edit is a
  behaviour change and stops for review.

## Cost note

Five phases merged separately is five production deploys at 15 Netlify
credits each (75 total). Jay's ruling of 11 Aug stands ("not really
expensive") — do not stall the work over this — but phases MAY be paired
into fewer PRs (1+2, 3+4, 5) if review comfort allows, halving the
deploys. Each PR to `main` still needs Jay's explicit yes; a stop hook
asking is not Jay asking.

## Risks

- **Highest-traffic screens.** DirectMessages.jsx and Chat.jsx carry most
  of the app's recent bug-fix history (see `claude/changelog.md`, 24–26
  Aug). Mitigation is the phasing, the unchanged-tests contract, and live
  verification per phase.
- **Realtime double-subscription.** The dock and an open full screen can
  both mount a thread for the same conversation. Today their hand-rolled
  loaders already coexist; the shared components must keep subscriptions
  self-contained (subscribe on mount, unsubscribe on unmount) so two
  mounts are merely two listeners, never a fight.
- **Read receipts fire from the dock.** Once the dock renders the real
  thread, opening a DM in the dock marks it read (ticks go blue for the
  sender) exactly as the full screen does. That is parity working — noted
  here so nobody files it as a bug.
