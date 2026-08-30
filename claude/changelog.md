# Changelog

Newest first. One line per shipped change, with the commit. Detail belongs in the commit
message and in `RESTORE.md`; this is the index.

⚠️ **This file stopped at 4 Aug for three days while `CLAUDE.md` advertised it as "what
changed, when".** Backfilled from `git log` on 7 Aug 2026 — the 5 to 7 Aug entries below
are one-liners taken from commit subjects, so they are accurate but thinner than the
hand-written 4 Aug ones. **Add the entry in the same breath as the commit.**

## 30 Aug 2026

- **Grok item 14 SHIPPED — `db/schema/policies.sql` re-captured to match
  live.** The 28 Aug admin-rights redesign turned four surfaces into real
  allowlist boundaries and this capture had lagged them by two days — the
  exact drift `db/schema/` exists to catch. Re-captured verbatim from
  `pg_get_expr`: `player_contacts` / `player_parents` / `player_private`
  (read/edit pairs → four per-verb policies on the S2 contacts allowlists),
  `players` "player edit" (→ `can_write_child` OR squad staff, S1), the
  `player-photos` storage read/write (→ the S3 photos allowlists), and
  `welfare_access_log` "welfare log read" (`is_admin` → super + welfare,
  Phase 4). No live change — the database was already this; only the file
  moved. Closes the last of item 14 (the `pitch_occupancy` signature was
  recaptured in the PR-3 merge, `chat_media_owner` pinned by #552).
  `db/schema/policies.sql`. (SHA follows in the next changelog-touching PR.)
- `55d25e5` — **Grok items 10, 11 & 12 SHIPPED — the push/mail pipeline stops trusting
  its callers.** Item 12 (SSRF): `register_push_subscription` allowlists the
  endpoint — https + real push services only, built from the hosts measured
  live (Apple 25, FCM 12, one legacy jmt17.google.com, plus the Mozilla and
  WNS families) — so a member can never aim push-send's signed POSTs at
  `http://169.254.169.254/`; push-send carries the same allowlist before its
  fetch. Item 11 (body-trust): squad-push copy travels through a new
  `public.push_outbox` table — the HTTP body carries only the id, push-send
  renders from the row and consumes it (single-use, replay-inert; the row is
  also the cancellation tombstone) — and availability nudges are re-derived
  from `event_id`; holding the shared secret no longer writes lock-screen
  text. Item 10 (open relay): signup nudges travel as profile ids; the
  function loads addresses itself, refuses email-bearing bodies, caps at
  100. Item-15 core: `supabase/config.toml` pins `verify_jwt=false` for all
  eleven functions; both touched functions hash-both-sides and check POST.
  Applied + deployed (push-send v12, notify-unfinished-signup v2); allowlist
  harness red-then-green with a revert self-test; outbox proven LIVE with a
  zero-audience probe (row → id-only POST → consumed → 200).
  `db/migrations/20260830_push_hardening.sql`,
  `db/tests/push-endpoint-allowlist.sql` (new), `supabase/config.toml`
  (new), `supabase/functions/push-send/index.ts`,
  `supabase/functions/notify-unfinished-signup/index.ts`, `db/schema/*`.
- `bcacf6c` — **One transient blip no longer paints "Couldn't load your account".** Jay's
  phone showed it with "JWT issued at future"; the phone's clock was proven
  EXACT against the server, and the edge logs held exactly ONE 401 at that
  second — a freshly refreshed token judged by a Supabase gateway node whose
  clock ran milliseconds behind the minting node. Sub-second, self-healing —
  and the provider turned it into a full-page error card. The account load now
  makes ONE quiet second attempt ~900ms later (covering ordinary pitch-side
  network blips too); a second failure is a real outage and still gets the
  honest card. `src/lib/memberships.jsx`, `tests/memberships.test.jsx`.
- `a736d0c` — **Grok items 6 & 16 SHIPPED — children's private data leaves the PWA disk
  cache, and the ICS UID is ruled frozen.** `isCacheableRestGet` excludes
  `messages`, `player_private`, `player_contacts`, `player_parents` and
  `poll_votes` by TABLE (D3: all five — offline use is a non-goal, and no
  variant of children's chat, DOB or named votes belongs on a stolen
  unlocked device); NetworkFirst still serves them online. Pinned in the
  unit test AND against the built `sw.js`. Item 16 half-and-half: the
  missing `navigateFallbackDenylist` build assertion is added (measured in
  the worker: `denylist:[/^\/calendar\.ics$/]`), and the UID domain stays
  FROZEN on the retired alias after a peer-review catch — changing it would
  duplicate the season in 13 subscribed calendars (13 live tokens,
  measured); RFC 5545 treats it as opaque. D4 default: notes stay.
  `pwa-cache-rules.js`, `tests/pwa-cache-rules.test.js`,
  `tests/pwa-build.test.js`, `supabase/functions/calendar/index.ts`
  (comment only).
- `c2554eb` — **Grok item 7 SHIPPED — the UI reads the child-PII allowlists that already
  gate the data.** New client mirrors of the 28 Aug RLS boundaries:
  `canWriteChild`, `canSeeChildPhotos`, `canEditChildPhotos`,
  `canWritePlayer` (the "player edit" policy: write allowlist for admins,
  active squad staff otherwise) and `canReviewDm` (explicit `welfare`, NO
  super short-circuit — the one right adminRights() must not imply).
  PlayerForm and Roster gate player editing on `canWritePlayer`, so a
  pitches-only admin stops seeing forms whose every write fails at RLS; the
  Welfare portal greys for a super who has not self-ticked welfare (post-#556
  their screens would be empty); the stale "rights gate screens, not data" /
  "any admin can read a DM" doctrine comments now tell the post-Phase-4
  truth. Invisible to every current admin — all hold `clubadmin`, which is
  in every allowlist, pinned by fixture. `src/lib/scope.js`,
  `src/lib/portals.js`, `src/screens/PlayerForm.jsx`,
  `src/screens/Roster.jsx`, `tests/super-admin.test.js`,
  `tests/admin-portals.test.jsx`, `tests/sidebar-submenu.test.jsx` + fixture
  files.
- `fe07419` — **Grok item 4 SHIPPED — staff edit-gates require an ACTIVE membership.**
  `canEditTeam`'s squad-staff arm and Roster's `canEditAnything` gain the
  `isActiveMembership` check the SQL `can_edit_team` has always had, so a
  self-registered PENDING coach no longer sees edit controls whose every
  write fails at RLS (dead controls, no leak). `visibleTeams` keeps pending
  squads visible per D6 — visibility is not capability — and says so;
  `isOwnPlayer` documents its deliberate status-blindness (mirrors the SQL).
  Every staff fixture in tests/ that omitted `status` gains `'active'`: the
  column is NOT NULL, so the status-less shape never existed in production
  and was exactly what let the old gate look correct.
  `src/lib/scope.js`, `src/screens/Roster.jsx`, `tests/scope.test.js` and
  eleven fixture files.
- `74bd367` — **Grok items 5 & 9 SHIPPED — silent-refusal chat writes throw, and view-as
  stops skipping the welfare audit.** `deleteConversation` and
  `resolveReport` gain the `.select('id')` + zero-rows-throws guard
  `removeMessage` already carried — an RLS refusal came back as
  success-with-no-rows and the screens reported "deleted" / "resolved" while
  nothing happened. `useDmThread` keys `admin` on `realMemberships`, so an
  admin previewing as a parent who opens somebody's DM still gets the review
  banner and still writes the `welfare_access_log` row (reads run as the
  real `auth.uid()` throughout a preview). New hook test pins all three
  directions. `src/data/messages.js`, `src/lib/useDmThread.js`,
  `tests/messages-data.test.js`, `tests/dm-thread-view-as.test.jsx` (new),
  `tests/direct-messages.test.jsx`.
- `81a1536` — **Grok item 8 SHIPPED — the club's last active admin can be neither demoted
  nor deleted.** `updateMembershipRole`/`deleteMembership` are direct table
  writes with no RPC chokepoint, so the guard is a `BEFORE UPDATE OR DELETE`
  trigger (`private.guard_last_admin`, P0001) firing only on the exact
  last-active-admin transition; team moves, rights edits and non-last
  demotions pass untouched, and `Accounts.jsx`'s `LAST_ADMIN_REFUSAL` stays
  as the friendly first line. Applied to prod; harness red pre-apply, green
  after, with a dropped-trigger self-test proving the checks bite.
  `db/migrations/20260830_last_admin_guard.sql`,
  `db/tests/last-admin-guard.sql` (new), `db/schema/triggers.sql`,
  `db/schema/functions.sql`.
- `68388c4` — **"Reply privately" reaches the nested replies.** It has lived on others'
  top-level posts in every channel and in groups since 25 Aug; the bubbles
  INSIDE a channel thread were the one surface without it, so the person who
  answered in a thread could not be taken private from where they spoke
  (Jay, 30 Aug 2026). Same quote-into-a-DM behaviour, same rule: whether the
  DM is allowed stays open_conversation's call. `src/components/
  MessageRow.jsx`, `tests/message-edit-and-emoji.test.jsx`.
- `ecc1484` — **Grok item 1 & 2 SHIPPED — the welfare directory and DM/group reports move
  behind the explicit `welfare` grant.** `welfare_overview()` gated on
  `private.can_review_dm` (was `is_admin` — a pitches-only admin could
  enumerate every reviewable child conversation by calling the RPC; measured
  pre-fix: 33 rows). `message_reports` read/resolve SPLIT BY CONTEXT (Jay's
  ruling, 30 Aug): a report on a conversation message (DM/group) is
  welfare-only, a report on a channel message stays any-admin — mirrors the
  reported-message arm of "message delete" — and the reporter keeps sight of
  their own. New classifier `private.report_on_conversation` (SECURITY
  DEFINER: the split must be decidable by admins who may not read the
  message). Applied to prod and proven by injected fault both ways: harness
  red pre-apply, green post-apply, rolled back clean, and Jay already holds
  `welfare` so nothing went dark.
  `db/migrations/20260830_welfare_review_gate.sql`,
  `db/tests/dm-review-welfare.sql` (extended: overview gate, report split,
  self-test 2), `db/schema/policies.sql`, `db/schema/functions.sql`.
- `6f49559` — **The head-coach TITLE and FLAG are linked on the staff screen — offer one
  way, fill the other.** Two real coaches sat titled "Head Coach" with the
  flag off, silently outside the approval emails and the Club Head Coaches
  channel (both flagged by hand the same evening). The ruling "a title is
  never permission" stands: a title claiming the job with the flag off draws
  an advisory nudge whose one tap ticks the box — the TAP grants, never the
  typing. The free direction: ticking the flag fills an EMPTY title with
  "Head Coach"; a custom title is never overwritten, and a failed fill is a
  missing label, not a broken flag. `src/screens/AdminStaff.jsx`,
  `tests/admin-staff.test.jsx`.
- `4da1d26` — **Edit your own messages, emoji-only bubbles render BIG, and the managers
  channel is "Club Age Group Managers".** Three at once, all in the SHARED
  chat components so every surface (channels, replies, DMs, groups, the dock)
  moves together. Edit: author-only inside the database's 15-minute rule
  (private.touch_message — canStillEdit merely draws the door), one
  MessageEditor rendering in place of the bubble, the existing "(edited)" tag
  finally reachable. Big emoji: 1–3 pictographic glyphs sized up
  WhatsApp-style, counted as grapheme clusters (a skin tone or 👨‍👩‍👧 is ONE
  glyph; a digit is Emoji-but-not-pictographic and stays text). Rename: label
  only — the 'managers' key survives everywhere so nothing already posted is
  stranded; my_chats replaced in production and verified live.
  `src/components/MessageEditor.jsx` (new), `ChatBubble.jsx`,
  `MessageRow.jsx`, `DmThread.jsx`, `ChannelThread.jsx`,
  `src/lib/useChannelThread.js`, `useDmThread.js`, `roleChannels.js`,
  `scope.js`, `src/data/messages.js`, `src/lib/messageEdit.js` (new),
  `db/migrations/20260830_rename_managers_channel.sql`,
  `tests/message-edit-and-emoji.test.jsx`.
- `b626891` — **Re-validated the Grok full-sweep against current `main` (docs only).** After
  ~20 PRs merged (pitch rework, role channels #550/#551, hygiene #552), all
  findings still substantively stand except item 14's `chat_media_owner` pin
  (fixed by #552, proven live). Recorded the shifts in `claude/open-items.md`
  and the plan: item 3 is now Pitch-Glance-only (Allocation was incidentally
  fixed), item 2's fix is no longer a flat `is_admin → can_review_dm` swap (role
  channels made report-handling an admin duty), and role channels added a bounded
  `message_reports` metadata/deletion surface. Items 1 & 2 re-confirmed live
  (`welfare_overview` / `message_reports` still `is_admin`). No code changed.
  `claude/open-items.md`, `claude/plans/2026-08-30-grok-sweep-remediation.md`.
- `9d71fb7` — **THE HARNESS AND THE TEST SUITE STOP TALKING TO PRODUCTION — measured, not
  assumed.** Supabase's dashboard showed ~94k requests/24h at a 21% success
  rate; the failures traced to Jay's own machines running this repo's tooling:
  un-stubbed data modules in the screenshot harness (whose alias list stubs
  one module at a time, and whose own comments predicted the escape) and
  unmocked data modules in long-lived vitest processes, all firing the app's
  stub fixture ids at the LIVE database. RLS refused every call — noise, not
  disclosure. Three fixes: `harness/stubs/supabase.js`, an inert Proxy client
  aliased under every un-stubbed module so the harness's "no network" promise
  stops depending on the alias list being complete (verified live: scenarios
  render on stub data, zero `*.supabase.co` requests); a quiet-fetch in
  `src/test/setup.js` that rejects any test fetch to a Supabase host (the
  QuietWebSocket pattern one layer down; integration mode exempt; promises
  only network silence, per the 11 Aug tombstone about explanatory guards);
  and `db/migrations/20260830_pin_private_helper_search_path.sql`, pinning
  `search_path` on `private.squad_expects_gender` and
  `private.chat_media_owner` — the security advisor's only two genuine
  findings among 57 (the ~52 SECURITY DEFINER warnings are the app's access
  model working as designed). Migration applied to production and proven by
  `db/tests/private-helper-search-path.sql` (control first, then the pin,
  then both helpers still answering correctly). `harness/vite.config.js`,
  `tests/harness-stubs.test.js` — whose alias-count guard caught its seventh
  unregistered alias, this once fixed in the same change.
- `eda9774` — **Members appear UNDER the channel name — the header is the door.** Jay,
  minutes after role channels shipped: "they don't appear under the channel
  name, need to click the 3 dots". Role channels and squad STAFF channels now
  wear their member line as the subtitle, WhatsApp-style ("You, Aran,
  Bruno…" — first names, You first), matching what groups already did; the
  title/subtitle block is now a button that opens the member sheet (ChatHeader
  gains `onInfoClick`). The squad channel keeps its count (forty first names
  is noise) and the club channel its wording (its sheet is admin-only). The ⋯
  "View members" entry stays — two doors, one room. `src/components/
  ChatHeader.jsx`, `src/screens/Chat.jsx`, `tests/chat.test.jsx`.
- `4daaaec` — **ROLE CHANNELS — five club-wide chats whose membership is derived from
  roles, never stored.** Jay: group chats for staff circles without a
  hand-ticked list that goes stale. Club Head Coaches (head-coach flag), Club
  Managers, Club Medics, Welfare (the existing `welfare` grant IS the
  membership — deliberately not all admins), Club Staff (any staff role).
  Admins enter the first three only by a per-admin tick — three new
  `chat-*` admin rights in the existing super-only, audited editor. One
  helper (`private.in_role_channel`) answers membership for all four messages
  policies, `can_reply_to` and `my_chats`; its enumerating twin feeds the
  mention filter and the new **member sheet** — every channel's header now
  offers "View members": who is in, WHY they are in ("Head coach — U10
  Mixed"), tap to start a DM. The club channel's sheet is admin-only (names
  stay squad-scoped for everyone else, as the privacy policy promises).
  Migration applied to production and proven by a new 14-step harness run
  live and rolled back (`db/tests/role-channels.sql`) — every refusal beside
  the access it guards. The re-capture also caught `set_message_provenance`'s
  capture missing the 25 Aug group-chat rewrite; corrected.
  `db/migrations/20260830_role_channels.sql`, schema captures,
  `src/lib/roleChannels.js`, `src/components/ChannelMembersSheet.jsx`,
  `src/lib/useChannelThread.js`, `src/screens/Chat.jsx`,
  `src/screens/ChatList.jsx`, `src/data/messages.js`, `src/lib/scope.js`,
  `tests/role-channels.test.jsx`, plan
  `claude/plans/2026-08-30-role-channels.md`.
- `751671e` — **The privacy policy tells the truth about older players, and gains a security
  section.** The Children section said "a child does not sign in" — false since
  11 Aug, when U13+ self-registration went live; a parent (Jay's report) read it
  against reality. It now says younger children do not sign in, U13+ may hold
  their own account with a parent or carer still on record (club practice — the
  app advises but does not yet enforce the parent row), and no account sees
  anything before club approval. New "How we protect it" section states the real
  measures — RLS enforced in the database, the pending-approval model, encrypted
  transit, daily backups, live monitoring — each checked live before being
  written down, no guarantees claimed. The pinning tests now pin the corrected
  facts and the security claims. `src/screens/Privacy.jsx`,
  `tests/account-deletion.test.jsx`.
- `f19c99c` — **The duplicate-registration guard is ACCENT-BLIND — a cedilla defeated it and
  put one U10 child on the roster twice.** Both parents of one child registered
  separately; the second spelt the surname with a `ç`, and the 20260814 guard's
  match key keeps `ç` (deliberately — `[[:alnum:]]` so non-Latin names survive),
  so the keys differed by one character and the "already registered" refusal
  never fired. `private.name_match_key` now folds diacritics via
  `extensions.unaccent` (explicit-dictionary form, since the function pins an
  empty search_path) — measured on the live rows before and after: the two
  spellings now produce one key, Arabic names pass through untouched. One
  function, three guards fixed at once: register_my_player's duplicate and
  self-name checks plus the pre-signup duplicate check. Migration applied to
  production and the `registration-guards` harness extended with the diacritic
  step (9 steps, all green, rolled back).
  `db/migrations/20260830_name_match_key_accent_blind.sql`,
  `db/tests/registration-guards.sql`, `db/schema/functions.sql` re-captured from
  live. The duplicate pair itself is a separate club decision, not a migration
  side effect — reconciled the same day on Jay's instruction: the second
  parent's access repointed to the original child row, contact email moved, the
  empty duplicate deleted, zero orphans (verified live).
- `a678263` — **The shared pitch picture is now DRAWN NATIVELY on a canvas — crisp text at
  any size, no html2canvas.** The 11px/widen fix below made the labels legible
  but still rough: html2canvas re-implements its own text renderer and fuzzes
  small glyphs however big you make them. The Share button now draws the day and
  week pictures with the browser's own text engine (`fillText`/`fillRect`) from
  the same occupancy model the on-screen card renders, so squad codes and
  club-wide titles export sharp. The palette and the club-wide vs squad label
  rules moved to a shared module so the two renderers can't drift; the DOM card
  stays for the on-screen "visual representation". Verified live in the harness by
  rendering the real export (`U12G`/`U14G`/`U14B` sharp where they were dashes).
  New `src/lib/pitchShareCanvas.js`, `src/lib/pitchShareStyle.js`; the sharing tail
  of `src/lib/shareImage.js` split into a reusable `shareCanvas`;
  `src/screens/Allocation.jsx`, `src/components/PitchShareCard.jsx`,
  `tests/pitch-share-canvas.test.js`.
- `b236710` — **The shared pitch picture is legible — the real cause was a too-small font.**
  #545 guessed the dashes came from negative letter-spacing and removed it; that
  did NOT fix it (verified by exporting the card in the harness and reading the
  pixels): html2canvas simply does not render text at ~8px — it collapses tiny
  glyphs to dashes, while the black `D2` (11px) and red time (9.5px) rendered
  fine all along. So the compact week codes are now **11px**, and the week share
  card is **widened** (1180→1540px) so `U12G`/`U14G` still fit a quarter bar at
  that size. The on-screen card gains bigger, clearer labels; the export finally
  reads as text. `src/components/PitchShareCard.jsx`.
- `8e78c2b` — **First attempt at the dashes: removed the compact bars' negative
  `letter-spacing`.** A real html2canvas hazard, but not THIS bug's cause — the
  labels still exported as dashes; see the font-size fix above.
  `src/components/PitchShareCard.jsx`.
- `cd59f9f` — **Club-wide events are editable again, and a long one no longer wrecks the
  pitch picture.** Two faults in the whole-club feature Jay hit: (1) clicking a
  club-wide event showed NO edit option — `canEditTeam` deliberately refuses a
  null team (an unresolved squad id), which now also described a real club-wide
  event, so it was silently uneditable. New `canEditEvent` lets an admin edit a
  squad-less event (mirroring the RLS policy), and EventForm opens one on "Whole
  club" so a save can't reassign it to a squad. (2) A long club-wide TITLE on the
  week share picture grew its own day column and stole width from the other six,
  shrinking every label to dots — the `repeat(7, 1fr)` grid sized columns to
  their content. `minmax(0, 1fr)` caps each column, and the club title is length-
  capped, so a long one just clips inside its own day. `src/lib/scope.js`,
  `src/screens/EventForm.jsx`, `src/screens/Schedule.jsx`, `src/screens/Dashboard.jsx`,
  `src/components/PitchShareCard.jsx`, and their tests.
- `1ca802f` — **A club-wide booking reads its own TITLE on the pitch layout.** Following the
  "Club" fix below, Jay wanted the whole-club booking to say what it is — "Adult
  Tag" — not a generic "Club". A squad-less event now labels by its event title
  (falling back to "Club" if untitled), and the tight week columns no longer clip
  it to a first word the way they abbreviate a squad code; the segment's
  `overflow:hidden` + ellipsis keeps a long title from ever spilling.
  `src/lib/pitchOccupancy.js`, `src/components/PitchShareCard.jsx`,
  `tests/pitch-diagram.test.js`.
- `a1479b0` — **The Allocation screen opens on the week, and Week → Day no longer jumps to the
  last day.** Two things off Pitch Management (Jay): the screen now opens on the WEEK
  — the planning horizon it is opened for — rather than the month; and switching from
  Week to Day now opens the FIRST day of that week (its Monday) instead of the last.
  Paging weeks shifts the anchor by 7 from today, so it usually sat on a Sunday, and
  switching to Day jumped there. `src/screens/Allocation.jsx`, `tests/allocation.test.jsx`.
- `b102084` — **A club-wide booking reads "Club" on the pitch layout, not "A".** A whole-club
  social given a pitch showed up on the Allocation pitch-layout picture with no
  squad, so it fell back to "A squad" — which the share card abbreviated to a bare
  "A" (Jay). A squad-less booking now labels as "Club" there and in the "Shared
  pitches" bar. `src/lib/pitchOccupancy.js`, `tests/pitch-diagram.test.js`.
- `83eab00` — **Tidied the pitch-layout picture, and told coaches it's already saved.** Following
  the first cut: squad codes on the tight week bars sat against the segment dividers,
  so each now has side padding and a single-line ellipsis fallback, the week card
  widened so codes like `U12G`/`U14G` fit whole, and the columns got more air (Jay:
  "text is touching lines"). Both cards also carry a note — coaches and managers are
  told the pitches shown are already saved to each squad's training session, so the
  picture is not a to-do. `src/components/PitchShareCard.jsx`.
- `ceaa0d5` — **Whole-club events — one social on every calendar, all season.** An admin can
  now add an event for the WHOLE CLUB, not a single squad: "Adult Tag, every Wed,
  open to everyone" (Jay). It is a new scope — `team_id NULL` — visible to every
  active member and repeatable as an ordinary series, so a season is ~30 rows,
  not the hundreds a 15-squad fan-out would be. It SIDESTEPS the 5 Aug "no
  multi-squad + repeat" guard rather than reversing it: a club-wide event is one
  event, so nothing multiplies. Admin-only, and only for a social — the "Whole
  club (everyone)" option appears in the Age group picker for an admin on a
  social. Informational (no roster, no player RSVP — the availability section is
  hidden for it); person-based RSVP is a later feature. Every fixture surface
  reads "Whole club" where a squad name would go, and the calendar feed emits it
  too. ⚠️ **Needs the migration applied first:**
  `db/migrations/20260830_club_wide_events.sql` makes `team_id` nullable, adds
  `private.is_member`, widens the two `events` policies and the feed function.
  `src/screens/EventForm.jsx`, `src/screens/EventDetail.jsx`, `src/data/events.js`,
  `src/screens/Schedule.jsx`, `src/screens/Dashboard.jsx`, `src/components/DaySheet.jsx`,
  `src/components/ScheduleTable.jsx`, `claude/decisions/2026-08-30-club-wide-events.md`,
  and their tests.
- `3ece798` — **A shareable pitch-layout picture for the day and week.** The Allocation screen
  showed WHERE bookings were but had no friendly "draw me the ground" view — each
  shared pitch carved into the portions its squads take, the spare its own segment
  (Jay). New "Pitch layout" card, shown for the Day and the Week above the grid,
  with a Share button that photographs it via the existing `shareElementAsImage`
  (native file-share on a phone, PNG download on desktop — the match sheet's
  route). The occupancy maths moved to `src/lib/pitchOccupancy.js` (extracted from
  `src/components/PitchCalendar.jsx`, no behaviour change) so the picture and the
  "Shared pitches" bar read the same numbers. `src/components/PitchShareCard.jsx`,
  `src/screens/Allocation.jsx`, `harness/main.jsx`, `tests/pitch-diagram.test.js`,
  `tests/pitch-share-card.test.jsx`.
- `4e6ed59` — **Coaches can duplicate a session straight from Squad Hub.** Duplicate was
  deliberately kept off Squad Hub and left on the Full schedule, but coaches and
  managers run their squad from this page — so "re-run last week's session" meant
  leaving for another screen with no signpost, and read as though they could not
  duplicate at all (Jay). The Duplicate action now shows on Squad Hub's event
  sheet, opening the same EventForm in duplicate mode (which, per the duplicate
  rules, resets the pitch to Pitch TBD). Delete stays on the Full schedule,
  unchanged, so it is not confused with clearing the training plan / hour.
  `src/screens/SquadHub.jsx`, `tests/squad-hub-event-sheet.test.jsx`.
- `54c7e01` — **The pitch portion is now staff-only, and reads "sharing ⅓".** #534 put the
  portion on the event's Pitch row for everyone, and "D3 · Third" was confusing —
  it read like a second pitch, and a parent has no use for how the ground is
  carved up (Jay). A coach or admin now sees `D3 · sharing ⅓` — the fraction
  glyph, framed as sharing so it's unambiguous — only when the booking takes part
  of the pitch; a whole pitch (full or unset) shows just `D3`. A parent or player
  (no `canEdit`) sees just the pitch, so the pitch-management detail that only
  reads as noise to them is gone. Gated on the `canEdit` the sheet already
  carries; the staff-only pitch calendars are unaffected. `src/screens/EventDetail.jsx`,
  `tests/event-detail-series.test.jsx`.
- `1472a11` — **Duplicating an event no longer inherits the original's pitch.** A duplicate
  opened with the source fixture's pitch pre-filled and saved it silently, re-booking
  that pitch on the new date without going through allocation — the clash invisible
  until two squads turned up on the same grass (Jay). A duplicate now opens at
  `Pitch TBD` ("not allocated yet", the marker the Allocation screen lists as
  unallocated) and must be given a pitch afresh; the portion resets with it (a split
  with no pitch saves null). Reverses the 12 Aug choice to carry the pitch as "part
  of the work" — a pitch is a dated booking, not a fixture detail.
  `src/screens/EventForm.jsx`, `tests/duplicate-event.test.jsx`.
- `e3ca6af` — **The pitch calendar reads pitch by pitch, and shows the portion.** Four things
  Jay asked for on the pitch-management calendar: (1) a booking in the WEEK view
  now opens its details on click, the same details-first tap the day grid uses;
  (2) the MONTH view lists the fixtures instead of a count and a dot ("just
  showing dots"), the same change the Schedule month took in #524 — first few
  then "+N more", the cell still a button to the day; (3) every assignment shows
  how much of the pitch it takes — ¼/⅓/½/full — in the day grid, the week, the
  month and the event detail sheet; (4) the WEEK view groups each day BY PITCH,
  a heading per pitch and the fixtures on it sorted youngest age group first,
  instead of one undifferentiated pile. New `portionShort` in
  `src/lib/pitchPortion.js`; `src/components/PitchCalendar.jsx` (new `byPitch`,
  reworked week/month), `src/screens/Allocation.jsx`, `src/screens/PitchGlance.jsx`,
  `src/screens/EventDetail.jsx`, and `tests/pitch-week-grouping.test.js`,
  `tests/allocation.test.jsx`, `tests/pitch-glance.test.jsx`,
  `tests/event-detail-series.test.jsx`.
- `fad3ef9` — **A pitch can be booked as a third, not just a quarter/half/full.** Three
  squads sharing one pitch each take a third, and there was no way to say so — a
  third had to be rounded to a quarter or a half, which then mis-read as a clash
  or as free space (Jay). `third` (1/3) joins the portion picker between quarter
  and half. It is the first non-dyadic portion, so its sums are not exact in
  floating point — three thirds are 0.999… — but the capacity detector already
  carried an EPSILON for exactly this, so three thirds still read as one whole
  pitch, not an over-capacity clash. The occupancy panel now speaks thirds
  instead of rounding them to the nearest quarter. Migration
  `db/migrations/20260830_pitch_portion_third.sql` (applied to production before
  this shipped) widens the `events_pitch_portion_check` CHECK. `src/lib/pitchPortion.js`,
  `src/components/PitchCalendar.jsx`, `tests/pitch-portion.test.js`,
  `tests/pitch-clashes.test.js`, `tests/pitch-glance.test.jsx`.
- `248511a` — **Recorded the Grok full-sweep findings + remediation plan (docs only).**
  Verification of the 29 Aug 2026 Grok security sweep — all 18 items confirmed
  against the code, the two criticals against the live database — written into
  the durable register (`claude/open-items.md`, new "Grok full-sweep" section)
  with the agreed corrected framing, plus a 10-PR dependency-ordered remediation
  plan (`claude/plans/2026-08-30-grok-sweep-remediation.md`). No code changed;
  nothing authorised.
- `81dd7b1` — **Home sits far left on the four-tab parent/player bar.** #530 centred Home
  on the dock, but on the narrow four-tab island the middle is no longer the
  thumb's resting slot and the centred Home read as stranded (Jay). Home now
  keeps its natural NAV_ITEMS lead on the four-tab bar; the wide five-tab
  squad-staff bar still centres it. `src/components/Nav.jsx`, `tests/nav.test.jsx`,
  `claude/specs/design-system.md`.
- `b8b635c` — **Pitch sharing: the "it's fine" override.** The last piece — an admin can
  mark a genuine over-capacity share as OK, and the clash marker clears across
  the calendar. `pitch_share_approvals`
  (`db/migrations/20260830_pitch_share_approvals.sql`) stores an approval keyed
  to the EXACT set of bookings (`shareKey` — the involved event ids, sorted), so
  it clears that overload and no other, and a fourth squad added to the pitch
  changes the key and re-flags. New `src/data/pitchShareApprovals.js`; the
  occupancy panel grows an admin-only "It's fine — approve" / "Undo" control
  (`private.is_admin` gated in RLS, matching the request queue), and both the
  Allocation grid and the PitchGlance markers skip an approved cohort. The
  approve action lives on Allocation, where the fixtures carry the club the
  write needs; PitchGlance reflects the approved state read-only.
  `src/components/PitchCalendar.jsx`, `src/screens/Allocation.jsx`,
  `src/screens/PitchGlance.jsx`, `harness/stubs/pitchShareApprovals.js`,
  `harness/vite.config.js`, `tests/pitch-share-approvals.test.js`,
  `tests/allocation.test.jsx`, `tests/pitch-glance.test.jsx`,
  `tests/harness-stubs.test.js`. This completes
  `claude/plans/2026-08-29-pitch-portions.md`.
- `703c8d2` — **The parent/player tab bar shrinks to a centred island.** The bottom dock's
  spacing was tuned for the five-tab squad-staff bar; a parent or player has only
  four (no Squad Hub), and at that count the full-width `justify-between` spread
  nearly doubled every gap — ~44px against staff's ~23px — so the icons scattered
  and the centred Home pill was marooned (Jay: "don't look good"). Below five tabs
  the dock is now a fixed-width centred island that hugs its tabs (gaps back to
  ~27px); at five it stays the full-width bar, so squad staff see no change. Both
  widths keep `justify-between`, so the glider math is untouched. `src/components/Nav.jsx`.
- `b7e6c73` — **Tournaments can be added for several age groups at once.** "Also add for" was
  hidden in tournament mode at ship (phase 3); Jay asked for it back — a festival
  is one event several of our squads enter. Ticking extra squads now fans the
  **container** out: one independent tournament per squad, each with its own games
  added underneath. Each row is a real container (`type='match'`,
  `competition_type='tournament'`, `tournament_id` null) sharing one `group_id`,
  which links the sibling festivals so pitch-clash detection exempts them at the
  same venue and pitch occupancy collapses them — exactly a training fan-out's
  behaviour. Games attach via `tournament_id`, never `group_id`, so the
  container↔game and squad↔squad relationships stay distinct. Deleting one squad's
  tournament removes only that container and its games. `src/screens/EventForm.jsx`,
  `tests/multi-squad-and-pitch.test.jsx`, `tests/event-form.test.jsx`,
  `claude/plans/2026-08-29-tournaments-as-containers.md`.
- `b7e6c73` — **The DatePicker's "Clear date" × stays put when the calendar opens.** The ×
  was absolutely positioned against the component root, which grew to include the
  open calendar popover — so `top-1/2` dropped it from beside the calendar icon
  down into the day grid (it read as a stray mark near a random day). Wrapping the
  trigger and the × in their own positioning context pins it to the trigger's
  height regardless of the calendar. `src/components/DatePicker.jsx`. (Shipped in
  the same squash as the tournaments change above.)

## 29 Aug 2026

- `44d53e5` — **Pitch sharing: the occupancy view.** A "Shared pitches" panel under the
  pitch calendar shows how full each shared pitch is and what is spare — the
  "what's free before I ask" the screen promises. `pitchShares` in
  `src/data/pitches.js` returns every maximal set of two-or-more squads on one
  pitch at one moment (the superset `findPitchClashes` already filtered for
  clashes), and a new `PitchOccupancy` component draws each as a stacked bar: a
  segment per squad sized by its portion, the empty track the room left, a warn
  fill and a ⚠ line when the portions overtop the pitch. Every segment is named
  in a legend and in the bar's aria-label, so colour is never the only signal.
  `src/components/PitchCalendar.jsx`, `src/screens/PitchGlance.jsx`,
  `harness/stubs/pitches.js`, `tests/pitch-shares.test.js`,
  `tests/pitch-glance.test.jsx`. Plan: `claude/plans/2026-08-29-pitch-portions.md`.
- `1c26e4f` — **Home rides the centre of the mobile dock.** It sat on the far-left slot of
  the bottom tab bar; Jay wanted it in the middle. The app opens on Home
  (`start_url` `/` → Dashboard) and the centre of the bar is the thumb's resting
  slot, so the tab you land on is the tab under your thumb. Mobile-bar-only
  reorder: `NAV_ITEMS` — and so the desktop Sidebar, a vertical list — keep Home
  first, where the top of a vertical nav belongs; only the horizontal dock moves
  it, to `floor(count/2)` (dead centre of the five-tab squad-staff bar, the
  middle of the four-tab parent/player one). `src/components/Nav.jsx`,
  `tests/nav.test.jsx`, `claude/specs/design-system.md` §4.3.
- `c9ca550` — **Pitch sharing, phase 3: allocator-side portion.** The two assign sheets on
  the Allocation screen (queue answer + direct assign) set only a pitch, so a
  pitch answered from a coach's request landed with no portion — a full pitch —
  and a shared U8 match would then flag as a clash. Now a "How much of the pitch"
  dropdown appears once a pitch is chosen, defaulted from the fixture's squad and
  editable, and `setEventPitch` / `allocatePitch` write `pitch_portion` alongside
  the pitch (null when there is no real pitch to split). `src/screens/Allocation.jsx`,
  `src/data/pitchRequests.js`, `tests/allocation.test.jsx`,
  `tests/pitch-requests.test.js`. PitchGlance's stacked occupancy view and the
  "sharing approved" override remain unbuilt. Plan:
  `claude/plans/2026-08-29-pitch-portions.md`.
- `a4283c7` — **Pitch sharing, phase 2: the portion picker and the column.** Adds
  `events.pitch_portion` (`db/migrations/20260829_pitch_portion.sql`, text,
  nullable, CHECK `quarter/half/full`) and a "How much of the pitch" picker on
  EventForm, shown once a real pitch is chosen — "No pitch" and `Pitch TBD` have
  nothing to split and save a null portion. It pre-fills from the squad's age and
  the event type (matches U6–U8 ¼, U9–U11 ½, U12+ full; training leans smaller)
  and keeps the suggestion in step with the squad and type until overridden, the
  same prefill-don't-clobber rule the league-team tier follows. The portion rides
  in the event payload's `common` (so a fan-out and a repeating term all carry it)
  and joins `SERIES_EDITABLE_FIELDS`. The migration re-creates the `pitch_occupancy`
  RPC to return the portion, so PitchGlance's clash view is portion-aware too.
  ⚠️ The migration is applied to production before this deploys — the column must
  exist before the writer names it. `src/screens/EventForm.jsx`, `src/data/events.js`,
  `tests/event-form-pitch-portion.test.jsx`, `tests/series-edit.test.js`.
  Allocator-side portion, the PitchGlance
  stacked view, and the "sharing approved" override are phase 3. Plan:
  `claude/plans/2026-08-29-pitch-portions.md`.
- `238624b` — **Calendar tab shows events, not dots.** Jay: "tiny dots on days … isn't a
  premium design for users." The Calendar month view was a dot-grid at every
  width with the same month's fixtures repeated as a full list directly beneath
  it — every event drawn twice, once as a bare coloured dot that carried no
  name or time and once as a full row. Now width-responsive: on a wide screen
  each day cell carries its own events (type dot + kick-off time + name, up to
  three then "+N more"), with no list underneath; on a phone the tab is an
  agenda of the month's rich fixture rows under the month nav. The day sheet
  becomes the wide side's entry point (a phone row opens the event directly).
  Timezone bucketing (the club's Abu Dhabi day) unchanged — a presentation
  change, not a data one. `src/screens/Schedule.jsx`,
  `tests/schedule.test.jsx`, `claude/specs/design-system.md` §4.14,
  `claude/decisions/2026-08-29-calendar-shows-events.md`.
- `a128447` — **Pitch sharing, phase 1: portions and capacity-based clash detection.**
  Different age groups routinely share a training pitch — a quarter or a half
  each — and matches split the pitch for the younger bands too, only U12 and
  older getting a full pitch (Jay, 29 Aug). New `src/lib/pitchPortion.js` holds
  the `quarter/half/full` vocabulary and an age-based default. `findPitchClashes`
  is rewritten from "any two bookings overlapping on one pitch is a clash" to a
  capacity question: it sums the portions occupying a pitch at each moment and
  warns only when they overtop one whole pitch, so a quarter beside a half is
  now cleanly shared. Backward-compatible — a booking with no portion counts as
  a full pitch, so behaviour is unchanged until portions are entered (the column
  and the picker are phase 2). The fan-out `group_id` exemption, "touching is not
  overlapping", `Pitch TBD`, and the nullable-`ends_at` rule are all preserved.
  `src/data/pitches.js`, `src/screens/Allocation.jsx`, `src/screens/PitchGlance.jsx`,
  `tests/pitch-portion.test.js`, `tests/pitch-clashes.test.js`.
- `94fa065` — **Removed the dead `updateProfileName` writer.** The legacy admin name-fixer
  that wrote the combined `full_name` column directly — superseded by
  `updateMemberProfile` (first/last, admin path) and `updateProfileNames`
  (first/last, self path), with `full_name` rebuilt by the `profiles_sync_name`
  trigger. It had no caller anywhere in the app (verified), and since the 28 Aug
  contact-column lockdown it also carried the same bare-`.select()` /
  "permission denied" trap the live writers were just fixed for — a latent
  landmine with nobody on it. Deleted the function, its unit tests, its now-dead
  mocks in four suites, and repointed the comments that referenced it. No
  behaviour change: admins still fix names through the Edit-person sheet
  (`updateMemberProfile`). `src/data/members.js`, `src/data/staff.js`,
  `src/screens/Accounts.jsx`, `tests/data.test.js`, `tests/accounts.test.jsx`,
  `tests/app-shell.test.jsx`, `tests/app.test.jsx`,
  `tests/parent-self-registration.test.jsx`.
- `4515284` — **Search the accounts list by name or email.** Jay: "i need to be able to
  search them, there is no current search function". A free-text box on the
  admin Accounts screen that narrows the ACTIVE list as you type, matching a
  person's name or email (case-insensitive substring). It composes with the
  existing type chips — narrow to Coach, then find one by name — and never
  touches the pending queues, for the same reason the chips don't: a request
  must not be searchable-away. Shown only once there is more than a screenful
  (`groups.length > 6`), gated on the whole-club count so a query that empties
  the list can't hide its own box; the no-match state says "No accounts match …"
  rather than claiming the club is empty. `src/screens/Accounts.jsx`,
  `tests/accounts.test.jsx`.
- `bb0ada6` — **Two guards against blank "hasn't said what they need" signups** (Jay traced
  one to a stale-cache client, 29 Aug). (1) `src/lib/auth.jsx` adds
  `shouldCreateUser: false` to the mothballed magic-link sign-in, so a link
  request for an unknown email is a no-op login instead of silently minting a
  bare, intent-less account. (2) Migration `20260829_hold_bare_signup.sql` adds
  an AFTER-INSERT trigger on `public.profiles` that pre-DISMISSES a profile born
  with no name AND no `signup_intent` — the unambiguous signature of a signup
  that skipped the wizard (bot, stale cache, or magic-link/OTP), which the wizard
  (always an intent), Google OAuth (always a name) and invited members (who sign
  in first, then redeem) never produce. Non-blocking and reversible: held junk
  drops into "Show dismissed" and flips back to pending if the person later
  completes the request. Applied to production and proven by a rolled-back
  `db/tests/hold-bare-signup.sql` harness (bare held, named control left alone,
  self-test). `db/schema/triggers.sql`, `db/schema/functions.sql`. Existing bare
  accounts are unaffected — dismiss those by hand.
- `d9f3be8` — **Re-captured `handle_new_user` in `db/schema/functions.sql`** to match the
  live function. The captured body had drifted well behind production: it showed
  only the profile insert, while the deployed trigger also derives the name,
  records `name_confirmed_at` and `signup_intent` on the profile, writes the
  pending `access_requests` row from the intent, and calls `apply_signup_intent`
  once the email is confirmed — grown by the 25 Aug signup-before-confirm work
  and the 26 Aug volunteer change without the capture being refreshed (found
  29 Aug while adding `hold_bare_signup`). Capture-only: no behaviour or schema
  change, the live function was already correct. The `on_auth_user_created` note
  in `db/schema/triggers.sql` is corrected to match. `db/schema/functions.sql`,
  `db/schema/triggers.sql`.
- `28a6c22` — **Fix: saving a phone number (or a name) threw "permission denied for table
  profiles".** The 28 Aug contact-column lockdown
  (`20260828_profiles_contact_revoke`) revoked `SELECT` on `profiles.phone` and
  `profiles.email` from `authenticated` — reads were rerouted through
  `member_contacts`, but three writers still ended with a bare `.select()`,
  which PostgREST turns into `UPDATE … RETURNING *`: a read of every column,
  `phone` included. So the moment a parent saved their own phone, an admin
  edited anyone's details, or a new member confirmed their name, the write threw
  42501. Fixed by reading back only granted columns and re-attaching the phone
  the writer just wrote (`updateMyProfile`, `updateMemberProfile`,
  `updateProfileNames`). `src/data/members.js`,
  `tests/profiles-write-grants.test.js`.
- `299dba0` — **Desktop time entry — the app's own `TimePicker`.** The event form's two time
  fields (Time and End time) drop the native `<input type="time">`, which on
  desktop is a cramped AM/PM spinner that is awkward with a mouse (Jay: "fix the
  way times are selected when using a desktop"). New
  `src/components/TimePicker.jsx` mirrors `DatePicker`'s trigger + popover: you
  can **type** any time — `1845`, `18:45`, `6`, `630` all resolve, and any
  minute is allowed rather than snapped — or **tap** a popover of quick-pick
  chips and hour/minute columns (the columns snap to :00/:15/:30/:45). Both stay
  in sync. Value stays `HH:MM`, so the "drag the end time with the start" logic,
  the kick-off-TBD checkbox and the calendar feed are all unchanged; tournament
  mode gets it too, since the time fields render there as well. The popover is a
  `role="group"`, not a dialog — it is non-modal and stays open across column
  taps, so it must not read as a second dialog over the form sheet.
  `src/components/TimePicker.jsx`, `src/screens/EventForm.jsx`,
  `tests/time-picker.test.jsx`.
- `c37ed35` — **Tournaments as containers — phase 4 (the tournament detail screen + games).**
  A tournament container now opens its own screen instead of the single-fixture
  `EventDetail`: the day's setup, the **games** played inside it, an overall
  **placing**, and an **Add game** action. New `src/screens/TournamentDetail.jsx`
  (routed from `src/screens/Schedule.jsx` via the shared `isTournamentEvent`
  test) and `src/screens/AddGameForm.jsx` — a lean form that writes a game
  inheriting the tournament's squad, date, venue, competition and tier, adding
  only opponent, kick-off, stage and score (`home` and `ends_at` null, since a
  game is neither a standalone fixture nor a calendar entry). A game reuses the
  existing match sheet by id, so tapping one for a viewer opens it. Delete is a
  two-step confirm naming how many games the cascade takes. New data helpers
  `listTournamentGames` and `setTournamentPlacing` in `src/data/events.js`.
  Tests: `tests/tournament-detail.test.jsx`, data-helper cases in
  `tests/data.test.js`, and a Schedule routing test. Depends on phase 1's
  migration (#511), which was applied to production the same day.
- `796c6fc` — **Tournaments as containers — phase 3 (the chooser + the tournament form).**
  Adding an event now opens a small **"What are you adding?"** chooser (Match /
  Tournament / Training / Social) before the form, so a tournament is a
  first-class thing you pick up front rather than a Match you scroll ten fields
  down to reclassify (Jay, 29 Aug 2026: he liked "the quick what are you adding?
  thing then the form comes up"). New `src/components/EventKindChooser.jsx`;
  `src/screens/Schedule.jsx` routes every NEW-event entry (the button, a day
  cell, the `?open=add-event` deeplink) through it, while editing and
  duplicating still open the form directly. `src/screens/EventForm.jsx` gains an
  `initialKind` prop and a **`tournamentMode`** — new-event-only, driven by the
  chooser and deliberately NOT by `competition_type`, so the edit path and its
  tests are untouched. In that mode the tournament's **name is the identity** at
  the top, and opponent, home/away, league team, round, the Competition
  dropdown, score, Repeats and "Also add for" are all hidden; the name is
  required, and the container saves as `type=match`,
  `competition_type=tournament` with `opponent` and `home` null. The games
  played underneath it are phase 4. `tests/event-kind-chooser.test.jsx` and
  tournament-mode cases in `tests/event-form.test.jsx`; three Schedule tests
  updated to click through the new chooser. (Phase 1 is #511.)
- `888f544` — **Tournaments as containers — phase 1 (schema + read paths, nothing user-visible).**
  Groundwork for entering a tournament as its own object with the games played
  recorded underneath it (design:
  `claude/plans/2026-08-29-tournaments-as-containers.md`). Migration
  `20260829_events_tournament_id.sql` adds `events.tournament_id`
  (self-referencing FK, **ON DELETE CASCADE** so deleting a tournament takes its
  games and their sheets), plus `placing` (container) and `stage` (game) — all
  nullable, no backfill, every existing row unchanged. `tournament_id IS NULL`
  is the rule for "a top-level calendar entry": `listEvents`
  (`src/data/events.js`) and `calendar_events_for_token`
  (`20260829_calendar_feed_exclude_tournament_games.sql`, CREATE OR REPLACE so
  grants are untouched) both filter it, so a tournament's games never appear
  loose on the schedule or in the feed. `eventTitle` (`src/lib/eventFormat.js`)
  gains a `!tournament_id` guard so a game reads "Quins vs Exiles", not the
  tournament's name. Proven by a rolled-back `db/tests/tournaments.sql` harness
  (cascade + control fixture + feed exclusion + a SET-NULL self-test) and JS
  tests. `db/schema/tables.sql`, `db/schema/functions.sql`,
  `tests/tournament-title.test.js`, `tests/data.test.js`. Phases 3–6 (the
  chooser, the tournament screen, add-game, delete-confirm) follow.
- `6b7750b` — The four **date-of-birth** fields now use the same `DatePicker` too (Jay:
  "migrate the event date + birthdays"). Player registration (both the parent
  and the "I'm the player" paths), the parent-facing **MyPlayerForm**, the
  admin/coach **PlayerForm**, and the first-run **NamePrompt** birthday prompt
  all drop the native `<input type="date">` for the app's calendar — whose
  month and year `<select>`s matter most here, since a birthday is years back.
  The `yyyy-mm-dd` value contract, the `1900-01-02..today` bounds and the
  `player_private_dob_sane` database guard are all unchanged. Each wrapping
  `<label>` became `htmlFor`+`id` so a click on a calendar day is not forwarded
  to the trigger, and `DatePicker` gained a `testId` prop. The shared
  `tests/helpers/pickDate.js` gained `pickDateByTestId`, and every test that
  set a birthday moved to it. `src/components/PlayerRegistrationForm.jsx`,
  `src/screens/MyPlayerForm.jsx`, `src/screens/PlayerForm.jsx`,
  `src/components/NamePrompt.jsx`, `src/components/DatePicker.jsx`,
  `tests/helpers/pickDate.js`, `tests/parent-self-registration.test.jsx`,
  `tests/more.test.jsx`, `tests/player-form.test.jsx`,
  `tests/name-prompt.test.jsx`, `tests/roll-call.test.jsx`.
- `3e66c4a` — New reusable **`src/components/DatePicker.jsx`** — the app's own date control,
  and the **event Date** field is the first to use it (Jay: "why can't we use
  that calendar everywhere?"). Same `yyyy-mm-dd` value contract as the native
  input, so callers and the database are unchanged. A trigger shows the value
  (with a clear ✕) and opens an inline calendar built from `calendarGrid.js`
  whose ‹ › are plain buttons — no commit-on-navigate — plus **month and year
  `<select>`s** so a far-back date (a birthday) is a couple of taps, not months
  of paging. A shared `tests/helpers/pickDate.js` drives it; the event-form test
  suites moved to it. Birthdays are next. `src/components/DatePicker.jsx`,
  `src/screens/EventForm.jsx`, `tests/date-picker.test.jsx`,
  `tests/helpers/pickDate.js`.
- `7e30d4b` — The **"Repeat weekly for … weeks"** field now starts showing **0** instead of
  blank, and its stepper can go back down to 0 (Jay: a blank box does not say
  what it is for, and `min={1}` trapped the spinner above zero). 0 weeks still
  means "no repeat", so a one-off stays the default. `src/components/RepeatUntilField.jsx`,
  `tests/repeat-until-field.test.jsx`.
- `dd59dfb` — Replaced the native **"Repeat until"** date picker entirely (Jay's phone: the
  OS calendar committed a date when you navigated to the next MONTH, so reaching
  a month further out was impossible — removing `min` the PR before did not fix
  it, because the commit-on-navigate is the native picker's own behaviour). New
  `src/components/RepeatUntilField.jsx`: defaults to **"Repeat weekly for [N]
  weeks"** (a plain number, no calendar), with an **"or pick an end date"** link
  that opens the app's OWN inline calendar (built from `calendarGrid.js`) whose
  ‹ › month buttons are ordinary React clicks and cannot commit a date. Both
  paths resolve to the same end-date string, so series generation is unchanged.
  A test proves month navigation does not commit; `repeating-events`,
  `multi-squad-and-pitch` and `duplicate-event` moved to the new control.
  `src/components/RepeatUntilField.jsx`, `src/screens/EventForm.jsx`,
  `tests/repeat-until-field.test.jsx`.
- `ecafb92` — Removed the `min` from the **"Repeat until"** date field. With the field
  empty, Chrome's calendar misbehaved on month navigation (Jay's phone: each hop
  to the next month committed a date and closed the picker, so it needed
  reopening every time) — an empty `<input type="date">` carrying a `min` is a
  known source of that quirk. Without it the picker navigates cleanly; the
  "end after start" guard is unchanged (`generateSeriesDates` yields no dates for
  an end before the start, and the submit refuses "no sessions").
  `src/screens/EventForm.jsx`. (SHA follows in the next changelog-touching PR.)
- `38fdcdd` — ⚠️ **Fixed: editing a REPEATING event with "apply to this and every later
  session" failed with `invalid input syntax for type uuid: "null"`** (Jay's
  phone). Inside `EventForm`'s submit, a `const seriesId` for the CREATE path —
  `null` when editing, since `repeating` is `!editing` — shadowed the
  component-scope `event.series_id` that the series-edit write needs, so
  `updateSeriesFrom(null, …)` filtered `series_id=eq.null`, which PostgREST
  casts to uuid and rejects. Every series edit was broken, not just renames.
  Renamed the inner id to `newSeriesId` so it can no longer shadow. A form-level
  regression test now drives the real submit and asserts the event's series_id
  reaches the write (the data-layer `series-edit.test.js` passed an explicit id
  and never exercised the form). `src/screens/EventForm.jsx`,
  `tests/event-form-series-edit.test.jsx`. (SHA follows in the next
  changelog-touching PR.)
- `0231654` — Fixed the account menu's **Notifications / Add-to-your-calendar** deep-links
  landing at the top of the Settings page instead of on the section (Jay's
  phone). The sections above the target (the You card, the photo, Your players)
  load async and push it down, so a single scroll — even after a double rAF —
  fired against a short page and left the section off screen. The hash-scroll
  now re-scrolls across ~1.7s, correcting for each reflow as the page fills.
  `src/screens/More.jsx`, `tests/more.test.jsx`. (SHA follows in the next
  changelog-touching PR.)
- `c3b82f6` — **`/more` is now `/settings`.** The settings page (the retired More tab's
  home) gets a proper name: the route is `/settings`, and the page heading and
  the account-menu row are titled **Settings** (with a gear, was "My account").
  Old `/more` links, bookmarks and the notification deep-links redirect there.
  ⚠️ The component keeps its filename (`src/screens/More.jsx`) ON PURPOSE — the
  changelog refers to it by path and docs-check fails the build on a documented
  path that no longer resolves, so a file rename would red every historical
  entry; the filename is internal, the route and title are what users see. Also:
  on the phone bar **Squad Hub swaps with Chat** so Chat holds the rightmost
  slot — the long "SQUAD HUB" caption was sitting on the dock's rounded corner
  out there (Jay's phone). `src/App.jsx`, `src/components/Nav.jsx`,
  `src/components/AccountMenu.jsx`, `src/components/AppShell.jsx`,
  `src/components/HelpSheet.jsx`, `src/components/NotificationsNudge.jsx`,
  `src/components/NamePrompt.jsx`, `src/screens/DeleteAccount.jsx`,
  `src/screens/More.jsx`. (SHA follows in the next changelog-touching PR.)
- `b9f129f` — The bottom tab bar loses **More**; its contents move to the masthead
  **account menu** (the initial dropdown). The bar is now Home · Schedule ·
  Roster · Chat (squad staff keep Squad Hub), and every idle tab gains a small
  caption under its icon while the active tab still expands into the red pill.
  The account menu gains the **Admin** door (admins) and the **Approvals** door
  (coaches/managers — the phone's only route to the queue now, gated by
  `canApproveAnything`, pending/medic cases and all), an **Enter-sends** chat
  toggle, **Notifications** and **Add to your calendar** links to the /more
  sections, and **Privacy policy** / **Delete your account** links. `/more`
  stays as the settings page behind "My account", trimmed of the moved sections.
  Also: idle dock icons read at full ink and the dock's light-mode frost is
  strengthened, so the bar is legible over pale content. `src/components/Nav.jsx`,
  `src/components/AccountMenu.jsx`, `src/components/Sidebar.jsx`,
  `src/screens/More.jsx`, `src/index.css`.

## 28 Aug 2026

- `2000049` — Rights log (`/admin/rights-log`) gains read-only view controls, in a
  collapsed **Filter & group** panel: show access-grants-only, filter by
  person (matched as subject OR actor), restrict to a date range, and group
  entries under day headings. An active-filter badge, a **Clear filters**
  control, and a distinct "No changes match these filters" empty state keep a
  narrowed-to-nothing view from reading as a wiped log. ⚠️ THE LOG STAYS
  APPEND-ONLY — these are client-side filters over the already-fetched 200-entry
  window; nothing writes, hides a row from anyone else, or removes one.
  `src/screens/AdminRightsLog.jsx`, `tests/rights-log.test.jsx`.
- `596319e` — Updated `claude/state-of-play.md` with today's chat photo/voice preview fix
  (`my_chats` returns `last_attachment_path`) and the provider-resilience work
  (`src/lib/resilientFetch.js`, ride through a stalled Supabase). Docs-only, no
  deploy.
- `beabc2a` — Training-plans strip: each session now has a dedicated **Open** control, and a
  tap only SELECTS the night for the shelf's focus chips (follow-up to the #497
  tap-to-open, which got in the way of browsing nights). The pill is a container
  so the select button and Open button sit side by side without nesting.
  `src/components/TrainingDateStrip.jsx`, `src/screens/SquadTraining.jsx`.
- `ba0af96` — Session handoff — the **admin-rights security redesign is COMPLETE** (all six
  data boundaries live: 0a/1/1b/2/3/4; 0b n/a under α). Records the one
  outstanding action (grant `welfare` to re-enable DM review), the locked design
  decisions, and the traps met — 1b deploy-first, the `profiles` SELECT
  column-list trap, the tree-shaken `scope.js` mirrors.
  `claude/handoffs/2026-08-28-admin-rights-complete.md`. Docs-only, no deploy.
- `07367cc` — Admin-rights redesign **Phase 4** (Surface S7b) — the last, most
  safeguarding-sensitive boundary. Reviewing a child's or reported DM moves from
  EVERY admin to the explicit `welfare` grant, and even a super must tick it (an
  audited write to their own `admin_rights`): `private.admin_may_review` is
  repointed off `is_admin` onto `private.can_review_dm` (no `is_super`
  short-circuit), which narrows the ~15 chat policies keyed on it at once. The
  who-opened-a-DM audit (`public.welfare_access_log`) already existed; its read
  policy narrows from any admin to **super + welfare**. ⚠️ CHANGES CURRENT
  BEHAVIOUR — 0 admins hold `welfare` today, so DM review is OFF until it is
  granted to the club's safeguarding person (a deliberate, named, audited role).
  Both directions proven in `db/tests/dm-review-welfare.sql`; applied to
  production. Completes the redesign's data boundaries (0a/1/1b/2/3/4 live; 0b
  n/a under α).
- `7ec17e2` — Re-captured `db/schema/functions.sql`'s `my_chats()` to match production after
  `db/migrations/20260828_my_chats_last_attachment.sql` was applied — the mirror
  now carries `last_attachment_path`. Schema mirror only, no deploy; the header's
  proacl/md5 still describe the prior body (annotated inline, per the 25 Aug
  precedent — this file is hand-captured, there is no generator to recompute it).
- `677c616` — Training-plans UX, five fixes from Jay's feedback: (1) tapping a night in the
  two-week strip now OPENS that session's plan (the strip shows each session, so
  a tap should open one — not just feed the shelf's mislabelled "tonight" slot);
  (2) the heart and star carry hover tooltips — heart = a public like others
  can see, star = save to your own shortlist; (3) a coach can suggest their OWN
  saved hour to the club from the shelf card, any time, without re-saving (which
  made a duplicate), and it reads "Suggested" once it's in the queue; (4) the
  Director's suggestion queue names WHO suggested each hour and (5) expands each
  to show its running order, so it is no longer Add/Dismiss blind. Files:
  `src/components/{TrainingShelf,DrillCard}.jsx`,
  `src/screens/{SquadTraining,TrainingTemplates}.jsx`.
- `5ba8da4` — Admin-rights redesign **Phase 3** (Surface S1, edit) — a Pitch, Training or
  Welfare admin can still READ the roster's names but can no longer EDIT or
  DELETE a child. The `player edit` policy on `public.players` is narrowed to
  `private.can_write_child` (`{clubadmin, youth, media}` + super) OR
  `is_team_staff`; `player read` is untouched, so everyone's view of names is
  unchanged. Squad staff keep editing their own squad; guardians' self-service is
  via separate SECURITY DEFINER RPCs (not a side door). Because of Phase 0a every
  current admin holds `clubadmin`, so nobody loses write today. Both directions
  proven in `db/tests/child-write-allowlist.sql`; applied to production.
- `d107d6a` — Provider resilience — the app now rides through a stalled Supabase instead of
  hanging on a spinner (`claude/plans/2026-08-28-provider-resilience.md`, §1–§3
  built): (1) the Workbox `NetworkFirst` route falls back to cache after 8s of
  network silence (`vite.config.js`); (2) a timeout under idempotent data reads
  (`src/lib/resilientFetch.js`) turns a multi-minute hang into a retry — GETs via
  postgrest-js's own idempotent retry, read-only RPCs via a bounded retry there —
  while writes, uploads and auth are left untouched for safety; (3) an honest
  "taking longer than usual…" message on the load gate and the signup squad
  picker (`src/lib/useSlowLoad.js`). §4 (browser stale-while-revalidate) is a
  later pass.
- `b83cf54` — Chats list now previews a photo/voice-only message as "📷 Photo" / "🎤 Voice
  message" instead of "No messages yet". A caption-less attachment is a legal
  message stored with an empty body (the `messages_body_check` constraint yields
  its length arm to `attachment_path`), so `my_chats` returned an empty
  `last_body` and `previewLine` read that as "no message" — a DM full of photos
  looked empty. `my_chats` now also returns `last_attachment_path`
  (`db/migrations/20260828_my_chats_last_attachment.sql`) and the client
  renders the medium via the existing `attachmentPreviewLabel`. Applied to
  production; `db/schema/functions.sql` re-captured to match.
- `193b7ea` — Admin-rights redesign **Phase 2** (Surface S3) — a child's **photograph**
  becomes a real data boundary. The `player-photos` storage read/write policies
  are narrowed to the allowlist `{clubadmin, youth, media, welfare}` (welfare
  read-only), so a Pitch or Training admin can no longer fetch a signed URL for a
  child's photo — the image falls back to a monogram. Squad-attached members
  (`is_on_team`) and guardians keep their access; every current admin holds
  `clubadmin`, so nobody loses access today. New helpers
  `private.can_see_child_photos` / `can_edit_child_photos` / `is_on_team`. DB-only
  — the client degrades gracefully, so no reroute. Confirmed the
  `backup-player-photos` edge function is not a side door (service-role, cron,
  secret-gated, append-only to private R2). Both directions proven in
  `db/tests/child-photos-allowlist.sql`; applied to production.
- `48e247b` — Admin-rights redesign **Phase 1b** — the adult *login* contact
  (`profiles.email`/`phone`) is closed off too. Direct column SELECT is revoked
  from `authenticated` (table SELECT revoked, re-granted on the other 16 columns),
  so a narrowed admin can no longer read a parent's login email/phone with a raw
  PostgREST query — the Phase 1 residual. The only read path is now
  `public.member_contacts(uuid[])` (SECURITY DEFINER), which nulls them unless the
  caller is entitled (self / a staff-or-admin target / an allowlisted admin / a
  coach of the target's squad); it also fixes a leak in `member_contact_card`
  whose squad arm keyed on `can_edit_team` (true for any admin). Six data-layer
  reads reroute through it and merge the columns back, so no screen changed shape.
  Deploy-first: fn migration → this deploy → the revoke migration. Both directions
  proven in `db/tests/profiles-contact-revoke.sql`; `grants.sql` re-captured.
- `dca36b8` — Corrected a stale security-headers finding: **headers-only deploys DO reach
  installed PWAs now.** The 6 Aug decision doc said a `netlify.toml`-only change
  never self-heals in the service-worker cache (only a bundle-changing deploy
  does) — that stopped being true when `__BUILD_REF__` (~18 Aug) began baking the
  deploy's `COMMIT_REF` into the bundle, so every deploy changes `index.html` →
  its precache revision → `sw.js`, and `autoUpdate` re-fetches the document with
  live headers on next visit. Measured: builds differing only in `COMMIT_REF`
  yield different `sw.js` (same ref → byte-identical, as control), and the live
  bundle carries the deployed SHA. So the durable SW rework (network-first
  document) stays unbuilt — it buys nothing now that `__BUILD_REF__` propagates
  headers per deploy. Also recorded Jay's call that offline use is a non-goal
  (stale scores/availability would mislead), so the precache is justified on
  online grounds — fast loads and blip-resilience — not offline. Docs-only.
  (SHA follows in the next changelog-touching PR.)
- `56e399a` — Admin-rights redesign **Phase 1** (Surface S2) — a child's DOB and their
  parents' registered contact become a real data boundary. Read of
  `player_contacts`, `player_parents` and `player_private` is narrowed by RLS to
  the allowlist `{clubadmin, youth, media, welfare}` (welfare read-only), so a
  Pitch or Training admin is refused at the database — a direct API query, not
  just the menu; coaches keep their own squad and guardians their own child. The
  `member_contact_card` parent arm is tightened to the same allowlist. Because of
  Phase 0a every current admin holds `clubadmin`, so nobody loses access today —
  it only enables narrower future grants. New helpers
  `private.can_see_child_contacts` / `can_edit_child_contacts` / `is_team_staff`;
  `src/lib/scope.js` mirror; migration applied to production first, both
  directions proven in `db/tests/child-contacts-allowlist.sql`. ⚠️ Residual: the
  adult *login* contact (`profiles.email/phone`) is not yet column-revoked —
  Phase 1b, which needs a 4-screen read reroute.
  (SHA follows in the next changelog-touching PR.)
- `d034d10` — The actual voice-message bug: `Permissions-Policy: microphone=()` blocked
  recording on every Chromium browser. `netlify.toml` disabled the microphone
  for all origins including self; Chromium enforces it (Chrome, Android, PWA all
  showed a dead mic button) while Safari/iOS ignores the policy — so the feature
  only ever recorded on iPhones. The header pre-dated voice messages, when
  nothing called getUserMedia. Changed to `microphone=(self)`; the #488
  error-surfacing was treating the symptom. Decision doc's camera warning
  (`claude/decisions/2026-08-06-security-headers.md`) had predicted exactly this
  failure mode.
- `6647a2d` — Voice-message mic failures are no longer silent. When recording
  can't start (a blocked mic), the composer now shows an actionable reason via
  the existing send-error line instead of a dead-looking button
  (`src/lib/voiceRecorder.js` › `describeRecorderError`, wired through
  `VoiceComposer`'s new `onError`). Diagnosis: iPhone uploads reached storage,
  Android produced no upload request at all, so capture failed client-side and
  the error was swallowed.
- `c579d96` — Admin-rights redesign **Phase 0a** — `clubadmin` becomes the base admin right:
  added to `ADMIN_RIGHTS`, and the Club Hub Admin portal flips from `right: null`
  to `right: 'clubadmin'` (`src/lib/portals.js`) so a right composes the portal
  like any other and the card can genuinely close. Every active non-super admin
  was backfilled (`db/migrations/20260828_clubadmin_right.sql`, applied to
  production first; supers hold it implicitly), so nobody loses the screen.
  Harness `db/tests/clubadmin-backfill.sql`. Still screen-gating, not
  data-gating — real RLS boundaries are the redesign's later phases.
  (SHA follows in the next changelog-touching PR.)
- `7de2191` — Appointed club officers' names now render in the club green
  (`text-accent-ink`) on the /admin/officers list, matching the badge treatment
  their name gets elsewhere. Titles-only UI; changes nothing about access.
- `4718f33` — Provider-resilience spec
  (`claude/plans/2026-08-28-provider-resilience.md`): ride-through-blips plan for
  Supabase platform incidents — Workbox `networkTimeoutSeconds`, timeout +
  bounded retry at the single fetch chokepoint, honest "taking longer…" UI, and
  broader stale-while-revalidate. Spec only; build after the incident clears.
- `7e9add4` — Supabase latency incident + resilience follow-up — session handoff
  (`claude/handoffs/2026-08-28-supabase-incident-and-resilience.md`): the 27–28 Aug
  Supabase platform latency incident diagnosed as server-side (their edge logs show
  2–5 min origin response times across REST and Auth), not our app or network;
  records the two agreed follow-ups — the resilience spec above, and a
  ping-when-cleared incident monitor.
- `466986e` — Admin-rights redesign — session handoff
  (`claude/handoffs/2026-08-28-admin-rights-design.md`): design phase done and
  merged, next work is Phase 0 of the migration (the `clubadmin` backfill
  linchpin, on production child data). Records the settled decisions, Phase 0a's
  traps, and what the next session must explore first (migration-application
  machinery, current production admin state) before writing any migration.
- `2da11be` — Admin-rights redesign — architectural shape decided and migration plan sketched.
  Chose **α + default-deny** (keep `is_admin`; add allowlist, deny-by-default helpers
  only on the four narrowed surfaces) over β (redefining the admin spine), recorded
  with the reasoning in the spec §4.1. New sketch
  `claude/plans/2026-08-28-admin-rights-migration.md`: Phase 0 groundwork (the
  `clubadmin` backfill linchpin, the `can_dm` adult-reach rule, the default-deny
  helpers, the read-audit scaffolding), then four narrowing phases lowest-risk first
  (contacts/DOB → photos → children write-access → DM review), each proven both
  directions in a `db/tests/` rollback harness. Design only — not started.
- `0f8a205` — Admin-rights security redesign — first deliverable: the **access-matrix + threat-model
  design doc** (`claude/specs/2026-08-28-admin-rights-access-matrix-and-threat-model.md`).
  Design only, no code. The project makes a specialist admin right a **real RLS data
  boundary** rather than a hidden menu, so a Social Media or Pitch volunteer genuinely
  cannot read children's data. Records the current model, the three enforcement surfaces
  (RLS boundary / UI-hint / service-role edge functions), the two design options
  considered (portal-composition rejected, real-RLS chosen), the target right×surface
  access matrix **with Jay's safeguarding rulings recorded** (Pitch names-only,
  Training names+attendance, Welfare read-only + stricter DM review, Social Media /
  Youth / Club Hub Admin full sight), and the insider-over-reach + account-takeover
  threat model.
- `044f5bd` — `db/schema/grants.sql` re-capture (comment-only): a measured banner at the head
  of §2's table list records that `anon` holds **zero** table privileges on all 66
  base tables (the 14 Aug schema-wide revoke landed; §2's per-table `anon` columns
  are the 10 Aug shape, kept as history) and that `authenticated`'s "ALL 8" is
  really seven (no TRUNCATE, 19 Aug). Measured live via `has_table_privilege`; the
  §-further-down "overtaken" note re-measured too. Closes the trap where §2 read as
  "anon still holds grants" and sent a reader chasing a regression that did not
  exist. No code, no schema change — a documentation snapshot.
- `8d7b1a7` — Dashboard stat band layout: **2×2 on a phone, four across on desktop** — the
  one-deploy-old four-across row (layout A) broke on a real phone, where the
  single long word "TOURNAMENTS" could not wrap in a ~90px tile and overflowed
  into "Needs a score" (Jay's screenshot). 2×2 gives ~180px tiles where the word
  fits on one line; the horizontal gradient repeats per row rather than sweeping
  once, accepted as the price of legibility. Desktop keeps the single sweep.
  `StatBand` grid `grid-cols-2 desktop:grid-cols-4`, plus a `border-b` on the
  first two tiles for the phone row-divider.
- `51f5546` — Dashboard stat band: **Tournaments** is now its own tile, split out of
  "Fixtures to play". A tournament is a match (`competition_type` 'tournament'),
  so it was silently counted as an ordinary fixture; Fixtures now counts
  non-tournament matches and Tournaments counts the rest. The staff-only band
  goes from three cells to four in one row — kept a single row, not a 2×2, to
  preserve the website's continuous red→green sweep (`src/screens/Dashboard.jsx`,
  `StatBand` / `fixturesToPlay` / `tournamentsToPlay`). Layout option A of the
  two shown; flip to 2×2 is a one-line change if wanted.
- `4cc0cfe` — Copy: the club-wide admin portal is now labelled **Club Hub Admin** (was
  "Club Admin") — one string, `PORTALS[0].label` in `src/lib/portals.js`, which
  feeds the section heading, the portal-chooser link and the sidebar submenu
  together, so all three stay in step. Matches the app's own name, Club Hub.
- `bc41c36` — Voice messages, WhatsApp-style: tap the mic, talk, send; the note plays in a
  bubble with a plain-bar scrubber and a 1×/1.5×/2× speed toggle. A voice note
  is just another attachment on a message — the chat-media rail photos already
  run on — so there are no new tables and no new RLS; the migration only widens
  the bucket to accept audio and raises its size to 10 MB (which is also the
  five-minute cap's teeth). Open posting like photos, five-minute cap. New
  `src/lib/voiceRecorder.js` (MediaRecorder, format negotiation, the cap),
  `ChatAudio` / `VoiceComposer`, wired into both thread hooks and composers.
  ⚠️ Tap-to-record, not hold-to-record — the approved fallback; the hold gesture
  is a later UI change on the same recorder. Migration
  `db/migrations/20260828_chat_voice.sql`, harness `db/tests/chat-voice.sql`
  (images-survive is the discriminating check). Spec
  `claude/plans/2026-08-28-voice-messages.md`; ruling
  `claude/decisions/2026-08-28-voice-notes-open.md`.
- `1419691` — Test: de-flaked the Accounts ordering case in `tests/accounts.test.jsx`
  ("sits ABOVE the Approval emails card"). It captured the `waiting-for-access`
  node after the first async read, then compared position after the second read
  had re-rendered and detached it, so `compareDocumentPosition` lost the
  FOLLOWING bit and failed ~1 call in 4. Now a `waitFor` re-queries both nodes
  from the settled DOM. No app change; 15/15 in isolation.

## 27 Aug 2026

- `59ac0f7` — Chat polls, WhatsApp-style: a question with 2–12 options, single- or
  multiple-choice, posted as a message in any chat you can already write in
  (squad, staff, club, DM, group). Everyone who can read it votes, sees live
  counts, and sees who voted — the parity ruling. New `polls` / `poll_options`
  / `poll_votes` tables under RLS that defers to the message's own read policy;
  votes are own-row inserts and a trigger stamps identity and does single-choice
  replacement, while `create_poll()` re-checks the poster may post there. New
  `src/data/polls.js`, `PollBubble` / `PollComposer` / `PollVotes`, wired into
  both thread hooks and composers. `subscribePollVotes` uses the
  `subscribeToTable` helper from #471. Migration
  `db/migrations/20260827_chat_polls.sql`, harness `db/tests/chat-polls.sql`
  (9 assertions, green against production). Spec
  `claude/plans/2026-08-27-chat-polls.md`; ruling
  `claude/decisions/2026-08-27-chat-polls-open-visible.md`.
- `279073f` — Tidy: dropped the `export` keyword from nine symbols that were referenced only
  inside their own file (`ArrowBadge`, `DUPLICATE_ACCESS`, `membershipKey`,
  `LAST_ADMIN_MESSAGE`, `IDEA_BUCKET`, `PRE_MATCH_FROM_AGE`, `TIER_ORDER`,
  `BAD_EMAIL`, `NO_ACCESS_CHOSEN`) — verified zero importers across src and
  tests. Shrinks the public surface; no behaviour change. Last of the
  audit's orphan findings.
- `13f290b` — Data layer: the realtime-subscription shape that six `subscribe*` functions
  hand-wrote — per-module channel-sequence counter, debounced onChange, and an
  idempotent `removeChannel` teardown that cancels the pending fire — is now one
  helper, `src/data/subscribeToTable.js`, with a single `REALTIME_DEBOUNCE_MS`
  in place of the three `= 400` constants that had to stay equal. `subscribeEvents`,
  `subscribeNotices`, `subscribeMessages`, `subscribeReactions`, `subscribeFeedback`
  and `subscribeAvailability` delegate, keeping their differences through
  `debounceMs` (0 = fire on every change, for feedback/availability), `filter`
  (availability's `event_id=eq`), `channelPrefix` (reactions) and `channelKey`.
  Pure consolidation, behaviour unchanged.
- `9e9ced2` — Data layer: the update-or-insert write shape that five `upsert*` functions
  hand-wrote is now one helper, `src/data/upsertById.js`. The non-obvious rule
  it carries — a write RLS filters to zero rows comes back as `data === null`
  with no error, so "no row back" is a refusal not a success — was re-explained
  in three files and now lives in one. `upsertEvent`, `upsertPitch`,
  `upsertPlayer`, `upsertLeagueTeam` and `saveMatchSheet` delegate to it and
  keep their differences through `refusedMessage` / `embed` / `mapError`
  options. Pure consolidation, behaviour unchanged (231 files still green).
- `06124bd` — Codebase-audit follow-up (multi-agent review). Security: hardened a stored-XSS
  path — a drill's `source_url`/`diagram_url` came from a plain `<input type=url>`
  and rendered straight into an `href`/`img src`, so a `javascript:` link could
  run in another coach's session; both now pass through http(s)-only
  `src/lib/safeUrl.js`. Correctness: the full-screen DM route rendered `<Thread>`
  without a key, so `useDmThread`'s `loggedRef` never reset across conversations
  and the second thread's welfare-access log could be skipped — now keyed by
  `conversationId`. Duplication: 16 hardcoded `'Asia/Dubai'` literals across 10
  files now reference the existing `CLUB_TIME_ZONE`. Dead code: removed
  `WIDE_QUERY`, a duplicate `must()` in `trainingShelf.js`, and the unused
  `updateSW` export binding, plus a batch of unused imports/vars.
- `d59cb3b` — Match sheets: RCM result sheets are for LEAGUE matches only (U11+) — a single
  `matchSheetApplies` gate now excludes tournaments and friendlies from the Club
  Youth Manager tracker, the "Open the RCM match sheet" button, the Squad Hub
  outstanding list, and the sheet screen itself (which shows "No RCM sheet for
  this fixture" for a non-league fixture). Removes the now-dead tournament-note
  UI. Ruling: `claude/decisions/2026-08-27-match-sheets-league-only.md`.
- `89b38b8` — Chat reaction picker stays fully on-screen: incoming left bubbles (smiley
  on the right of the row) no longer hang the tray off the phone's right
  edge, and flipping to grow left does not clip a right-aligned outgoing
  bubble. Shared `fitPopoverX` in `src/lib/popoverFit.js`; picker is
  `position:fixed` portalled to `document.body` so a padded / overflow-hidden
  thread (DM, group, channel, dock) cannot clip it. Tests:
  `tests/popoverFit.test.js`, `tests/reaction-picker-fit.test.jsx`.
- `725efe6` — Squad Hub event sheet: Edit opens the same EventForm Full schedule uses
  (title, time, pitch). Delete is withheld on the hub so staff do not
  confuse calendar delete with clearing the training plan; Full schedule
  and Home keep both. EventDetail Edit/Delete follow Duplicate's
  handler-required rule. Tests: `tests/squad-hub-event-sheet.test.jsx`,
  `tests/duplicate-event.test.jsx`, `tests/session-plan-share-hosts.test.jsx`.
- `cbcb61b` — Session Plan Share PNG: portal QC + Club Hub card look;
  golden PNG committed so CI no longer screenshots; capture tree in
  force-light; pitch line is EventDetail's `eventPitchLabel`. Spec:
  `claude/specs/2026-08-27-session-plan-share.md`.
- Session Plan Share pitch line is EventDetail's `eventPitchLabel` (stored
  `pitches.name`, e.g. D1 / D2). Combined Preseason golden uses D1, never
  "Pitch 2". Spec: `claude/specs/2026-08-27-session-plan-share.md`.
- Session Plan Share golden PNG is committed; `npm test` in CI no longer
  spawns Chrome to re-screenshot it (GitHub's runner Chrome hung past
  vitest's 15s). Refresh with `UPDATE_SESSION_PLAN_PNG=1`. Spec:
  `claude/specs/2026-08-27-session-plan-share.md`.
- Session Plan Share capture uses Club Hub Inter / ink / line / brand in
  force-light: squad small-caps, title bold, muted Abu Dhabi when, pitch
  if set; each block bordered with extra-bold `minutes min · title` and
  its category as a separate rounded pill (never concatenated onto the
  title). Coach notes stay spaced so the next header cannot overlap.
  Layout/QC (portal to `document.body`, no live BlockRow, no How it runs)
  is unchanged. Spec: `claude/specs/2026-08-27-session-plan-share.md`.
- Session Plan Share portals the capture tree to
  `document.body` with Lineup's off-screen wrapper, so html2canvas
  photographs stacked inline block flow (squad, title, Abu Dhabi
  date/time, pitch if set, then `minutes min · title` / category / coach
  note) instead of the live BlockRow `<ol>` inside EventDetail's Sheet.
  No Chip, no "How it runs". QC spies the element passed to html2canvas.
  Spec: `claude/specs/2026-08-27-session-plan-share.md`.
- `9c730bb` — Availability: coaches/managers can override the self-edit lock
  per event — Auto (the calendar rule), Open (parents can RSVP right up to
  the event), or Locked (closed to parents now) — from both the event form
  and the Availability sheet, enforced in RLS. Staff are never locked.
- `662fea3` — Session Plan Share photographs a share-only block tree (minutes · title,
  category chip on the next line, coach note, Total, session notes) instead
  of the live flex-wrap `BlockRow` plus "How it runs" `<details>`. html2canvas
  had been under-counting those rows, so the next drill's header painted over
  the previous coach-note. Same `shareElementAsImage` path; no canvas scale
  hack. Spec: `claude/specs/2026-08-27-session-plan-share.md`.
- `874d238` — Share on a training Session Plan card (next to Adjust)
  photographs the running order as it reads in Club Hub and hands the PNG to
  the phone share sheet, with `/schedule?event=<id>` so a signed-in tap opens
  that hour. Staff who can edit; same control on EventDetail and Squad
  Training. No PDF, no `publish_training`, no Clear plan. Spec:
  `claude/specs/2026-08-27-session-plan-share.md`.
- `1513012` — Applying a Squad Training focus chip (or a From-coaches / browse hour on
  the same `applyChipHour` path) writes the hour onto the selected night and
  leaves visibility at `staff` — Empty / Draft become Staff on the date
  strip after reload; already-`squad` is not downgraded. Never
  `publish_training`. From-scratch Session Plan still chooses draft / staff /
  squad; library add-drills-to-tonight is not a chip apply. Ruling:
  `claude/decisions/2026-08-27-chip-apply-is-staff.md`. Spec:
  `claude/specs/2026-08-27-training-shelf.md`.
- `e7e0cfe` — Availability: a parent/player can now clear their child's RSVP (click the
  selected status again), and self-service editing locks a calendar day before
  the event — 5 days for matches, 1 for training, never for socials — enforced
  in RLS. Staff are never locked. Reverses the 9-Aug staff-only-delete rule.
- `6385a90` — 🏉 **Two-week training-date strip on Squad Training** — a
  horizontal strip of this squad's next two weeks of training events (nights
  they actually train, not every day of the fortnight) above the Spotify chips
  on `/squad/:teamId/training`. Tap a date; chips apply to that night. Default
  tonight, else the next upcoming night; empty window disables chips. Status
  Empty / Draft / Staff from `training_sessions.visibility`; pitch booked lives
  on the date. Shared helper `src/lib/trainingDates.js`. Spec:
  `claude/specs/2026-08-27-training-date-strip.md`.
- `e3ba71a` — 🏉 **Pitch diagrams on opened drill cards** — nullable
  `drills.diagram_url` and a public `training-diagrams` Storage bucket
  (schematic drawings only: cones and letters, never a child's photo).
  Opened Session Plan / admin library editor show the image above the body
  via `src/components/DrillDiagram.jsx`; shelf and library list rows still
  have no thumbnails. Body stays prose
  (`claude/decisions/2026-08-21-drill-body-is-just-a-text-field.md`). Spec:
  `claude/specs/2026-08-27-drill-diagrams.md`.
- `0edfaa0` — 🏉 **Session Plan lists this squad's hours only** — START FROM A
  TEMPLATE and ADD A DRILL reuse `shelfRowsForSquad` from
  `src/lib/trainingShelf.js` (age from the squad name, contact from
  `teams.requires_contact`). Freestyle stays first. A U18B coach no longer
  sees U9–U10 / U11–U14 hours; a U12G QR coach never gets a contact Tackle
  option (omit, never a disabled dropdown row). EventDetail and Squad
  Training mount the same `src/components/SessionPlan.jsx` — no sibling
  picker. From coaches on the shelf uses the same filter. Director
  `/admin/training` Library, Templates and Publish stay whole-club. Spec:
  `claude/specs/2026-08-27-training-shelf.md`.
- `80e4f8f` — 🏉 **Squad Training chips pick one hour per focus for this
  squad** — three contact age packs with the same `chip_label`s were drawing
  as three Passing chips plus red "U18 is outside this template's U11-U14".
  The picker (`chipHours`) now groups by label and emits the tightest
  `squadFitsTemplate` match; a label with no match appears once, disabled
  (contact sentence, or "No hour for this age"). Library browse defaults to
  this squad's age + `teams.requires_contact`, with Show all ages. Spec:
  `claude/specs/2026-08-27-training-shelf.md`. The NEXT pull request cites
  this entry's squash SHA.
- `292392c` — 🏉 **Training shelf on Squad Training** — Spotify-style
  chips / tonight's hour / From coaches / library browse on
  `/squad/:teamId/training`. Focus chips apply a `session_templates` hour to
  tonight (copy blocks, `template_id`, `coach_edited_at`) and never call
  `publish_training`. Heart = like, star = favorite; no 1–5 ratings; no
  player photos. One migration `db/migrations/20260827_training_shelf.sql`
  (slugs, `chip_label`, `is_featured`, likes/favorites). Empty library is
  the starting state — no World Rugby seed. Spec:
  `claude/specs/2026-08-27-training-shelf.md` (building).
- `a105da7` — 🏉 **Coaches build their own training plans** — Jay, overnight:
  coaches and managers can now plan a squad's session themselves (freestyle or
  seeded from a template), keep their own squad-private drills and templates,
  and choose who sees each plan — draft (only me), staff (the squad's coaches),
  or the whole squad. They may SUGGEST a drill/template to the club library;
  only the Rugby Performance Director approves it in (which clears its squad
  ownership) or keeps it theirs. `db/migrations/20260827_coach_training_plans.sql`
  (APPLIED — additive; existing sessions default visibility 'squad', so nothing
  a family sees today changed): drills/templates gain team_id (NULL = club
  library) + submitted_at; training_sessions gain visibility + created_by; the
  manage policies widen to the owning squad's staff, and the session read/manage
  policies become visibility-aware. Proven both directions by
  `db/tests/coach-training-plans.sql` (13 checks, run green pre- and
  post-migration). The one trap: `events` has its own `created_by`, so the
  session policy qualifies `training_sessions.*` or every draft insert refuses.
  Rulings: `claude/decisions/2026-08-27-coach-training-plans.md`; plan:
  `claude/plans/2026-08-27-coach-training-plans.md`.

## 26 Aug 2026

- `1f411d5` — 📋 **Evening handoff: volunteer signup, staff view-as, the
  Actions outage** —
  `claude/handoffs/2026-08-26-evening-volunteer-viewas-outage.md`: five
  merges, two applied migrations, the conflicted-PR-silences-CI trap and
  the outage playbook. The NEXT pull request cites this entry's squash SHA.
- `35773f4` — 🔒 **Four chat-era grant ceilings trimmed to what was granted**
  — the 25 Aug re-capture's finding, closed: notification_opt_outs carried
  UPDATE, conversation_members the full default 7 verbs, message_reactions
  and message_stars UPDATE — untrimmed birth defaults in all four (REVOKEs
  had targeted PUBLIC/anon only). `20260826_trim_grant_ceilings.sql`
  (APPLIED to production, measured after: each verb set equals its
  migration's grant line exactly); `db/tests/grants.sql` §5 asserts the
  ceilings, self-test proved to fail on a re-granted UPDATE. Same PR:
  open-items strikes for this and for the ticks/list-dots pair, both closed
  by #433/#438/#441's routes. The NEXT pull request cites this entry's
  squash SHA.
- `f523873` — 👀 **Coaches and managers preview their squad as a parent** —
  Jay: "i want them to be able to view as a parent of their own age group so
  they can see what parents will see" (he declined other squads and the
  coach persona in the same answer). `parentPreviewTeamIds()` in
  `src/lib/scope.js` is the one rule: active coach/manager rows, own squads,
  parent persona only — read by the provider's gate (a stored preview in any
  other shape self-heals away like a forged admin one), the AccountMenu
  trigger, `ViewAsOptions` (staff variant: "My normal view", no Coach
  buttons) and the banner. Medic deliberately absent; pending rows count for
  nothing, as everywhere. Flips view-as.test's "is not offered to a coach"
  and memberships.test's "refuses a non-admin" — both were the old ruling's
  tests, rewritten with the refusals that still hold. The NEXT pull request
  cites this entry's squash SHA.
- `b108163` — 📮 **The staff notifiers stop bouncing their own To line** — the
  week's Resend dashboard read 21% bounced (83 of 396) and it was ONE bug:
  notify-approval, notify-access-request and notify-pitch-request sent
  `to: [MAIL_FROM]` — noreply@ on the SENDING subdomain, which nothing
  receives — so every send bounced its To copy while the bcc recipients
  delivered fine. Now `to: [MAIL_TO]`: the env var, or the root-domain shared
  mailbox derived by dropping "send." (the mailbox proven receiving on 18 Aug).
  The bcc design is untouched — it was never the problem.
  tests/mail-to-receivable.test.js guards the shape and was proven red against
  the bug. Measured while here: `_dmarc.adhquins-clubhub.com` EXISTS
  (p=quarantine, rua set) — the "no DMARC" line in the pasted health report was
  wrong, and the send subdomain inherits the root policy by spec.
- `c1a5132` — 💬 **The composer stays put on desktop** — Jay: the chat input
  box "moves up and down depending on where i scroll". `<main>`'s shared
  `desktop:pb-16` opened 64px of slack under the sticky composer, so it pinned
  flush to the viewport mid-scroll and rested 64px higher at full scroll. The
  padding now lives only in the non-conversation branch; conversations get no
  main bottom padding at all (the composer carries its own, safe-area
  included). Measured flush (gap 0) mid-scroll and at rest, desktop and phone,
  in the harness.

- `e2bc9da` — 📋 **Session handoff for the chat-parity and officers day** —
  `claude/handoffs/2026-08-26-chat-parity-and-officers.md`: ten PRs, the
  six reusable traps (specifier-text harness aliases, the one-behind
  cadence under two sessions, branch-names-as-paths, the merge classifier
  and its settings rule, drop-inside-rollback for applied tables, the
  bundle-marker control pattern), and the parked decisions.
  state-of-play's chat entry rewritten to LIVE.
- `ec159b4` — 🤝 **A committee member signs up without an age group** — a
  real one hit the wizard's "Choose at least one squad" wall the day it
  mattered, and Jay reversed his 17 Aug "keep the requirement" ruling
  (`claude/decisions/2026-08-26-volunteer-no-squad.md`). Helper-ONLY now
  skips the squad picker in the wizard and the roll-call
  (`needsSquads()`, the one shape rule); the INSERT policy and
  `private.handle_new_user` accept a squadless 'volunteer' — and only
  'volunteer' (`db/migrations/20260826_volunteer_no_squad.sql`, proven both
  directions by `db/tests/volunteer-no-squad.sql`; the trigger previously
  created NO request at all for that signup, leaving the person invisible
  to admins).
- `3fdf8ab` — 🩹 **The list dots pair from the shape my_conversations
  actually returns** — found LIVE by Jay minutes after the dots shipped:
  thread header green, chat-list row grey. `listMyConversations()` returns
  the INBOX shape (`{ conversation_id, other_id, … }`); the pairing filtered
  on table columns that do not exist there, built an empty map, and every
  list dot fell to offline. Fixed in ChatList and the dock; the new
  screen-level test renders the real row shape and FAILED against the bug —
  the component-only test could not see it (its lesson is written at the
  test).
- `7b88a8a` — 🖼 **The wallpaper follows the person, not the device — and the
  doodle is the default** — Jay: "can we make it do those things? also lets set
  the club doodle now as the default background for everyone on every device in
  all chats". `chat_prefs.background`
  (db/migrations/20260826_chat_background.sql): per-chat, per-person, owner-only
  RLS already on the table, NULL = default so changing the default never needs a
  migration. Both thread hooks read it and the picker writes it; the day-old
  localStorage key is retired unread. Default preset is now `doodle` (was
  `crest`), resolved client-side, retired keys fall back to it. Same PR: the
  desktop top-right island leaves conversation screens — measured pinning
  exactly over the thread header's ⋯ menu (z-40 over z-10; Jay: "scrolls up and
  out of view") — extending the 25 Aug chrome-free ruling to desktop. Harness
  gains a chatPrefs stub (`?background=` override); db/tests/chat-prefs.sql
  inlines the new migration and asserts set/clear/over-long-refused.
- `f21dafd` — 🖼 **Chat wallpaper no longer stretches blurry on long threads** —
  Jay, via a Grok diagnosis he verified: the photo sat on the growing stream
  wrapper with `background-size: cover`, so a long chat scaled it over
  thousands of pixels and all five papers went mushy. WhatsApp-style now: a
  sticky, viewport-height layer inside an absolute clip on the stream —
  always painted at screen size, messages scroll over it, in the full
  screens and the dock alike. Short-thread slack-eater fill preserved
  (measured in the harness); `background-attachment: fixed` avoided (broken
  on iOS). Two traps measured live and recorded in the DmThread comment:
  `min-h-full` regrew the layer to the wrapper, and `overflow-hidden` made
  the clip the sticky's scrollport so it never pinned — `overflow-clip` is
  the one that clips without becoming a scroll container. Same PR: the full
  club doodle Jay sent replaces `doodle.jpg`.

- `6863d47` — 📷 **Photos keep their shape, and the positioner becomes one
  honest circle** — three Jay observations that turned out to be one problem:
  chat pics "don't work as well as whatsapp", "the ios pic issue", and "can't
  we have a simple one size view and slide the photo around in the focus
  circle?". Every upload path ran the 600px SQUARE head-shot resizer (a
  landscape team photo lost both ends, and the focal-point picker was handed
  a photo whose edges were already gone — positioning was a no-op on the 1:1
  avatars), the 5 MB check ran BEFORE the resize (modern phones' 5–8 MB
  files refused while the resizer would have made them ~200 KB), and HEIC —
  every iPhone's default — was refused as "not a photo". Now: one shared
  gate `preparePhotoUpload` (type → keep-the-shape resize to 1600px → size
  LAST; HEIC re-encoded to JPEG where decodable, refused with save-as-JPEG
  advice where not) used by chat, player, staff and social-idea uploads; and
  the positioner is ONE 240px circle you slide the photo under — the
  three-shape preview strip previewed tile shapes measured from a
  SquadStaffCard layout that no longer exists (its own "re-measure when the
  tile layout changes" warning, broken silently). Focal point storage
  unchanged; zoom examined and deliberately deferred. Drag geometry proved
  in real Chromium via the harness scenario (−20px on a 4:3 photo → exactly
  75%, locked axis inert, clamped at the edge). Spec:
  `claude/plans/2026-08-26-photo-pipeline-and-positioner.md`.

- `affb2b6` — 📅 **The fortnight strip offers a choice on a busy day** — Jay:
  tapping a date in the Dashboard's "Next two weeks" with several events
  "pops up one of them with no choice to select any of the others like in
  the calendar view". It was `onSelect(dayEvents[0])` — the exact defect
  the calendar's day sheet was built to kill in Task 23, still alive in the
  strip. DaySheet extracted from `Schedule.jsx` to
  `src/components/DaySheet.jsx` (history and comments moved with it) and
  the Dashboard opens it for a multi-event day; a single-event day still
  opens the detail directly, and empty days stay untappable. The strip now
  hands the caller the WHOLE day in kick-off order, and the screen-reader
  count no longer inherits the three-dot cap (four events used to read
  "3 events").

- `c5493fb` — 🏅 **The ninth officer title: Social Media Director** — Jay,
  minutes after the eight shipped. The closed-vocabulary design working as
  designed: one migration widening the CHECK
  (`db/migrations/20260826_officer_title_social_media.sql`, APPLIED to
  production; harness assert 6 proves the title accepted, the invented-title
  refusal still holding, and — measured — the two live officer rows
  untouched by the harness's rolled-back drop), plus the matching
  `OFFICER_TITLES` entry so it renders last in the dignity order.

- `8b994d7` — 🏅 **Club officers: titles without rights** — Jay: a super
  admin tags people with the club's eight officer titles (President →
  Rugby Performance Director), "no special rights with those, just
  titles", appearing everywhere titles appear, and "those people should
  see their own titles too". New `public.club_officers` table — honours
  only, deliberately NOT on memberships because a membership row IS a
  grant; member-read / super-write RLS; the eight titles as a CHECK
  (a ninth is a migration, on purpose). `member_identity` unions the
  officer rows in, so the DM header, dock strip, person card and the
  More screen's You card all show them through the one shared
  IdentityBadges strip — officers first, in Jay's stated dignity order
  (pure-function ordered and unit-tested). New super-only Admin tab
  "Club officers" (`/admin/officers`, the rights-log pattern). APPLIED to
  production before the PR; `db/tests/club-officers.sql` green rolled
  back — five asserts including the discriminator (an ordinary admin's
  write REFUSED) and the closed vocabulary. Spec:
  `claude/plans/2026-08-26-club-officers.md`.
- `6f9bbe7` — 🟢 **Last active for admins + presence dots** — Jay: "admin
  should be able to see a last logged in item on every account" and, on
  finding the 25 Aug Online feature was one subtitle word: "fold that in,
  green dot for online, yellow dot for away … use the grey dot".
  `claude/plans/2026-08-26-last-active-and-presence-dots.md`, built the
  same session. HALF 1: `profiles.last_seen_at` — day-level, stamped only
  by the no-argument `touch_last_seen()` (12h server floor + once-a-day
  client throttle), backfilled from auth's last sign-in
  (`db/migrations/20260826_last_seen.sql`, APPLIED — 82 rows backfilled,
  measured); shown on Accounts rows ("· Active 24 Aug") and the Edit sheet
  ("Last active …" / "Never signed in"). Harness `db/tests/last-seen.sql`
  — whose assert 2 needed a real lesson: now() is frozen per transaction,
  so the first throttle assert PASSED against the injected fault; rebuilt
  around a 1h back-date and proven to fail against the throttle-less body.
  HALF 2: presence payloads carry online/away (visibility + 5-min idle),
  `PresenceDot` (green/yellow/grey — grey explicit by Jay's call) rides DM
  avatars on the Chats list, thread header (the subtitle's 'Online' word
  retired) and dock; groups and pickers get nothing. Everything ephemeral —
  the no-stored-presence ruling intact, last_seen_at its deliberate
  admin-only exception.
- `b739099` — 🎖️ **DM identity rows: every hat, always visible** — Jay,
  over a live DM with a multi-hat account: the header must say ALL of it
  ("Club Hub admin, U16B Assistant Coach, U18B Assistant Coach"), parents
  and players get badges with their squads, and the badges must not scroll
  away. New `public.member_identity` returns one row per active membership
  to any same-club member (identity only — the function has NO contact
  column; phone/email keep member_contact_card's gate), APPLIED to
  production with `db/tests/member-identity.sql` green and rolled back
  (five asserts incl. the multi-hat discriminator and a cross-club zero).
  Ordering lives in pure `src/lib/identity.js`; one `IdentityBadges`
  component serves the DM screen's sticky header AND the dock's pinned
  strip (no-drift rule). The screen's ChatHeader was ALREADY sticky —
  the badge strip below it was not, which was the exact scroll-away Jay
  saw; both now ride one sticky wrapper. Replaces #437's single best-role
  pill the day it shipped. Spec:
  `claude/plans/2026-08-26-dm-identity-rows.md`.

- `16c67ff` — 💬 **Two chat courtesies from Jay's live afternoon** —
  (1) *An unused DM stays out of the list*: the person card's Chat button
  creates the conversation on tap, so a look without a message littered
  both people's lists with "No messages yet" rows (four in one day,
  measured). `scopeChatRows` hides a DM whose `last_author_id` is null —
  my_chats fills that from the newest VISIBLE message, so photo-only chats
  stay, groups always show, and the row returns on the first message.
  (2) *The DM header says who they really are*: "you should see their badge
  and details" — a staff member's thread header now shows their actual
  title (Head Coach, not just Coach) and their squads, read from the same
  `member_contact_card` ruling the tap-a-name card uses, so the database
  still decides who may see what; a refused or failed card falls back to
  the old plain pill. Full-screen chrome only — the dock's header keeps its
  one-line detail.
- `f7dce1c` — 👤 **Person-card follow-ups from Jay's first live minutes** —
  (1) the card said "U10 MIXED · U10 MIXED" for a person holding two
  membership rows on one squad: `member_contact_card` now aggregates with
  `distinct` (`db/migrations/20260826_member_contact_card_dedupe.sql`,
  APPLIED to production and re-verified on the live card; harness assert 6
  carries the duplicate-row fixture and failed against the old body first).
  (2) Jay, over the Edit-person sheet: "how can i initiate a chat with this
  parent from their profile? doesn't seem possible currently" — the sheet
  gains the standard contact row (Call/WhatsApp/Email from the saved
  profile, Chat straight into the DM).
- `9d321f1` — 🔗 **Needs-attention names are doors** — Jay: "i can't click on
  those names… why not?" Each name on /admin/needs-attention now links to
  `/roster?open=<player id>`, and the Roster's `?open=` handler (previously
  add-player/import only) opens that player's detail sheet once the list has
  loaded — waiting out the load so a slow fetch cannot eat the link, and
  falling through to the plain roster on an unknown id. Navigation only: the
  attention screen still fetches no contact detail, so its privacy shape is
  untouched. Background, measured live the same day: the 25 Aug parent-link
  trigger is holding (zero unlinked parent memberships); the remaining
  "no parent on file" rows are players with PLAYER-role accounts (mostly
  U16B) or no account at all — a data-collection gap, with a policy question
  for Jay recorded in open-items.

- `a412763` — 💬 **Shared-chat-thread phase 4: the dock's channels ARE the
  main chat, and the thin dock is gone** — `FloatingChatDock` mounts
  `useChannelThread` + `ChannelThread` for squad, staff and club rows; its
  last hand-rolled stream/composer is deleted, along with its own
  loadThread/send/react plumbing (each thread loads and subscribes for
  itself; the dock only keeps its list fresh). Channels in the dock now
  carry inline thread replies, @mentions, fixture attach, pins, read
  stats, reports — and the announce-only LOCK: a parent sees the same
  "only staff can post" composer the main chat shows, where the old dock
  offered a composer and let the database refuse. Discriminating tests
  proven against the phase-3 dock: 4 fail there, 16/16 here. The CI red on
  PR #433's first push was the harness-stubs alias count, already fixed in
  the phase-3 commit.
- `a412763` — 🧩 **Shared-chat-thread phase 3: the channel moves out of its
  screen** — same split as phase 1, applied to `src/screens/Chat.jsx`: state
  and behaviour extracted verbatim to `src/lib/useChannelThread.js` (which
  also becomes `tallyByEvent`'s home, re-exported from Chat.jsx), rendering
  to `src/components/ChannelThread.jsx`. The screen keeps chrome: header,
  the ?thread=/?event= deep links, announce-only, clear-chat, wallpaper
  picking. Chat-screen tests passed UNCHANGED. Also pays a phase-2 debt the
  harness-stubs count assertion caught (its sixth catch): the two './'
  depth-variant aliases were added to the config after that phase's
  full-suite run, so the guard went red one commit late — both are now
  registered, and the lesson (run `npm test` after the LAST commit) is
  recorded in the guard itself.
- `a412763` — 💬 **Shared-chat-thread phase 2: the dock's DMs and groups ARE
  the main chat** — `FloatingChatDock` now mounts `useDmThread` + `DmThread`
  for `dm`/`group` rows (its hand-rolled bubble list for those kinds is
  deleted), so the dock's chevron carries the FULL menu: quote reply,
  forward, star, pin, delete on own, report on others', reply privately —
  which now STAYS IN THE DOCK, switching its panel. "More in full view"
  leaves the DM menu (it is complete); the header's expand icon remains.
  Channels stay thin until phase 4. Discriminating tests proven by running
  them against the phase-1 dock: 9 fail there, all pass here. Found live in
  the harness, invisible to jsdom: `useDmThread` sits IN src/lib so it
  writes `./memberships.jsx` / `./presence.js`, escaping the specifier-text
  aliases exactly as `harness/vite.config.js`'s own './auth.jsx' comment
  warns — the dock died with "useMemberships must be used within a
  MembershipProvider" until the two './' depth-variant rules were added.
- `a412763` — 🧩 **Shared-chat-thread phase 1: the DM thread moves out of
  its screen** — spec `claude/plans/2026-08-26-shared-chat-thread.md` (Jay
  approved same day: the dock should "function exactly as the main chat").
  State and behaviour extracted verbatim to `src/lib/useDmThread.js`,
  rendering to `src/components/DmThread.jsx`; `src/screens/DirectMessages.jsx`
  keeps only chrome (header, rename/nickname/block/leave/delete/wallpaper
  sheets). Behaviour-preserving by contract: the whole suite passes with
  ZERO test edits. Phase 2 points the floating dock at the same components.
- `abef0d7` — 👤 **The person card: tap any name, contact the person** — Jay:
  "click on a username, see their info and start a chat, email, call … from
  anywhere in the system." Designed, approved and BUILT the same day
  (`claude/plans/2026-08-26-person-card.md` + `-implementation.md`): tap any
  adult's name → bottom-sheet card with Call/WhatsApp/Email/Chat. Ruling C —
  a staff or admin role makes you contactable by ANYONE in the club
  (`claude/decisions/2026-08-26-staff-contacts-club-wide.md`, extending
  13 Aug's opt-in ruling club-wide); parents stay chat-only to everyone but
  the staff who manage them; player names keep opening Player Detail; your
  own name, "the system" and deleted accounts stay plain text. Enforced
  server-side by the new `member_contact_card` RPC, which nulls the contact
  columns in the database (`db/migrations/20260826_member_contact_card.sql`,
  harness `db/tests/person-card.sql` — five asserts incl. an injected-fault
  proof of the discriminator; `can_see_staff_photo` gains the matching arm).
  Wired on: /admin Staff + Accounts pending queues + Rights log, Home/Squad
  Hub staff cards, Player Detail parents, notice authors, group-thread
  member line. Migration APPLIED to production before the PR (function
  present, anon refused, harness green against live — measured).
- `f785a35` — 📋 **Session handoff for the 25–26 Aug batch** —
  `claude/handoffs/2026-08-26-desktop-chat-batch.md`: six shipped PRs, the
  session's reusable traps (docs-check local-vs-CI, the harness alias
  contract, execute_sql's last-statement-only results, the squatted 5199),
  and the two deliberate ticks v1 cuts now recorded in open-items.
- `242d442` — 💬 **Online status and WhatsApp ticks land in chat** — Jay:
  "we need an online status in chat" and "delivered and viewed check marks
  for messages like whatsapp has". ONLINE is Supabase Realtime PRESENCE
  with deliberately NO table — ephemeral, one shared channel per tab,
  keyed by profile so two tabs read as one person; the DM header says
  Online while they are. TICKS: one = sent, two grey = delivered, two
  accent = viewed, aria-labelled with the words. Viewed was already
  message_reads; new `message_deliveries` is written by the unread-badge
  fetch (every signed-in tab, every realtime event — genuinely "their
  device has it"), and BOTH tables gain an author-arm SELECT policy so a
  sender can finally see their own receipts —
  `db/migrations/20260826_chat_delivery_receipts.sql`, APPLIED to
  production before this merged: author sees receipts (measured 1/1), an
  outsider sees zero, in a rolled-back fixture. WhatsApp's group rule: ALL
  recipients, or the tick stays at the lower state. Proven in a real
  renderer: all three states + Online in one shoot. The NEXT pull request
  cites this entry's squash SHA.
- `dfeee1d` — 🖥️ **Desktop stops wasting the width** — Jay: "why can't we
  have things fill the entire width of the screen?" The shell's 1120px cap
  was already gone; the screens just never used the room. Three now do:
  Schedule's table renders from the DESKTOP breakpoint (820px) instead of
  `wide` (1280px), so a laptop gets columns instead of the phone list;
  Notices lays its cards in CSS columns (two at desktop, three at `wide`,
  break-inside-avoid on each card) so the board fills sideways while each
  card keeps its own height and sane line length; the chat list puts Direct
  messages and Your squads side by side in a two-column grid. Verified in a
  real renderer (harness at 1440px: grid measured 555px + 555px; the column
  utilities computed 3/18px/avoid). The NEXT pull request cites this
  entry's squash SHA.

- `bb4833b` — 💬 **The DM notice is gone for members, and the wallpaper
  fill is PROVEN on the full thread** — Jay's screenshots, both parts. The
  fill itself had shipped minutes earlier (`423ff1c`, 08:15; the
  screenshots were 08:23 against the cached app) — measured now in a real
  renderer with a 4-message thread at 1440×900 AND 375×812: paper meets
  the composer at both widths. The notice: members see NO banner in a DM
  (the dock never showed one), reversing the 23 Aug permanent-notice
  ruling — addendum in
  `claude/decisions/2026-08-24-groups-open-no-warnings.md`. The REVIEWING
  banner stays, and the welfare log is untouched. Harness gains ?dmCount=
  so a shorter-than-viewport thread can be reproduced. The NEXT pull
  request cites this entry's squash SHA.
## 25 Aug 2026

- `423ff1c` — 🖼️ **The wallpaper is the slack-eater, and the dock grew its
  chevron.** Two of Jay's 26 Aug reports in one pass. (1) With few messages
  the paper was a small patch over the bubbles and bare surface above —
  the wallpaper wrapper is now `flex-1 justify-end` in both threads, so
  the paper covers the whole message area and the bubbles bottom-anchor
  (measured: 552px of paper over 3 bubbles, `harness/shoot-chat-layout.mjs`
  `?few=1`). (2) The floating dock's bubbles had no chevron menu at all —
  they now carry Reply (DMs/groups, quotedId through the dock's own send),
  Copy, and "More in full view" for everything richer, which keeps the
  dock's deliberately-thin contract navigable instead of invisible. Also:
  the harness now serves the app's `public/` (its wallpaper scenarios were
  404ing every paper and rendering bare surface while claiming paint).
- `fac1ffa` — ⌨️ **The keyboard fix, second half — the first was necessary
  and not sufficient.** Jay: "composer is still acting up", after the
  slack-eater. Two missing layers: Android Chrome's keyboard only PANS the
  visual viewport unless `index.html` opts into
  `interactive-widget=resizes-content`, and `min-h-screen` is 100vh, which
  never shrinks for a keyboard even then. New `.min-h-app` (dvh over a vh
  fallback, order load-bearing, `src/index.css`) replaces `min-h-screen` on
  the shell and every full-height screen. Proven in a real engine by
  `harness/shoot-chat-layout.mjs` simulating exactly what resizes-content
  does — layout viewport shrunk to keyboard height, composer at 414px of a
  430px viewport; guarded at the file level by
  `tests/viewport-keyboard.test.js` because jsdom has no keyboard.
- `545778e` — ✅ **`a5c5efd`'s player_parents migration is APPLIED and
  PROVEN** — the unapplied migration the re-capture found, run with Jay's
  yes. Trigger + helper measured live; backfill wrote 21 rows
  (player_parents 62 → 83, zero children left with a parent membership and
  an empty list); trigger fault-injected in a rolled-back transaction (one
  profile-linked primary row from a fixture membership, rollback confirmed
  with a positive control — the db:check harness needs SUPABASE_DB_URL,
  which this machine does not hold, so the injection was done through the
  same rolled-back mechanism it uses). triggers.sql's ⛔ NOT LIVE marker is
  replaced by the applied record.

- `82dfeb9` — 💬 **The keyboard stops marooning the composer, and every
  chat name is a door.** Jay's screenshots: a DM with a handful of messages
  left the shell's min-h-screen surplus BELOW the composer, so the phone
  keyboard's pin-to-bottom scrolled it to mid-screen over a void.
  Conversation screens are now a flex column with a slack-eater ABOVE the
  stream — the composer IS the document bottom (measured: 16px, the pb-2,
  by `harness/shoot-chat-layout.mjs`). And the squad channel gains the
  group-DM courtesies: "Reply privately" on the chevron menu and tappable
  author names (message and reply bubbles, groups included) that open the
  1:1 — permission stays `open_conversation`'s call in the database.
- `0465064` — 🗄️ **`db/schema/` re-captured in FULL — twelve days of drift,
  the largest reconciliation the directory has absorbed.** Measured against
  pg_catalog: 13 whole tables missing, 11 drifted (conversations' group-chat
  rewrite had falsified two captured constraints), 25 policies missing (one
  ENTIRE storage bucket, chat-media) + 5 drifted, 22 functions missing +
  3 stale bodies + 2 unattributable proacl drifts, 15 triggers missing,
  grants.sql's "anon holds everything" headline INVERTED (live: anon holds
  nothing anywhere), and the "exactly one table is published" claim inverted
  (live publishes six, availability included). Full account: the 25 Aug
  entry in `db/schema/README.md`. ⚠️ **And one drift ran the other way:
  `a5c5efd`'s player_parents migration WAS NEVER APPLIED — the capture
  described intent as fact.** Marked ⛔ NOT LIVE in triggers.sql; applying it
  is an open item needing Jay.
- `fdadfa3` — 🏉 **Phase 2 of the roster builder: the pitch is a SHEET
  STYLE, and circles drag.** The Pitch view's drawing moved into
  `src/components/PitchDiagram.jsx` and serves two customers: the
  interactive view (which gained drag-a-circle-onto-another — onto a
  filled circle swaps, onto an empty one moves; a tap is a drag that never
  travelled) and the share facsimile, where a Sheet style toggle
  (List/Pitch, remembered per device) puts the field graphic ABOVE the
  full-name lists — never instead of them, per the 14 Aug full-names
  ruling. Drop decision is `nearestSlot()` in `rosterFormats.js`, with a
  test proving no preset has two circles within one drop-reach. Proven in
  a real browser by the extended `harness/shoot-lineup.mjs`.
- `e4435a2` — 🖼️ **Chat wallpapers are five photo papers; crest letterhead
  is the default on every chat.** Jay, 25 Aug 2026: land exactly five —
  harlequin, dusk, crest, doodle, kit — painted as covered JPEGs washed
  toward `--surface-rgb`, each decoded from its `.b64` on
  `cursor/chat-wallpapers` and verified by magic bytes (`ffd8`). Empty
  storage, unknown keys, and the old gallery (`plain`, `green`, `warm`,
  `hoops`, maroon, sky, rose, slate, club, dawn, pitch, pitchlines, balls,
  shield) fall back to `crest`. There is no `plain`. Device-level, still
  `chat-background`. Plan: `claude/plans/2026-08-25-chat-wallpaper-papers.md`.
  ⚠️ **Was FOUR entries chain-citing three SHAs that exist in no clone**
  (`44014d5`, `fe00815`, `6aca995` — a Cursor session citing its own
  branch commits, which died when the work landed as this one push), and
  `main`'s docs-check went red at `e4435a2` because of it. Consolidated
  here to the SHA that actually exists — the cite-the-squash rule in
  `CLAUDE.md` is about exactly this.
- `861c731` — 🧹 **The nulled `players.position` / `players.unit` columns are
  DROPPED, and the schema captures caught up on the pieces this change
  touched.** `20260825_drop_players_position_unit.sql`, applied to production
  after the #419 deploy was verified live from the served bundle — evidence
  chain in the migration header (all-NULL measured, `select('*')`-only
  readers, rolled-back dry-run first). tables.sql now carries
  player_positions + player_units and the players column list as they
  actually are; policies.sql gains the three `manage` policies (grades /
  positions / units — the first two were ELEVEN DAYS uncaptured). Found and
  recorded while there: the capture is FIFTEEN tables behind live — measured,
  57 vs 42 — now its own open-items entry.
- `60735db` — **The roster builder grew three views over one lineup** —
  Jay: drag-and-drop, format-aware, and keep the simple path. Quick (the
  14 Aug tap flow, untouched — its tests pass byte-identical), Slots
  (shirt numbers + position names from `src/lib/rosterFormats.js` presets,
  drag-to-reorder via a hand-rolled pointer hook, no dependency), Pitch
  (per-format field layout, tap-to-fill, tap-two-to-swap). Sparse slot
  model: `sort_order` IS the shirt, holes survive the round trip. Drag
  proven in a real browser by `harness/shoot-lineup.mjs` — jsdom cannot
  see it. Supersedes the 14 Aug no-drag ruling:
  `claude/decisions/2026-08-25-drag-reopened.md`; plan:
  `claude/plans/2026-08-25-roster-builder-three-views.md`.
- `1d3bafe` — 🏉 **Positions are STAFF-ONLY, picked as forward-or-back then
  a sub-selection** — Jay, both halves: "forward or back selectable, then a
  sub selection for the rugby positions under those two main categories" and
  "positions should only be viewable and editable by staff". The second half
  REVERSES the 14 Aug squad-readable ruling on player_positions, and since
  RLS grants rows, not columns, it forces the data OFF the squad-readable
  players row: `player_positions` tightens to the player_grades shape, new
  `player_units` carries forward/back, and `players.position`/`players.unit`
  are backfilled from, then nulled (DROP follows a later post-deploy
  migration) — `db/migrations/20260825_positions_staff_only.sql`, NOT YET
  APPLIED; it must run before this deploys. Staff screens DECORATE their
  rows from the staff-only maps so grouping/search/sort/table cells read
  `player.position` unchanged; parents lose the position column, the
  roster-row and detail-hero position lines, and the forwards/backs
  grouping. PlayerForm nests position checkboxes under the unit and drops
  the standalone single-select; the roster's inline editor writes
  player_positions primary-first via optgroups.
- `776eebb` — **The flip is DONE and VERIFIED LIVE.** Jay switched "Confirm
  email" OFF; a throwaway signup came back with a session, the welcome sent
  (`POST | 200` on notify-welcome two seconds later), and the door question
  is answered: GoTrue autoconfirm is INSERT-then-Confirm()-UPDATE, so **door
  two is the live path** and a single-door INSERT trigger would have sent
  nothing, silently. Details appended to
  `claude/decisions/2026-08-25-remove-email-confirmation.md`.
- `80c887e` — **The welcome harness counts only welcome queue rows.** Its
  first production run failed honestly: assertion 1 measured a pg_net delta
  of FOUR because the fixture's pending membership and access_request fire
  the other notify triggers too. Every count now filters on the
  `/notify-welcome` URL. Applied live the same hour (the deployed harness is
  the fixed one); this commit is the repo catching up with production.
- `4419ffd` — **Email confirmation removed; the mail is now a welcome** —
  Jay's decision, in his words: "remove the need to confirm an email
  address … just sending an email confirming they created their account and
  welcoming them to ClubHub". New `notify-welcome` edge function and a
  two-door welcome trigger gated by `profiles.welcomed_at` (house pg_net
  pattern); `apply_signup_intent` lost its confirmed-at gate and also runs
  at insert for born-confirmed rows; Login signs a fresh signup straight
  in. The dashboard toggle is the LAST step and Jay's click —
  `claude/decisions/2026-08-25-remove-email-confirmation.md`.
- `2ea3e5c` — 💬 **The floating dock's panel now stays pinned to the newest
  message.** Jay: chats opened from the bubble didn't show the latest
  message — the `useStayPinnedToBottom` fix only reached the full chat
  screens, because it pins the WINDOW and the dock scrolls its own div.
  The dock's one-shot `scrollIntoView` fired when the data arrived and
  landed short once signed photo URLs grew the list (same failure as
  #395). The hook now takes an optional container ref — same intent-based
  stick gate, same three re-pin triggers — and the dock passes its panel.
- `5319a73` — 🔎 **The giant avatar was an INLINE span, and one word fixes
  it** — Jay: "I just looked at the app, and it does not look like it was
  fixed", after two rounds of everyone (me included) believing the
  afternoon's contact-card rework had cured it. Diagnosed on the LIVE site
  through Jay's logged-in Chrome: FaceStack faces measured 600×600 with
  `h-7 w-7` in their class list and `28px` in computed style — a bare
  <span> is display:inline, and **height/width do not apply to inline
  boxes**; the photo rendered at intrinsic size and overflow-hidden cannot
  clip an inline box either. It hid from every earlier check because flex
  items are blockified (StaffRow's row) and the monogram branch carries
  `grid` — only FaceStack's span-in-span, and only for staff WITH photos,
  stayed truly inline; the harness's collapsed squads had monograms only,
  which is the exact gap the pending harness-stub task exists to close.
  The fix is `block` on StaffAvatar's photo span; the test pins the class
  (red before the fix). The NEXT pull request cites this entry's squash
  SHA.
- `edf7615` — 🩹 **Outlook Safe Links / CefSharp scanner rejections never reach Sentry.**
  Production issue JAVASCRIPT-REACT-3 was `Object Not Found Matching
  Id:…, MethodName:…, ParamCount:…` — no stack, 0 users, culprit the
  origin, mechanism Sentry's own `onunhandledrejection` even with
  `integrations: []`. `reportError` and the global handler skip that
  pattern (digits and method word can vary); `Sentry.init` also
  `ignoreErrors` it and `Non-Error promise rejection captured`. Real
  unhandled Errors still report. Frontend only. The NEXT pull request
  cites this entry's squash SHA.
- `a5c5efd` — 🪪 **Creating a child as a parent writes `player_parents`, and existing
  parent-memberships with an empty list are backfilled.** Admin Needs
  Attention was tagging the truth: most create paths never wrote that
  table (`register_my_player`, `apply_signup_intent`, AccessBuilder
  granting a new child). A trigger on `memberships` copies the adult's
  profile (name, email, phone) when `role = 'parent'` and a `player_id`
  is set; self-register stays `role = 'player'` and is left alone.
  Coaches saving from PlayerForm with no parent, and the importer, still
  write no row — the badge keeps telling the truth.
- `4e0f377` — 💬 **The floating dock speaks the same bubble language as a DM, from one
  shell, and Home squad contacts are role-ordered without wrapping on a
  phone.** Jay, 25 Aug: a 1:1 in the dock still printed the other person's
  name in brand-red on every incoming paper bubble; own bubbles were the
  old green rectangle; stamp/emoji did not match the round 3/4 thread.
  `src/components/ChatBubble.jsx` is now the one shell — DirectMessages
  Thread, `MessageRow` (channel + nested replies), and `FloatingChatDock`
  all render it — so a fourth surface cannot miss the pass the way
  `Chat.jsx` missed the DM language and the dock missed #410. 1:1: no
  author name on incoming (the header already names them), no "You" on
  own. Groups / staff / squad: name on theirs only. Own: quins-green
  `bg-accent-deep`, stamp inside, chevron, reaction trigger beside,
  tallies as a corner pill. StarredMessages and ChatList stay list rows,
  not bubbles. Same day: Home Squad contacts reverse the old "no role
  order" ruling — Head Coach, Team Manager(s), Assistant Coaches, Medics,
  name order within a role; a "Head Coach" title or the `is_head_coach`
  flag still beats a plain coach (`src/lib/squadStaff.js`, used by
  `listMySquadStaff`, `listSquadStaff`, and `SquadStaffCard`). The
  editorial Card row keeps 44px actions but they no longer `flex-wrap`
  onto a ragged second line at phone width. Frontend only.
- `7ea4c79` — 💬 **Channel threads use the same bubbles as a DM.** Staff / squad / club
  at `/chat/:teamId` still rendered the old `MessageRow` layout Jay
  screenshotted on U11 Mixed · staff: rectangular green/white bubbles, a
  "You" label, avatars, role pills as chrome, and red Reply/Pin/Delete/Report
  links under every row. DMs already had the round 3/4 language
  (`DirectMessages` Thread — quins-green own bubbles, stamp inside, chevron
  menu, reaction trigger beside, tallies as a corner pill). `MessageRow`
  now speaks that language; channel-only bits (staff pill on *their* name,
  nested replies, fixture cards, read-stats, Pin for staff, Report) live in
  the chevron or inside the bubble. Frontend only.
- `ed950de` — 🏉 **Squad Hub’s picker is yours first, in the same Card language as Chat.**
  Bare `/squad` stops being a “Which squad?” dump of full-width name rows.
  Squads this person actually belongs to lead; an admin then sees the rest of
  the club. Each row is an editorial Card line: circular U-band mark, ink on
  paper, role or format on the muted line. One-squad coaches still land
  straight in. Parent-only accounts still meet the staff empty state. Frontend
  only.
- `e503f30` — 📣 **The `test` job pings the Grok Bot webhook when it finishes** — Cursor
  GitHub `ci-passed` events are dropped on cloud-agent PRs, so GitHub Actions
  itself is the source of truth. After `npm test`, a `continue-on-error` curl
  POSTs job status (success and failure, `always()`) to
  `GROK_BOT_CI_WEBHOOK_URL` with `GROK_BOT_CI_WEBHOOK_KEY`. GitHub rejects
  `secrets` in `if:` (Tests #989 never parsed the file), so the empty-URL
  skip is in the shell — clones without secrets stay green. Echoes
  `webhook HTTP <code>` only; never the URL or key. Its own branch could not
  cite this squash SHA, so this entry does.
- `7d827f9` — 🃏 **Member-app cards speak one language, and loading placeholders match them.**
  Home's Squad contacts retire the glossy poster tiles (photo/gradient fill,
  white type over a scrim) for the same editorial Card as Chat: circular
  face, ink on paper, 44px contact actions in a list. Notices and Squad Hub
  drop the first-load spinner for skeletons in the shape of those cards —
  NoticeRow, calendar/doors/tracking, and the contacts rows on Home's own
  skeleton. Frontend only.
- `86e5e72` — 🔌 **Cursor (cloud and local) uses graft, and Cloud Agent Builds build the
  structural index first.** `.cursor/rules/graft.mdc` is always-apply;
  `AGENTS.md` tells Cloud agents to install/build if `graft/` is missing and
  never skip graft for Club Hub navigation; `.cursor/environment.json` runs
  `.cursor/install.sh` (`npm ci --include=dev`, install `@nanonets/graft`
  into `$HOME/.local`, `graft build` — never `--deep`, no LLM concept map,
  no API key). `graft/` stays gitignored. `scripts/netlify-ignore.mjs` skips
  `.cursor/` so this does not deploy. Its own branch cannot cite this
  squash SHA, so this entry does.
- `da5c52c` — 🪪 **Admin’s waiting count leads to Accounts** — the sidebar badge is
  `countAdminWaiting` (pending memberships plus people waiting for access),
  but `/admin` was a chooser that never mentioned that number. The landing
  now shows the same count on a card that opens Accounts, and on the Club
  Admin card whose home is already Accounts. Zero or a failed read still
  renders nothing. Frontend only. Its own branch could not cite this squash
  SHA, so this entry does.
- `73ce4ca` — 🗓️ **Schedule stops being an unpaginated wall** — fixtures group by club-calendar
  month with sticky month and column headers below the filter bar; Upcoming /
  Results / Calendar, age group and type filters share one bar; the native
  age-group `<select>` is a pill dropdown (still one line at any squad count,
  not a wrapping pill row). Later months reveal in document order via
  "Show more months", never numbered pages. Frontend only.
- `f4f8add` — 🧾 **Waiting for access splits into “ready to approve” and
  “didn’t finish setup”** — Jay’s queue was filling with logins that never
  finished RollCall (no name, no role, Give access anyway). People who
  actually asked stay at the top with the builder; unfinished logins sit
  below, Dismiss first, Give access behind “I know them”. Same
  `waiting-for-access` section, locked 2.0 tokens. Pairs with the
  wizard-before-confirm change.
- `f4f8add` — 📝 **Collect who you are before the confirmation email** (#403)
  — confirming the address was reading as finished. Wizard (name, ticks,
  squads, children) now runs before `signUp()`; answers ride in
  `signup_intent`; children are created only after `email_confirmed_at`.
  ⚠️ Apply `db/migrations/20260825_signup_before_confirm.sql` before this
  frontend ships.
- `16c419f` — 🎨 **The patterns actually paint, and the picker opens as a
  sheet** — Jay, minutes after the gallery deployed: "most of the
  backgrounds don't have anything in them" and "when i click chat
  backgrounds nothing happens at all". Two root causes. (1) Every SVG
  preset carried `%23` (an already-encoded `#`) inside a source that then
  went through `encodeURIComponent` — double-encoded to `%2523`, so after
  the browser's single decode the colour was the literal string
  "%23808080": invalid, and nothing painted. **Inherited from round 3 —
  the original doodle never drew either**, which is a fair share of why
  chat always looked plain. Colours are now written as `#` and encoded
  once; a test decodes every data URI and demands real hex colours (red
  against the fault, and proven by canvas pixel-count in the harness: 720
  inked pixels where there were 0). (2) The picker card rendered near the
  TOP of the conversation while useStayPinnedToBottom held the reader at
  the BOTTOM — it opened offscreen and the pin kept it there. It is now a
  Sheet (portaled since #400), so scroll position cannot matter; measured
  at rest fully on-screen in the harness. ⚠️ A hidden browser tab freezes
  CSS animations at frame 0 — the sheet measured as "offscreen" until
  `getAnimations().finish()`; noted so the next headless measurement of a
  Sheet doesn't read the artifact as the bug. The NEXT pull request cites
  this entry's squash SHA.
- `817dfae` — 🖼️ **Chat wallpapers grow into a gallery, and DMs lead the
  list** (#401) — Jay: "we need better chat backgrounds", ruled down to "too few
  choices" (claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md), and
  "DMs should always be at the top of the chat screen". Four round-3
  presets become 17 in four groups (Colours / Gradients / Patterns /
  Club), same architecture: low-alpha overlays, inline SVG, no uploads,
  device-level, one wallpaper for every chat; stored `green`/`warm` keys
  survive. The picker becomes a shared component
  (src/components/ChatBackgroundPicker.jsx) and — the bug-fix half —
  Chat.jsx finally PAINTS the wallpaper and offers the picker, which the
  card always promised and only the DM thread delivered; a parent's ⋯
  menu now exists holding exactly that one entry. The chat list reorders
  to Direct messages → Your squads → Archived, chips and sidebar
  matching. Verified in the harness dm-thread scenario: four groups, 17
  swatches, a pick applies and persists. Its own branch could not cite
  this squash SHA, so this entry does.
- `6b300d3` — 🎛️ **Three masthead fixes from Jay's phone, one morning** (#400) —
  (1) The install sheet opened MANGLED inside the masthead pill, on phone
  and desktop: the auto-hide wrapper's `transform` had made the glass
  island the containing block for the sheet's `position:fixed`, and
  `overflow-hidden` clipped it — the exact failure Sheet.jsx's header
  predicted the day it chose not to portal. Sheet now portals to
  document.body, for every caller. (2) The masthead "App" pill squeezed
  the wordmark to "QUINS CLUB H…" on a zoomed Samsung (~320 CSS px); Jay
  chose moving it over compacting it, so it is now "Get the app" in the
  account menu (GetAppMenuItem/GetAppSheet, still AppButton.jsx, the
  HelpSheet ownership pattern) and the row is back to one trigger.
  (3) "Turn them on" on the Home nudge links to /more#notifications and
  More scrolls the anchored section into view — React Router does not do
  hashes on its own. Verified in Chromium at 320px and desktop; the hash
  scroll and its no-hash control are proven against an inverted-guard
  fault. Its own branch could not cite this squash SHA, so this entry
  does.
- `4190599` — ✍️ **The composer greets by first name** — Jay, straight
  after confirming the pin fix ("that fixed it, chat opens at the bottom
  now"): the DM placeholder carried the other person's FULL name; now just
  the first — "Message Harriet", not "Message Harriet Zephyr". First word
  of the (nickname-aware) name in the thread and in the desktop dock's DM
  panel; groups and squads keep their whole title — "U13 Mixed"
  first-worded would be "U13".
- `5d2ec9f` — 🦇 **The app icon is the bat-wing crest** (#397) — the icon
  iteration continued in its own session; recorded here because its branch
  could not cite this squash SHA, so this entry does.
- `1c9e3a5` — 🧷 **Stickiness becomes INTENT, and the pin gets three
  triggers** — Jay's phone, after #395 AND #396: "still not snapping to the
  last read message ... all are old and read already". The mechanism that
  survived two deploys, found by walking the event order rather than by
  reproduction (the harness's new `dm-thread` scenario pins perfectly in
  desktop Chromium): Android's scroll anchoring fires adjustment scroll
  events when photos load above the viewport while the page has also grown
  below; the old gate read "far from bottom" off such an event, flipped
  false, and every later re-pin was silently skipped. Now only a scroll
  that moves UP unsticks (`src/lib/useStayPinnedToBottom.js`, one hook
  replacing the two screens' duplicated copies), and the re-pin fires from
  a body ResizeObserver, a capture-phase image `load` listener, AND a 6s
  ticker after each messages change — the phone showed any single trigger
  can be starved. Also: the DM reaction trigger centers on its bubble
  (Jay: "put the reaction button centered on every message"), and the
  harness gains `stubs/chatMedia.js` with LATE-signing photos so the
  growth-after-open shape is reproducible at will. (#398) Its own branch
  could not cite this squash SHA, so this entry does.
- `a2f407b` — 💬 **Chrome-free conversations** — Jay: "lets try the no
  bottom menu inside a conversation". WhatsApp-style: inside a thread the
  phone shows NO tab bar and NO masthead island — the chat header pins at
  top-0 (safe-area in its padding, covering the notch) and the composer
  sits on the bottom edge, its 74px tab-bar lift gone with the bar. The
  way back is the header's ← and the system back gesture. The chat LIST
  and /chat/starred keep the chrome; desktop is untouched (sidebar +
  top-right island). ⚠️ **View-as keeps ALL chrome even in a thread** —
  the banner is the way out of a preview and must never disappear (same
  contract as the masthead auto-hide's disabled flag); the header sliding
  under the banner there is the accepted cost. `conversationScreen` in
  AppShell decides by route. This retires #389's accepted 64px gap. (#396)
  Its own branch could not cite this squash SHA, so this entry does.
- `c69da5f` — 📌 **The reader stays pinned to the newest message as the page
  grows** — Jay's phone, same morning: "still when i open a chat i have to
  scroll down", composer floating mid-content in the screenshot. The #394
  scroll fired once, when the DATA arrived — but chat photos render as
  NOTHING until their signed URL lands (src/components/ChatPhoto.jsx) and
  then grow the page below the viewport, so photo-heavy threads opened
  short by exactly that growth. A ResizeObserver on the body re-pins to
  the end on every growth while the reader is near the bottom, and leaves
  them alone once they have scrolled up into history. This also sits the
  composer back down against the tab bar — its floating-high look was the
  sticky bar shown mid-scroll, not its resting place. (#395) Its own
  branch could not cite this squash SHA, so this entry does.
- `422b594` — 📱 **Opening a chat lands you on the newest message, above the
  chrome, with "New" marked** — Jay: "chat is not working correctly with the
  bottom and top menu bars", "the latest message is ... sometimes below the
  input bar", "new messages should be highlighted somehow when a chat is
  opened". Three fixes: the squad/club composer lifts 74px+safe-area above
  the phone tab bar (the same lift the DM thread got in #389 — Chat.jsx was
  missed); both screens now open by scrolling the window to the TRUE
  document end instead of `scrollIntoView({block:'end'})`, which aligned
  the anchor with the viewport bottom — exactly where the sticky composer
  and tab bar overlay it; and Chat.jsx grows the DM thread's "New" divider,
  with unread dots captured at the moment of opening so the
  mark-read-on-arrival effect no longer wipes them under the reader.
  `tests/chat-open-view.test.jsx`; jsdom's missing `window.scrollTo`
  stubbed in `src/test/setup.js`. (#394) Its own branch could not cite this
  squash SHA, so this entry does.
- `9f31939` — 📌 **The app icon is the club pin** (#393) — Jay walked the icon through a night
  of looks (green tiles, bigger crest, synthetic gold/silver/gunmetal pin
  rims) and landed on the real thing: an enamel-lapel-pin rendition of the
  full crest (`harness/pin-photo.jpg`, an AI-generated product shot) cut
  from its background — the first cut shaved the silver rim and Jay caught
  it — on an accent-green gradient, lit top to deep base ("the gradient but
  with C"). Built by `harness/make-icons-pin.py` (parameters, the cut
  method, and the maskable safe-zone arithmetic are documented in its
  header); `harness/make-icons.mjs` is superseded-and-kept with a pointer.
  The full wording stays on the pin — badge-as-object, consciously
  reversing the 14 Aug strip-the-wording brief. Its own branch could not
  cite this squash SHA, so this entry does.

## 24 Aug 2026

- `0006574` — 📝 **Chat round 6 and the badge closed** (#392) — `dcd0196`
  cited, plan marked shipped. Its own branch could not cite this squash SHA,
  so this entry carries it now.
- `dcd0196` — 📌 **Pinned chats and archive** (#391) — the two navigation ideas
  parked "for a later round", picked up by Jay's "keep going"
  (`claude/plans/2026-08-24-chat-pins-archive.md`). A ⋯ menu on every list
  row: Pin sorts the chat above everything in its section with a 📌;
  Archive removes it from the sections AND the unread arithmetic
  (WhatsApp's rule — you asked to stop hearing about it) into a
  default-folded section at the bottom; search still finds it. Backed by
  `chat_prefs` (`db/migrations/20260824_chat_prefs.sql`, owner-only RLS,
  the nicknames pattern — APPLIED and measured, harness green with an
  injected read-policy leak caught). Merged and verified live the same
  night; its own branch could not cite this squash SHA, so this entry does.
- `382f5da` — 🔢 **The unread count reaches the app icon** (#390) — Jay: "we need
  to add a new chat message count to the app icon". The Badging API on the
  installed PWA: the dock-badge recount hands its REAL number to
  `navigator.setAppBadge` (icon and dock dot cannot disagree), sign-out
  clears it, and the push handler marks the icon with the platform's
  generic badge while the app is CLOSED — the worker cannot know the
  count, so the app corrects it to the number on open. A silent no-op in
  a plain tab, and on platforms without the API. Its own branch could not
  cite this squash SHA, so this entry does.
- `271b54d` — 📝 **Rounds 4-5 records closed** (#388) — `043f9c3` and
  `bc971f8` cited, plans shipped, the handoff extended with the night's
  second wave of traps. Its own branch could not cite this squash SHA, so
  this entry does.
- `bc971f8` — 📱 **The mobile thread fits its chrome** (#389) — Jay's phone
  screenshot: "chat isn't playing nice with the bottom menu bar, several
  things wrong." Three fixes: the message menu FLIPS UPWARD near the
  viewport bottom and outranks the chrome at z-50 (half its items were
  under the tab bar, unreachable); the composer and forward bar lift
  74px+safe-area above the floating dock on phones (desktop keeps
  bottom-0); and the thread header pins BELOW the glass masthead instead
  of under it, taking the privacy notice with it. The accepted cost — a
  64px gap above the header while the masthead is auto-hidden — and the
  alternative (chrome-free thread screens, WhatsApp-style) is Jay's call,
  recorded here so it is not re-derived. Its own branch could not cite
  this squash SHA, so this entry does.
- `043f9c3` — 🧭 **Chat navigation: the list stops being a scroll** (#386) — Jay:
  "once there are lots of chats ... they will have to scroll too far down".
  Four pieces (`claude/plans/2026-08-24-chat-navigation.md`): the sidebar
  grows chat categories under Chat (the Squad Hub sub-item pattern), a chip
  row on the list itself (All · Unread·n · Squads · Groups & DMs — the
  phone's answer, driven by the same ?filter= as the sidebar so the two
  cannot disagree), foldable sections remembered per device, and unread
  rows sorting first. All client, no migration. Pins and archive offered
  and parked. Merged and verified live the same night; its own branch
  could not cite this squash SHA, so this entry does.
- `ae1513c` — 🧾 **Accounts: queues first, Approval emails folds away, the list goes
  dense** (#387) — Jay's rethink of the Club Admin Accounts tab, plus a pitch nit
  in the same breath. Everything WAITING now leads the page (pending staff,
  pending players, waiting-for-access, dismissed) with the Approval emails
  settings card moved BELOW them all and collapsed by default — its header
  carries the switched-on count, so opening it is only needed to change
  something (order and collapse both pinned by tests, both proved against
  injected faults). The account list dropped a Card per person for one card
  with hairline rows: 28px monogram, name, and email · access-summary on a
  single truncating line — every account still renders. And Allocation's
  "Waiting for a pitch" rows now lead with the fixture's DATE ("the events
  don't show a date unless you click them"). (No SHA — this branch's entry;
  the next pull request cites the squash.)
- `87ba817` — 🗒️ **Allocation details-first + away exclusion MERGED** (#385)
  — the squash SHA for the entry below, which its own branch could not cite.
- 🗒️ **Allocation clicks open the fixture's DETAILS, and away matches leave
  the assignment area** — Jay's two follow-ups within the hour. A click now
  opens the same EventDetail sheet the Schedule uses (hero, competition,
  notes) with one Allocation-only extra: an Assign/Change pitch button that
  swaps to the picker (`onAssignPitch`, rendered only when passed — the
  onOpenAvailability dead-button lesson). Away matches: gone from "Waiting
  for a pitch" and no assign button on their details — strict
  `home === false`, the PitchRequest rule (null means "nobody said", and
  most pitch-needing events are trainings with null). Both proved against
  injected faults. Its own branch could not cite the squash SHA; the entry
  above carries it.
- `dea42ad` — 📎 **Chat round 4: the message menu, pins, stars,
  reply-privately, and the reaction pill where WhatsApp puts it** (#384) — from
  Jay's two WhatsApp screenshots relayed cross-session
  (`claude/plans/2026-08-24-chat-round-4.md`). A chevron on every bubble
  opens Reply · Forward · Copy · Pin · Star · Reply privately · Delete/
  Report, replacing the inline text actions; tallies hang off the bubble
  corner; pinned messages ride a banner. Pinning is ANYONE-in-the-chat by
  Jay's ruling, through a SECURITY DEFINER single-column RPC — widening
  the UPDATE policy would have handed participants body-rewrites, the
  grants.sql §4 trap. Stars are owner-only (`/chat/starred`). The quote
  guard relaxed to readable-by-sender for reply-privately, and the round-2
  harness anchors were REPOINTED, not deleted.
  (`db/migrations/20260824_chat_round_4.sql`, harness green, two injected
  faults caught.) Merged as #384 and verified live from the deployed
  bundle by four markers; its own branch could not cite this squash SHA,
  so this entry carries it now.
- `11892d7` — 🏟️ **Click any event on Allocation to give it a pitch** (#383) — Jay: "none of
  the events are clickable, can't click them to assign a pitch". Not a
  regression: direct assignment was wanted on 5 Aug and never built — the
  request queue was the only path. Now the day grid's bookings and the
  "Waiting for a pitch" rows open a picker Sheet; saving writes the fixture
  (`setEventPitch`, RLS-gated), and a pending request for that event is
  answered through the existing `allocatePitch` so the queue stays truthful.
  The write-path fork proved against an injected fault; the harness
  stub-parity anchor caught the missing stub export exactly as designed.
  `claude/plans/2026-08-24-pitch-direct-assign.md`. Its own branch could
  not cite this squash SHA, so this entry does.
- `4ca3560` — 📐 **The chat list's section titles get their 18px back** (#382) —
  Jay: "the Direct Messages text touches the chip above it", and the
  measurement in his own browser agreed: 4px from card edge to title.
  BlockTitle's `first:mt-0` zeroes its top margin the moment a <section>
  wrapper makes it a first child — the trap Dashboard's blocks already
  compensate for with `mt-[18px]` on the wrapper, which ChatList's two
  sections now do too. Measured 4px before in Jay's own browser, 18px
  after — live, in the same browser. Its own branch could not cite this
  squash SHA, so this entry does.
- `19e3ede` — 💠 **The glass gets MATERIAL and a PRISM LENS** (#379) — the rest of Jay's glass
  night. Over a flat white page clear glass vanishes into the page ("still
  look like they are white and not glassy"), so the pane itself now has
  substance: a cool-grey smoke gradient (grey-blue, never white), a
  top-left glint, an inset bright top edge and a darker bottom edge for
  thickness. And the refraction: `backdrop-filter: url(#liquid-lens)` — a
  displacement-map lens AppShell mounts. The first cut was turbulence
  noise; Jay's review corrected the physics twice ("ios makes it bigger
  and bends it … like looking through a prism", then the observation that
  the effect died at the top of the bar — a map-alignment bug, fixed) and
  sized the prism twice (52/36/20 "too much" → 32/30/28 with saturation
  eased). Five preview builds on #379, zero production deploys iterating.
  ⚠️ Chromium-only BY DESIGN: Safari drops the url() declaration and keeps
  the plain frost declared before it, so iPhones get undistorted glass with
  no @supports needed — the declaration ORDER is the fallback, see the
  index.css comment. Its own branch could not cite this squash SHA, so
  this entry carries it now.
- `2d8f79c` — 📝 **The chat night's records closed** (#381) — `34c9e1c` cited,
  plans and state-of-play brought current, handoff written. Its own branch
  could not cite this squash SHA, so this entry carries it now.
- `34c9e1c` — 💚 **Chat round 3: the WhatsApp design pass** (#380) — seven items
  from Jay comparing chat against a real WhatsApp screenshot
  (`claude/plans/2026-08-24-chat-round-3-design.md`): stamps inside tighter
  bubbles, the reaction trigger beside the bubble, Today/Yesterday/date
  dividers, member first-names under the group name, quins-green own
  bubbles and dock header (`accent.deep`, measured in the contrast gate —
  where white/60 metadata FAILED and moved to /70), choosable wallpaper
  presets (no uploads, by ruling), and PRIVATE nicknames
  (`db/migrations/20260824_nicknames.sql`, owner-only RLS, harness proven
  against an injected read-policy leak). Merged and verified live from the
  deployed bundle the same night; its own branch could not cite this squash
  SHA, so this entry carries it now.
- `ccf960b` — 🧊 **Glass polish round: white cast gone, one shape for both
  bars, crisp icons** (#377) — Jay's home review of the clear glass, three
  fixes: the 40% white
  ring + brightness lens summed to "looks like it is white" (border to 16%,
  brightness dropped, the red halo owns the edge); the dock squares off from
  a capsule to the masthead's rounded-[22px]; and "blurry" icons were 8px
  frost leaving half-readable smears behind them — proved by toggling the
  filter live, fixed at 20px. Approved from deploy preview #377. Its own
  branch could not cite this squash SHA, so this entry does.
- `43e212e` — ↔️ **The dock's width ceiling goes to 1100** (#378) — Jay tried
  the grip live and: "looks good but on desktop mode we could make it much
  wider". The viewport cap already guards small screens; 640 was only where
  the drag stopped, and it stopped too soon. Its own branch could not cite
  the squash SHA, so this entry carries it now.
- `8c12fb7` — ↔️ **The dock is resizeable** (#376) — Jay, same evening: "can we
  make the chat box resizeable? this would be beneficial in desktop mode".
  A custom top-left grip (the panel is anchored bottom-right, so the native
  CSS handle only lives on the corner that cannot move); dragging left/up
  grows it within 320-640 × 400-860, the size persists per DEVICE like
  chat-enter-sends, and the header shifted right so the back button never
  sits under the grip. Its own branch could not cite this squash SHA, so
  this entry does — and the width ceiling moved the same evening, above.
- `c07b839` — 🚑 **Hotfix 2: the quoted embed goes through the FK COLUMN
  itself** (#375) — the first hotfix's `messages!quoted_id` spelling RESOLVED
  but in the reverse direction: an empty array of quoting-messages on every
  row, truthy and bodyless, so every bubble in every thread grew a phantom
  "📷 Photo" chip (Jay screenshotted it live within the hour). Only
  `quoted:quoted_id(…)` is to-one by definition; the renderers now demand
  an object with an id, pinned by a regression test at both layers. Its own
  branch could not cite this squash SHA, so this entry does.
- `d170253` — 🫙 **CLEAR liquid glass — the smoked bars lasted an afternoon**
  (#374). Jay saw
  #370's glass on the live site ("very little transparency") and asked for
  fully transparent with a small red glow. Both bars are now iOS-style clear
  glass: 2% fill, 8px frost (28px read as grey soup — the first prototype's
  lesson), red halo as the brand line, and THEME INK instead of always-white
  content, because clear glass cannot hold white text over a light page. The
  App label gets its own 55% white pill — the sole small text on glass, and
  the masthead floats over the RED fixture hero where bare ink measures
  ~3.1:1 (the wordmark rides the logotype exemption; icons pass the 3:1 UI
  floor with nothing to spare). Approved from Netlify deploy preview #374 —
  a look decision made on a preview, so no production deploy was burned
  iterating. `src/index.css`'s clear-glass block carries the arithmetic.
  Its own branch could not cite this squash SHA, so this entry does.
- `2008310` — 🚑 **Hotfix: the quoted embed hints by COLUMN name** (#373) — round 2
  reached the live site with `quoted:messages!messages_quoted_id_fkey(…)` in
  the SELECT and every DM/group thread died with PGRST200 "Could not find a
  relationship between 'messages' and 'messages'". Not cache staleness: the
  identical probe against the weeks-old `messages_parent_id_fkey` fails the
  same way — **this project's PostgREST does not resolve constraint-name
  hints on SELF-joins**, and the column-name hint `!quoted_id` does
  (probed live, after two reload notifies changed nothing). One line, plus
  a test pinning the string the live API parses. Its own branch could not
  cite the squash SHA, so this entry carries it now — and a spelling
  hotfix 2 above then had to correct again, in the other direction.
- `5cf0fb1` — 📋 **Round 2 closed** (#372) — `bbbc1d3` cited, both plans
  marked shipped, live verification recorded. Its own branch could not cite
  this squash SHA, so this entry does.
- `bbbc1d3` — 💬 **Chat round 2: reply-with-quote, forwarding, the emoji
  picker, chat buttons on the Home staff tiles, and photo attachments** —
  the whole round-2 remainder of `claude/plans/2026-08-24-chat-feedback.md`
  in one PR by Jay's choice, designed in
  `claude/plans/2026-08-24-chat-round-2.md`. Photos unblocked by a new
  ruling (`claude/decisions/2026-08-24-chat-photos-open.md`: open, like
  WhatsApp — the report loop is the safety valve, not consent collection).
  `db/migrations/20260824_chat_round_2.sql` adds quoted_id/forwarded/
  attachment_path and the private `chat-media` bucket — **APPLIED to
  production on Jay's go-ahead**; harness green against live and proven to
  fail on two injected faults. Merged as #371 and verified live from the
  deployed bundle the same evening.
- `109634f` — 🫧 **The masthead hides on scroll like the dock, and both bars
  are Liquid Glass** (#370) — one shared hook
  (`src/lib/useAutoHideOnScroll.js`) drives both bars so a downward scroll
  clears the whole screen on a phone (View-as pins the masthead shown — the
  banner is contractually unmissable); the glass itself went clearer with a
  lensed backdrop, gradient specular rim and light-catch sheen (dock
  62%→52%, island 70%→66% — the island's floor is its 13px text, worked in
  `src/index.css`'s comments). Look approved from harness screenshots before
  deploying. `claude/plans/2026-08-24-topbar-autohide-liquid-glass.md`.
  Its own branch could not cite this squash SHA, so this entry does.
- `569656a` — 📝 **The chat day closed** (#369) — plan statuses marked shipped,
  `2119d1a` cited, handoff written. Its own branch could not cite this squash
  SHA, so this entry does.
- `2119d1a` — 🧲 **The floating chat dock and emoji reactions** — chat beside your work:
  a bubble bottom-right of every desktop page (except /chat) opening a
  compact panel with the scoped list and any thread, surviving navigation
  with its draft; possible only because #367 retired Help from that corner.
  Plus reactions on every message surface: five-emoji tap-to-toggle tallies
  (`db/migrations/20260824_message_reactions.sql` APPLIED, harness green
  before and after), pinned by test to the database's own check constraint.
  `claude/plans/2026-08-24-floating-chat-dock.md`.
- `4693458` — 🔧 **Chat feedback round 1 MERGED** (#366) — the squash SHA for
  the round-1 entry below, which its own branch could not cite.

- `34b529d` — 🐛 **The floating `?` is retired — "Report a problem" moved into the account
  menu.** Jay's verdict on the corner button was all four failure modes at
  once (covers content, still missed, clutter, accidental taps), and the
  bottom-right corner is promised to the desktop chat dock. His first idea —
  a bug icon in the top bar — was declined per the 23 Aug masthead ruling
  ("the next control goes in AccountMenu.jsx"): the menu got a bug-icon
  "Report a problem" row instead. `HelpButton.jsx` → `HelpSheet.jsx`, now a
  controlled component (`open`/`onClose` from AppShell); the flow, reference
  codes and triage are untouched. Both new test assertions proved against
  injected faults. Plan: `claude/plans/2026-08-24-help-into-account-menu.md`.
- 🔧 **Chat feedback round 1 — four bugs, five quick wins from Jay's first
  real test drive** (`claude/plans/2026-08-24-chat-feedback.md`): view-as now
  scopes the chat list, the masthead band stops eating the thread's back
  button, a refused remove says so instead of shrugging (the database was
  proved innocent by a rolled-back probe), threads stick to the newest
  message, composers auto-grow, Enter-to-send is a device toggle on More,
  own messages say "You", bubbles carry real clock timestamps, and DM/group
  threads draw a "New" divider. *(SHA: next PR cites the squash commit.)*
- `ecb0ced` — 🏠 **The member chat home** — unread strip (absent at zero), the
  club channel as a hero card with its pills, rows grouped under editorial
  titles, search still flat. Plus the latent pwa-build fix: the test's child
  build inherited VITEST and was silently unminified. (#364)
- `17e6728` — 🚪 **The deploy ignore gate was DEAD from 10:19 to mid-afternoon, and the
  killer was a TOML header.** PR #358's `[build.environment]` block (the Node
  pin) sat above the `ignore =` key, and a TOML table captures every bare key
  after it — so `build.ignore` ceased to exist and Netlify built every commit,
  including two docs-only ones, with no error anywhere. Diagnosed from the
  build log of the #363 deploy (no ignore evaluation at all; the last gate
  cancel was 23 Aug 5:44 PM). Key reordered, `docs:check` gained check 9
  guarding the ordering (proved by both injected faults), and `CLAUDE.md`
  rule 3 now says plainly: a local gate run answers what the script would
  decide, never whether Netlify consults it — the only proof of a skip is the
  deploy id not moving. This answers the open question the `261397a` entry
  below flagged for its own session.
- `261397a` — 📝 **Group chats recorded as shipped-and-verified** — plan statuses
  closed, state-of-play's chat section updated, and the `463b3c9` squash SHA
  cited (the entry #362 could not write for itself). Docs only — though the
  predicted deploy skip did NOT happen; the gate misprediction was an open
  question at the time, answered by the entry above.
- `463b3c9` — 💬 **Group chats SHIPPED and VERIFIED LIVE — member-created, named,
  three people minimum** — migration `db/migrations/20260824_group_chats.sql`
  applied to live (harness `db/tests/group-chats.sql` green before and after,
  twelve asserts), data layer, multi-select picker inside the DM picker,
  group threads with rename/add/leave and NO notice banner (the ruling).
  Verified on the deployed site the same day: a real three-person group, and
  the push arriving on a phone that was not the actor's — Jay, 24 Aug 2026.
  The spec and the safeguarding ruling
  (`claude/plans/2026-08-24-group-chats.md`,
  `claude/decisions/2026-08-24-groups-open-no-warnings.md`) rode in the same
  squash.
- `9500b96` — 🧪 **The nightly db-check had been failing since 22 Aug, and behind its
  refusal sat four separate reds.** `pitch-occupancy.sql` shipped with no
  `raise exception`, so the runner refused the whole suite every night — and
  that refusal masked: the two 24 Aug chat migrations being non-idempotent
  (their harnesses inline them; `drop policy if exists` guards added), the
  grants allowlist missing seven column grants from 23–24 Aug (its own header
  predicted exactly this rot), and phase-3's ASSERT 15 predating the 23 Aug
  adult-DMs-private ruling (repointed to assert the ruling in both
  directions, not deleted). The pitch harness got its throw — proved by
  injected fault. One red remains: four training-plans read policies call
  `auth.uid()` bare (`20260824_rls_initplan_wrap_training_reads.sql`, written
  but awaiting Jay's yes to apply).
- `9cf34a9` — 🏉 **Age typos are refused in the training forms, the embed sort has a
  discriminating test, and line endings are pinned repo-wide.** The 21 Aug
  review follow-ups: `ageDraftProblem` mirrors the DB's 4–19 and min≤max
  checks so a typo reads "Ages are 4 to 19" instead of a raw
  `drills_min_age_check`; the blocks-by-position sort in
  `listTemplates`/`getSession` is tested with deliberately shuffled fixtures
  (proved by deleting the sort and watching it fail); `.gitattributes` gains
  `* text=auto eol=lf` — measured zero renormalization churn first. Plus the
  SECURITY DEFINER read-through: both post-audit advisor lint types walked in
  full, no findings (`claude/open-items.md`).
- `97bf53a` — 📟 **Heartbeat on the nightly db-check, and tests no longer open real
  sockets to production.** The heartbeat step pings Better Stack only after a
  genuine green harness run — inert until Jay creates the heartbeat and adds
  `DB_CHECK_HEARTBEAT_URL` (four steps, `claude/runbooks/monitoring.md`).
  And `src/test/setup.js` now stubs jsdom's WebSocket: five screen suites had
  been opening live realtime connections to the Supabase project on every
  `npm test`, visible only as 5–7 "Unhandled Errors" on a suite that still
  exited 0. Measured before (3 errors on 3 files) and after (0 on all 175).
- `30c684e` — 📦 **Vite 8.2.2 + @vitejs/plugin-react 6.1.0, taken together, and Netlify's
  build Node pinned to 24** — the mutually-blocking pair from the 17 Aug
  parking, landed exactly as `claude/open-items.md` prescribed: one PR carrying
  both, Node pinned in the same change so the production build runs on the
  version CI actually tests. Fresh lockfile resolve (an incremental install
  fights plugin-react 6's optional Babel-8 peer chain); full suite and build
  green.
- `5dac6b1` — 🧭 **Admin expands in the sidebar like every other section** — Jay. Its
  children are the portals the viewer can enter, read from the same registry
  as the /admin chooser (`src/lib/portals.js`), so the two cannot disagree;
  /approvals keeps it open, where the badge's number lives.
- `8f94373` — 📦 **Safe updates: libphonenumber-js 1.13.11, @testing-library/user-event
  14.6.5, vitest 4.1.11** (Dependabot #351, patch bumps; suite green). The
  same batch's four MAJORS (#352–#355) were closed under the standing
  rulings: eslint 10 still refused by the React plugins, vite 8 +
  plugin-react 6 mutually blocking and waiting on a pinned Netlify Node
  (`claude/open-items.md`).
- `3e24039` — 🧭 **The Approval-emails panel moved to Accounts** (see below).
- 🧭 **The Approval-emails panel moved to Accounts** — where the approving
  happens. It shipped at the bottom of "Squads & league teams" and Jay could
  not find it ("i do not see anywhere to change the email notifications in
  the admin section") — the same right-screen-nobody-finds trap that tab's
  own rename note records. Admin → Accounts, under the queues. It also no
  longer renders its own spinner (two role="status" broke the screen's tests).
- `e553d2f` — 📧 **Admins choose who is emailed about people waiting to be approved**
  (see below — the panel itself).

## 23 Aug 2026

<!-- ⚠️ The chat-list, delete-for-good and the peer session's entries below were
     written on the EVENING of 23 Aug. The migration and plan files carry
     "20260824" / "2026-08-24" in their names — a date slip by the session that
     wrote them, kept because two of the migrations are already applied under
     those names. -->

- 📧 **Admins choose who is emailed about people waiting to be approved.**
  Jay: "right now the only option related to that is selecting who's the
  head coach." The recipient list was a rule inside `notify-approval`
  (super admins + the squad's head coach + its managers); it is now a switch
  per membership, `memberships.notify_approvals` — admins for the whole club,
  a coach or manager for their squad — set from a new panel on the Club admin
  tab. Backfilled to exactly the people the old rule emailed, so day one
  changed nothing; if nobody in scope is switched on, the super admins are
  still told. `db/migrations/20260823_notify_approvals.sql`, harness
  `db/tests/notify-approvals.sql` 4/4, `src/components/ApprovalRecipients.jsx`,
  `notify-approval` redeployed.
- `6aca3f9` — 🗑️ **Delete for good.** Jay, with the list live: "i still can't completely
  delete messages or chats." Delete is now a real delete — the author any
  time, staff in their channels, admins where they may review; a DM deletes
  for both; "Clear chat" empties a channel. ⚠️ A reported message (or a post
  with a reported reply, or a DM with one) only by an admin — a report is
  evidence (`claude/decisions/2026-08-24-delete-for-good-except-reported.md`).
  The welfare access log now outlives the conversation it recorded.
  `db/migrations/20260824_delete_for_good.sql`, harness
  `db/tests/delete-for-good.sql` 8/8.
- `7225e5f` — **Push survives signing out and back in** — Jay: "why are notification
  settings being reset… I don't want it to change if I sign out and sign
  back in." The database showed deploys never touched a subscription (his
  Android row from 19 Aug outlived fifteen of them); the reset was #324's
  sign-out unsubscribe. Now sign-out drops only the ROW
  (`forgetDeviceRegistration`) — the server stops sending to the phone, the
  shared-phone protection stands — and a real `SIGNED_IN` re-attaches the
  phone's existing subscription to whoever signed in (`reattachOnSignIn`,
  silent, never throws, never prompts). `src/lib/push.js`, `src/lib/auth.jsx`.
  No migration: `register_push_subscription` is delete-then-insert, so
  re-registering your own endpoint already works.
- `58ef714` — 💬 **Chat, reshaped like WhatsApp — and delete a message, delete a chat.**
  Jay: "there is no logical way to send someone a DM ... make it more like
  whatsapp", then "need to be able to delete messages and entire chats too".
  One Chats list at `/chat` (squads, staff channels, the club, DMs — newest
  first, unread badges, who-said-what previews, search); the pencil starts a
  DM from a grouped people picker; a header bar on every thread says exactly
  who reads it; bubbles, mine on the right. The author may remove a message
  at any time (edits still close at 15 minutes, now in the trigger); "Delete
  chat" clears a DM for YOU — WhatsApp's meaning — and it returns when the
  other side writes. `public.my_chats()`, `conversation_clears`,
  `clear_conversation()`; harness `db/tests/chat-list.sql` 9/9;
  `claude/plans/2026-08-24-chat-list.md`. The message-row harness scenario
  had rendered blank since phase 2 (no router) — fixed.
- `94ffd81` — **Privacy: "secure providers", not a city** — Jay: "we don't need to
  mention Tokyo". The where-it-is-kept paragraph now says the data is held
  by secure, reputable providers acting on the club's instructions; the
  test that pinned the region now pins its absence.
- `166ad2b` — **Four from Jay's desktop look** — the masthead island shrink-wraps to a
  compact pill at the top-right on desktop (the sidebar holds the crest and
  name, so a full-width island held three things on the right and looked
  empty); Schedule's heading is "What's on, *when.*" (was "Club life,
  calendared."); Notices is "Club *notices.*" (was "From the committee." —
  coaches and managers post most of them); and the privacy policy is
  rewritten minimal (`src/screens/Privacy.jsx`) — one short paragraph per
  topic, keeping the four pinned facts (Tokyo, a child never signs in, squad
  members see each other, the delete link) and now truthful about Sentry
  error reports, push notifications and chat, which the 7 Aug text predated.
- `79a3d31` — 🐛 **DMs no longer leak into Whole-club chat.** The club channel listed
  every message with no squad — and a DM has no squad either — so a member's
  own private messages appeared in the club feed with no recipient shown.
  Jay saw it on the live site. One filter (`channel = 'squad'`) in
  `src/data/messages.js`; the data test now asserts it.
- `ed0becd` — 📊 **Storage readout on the Club admin tab** — database size and bytes per
  photo bucket against the Pro plan's allowances, measured on open. The
  answer to "won't we run out of storage?" is now on a screen.
  `public.storage_usage()` (admin-only by the function), `src/components/StorageCard.jsx`,
  harness `db/tests/storage-usage.sql`.
- `30e2cef` — 🔒 **Adult-to-adult DMs are private unless a message is reported** — Jay's
  evening ruling narrowing the morning one. An admin reaches a DM only when it
  involves a minor or a message in it has been reported
  (`private.admin_may_review`); the Welfare overview lists only those; the
  thread's notice says which rule applies; an admin opening an adults-only
  conversation by URL gets "not available to you".
  `db/migrations/20260823_adult_dms_private.sql`, harness
  `db/tests/adult-dms-private.sql` (5 assertions, control included),
  `claude/decisions/2026-08-23-adult-dms-private-unless-reported.md`.
- `0dd9593` — 📝 **Handoff: chat phases 2 and 3** — the afternoon's record, the ruling
  that any admin may read a DM, and the lessons (harness the file verbatim;
  never stash across a moved `main`; explicit column lists in `returns table`).
  `claude/handoffs/2026-08-23-chat-phases-2-and-3.md`; `state-of-play.md`
  now says phases 1–3 are live.
- `c593795` — 🐛 **The "no gender recorded" nudge is staff-only** — a parent saw "2
  players have no gender recorded — Show them" in red on her squad's roster.
  It is a data-quality tool for the people who can fix the record; now
  behind the same can-edit gate as grouping (`src/screens/Roster.jsx`).
  Proven by injecting the fault: the new parent test fails without the gate.
  Her seeing the squad's names at all is by design — an active parent
  membership reads its squad — and the database confirmed her rows.
- `bcd79d0` — 💬 **Squad chat, phase 3 — the staff channel, direct messages, reports,
  and the Welfare dashboard.** A second stream per squad for coach /
  manager / medic. One-to-one messages with a permanent notice — *"Club
  admins can review this conversation"* — because Jay ruled (23 Aug) that
  any admin may read a DM, consistent with the 10 Aug "rights gate screens,
  not data" ruling; `welfare` is a fifth admin right that gates only the
  dashboard. Who may message whom is `private.can_dm`, the database's
  rule: parent ↔ parent within a squad, staff ↔ families they share a
  squad with, admins; a MINOR (a `player` account under 18, or with no date
  of birth) only by their own guardian, or by their U16+ squad's coach /
  manager once a guardian has opted in (`player_private.staff_dm_opt_in`,
  recorded who/when, refused to the player themself); minor ↔ minor never;
  blocks both ways; re-checked on every message. Every admin open of a DM is
  logged and the log is on the dashboard. Report any message; admins see the
  queue and can remove (blank) but never rewrite. Push: a DM reaches the
  other side (category `direct_messages`); a staff post reaches the staff.
  `db/migrations/20260823_squad_chat_phase3.sql` (+ harness **16/16** rolled
  back against production), `DirectMessages.jsx`, `Welfare.jsx`,
  `WelfareReports.jsx`, `StaffDmOptIn.jsx` on the family's player card.
- `804a012` — **Glass islands** — Jay: "make the bottom more transparent or glass? a
  similar style for the top?" The masthead is now a floating island like
  the dock — inset, rounded, highlight edge, shadow (`.glass-island`, 70%
  because it carries text) — with the iPhone status-bar strip as its own
  thin fixed glass, and the View-as banner rounded to match. The dock goes
  to 62%, which design A makes safe: its idle items are icons (3:1
  components) and its only text sits on the red pill, not the glass.
  ⚠️ The island's 24px of inset re-opened the morning's bug — "QUINS CLUB
  H…" at 375px — and was paid for inside the island (row padding, crest
  40→36, tracking 1.6→1.2px): measured intact at 360 and 375 with the
  install button present; 320px phones still clip, as they did before.
- `ad904c2` — **Dock extras** — the rest of the motion ideas, on Jay's "do it". The dock
  slides away on a downward scroll and returns on an upward one or at either
  end of the page (re-shown on every route change). The red pill's glow now
  BLEEDS into the glass — a blurred halo behind it that travels with it.
  Status dots: Chat when there are unread posts in the last fortnight
  (`countUnreadMessages` in `src/data/messages.js`, realtime-refreshed and
  recounted on leaving Chat), More for an admin with reviews waiting; a dot
  not a count, never on the active tab, "new" in the accessible name, and
  any failed count means no dot (`src/lib/useDockBadges.js`). ⚠️ The harness
  gained `harness/stubs/messages.js`: the alias catches every importer of
  the real module, so the stub carries ALL its exports — a missing one is a
  blank page with nothing in the server log.
- `7254ead` — **The motion pass** — Jay: "animate like iOS does when you press a
  different menu option, maybe some red glow, more glass". The dock's red
  pill is now ONE element (`Glider` in `src/components/Nav.jsx`) that
  slides to the tapped tab on a spring curve, its glow blooming as it lands
  (`dock-bloom` keyframes); tabs squash on press. ⚠️ The pill's target is
  PREDICTED from the settled layout, not read mid-transition — the dock is
  `justify-between`, so every tab is moving the moment one grows, and a
  naive measure sent the pill 50px past its mark. Tracked in the harness at
  45ms steps: 52 → 138 → 174 → 162. Sheets and the account menu wear a new
  light glass, `.glass-panel` (86% card over a 24px blur; contrast floor in
  `src/index.css`). Everything respects reduced-motion.
- `616a546` — **Shell polish to match the dock** — the desktop sidebar's active item is
  the same gradient pill with the same glow (`src/components/Sidebar.jsx`),
  and the help button is dark glass instead of a second red disc 40px from
  the red active tab (`src/components/HelpSheet.jsx`, then named
  HelpButton.jsx; still 44px — the
  test for the touch-target floor caught a 40px first draft).
- `e2ca0a7` — **The dock, design "A"** — Jay: "very bland" → "go with A, but flashier
  and more modern". Icons only; the active tab expands into a brand-gradient
  pill with its label sliding open (300ms, reduced-motion aware) and a soft
  red glow. `.glass-dock` in `src/index.css`: chrome at 84% with a light
  inset highlight, a faint border and a real drop shadow — the depth is what
  reads as glass, not the transparency; the masthead goes back to 80% for the
  same reason. Six tabs at 360px with "SQUAD HUB" open fit with 9px to spare,
  measured; the "Squad" abbreviation is gone. `src/components/Nav.jsx`.
- `524e87e` — 💬 **Squad chat, phase 2 — fixture threads and @mentions.** A post can
  hang off a fixture (ONE open thread per fixture, partial unique index;
  anyone in the squad may open it, even under announce-only — it is the
  fixture's discussion) and carries the fixture's RSVP chips from the same
  availability rows the Squad Hub counts. The event screen gains a "Squad
  chat" block (*N replies · Open the thread* / *Start a thread*, handler
  prop, both host screens pass it); `/schedule?event=<id>` opens a fixture
  from the chat. @mentions: a picker fed by `chat_mentionables`, ids
  filtered server-side to the squad's audience, and a mention pushes the
  mentioned — whoever wrote it, reply or post — with a "*Name* mentioned you"
  title from `push-send`; everything else stays quiet.
  `db/migrations/20260823_squad_chat_phase2.sql` (+ harness 10/10 rolled back
  against production, run on the FILE this time), `FixtureCard.jsx`,
  `MentionPicker.jsx`, `EventDetail.jsx`. Deviation from the plan: push
  preference stays the phase-1 boolean, not three levels.
- `6070e4a` — 🐛 **The dock was at the TOP of every phone, iOS and Android** — live
  from #330 until this. `backdrop-filter` on an ancestor makes it the
  containing block for `position: fixed` descendants, and `<Nav>` rendered
  inside the masthead wrapper that took the glass — so "12px from the
  bottom" meant the bottom of the masthead. Nav now renders outside it
  (`src/components/AppShell.jsx`); the rule is written at the class in
  `src/index.css`. ⚠️ The harness showed this first and was written off as a
  harness quirk. Also: headless Chromium DOES composite backdrop-filter —
  the "it cannot" note from #330 was this same bug misread, and is removed.
- **Glassier** — Jay: "it isn't very glassy looking". `.glass-chrome` goes
  from 82% to 68% with a 24px blur, and because that lifts the worst
  composite to rgb(88,88,88), every tint on the bars moves with it: idle tab
  labels `white/85` (was chrome-muted, which would have been 2.2:1), the
  wordmark `white/80`. The arithmetic is in `src/index.css`.
- `f712dff` — **The dock** — Jay, with a photo of his iPhone home screen: the tab bar is
  now a floating rounded pill, inset 12px from the edges and lifted clear of
  the home indicator, in the same glass as the masthead. Six tabs on a 360px
  Android had "SQUAD HUB" wrapping and "SCHEDULE ROSTER" running together:
  labels are 10px condensed caps, single-line, and the Squad Hub tab prints
  "Squad" (accessible name unchanged). Content padding and the help button
  re-measured to clear it. `src/components/Nav.jsx`.
- `6cde742` — **iOS-style bars** — Jay: "transparent and sort of above the screen instead
  of sitting as a bar". Masthead and tab bar wear `.glass-chrome`
  (`src/index.css`): chrome at 82% over a 20px backdrop blur, hairline edges
  instead of shadows, opaque fallback where backdrop-filter is unsupported.
  The old ruling against a translucent tab bar is answered in Nav.jsx — the
  material is dark, so the worst composite is still 4.9:1 for idle labels.
  ⚠️ Headless Chromium does not composite backdrop-filter, so harness PNGs
  show these bars solid; checked by eye in real Chrome.
- `2b7d611` — 📓 **Handoff: push proven, and the squad chat that followed it**
  (`claude/handoffs/2026-08-23-push-proven-and-squad-chat.md`) — the day in
  order, seven ranked lessons (harness the FILE not a retyping; Supabase's
  default privileges under a column grant; a policy cannot select from its
  own table; the actor never gets their own push), and the first real chat
  message: posted by Jay in U13 Mixed, arrived on a parent's phone, read by
  2 of 12. `claude/state-of-play.md` carries the chat as live.
- `ff1a9c8` — 📓 **Push notifications PROVEN on a real iPhone and a real Android** — a
  notice and a U13 Mixed fixture change, posted by Jay, arrived on the lock
  screen of the club iPhone signed in as a parent; an hour later a fixture
  change arrived on an Android (Chrome) signed in as a parent-only account.
  Four `push-send` POST 200s in the logs. `squad_push`
  comes off the tabled list (`claude/state-of-play.md`), the open item is
  closed with the Android caveat (`claude/open-items.md`), and step zero of
  `claude/plans/2026-08-23-squad-chat.md` is done.
- `d9273dc` — **Masthead polish: the crest goes home, the initial is an avatar, the role
  is the Badge** — Jay, after the account menu landed: the crest should "always
  take you to the top of the screen", the J was "sort of bland", and the role
  cell "doesn't seem to match our style". The crest (mobile masthead and
  desktop sidebar) is a link to `/` that also scrolls to the top. The initial
  is the app's own avatar — brand gradient disc, hairline ring, chevron — and
  `z-[1]`, because the `harlequin::after` diagonal was painting over it on
  desktop. The role cell is `Badge` keyed by role (maroon admin, amber parent,
  blue staff; design-system §4.20), via a new `highestRole()` in
  `src/lib/scope.js`; `Badge` now forwards rest props.
- `255c2ba` — 💬 **Squad chat, phase 1** — a channel per squad (and one for the club):
  `/chat` on the phone's tab bar for everyone, `Chat` under the Squad Hub's
  sidebar section for staff. Announce-only by DEFAULT (staff post, families
  reply in threads; staff can switch it off, recorded who and when), pinned
  posts, one-level replies, soft delete, 15-minute edits, "Read by N of M"
  for staff, realtime, and push on a staff post through `push-send`'s sixth
  trigger shape `{ message_id }` (category `squad_chat`, opt-outable).
  `db/migrations/20260823_squad_chat.sql` (+ harness 11/11 rolled back
  against production), `src/data/messages.js`, `src/screens/Chat.jsx`,
  `src/components/MessageRow.jsx`, a `message-row` harness scenario.
  Two things found on the way: a policy on `messages` cannot select from
  `messages` (recursion — now `private.can_reply_to`), and Supabase's default
  privileges would have handed `authenticated` table-level UPDATE under the
  column grant (now revoked first, and the capture proves it).
  `claude/plans/2026-08-23-squad-chat.md` phase 1.
- `acd9475` — **The account menu — one trigger in the masthead, at every width** — Jay's
  phone showed "QUINS CLUB HUB · …" with the role eaten by the ellipsis, the
  fifth masthead-overflow fix in sixteen days. Every control beside the
  initial was `shrink-0` and the wordmark paid for all of them. Now the
  initial opens a menu (`src/components/AccountMenu.jsx`): name and role as
  its header, My account, View as (admins, as a second page), Dark mode, Sign
  out. `ThemeToggle.jsx` is deleted, the View-as eye button is gone, and the
  persona list is `ViewAsOptions` in `src/components/ViewAsSwitcher.jsx`. On a
  phone the role is its own pill under the wordmark; the desktop bar is down
  to role pill · App · initial. Proven in the harness at 360, 375 and 1280px
  with `elementFromPoint`, not a rect — the 14 Aug clip lesson.
- `a349359` — **A phone that changes hands can turn notifications on** — found live
  during the first real push test: Jay signed out of the club iPhone, his wife
  signed in, and "Turn on notifications" failed with an RLS error, because the
  device's endpoint row still belonged to him and the client's upsert became
  an UPDATE of somebody else's row. `20260823_push_subscription_takeover.sql`
  adds `register_push_subscription` — the endpoint moves to whoever is signed
  in now — and sign-out drops the device's row first. Harness reproduces the
  error, proves the move, and proves the previous owner's other devices are
  untouched. `src/lib/push.js`, `src/lib/auth.jsx`, `db/schema/functions.sql`,
  `claude/schema-history.md`.
- `682d1ec` — **Admin badge re-counts when you leave Accounts** — it was fetched once per
  page load, so after approving people it kept the old number until a refresh.
  Accounts (and `/approvals`) is where the queue is cleared, so leaving it is
  the one moment the count is known to be stale. `src/components/Sidebar.jsx`.
- `2f0435d` — **Admin badge now says what the Accounts screen shows** — it read
  23 while the "Waiting for access" list showed 2. It counted `access_requests`
  rows still `pending`, a status nothing ever leaves: granted access is the
  existence of a memberships row, by design (20260804). `countAdminWaiting` in
  `src/data/members.js` now applies the list's own rule — readable profiles
  with no membership row and not dismissed, plus pending membership rows —
  under the same RLS the screen reads with. `tests/count-admin-waiting.test.js`.
  ⚠️ This entry was written in #322 and lost in a concurrent merge; restored here.
- `b9b4974` — 📐 **Plan: squad chat** (`claude/plans/2026-08-23-squad-chat.md`, NOT
  SHIPPED) — a channel per squad that a WhatsApp group could move into:
  announce-only by default, fixture threads with RSVP chips, a staff channel,
  a welfare view, and DMs. DMs were refused in the first draft and put back on
  Jay's word the same day, with the line redrawn at the fact that children do
  not hold accounts: parent ↔ parent within a squad, and a U16+ player only
  by their squad's coach or manager once a guardian has opted in. Step zero
  is proving push on a real phone that is not Jay's.
- `7243678` — **Accounts list shows which admin rights each admin holds** — the row read
  "Admin" for a super admin and for somebody holding one specialist dashboard
  alike. It now reads `Admin · Rugby Performance Director` (every held right,
  comma-separated) or `Admin · Super admin`. `src/screens/Accounts.jsx`, two
  tests in `tests/accounts.test.jsx`.

## 22 Aug 2026

- `5b46dca` — **ESLint, and the crash it found first** — `eslint.config.js`,
  `npm run lint`, a CI step before `npm test` in `.github/workflows/test.yml`.
  The dry run over `src/` found a conditional hook in `src/screens/Accounts.jsx`:
  the authorisation gate sat above nine hooks, and because `memberships` is the
  EFFECTIVE set, a super admin switching "View as" to a parent on that screen
  went from admin to not-authorised while mounted and the screen fell into the
  error boundary ("Rendered fewer hooks than expected"). Proven by a test before
  the fix, gate moved below the last hook, test kept. Also: `docs-check`'s
  inbox regex wrote a single-backslash dot in a plain string, so its dot matched
  any character (harmless, broader); three invisible characters in
  `src/lib/playerImport.js` are now unicode escapes; one duplicate key in a
  `scope.test.js` fixture. Zero lint errors; 50 warnings left as a burn-down,
  deliberately not blocking.
- `a33b77e` — 📓 **Handoff: the sidebar day, and the import rethink**
  (`claude/handoffs/2026-08-22-sidebar-day-and-the-import-rethink.md`) —
  #305–#317 in order, six ranked lessons (the selective-re-capture rot and
  its audit query; the 16-event fixture that passed against the
  re-injected bug), and the closing cleanup.
- `50d1458` — Import skips players already on the roster — a third state beside
  ready and needs-fixing ("N already there", muted, never inserted),
  matched per squad, case- and whitespace-insensitively. Until now a
  re-pasted sheet doubled the squad with a green tick on every row (#317).
- `415960b` — **Player import rethink** (Jay: "complicated and not user friendly",
  after a 38-row paste failed whole): columns are now classified by
  CONTENT, not position — squad names, positions (with a real-world
  synonym map: winger, scrum half, loosehead…) and gender tokens are
  closed vocabularies, and the name is the first contiguous run of
  whatever's left, so a First/Last split works and any column order
  works. A squad picker above the box makes a plain list of names a
  valid import. Unknown values away from the name error loudly; the
  accepted trade-off (an unknown word NEXT to the name joins it,
  visibly) is stated as a test (#316).
- `559c8d8` — **Schema re-capture: 29 live functions had NO entry in
  `db/schema/functions.sql`.** Every re-capture since 11 Aug was selective,
  so functions added by other work — the push pipeline, the nudges,
  feedback, photo focus — accumulated silently. All 29 captured verbatim
  from `pg_get_functiondef`, md5-verified against live per block, proacl
  noted per entry; `pitch_occupancy` normalized from live at the same
  time. Bodies of earlier entries were deliberately NOT re-verified — each
  entry's own capture date still governs it (#315).
- `fb0135a` — **The pitch calendar for coaches** (`/pitch-calendar`): read-only
  week/month view of every squad's bookings, fed by the new
  `pitch_occupancy` SECURITY DEFINER function
  (`db/migrations/20260822_pitch_occupancy.sql`) — redacted rows (squad
  name, type, times, pitch, group_id; no titles or opponents) because
  `event read` RLS deliberately scopes the events table to the reader's
  own squads. Squad staff and admins only, refuse-by-empty. Sidebar
  Schedule section + a hub Pitches card for phones. Harness:
  `db/tests/pitch-occupancy.sql`, proven green in a rolled-back
  transaction against production before application.
- `5f3ffe6` — Game time moved from More to the Squad Hub's front doors — its audience
  is the hub's, the hub is on the phone's tab bar, and the More card had
  become a third entry point. The link stays squad-less: the screen is
  cross-squad by design (#313).
- `fc040ec` — The tracking numbers count the WHOLE season: the `.slice(-30)` pre-trim
  is gone from Squad Hub's "Who said, who showed", so %, no-shows, the
  squad summary ("across N events this season") and the phone drill-in
  read every past event in the window; only the desktop matrix's 15
  columns stay capped, and the footnote names both numbers (#312).
- `1e4c063` — The sidebar's Admin item wears a count badge: pending memberships plus
  undecided access requests (`countAdminWaiting`, two head-only count
  queries), fetched once per shell mount for admins only. Zero renders
  nothing; a failed count costs only the badge (#311).
- `e0db33a` — Roster gets its sidebar section, staff-only: Add a player and Import
  players as `?open=` deep-links, and Game time — which keeps the section
  open, so its screen does not orphan the menu. Parents see no children (#310).
- `a40464d` — **Training Plans, squad-level** (`/squad/:teamId/training`): the
  coach-facing read of published sessions — upcoming training with a
  "Planned · N blocks · M min" badge per row, each opening the same
  SessionPlan sheet EventDetail uses (read and coach-adjust). Third item
  in the sidebar's Squad Hub section; the hub's Training card repoints
  here from /schedule (#309).
- `01a8ae1` — Sidebar sub-menus, only the active section expanded: Squad Hub gets
  Overview and **Build a Match Roster** — a new picker at
  `/squad/:teamId/match-roster` listing upcoming matches with RSVP tallies
  and a "lineup started" badge, each row landing in the existing Lineup
  screen — and Schedule gets Add an event / Add to calendar as
  `?open=` deep-links the screen consumes and clears. The hub grows a
  Match rosters front-door card so phones reach the picker too (#308).
- `2bac9bb` — Squad Hub joins the mobile tab bar (same `showSquadHub` gate as the
  sidebar; five columns for staff, four for everyone else), which retires
  the Dashboard's Squad Hub card entirely. The Squad Hub loses its
  NoticeBoard — notices live on Home — and its tracking grid gets the
  whole-page-scroll treatment (#307).
- `158a44a` — Schedule table gets the RosterTable treatment — inner scroller and sticky
  header gone, the page scrolls. And the Dashboard's Squad Hub card is
  `desktop:hidden`, not removed: the sidebar duplicates it on desktop, but
  the mobile tab bar has no Squad Hub entry, so on a phone the card is squad
  staff's only way in (#306).
- `514bcbc` — Desktop roster table shows the whole squad: the `max-h-[70vh]` inner
  scroller and the sticky header row are gone from `RosterTable` — the page
  scrolls instead, `overflow-x-auto` kept for windows too narrow for the
  columns (#305).
- `ab9d888` — 📓 **Handoff: the invisible text that wasn't**
  (`claude/handoffs/2026-08-22-the-invisible-text-that-wasnt.md`) — the
  full arc and its five ranked lessons. PaintDebug is KEPT as a permanent
  flag-gated diagnostic; its header still says TEMPORARY — repoint on the
  next src-touching change.
- `8d59c93` — the squash with the switcher fix, gate coverage and the
  changelog repair (#303).

- 📱 **THE PHONE MYSTERY, SOLVED BY THE BOX: the Squad Hub switcher's
  `shrink-0`.** Four hours of "invisible text" on Jay's phone — both
  themes, browser and app, surviving reinstall and a site-data wipe — was
  never colours: with an ADMIN's fifteen squads the header chip row's
  max-content width is ~1127px, `shrink-0` forbade it from ever being
  narrower, the DOCUMENT blew out to 1142px on a 360px phone, and opening
  a sheet re-fit the visual viewport to 32% — text wasn't invisible, it
  was OUTSIDE THE ZOOMED VIEW. The repo's own bolded lesson ("a row that
  overruns does not clip"), reintroduced and re-learned. Fix: `min-w-0`,
  wrap. Proof: `squadhub` + `squadhub-admin` joined the harness overflow
  gate — green at 175 pairs on the fix, and the injected `shrink-0` fails
  5 pairs including Jay's exact 360px. Why no emulation caught it: the
  rig's coach fixture had too few squads; the ADMIN fixture is now the
  gate's.
- 🧰 Paint-debug v3 grew viewport truth (`vw`, `visualViewport`, viewport
  meta) and a widest-element reporter — the two lines that named the
  culprit from Jay's screenshot. The debug train, admin-merged during and
  after the Actions outage:
- `2e7ecbb` — the widest-element reporter (#302).
- `65f38d0` — the viewport-truth lines (#301).
- `9a31dba` — the repair of #299 (#300).
- `a9ac781` — paint-debug v3, which shipped HALF-PATCHED and unparseable
  (#299): a grep-piped test run masked six transform-failed files, and
  Netlify's build refused it, so production stayed on #298. The lesson is
  the pipe, not the patch: exit codes, never grep, decide green.
- `8754c9e` — paint-debug v2, flag-armed through the login redirect (#298).

- 🩺 **Paint-debug v2.** The hash gate was naive: signing in redirects and
  strips `#paint-debug` before any screen renders, so the box could never
  trigger for someone who had to log in — which was exactly Jay after a
  clean-slate site wipe. Now `?paintdebug=1` or the hash ARMS a
  localStorage flag at any moment, the box follows the flag on EVERY screen
  (mounted in AppShell), reacts to hashchange, and carries its own [hide].
- `30b188c` — the squash with paint-debug v1 (#297), admin-merged during
  the Actions outage.

## 21 Aug 2026

- 🩺 **PAINT-DEBUG OVERLAY (temporary).** Jay's phone renders the Squad Hub's
  text invisible in BOTH themes, browser and reinstalled app alike, while
  every emulation this session could build (dark, reduced-motion, forced
  dark, Chromium) renders it perfectly. `src/components/PaintDebug.jsx`
  renders — only under `#paint-debug` — a raw inline-styled box reporting
  the device's UA, theme state, font-load counts and the computed styles of
  the exact elements that vanish. Styled with system-ui inline styles on
  purpose: if the styling pipeline is the casualty, the instrument must
  survive it. DELETE once the phone mystery is solved.
- `3edd2d7` — the squash with the inverse-pill fix and the sweep (#296),
  admin-merged while GitHub Actions was down repo-wide.

- ⬜ **THE WHITE-BLOB PILL, AND THE SWEEP THAT SAYS IT WAS THE LAST.** Jay's
  screenshot after the dark audit: the ACTIVE role-filter pill a solid white
  lozenge. Cause: the inverse fill — `bg-ink text-white` flips its
  background white in dark while the text stays white. The inverse pair is
  `text-surface-card` (each side flips, always opposing); four call sites
  fixed (Accounts + Notices pills), and the theme guard now refuses
  `bg-ink`+`text-white`. Then the audit Jay asked for: a Playwright rig
  (real renderer, real frames — no frozen-transition phantoms) swept every
  harness scenario in BOTH themes. **Dark: clean across the board.** Light:
  only gradient-background false positives the probe cannot see. The rig
  rides in the harness: a `squadhub` scenario plus attendance/announcements
  stubs, so the player-history sheet is screenshotable forever.
  ⚠️ His earlier still-black sheet predated #294's deploy by minutes —
  `color-scheme` is what disarms Android's force-dark, and the flag test
  proved the current page survives `--force-dark-mode` intact.
- `a84b096` — the squash with the dark-mode audit (#294).

- 🌚 **THE DARK-MODE AUDIT.** Jay's screenshot: a sheet rendering
  black-on-black. Three real causes, all systemic: **217 call sites** used
  the FILL reds as TEXT (`text-brand-deep` ~1.8:1, bare `text-brand`
  ~3.6:1 on dark) — swept to the THEMED `danger-ink` (new token, identical
  in light) and `brand-ink`, with the two literally-white pills sanctioned;
  **`color-scheme` was never declared**, so native selects, date fields,
  checkboxes and button fallbacks rendered light-scheme in dark — now
  `light`/`dark` per theme, plus an explicit `button { color: inherit }`;
  and the contrast gate grew the deep-red pairs (all pass ≥6.7:1 dark).
  `tests/theme.test.js` now REFUSES fill-reds-as-text off a white surface.
  ⚠️ Audit lesson for the record: a JS contrast probe in a HIDDEN browser
  tab reads buttons frozen mid-colour-transition (no compositor frames) —
  it reported phantom 1.1:1s. Trust the arithmetic gate and a VISIBLE
  screen; both said green.
- `da54bff` — the squash that gave the tracking grid its phone shape
  (#293).

- 📲 **THE TRACKING GRID GROWS A PHONE SHAPE.** Jay, first real look on his
  phone: "this isn't going to work" — the matrix's event columns and % sat
  off the right edge behind an undiscoverable sideways scroll. On mobile
  the section is now a tappable summary list (player, %, no-shows — the
  numbers a coach acts on) and each player opens a Sheet with their
  event-by-event history, vertical, same marks and same rules as the grid.
  The matrix itself is desktop-only. First coach feedback, answered within
  the hour — exactly what the handoff said to watch for.
- `16f8bf7` — the squash with the evening handoff (#292).

- 📓 **Evening handoff: the Squad Hub and the whole 2.0 retheme**
  (`claude/handoffs/2026-08-21-squad-hub-and-retheme-2point0.md`), and
  `state-of-play.md` now says 2.0 and the hub are live.
- `d21b344` — the squash that put squads in club order (#291).

- 🔢 **SQUADS IN CLUB ORDER, EVERYWHERE.** Jay, from the phone: the Squad
  Hub picker listed U10, U12G, U11... — `loadTeams` in the memberships
  context had NO ORDER BY, so every consumer of `teams` got
  database-insertion order, hidden wherever screens re-sorted locally.
  Now ordered at the source (sort_order, then name — listSquadStaff's
  pair) and re-asserted in the hub's picker; the test fixture is
  deliberately shuffled so insertion order fails the build.
- `95050ca` — the squash with the iPhone status-bar fix (#290).

- 📵 **iPHONE STATUS-BAR FIX.** Jay, from the installed app: "the top bar is
  up under the time, battery, etc, so nothing up there can be clicked".
  viewport-fit=cover has always let the installed app draw under the status
  bar, and every safe-area inset in the codebase handled the BOTTOM — the
  top was never padded. AppShell's sticky chrome wrapper now carries
  `pt-[env(safe-area-inset-top)]` + `bg-chrome`, so the banner and masthead
  clear the clock and the padded strip reads as chrome, not a gap. Desktop
  and un-installed browsers get env() = 0 and are unchanged.
- `87f7eca` — the squash that completed the retheme: phase 5, the sweep
  (#289).

- `bb4c651` — the squash with the phase-4 polish (#288), from a parallel
  session working the same day.
- 🧹 **PHASE 5: THE SWEEP — the retheme is COMPLETE.** Every remaining page
  heading moved to the editorial system: Schedule opens "Club life,
  *calendared.*" and Notices "From the *committee.*" (the portal's own
  lines), Roster "Roster & *members.*", and the admin/working screens took
  the display scale. The dead `.nav-tab` sheen CSS — orphaned when phase 2
  retired the desktop pills — is removed with a tombstone in
  `src/index.css`, and `tests/nav-sheen.test.js` is REPOINTED to pin the
  absence, with a positive control so the negative means something.
  `claude/specs/design-system.md` gains §−1: what 2.0 actually ships,
  superseding §0 where they disagree.
- 🔧 **PHASE 4 POLISH: the loose ends the gate left behind.** TrainingPublish's
  four date fields go `min-w-0` → `min-w-[150px]` so From/To and Starts/Ends
  wrap to their own rows on a phone instead of clipping `dd/mm/yyyy`; the two
  harness comments calling the admin overflow scenarios near-meaningless are
  repointed (the overflow gate now genuinely measures the admin tree — run
  fresh, 165 scenario/width pairs green at 320-414px); and Nav.jsx's "phase 4
  will add an entry point" note now names the Manage card that exists.
- `650c5e1` — the squash that took the width gate off /admin (#287).

- 📱 **PHASE 4: ADMIN ON THE PHONE.** The "Needs a bigger screen" card is
  gone from /admin and the Manage block on /more shows at every width —
  Jay's ruling, same day: "bring admin functions into the app, that is my
  decision now". The feared per-screen rework mostly evaporated on
  measurement: no admin screen renders a `<table>` at all (cards and lists
  throughout), Allocation already scrolled sideways, and the tab row's
  flex-wrap was load-bearing since 12 Aug. Role gates untouched — width was
  never one of them. The inverted gate test now pins "renders ungated".
- `686044b` — the squash that put the editorial voice on the dashboards
  (#286).

- 🗞️ **PHASE 3: THE EDITORIAL VOICE ON THE DASHBOARDS.**
  `src/components/Editorial.jsx` — Kicker (crimson slash + tiny uppercase
  label), AccentTitle (bold headline + ONE Playfair-italic crimson word),
  and BlockTitle (moved out of Dashboard, slash added). Home's greeting is
  now the page headline; Squad Hub opens "U12 Mixed, *tracked.*" with
  sections "On the calendar" and "Who said, who showed", and its desktop
  lays schedule and front doors side by side with the tracking grid
  spanning beneath — grid PLACEMENT classes, so the phone keeps its order.
  /admin's chooser opens "The club's jobs, *pick yours.*"
- `9c9581b` — the squash that shipped the desktop sidebar shell (#285).

- 🧭 **PHASE 2: THE DESKTOP SIDEBAR SHELL.** Desktop stops being a stretched
  phone app: a fixed 256px dark sidebar (`src/components/Sidebar.jsx`,
  modelled on the member portal's, dark in both themes like all chrome)
  carries the nav — Home, Schedule, Roster, **Squad Hub** (staff and
  admins), **Notices**, **Admin** (admins), More — one nav for every
  dashboard. The masthead slims to a utility bar (role pill, App link,
  account, theme toggle), content goes full-width, and `Nav.jsx` is now the
  mobile tab bar alone; the old desktop pills and their Admin gate retired
  into the sidebar. Mobile untouched, and the skip link is still the first
  focusable element on every screen.
- `a91c4b4` — the squash that shipped Club Hub 2.0's phase 1 (#284).

- `121574c` — the squash that committed the retheme spec (#283).
- 🌗 **PHASE 1 OF THE RETHEME: CLUB HUB 2.0.** Dark mode exists — every
  colour token moved to CSS variables (`src/index.css` is now the single
  source of truth; `tailwind.config.js` reads it, `darkMode: 'class'`), with
  the dark palette measured from the club site's own dark mode. Toggle in
  the masthead, default follows the OS, no-flash inline script in
  `index.html` pinned to the lib by test. Playfair Display italic is in as
  the accent voice — "Good afternoon, *Jay.*" — self-hosted like Inter. The
  install is named **Club Hub** (was "Quins") and the version is **2.0.0**.
  The contrast gate grew a full dark-palette section and promptly caught a
  real light-mode AA fail (staff badge green on info tint, 4.46:1 — fixed).
  Also fixed: four checkboxes pointing at `var(--maroon)`, which stopped
  existing in the 6 Aug re-point and had been browser-default blue since.

- 📐 **THE RETHEME IS SPECIFIED.** Jay's rulings, same day: Club Hub joins
  abudhabiquins.com's design family (measured live, both themes), light AND
  dark mode, the member portal's sidebar shell on desktop, **admin functions
  come to the phone** ("that is my decision now"), and the maroon design
  system is REPLACED, not kept as a third theme.
  `claude/plans/2026-08-21-retheme-and-shell.md` — five phases, each its own
  PR. Nothing ships in this commit; the spec is the deliverable.
- `f9314cf` — the squash that opened the hub's events and capped its
  sections (#282).

- 🖱️ **THE HUB'S EVENTS NOW OPEN.** Jay, minutes after seeing it live: the
  Coming-up rows "don't do anything". They now open the same EventDetail →
  Availability / Register drill-in Dashboard and Schedule use, and the hub
  re-fetches when the sheet closes so an RSVP or a register taken there
  reaches the grid at once. Coming up capped at five rows and both it and the
  grid scroll inside themselves rather than taking the page.
- `9caed53` — the squash that shipped the Squad Hub (#281).
- 🏉 **THE SQUAD HUB — the coach/manager dashboard.** `/squad` and
  `/squad/:teamId`: a one-squad coach lands straight in it, multi-squad staff
  and admins pick. Upcoming events with RSVP counts, outstanding RCM sheets
  (non-minis only), roster and training front doors, the squad noticeboard —
  and the new tracking grid: availability beside attendance per event, per
  player, with attendance % (present/(present+absent), excused excluded per
  the ruling in `src/data/attendance.js`) and a said-in-but-absent count.
  New `listAttendanceForEvents()` (chunked like its availability twin),
  pure maths in `src/lib/tracking.js`. No schema changes — the tables
  existed; the aggregate view did not. `claude/plans/2026-08-21-squad-hub.md`.

- `2d36b76` — the squash that recorded the day's handoff (#280).
- 📓 **Handoff for the whole day**, and `state-of-play.md` no longer says the
  dashboard PR is open: it is live.
- `0dd01a3` — the squash that recorded the quick-rip ruling (#279).
- 📐 **QUICK RIP IS TAG.** Jay: *"qr is quick rip which is basically tag, U9 is
  tackling"*. Ten squads marked contact, five left tag, written straight to
  `teams.requires_contact` and measured back. The two QR sides are the living
  reason the flag is a column: `claude/decisions/2026-08-21-quick-rip-is-tag.md`.
- `f46daf9` — the squash that made "View as" scope the noticeboard (#278).
- 🐛 **"VIEW AS" NOW FILTERS NOTICES.** Jay previewed Home as a U7 parent and
  saw a U18B manager's notice badged "Your squad". ⚠️ **Not a leak** — RLS
  (`can_see_team`) never sends a squad notice to another squad's member,
  measured against the row. The preview is a browser filter over an admin's
  session, which the server rightly hands every notice, and notices were the
  one block on Home and /notices that never ran through `visibleTeams()`.
  `scopeNotices()` in `src/lib/notices.js`, applied on both screens; a real
  member's rows are unchanged by it.
- `ec942ba` — the squash that recorded the dashboard verification (#277).
- ✅ **THE DASHBOARD IS LIVE AND VERIFIED END TO END** — merged as `d92adb7`
  (#276), deployed, and driven in Chrome as a super admin: drill → template
  (the 15-not-60 question fired) → publish to one squad → the plan on that
  event's sheet. Verification objects removed afterwards. Handoff:
  `claude/handoffs/2026-08-21-training-dashboard-live.md`. One placeholder
  said "Tuesday hour"; it no longer names a day.
- `d92adb7` — the squash that shipped the Rugby Performance Director dashboard (#276).
- 🏉 **THE RUGBY PERFORMANCE DIRECTOR DASHBOARD IS BUILT — pieces 1–3, one PR,
  23 branch commits, no SHA here because `main` squash-merges.** `training`
  admin right; `/admin/training` with Library, Templates (the hour builder with
  a running total and the 65-minute question) and Publish (preview per squad,
  then the same SQL function for real); a Contact/Tag switch per squad on
  `/admin/club`; the plan on every training event's sheet, adjustable by the
  coach. Migration `training_plans` APPLIED to production on Jay's "apply";
  harness `db/tests/training-plans.sql` 6/6 live. Full suite green, build green.
  ✅ **A second migration, `publish_training_fit_check`, APPLIED the same
  day** — the function had trusted `_teams` with no club or contact check;
  harness now 8/8 live.
  ⛔ Nothing keys on a weekday; `requires_contact` is a column; the null band
  refuses with a reason — and a template that sets NO age now reaches the senior
  squads, which the first cut wrongly refused forever.
- 🏉 **THE RUGBY PERFORMANCE DIRECTOR DASHBOARD IS SPECCED AND PLANNED, pieces
  1–3 of five.** Jay chose the scope (foundation, Library + Templates, Publish +
  coach view); notification email, AI assist and a first/second-session pair
  are out of scope and each gets its own spec later.
  `claude/specs/2026-08-21-training-plans-dashboard-design.md`,
  `claude/plans/2026-08-21-training-plans-implementation.md`. No code yet.
  ✅ **One decision made explicit while writing it: a published session COPIES
  the template's blocks** rather than pointing at the template, so a coach
  trimming one night's warm-up cannot edit fifteen squads' plans.
  ⚠️ Two real names were scrubbed from the 12 Aug training plan while it was
  open (rule 9). Four other files under `claude/` still carry names and are
  noted for a separate pass.
- `ba09917` — the squash that marked the handoff's weekday item closed.

- 📓 **The 21 Aug handoff's weekday item is marked CLOSED**, because it was
  fixed hours after being written and a handoff carrying a false "still open"
  line is how a session redoes finished work.
- `fd05b95` — the squash that stopped anything keying on a weekday.

- ⛔ **NOTHING IN THE TRAINING PLAN MAY KEY ON A WEEKDAY.** Jay: *"some age
  groups train on mon and friday"*. The plan said publish *"assigns per
  weekday"* and offered a *"Tuesday/Thursday pair"* as the likely answer — which
  would have shipped a feature that silently skipped every Monday-and-Friday
  squad.
  ✅ **Publish targets the squad's own training EVENTS in a date range**,
  whatever nights they fall on. Those events already exist with real dates, so a
  Tue/Thu pair, a Mon/Fri pair and a squad that moves to a Wednesday for one
  week become the same code path and none is special.
  ⚠️ **"First and second session of the week" is the ordering that survives**, if
  a pair ever needs to differ — never named days.
  ⚠️ **The two illustrative mentions were neutralised too** ("a wet Tuesday", 
  "Thursday's session"), because a plan that says Tuesday four times teaches
  Tuesday whatever its design section claims.
- `26d56c2` — the squash that recorded the 20–21 Aug session.

- 📓 **20–21 Aug session record** —
  `claude/handoffs/2026-08-21-notices-plans-and-harnesses.md`. Eight pull
  requests, #265 to #272, two migrations applied to production.
  ⚠️ **Its one idea: a green check can be green by coincidence.** Three separate
  things were passing while testing nothing — two push harnesses that compared
  the whole audience against one person's devices and were correct only while a
  single person had subscribed, a harness whose fixture could not execute at
  all, and a notice audience picker that nothing covered.
- `883afd0` — the squash that sent one notice to any number of age groups.

- 📢 **A NOTICE CAN GO TO ANY NUMBER OF AGE GROUPS, OR THE WHOLE CLUB.** Jay:
  *"check boxes for age groups… select whole club and the other options grey out
  so we don't send redundant notices"*. The `<select>` is now a checkbox group;
  ticking **Whole club** disables the squads rather than clearing them, so
  turning it off gives the ticks back.
  ⚠️ **FAN-OUT, NOT A JUNCTION TABLE — one row per squad sharing a `group_id`.**
  `team_id` is the SECURITY boundary (`announcement read`,
  `private.notice_audience`), so a junction table is a rewrite of the read path
  and of the boundary. Same question, same answer as
  `claude/decisions/2026-08-05-multi-squad-events-and-pitch.md` gave for events.
  ⚠️ **BUT A NOTICE TO THREE SQUADS IS ONE MESSAGE, WHICH EVENTS NEVER WERE.**
  A naive fan-out pushes it once per row. **Measured before building: seven
  people hold active memberships in two squads, two of them subscribed.** So
  `notice_push` is now STATEMENT-level over a transition table and sends once
  per group, and `notice_push_subscriptions` resolves the whole group
  `distinct`. `push-send` is untouched and needed no redeploy.
  ⚠️ **`min(uuid)` DOES NOT EXIST IN POSTGRES.** The first trigger draft used it
  and failed — caught only because the migration was run inside a rolled-back
  transaction before being applied. `(array_agg(id order by id))[1]` instead.
  ⚠️ **NOTHING COVERED WHO A NOTICE REACHES.** Swapping the `<select>` for
  checkboxes broke **zero** of 2,972 tests, because not one asserted the
  audience — the control deciding which families get a message on their phone.
  `tests/notice-composer.test.jsx` is new and its faults were injected: no
  greying, empty-means-club-wide, and a per-squad loop were each caught.
- 🧹 **The board collapses a fan-out back into one card**, `collapseGroups` in
  `src/lib/notices.js`, applied at the two render sites and **not** in
  `listNotices()` — which also feeds the receipts sheet, where a per-ROW count
  is the right one. Marking a card read marks every row behind it.
- ⚠️ **AND `git checkout --` WIPED `collapseGroups` MID-SESSION, EXACTLY AS
  `CLAUDE.md` WARNS.** The file was edited AFTER the checkpoint commit, so the
  fault-injection restore reverted it to a version that never had the function.
  `git status` then read clean, which looked like proof and was the opposite.
  **The rule needs the clause it already has read twice: commit before injecting
  a fault, and the file you restore must be IN that commit.**
- `0e883e8` — the squash that dropped the copyright guard.

- ✂️ **THE COPYRIGHT GUARD IS GONE FROM THE TRAINING PLAN, AND `drills.body`
  EXISTS.** Jay: *"its not a problem at all, remove it entirely from the build
  plan, it a solution looking for a problem"*.
  ⚠️ **He is right, and the reason is that the requirement it defended against
  was withdrawn.** The section was a direct answer to the 12 Aug brief's
  *"scrape the web for the best rugby training sessions"*. The 20 Aug reopening
  asks for none of that — it asks for the Director's OWN material, which the plan
  itself called the actual win. By 21 August the guard was defending against
  nothing while stopping a qualified coach writing a drill out properly in his
  own tool.
  ⚠️ **A guardrail whose threat model has been withdrawn is not cautious, it is a
  broken feature.** That is the general form, and it is why this is a decision
  record rather than a quiet column addition —
  `claude/decisions/2026-08-21-drill-body-is-just-a-text-field.md` is a
  TOMBSTONE. The argument was made at length, including the claim that it was the
  one thing in the plan that could not be overruled, and it was overruled by the
  person who owns the club and its risk. **Do not re-add it.**
  ✅ `source_url` and `source_name` survive — linking to where a drill came from
  is useful to a coach on a touchline. They are just no longer the only way to
  record one.
- `bf81ce3` — the squash that reopened the training plan.

## 20 Aug 2026

- 🏉 **TRAINING SESSION PLANS REOPENED, AND ONE MEASUREMENT MAKES PART OF THE OLD
  PLAN WRONG.** Jay, eight days after tabling it: *"i want to create another admin
  position named Rugby Performance Director… develop training plans, focus points,
  structure for sessions… to pass down to any of the age groups he selects"*.
  `claude/plans/2026-08-12-training-session-plans.md` is reopened and corrected;
  no code yet.
  ⛔ **CONTACT VERSUS TAG IS NOT IN THE SQUAD NAMES.** The plan asserted it was,
  citing `U6 Tag` and `U14B Contact` — and `U14B Contact` does not exist, the
  squad is `U14B`. Measured against live `teams`: three names carry "Tag", two
  carry "QR", and **five say nothing at all**. So `requires_contact` becomes an
  explicit column on `teams`, and **inferring it from age is forbidden** — this
  club runs tag sides above the age contact begins, the exact case that breaks
  the inference. ✅ The AGE band is fine: all fifteen names parse.
  ⚠️ **Multi-squad publish overturns the plan's "explicit and per-SQUAD" rule**,
  on Jay's wording. The original worry was blast radius; the answer is
  visibility, not prohibition — a per-squad preview of what changes and what is
  skipped, before anything is written. The two real protections are unchanged: a
  coach-edited session is never overwritten, and the publish says how many it
  skipped.
  ⚠️ **"Rugby Performance Director" is person-shaped and sits awkwardly with the
  12 Aug jobs-not-people ruling.** Put to Jay; his wording stands, and the other
  three labels do not move.
  ✅ **A fourth object, `training_focus`** — a theme spanning weeks for a squad,
  which is what Jay's "focus points" are. It labels a period and **gates
  nothing**.
  ✅ **The tabled list did its job** — nobody offered this for eight days and he
  brought it back himself. That is the argument for the list, recorded now rather
  than after somebody prunes it.
- `7b5356e` — the squash that tabled the live squad_push test.

- 🛑 **The live `squad_push` test is TABLED** (Jay: *"lets table this for now"*).
  Moved onto `claude/state-of-play.md`'s tabled list rather than left in a
  handoff, because it was raised twice in one day and a handoff is exactly where
  the next session would find it and offer it a third time.
  ⚠️ **The measurement is kept, so reopening it costs nothing:** a fixture change
  on **U13 Mixed** made by somebody OTHER than Jay reaches his three devices and
  **nobody else's** — the only squad where that is true. **Being a super admin
  puts you in no squad's audience at all**: `private.notice_audience` keys purely
  on `team_id`, and `squad_push_subscriptions` excludes the actor, so you never
  receive a change you made yourself. U16B is the one to avoid — 8 devices, 5 of
  them other people's.
- `294bdbf` — the squash that corrected the db-check claim.

- ⚠️ **CORRECTION, SAME DAY: `SUPABASE_DB_URL` IS SET, AND THE NIGHTLY IS REAL.**
  Two handoffs said the secret was *"STILL unset"*, and a session repeated it
  into `claude/runbooks/db-harnesses.md` and this changelog **without checking**.
  Measured: `gh secret list` shows it set **19 Aug 2026 12:50 UTC**, and the
  nightly at **20 Aug 04:01 ran 34 harnesses and reported "All harnesses
  passed."** The 19 Aug 04:01 run, before the secret, is the one that printed
  *"the db harnesses did not run"*.
  ⚠️ **AND THE CORRECTION MAKES THE FINDING WORSE, NOT BETTER.**
  `notice-push.sql` and `approval-push.sql` had not "never run" — they were
  **passing every night**, and were **correct only by coincidence**. What broke
  them during 20 August was the CLUB, not the code: subscribers went from 1 to
  8, and the two numbers those harnesses conflated stopped being equal. They
  would have gone red at 04:01 the next morning, for a change nobody made.
  ⚠️ **So: a green nightly is evidence about the moment it ran and nothing
  else** — and only two harnesses had genuinely never run, `signup-nudges.sql`
  and `email-confirmed-sync.sql`, both added after that morning's run.
  **The rule that keeps being relearned here is the cheap one: measure the
  claim, do not carry it forward.** `CLAUDE.md` rule 4.
- `7390a2c` — the squash that ran all nine harnesses and fixed three.

- 🧪 **ALL NINE db/tests HARNESSES RAN FOR THE FIRST TIME, AND THREE OF THEM
  WERE BROKEN.** Each was run through the Supabase MCP inside its own
  rolled-back transaction, after proving the runner's rollback with a control.
  ⚠️ **THE "SUPABASE_DB_URL IS STILL UNSET" PART OF THIS ENTRY WAS WRONG AND IS
  CORRECTED BELOW** — see the 20 Aug correction entry above. The secret has been
  set since 19 Aug and the nightly is real; two of the three broken harnesses
  had been PASSING it.
  ⚠️ **`db/tests/notice-push.sql` and `db/tests/approval-push.sql` compared the
  WHOLE AUDIENCE's notified devices against ONE PERSON'S.** Both were written
  when exactly one person had ever subscribed — "the only subscriber is Jay",
  19 Aug — so the two numbers were identical and the distinction was invisible.
  Eight subscribers later, notice-push reported *"reached 9 rows for 3
  device(s)"* and approval-push reported *"the REQUESTER would be buzzed about
  their own request"*. **Both were false**: 10 subscriptions minus the poster's
  own 1 is exactly right, and a second super admin had subscribed and was
  correctly told. Neither function returns a `profile_id`, which is what made
  the loose count look reasonable; the counts now join back on the subscription
  id and filter to the person each assertion is worded about, with an
  unfiltered control beside them.
  ⚠️ **The rule: a harness that grows red as the club grows is testing the
  fixture, not the feature.** `claude/runbooks/db-harnesses.md` carries it, plus
  which six passed as written and which counts are unfiltered on purpose.
  ✅ **Every self-test still bites** — each fault injection was re-run after the
  fix and still caught. Production verified clean afterwards: no harness users,
  clubs, squads, fixtures, notices, reports or subscriptions, policies intact,
  and `authenticated` still cannot TRUNCATE.
- `901a087` — the squash that spaced the two chase emails six days apart.

- 📧 **THE TWO CHASE EMAILS WOULD HAVE ARRIVED SECONDS APART.**
  `db/migrations/20260820_signup_nudge_spacing.sql`, **applied to production**.
  The original guard asked *"has nudge 1 been sent?"* and never *"how long
  ago?"* — and `private.send_signup_nudges` loops `array[1, 2]` inside ONE call,
  so step 1 inserts the nudge-1 row and step 2 finds the row it just wrote **in
  the same transaction**. Anybody already older than seven days when first
  chased got both, the second saying it was the last reminder we would send.
  ⚠️ **Measured against production, not imagined: two accounts, 10 and 11 days
  old**, would have received both the moment an admin clicked **Restore** —
  `restoreAccessRequest` DELETEs the request row, so un-dismissing somebody
  removes the only thing suppressing the chase and their age does the rest.
  ⚠️ **It is the 20 Aug lesson a third time: what a row MEANS changed under a
  query reading it.** "Has a nudge-1 row" was written to mean *chased a while
  ago* and quietly also meant *chased four lines up*.
  Nudge 2 now needs nudge 1 to be **six days** old. A backlog person still gets
  both — Jay: *"they should get the email if info is missing"* — six days apart
  rather than six seconds.
- 🧪 **`db/tests/signup-nudges.sql` HAD NEVER ONCE BEEN RUN, AND BOTH THINGS
  WRONG WITH IT WERE INVISIBLE BECAUSE OF THAT.** It was added AFTER that
  morning's nightly `db:check`, so no run had ever reached it. ⚠️ **Not because
  the runner is off** — corrected 20 Aug, see above.
  ⚠️ **Its fixture could not execute at all** — it inserted `public.profiles`
  before `auth.users`, violating `profiles_id_fkey` on the first statement of
  its own setup, and the row was a duplicate anyway because inserting into
  `auth.users` fires `on_auth_user_created` and the profile appears by itself.
  ⚠️ **And part 5 ASSERTED THE BUG**, demanding nudge 2 be due the instant the
  claim row was written. **A harness that has never run is not evidence of
  anything, and reads like evidence of everything.**
  Now proved both ways against production inside a rolled-back transaction:
  **fails at part 5 before the migration, passes all seven after.**
- 🔎 **Measured, so it is not asked again:** the signup-nudge cron has **never
  fired** — no row in `cron.job_run_details` at all — because it was scheduled
  after that day's 07:10 UTC slot. `public.signup_nudges` is empty. The two
  unfinished accounts are correctly excluded, so the first real fire sends
  nothing. The funnel is real, not a broken query: 51 users → 49 confirmed → 35
  over 24h → 2 without a membership → 0 after the volunteer/dismissed rule.
- 🔒 **A REAL CLUB MEMBER'S NAME AND INBOX WERE IN A PUBLIC REPO, AND SO WAS A
  CHILD'S ADDRESS.** The 20 Aug handoff recorded this as one hard-coded address
  in `harness/stubs/`. It was that, plus the same person's **first name across
  three test files**, their **full name in `harness/shoot-pending.mjs`**, a
  sentence naming them in `src/screens/AuthConfirm.jsx`, their **live signup
  timestamp identifying their row** in two plan documents, and a separate real
  Gmail address — a child's, by its spelling — in `tests/access-new-player.test.jsx`.
  ⚠️ **THE LEAK PATH IS NOT HYPOTHETICAL: `harness/` IS PHOTOGRAPHED.**
  `scripts/shoot-*.mjs` renders those stubs to PNG and the two parent-facing
  guides were built from those PNGs, so fixture data in this repo reaches the
  whole club as pictures. Identities invented, shapes kept exactly — the pending
  row still has `full_name: ''`, an outside personal address and the same
  timestamp, because the shape is everything the screen is tested on.
  ⚠️ **Jay's OWN addresses were left alone deliberately.** He is the repo's
  public author, and `claude/runbooks/first-admin.md`'s bootstrap SQL does not
  work without his. **His to decide, not a session's.**
  ⚠️ **git history still holds every one of these** — this cleans the working
  tree, not the past.
- 🧯 **`docs:check` grew an eighth check, and it is one CLAUDE.md said could not
  exist.** The rules file says a name denylist would put those names into the
  repo, in the checker — true of NAMES, false of MAILBOXES. `checkRealInboxes`
  fails on any address at a personal mail provider in `src/`, `tests/`,
  `harness/`, `scripts/`, `db/` or `supabase/`, from a list of **domains**, which
  names nobody. ⚠️ **`harness/` and `scripts/` are in scope here and are absent
  from `trackedCode()`** — the existing retired-names scan has never once looked
  at the harness, which is precisely where the address was sitting.
  ⚠️ `claude/` is deliberately exempt: a check that fails an operational runbook
  is a check that gets switched off.
- `f27b99a` — the squash that took a real member's name and a child's inbox out of a public repo.
- `c8009d5` — the squash that recorded the 20 Aug session.

- 📓 **20 Aug session record** —
  `claude/handoffs/2026-08-20-onboarding-and-the-meaning-of-a-row.md`. Nine pull
  requests, #255 to #263, most of them reacting to something Jay saw on the live
  Accounts screen while families were signing up around us.
  ⚠️ **Its one idea: widening WHO WRITES a row silently changes what READING one
  means.** `access_requests` had a single writer, so "has a request" honestly
  meant "waiting on an admin". The moment the first screen wrote one for
  everybody, a mount check three files away turned the sign-up screen into a dead
  end — and the follow-up nudge would have repeated the same mistake in the
  opposite direction, chasing nobody.
- `4424a9a` — the squash that added the unfinished-signup follow-up emails.


- 📮 **NOBODY CHASED THE PEOPLE WHO SIGNED UP AND STOPPED. NOW SOMETHING DOES.**
  Jay asked *"will they be nudged again?"* and the honest answer was: only if
  they choose to come back. One email at 24 hours, one at seven days, then
  silence — cadence and audience both decided here, on Jay's *"you decide, go"*.
  ⚠️ **THE CAP IS A PRIMARY KEY, NOT A COUNTER.** `signup_nudges` is keyed on
  (profile_id, nudge_no), so two is two even if somebody re-runs the job by
  hand. A counter resets; a key does not.
  ⚠️ **CLAIM FIRST, SEND SECOND** — the rows are written BEFORE the HTTP call, so
  a failed send cannot mail anybody twice. The cost is the opposite failure, a
  nudge recorded that never arrived, and for a reminder that is much the cheaper
  of the two. Same order as `private.send_availability_nudges()`.
  ⚠️ **"HAS AN ACCESS REQUEST" IS NOT "HAS FINISHED", AND THAT MISTAKE WAS MADE
  EARLIER THE SAME DAY** — it is what turned the roll-call into a dead end. The
  rule that survived is the one used here: any membership row means they
  finished something, a `volunteer` request IS the whole ask, and a DISMISSED
  request means the club already said no. Chasing any of those three would be
  worse than chasing nobody.
  ⚠️ **RLS ON WITH NO POLICY, DELIBERATELY.** `signup_nudges` lists who the club
  has chased. `authenticated` reads nothing from it; only the SECURITY DEFINER
  job touches it.
  ✅ **PROVED AGAINST PRODUCTION, INSIDE A ROLLBACK.** Four accounts — finished,
  waiting-volunteer, already-refused, interrupted — and only the interrupted one
  is selected. Then the cap: nudge 1 excludes itself once sent, nudge 2 follows
  it and never precedes it, and a third is impossible.
  ✅ **THE FIRST REAL RUN SENT NOTHING, CORRECTLY.** Everybody currently unfinished
  signed up today and is not yet 24 hours old. A control with the age gate
  removed returns exactly one person, which is what makes "0" a fact about the
  data rather than a broken predicate.
- `cb6c2b9` — the squash that let a parent be approved by adding the child.


- 🧩 **A PARENT WHOSE CHILD IS NOT ON THE ROSTER CAN NOW BE APPROVED — BY ADDING
  THE CHILD.** The tickbox built a parent row with `player_id` null, and the
  database refuses precisely that:
  `memberships_family_role_needs_player`, Jay's ruling of 14 Aug 2026 —
  *"nobody outside staff should be able to create an account without a player"*.
  So the control failed **every time it was used**, and the refusal surfaced from
  `src/data/members.js`, a layer the admin cannot see, which is why it read as a
  mystery rather than as a rule.
  ⚠️ **THE SAME DEAD END EXISTED IN INVITES, AND IT WAS THE CRUELLER OF THE TWO.**
  `accept_invite` carries its own guard — *"This invite is incomplete — it does
  not say which player it is for."* On the Accounts screen the ADMIN met the
  refusal immediately; on an invite the admin saw success, the mail went out, and
  the FAMILY hit the wall days later on a link that looked broken.
  ⚠️ **THREE TESTS PINNED THE IMPOSSIBLE PATH IN PLACE.** All three stayed green
  because `grantMemberships` and `createInvite` are mocked and acceptance happens
  in the database — so nothing between the form and Postgres ever ran the rule
  the form was breaking. A green test over a broken control is worse than no
  test: it is why this survived to production.
  ✅ Both roles now take the route the player role always did: add the person,
  then link. `role` is carried through rather than hard-coded, because that
  branch is now shared — hard-coding it would land a parent on their own child's
  squad as a PLAYER.
- `e0340d2` — the squash that stopped the roll-call becoming a dead end.


- 🚑 **THE ROLL-CALL BECAME A DEAD END, AND IT WAS SHIPPED AND CAUGHT THE SAME
  DAY.** Jay asked a question — *"will they be nudged again?"* — and the answer
  turned out to be no, when hours earlier it had been yes.
  ⚠️ **THE MOUNT CHECK READ "HAS A REQUEST" AS "HAS NOTHING LEFT TO DO".** That
  was true until the same afternoon: only the "I help the club another way" tick
  wrote an `access_requests` row, so its presence really did mean waiting on an
  admin. Once the FIRST screen started writing one for everybody, a parent who
  chose their squads and closed the tab came back to `RequestAccess` — which is
  TERMINAL — and could never add their child.
  ⚠️ **`volunteer` IS THE ONLY JOURNEY THAT ENDS THERE, and the reason is
  structural.** Registering a child and claiming a squad both write a membership
  row, and this screen only renders while there are none — so anybody still
  looking at it has completed no section at all, whatever they already asked
  for. A volunteer is the single case whose request IS the whole ask.
  ⚠️ **THE LESSON IS ABOUT THE MEANING OF A ROW, NOT ABOUT A BRANCH.** Widening
  who writes `access_requests` silently changed what reading one means, three
  files away, with no test in between. Two existing tests kept passing because
  their fixtures happened to omit a role.
- `678ee8c` — the squash that put the squads on the first screen.


- 🚪 **THE FIRST SCREEN NOW ASKS WHICH SQUADS, AND WRITES THE REQUEST IN THE SAME
  SUBMIT.** Jay: *"is there a way to force people to choose their requested
  access in one shot?"* — and, on the shape of it, **"multi select"**.
  ⚠️ **THE OLD ORDER WAS THE DEFECT.** `RollCall` saved the name on screen one
  and asked what the person actually wanted on screen two, so anybody who
  stopped in between left a named profile and nothing else. Measured on
  production: three people waiting, all confirmed, all signed in, **none with a
  request row**, two of them named.
  ⚠️ **AN ARRAY, NOT A ROW PER SQUAD.** `access_requests` carries
  UNIQUE (profile_id) and the whole approval queue is built on it —
  `requestByProfile` is a Map keyed by profile, dismissal is per person.
  `requested_team_ids` holds the list; `requested_team_id` keeps the FIRST,
  because the INSERT policy requires it and that policy was added 16 Aug for
  this same complaint. It is not weakened here.
  ⚠️ **NO BACKFILL, DELIBERATELY.** A one-element array would make "asked for
  one squad" indistinguishable from "asked before the column existed". The card
  falls back to the single column, and a test pins that fallback.
  ⚠️ **THE STAFF ROLE IS ASKED HERE TOO, because "staff" alone cannot be
  written.** `requested_role` is CHECKed against a fixed list; coach, manager
  and medic are three different claims and guessing one would put a wrong answer
  in front of whoever approves it.
  ⚠️ **A REQUIRED FIELD THAT COULD STRAND SOMEBODY WAS CAUGHT BY A TEST, NOT BY
  REVIEW.** With no squads loaded the picker demanded a choice that could not be
  made — the dead-affordance defect this codebase has shipped once already.
  `tests/parent-self-registration.test.jsx` renders exactly that case. The
  requirement is now conditional on there being squads, and the picker hides
  itself when there are none.
  ⚠️ **55 EXISTING TESTS BROKE, AND ALL OF THEM WERE RIGHT TO.** Every test that
  walked the first screen now meets a mandatory field. The helpers find the
  picker by its **legend**, not by a squad name, because the three files that
  drive it name their squads differently.
- `4452849` — the squash that unblocked approvals and added the no-request badge.


- 🐛 **AN ADMIN COULD NOT ADD A PLAYER WHO WAS NOT ON THE ROSTER YET.** Granting
  Player access with "they're not on the roster yet" answered with the raw
  database refusal — *null value in column "club_id" of relation "players"
  violates not-null constraint* — printed on the live Accounts screen, mid
  approval. Reported by Jay from production, 20 Aug 2026.
  ⚠️ **`AccessBuilder` BUILT `{ full_name, team_id }` AND NOTHING ELSE.**
  `players.club_id` is NOT NULL. `src/screens/PlayerForm.jsx` has always sent
  it, which is exactly why the same action worked from the roster and failed
  from here — the two paths had drifted, and only one of them was right.
  ⚠️ **TAKEN FROM THE CHOSEN SQUAD, not from a club id threaded down as a prop.**
  The team is the thing the admin actually picked; deriving it from anywhere
  else would let a new player land in a different club from the squad they were
  just assigned to.
  ⚠️ **TWO TESTS EXISTED AND BOTH LET IT THROUGH, WHICH IS THE PART WORTH
  KEEPING.** `tests/accounts.test.jsx` gave its teams **no `club_id`** — a row
  that cannot exist, the same defect its own `status` note records for
  memberships — and never mocked `upsertPlayer` at all, so the path was
  unreachable. `tests/access-new-player.test.jsx` DID reach it and asserted
  `toHaveBeenCalledWith({ full_name, team_id })` **exactly**, which pinned the
  bug in place: it went green precisely because the column was missing. Both are
  fixed, and the exact match is kept on purpose — an extra column there is a
  column the database was never asked about.
  ✅ A friendlier refusal replaces the constraint text if a squad ever arrives
  without a club, rather than showing an admin Postgres internals again.
- `2a4049e` — the squash that added the email-confirmed badge.


- 🏷️ **"HASN'T SAID WHAT THEY NEED" — THE ABSENCE OF THE "Asked" BADGE WAS
  CARRYING THE USEFUL FACT, AND WAS INVISIBLE.** Jay, 20 Aug 2026: *"I'm still
  getting approval requests with no indicating who they are or what they are
  requesting."*
  ⚠️ **THE LIST IS FED BY SIGNUPS, NOT BY REQUESTS.** Anyone who creates a login
  lands in "Waiting for access" whether or not they ever told the club anything,
  so somebody who said nothing looked identical to somebody who asked to coach a
  named squad. Measured on production: all three people then waiting had
  confirmed, had signed in, and **none had left a request row**. Two of them had
  even given their name.
  ⚠️ **WHY A NAME BUT NO REQUEST IS THE COMMON STATE, AND IT IS NOT A BUG.**
  `RollCall` asks for the name first and saves it — its own header says "THE
  NAME IS ASKED BEFORE ANY WRITE", because `request_staff_role` is gated on
  `name_confirmed_at`. The screen that says what they actually want comes next.
  Anyone who stops in between leaves a named profile and nothing else.
  ✅ **RULED OUT: THEY ARE NOT STUCK.** `team read` is
  `(select auth.uid()) is not null`, so a brand-new account can read the squad
  list and the next screen works. Measured off `pg_policy`, not assumed.
  ⚠️ **GATED ON `requestsLoaded`, NOT ON `!request`.** The requests read fails
  OPEN to an empty array, deliberately, so that nobody waiting is ever hidden.
  That is right for the list and wrong for this label: without the guard a
  single dropped connection would tell an admin that every person in the queue
  had said nothing. Pinned by a test that rejects the read.


- 🏷️ **THE "WAITING FOR ACCESS" LIST NOW SAYS WHETHER THE LOGIN WAS EVER
  CONFIRMED.** Two very different people land in that list and their cards were
  identical: somebody who confirmed, signed in and is genuinely waiting for an
  admin, and somebody who created a login and **never opened the confirmation
  email** — who cannot sign in at all, so granting them access achieves nothing
  until they do. Measured on production the day this shipped: of five accounts
  with no active membership, one was in the second state.
  ⚠️ **THE OBVIOUS IMPLEMENTATION IS SILENTLY BROKEN, AND THE MIGRATION EXISTS
  TO AVOID IT.** `email_confirmed_at` lives in `auth.users`, which PostgREST
  does not expose, so it is mirrored onto `public.profiles` the same way
  `email` already is. But it CANNOT ride the existing sync:
  `on_auth_user_email_updated` fires `AFTER UPDATE OF email` with
  `WHEN (old.email IS DISTINCT FROM new.email)`, and confirming an address does
  not change the address. That trigger would never fire, the column would sit
  null forever, and the screen would confidently report every member as
  unconfirmed. Hence `on_auth_user_email_confirmed`, keyed on the column that
  actually moves.
  ⚠️ **THREE STATES IN THE UI, NOT TWO.** `undefined` — the column absent from
  the row — renders NOTHING. Only `null` means "never confirmed". Treating the
  two alike would state as fact something we do not know, about real families,
  on the screen an admin acts from.
  ⚠️ **ORDER MATTERS: THE MIGRATION GOES FIRST.** PostgREST rejects a select
  naming a column that does not exist, so shipping the code first would not
  mean a missing badge — it would error the whole Accounts screen.
  ✅ **NO NEW GRANT, AND NONE NEEDED**, measured before it was written:
  `authenticated` already holds table-level SELECT on `profiles` and `anon`
  holds nothing, so the column is readable exactly where the row already was.
  `db/tests/email-confirmed-sync.sql` proves the mirror by making the database
  do it — setting the value and clearing it again — rather than by checking the
  trigger exists, because the way this breaks is that it silently stops moving.
- `407e5e4` — the squash that pointed the clone check at the main clone.


- 🛡️ **THE CLONE CHECK NOW WATCHES THE MAIN CLONE TOO, WHICH IS THE ONE FOLDER
  IT COULD NEVER SEE.** Measured the same day: the main clone was **35 commits
  behind** while `scripts/session-guard.mjs` reported nothing wrong. Both were
  true at once.
  ⚠️ **THE MECHANISM IS THE WHOLE POINT, AND IT IS NOT NEGLECT.** Sessions run
  in LINKED WORKTREES, which are cut fresh from `origin/main` and are therefore
  current *by construction*. The guard checked whichever folder the session
  opened in, so it checked a folder that could not be stale — and never looked
  at the one that could. **The alarm was pointed at the wrong room.** No amount
  of remembering the rule would have caught this; the rule was being followed.
  ⚠️ **A THIRD SEVERITY, DELIBERATELY.** An advisory says something is wrong
  ELSEWHERE on the machine. Filing it under `problems` would print "do not
  treat the working tree as current" about a tree that IS current — a guard
  that cries wolf is the exact failure this file's header was written against.
  ⚠️ **NO SECOND FETCH AND NO HARD-CODED PATH.** Linked worktrees share the
  common `.git`, so the `origin/main` section 2 just fetched is the ref this
  reads. The main worktree is found via `git worktree list --porcelain`, which
  lists it first — an absolute path that happens to exist on one machine is a
  local accident, not code.
  ⚠️ **IT ALSO WARNS WHEN THE PULL WILL REFUSE.** On 20 Aug the fix was not
  simply `git pull`: two tracked files were locally modified *and* touched by
  incoming commits, so git declined. Telling somebody to run a command that
  will fail, without saying why, just moves the puzzle.
  ✅ **PROVED IN FOUR STATES, since the hook had no test at all**: silent when
  everything is current; fires when the main clone is behind; adds the refusal
  warning when it is behind AND dirty; and stays silent when run FROM the main
  clone, which is the false positive that would have made it noise.
- `8344ab6` — the squash that changed the install banner to "Download the App".


- ✏️ **THE INSTALL BANNER NOW SAYS "DOWNLOAD THE APP".** Jay, 20 Aug 2026 —
  parents look for a download, and the old heading ("Add Quins to your home
  screen") described the mechanism rather than the thing they wanted.
  ⚠️ **THE HEADING IS DELIBERATELY THE ONE INACCURATE WORD ON THE CARD.**
  Nothing is downloaded from a store; this is a PWA. The heading borrows the
  word people search for and the body then says what actually happens, which is
  why the two do not match.
  ⚠️ **THE iOS BODY STILL SAYS "ADD TO HOME SCREEN", AND MUST.** That is the
  literal wording of the menu item in Safari's share sheet, and a parent has to
  find those exact words. Renaming it to match the heading would point at a
  control that does not exist — the dead-affordance defect the Android/iOS
  split in `src/components/InstallPrompt.jsx` exists to avoid.
  ✅ **PINNED BY THREE NEW ASSERTIONS, BECAUSE NOTHING PINNED THE COPY BEFORE.**
  Two hold the heading on each platform, one holds the Safari step apart from
  it. Proved by reverting the heading and watching them go red — a copy test
  that has never failed is not a check.
- `e4f79a5` — the squash that fixed the screenshot harness's first-login gate.

## 19 Aug 2026

- 🐛 **THE SCREENSHOT HARNESS RENDERED EVERY SCREEN THROUGH THE FIRST-LOGIN
  GATE, AND NOTHING CAUGHT IT BECAUSE NOTHING LOOKS AT A SCREENSHOT.** Found
  while shooting a parent guide: the "Do you have a player at the club?" sheet
  sat on top of Home, Roster, Schedule and Availability in every scenario that
  reached them.
  ⚠️ **THE DEFAULT WAS THE BUG, NOT A MISSING KNOB.** The stubs left
  `no_player_confirmed_at`, `no_role_confirmed_at` and every child's birthday
  unanswered, so a scenario had to opt OUT of a gate it never wanted — and none
  did. They now default to the SETTLED account, exactly as `name_confirmed_at`
  and `phone` already did, and `?firstLogin=1` opens the whole gate in one knob.
  ⚠️ **`MembershipProvider` NEVER SET `realMemberships`**, which production
  always does — `src/lib/memberships.jsx` builds it as `realMemberships:
  memberships`. NamePrompt reads `hasPlayer = (realMemberships ?? []).some(…)`,
  so every parent scenario looked like an account with no child linked.
  ⚠️ **IT HAD BROKEN THE HARNESS'S OWN CONTROL CASE**, which is how old the rot
  is: `shoot-pending.mjs` drives `scenario=name-prompt` as the case that must
  show NO sheet, and had been getting one.
  ⚠️ **`event-detail` WAS HARD-CODED TO A COACH**, so the only screenshot it
  could produce showed Edit / Duplicate / Delete to a parent. `?who=parent` now
  matches the knob `availability` already carried. ⚠️ `canEdit` is a PROP, not
  derived from the memberships — swapping those alone moved the masthead and
  nothing else on the sheet.
  ✅ **PROVED IN BOTH DIRECTIONS.** Fifteen scenarios assert the gate is SHUT,
  and two assert it still OPENS (`?firstLogin=1`, `?unconfirmedName=1`): a gate
  that could no longer be raised would be the same defect wearing the other
  face. Each case also asserts the page actually rendered, because a blank
  screen passes "no gate" while proving nothing.
  ⚠️ **LEFT BROKEN ON PURPOSE.** `shoot-pending.mjs` blocks 4b and 4c fill
  `#name-prompt-full-name` and click "Not now". Neither exists — the name split
  into two fields and the skip was deliberately removed — and `?blankName=1` no
  longer opens the gate at all now that it is not the thing holding it open.
  What those blocks should assert against today's component is a decision, not
  a repair, so they are named here rather than guessed at.
- `dc12ef5` — the squash that corrected the monitoring runbook's Sentry line.

- 🧹 **`claude/runbooks/monitoring.md` SAID SENTRY WAS SWITCHED OFF, FOR THE
  SECOND TIME.** The body of that file has said "LIVE since 16 Aug 2026" since
  it was corrected; its OPENING SUMMARY still said "an error tracker is built
  but switched off" — and the summary is the part anybody reads.
  ⚠️ **The first time this claim went stale, a code review believed it and
  recommended deleting `@sentry/react` as dead weight.** The fix then updated
  `CLAUDE.md` and the body of the runbook, and missed the header.
  ⚠️ **The lesson is about where status lives, not about Sentry.** A file
  stating its own status twice will eventually disagree with itself, and the
  copy that rots is the one nobody scrolls past. Say it once, or change both.
- `214c23f` — the squash that made all 34 harnesses pass.

- ✅ **ALL 34 DATABASE HARNESSES PASS, AND ALL 34 SELF-TESTS FIRE.** The last
  two failures were closed, and neither was what it looked like.
  ⚠️ **`rls-squad-staff-approval` was NOT a disclosure**, and that was measured
  rather than assumed: the fixture counted every pending registration in the
  CLUB instead of its own two, so it went red simply because two real families
  were waiting for approval. A U16B coach was measured seeing **0** pending
  rows from any other squad. **A check whose result depends on the live roster
  is not a check** — now scoped to the profiles it creates.
  ✅ **`rls-availability-equivalence` REPOINTED, not deleted** (rule 7). It
  compared a policy merge before and after; the merge shipped 9 Aug, so the
  fault could no longer be injected and it aborted every night. The
  seven-caller matrix it proved is now asserted against the merged policies
  that ship today.
- 🔎 **REPOINTING IT CAUGHT FOUR THINGS, THREE INTENDED AND ONE NOT.** Three
  cells of that matrix have legitimately moved since 9 Aug — a PENDING coach
  lost access when the admin gates began requiring an active membership; a
  PENDING parent GAINED sight of their own child's answer (the "app lost my
  answer" fix); and `anon` moved from silently matching nothing to being
  refused by the table grant. Each is now recorded against the migration that
  owns it, so the NEXT movement is visibly new.
  ⚠️ **AND THE ORIGINAL SELF-TEST HAD QUIETLY STOPPED WORKING.** It dropped the
  `can_edit_team` arm of `avail read` — load-bearing on 9 Aug, when that
  function ignored status. Since 18 Aug it requires an ACTIVE membership, so
  every caller it admits is already admitted by `can_see_team`: **the arm is
  redundant today and removing it moves nothing**, so the self-test would have
  passed while proving nothing. It now drops `is_own_player`, which genuinely
  blinds a parent. ⚠️ **The redundant arm was KEPT** — one boolean, and it is
  what stops `avail read` drifting if that status test is ever removed again.
- 🔑 **The stale Supabase publishable key in `.env` is fixed** (29 characters
  against the live 46; it returned "Invalid API key"). ⚠️ **A side effect worth
  knowing: the local suite now emits a few unhandled WebSocket errors**, because
  the realtime client actually connects where it previously could not. Proved by
  control — placeholder credentials produce none, the real key produces them,
  and all 2,954 tests pass either way. **CI is unaffected**: it runs with
  `placeholder.supabase.co`.
- `c9ff8ea` — the squash that shipped the harness repair and the initplan fix.
- `f75827e` — the squash that shipped the availability nudge.

- 🚨 **THE NIGHTLY DATABASE CHECK RAN FOR THE FIRST TIME, AND 14 OF 34
  HARNESSES FAILED.** `SUPABASE_DB_URL` was added, so
  `.github/workflows/db-check.yml` stopped reporting "did not run" and passing.
  ⚠️ **IT HAD BEEN GREEN FOR THE WORST POSSIBLE REASON** — inert for days while
  fixtures rotted underneath it. Thirteen are fixed; two are recorded in
  `claude/open-items.md` rather than quietly dropped.
  ✅ **ONE GENUINE PRODUCTION DEFECT**: seven RLS policies called `auth.uid()`
  bare, so Postgres re-evaluated them once per ROW.
  `db/migrations/20260819_rls_initplan_round_two.sql`. ⚠️ **The harness names
  only the FIRST offender**, so fixing what the error said would have left six
  and reported the next one tomorrow — a full `pg_policy` sweep found all
  seven, **three of them on `storage.objects`, a schema the 14 Aug round never
  touched.** Equivalence proved in a rolled-back transaction: 7 rewritten, 7
  character-identical after normalising, 0 bare calls left against 86 policies.
  ✅ **And the runner now stops dead on a credential failure.** It opened a
  connection per file, so one wrong password became 34 failed logins and
  tripped Supabase's pooler circuit breaker — twice in twenty minutes, the
  second time hiding the real cause behind a rate-limit error.
- 🔧 **WHAT THE THIRTEEN ACTUALLY WERE**, because the pattern matters more than
  the fixes: **squads were renamed** (a " Contact" suffix dropped) and five
  harnesses still named the old ones; **a constraint added 17 Aug**
  (`memberships_family_role_needs_player`) broke four fixtures that create a
  parent with no child; **a column list grew** and two allowlists never
  followed; **one file could not even PARSE** — an E-string spliced into
  adjacent literals — so `grants.sql` asserted nothing at all while reporting a
  syntax error nobody read.
  ⚠️ **Two were the harness being right and the expectation being stale**:
  `announcement_stats` began excluding the author on 14 Aug, and
  `notice-push.sql` assumed one device per person until a second phone
  subscribed. Both were fixed by making the fixture RICHER — adding a squad
  parent who never reads, and counting devices instead of assuming one —
  **rather than by lowering the numbers until they passed.**
- ⏰ **THE AVAILABILITY NUDGE — THE FIFTH AND LAST NOTIFICATION CATEGORY, AND
  THE ONLY ONE THAT IS NOT A ROW-CHANGE TRIGGER.** A daily `pg_cron` job at
  05:23 UTC (09:23 in the UAE) asks the families who have not said whether their
  child is playing, up to 48 hours before a match.
  ⚠️ **MATCHES ONLY, AND A NUMBER DECIDED IT RATHER THAN A PREFERENCE.**
  Measured against the live club before anything was designed: nudging every
  upcoming event would be **338 notifications**; matches only is **6**. There
  are 62 upcoming events and 2 of them are matches. That is not a noisier
  version of the feature, it is a different and much worse one.
  ⚠️ **NOBODY IS EVER NUDGED TWICE**, and the guarantee is a claimed ledger —
  rows inserted BEFORE the push is queued, carrying a batch id the send is keyed
  on. A failed send therefore LOSES a nudge rather than repeating it, which is
  deliberate: there is no email behind this category, so the family buzzed twice
  is the family that mutes the app.
  ✅ **The schedule was proved to FIRE, not assumed** — a temporary every-minute
  probe ran the real function three times, all `succeeded`, then was
  unscheduled. A schedule that has never fired is not a schedule.
- 🔎 **TWO FINDINGS FROM VERIFYING IT, BOTH WORTH MORE THAN THE CODE.**
  ⚠️ **The first harness passed while testing nothing.** Both upcoming matches
  were further out than 48 hours, so the window was EMPTY and every "expect 0"
  was free — it would have passed against a completely broken feature. It now
  creates its own match inside the window, paired with a training session at the
  same moment on the same squad, so the type rule is tested against a control
  that differs by one column.
  ⚠️ **And the self-test was aimed at the wrong mechanism.** It removed the
  not-already-nudged clause and nothing noticed — because `on conflict do
  nothing` makes a repeat claim insert zero rows. **The PRIMARY KEY is the
  guarantee; that clause is only belt-and-braces.** The fault injected now is
  the plausible one: "fixing" batch tracking with `do update`, which would buzz
  every unanswered family every morning. That fault IS caught.
- `0c86ba3` — the squash that shipped approval notifications.

- 📓 **THE SECOND 19 Aug SESSION RECORD**,
  `claude/handoffs/2026-08-19-approval-notifications.md` — approval
  notifications, and closing the fixture proof the first session left open.
  ⚠️ **It records a split worth knowing before touching anything**: the database
  and the edge function are LIVE with the approval change and the app is not,
  because no pull request was raised. The category therefore cannot be switched
  OFF through the UI yet — absence of a row means on, so it works; there is just
  no way to decline it until the branch merges.
  ⚠️ **And the trap that would have looked like a broken feature**: creating a
  pending membership fires the EMAIL trigger too, so testing the push mails real
  volunteers unless that trigger is disabled for the insert — which is safe
  precisely because `disable trigger` takes an ACCESS EXCLUSIVE lock, so a real
  registration blocks rather than slipping through un-emailed.
- 🧹 **The Supabase CLI's `.temp` scratch directory is gitignored at last**,
  folded into a change that was going to build anyway rather than bought with a
  production build of its own. The gate was run to confirm that, not assumed.
- 🔔 **SOMEBODY WAITING TO BE APPROVED NOW BUZZES THE PEOPLE WHO CAN APPROVE
  THEM** — the fourth notification category, `db/migrations/20260819_approval_push.sql`.
  ⚠️ **THE AUDIENCE IS THE EMAIL'S, DELIBERATELY**: super admins, plus that
  squad's head coach and team manager(s) — not `can_approve_team`, which is
  wider. Authority is one question and being TOLD is another; everyone who
  could approve before still can, they are simply not all interrupted.
  ⚠️ **THE RULE IS NOW WRITTEN TWICE** — TypeScript for the email, SQL for the
  push — and the migration header says so rather than hiding it. Folding the
  email onto the SQL function is the right long-term shape and was NOT done,
  because it means editing the live email path in order to ship a notification.
  ✅ **The self-test measures what the narrowing is worth: widening the audience
  to everybody who may approve produces 54 (squad, person) violations**, each
  one a child's name on the lock screen of somebody the club decided should not
  receive it. `db/tests/approval-push.sql`.
  ✅ **And a new test closes the silent boundary**: `tests/notification-categories.test.js`
  fails if the app offers a category no migration's CHECK constraint states.
  Without it the opt-out INSERT is refused, the switch still moves, and the
  notifications keep arriving — with nothing on screen to say so.
- ✅ **`squad_push` IS NO LONGER UNPROVEN.** The 19 Aug handoff's one open item
  is closed: a real fixture change drove the whole path on production —
  statement trigger → `send_fixture_push` → `net.http_post` → deployed
  `push-send` v5 → `squad_push_subscriptions` → FCM, `200 ok` on two devices,
  no per-subscription failure logged, and the fixture put straight back.
  ⚠️ **THE TEST THE HANDOFF PROPOSED COULD NOT HAVE PROVED IT, AND WOULD HAVE
  LOOKED LIKE A BUG.** `squad_push_subscriptions` excludes the actor and
  `notify_fixture_changed` passes `auth.uid()` — so a change made in the app by
  the only subscriber resolves an audience of ZERO and returns a clean 200 with
  nothing sent. It had to be driven over SQL, where `auth.uid()` is null.
  ⚠️ **`content` DISCRIMINATES AND IS THE ONLY THING THAT DOES**: `push-send`
  answers `ok (no subscriptions)` for an empty audience and bare `ok` only
  after the send loop has run. A 200 alone proves nothing.
- `9adfa44` — the squash that shipped the 19 Aug session record.

- 📓 **THE 19 Aug SESSION RECORD**, `claude/handoffs/2026-08-19-notifications-v2.md`
  — nine merges, and the day push notifications went from "proved on one phone"
  to a feature with four categories, opt-outs and two prompts.
  ⚠️ **It records the ONE thing still unproven**: a `squad_push` payload has
  never reached the deployed `push-send`. Fixtures are verified only up to the
  pg_net queue inside a rolled-back transaction, which means the function never
  actually ran. ⚠️ **A live test is unusually safe RIGHT NOW and will not stay
  that way** — the only subscriber is attached to no squad, so a real fixture
  change sends zero notifications while exercising the whole path in the logs.
  ✅ **And the process change worth more than any feature**: the Supabase CLI is
  authenticated on cafnet and Claude's shell can use it, so edge-function
  deploys are no longer Jay's job. ⚠️ The login itself could not be automated
  and probably never can — the CLI refuses its device flow in a non-TTY and
  demands a token, which is the one thing Claude must not handle.
- `ce82097` — the squash that shipped fixture notifications.

- 🗓️ **A FIXTURE ADDED, MOVED OR CANCELLED NOW NOTIFIES THE SQUAD — AND THE
  DESIGN IS ALMOST ENTIRELY ABOUT WHAT IT DOES *NOT* SEND.**
  ⚠️ **THE RULE: ONLY A STATEMENT THAT TOUCHES EXACTLY ONE FIXTURE EVER
  NOTIFIES.** Enforced by the mechanism — every trigger is STATEMENT-level with
  a transition table and returns early unless that table holds one row — not by
  a heuristic somebody can reason their way past.
  ⚠️ **MEASURED BEFORE IT WAS DESIGNED: 50 of 63 events were created as part of
  a repeating series, the biggest series was 18, and 18 rows landed inside one
  minute.** A row-level trigger would have sent **eighteen notifications to
  every family in that squad** the first time somebody set up a term of
  training. **That is not a tuning problem, it is the feature failing** —
  people do not turn off "too many notifications", they turn off notifications,
  and one burst costs the club every future fixture alert permanently.
  ⛔ **A series insert and a bulk delete are both SILENT** (Jay's calls). A term
  of training appearing is planning; `deleteSeriesFrom` clearing one is the
  same act in reverse.
  ⚠️ **AND ENTERING A SCORE MUST NEVER NOTIFY.** `events` carries `result_us`,
  `tries_us` and eight more like them, so recording a result is an UPDATE on
  the fixture row — a change trigger watching the whole row would buzz the
  squad every Saturday afternoon. The trigger names only the parent-facing
  fields, so **adding a column to that table does not silently add it to the
  notification.**
  ✅ **Every "must be silent" assertion is paired with a "must send" on the same
  mechanism** — otherwise a broken trigger, or a missing vault secret, would
  satisfy all of them perfectly. `db/tests/fixture-push.sql`; its self-test
  removes the one-row rule and catches the 3-notification burst.
  ✅ **The audience REUSES `private.notice_audience`** rather than restating it:
  a fixture and a squad notice ask the same question, and a second copy would
  be a second thing to keep in step with `can_see_team`.
  ⚠️ **A CANCELLED FIXTURE NO LONGER EXISTS when push-send runs**, which is why
  the trigger builds the notification text and the edge function only resolves
  the audience and encrypts.
  `db/migrations/20260819_fixture_push.sql`.
- `41eb0bc` — the squash that put the notifications offer on the sign-in gate.

- 🚪 **THE SIGN-IN GATE NOW OFFERS NOTIFICATIONS AS ITS LAST STEP** — the other
  half of the prompting, and the half deferred earlier in the day because of
  where it had to go.
  ⚠️ **`NamePrompt` IS `dismissible={false}`: A STEP WHOSE BUTTONS DO NOT CLOSE
  IT LOCKS THE CLUB OUT OF THE APP.** Both controls call `setStep(null)`, and
  that is asserted against an injected fault — removing the close from "Not
  now" fails exactly that one test.
  ✅ **ONE DECISION POINT, REPLACING FIVE.** Five terminal branches called
  `setStep(null)` directly. They now call `finish()`, the only place that
  decides. Threading a new step through five exits would have been five chances
  to leave an undismissable modal open.
  ⚠️ **EVERY FAILURE PATH LEAVES THE GATE CLOSING.** Eligibility is resolved
  asynchronously and early so `finish()` stays synchronous — a rejected
  `isSubscribed()`, an unreadable localStorage, or a check that never resolves
  all leave it false. **Missing the offer costs one prompt; a gate that never
  closes costs the club the app.** Asked once per device, and the flag is
  written when the step is SHOWN rather than answered.
  ⚠️ **THE 51 EXISTING GATE TESTS DID NOT CATCH AN EXTRA STEP, AND THAT IS
  WORTH KNOWING.** Injecting "always offer" left every one of them green: they
  assert that a PARTICULAR step went away, not that the gate CLOSED. The new
  lock-out test is the only thing in the whole suite that would notice a gate
  which never closes.
  ⚠️ **It does not ask the browser for permission**, and must never be changed
  to — this is the sign-in path, and Chrome demotes sites whose prompt gets
  dismissed, for everybody, permanently.
- `7445d44` — the squash that corrected the PowerShell ExecutionPolicy entry.

- 🧭 **`CLAUDE.md` SAID POWERSHELL RUNS AT `Bypass`. IT NEVER HAS — AND THE
  11 Aug "CORRECTION" TURNED A TRUE STATEMENT FALSE.** Measured on cafnet
  19 Aug 2026: `LocalMachine` is **`RemoteSigned`**, and `Process` is `Bypass`
  **only because Claude's own tooling sets it, for itself**. Jay's terminal
  inherits `LocalMachine` and refuses the unsigned `npx.ps1` wrapper.
  ⚠️ **THE ORIGINAL NOTE WAS RIGHT.** It said "blocked, run npm from `cmd`".
  The 11 Aug pass overwrote that with "it **works**, and `ExecutionPolicy` is
  `Bypass`" — measured inside a Claude-spawned process, which was answering a
  different question. Both the row and that bullet are withdrawn.
  ⚠️ **AND CLAUDE CANNOT DETECT THIS FROM ITS OWN SIDE, EVER.** The Bash tool
  is Git Bash, so it calls `npx.cmd` and never touches the `.ps1` wrapper:
  **every command Claude runs succeeds while the identical command fails for
  Jay.** Found only because he pasted the actual error — "read the RESPONSE,
  not the screenshot", earning its place again.
  ⚠️ **The jay-pc cell is WITHDRAWN, not copied across.** The same mechanism
  almost certainly applies, and asserting it would be the exact rule-8
  violation this entry is about.
  ✅ **The rule gains a clause: measure a machine fact in the SHELL, and as the
  USER, that the instruction will actually be run in.** Cost twenty minutes of
  a `supabase login` that could not work.
- `ea9fa29` — the squash that shipped the notifications card on Home.

- 🔔 **A CARD ON HOME TELLING PEOPLE NOTIFICATIONS EXIST — because on the day
  notices learned to notify, there was 1 subscriber out of 31 active
  members.** Everything built that day reached one person. A feature nobody
  knows about is not shipped.
  ⚠️ **IT MUST NEVER CALL `requestPermission()` ITSELF, AND A TEST HOLDS THAT.**
  Chrome tracks how often a site's permission prompt is dismissed and silently
  demotes poor performers to a quiet prompt most people never see — one badly
  placed prompt costs the club the feature permanently, for everyone, and
  asking more politely later does not undo it. The card explains and links to
  the toggle; the person taps there, deliberately.
  ⚠️ **IT RENDERS NOTHING FAR MORE OFTEN THAN IT RENDERS SOMETHING** — silent
  for anybody already subscribed, anybody who refused, any browser that cannot
  do it, and anybody who dismissed it. **That property is the whole argument
  for its placement** above the fixture hero, and it is the same argument
  NoticeBoard already rests on.
  ⚠️ **THE iPHONE CASE IS CHECKED FIRST, AND FAULT-INJECTION PROVED IT.**
  `push.js` reports "unsupported" for a non-installed iPhone, so checking
  support first would tell the ONE group who most need telling precisely
  nothing — which is the exact bug `PushNotificationsToggle` shipped with on
  18 Aug. Reordering the two checks fails exactly that one test.
  ⚠️ **Dismissal is per DEVICE (localStorage), not per person**, because a push
  subscription is per device and per browser: dismissing it on a laptop says
  nothing about the phone somebody would actually want notified.
  ⏳ **THE OTHER HALF OF THE PROMPTING IS NOT BUILT**, deliberately. The
  onboarding prompt belongs in `NamePrompt`, which is the SIGN-IN GATE — a
  modal sheet with an ordered state machine and six exit points, where a
  mistake locks the club out of the app rather than degrading a feature. Left
  for fresh context rather than attempted at the end of a long session.
- `24eb548` — the squash that shipped notice notifications and opt-outs.

- 📣 **A NOTICE NOW SENDS A PUSH NOTIFICATION — AND THE AUDIENCE IS THE WHOLE
  DESIGN.** Jay, 19 Aug 2026: "do the notices notifications next."
  ⚠️ **THE INVARIANT: NEVER NOTIFY ANYBODY WHO COULD NOT READ THE NOTICE.** A
  notification puts the notice's TITLE on a locked screen. Failing to send one
  is a product problem; sending one to the wrong person is a disclosure, and
  it cannot be taken back. The two are not symmetrical and the migration is
  written around that.
  ⚠️ **THE AUDIENCE IS DELIBERATELY NARROWER THAN WHO MAY READ.**
  `announcement read` lets ANY club admin see EVERY squad's notices, so
  sending on that basis is safe but miserable — measured, 126 (squad, member)
  pairs against 51, meaning **5 people buzzed for every notice any coach posts
  for any squad.** Jay chose squad-only. ⚠️ **That makes two rules where there
  was one, and the second can drift**; `db/tests/notice-push.sql` asserts the
  SUBSET against live data — everyone notified must be somebody `can_see_team`
  admits. **0 violations**, and the self-test (widen the audience to the whole
  club, as somebody "simplifying" would) reports **359**.
  ⛔ **The author is not notified of their own notice**, an expired notice
  sends nothing, and an EDIT does not re-notify — INSERT only, because
  `announcement edit` exists so people fix typos.
  ⚠️ **A TRAP THAT MADE THE FIRST VERIFICATION LIE.**
  `private.touch_announcement` pins `author_id`, `club_id`, `team_id` and
  `created_at` back to their OLD values on every UPDATE — a deliberate
  immutability guard. So the first test of "the author is not notified"
  changed the author by UPDATE, changed nothing at all, and **reported the
  exclusion broken when it was the test that was broken.** The harness now
  inserts twice.
  ✅ **ONE EDGE FUNCTION, NOT TWO.** `push-send` now serves `{feedback_id}` and
  `{announcement_id}`. A second function would have meant a SECOND COPY of
  hand-rolled ECDH/HKDF/AES-128-GCM/ECDSA — the last thing here that should
  exist twice. Only the title, body, url and audience differ.
  ✅ **AND THE AUDIENCE LIVES IN THE DATABASE**, not in TypeScript:
  `public.notice_push_subscriptions` is one SECURITY DEFINER call granted to
  `service_role` alone. Splitting a disclosure rule across two deploy targets
  is exactly how the deep-link bug survived this morning.
- 🔕 **PER-CATEGORY OPT-OUTS, AND CATEGORIES REALLY DO DEFAULT TO ON.**
  `notification_opt_outs` stores opt-OUTS: **a row means off, no row means
  on.** No backfill for anybody who exists, or who joins next season, and the
  default lives in ONE place rather than a column default AND a constant AND a
  backfill script. ⚠️ **The argument against is recorded too** — "who wants
  notice alerts" is now an absence to query rather than a row — and the answer
  is: revisit only if an admin screen must SHOW everyone's preferences.
  ⚠️ **The checkboxes are hidden until notifications are actually ON**, because
  choices above an off master switch silently do nothing; proved by injecting
  exactly that fault, which fails exactly that one test.
  ✅ **The new table arrived WITHOUT TRUNCATE and nobody wrote a revoke** — the
  first table created since this morning's default-privilege change, and
  therefore the proof it works on a real new table.
  `db/migrations/20260819_notice_push.sql`, `db/tests/notice-push.sql`.
- `93374cc` — the squash that shipped hide-resolved and admin delete.

- 🗑️ **HELP TICKETS: RESOLVED ONES ARE HIDDEN, AND AN ADMIN CAN DELETE.** Jay,
  19 Aug 2026, asked for both — and they answer the same complaint in opposite
  ways, which is the whole design. **Hiding is the one that had to be good.**
  If a readable screen could only be had by destroying rows, people would
  destroy rows; so `done` and `wontfix` drop out of the list by default, with
  a toggle that says how many are hidden and only appears when something is.
  ⚠️ **`public.feedback` HAD NO DELETE POLICY AT ALL** — measured, three
  policies existed (INSERT/SELECT/UPDATE) and none for DELETE, so RLS denied
  every delete by default. `src/data/feedback.js` had no delete function
  either. **Two independent layers of absence**, which is why it presented as
  a missing feature rather than an error.
  ⛔ **THE REPORTER CANNOT DELETE THEIR OWN, DELIBERATELY** — and that is
  narrower than `social_ideas`, where a submitter may withdraw one still
  marked `new`. A withdrawn suggestion costs nothing; a withdrawn REPORT
  removes the club's record of a problem that may still be real.
  ⚠️ **DELETING LEAVES NOTHING BEHIND.** No audit row, and `feedback read`
  admits `submitted_by = auth.uid()` — so it disappears from under the member
  who wrote it, silently. The confirm names that consequence and points at
  Done instead, because "I want a tidy list" must not be the reason.
  ✅ **Verified against production before applying**, in a rolled-back
  transaction: admin delete BEFORE the policy = 0 rows; the author can SEE
  their report and still gets 0; the admin then deletes **that same row** = 1.
  ⚠️ **That pairing is the point — a delete matching no rows and a delete being
  REFUSED are the same observation.** Both return 0, neither raises. So every
  "cannot delete" assertion in `db/tests/feedback-delete.sql` carries a
  visibility count beside it, or it would pass for free.
  ✅ **Both new UI behaviours proved against injected faults, separately.**
  Disabling the hiding filter fails exactly the three hiding tests; making
  Delete fire on the first press fails exactly the four delete tests.
  ⚠️ **The first attempt did NOT discriminate** — with hiding disabled, the
  delete tests also went red, because two rows meant two "Delete" buttons and
  the query was ambiguous. Tests that fail for the wrong reason prove nothing,
  so the delete tests now render a single row.
  ✅ **`db/schema/policies.sql` now records `public.feedback` at all.** The
  table shipped 18 Aug and **its policies were never captured** — a whole
  table's access rules invisible to a reconciliation, which is the exact
  failure that directory exists to catch. All four are in, dated.
  `db/migrations/20260819_feedback_delete.sql`.
- `60c2cdc` — the squash that recorded the deep-link verification.

- 🎯 **TAPPING A NOTIFICATION NOW TAKES YOU TO THE THING IT IS ABOUT — and the
  bug was two bugs, either of which alone made the fix useless.** Found by Jay
  within minutes of the club's first ever real push notification: he tapped it
  and landed on More → Notifications, the screen he already had open.
  ⚠️ **`public/push-sw.js` focused the open window WITHOUT NAVIGATING IT**, so
  the payload's `url` was read only on the `openWindow` branch — the one that
  runs when nothing is open. ⚠️ **And `push-send` sent `${APP_URL}/` anyway**,
  the app root, which its own comment recorded as a deliberate v1 shortcut.
  ⚠️ **THE HAND TEST CANNOT SEE THIS, WHICH IS WHY IT SHIPPED.** You turn
  notifications on from More → Notifications, so that is the screen you are
  sitting on when the first one arrives, and "focus the open window" looks
  exactly like success.
  ✅ **`tests/push-sw.test.js` is new and is the thing that could see it.**
  That file had NO tests at all; written first, it failed on precisely the
  missing `client.navigate()` call and passed after the fix — with three other
  assertions passing throughout, so the harness was never vacuous.
  ⚠️ **`navigate()` REJECTS ON A WINDOW THE WORKER DOES NOT CONTROL**, a real
  state on a first load, so it falls back to posting the app a message that
  `src/lib/notificationRouting.js` routes on. **That order is deliberate**:
  always-postMessage reads nicer and is worse, because someone on a stale
  cached bundle would tap and silently go nowhere.
  ✅ **New `/my-reports` screen**, because the notification needed somewhere to
  land — a member's reports previously lived only in the `?` sheet, which has
  no URL. The list is now one shared component, not a second copy that would
  drift where nobody can see both at once.
  ✅ **DEPLOYED — BOTH HALVES — AND PROVED ON A REAL PHONE THE SAME DAY.** Three
  real notifications to a Samsung S25 Ultra over 4G: app **fully closed** →
  tapped → opened on `/my-reports`; app **open on Home** → tapped → jumped
  straight to `/my-reports`, which is the path that was broken. Each confirmed
  in the Supabase logs as report read → subscription found → VAPID key fetched
  → 200, with no `DELETE`, so the endpoint was accepted every time.
  ⚠️ **`push-send` DOES NOT DEPLOY WITH NETLIFY** and was deployed separately.
  ✅ **Deployed WITHOUT hand-copying 19KB of crypto**: the dashboard's Monaco
  editor was pointed at the raw file on `main` and `matchesSource: true` checked
  before the deploy, so what is live is byte-identical to the repo. ⚠️ And
  `verify_jwt: false` was confirmed intact afterwards — turning it on would
  break the trigger SILENTLY, which looks exactly like "nobody is subscribed".
  `claude/plans/2026-08-19-notifications-v2.md`.
- ✅ **AND THAT CLOSED THE 18 Aug OPEN ITEM — A REAL BROWSER HAS NOW DECRYPTED
  AND DISPLAYED A PUSH NOTIFICATION.** The handoff recorded push as built,
  deployed and unproven: the crypto was verified two ways server-side and
  neither showed interop with a real push service. Notification #2 arrived on a
  real Samsung carrying the exact string written into `admin_note`, so the
  hand-rolled ECDH → HKDF → AES-128-GCM payload really was decrypted by Chrome
  and the ECDSA VAPID signature really was accepted by Google.
  ⚠️ **THE TELL IN THE LOGS IS `get_push_vapid_private_key`.** With nobody
  subscribed, `push-send` returns before touching the key — which is exactly
  what the morning's logs showed, and is how "no subscriptions" is told apart
  from "the crypto failed". They are otherwise identical: a 200 and no
  notification.
- ⚠️ **A Chrome notification that is NOT ours and WILL be reported as a bug.**
  An installed PWA running standalone makes Chrome post its own persistent
  *"Tap to copy the URL for this app"*. We do not send it and cannot remove it —
  it is how Chrome offers the URL to an app with no address bar. Ours carries
  the club crest and `adhquins-clubhub.com`; Chrome's carries the Chrome logo.
  Silenced per-phone by long-pressing it, without affecting Quins notifications.
  ✅ It is also proof the Home Screen install worked, since it appears only for
  a standalone launch.
- 📋 **A spec for the rest of it**, and the correction it turns on: **"push
  notifications on by default" is not implementable.** The permission belongs
  to the browser, is per DEVICE and per BROWSER rather than per person, and
  prompting on page load makes Chrome demote the site to a quiet prompt nobody
  sees. What is achievable is the same thing minus the word "default":
  prominent prompting, and CATEGORIES that default to on so the only decision
  anyone makes is the one unavoidable tap.
  ⚠️ **`public.feedback` HAS NO DELETE POLICY**, measured — three policies
  exist and none is DELETE, so "I still cannot delete help tickets" is not a
  broken button, it was never built at any layer.
- `4e6652a` — the squash that revoked TRUNCATE from `authenticated`.
- `28b0cb2` — the squash that shipped the notification deep-link fix.

- 🧨 **`authenticated` CAN NO LONGER TRUNCATE ANY TABLE IN `public` — 31 OF 34
  TABLES, AND THE ONE PRIVILEGE RLS CANNOT FILTER.** Postgres never applies row
  security to TRUNCATE: not "the policies allowed it", the mechanism does not
  exist. So every signed-in member held the ability to empty any table outright
  while all 60-odd policies looked on. Source is Supabase's own
  `alter default privileges … grant all on tables`, where `ALL` is eight
  privileges on Postgres 17 and TRUNCATE is one of them.
  ⚠️ **NOT REACHABLE THROUGH THE APP, AND THAT IS WHY IT SAT IN "Cheap".**
  PostgREST exposes no TRUNCATE verb, so it needs a direct Postgres connection
  carrying a stolen `authenticated` JWT. **"Not reachable through the API we
  happen to use" is not a property to rest on** — a sentence lifted from
  `20260817_membership_audit.sql`, which reached this conclusion for one table.
  ✅ **The capability was DEMONSTRATED, not inferred from a catalogue row**: a
  throwaway table created down our own migration path, then
  `set local role authenticated; truncate` — it really emptied, inside a
  transaction that rolled back. A throwaway rather than `players` on purpose:
  truncating the real roster would have proved the same thing while taking an
  ACCESS EXCLUSIVE lock on a live club mid-onboarding.
  ✅ **This migration was asked for IN WRITING by `db/schema/grants.sql`**, twice,
  on 14 Aug: "if it is ever tidied, tidy it schema-wide in its own migration."
  Both notes are updated in the same commit so the capture stops asking.
  ⚠️ **THE SHARPEST FINDING IS A TRAP, AND IT IS NOT ABOUT TRUNCATE: A REVOKE
  ISSUED BY SOMEONE WHO IS NOT THE GRANTOR SUCCEEDS AND DOES NOTHING.** No
  error, no warning in the result, privilege still there afterwards. Found
  because `authenticated` also holds TRUNCATE on `storage.objects` — the row
  behind every player photo — and on the two `pg_net` queue tables. `revoke
  truncate on storage.objects from authenticated` ran clean and changed
  nothing; the grantor is `supabase_storage_admin`, not us. **A migration
  listing those tables would have applied cleanly, reviewed as correct, and
  been a lie.** They are named in the migration and asserted nowhere.
  ⚠️ **The `supabase_admin` default-privilege entry for `public` is the same
  limitation**, so a table created down that path still arrives truncatable —
  which is why the harness walks every table instead of trusting the default.
  ✅ **APPLIED TO PRODUCTION the same day** as
  `revoke_truncate_from_authenticated`, and measured after rather than assumed:
  TRUNCATE on **0 of 34** tables, while SELECT 33 / INSERT 31 / UPDATE 25 /
  DELETE 31 are **unchanged against their pre-change counts** and `service_role`
  keeps all 34. Smoke-tested as a real signed-in member too — 30 of 30 players
  and 63 of 63 events still visible, a real availability UPDATE still
  succeeding, `truncate` refused on both tables. ⚠️ **The UPDATE is what makes
  the refusal evidence**: same role, same transaction, so the refusal is the
  privilege removed and not a blanket loss of access.
  `db/migrations/20260819_revoke_truncate_from_authenticated.sql`,
  `db/tests/truncate-grants.sql`.
- `23bfe09` — 📓 the squash that recorded the 18 Aug session and cited the push
  notifications SHA. Cited here because a commit cannot cite its own, and the
  one-behind allowance falls to whoever branches next.

## 18 Aug 2026

- 🔔 **REAL BROWSER PUSH NOTIFICATIONS — FIRST TRIGGER: A REPLY TO YOUR OWN
  REPORT.** Jay asked for push notifications directly, then corrected the
  framing: "I don't want more emails, I just want app push notifications."
  Genuine Web Push (RFC 8291 + RFC 8292 VAPID), not an email under a
  different name — closes a gap Jay created on purpose the same day, ruling
  replies "in app only" with no second email.
  ⚠️ **NO THIRD-PARTY PUSH LIBRARY OR VENDOR.** Every crypto primitive
  (ECDH, HKDF, AES-128-GCM, ECDSA) is hand-rolled against Deno's
  `crypto.subtle`, matching `send-email`'s precedent for exactly this
  reasoning: "an unaudited import in the one place that decides whether to
  trust a caller is a poor trade." No OneSignal, no Firebase — the whole
  notification system stays Supabase + Resend.
  ✅ **Verified twice before being trusted**: a Node-side encrypt/decrypt
  round trip before the edge function was written, then a LIVE smoke test
  against the deployed function — a disposable club/report/subscription, a
  real throwaway P-256 key pair, a real trigger fire, a real VAPID JWT, a
  real HTTP POST to a public 410-always endpoint, and confirmation the dead
  subscription deleted itself. The fixture was removed afterward.
  ⚠️ **NEITHER PROVES A REAL BROWSER CAN DECRYPT AND SHOW ONE.** That needs
  an actual person subscribing from an installed PWA — the one thing this
  session could not test itself.
  ⚠️ **THE VAPID PRIVATE KEY LIVES IN VAULT, NOT A SECOND SECRET STORE.**
  `public.get_push_vapid_private_key()`, `SECURITY DEFINER`, granted to
  `service_role` alone — this session had no tooling to set a new Edge
  Function secret, and Vault is already where this project's secrets live.
  ⚠️ **THE IPHONE LIMITATION IS IN THE UI, NOT JUST THIS PARAGRAPH.** Push
  only works on iOS from an installed PWA (16.4+) — a parent with the site
  open as an ordinary Safari tab sees the exact reason why, not a toggle that
  silently does nothing.
  ✅ **A real bug caught by its own tests before shipping**: the Home Screen
  message was nested inside an "unsupported" check that made it
  unreachable — the one device it exists for is exactly the one whose
  feature detection cannot be trusted. Fixed to check independently, first.
  `claude/plans/2026-08-18-push-notifications.md` carries the full account.
- `0acb302` — the squash that shipped push notifications.
  ✅ **Deploy confirmed by reading the deployed bytes, not the build log**:
  `/push-sw.js` serves as `application/javascript` with both listeners,
  `/sw.js` contains `importScripts("push-sw.js")`, and it is in the precache
  manifest. ⚠️ **Before the deploy landed, `/push-sw.js` answered 200 with the
  app's HTML** — the SPA catch-all, the same shape
  `claude/runbooks/monitoring.md` records for `/calendar.ics`. A 200 on that
  path is not evidence the file is there; check the content type.
- 🔓 **`register_my_player` NO LONGER CARRIES AN `anon` EXECUTE GRANT — AND A
  SECOND FILE HAD CALLED THAT GRANT DELIBERATE FOR FIVE DAYS.** Not a hole: the
  function's first line refuses a null `auth.uid()`, and only a genuinely
  anonymous PostgREST call ever executes as `anon` — a signed-in session always
  runs as `authenticated`, whatever the grant said. So revoking it changed
  nothing a real caller could do; it only stopped an anonymous caller reaching
  a line inside the function before being refused.
  ⚠️ **`claude/open-items.md` found this 16 Aug and correctly called it "looks
  deliberate when it is not"** — three comparable RPCs carry an explicit
  `revoke … from anon`, this one didn't, and the difference read as a decision.
  It sat unfixed because tidying a live registration path felt like the wrong
  moment mid-onboarding.
  ⚠️ **`db/tests/grants.sql` §3b, written THREE DAYS EARLIER, had reached the
  opposite conclusion on the SAME EVIDENCE** — it named this grant "DELIBERATE
  AND MUST NOT BE TIDIED", citing the two migrations that re-granted it
  explicitly. Reading those migrations settles it: both are a DROP/CREATE
  side-effect (dropping a function's old signature does not carry its ACLs to
  the new one), and each says so in its own comment — restating a grant to
  avoid a repeat of an 8 Aug outage, not choosing to keep it. **An explicit
  grant in a migration is evidence someone typed it, not evidence someone
  decided it** — the exact distinction one part of this repo's own
  documentation had right and another part had wrong, about the same function,
  for five days.
  ✅ **Measured after the revoke, in a rolled-back transaction: a real
  signed-in call with a bad team id still reaches past the auth/email guards
  and fails on `22023 "That age group does not exist"`**, identical to before.
  `calendar_events_for_token` keeps its `anon` grant, untouched — it is called
  by an edge function with no session on behalf of Google/Apple's calendar
  clients, which is a genuinely different case and still refused by the same
  harness if anyone tries to tidy it away.
- `3bc4d10` — the squash that closed the anon-grant contradiction.
- 🧪 **`npm run db:check` RUNS AGAIN — one harness could not fail, so none of
  them ran.** `db/tests/head-coach-flag.sql` printed its six answers under an
  `EXPECTED:` comment and left a human to compare them. `scripts/db-check.mjs`
  throws on a SQL error and nothing else, so a wrong answer read as `ok` — and
  because the runner validates every file BEFORE it connects and refuses the
  whole run if one is unsafe, that single omission made every OTHER harness
  unreachable, including the two added earlier today.
  ⚠️ **NOTHING WENT RED, AND THAT IS THE PART TO REMEMBER.** The nightly
  workflow is inert without a `SUPABASE_DB_URL` secret, so it reports "did not
  run" and passes. A gate nobody can trip is indistinguishable from a gate
  nobody has tripped.
  ✅ **The six answers are now judged by `raise exception`, and the sqlstates
  are part of the assertion** — `23505` is the unique index refusing a second
  head coach, `23514` is the CHECK refusing a non-coach. A change that swapped
  one guarantee for the other would leave both lines reading "refused".
  ✅ **Proved it can fail rather than assuming**: fed a table with one planted
  wrong answer, the verdict block raised and named it. The fault-injection half
  gained a control too — dropping the index must flip assertion 3 and leave
  assertion 4 alone, or the injected fault was wider than the one named.
  ⚠️ **The nightly is still inert.** Fixing the harness did not add the secret,
  so these run only when somebody runs them.
- `631fa32` — the squash that made `db:check` runnable again.
- 👨‍👩‍👧 **SAVING A CHILD'S PARENT LIST IS NOW ALL-OR-NOTHING.**
  `public.save_player_parents` does the delete, the updates and the inserts in
  one statement, replacing up to N+2 separate PostgREST requests that each
  landed on their own.
  ⚠️ **THE OPEN ITEM OVERSTATED THIS AND THE CORRECTION IS THE USEFUL PART.**
  It said a failure "loses a child's parent records". A plain edit was always
  safe — the DELETE only removed rows not in the submitted set, and every kept
  row carries an id. The damage needed a row to be REMOVED in the same sitting:
  the removal applied, the edits did not, and **the screen said the save had
  failed.** An overstated finding is one the next person disproves and then
  stops trusting the file.
  ✅ **Measured on production in a rolled-back transaction: replaying the old
  sequence left 1 of 2 rows.** Kept as the harness's self-test, because "the row
  count did not change" would pass against a table nothing ever touches.
  ⚠️ **`SECURITY INVOKER`, so the two existing policies still decide who may
  write** — no new authorisation surface, proved by a coach of another squad
  being refused. If it is ever made `SECURITY DEFINER` it needs a guard the same
  minute.
  ⚠️ **It never writes `created_at`, `invited_at` or `profile_id`.** The last two
  link a parent row to a real account, and no screen shows them beside the fields
  a coach edits — an UPDATE naming every column would un-invite a parent every
  time somebody fixed a typo in their phone number.
- `f3f108d` — the squash that made the parent save atomic.
- 🔐 **A PENDING ADMIN ROW IS NO LONGER AN ADMIN — and it was FOUR functions,
  not the one every note named.** The deferral the 17 Aug approval fix wrote
  down, taken: `private.is_admin` asked about role and club and never status,
  exactly as `can_approve_team` had. Asking the database which functions mention
  `memberships` without mentioning `status` turned up three more —
  `is_admin_anywhere`, `shares_admin_club`, `can_admin_see_pending`.
  ⚠️ **THE TWO NOBODY HAD NAMED WERE THE TWO THAT MATTERED.**
  `shares_admin_club` and `can_admin_see_pending` back `profiles`, so the
  omission let a pending admin row read every member's NAME and E-MAIL — the
  same thing the 17 Aug bug leaked, by another route. Fixing only `is_admin`
  would have closed the item and left that open.
  ✅ **Measured under RLS on production, in a rolled-back transaction with an
  invented club: a pending admin read 1 profile row of another member before
  and 0 after, with an active admin reading 1 throughout as the control.**
  ⚠️ **NOTHING CAN CREATE A PENDING ADMIN ROW TODAY**, which is why this was
  safe to defer and safe to apply — it is not a reason to have waited longer.
  The 17 Aug bug happened because a new writer made a pending STAFF row
  possible and the old readers were never audited.
  ⚠️ **`is_attached_to_team` and `is_own_player` are LEFT, deliberately** — they
  answer for parents and players, where a pending row is the ordinary
  registration state, so changing them would alter what live families see
  mid-registration under cover of a security fix.
  ⚠️ **The test fixtures could not have caught this**: `memberships.status` is
  NOT NULL, and not one membership fixture in `tests/` carried a status at all.
  They now do.
- `1e820f3` — the squash that closed the admin gates.
- 📡 **`availability` HAS BEEN SUBSCRIBING TO NOTHING SINCE IT WAS
  WRITTEN, AND IT IS NOW FIXED.** `src/data/availability.js` opens a
  `postgres_changes` channel, its own comment says it "subscribes to realtime
  changes", and `public.availability` was never in the `supabase_realtime`
  publication. The socket opens, the subscription succeeds, Postgres emits
  nothing. A coach watching who has declared In, while parents update on their
  phones, saw a frozen list with no way to know it was frozen.
  ⚠️ **THIS IS THE THIRD TIME.** `events` was dead the same way until 13 Aug
  ("two features silently did not work"), `announcements` until 16 Aug — and the
  announcements migration NAMED `subscribeAvailability` as the one still
  outstanding. It was written down and not acted on. **The check is the
  publication, not the client**, which cannot tell the difference.
  ✅ **Availability started working the moment the table was published — no
  deploy needed**, because the client half had been shipped all along.
  ✅ **The delete gap stays open on purpose, and that is a measurement.**
  `subscribeAvailability` filters on `event_id`, and a DELETE payload under
  replica identity DEFAULT carries only the primary key, so the filter could
  never match one. It cannot bite today: `setAvailability` is an upsert and
  **nothing deletes an availability row**. The day anything does, the filter
  must go or the table needs `replica identity full`.
- 📝 **`feedback` joins it**, and `FeedbackTriage` now subscribes — so a report
  lands on the admin screen without a refresh, which is what prompted all of
  this. It re-reads rather than patching from the payload: the payload carries
  no joined `profiles`, so applying it directly would blank the reporter's name
  on whichever row just changed.
- 📧 **The acknowledgement now tells people where to look.** Jay: replies are
  "in app only", so the ACK is the single place a reporter learns that updates
  appear behind the `?` under *See what you've already reported*.
- `32c7ce0` — the squash that published the two tables.
- `e6894bd` — the squash that closed the loop in the app.

- 🔁 **THE LOOP ACTUALLY CLOSES NOW: A MEMBER CAN SEE THEIR OWN REPORT, AND AN
  ADMIN CAN ANSWER IT.** Jay filed two test reports and found three things
  missing within a minute, all three real.
  ⚠️ **ONE WAS A LIE ON SCREEN.** The admin summary read *"Members see the
  status of their own."* They could not — there was no such view anywhere. The
  read policy had always allowed it and the plan called that arm "a requirement,
  not a courtesy … without it you report into silence"; it went into the
  database and never into the app. Line deleted, feature built.
  ✅ **"See what you've already reported"**, behind the same `?` — the member's
  own reports, their status, and any reply from the club.
  ✅ **A Reply box on each admin row**, writing `admin_note`, which existed and
  was column-granted and had no field.
  ⚠️ **IN-APP ONLY — Jay: "in app only".** Saving a reply sends nothing. So the
  acknowledgement e-mail is now **the only place a reporter is told where to
  look**, and it says so explicitly. Trim that paragraph and the club starts
  writing replies into a screen nobody has been told to open.
  ⚠️ **Saving a reply passes the row's CURRENT status back, not a literal** — a
  literal would silently reopen a finished report every time somebody typed into
  it. There is a test that fails if that changes.
- 📡 **AND A LIVE BUG FOUND WHILE ANSWERING "WHY DOESN'T IT UPDATE ON ITS OWN?"**
  ⚠️ **`availability` SUBSCRIBES TO REALTIME AND RECEIVES NOTHING.**
  `src/data/availability.js` opens a `postgres_changes` channel and its comment
  says it works. The table is **not in the `supabase_realtime` publication** —
  measured, with `announcements` as a control, so the negative means something.
  The channel opens, the subscription succeeds, no event ever arrives. That is
  the app's core feature failing silently on a touchline, and it matters more
  than the feature it was found beside. **Not fixed yet.**

- ❓ **THE `?` IS BUILT: ANY MEMBER CAN REPORT A PROBLEM OR SEND AN IDEA FROM
  ANY SCREEN.** `claude/plans/2026-08-18-help-and-feedback.md`.
  A 44px red circle floating bottom-right, opening a two-step panel — pick a
  lane, then one required field. Page, device, viewport, installed-or-not and
  build ref are captured automatically **and listed to the member in plain
  words before they send**.
  ⚠️ **BUILT, NOT YET APPLIED.** Neither migration has run and the function is
  not deployed, so on the live site Send fails — there is no table behind it.
  The apply checklist is at the bottom of the plan.
  ✅ **It costs no layout space, because the room was reserved for it before it
  existed** — `claude/specs/design-system.md` explains `main`'s 100px bottom
  padding as "clearance for fixed tab bar + FAB" and specifies a FAB nobody
  built. z-30, strictly under the tab bar's z-40: a floating control that
  covers navigation traps the person on the screen.
  ✅ **The screen is the record** — `src/components/FeedbackTriage.jsx` sits
  above the completeness list on `/admin/needs-attention`, counts only what is
  still open, and carries the status. `Reply-To` remains the reporter, as a
  convenience rather than as the design.
  ⚠️ **A NOT-YET-APPROVED MEMBER CANNOT FILE ANYTHING, AND THAT IS THE ONE
  PERSON MOST LIKELY TO WANT TO.** Both the insert policy and the stamping
  trigger require an ACTIVE membership. Widening either would let anybody who
  can reach the sign-up form write rows, so the answer is a route out: the form
  names `help@adhquins-clubhub.com` instead of showing a raw policy error, and
  the login screen — outside `AppShell`, so the `?` cannot reach it — carries a
  plain "Can't get in? Email us".
- 🧪 **AND TWO THINGS THE TESTS CAUGHT THAT READING DID NOT.**
  ⚠️ **A fixture that could not fail.** "One family member must not see
  another's half-typed report" asserted at the choice step, where the textarea
  is never rendered — so it passed with the state reset deliberately removed.
  Found by injecting exactly that fault; it now steps back into the form first.
  ⚠️ **A real bug.** The triage list reported a failed status change and then
  reloaded — and the reload clears the error on its way in, so the message
  vanished and the control silently snapped back, which is how somebody
  believes they closed a report they did not. Reload happens first now.
- 🧭 **THE EMAIL RUNBOOK SENDS YOU TO THE WRONG DNS PROVIDER, AND THE WRONG EDIT
  THERE FAILS SILENTLY.** `claude/runbooks/email-and-domain.md` step 3 said
  "publish the records in GoDaddy DNS (`ns43`/`ns44.domaincontrol.com`)".
  **GoDaddy is the registrar only.** Measured 18 Aug 2026:
  `adhquins-clubhub.com` NS → `dns1`–`dns4.p09.nsone.net`, which is NS1, which is
  **Netlify** DNS. ⚠️ **An edit in a zone that is not authoritative saves
  cleanly, looks right and changes nothing** — there is no error to notice.
  ⚠️ **AND THE RECORDS IT TELLS YOU NOT TO TOUCH ARE NOT WHAT IT SAYS EITHER.**
  It called the root `@` records "GoDaddy's registrar boilerplate
  (`include:spf.em.secureserver.net`)". They are **Microsoft 365's** —
  `MX → …mail.protection.outlook.com`, `v=spf1 include:spf.protection.outlook.com
  -all`, `MS=ms38515168`, `autodiscover` CNAME — because club mailboxes live
  there. Breaking those stops club mail arriving, which nobody notices.
- 📇 **AND A RUNBOOK NOBODY COULD FIND IS NOW IN THE TABLE.**
  `claude/runbooks/m365-add-alias-to-shared-mailbox.md` was never listed in
  `CLAUDE.md`, so a session setting up `help@adhquins-clubhub.com` on 18 Aug
  read every other mail doc and not that one. It holds two things that would
  have saved the afternoon: **open the M365 admin centre in Edge, not Chrome**
  (Chrome lands in GoDaddy's cut-down console, where Domains does not exist),
  and **it argues for an alias on the existing `noreply@` mailbox over a second
  shared mailbox** — because a second inbox is a second thing to remember to
  check, which is exactly how two test messages went unnoticed.
- `e26dcac` — the squash that put the `?` on the live site.
  ⚠️ **THIS CITATION IS OWED EVERY TIME, AND IT KEEPS BEING FORGOTTEN.** CI
  compares `BASELINE..HEAD~1`, and on a pull-request run `HEAD~1` is the **base
  tip** — so every branch cut from `main` must cite whatever `main` merged last,
  even though that commit is not the branch's own work. Three PRs in a row went
  red on exactly this. Cite the previous squash when you cut the branch, not
  after CI tells you.
- `52ec10c` — the squash of the DNS-runbook fix above.
- `1e3c7bc` — the squash of the help-and-feedback plan below.

- ❓ **A HELP AND FEEDBACK BUTTON IS DESIGNED, AND THE HANDOFF THAT ASKED FOR IT
  IS FOUR FACTS OUT OF DATE.** `claude/plans/2026-08-18-help-and-feedback.md`.
  A 44px red `?` floating over every signed-in screen — **costing no layout
  space, because `claude/specs/design-system.md` reserved 100px at the foot of
  `main` for a FAB that was specified and never built.** Two lanes behind it,
  one required field, page/device/version captured automatically, screenshot
  **off** by default because rosters show children.
  ⚠️ **REPORTS LIVE ON THE ADMIN SCREEN, NOT IN AN INBOX — AND THIS LINE SAID
  THE OPPOSITE FOR AN HOUR.** The first draft leaned on `Reply-To` to delete the
  admin screen, the status column and the read policy, on the grounds that a
  mail client is a serviceable triage tool. Jay: *"keep everything in one place
  instead of emails"*. He is right, and **this app already decided it once** —
  `supabase/functions/notify-approval/index.ts` says the screen is the source of
  truth and the e-mail is a prompt to go and look. An inbox is a bad database.
  Reports get a section on `src/screens/AdminNeedsAttention.jsx` with a status;
  `Reply-To` stays, but as a convenience rather than the design.
  ✅ **The reporter's name goes in the admin e-mail**, and the destination is
  `help@adhquins-clubhub.com` as a **shared mailbox** — no licence, and a second
  volunteer can be added later without a deploy.
  ⚠️ **MAIL FOR THIS DOMAIN IS ALREADY ON MICROSOFT 365, WHICH `CLAUDE.md` MAKES
  EASY TO MISS.** Measured: MX is
  `adhquinsclubhub-com02b.mail.protection.outlook.com`, tenant
  `quinsclubhub.onmicrosoft.com`. Sending is Resend
  (`supabase/functions/send-email/index.ts` is the authority), receiving is
  Microsoft. The rule "do not propose buying an M365 licence" is the 4 Aug
  defederation verdict and reads as "there is no M365 here". There is.
  ⚠️ **The source handoff must not be followed as written.** It says to reuse
  `src/components/IdeaForm.jsx`, which is the **Instagram post** form, consent
  copy and all; it says Sentry is off (live since 16 Aug); and its
  "non-negotiable" colours and fonts both describe the app as it was before the
  6 Aug retheme. All four corrected in the plan.
  ⚠️ **Nothing is built.** No component, no table, no function.
- 🩹 **AND THE STALE HALF OF THAT WAS IN THE CODE.** `src/lib/errorReporting.js`
  still said "Jay has not created the account yet" — a code review had already
  read it and recommended deleting a live dependency. The status of a running
  service does not belong in a source comment; `claude/runbooks/monitoring.md`
  owns it.
- 🔌 **THE FEEDBACK TABLE AND `notify-feedback` ARE LIVE ON PRODUCTION**, and
  the mail path needed **no secret from Jay** — which an earlier build of it got
  wrong. It invented `FEEDBACK_NOTIFY_SECRET`, meaning a credential to generate,
  paste in two places and record nowhere. But `notify-approval`,
  `notify-invite`, `notify-pitch-request` and the photo-backup cron **already
  share `approval_notify_secret` and the header `x-approval-secret`**, and Edge
  Function secrets are **project-wide** — the value was already there.
  `feedback_notify_url` is **derived** from `approval_notify_url` with
  `replace()`, the same trick `claude/runbooks/player-photo-backup.md` uses, so
  the host cannot drift and nobody reads or retypes a value.
  ✅ **Proved before it was trusted**: the rollback mechanism first (a throwaway
  `create table` in `begin`/`rollback`, checked gone **with a control** that the
  query can see a table which does exist), then the whole migration rehearsed
  the same way with its assertions inside the transaction.
  ✅ **The endpoint answers 403 to an unauthenticated POST, and that single
  number is the health check** — 401 would mean `verify_jwt` came back on and no
  mail can ever send silently; 503 would mean the shared secret is missing.
  ⚠️ **`authenticated` holds a table-level DELETE grant** (the Supabase
  default), so what stops a report being deleted is the deliberate ABSENCE of a
  delete policy, not the absence of a grant. Recorded in `db/schema/grants.sql`.
- `caddd7f` — the squash of the head-coach work below, which could not cite its
  own SHA.
- `14e0ce2` — 📧 **THE APPROVAL E-MAILS STOP GOING TO EVERYONE, AND "HEAD COACH" BECOMES DATA.**
  Jay: *"we don't need to email every single admin every time or all the
  coaches in an age group"*. Now super admins, the squad's head coach, and the
  team manager(s). ⚠️ **BUILT, NOT YET APPLIED** — the migration has not run on
  production and the functions are not deployed.
  ⚠️ **THE OBVIOUS IMPLEMENTATION WOULD HAVE FAILED SILENTLY.** There is no
  head-coach ROLE; it lived in `memberships.title`, which is **free text with
  zero check constraints** and already holds `Assistant Coach/Medic`. Matching
  `'%head coach%'` means a squad typed as `HC` matches nothing and an approval
  e-mail is never sent, which nobody would notice. So: `is_head_coach`, a flag
  mirroring `is_super`, **not** a seventh role — a head coach's permissions are
  a coach's exactly.
  ✅ **Measured before designing**: 5 admins of whom 3 are super; 15 squads, 5
  staffed, 4 with a Head Coach title, 4 with a manager. **Managers matched by
  ROLE, not title** — same squads today, and a role cannot break on a typo.
  ✅ **The recipient rule, proved against a fixture with a head coach AND an
  assistant**: old rule 6 recipients, new rule 4. The assistant and the
  non-super admin drop; both managers stay; the medic was never included.
  ⚠️ **ONE SQUAD REACHES SUPER ADMINS ONLY** — staffed, but no head coach and no
  manager, and no title to backfill from. Nothing is lost, but that squad is not
  told. Surfacing it on `/admin/needs-attention` is the follow-up.
  ⛔ **"Only e-mail after they confirm their address" was asked for, measured,
  and NOT built**: 0 of 34 users are unconfirmed, and both write paths need a
  session, so it would filter nothing and be a guard that cannot fire.
  ⛔ **THE DATABASE BRANCH FAILED AND `CLAUDE.md` WAS WRONG TO RECOMMEND ONE.**
  A branch came up with **0 tables** against production's 136 migrations —
  Supabase replays a `migrations` directory under `supabase/` that this repo
  does not have; ours live in `db/migrations/`.
  Deleted it; proved the migration with `db/tests/head-coach-flag.sql` in a
  rolled-back transaction instead, which is better here because a branch has no
  production data and could not verify the backfill.
  ✅ **Both new checks were proved able to FAIL.** The harness: a second head
  coach is `refused (23505)` and becomes `ALLOWED` with the index dropped. The
  screen: deleting the line that restores the checkbox after a refused save
  turns exactly one test red.
  ⚠️ **Two existing tests caught real mistakes** — `staff-roles` refused an
  inline `=== 'coach'` (now `canHoldHeadCoachFlag` in `src/lib/scope.js`), and
  `harness-stubs` caught the stub not mirroring the new export.

- `75bbe35` — 🧹 **TWO STALE DOC CLAIMS, ONE OF WHICH NEARLY GOT LIVE ERROR MONITORING DELETED.**
  `CLAUDE.md` said *"Sentry is built but off"* for five days after it went live
  on 16 Aug. A code review read that line and recommended stripping
  `@sentry/react` as dead weight — which would have removed error reporting from
  a production app real families use. ⚠️ **`claude/runbooks/monitoring.md` was
  RIGHT the whole time**; the summary in the file that outranks it was wrong, and
  a reviewer reasonably trusted the higher-precedence one. **Confirmed live from
  the DEPLOYED BUNDLE, not from a document** — Sentry/ingest markers present,
  against a control string known to be there so an empty grep could not read as
  absence.
  ⚠️ **THE SECOND ONE IS ANNOTATED, NOT CORRECTED.** `claude/open-items.md`
  recorded `/calendar.ics` answering **200 `text/calendar`** to a bogus token;
  re-run 18 Aug it answers **404 `text/plain`, body `Not found`**. The 14 Aug
  record stands and the change is noted beneath it.
  ✅ **It is NOT the failure that line exists to catch** — the dangerous case is
  the SPA catch-all answering 200 with the app's HTML, which the free uptime
  check cannot see. A plain-text 404 is the edge function refusing, so the proxy
  is still wired. ✅ **And not a regression from the 18 Aug releases**: the
  previous production deploy's permalink answers identically.
  ⚠️ **NOT VERIFIED: that a VALID token still returns 200.** That needs a real
  token, which is an unrevocable credential in a URL, and it was deliberately not
  used. The Better Stack monitor carries one; treat its silence as the evidence.

- `a880a61` — 🔌 **graft IS WIRED INTO CLAUDE CODE — HOOKS, STATUSLINE AND MCP.**
  `.mcp.json` runs `npx @nanonets/graft mcp`; `.claude/settings.json` adds a
  session-start hook, a post-edit refresh on `Write|Edit|MultiEdit`, a savings
  tally on `Bash|mcp__graft__`, and a statusline. Two shims in
  `.claude/helpers/` do the resolving.
  ⚠️ **THE SHIMS BAKE IN ONE MACHINE'S GLOBAL npm PATH AS A FAST-PATH**, which
  is the shape of machine fact `CLAUDE.md` rule 8 warns about. It is safe
  because it is a FIRST candidate, not the only one: each is `existsSync`-tested
  and falls through to package resolution and then `npm root -g`. **Verified the
  fallback target is real** rather than assumed — `npm root -g` resolves to a
  directory that actually contains `hooks.js`.
  ⚠️ **ON THE OTHER PC IT NEEDS graft INSTALLED GLOBALLY.** Without it the shims
  no-op silently rather than erroring — the right failure, but a silent one, so
  a statusline that never appears there is the symptom to expect.
  ⚠️ **`graft/` ITSELF IS STILL NOT COMMITTED AND MUST NOT BE.** The index is
  derived from the code; a graph built on one PC and read on another sitting on
  older code is a map that lies. Each machine runs its own `graft build --deep`.
  Read before committing on a PUBLIC repo: no secrets in any of the four files.

- `96580a8` — 🧹 **THE graft IGNORE RULE NEEDED BOTH HALVES, AND EITHER ONE ALONE IS A BUG THAT HAS SHIPPED.**
  `graft build` writes an **unanchored** `graft/` into `.gitignore`. Unanchored
  matches a directory of that name at ANY depth, so it silently hid
  **`.claude/skills/graft/SKILL.md`, the skill graft itself installs** —
  `git check-ignore -v` named `.gitignore:25:graft/` as the rule doing it.
  ⚠️ **THE OBVIOUS FIX — ANCHORING IT TO `/graft/` — IS ALSO WRONG, AND WAS
  CAUGHT ONLY BECAUSE JAY ASKED WHETHER UN-IGNORING WOULD CAUSE PROBLEMS.**
  Anchored, a graft index at any OTHER depth stops being ignored, and **every
  agent worktree builds one — 16 MB, 356 files, measured.** Proven with a
  control: a nested index (probed under `harness/`) is ignored by the unanchored
  form and **NOT ignored** by the anchored one, while the root `graft/` is
  ignored by both.
  What shipped is `graft/` **plus** `!.claude/skills/graft/`. Verified across
  eight paths: root and nested indexes ignored, `SKILL.md`, `README.md`,
  `settings.json` and `src/` all visible.
  ⚠️ **AND THE WORKTREES WERE PROTECTED ONLY BY `.git/info/exclude`, WHICH IS
  LOCAL AND NEVER COMMITTED.** So the protection existed on one machine and
  nowhere else; a fresh clone had none. `.claude/worktrees/` is now in
  `.gitignore`, where it travels. The eight-path check reports `.gitignore`
  line numbers rather than the local file, which is how it was confirmed.
  ✅ **THE SKILL IS COMMITTED, WHICH IS THE POINT OF UNHIDING IT.**
  `.claude/skills/graft/SKILL.md` travels so every session gets the same
  guidance instead of depending on which PC ran the installer. ⚠️ **`graft/`
  ITSELF STAYS IGNORED AND MUST** — it is derived from the code, so a graph
  committed on one PC and pulled onto another sitting on older code is stale
  and wrong, and a map that lies is worse than none. The SKILL describes
  graft's CLI, not this codebase, so it cannot rot that way; measured, `graft
  build` does not rewrite it.
  ✅ **`.ignore` IS TRACKED** — ripgrep reads it before `.gitignore`, so its
  `!graft/` is what keeps the cards greppable while `graft/` keeps them out of
  commits. ⚠️ **THE FIRST TWO ATTEMPTS TO PROVE THAT PROVED NOTHING**: rg also
  reads the PARENT clone's `.ignore`, so deleting only this one changed no
  result. With both gone a root-level `rg` found **0** cards; restoring this one
  alone brought them back.
  ⚠️ **A DOTFILE BUILDS, AND `.claude/` IS NOT `claude/`.**
  `scripts/netlify-ignore.mjs` skips `claude/`, `docs/`, `db/` and ROOT MARKDOWN
  only — `/^[^/]+\.md$/` matches neither `.gitignore` nor `.claude/skills/…`, so
  this deployed where the entry below did not, and every future skill edit will
  too. **The leading dot is the whole difference.** Measured with
  `isDeployIrrelevant()`, not assumed.

- `8d30114` — ⛔ **ROUTE-LEVEL CODE SPLITTING — BUILT, MEASURED, AND NOT TAKEN.** Jay's call.
  The saving was real and **larger** than the figure on file (283.51 → 244.08 kB
  gzip, −39.43, against the −27.26 recorded), but the argument that would have
  carried it turned out to be false: splitting does **not** make deploys cheaper
  for members. One rendered string changed in `Allocation.jsx` moved **every**
  chunk hash, because lazy chunks import shared code from the entry chunk, so a
  leaf change bumps the entry and the entry bump rewrites every sibling.
  ⚠️ **The measurement read false twice first** — a comment is stripped by the
  minifier and an unimported `const` is tree-shaken, so both rebuilt
  byte-identically and said "one edit changes nothing".
  Nothing was committed to `src/`.
  `claude/decisions/2026-08-18-no-route-level-code-splitting.md`, and the item in
  `claude/open-items.md` is struck through rather than removed.

## 17 Aug 2026

- `3120dc9` — ⚡ **EVERY MEMBER WAS DOWNLOADING 400 COUNTRY FLAGS BEFORE THE FIRST PAINT, AND
  AGAIN INTO THEIR PWA INSTALL.** One line in `vite.config.js`:
  `index.css` **475.15 → 84.31 kB (gzip 95.74 → 18.37)**, precache
  **1682.76 → 1301.08 KiB**, flags inlined **400 → 0**.
  ⚠️ **THE LIBRARY WAS INNOCENT AND THAT IS WHY IT SURVIVED SO LONG.**
  `flag-icons` is 2.36 kB gzip on its own — measure the package and you conclude
  the finding is wrong. The bulk came from Vite's `assetsInlineLimit`, which
  writes any asset under 4096 bytes into the stylesheet as a `data:` URI, and
  most national flags compress under that. **88.6% of the built CSS was `.fi-`
  rules.**
  ⚠️ **IT RESTORES WHAT `PhoneInput`'s HEADER ALREADY CLAIMED** — "the browser
  only fetches the handful actually painted" — for a picker that draws ONE flag,
  on two forms, in sessions most members never open.
  ⚠️ **AND THE `globIgnores` AIMED AT EXACTLY THIS MATCHES NOTHING.** Deleting all
  three patterns rebuilds an identical precache; what keeps flags out is
  vite-plugin-pwa's default `globPatterns`. It watched a door the flags never
  used while they walked in through the stylesheet. Kept, with the measurement
  written beside it.
  ✅ Guarded by three new assertions in `tests/pwa-build.test.js`, **proved by
  deleting the option and watching two of them go red**. ⚠️ One control fired
  during development and earned its place: the precache assertion found **zero**
  manifest entries and would have passed vacuously — that file's build inherits
  `VITEST`, so `vite.config.js` flips `NODE_ENV` to test and emits an
  UNMINIFIED worker with `"url":` rather than `url:`. **The build that file
  asserts on is not the build that ships.**
  ⚠️ **THE `React.lazy` HALF WAS MEASURED AND NOT TAKEN**: −27.26 kB gzip off
  first paint, but the precache does not move, because Workbox precaches the new
  chunks too. Splitting defers bytes; this removed them. Both in
  `claude/open-items.md`.

- 🧹 **A SECOND SOURCE OF TRUTH FOR "the match sheet starts at U11", DELETED.**
  `SHEET_FROM_AGE = 11` in `src/lib/matchSheetDeadline.js` was read by nothing —
  the rule is enforced by `isMinisBand()`, i.e. `MINIS_MAX_AGE = 10` in
  `src/lib/minis.js`. ⚠️ **THE RISK WAS NOT THE DUPLICATION BUT WHICH COPY A
  READER TRUSTS**: it sat beside three constants that ARE the rule they name, so
  moving `MINIS_MAX_AGE` would have left this file declaring 11 while behaving
  differently, with nothing to fail. `minis.js` already argues this exact point
  about its own three boundaries.
  ⚠️ **IT IS THE ONLY DEAD CODE THE SWEEP FOUND WORTH REMOVING**, out of 442
  exports scanned with both a positive and a negative control. The other
  candidates were checked and LEFT: `updateSW` looks unused but the expression
  registers the service worker and the export is the documented hook for a
  refresh banner; 36 more are error-message constants this repo deliberately
  exports so tests can assert by reference; 75 are exported for testability.
  **"Almost nothing is dead" is the finding, not a failed search.**

- 🧪 **RESPONSIVE SWEEP — 157 scenario/width pairs, zero overflow, all mounted.**
  33 harness scenarios at 320/375/768/1280, and the five sheet-free ones across
  nine widths to 1440. ⚠️ **THE DESKTOP HALF IS NEW** — `harness/check-overflow.mjs`
  stops at 414, and its own header says the portal chooser "has to be looked at in
  a real browser at desktop width". It now has been: the chooser renders the
  "needs a bigger screen" card at 375 and its real content at 1280, clean.
  ⚠️ **A `rendered` FLAG IS DOING REAL WORK HERE.** The first attempt loaded 32
  iframes at once, and 18 never mounted — every one reporting `overflow: 0`, i.e.
  a clean run from a blank page. The sweep also proves it can SEE an overflow
  before believing it cannot: injecting a 900px element moves the figure 0 → 580
  and names the element.
  ⚠️ **SHEETS REMAIN INVISIBLE TO THIS**, as `check-overflow.mjs` documents —
  `position:fixed` contents are not in `scrollWidth`. Unchanged, and not claimed.

- 🧹 **A SHIPPED PLAN THAT STILL SAID "not yet merged", AND A RULE IN IT THAT WOULD
  HAVE UNDONE THE FEATURE.** `claude/plans/2026-08-17-birthday-backfill-prompt.md`
  described work that went live as `f506a7f` (#218) hours earlier.
  ⚠️ **THE STATUS LINE WAS THE LEAST OF IT.** Its "What must not happen" section
  still read *"IT MUST STAY SKIPPABLE AND MUST NEVER BLOCK THE APP"* — the exact
  rule Jay overruled to get the hard gate — so the file instructed the next session
  to break the thing it documents. Both struck through with the reversal and the
  argument that beat them, rather than deleted; the sign-out inside the sheet is
  named as load-bearing, because it is the only reason a blocking step is not a
  lock-out. The "three questions … not built until these are answered" heading was
  answered before the work shipped and is now marked as such.
  ⚠️ **AND CHASING IT FOUND ONE THING STILL OWED IN CODE.** The plan said "fix the
  wording when this ships" about `AdminNeedsAttention`'s *"Each family is already
  being asked on their own screen"*. It shipped; the wording did not change, and it
  is still live. **The correction is no longer the one that line intended** —
  `missingForPlayer` reports dob, parent phone and gender, and the gate closed only
  the first, so the sentence went from uniformly misleading to true for one gap and
  false for two. **Recorded for a decision, deliberately not changed here**: it is
  live copy on a screen a registrar reads, and this was a documentation change.
  ⚠️ **FOURTH FALSE PLAN STATUS IN FOUR DAYS**, after the tiers plan twice and the
  lineups plan once. The mechanism is the same every time and is now written down:
  **the header is written when the work is BUILT, and merging is a separate act
  nobody comes back for.**

- `5f9e772` — ⬆️ **jest-dom 6.9.1 → 7.0.1.** The squash SHA for the entry below,
  which could not cite itself. ⚠️ **A Dependabot pull request cannot ever write
  this line** — the bot commits no changelog entry, so every one of them leaves a
  SHA for the next human pull request to pick up, and `docs-check` in CI demands
  it the moment a new branch is cut. That is the whole reason this repo's rule
  says to cite the previous squash SHA as the FIRST edit on a branch.

- ⬆️ **jest-dom 6.9.1 → 7.0.1, AND THE OTHER FOUR MAJORS PARKED WITH REASONS.**
  Dependabot opened five at once; this is the only one where anything but the
  changelog was wrong. The four parked ones are in `claude/open-items.md` with the
  error each actually produces — react 19 blocked by `react-dom` (the mirror of
  #152), vite 8 and plugin-react 6 **mutually blocking** because plugin-react 6
  demands `vite ^8` exactly, and tailwind 4 failing in the BUILD rather than the
  install because `src/index.css` is v3-shaped.
  ⚠️ **EVERY DEPENDABOT PULL REQUEST HERE IS RED ON `docs-check` AND IT NEVER MEANS
  ANYTHING** — the bot writes no changelog entry, so the check correctly reports a
  missing commit. #198's only real failure was that. **Read the `test` line.** How
  to take one is now in `claude/runbooks/session-and-push.md`.
  ⚠️ **A GREEN SUITE IS WEAK EVIDENCE FOR A MATCHER MAJOR**, because a matcher that
  loosened rather than vanished passes silently — a removed one throws
  `is not a function` and gets caught. `toHaveStyle` was fed a wrong value under
  v7 and both tests using it failed, which is what makes 138 files and a full pass
  mean something. Its branch was also **25 commits behind** and was rebased first.

- `0f9fdb5` — 🧰 **THREE WAYS OPENING A PULL REQUEST FAILS.** The squash SHA for
  the entry below, which could not cite itself.

- 🧰 **THREE WAYS OPENING A PULL REQUEST FAILS THAT LOOK LIKE YOUR MISTAKE**, in
  `claude/runbooks/session-and-push.md`. All three were met opening #222.
  GitHub can **503 on API writes while reads stay green**, and `git push` is
  unaffected — so a branch can sit on the remote with no way to open a pull
  request for it. A body built inside a double-quoted shell string has its
  backticked words **executed and removed**, which is how the comment closing #221
  posted with three holes in it. And `gh pr merge --delete-branch` prints a
  `fatal:` in a worktree *after* it has already merged.

- `61ff76d` — 🎨 **A HEAD COACH IS THE SAME SIZE IN EVERY SQUAD.** The squash SHA
  for the entry below, which could not cite itself.

- 🎨 **A HEAD COACH IS THE SAME SIZE IN EVERY SQUAD.** Jay, 16 Aug, comparing two
  cards on Home: *"the U13 head coach bubble is not the standard double size"*.
  `tileSpans` refused the tall lead tile below three people, and the squads that
  looked wrong were simply the small ones — U13 Mixed has two staff, U16B six.
  **The photograph was a red herring; the cause was the headcount.**
  ⚠️ **THIS REVERSES A RULING THAT WAS NOT WRONG, ONLY OUTWEIGHED.** At two people
  the tall tile leaves a hole beside its lower half — that hole is real and still
  there. It loses to consistency, because the two squads sit one above the other
  and the same job rendered at two sizes reads as a bug. Same trade Jay already
  took one ruling below it, having seen both.
  ⚠️ **A SPAN ARRAY IS NOT A SIZE.** `tileSpans(2, true)` says `['lead', 'half']`;
  the size lives in `SPAN_CLASS`, so a lead that lost its class tokens would have
  satisfied every assertion in that file. The new test compares the two-person
  lead against the six-person one and demands the same className and inline
  `gridRow`. Both new assertions were proved against an injected `count >= 3`.
  ⚠️ **AND THE HARNESS STUB CONTRADICTED ITSELF FOR A DAY** — `listSquadStaff`
  hard-coded `t2` as empty while `listMySquadStaff` gave it two people, out of the
  same file. Both now read the map; the empty-squad case moved to `t3`.
  ⚠️ **REVIVED FROM #192, WHICH NEVER MERGED** — its branch went `CONFLICTING` on
  `claude/changelog.md` and sat open for a day while the bug stayed live. Re-cut
  from `origin/main`, which is the only way back from that state.

- `571f70d` — 👀 **AN AGE ON THE ROSTER AND THE BIRTHDAY ON THE PLAYER SHEET.**
  The squash SHA for the entry below, which could not cite itself. ⚠️ **This line
  was written by #221 and arrives here instead, because that pull request was
  closed unmerged** (Jay's call) — so its handoff for the 17 Aug afternoon does
  not land, and the traps from that day survive only in its own description.

- 👀 **A COACH OR ADMIN CAN NOW SEE A BIRTHDAY, NOT JUST EDIT ONE.** Jay, having
  entered the first two: *"where as a coach or admin can i see them?"* The answer
  was nowhere but the edit form, one child at a time — no age on the roster, no
  date on the player sheet, and `/admin/needs-attention` only ever said WHO was
  missing one. An **age** now sits on the roster row beside the gender, and the
  **date plus the age** on the player sheet.
  ⚠️ **THE ROSTER READ IS STAFF-ONLY AND IS NOT ISSUED AT ALL OTHERWISE** — the
  rule the Tier column already follows. `player_private` is readable by squad
  staff or the child's own family, so a parent would get null for every team-mate
  and a roster of blanks. **The test for it asserts the absence of the REQUEST,
  not the absence of a number**: the screen looks identical either way, so a
  screen-only assertion would pass against a version that queried every child's
  birthday.
  ⚠️ **THE PLAYER SHEET RENDERS NOTHING WITHOUT A VALUE**, which is that file's
  existing contract rather than a new one — parents reach it, and an empty "Date
  of birth" row would announce that one exists and is being withheld. Proved by
  making it render the empty row and watching both safeguarding tests fail.
  ⚠️ **BOTH USE THE CLUB'S OWN `ageAt`**, so a number shown here cannot drift
  from the one that decides which squad a child belongs in.
  ⛔ **AND SIX TEST FILES NEEDED A MOCK THEY DID NOT HAVE.** A `vi.mock` factory
  replaces the whole module, so an omitted export is `undefined` and throws from
  inside an effect — surfacing as a dozen failures naming the MOCK rather than
  the component. Every file that renders `Roster` or `PlayerDetail` needed the
  new reads adding. Worth knowing before adding any data call to a shared screen.

- `f506a7f` — 🎂 **THE BIRTHDAY GATE AND THE PLACES TO ENTER A DATE.** The squash
  SHA for the two entries below, which could not cite themselves.

- 🗓️ **THERE IS NOW SOMEWHERE TO ENTER A DATE OF BIRTH — THERE WASN'T.** Jay,
  17 Aug 2026: *"are you sure there is a place to put the DOB's? because last
  time i checked there wasn't anywhere to enter them"*. He was right and the
  claim above it was wrong: what had been verified was that the DATA layer
  allowed the write, not that any screen offered the field. **The only writer in
  the entire app was `PlayerRegistrationForm`, which a family passes through
  once** — so a date entered wrongly was permanent, for parent, coach and admin
  alike. The field is now on `MyPlayerForm` (a family fixes their own child's)
  and `PlayerForm` (a coach or admin enters or corrects any in their squads).
  ⚠️ **AND THE COMPLETENESS CARD HAD BEEN TELLING FAMILIES A FALSEHOOD.** *"You
  can add them from the buttons below"* — the button below opened `MyPlayerForm`,
  which had no such field. Live on `/more` since the card shipped.
  ⛔ **CHASING IT TURNED UP A SECOND BUG, IN THE WRITER ITSELF.** `setPlayerDob`
  writes `plays_up_confirmed_at: playsUp ? now : null`, so **any** call that
  omits the flag ERASES a parent's recorded play-up consent. Correct for the
  registration form, which asks both questions together; wrong for every edit
  surface, and wrong for the sign-in gate added the same day. **Measured on
  production in a rolled-back transaction on an invented child:** the old writer
  erased the agreement, a birthday-only write kept it, and a control proved the
  birthday-only write still inserts correctly when no row exists. New
  `updatePlayerDob` omits the column entirely; three tests assert which writer is
  reached, and injecting the old one turns the right one red in each file.

- 🎂 **THE SIGN-IN GATE NOW ASKS FOR THE BIRTHDAYS THE CLUB STARTED REQUIRING
  AFTER PEOPLE SIGNED UP — AND THIS ONE CANNOT BE SKIPPED.** Jay, 17 Aug 2026:
  *"we could just do it once and make it unskippable? something like please add
  this info to continue"*. A fourth step in `src/components/NamePrompt.jsx`,
  between the player and role questions. **No migration**: `setPlayerDob` already
  existed and `player_private`'s RLS already lets a child's own family write it.
  ⚠️ **IT IS THE ONLY STEP ON THAT GATE WITH NO "no" ANSWER, SO IT IS THE ONLY
  ONE CARRYING A SIGN-OUT.** The sheet is `dismissible={false}` like the others,
  but the others can always be answered; this one cannot, and `AppShell`'s rule —
  *"someone who cannot get in must always be able to get out"* — would otherwise
  be broken by it.
  ⚠️ **THE READ FAILS OPEN, AND ON A BLOCKING GATE THAT IS THE WHOLE SAFETY
  ARGUMENT.** Every other step fails closed and costs a question; this one has no
  way past, so a failed read that blocked would take the club offline with no fix
  short of a deploy.
  ⛔ **THE TRAP THE SPEC PREDICTED WAS REAL.** `player_private` held ZERO rows, so
  every child is an ABSENT KEY rather than a null value — a gate checking only
  for nulls would never have fired, for the exact 26 children it exists for.
  Injecting that blind version turned **six** assertions red; injecting a
  fail-CLOSED read turned exactly one red.
  ⚠️ **IT ALSO REORDERED AN EXISTING GATE, AND FIVE ROLE TESTS CAUGHT IT** — the
  role block's fixture is a parent with a linked child, who now meets the
  birthday step first. Fixed in the fixture, not in the ordering.
  ⚠️ **DO NOT WRITE `plays_up_confirmed_at` FROM HERE**, asserted by test: that
  column records a parent ticking a box, and setting it would invent an agreement
  nobody gave — PR #213 in reverse.

- 📋 **THE SPEC IT WAS BUILT FROM: asking existing families for the birthdays the
  club started requiring after they signed up.**
  `claude/plans/2026-08-17-birthday-backfill-prompt.md`.
  ⚠️ **THE MEASUREMENT IS THE POINT OF IT.** `date_of_birth` became required for
  new registrations on 16 Aug, and on 17 Aug `player_private` held **zero rows** —
  not one family has filled it in, because nothing asks them. `NamePrompt` has
  three steps and none mentions a birthday, and the completeness card that does
  ask lives only on `/more`, which a parent has no reason to open.
  ⚠️ **`AdminNeedsAttention` SAYS "Each family is already being asked on their own
  screen", WHICH IS TRUE IN THE LETTER AND FALSE IN THE EFFECT** — and is probably
  why this looked handled. The plan carries three open questions for Jay, the
  hardest being how often to re-ask somebody who skips: `YourPlayers` already
  records that a chase with no visible end is ignored by the third sign-in.

- `954ef90` — ⛔ **A PENDING STAFF REQUEST COULD APPROVE ITSELF, AND LOOKED LIKE A
  CHILD.** The squash SHA for the two entries below, which could not cite
  themselves.

- 🧑‍🏫 **STAFF ASKING FOR ACCESS GET THEIR OWN QUEUE, INSTEAD OF APPEARING AS
  "Unnamed player".** Jay's call over correcting the label in place: approving a
  coach and approving a child are different decisions and should not share a
  heading. The new section names the person, the ROLE and the SQUAD, says in
  plain words what approving grants — a coach's view of that age group,
  including every family's contact details — and puts the role in the button's
  own accessible name, because "Approve" beside a card headed *"Players waiting
  to be approved"* is how the two got confused in the first place.
  ⚠️ **A PARTITION, NOT A FILTER, AND THE DIFFERENCE IS LOAD-BEARING.**
  `PendingApprovals` carries an explicit rule against client-side filtering —
  RLS decides who sees which rows. Every pending row still renders; `player_id`
  decides only WHICH of the two sections it lands in, so nothing can go missing
  by being neither. Split on `player_id` rather than `role`, because 'parent' is
  also what somebody registering a second child holds.
  ⛔ **AND THE FIRST ATTEMPT FIXED ONE OF TWO RENDER SITES.** `Accounts.jsx`
  renders the queue twice — once in the approver-only early return, once in the
  admin view — and the first edit changed only the former, so every new test
  failed against the admin path still showing "Unnamed player". **The same
  mistake as the bug being fixed**, one layer up: a second surface nobody
  audited. It was found because the tests ran as an admin; a coach-only fixture
  would have passed. ⚠️ **It was hidden for one round by a `head_limit` on the
  grep that looked for the render sites** — an incomplete search read as a
  complete one, which `CLAUDE.md` rule 6 exists to stop.

- ⛔ **ASKING TO COACH A SQUAD WAS ENOUGH TO APPROVE PEOPLE INTO IT.**
  `private.can_approve_team` tested role and team and never `status`, unlike its
  two siblings `can_see_team` and `can_edit_team`. Harmless until 16 Aug, when
  `request_staff_role` made a PENDING staff row possible for the first time —
  after which a person who signed up and asked to coach a squad could approve
  their own request and admit other families' children to it.
  `db/migrations/20260817_approve_requires_active_membership.sql`.
  ⚠️ **FOUND BY CHASING A COSMETIC BUG.** Jay sent a screenshot of "Unnamed
  player" in the live approval queue. Nothing was missing — all 26 players have
  a name — the row was a coach's staff request, which carries no player, shown
  by a queue whose only filter is `status = 'pending'`. The label was the
  symptom; the gate was the disease.
  ⚠️ **MEASURED, THEN RE-MEASURED WITH THE FIX, IN A ROLLED-BACK TRANSACTION ON
  PRODUCTION** with an invented club so no live row took part — **pending coach
  ALLOWED → refused (42501)**, while both controls (active coach of the squad
  ALLOWED, coach of another squad refused) did not move. `db/tests/approve-status-gate.sql`.
  ⚠️ **IT WAS NOT ONLY THE BUTTON:** `can_squad_staff_see_pending` calls the
  same function and backs the policy exposing a registrant's NAME and EMAIL.
  ⛔ **AND THE REASON NOTHING CAUGHT IT IS THE PART WORTH KEEPING.** Every
  membership fixture in `tests/` omitted `status` — a column that is NOT NULL —
  so no test in the suite could tell a request from access; `canApproveAnything`
  and `canApproveTeam` had no unit tests at all; and
  `db/tests/rls-squad-staff-approval.sql` makes every staff row `'active'`,
  correctly, because on 9 Aug a pending one could not exist. **A new writer
  arrived and the old readers — screen, gate, harness, fixtures — were never
  audited.** The new assertions were proved by injecting the real historical
  fault (no status test at all) and watching seven of them fail.
  ⚠️ **`private.is_admin` HAS THE SAME OMISSION AND WAS LEFT ALONE ON PURPOSE** —
  unreachable today (zero non-active admin rows, and `request_staff_role` cannot
  create one), and it backs most of the admin RLS surface. Recorded in
  `claude/open-items.md` rather than fixed in passing.

- 📝 **THE "NOT BUILT, DELIBERATELY" NOTE OUTLIVED THE PLAN THAT SAID THE SAME
  THING.** `2ac2782` corrected `claude/plans/2026-08-14-tiers-and-game-time.md`
  for claiming the eligibility warning was unbuilt; `claude/open-items.md` carried
  the identical claim in different words — *"an eligibility warning … was offered
  and not taken up"* — and survived that commit untouched. Struck through with the
  evidence rather than deleted, per that file's own rule.
  ⚠️ **THE SHAPE IS WORTH MORE THAN THE FIX: a "deliberately not built" note is a
  STATUS claim wearing a RULING's clothes.** Every neighbouring line in that file
  stays true until somebody acts on it, so nothing in the wording asks to be
  re-read on the day the thing ships. **When a decision not to build is reversed,
  grep for the feature, not for the plan that named it.**
  ⛔ **AND THE FEATURE HAS NEVER HAD ANYTHING TO RENDER, WHICH THE BUNDLE CHECK
  COULD NOT SEE.** Measured on production: **1 tiered fixture, 4 graded players,
  and no overlap** — 7 children are picked on that fixture and **0 of them are
  graded**. Finding both message fragments in the live bundle proved the code
  deployed; it did not prove a coach has ever seen a warning, and **nobody has**.
  ✅ **The zero was controlled before being written down**, per rule 6: all 4 grades
  join to real players and all 4 graded children ARE picked in lineups — on the two
  fixtures that carry no tier. Both halves are in live use and have never met.
  Recorded under "shipped but never seen against real data", because silence here
  is indistinguishable from the feature being absent — the screen is built to fall
  silent rather than fail.

- `2ac2782` — 📝 **THE PLAN SAID "NOT BUILT" A MINUTE AFTER IT SHIPPED.**
  `claude/plans/2026-08-14-tiers-and-game-time.md` and the eligibility spec both
  corrected: the status lines were written before the merge and not revisited
  after it.

- `ae98b8f` — ⚖️ **THE LINEUP PICKER CAN NOW SEE THAT A GRADE AND A TIER DISAGREE.** The third
  of Jay's 14 Aug ask — *"fair game, eligibility, and milestone"* — and the last
  piece of `claude/plans/2026-08-14-tiers-and-game-time.md` still unbuilt. Both
  halves of the comparison already existed and held real rows; nothing compared
  them. `src/lib/tierEligibility.js` is a pure comparison with no React and no
  Supabase in it, so its nine pairs plus the empties are swept exhaustively rather
  than sampled. Spec:
  `claude/plans/2026-08-17-lineup-eligibility-warning.md`.
  ⚠️ **BOTH DIRECTIONS WARN, WORDED DIFFERENTLY** (Jay, 17 Aug 2026, offered either
  alone). Graded below the fixture is a worry about the CHILD; graded above it is
  the stacking problem an opposition club complains about. Not one template with
  the letters swapped, and a test asserts the two differ.
  ⚠️ **THE UNGRADED AND THE UNTIERED ARE SILENT, AND THAT IS THE FEATURE.** Most of
  the club has no grade, so warning on them would put a warning against nearly
  every name — and a warning that is always on is furniture.
  ⚠️ **"PLAYING UP" IS DELIBERATELY NOT THE WORDING.** This app already uses it for
  a younger child in an older squad, which is what the cut-off fix above was about.
  Asserted by test, because it is the phrase a later edit reaches for.
  ⛔ **AND THREE THINGS WERE GREEN WHILE BEING WRONG, WHICH IS THE PART WORTH
  KEEPING.** (1) The share-card guard scanned for "Graded", "tier" and "eligib" and
  **passed** against an injected leak of the bare LETTER — `Rory Aldenbrook (A)`. It
  is now a differential naming no keyword: the card rendered with grades must equal
  the card rendered without them. (2) That injection's FIRST run came back green for
  the wrong reason — the fixture put the only bench place on the UNGRADED child, so
  the leak rendered nothing either way. **The same shape as the age cut-off bug:
  invisible on exactly the case where it did not matter.** (3) The warning wrapped to
  **FOUR lines** at 375px, making a row 108px against a 42px baseline, and **every
  assertion in the suite passed on it** — jsdom reports no widths, so it cannot fail
  on layout. Found by measuring a real browser; guarded by a STRUCTURAL test, because
  jsdom can see shape even where it cannot see width.

- `08e2b94` — 📝 **SESSION RECORD, AND TWO STALE CLAIMS CORRECTED.**
  `claude/handoffs/2026-08-17-account-creation-and-the-season-cutoff.md` — six
  merged pull requests, the traps met, and the state measured on the day.
  ⚠️ **`claude/plans/2026-08-14-tiers-and-game-time.md` SAID "PHASE 2 NOT YET
  MERGED" AND "no player has been graded", AND BOTH WERE FALSE.** Phase 2 is on
  `main`; the club had **4 graded players, 6 multi-position rows and 1 fixture
  carrying a tier**. Somebody had been using it for days while the plan said
  nobody could. Corrected, and the correction is written as a warning to re-run
  the counts rather than as a fresh number that will rot the same way.

- `b291df7` — ⛔ **THE AGE CUT-OFF WAS A YEAR BEHIND, AND IT WAS BLOCKING REAL
  REGISTRATIONS.** Jay, 17 Aug 2026, reading the age-band table: *"i think this is
  wrong because we are doing this for the upcoming season that starts sept 1st"*.
  He was right, and the fault was live.
  ⚠️ **`cutoffFor` RETURNED THE CUT-OFF OF THE SEASON CONTAINING TODAY.** The
  cut-off is 31 August, so on 17 Aug 2026 it pointed at **31 Aug 2025** — while
  every family registering that week was registering for a season starting in two
  weeks. Every child came out **one year too young**.
  ⚠️ **AND IT WAS NOT A COSMETIC WARNING.** `PlayerRegistrationForm` REFUSES to
  submit an unconsented play-up, so an ordinary U13 registrant was **blocked**
  until their parent agreed to a play-up that was not happening — and the
  agreement wrote `plays_up_confirmed_at`, which sends a false *"Playing up"*
  chip to that squad's coaches. **Wrong data, not just wrong words.**
  ⚠️ **IT WAS INVISIBLE ON EXACTLY THE SQUADS WHERE IT DID NOT MATTER.** U16 and
  U18 are DOUBLE bands, so the lower age of the pair absorbed the off-by-one and
  both came out `ok`; **every single-band squad from U9 to U14 was wrong.** The
  same shape as the `\b` regex bug in `RESTORE.md` — right by accident in most
  cases, wrong in the one that counted.
  ✅ **NOTHING FALSE WAS EVER WRITTEN — MEASURED, NOT ASSUMED.** `player_private`
  was empty: 0 rows, 0 birthdays, 0 marked as playing up. Caught inside the
  registration window, by days.
  **The fix is one constant: the app rolls over to the coming season on 1 JUNE**
  (Jay's call, over a settings row — nobody has to remember anything each August).
  ⚠️ **SEPTEMBER TO MAY IS UNCHANGED**, and there are tests either side of that
  to prove the fix did not just move the bug to the other end of the year.
  ⚠️ **AND THE WHOLE `parent-self-registration` FILE WAS GREEN THROUGHOUT**, because
  every case in it is frozen at **7 Nov 2026** — in season, where the old and new
  cut-offs agree. There is now one test frozen in **August**, which is the only
  one that could ever have caught this.
  ✨ **A PLAY-UP MESSAGE NOW NAMES THE SQUAD THE CHILD BELONGS IN** — *"That is
  U12 Mixed. You have chosen U13 Mixed, which is one age group up."* (Jay's
  choice.) A parent who picked the wrong age group was being asked to CONSENT
  rather than shown their mistake, and consenting is much the easier of the two.
  ⛔ **AND FAULT INJECTION FOUND A GUARD THAT COULD NEVER FIRE.** A branch
  suppressing *"That is X"* when X was the squad already chosen — with a passing
  test — turned out to be unreachable: `ownBandForAge` is the exact inverse of
  `cutoffAgesForTeam`, so that case returns `ok` long before it. Deleting it broke
  nothing. **281** non-`ok` results across every squad × every age, 176 naming a
  squad, **none** naming the chosen one. The guard is gone and the sweep is now
  the test. ⚠️ **Its control was wrong on the first run too** — it demanded all
  281 carry a name, when ages outside the band table correctly carry none.

- `1d1c206` — 🔒 **THE `allowsOwnContact` RE-POINT — PROMISED 3 Aug, DEFERRED THREE TIMES,
  DONE.** A player's own email and phone are now decided by the squad name **and**
  the birthday, so **item 3 is complete and the plan is finished.**
  ⚠️ **THE BIRTHDAY MAY ONLY EVER CLOSE THE GATE, AND THE CODE SAYS SO IN ONE
  LINE.** A parent writes their own child's birthday — deliberately, the family is
  the source of truth — so a gate a birthday could OPEN is a gate a family
  unlocks by typing a different year. `allowsOwnContactFor` computes the squad
  answer first and returns a `false` immediately. **There is a property test
  sweeping every squad against every birthday shape asserting the widening
  direction is unreachable**, not just the cases somebody thought to enumerate.
  ⚠️ **IT ASKS THE AGE AT THE 31 AUGUST CUT-OFF, NEVER "how old are they
  today".** Rugby bands are season-relative and a birthday is not: a U13 squad is
  mostly TWELVE-year-olds for most of the season, so today's age would strip the
  field from nearly a whole squad the club's own rule permits it for — gradually,
  as birthdays passed, which is the hardest kind of bug to attribute.
  ⚠️ **AN UNKNOWN BIRTHDAY CHANGES NOTHING AND MUST NOT FAIL CLOSED.**
  `getPlayerDob` returns null both for "not set" and for "RLS will not show you".
  Closing on that would remove the field from every child in a club whose
  `player_private` is nearly empty, and would do it to team-mates' records purely
  because the reader could not see them.
  ⚠️ **ONE HOOK, THREE SCREENS** — `useOwnContactGate`, read by PlayerForm,
  PlayerDetail and MyPlayerForm. Three copies of "read the birthday, then narrow"
  is three chances for one of them to fail open, and the one that did would be the
  one nobody tested. In PlayerForm it is called **above** the `gated` early
  return, which is a hook-order requirement rather than a style choice.
  ⚠️ **MyPlayerForm DECLINES TO FETCH, NOT MERELY TO RENDER**, which is why the
  hook also returns `settled`. Loading a child's email and phone and then hiding
  them would be correct and would leave the row in the component for the next
  person to render by accident.
  ⛔ **AND ONE ASSERTION WAS PASSING WITHOUT TESTING ANYTHING.** "It opens on the
  squad's answer first, so the fields do not blink" was written against the DOM —
  but in jsdom `useEffect` flushes inside `render`, so the DOM can only ever show
  the effect's value and **the `useState` seed the browser actually paints was
  untested**. Breaking it on purpose left every test green. The probe now records
  every render and asserts `renders[0]`.

- `e572545` — 📝 **AND `claude/open-items.md`'s "No audit log" IS NARROWED, NOT CLOSED.** The
  new rights log covers **one of the four things that item listed** — memberships,
  including super-admin. A deleted player and an edited contact detail still leave
  no trace at all, and the first of those is the more alarming on a club whose
  members are children. ⚠️ **The item is corrected in place rather than ticked
  off**: a finding deleted from that file is a finding that ceases to exist.

- ✨ **AND THE CLUB CAN SEE ITS OWN GAPS — `/admin/needs-attention`.** The THIRD
  and last surface of the completeness rule, so item 6 is now complete. The other
  two ask the person who can fix it at the moment they are already looking; this
  one answers the club's question — *where are we actually missing things?* — for
  somebody who opens it deliberately.
  ⚠️ **IT READS `src/lib/completeness.js`, IT DOES NOT RESTATE IT.** One rule,
  three surfaces. A second opinion here would be a second answer, and the wrong
  one would be the one nobody tested.
  ⚠️ **IT CAN BE EMPTY, AND THAT IS ASSERTED FIRST.** A list that always has rows
  is one nobody finishes — the same contract the family's disappearing card is
  built on. **Position stays out**: 23 of 26 players have none, and listing it
  would put almost every player on this screen forever.
  ⚠️ **NOT ONE DATE OF BIRTH IS FETCHED.** `player_private` is a separate table
  precisely so a team-mate's parent cannot read a birthday; a club-wide sweep
  that pulls every date in order to COUNT the missing ones is the same mistake
  from the privileged end. New reader `listPlayerPrivatePresence` returns a Set
  of ids and nothing else, so there is no date on the object for a later change
  to start rendering. Nothing on the screen is a contact detail.
  ⚠️ **AND IT SAYS THE FAMILIES ARE ALREADY BEING ASKED**, because the useful
  next action is usually nothing. Without that line a registrar rings people the
  app is politely chasing, and one birthday gets asked for twice.
  ⚠️ **THE SQUAD HEADING CARRIES THE DENOMINATOR** — "1 of 2", not "1". How much
  work there is and how bad it is are different questions.

- `01ec41f` — 🔒 **AND NOW SOMEBODY CAN READ IT — `/admin/rights-log`.** The audit trigger
  shipped the day before with **nothing anywhere that could open it**. A log
  nobody can read is not accountability; it is a table that looks like
  accountability in the schema and answers nothing at the moment somebody asks
  who made a stranger an admin.
  ⚠️ **THE FIRST ADMIN TAB WHOSE AUDIENCE IS NARROWER THAN ITS PORTAL'S.** Club
  Admin has no `right` — every admin holds it — so `src/lib/portals.js` gained
  `visibleTabs`. **Hiding a tab grants nothing and hides no data**: the URL still
  resolves to Club Admin for an ordinary admin, the screen explains itself, and
  `membership_audit`'s `is_super_admin()` policy is the only thing that decides
  whether a row comes back. **Asserted both ways, in the same portal.**
  ⚠️ **IT ISSUES NO QUERY AT ALL FOR A NON-SUPER**, and that is asserted
  separately from the message. A screen that renders the refusal *after* asking
  is one that relies on being refused — which nobody notices when a policy
  changes.
  ⚠️ **A PENDING GRANT READS AS A REQUEST, NOT AS ACCESS.** Almost every row
  starts life pending, and "Given Coach" for a claim nobody approved describes a
  hole that does not exist — on the one screen somebody opens when they suspect
  one does.
  ⚠️ **THE HEADLINE COUNTS ELEVATIONS, NOT ENTRIES.** "213 changes" says a log
  exists; "9 of them handed somebody access" is the number the screen was opened
  to find. Same reasoning as the Staff tab's gap count.
  ⚠️ **NULL IS "the system", A MISSING PROFILE IS "an account since deleted".**
  Never a blank — an unexplained gap in an audit log is indistinguishable from a
  lost one, and the table has no foreign keys precisely so it outlives the rows
  it names.
  ⛔ **THE TABLE IS EMPTY, AND THAT LOOKED IDENTICAL TO A TRIGGER THAT NEVER
  FIRED.** Confirmed the negative before trusting it (rule 6): trigger present
  and enabled, then a rolled-back probe took one membership pending → active and
  the count went **0 → 2**. Empty means nothing has changed since 17 Aug, not
  that nothing is recorded. The probe also settled two shapes the formatter
  guesses at — `old_rights` arrives as `{}` rather than null, and a write with no
  session records `actor_kind = 'system'`.
  ⚠️ **AND THE SCREEN'S OWN TESTS COULD NOT HAVE CAUGHT A DROPPED COLUMN** — they
  mock `src/data/audit.js`, so a missing `new_is_super` is `undefined` and the
  screen renders happily around it, silently never printing "Made a super admin".
  The select assertion is in `tests/data.test.js`, the same place and for the
  same reason as `listClubMembers`'s. **Proved by dropping the column.**

- `f245fbd` — 🔒 **"DO YOU KNOW THEM?" — THE ANSWER NOBODY COULD GIVE BEFORE.** Item 8, and
  the largest safeguarding win left in the plan. The approval queue now takes two
  answers from the people already being asked to approve somebody: **I know
  them** / **I don't**.
  ⚠️ **"I DON'T" IS THE VALUABLE ONE, AND IT REJECTS NOBODY.** It blocks no
  approval and hides no row — the Approve button beside it is unchanged. What it
  does is make an unrecognised adult asking to reach a children's squad visible
  AS unrecognised, instead of identical to everyone else in the queue.
  ⚠️ **ANSWERED IN THE APP, NEVER FROM AN EMAIL LINK.** The obvious build is two
  links in the notification. A link acting on somebody's behalf without a session
  needs a TOKEN, and a token in an email is a credential in an email — forwarded,
  quoted in a reply, sitting in a mailbox somebody else opens. There is no cost to
  requiring a session: the coach must sign in to approve anyway.
  ⚠️ **THE WRITE POLICY PINS `voucher_id` TO `auth.uid()`.** Without it a coach
  could attribute an opinion to a colleague — worse than no signal, for a signal
  whose whole purpose is *who recognised them*. **Proved: refused.**
  ⚠️ **AND A MEDIC IS OUTSIDE THE SET**, matching `invite_parent`: a medic cannot
  approve, so a medic's opinion must not sit in the queue looking like one that
  counts. Proved with a **created** medic fixture, since the club has none — a
  found one would have been null and measured a stranger.
  Changing your mind REPLACES rather than adds: one answer per person per
  request, so a correction is not a second vote.
  ⚠️ **AND NO STANDING "0 know them"** on a request nobody has looked at yet —
  that reads as a verdict rather than the absence of one.

- `06a39d2` — ✨ **AND THE APPROVAL QUEUE SAYS WHAT A RECORD IS MISSING, AT THE MOMENT OF
  APPROVAL.** The second of the completeness rule's three surfaces. This is the
  one place a coach is already looking at a record and deciding about it — a gap
  named here gets fixed, where the same gap on a list nobody opens does not.
  ⚠️ **IT DOES NOT BLOCK APPROVAL**, and must not: a missing birthday is a record
  to chase, not a reason to leave a real family waiting.
  ⛔ **AND THE FIRST VERSION BROKE THE RULE IT WAS BUILT ON.** The queue's embed
  was `players(full_name)`, so `gender` was UNDEFINED — not absent — and every
  pending player in a single-gender squad was reported as missing one.
  completeness.js's whole principle is that an **unknown is not a gap**; the
  wiring has to supply the field for that to hold. The embed now carries it.
  ⚠️ **AND REMOVING IT AGAIN FAILED NOTHING IN THE SCREEN'S OWN TESTS**, because
  they mock `listClubMembers` and hand the component a `players` object they
  wrote themselves — the mock encoding the assumption instead of the contract,
  the same trap as the array-versus-map bug in `YourPlayers`. The assertion that
  catches it lives at the data layer, on the select string.

- ✨ **THE CLUB ASKS FOR WHAT IT IS MISSING, ONCE, AND THEN STOPS.** Item 6 — the
  half of Jay's original complaint still open: *"i can't have people signing up
  without complete information"*. One shared rule (`src/lib/completeness.js`) and
  the first of its three surfaces: a card on the family's own screen.
  ⚠️ **IT DISAPPEARS WHEN THERE IS NOTHING LEFT TO ASK, AND THAT IS THE WHOLE
  CONTRACT.** A chase with no visible end is ignored by about the third sign-in,
  and once ignored it trains people to skip the one place the club asks them for
  something.
  ⚠️ **SO THE LIST IS SHORT, AND THE MEASUREMENT DECIDED IT RATHER THAN THE OTHER
  WAY ROUND.** A thing qualifies only if the reader can fix it themselves AND it
  is exceptional. **Position is excluded and must stay excluded** — it is a
  coach's judgement, not a parent's, and at **23 of 26 players** it is the normal
  state of a youth club. Listing it would put a card on almost every screen,
  permanently: the exact failure this design exists to avoid.
  ⚠️ **AN UNKNOWN IS NOT A GAP.** `undefined` means "we did not look" — a parent
  reading a team-mate gets null from RLS, and treating that as "no birthday on
  file" would nag somebody about a child that is not theirs.
  **Still to wire: the approval-queue chip and the admin list.** The rule is
  shared and ready for both.

- `044399c` — 🔒 **A CHANGE LOG FOR CHANGES TO RIGHTS.** Jay: *"we need a change log for
  changes to rights"*. `public.membership_audit`, append-only, recording who
  granted, changed or revoked whose access and when. `memberships` held the
  current state and no history, so "who made this person an admin" has been
  unanswerable since the app existed.
  ⚠️ **WRITTEN BY A TRIGGER, NEVER BY THE APP.** Access is granted from at least
  six places; an audit the client writes is one a client can skip, and worse, one
  a NEW granting path silently forgets forever.
  ⚠️ **APPEND-ONLY, ENFORCED BY ABSENCE.** One SELECT policy and no others — RLS
  denies by default, so no client can write or alter a row whatever their role,
  with table privileges revoked as a second independent refusal. **Proved: a
  signed-in admin could not update, delete or forge a row.**
  ⚠️ **SUPER ADMINS ONLY** (Jay's call). The first version said
  `is_admin(club_id)`, which is wrong once stated: this records what ADMINS do,
  so every admin reading it lets the audited read their own audit.
  ⚠️ **AND TRUNCATE WAS STILL GRANTED** — a Supabase default on every new table.
  Unreachable through PostgREST, but "not reachable through the API we happen to
  use" is not a property to rest an audit log on. The first probe tested INSERT,
  UPDATE and DELETE and left it in place.
  ⛔ **THE FIRST READ PROBE REPORTED A PASS THAT MEANT NOTHING.** It checked that
  "an ordinary club admin sees 0" — but **this club has no ordinary admin**, every
  one is super, so it measured a NULL user. Re-run after creating a real
  non-super admin inside the transaction and asserting `is_admin()` returns true
  for them first: control 1, that admin **0**, super admin **1**.
  ⚠️ **NO FOREIGN KEYS, DELIBERATELY** — an FK to `memberships` would make it
  impossible to record the most interesting event, a revoke, and a cascade from
  `profiles` would erase somebody's history with their account.
  ⚠️ **`auth.uid()` NULL IS RECORDED AS `system`, NOT LEFT BLANK** — a cron or
  service-role write is "the system did it", not "nobody did it".
  Live probe: granted 1, changed 2, revoked 1 — and a title-only edit correctly
  wrote **nothing**, which is what keeps the log readable.
  **No screen reads it yet**; the data is the time-sensitive half.

- 📄 **A THRESHOLD FOR TURNSTILE, RATHER THAN A HUNCH** —
  `claude/runbooks/monitoring.md`. Not turned on: a bot account reads zero rows
  here, so junk signups are noise rather than a breach. ⚠️ **The risk is email
  reputation, not accounts** — every attempt sends confirmation mail on the same
  domain as the auth mail, and getting that flagged takes SIGN-IN down. So the
  thing to watch is `/signup` volume, and the runbook carries the query.

- `f2ed3b0` — 🐛 **A PASSWORD THAT MET EVERY RULE WAS REFUSED, AND THE APP BLAMED THE RULES.**
  Found on Jay's own sign-up: five green ticks in the checklist, and a red banner
  saying *"check the list below the password box"* — pointing at the one thing
  that was not the problem.
  ⚠️ **`weak_password` IS THREE DIFFERENT REFUSALS.** supabase-js's
  `AuthWeakPasswordError` carries `reasons`, and the set is exactly
  `['length', 'characters', 'pwned']`. The first two ARE the checklist; the third
  is Supabase's leaked-password protection, which has nothing to do with the
  rules on screen. All three arrive with the same `code`, so one message
  swallowed all three.
  Now the breached case says so, **and says the rules were met** — which is what
  resolves the contradiction between a green checklist and a red banner. Telling
  somebody to check a list they have already satisfied is how they conclude the
  app is broken and give up, and on a sign-up screen that costs the club a member.
  ⚠️ **`reasons` FIRST, PROSE SECOND.** The array is the stable contract; GoTrue's
  sentence can be reworded without warning. The prose fallback exists for a
  response that arrives without the array.

⚠️ **THE ENTRIES BELOW SHIPPED AS ONE SQUASH, `0d22f32` (#204)** — the play-up
chip, the invite email, and the adult-to-account link. Kept apart because they
are three separate decisions.

- `0d22f32` — ✨ **AN ADULT IS LINKED TO THEIR ACCOUNT, AND THE INVITE BUTTON GAINS ITS THIRD
  STATE.** `player_parents.profile_id`, filled by `link_my_parent_rows()` on
  sign-in. Invite → Invited → **Joined**; until now the button could not tell an
  adult who had accepted from one who never opened the email, because a client
  may not read `profiles` for anybody but itself.
  ⚠️ **THE PLAN SAID "`claim_roster_access` GENERALISED TO ADULTS". THAT WOULD
  HAVE OPENED A HOLE.** That function matches an email and CREATES A MEMBERSHIP —
  safe where it is, because `player_contacts.email` is written only by staff.
  `player_parents.email` is an address a PARENT can type for their own child, so
  the same trick would mean: type an address into the contacts box, sign in as
  it, hold a membership on that squad. Precisely what `invite_parent` exists to
  prevent. **So this sets one column and creates nothing**, and its migration
  ABORTS if the function body ever mentions `memberships`.
  ⚠️ **PROVED BY THE ROW THAT MATTERS: memberships 48 → 48.** The other checks —
  2 rows linked case-insensitively, a second call linking 0, another account's
  claim untouched — would all pass for a function that also handed out access.

- ✉️ **THE INVITE EMAIL IS LIVE.** `notify-invite`, fired by an AFTER INSERT
  trigger on `invites`. Jay's calls: the sender is NAMED, and it fires for EVERY
  invite — the admin form no longer makes anybody copy a link out by hand.
  ⚠️ **IT IS NOT LIKE THE OTHER THREE NOTIFIERS, AND THAT IS THE DANGEROUS PART.**
  They mail a GROUP in bcc about work waiting. This mails ONE PERSON and the
  message contains a **credential** — `invites.token` IS the authentication. No
  bcc, no cc, one recipient read off the row, request body carrying an id and
  nothing else.
  ⚠️ **IT MUST NOT READ `invite_targets`** — a multi-target invite writes the
  invite row first and the targets second, so the trigger sees none, every time.
  ❌ **AND THE "HAND STEP ONLY JAY CAN DO" DID NOT EXIST.** The plan said two
  Vault secrets and a dashboard env var; in fact all the notifiers share
  `approval_notify_secret` and Edge Function env vars are PROJECT-WIDE, so a new
  function already has it. Proved by the first curl answering **401, not 503**.
  ⚠️ **`net.http_request_queue.body` IS `bytea`** — casting it straight to jsonb
  fails with an error that reads like a malformed body and is not one. The
  9 Aug runbook's verify snippet has the same gap.
  **Outstanding: one real send**, which needs a real inbox and is Jay's.

- ✨ **THE PLAY-UP IS RECORDED, AND THE COACH WHO MUST APPROVE IT IS TOLD.**
  `player_private.plays_up_confirmed_at`, written on the same call as the
  birthday, and a **Playing up** chip on the approval queue.
  ⚠️ **A CHIP RATHER THAN AN EMAIL, BY DESIGN.** The person who has to ACT is the
  coach reading that queue — an email is only a prompt to come and look at that
  card. It also needs no Vault secret, no edge-function deploy and no **third**
  copy of the UAERF model: a Deno function cannot import `src/lib/ageGrade.js`,
  and two copies already have to be kept in step by hand across two repos.
  ⚠️ **THE COLUMN IS A DECISION, NOT A DERIVED FACT** — the dates say a play-up is
  possible, the column says a parent ticked the box. Deriving it server-side is
  impossible anyway: the membership insert fires the notification trigger BEFORE
  the birthday is written.
  ⚠️ **AND THE TICK ALONE IS NOT THE ANSWER** — a parent can tick and then change
  the squad, so the check is re-run at submit.
  ⚠️ **THE LIVE RLS PROBE REPORTED A HOLE THAT WAS NOT ONE.** Its "another parent
  in the same squad" fixture also held a coach role there. A lot of parents at
  this club are coaches; a fixture picked by role NAME is not one picked by
  RIGHTS. Re-run properly: own parent 1, team-mate's parent 0, stranger 0.

- `9a60be2` — ✨ **PLAYING UP AN AGE GROUP, UNDER THE REAL UAERF RULES.** Jay: *"check the
  adhjrt.com repo for age bands … we need the ability for players to play up one
  age group with a notification"*. The tournament site has held the whole model
  since July — cut-off, band per group, ladder, and the wider allowance for the
  girls' squads — so this is a **port of it**, and the club's 15 squads map onto
  its 15 age groups exactly. A play-up asks for the parent's consent and refuses
  without it; a genuine mismatch only warns.
  ⚠️ **THE CUT-OFF IS 31 AUGUST**, so "Under X" means exactly X−1 on that date, a
  U13 squad is mostly TWELVE-year-olds, and the governing cut-off is LAST August
  for eight months in twelve.
  ⚠️ **THE MODEL IS HYBRID AND NEITHER HALF WORKS ALONE — ported as a pure ladder
  first, and two tests caught it.** Boys and mixed walk one rung of the LADDER,
  because subtracting years is wrong at the double bands (a 14-year-old in U18B
  is ONE group below — U16B is for 14s *and* 15s). Girls subtract YEARS and allow
  two, because the ladder has HOLES (no group at 12 at all between U12G and
  U14G) and one hop steps over a real twelve-year-old — which refused a live
  registration on the tournament site in July.
  ❌ **THIS SUPERSEDES A TOLERANCE MODEL WRITTEN THE SAME MORNING**, which guessed
  a plausible band from "age today" because nothing in this repo recorded the
  cut-off. Honest while the fact was unknown, wrong to keep once it was known —
  deleted rather than left beside the real one.
  ⚠️ **AND TWO TEST FILES SILENTLY DEPENDED ON THE REAL CLOCK.** Eligibility moves
  every 31 August, so a fixed birthday changes squad on that date; both now pin
  it, with `toFake: ['Date']` only — faking the timers as well hangs userEvent
  and reads as a test that never finishes.
  ⚠️ **THE `allowsOwnContact` RE-POINT IS STILL NOT DONE, AND IS NO LONGER
  BLOCKED — only deferred.** The cut-off is known now, so it is ordinary work
  with a safeguarding rule inside it: a DOB may only ever make that gate
  STRICTER, because a parent may write their own child's birthday.

⚠️ **THE FIVE ENTRIES BELOW SHIPPED AS ONE SQUASH, `821c4dd` (#202).** They are kept
apart because they are five separate decisions, and a reader looking for why
`savedEmail` exists should not have to read about the roll-call to find it.

- `821c4dd` — ✨ **ONE ROLL-CALL REPLACES THE FORK AT THE FRONT DOOR.** The point of the whole
  account-creation plan. `AppShell` rendered "Add your player" with a button
  saying *"I'm not adding a player"* that swapped in the ask-the-club form —
  **mutually exclusive**, so the branch somebody picked in their first ten seconds
  decided what the club knew about them from then on. The parent door never asked
  whether they also coach; the staff door never asked whether they have children
  here. Jay: *"i have coaches signing up without adding their kids, its chaotic
  right now"*. Now: who are you, what brings you here, nothing pre-selected, tick
  everything true — and every ticked answer is taken in turn.
  ⚠️ **THE RELOAD GOES LAST, EXACTLY ONCE.** The screen renders while
  `memberships.length === 0` and only `reload()` changes that; the two RPCs create
  rows without telling the provider, which is what lets one screen write several
  answers and stay put. Wire it to a section and the screen unmounts on the first
  answer with every remaining question unasked — no error, nothing to notice.
  ⚠️ **THE NAME IS ASKED BEFORE ANY WRITE**, or a coach reaches an approval queue
  as "Unnamed member" — and **both names are required**, which is deliberately NOT
  the sign-in gate's rule: this is a stranger asking to reach a children's squad.
  ⛔ **AND THE RELOAD FAULT — THE ONE THING THE SCREEN TURNS ON — LEFT ALL
  SEVENTEEN TESTS GREEN WHEN INJECTED.** Every case that ended with the
  registration section had it LAST, where reloading is correct. Only a run with a
  question AFTER it can see the bug. That case exists now.

- 🔒 **A VOLUNTEER CAN SAY SO, WITHOUT CLAIMING A ROLE THEY DO NOT HOLD.** Jay's
  call from three options while item 5 of the account plan was being designed:
  add `volunteer` to `access_requests`, and KEEP the squad requirement.
  `access_requests` is the only queue for somebody with no squad and it could not
  hold a committee member — the CHECK accepted exactly the five roles describing a
  parent, a player or squad staff — so the only way to file one was to claim a
  role that fits even worse than saying nothing.
  ⚠️ **CLAIMABLE, NOT GRANTABLE.** `memberships.role` still refuses it, so an
  admin approving one chooses what access they actually get. The migration guards
  BOTH directions and aborts if `volunteer` ever reaches `memberships_role_check`
  — `can_see_team` and `can_edit_team` read that table, and a role granting
  nothing is a row each would have to learn to ignore.
  ⚠️ **THE SQUAD REQUIREMENT IS UNTOUCHED** — four days old, added at Jay's
  request, and the reason an admin can tell one waiting stranger from another. For
  a volunteer it means "who to ask about me", so the wording changes and the field
  does not.
  Proved on production in a transaction that rolled back: `volunteer` accepted, an
  invented `chairman` still refused `23514`.
  ❌ **AND A THIRD COPY OF A ROTTED SENTENCE IS CORRECTED.** `AddYourPlayer`'s
  header said `team read` is membership-scoped and its widening migration was
  "written but NOT applied". Measured from `pg_policy`: it is
  `auth.uid() IS NOT NULL`, applied 8 Aug. `RESTORE.md` has been right since
  9 Aug; `RequestAccess`'s identical claim was corrected on 16 Aug, where
  believing it had already cost a SECURITY DEFINER function written and dropped
  the same hour.

- ✨ **TWO NAME BOXES EVERYWHERE A PERSON IS NAMED, not just at sign-up.** Finishes
  the split that shipped its columns on 16 Aug: `PlayerForm`, `MyPlayerForm` and
  `ParentsEditor` all asked for one box, so a coach adding a player could still
  produce the row that started this.
  ⚠️ **THESE THREE WRITE `first_name`/`last_name` DIRECTLY WHERE THE REGISTRATION
  FORM JOINS, AND THAT IS NOT AN INCONSISTENCY.** The join is lossy in one
  direction: `private.sync_person_name` takes the LAST word as the family name, so
  "Anna van der Berg" joined and re-split comes back as "Anna van der" / "Berg".
  Writing both columns takes the trigger's names-win branch. `register_my_player`
  cannot — it takes one `p_full_name` — which is why it still joins.
  ⚠️ **NO CLIENT-SIDE SPLIT OF `full_name`, NOT EVEN AS A FALLBACK.** A one-word
  name is a FIRST name; that rule has been got backwards once already and a second
  copy in JavaScript would be invisible until somebody sorted a roster.
  ⚠️ **THE FAMILY NAME IS REQUIRED, AND GRANDFATHERED ON PLAYERS ONLY** — an
  existing row that arrived without one still saves, because blocking it would
  stop a coach fixing a typo until they invented a surname they may not know.
  Parent rows get no clause: every one has both names, and the two forms are the
  only writers of the table.
  ⛔ **AND THE SUITE WENT GREEN WITH THE MAIN WRITE UNTESTED.** Removing
  `first_name`/`last_name` from `toRow` — which would have sent `full_name` alone,
  re-split wrongly — failed nothing. Every screen test asserts what is handed to
  `saveParents`; nothing looked below that line. The test that catches it is
  against the built insert.

- ✨ **THE INVITE BUTTON ON A PARENT ROW.** The other half of the schema that shipped
  in `31b9ed5`: a contact row is the club's knowledge of an adult written in the
  wrong table, and this turns it into an offer of an account. Lives in
  `ParentsEditor`, so it appears for a coach editing a squad's player and for a
  parent editing their own child in the same change — that pair IS
  `can_edit_team OR is_own_player`, which is why the component holds **no role
  check of its own**.
  ⚠️ **THE TRAP IT CLOSES IS NOT THE ONE THE SCHEMA CLOSED.** `invite_parent`
  reads the address off the ROW, deliberately — an address as a parameter would
  turn "invite this row" into "invite anyone, attached to this row's child". In a
  form that makes a half-edited row dangerous: correct the address, press Invite
  before Save, and the OLD address gets the account while the screen shows the
  new one. Editor rows now carry `savedEmail` beside `email` and the button
  withdraws while they differ. ⚠️ **`savedEmail` IS NOT A DUPLICATE — deleting it
  as one re-opens exactly that.**
  ⚠️ **IT SHOWS A LINK, NOT A SENT EMAIL.** Nothing in this app posts invite mail
  (`InviteForm` has always worked this way), so a button saying "invitation sent"
  would be the only screen promising a mail nobody posted. Jay asked for the
  email; it is written up as item 4b of the plan and needs a Vault secret only he
  can set.
  ⚠️ **AND WHAT IT SAYS AFTERWARDS IS READ OFF THE RETURNED ROW, NEVER GUESSED
  FROM THE PRESSER'S ROLE** — the two disagree for a medic. Pending says it goes
  to the approval queue; active says there is nothing left to queue.

## 16 Aug 2026

- `a50f746` — ✨ **REGISTRATION ASKS FOR A DATE OF BIRTH, AND IT IS REQUIRED.** The field that
  makes `player_private` real — until this the table was correct and empty.
  ⚠️ **A SECOND WRITE, NOT A WIDER RPC.** The player id comes off the membership
  `register_my_player` returns; there is no other way to learn it, because a
  pending parent cannot read `players` by name.
  ⚠️ **A FAILED BIRTHDAY IS NOT A FAILED REGISTRATION.** The child exists the
  moment the first call returns and there is no delete path, so a failure here is
  swallowed rather than surfaced — telling a parent their child was not added
  when it was invites a re-submit, which is how somebody reaches the five-pending
  limit without meaning to.
  ⚠️ **AND THE SUITE WOULD HAVE GONE GREEN WITH THE FIELD UNTESTED.** Adding the
  input meant filling it in ~30 existing cases, every one of which passes whether
  the guard exists or not. Three cases were written for the field itself; the
  blank guard was fault-injected and fails exactly one of them.

- `31b9ed5` — 🔒 **AN INVITE IS NOW WORTH ONLY WHAT THE PERSON SENDING IT COULD ALREADY
  APPROVE.** Schema for the Invite button on a parent row (Jay: *"if the father
  adds the mother for example"*).
  ⛔ **`accept_invite` DID NOT NAME `status` AT ALL** — measured on live, not read
  off the repo — so every accepted invite inherited the memberships default of
  `active`. Harmless while only an admin-only form made invites. A safeguarding
  hole the moment a PARENT could make one: `active` satisfies `can_see_team`, and
  `player read` is squad-wide, so the father typing any address into the contacts
  box would have handed that address every U12 child's name, photo and every
  family's phone number, with nobody at the club checking it.
  ⚠️ **`invites.grant_status` IS A STORED VALUE, NOT A DERIVED RULE.**
  `accept_invite` reads a column instead of growing a second security judgement
  that has to stay in step with the first. Default `active`, so the existing
  admin form is untouched.
  ⚠️ **THE RULE KEYS ON `can_approve_team`, NOT ON "IS THE CALLER STAFF" — AND
  THE DIFFERENCE IS A MEDIC.** Medic is in `can_edit_team` and NOT in
  `can_approve_team`, so a medic may press the button and their invite lands
  **pending**: nobody may grant by the back door what they cannot grant by the
  front one. **The invariant for any future role: nobody can mint an invite worth
  more than they could approve.**

- `aff8a0e` — ✨ **DATE OF BIRTH HAS A HOME, AND IT IS NOT A COLUMN ON `players`.** Jay:
  *"i think we need to have date of birth"* — reversing the standing ruling in
  `src/lib/ageGroup.js` that the club holds no DOBs.
  ⛔ **A COLUMN ON `players` WOULD HAVE PUBLISHED EVERY CHILD'S BIRTHDAY TO
  EVERY PARENT IN THE SQUAD.** `player read` is squad-wide, RLS grants ROWS not
  COLUMNS, and a parent and a coach are the same `authenticated` role — so no
  policy could hide one column from a team-mate's parent. `public.player_grades`
  had already met this and solved it the same way; this is that pattern, second
  use. New table `public.player_private`, policies `can_edit_team OR
  is_own_player` — the same pair `player_parents` runs.
  ⚠️ **NOTHING WRITES TO IT YET.** The registration field and the
  `allowsOwnContact` re-point are the other half. The re-point is deferred on
  purpose: a parent may edit their own child's birthday, so a DOB may only make
  the under-13 contact gate STRICTER, never relax it.

- `f6da486` — ✨ **EVERY NAME IS TWO BOXES NOW.** ⚠️ *This squash carried the
  entry below it as well — one merge, two items.* Jay: *"children name and any other name
  should be two blocks First Name and Last Name, this will stop people only
  putting a first name"*.
  ⚠️ **THE PROBLEM WAS THE INPUT, NOT THE COLUMN.** One column behind one text
  box gets one word, and the live roster carried a child with a first name and
  nothing else. `players` and `player_parents` gain `first_name`/`last_name`,
  reconciled with `full_name` **both ways** by `private.sync_person_name` —
  a deliberate copy of `sync_profile_name`, including its 8 Aug single-word fix,
  so a one-word name becomes a FIRST name and never a last one.
  ⚠️ **NOTHING THAT READS `full_name` CHANGED**, which is the whole point of the
  trigger: around thirty files do.
  ⚠️ **THE BACKFILL DOES NOT GO THROUGH THE TRIGGER**, because the 6 Aug profiles
  backfill ran `set full_name = full_name`, hit the `is distinct from` guard, and
  did nothing while reporting success. This one writes the split columns directly
  and then ABORTS the migration if any row still has a full name and no first
  name.
  ⚠️ **SPLITTING THE FIELD CREATED A LABEL COLLISION THAT DID NOT EXIST BEFORE** —
  a self-registering player's box and the "About you" fieldset both wanted to be
  "Your first name". Resolved by construction: the warm wording is used only when
  the fieldset is absent.

- ✨ **THE SIGN-IN GATE NOW ASKS THE OTHER HALF OF THE QUESTION.** Jay, about a
  real coach with a real account: *"he got through without asking to be
  designated a coach"*.
  ⚠️ **SIGN-UP FORKS TWO WAYS AND EACH DOOR LOSES THE OTHER HALF OF WHO YOU
  ARE.** Take "Add your player" and you get a `parent` membership, and nothing
  anywhere asks whether you also coach. Take "I'm not adding a player" and you
  get a staff role — and since earlier the same day you ARE asked whether you
  have children. Only one door had a mirror.
  ⚠️ **AND THE SIGN-UP SCREEN COULD NOT HAVE FIXED IT.** `AddYourPlayer` renders
  only while `memberships.length === 0`, so once a first child is registered the
  question can never be put there again — which also makes every coach already
  miscategorised unreachable from there. They all meet the gate instead.
  `profiles.no_role_confirmed_at` records the "no" so it is asked once, exactly
  as `no_player_confirmed_at` does; `public.request_staff_role` files a
  **pending** membership for the "yes", because a stranger typing the name of a
  squad must never thereby read that squad's children.
  ⚠️ **THE EXISTING TESTS ALL PASSED WHEN THE STEP WAS ADDED, AND THAT WAS THE
  HARNESS HIDING IT** — the default fixture is an admin, who is correctly never
  asked, so the new branch was unreachable in every case in the file. Plan:
  `claude/plans/2026-08-16-account-creation-redesign.md`.

- `e7e7c38` — 🐞 **"VIEW AS" MADE THE SIGN-IN GATE FORGET YOUR CHILDREN.** Jay, hours after
  the gate shipped, with two sons already linked: *"this has popped up twice in
  my own account… actually, it is specific to when i change viewing as"*.
  ⚠️ **A PREVIEW REPLACES THE EFFECTIVE MEMBERSHIPS WITH ONE SYNTHETIC ROW, AND
  THAT ROW HARDCODES `player_id: null`.** The gate read the effective set, so an
  admin previewing any role looked like somebody with no children — and was
  asked, every time they switched.
  ⚠️ **THE RULE WAS ALREADY WRITTEN DOWN AND I DID NOT APPLY IT.**
  `src/lib/memberships.jsx` states it for the switcher and the banner: gate on
  `realMemberships`. A preview is cosmetic; whether you have a child at the club
  is a fact about you, not about the role you are pretending to be.
  ⚠️ **`playerOnly` HAD THE SAME FAULT** — previewing as a player would have
  exempted an admin from the phone question.
  ⚠️ **AND THE TEST HELPER HID IT**, because it returned one array for both
  `memberships` and `realMemberships`. It now mirrors the provider, which is
  what lets a preview case set them apart.

- `7f86ba3` — ✨ **A WAITING PERSON'S CARD NOW SAYS WHAT THEY ASKED FOR.** The role and squad
  the request form collects since this morning are rendered on the card, so
  "Asked as Coach · U14B" appears instead of a bare address.
  ⚠️ **AND THE OTHER HALF OF THE PLAN COULD NOT WORK, WHICH THE TEST FOUND.**
  The intent was also to show a self-registered parent's squads and children,
  on the strength of production data showing exactly that on their PENDING
  membership rows. It can never render: `unattached` in Accounts.jsx subtracts
  every profile holding ANY membership row, pending included — so such a person
  is not in "Waiting for access" at all. They are in **Pending approvals**, which
  already names the child, the squad and the adult who added them.
  ⚠️ **SO THE FEATURE WAS DELETED AND A TOMBSTONE TEST PUT IN ITS PLACE**, with
  a note at the subtraction. The mistake is easy to repeat: the data genuinely
  exists, on a person who genuinely is waiting, on a screen that genuinely
  cannot show them.
  ⚠️ **A REQUEST MADE BEFORE THIS MORNING RENDERS NOTHING RATHER THAN A BARE
  "Asked as"** — seven of them predate the columns, and an empty label reads as
  a rendering fault, which is worse than the silence it replaced.

- `cff3c7e` — 🐞 **NOTICES NOW APPEAR WITHOUT A REFRESH.** Jay: *"notices are not appearing
  instantly on home screen, they only show up when i click refresh… if i don't
  hit refresh they never show up"*. Home fetched once on mount and had no
  subscription; the token added earlier only covered a notice you posted
  yourself, so one posted by anybody else never arrived.
  ⚠️ **THE CLIENT WAS NEVER THE HARD PART, AND THIS REPO HAD ALREADY PAID TO
  LEARN THAT.** `announcements` was not in the `supabase_realtime` publication —
  measured before writing a line, and the publication held exactly ONE table.
  A `subscribeNotices` written on its own would have reproduced
  `subscribeEvents`' own documented bug precisely: correct-looking code, a
  socket open and silent, no error anywhere. Both halves shipped together.
  ⚠️ **NO SERVER-SIDE FILTER, AND THE OBVIOUS OPTIMISATION IS A BUG.**
  `announcements` is replica identity DEFAULT — confirmed on production — so a
  DELETE payload carries the primary key only. A `team_id` filter would match
  nothing on a delete and a notice taken down would stay on everybody else's
  screen. RLS already scopes delivery.
  ⚠️ **THE BOARD SUBSCRIBES TOO, not just Home** — /notices is the screen
  somebody came specifically to read them on, so silence there is the more
  misleading of the two.

- `52fa234` — ✨ **THE SIGN-IN GATE NOW ASKS FOR A PHONE, AND WHETHER YOU HAVE A PLAYER.**
  Jay: *"force people to fill out their full name and phone number… also force
  them to add a player or confirm again 1 time they don't have a player"*.
  ⚠️ **THE NAME HALF WAS ALREADY WORKING, AND MEASURING SAID SO BEFORE ANYTHING
  WAS BUILT.** Of 27 profiles: 1 with no name, 0 that had confirmed a blank one
  — the gate has no hole — against **14 with no phone**. The "Unnamed member" Jay
  saw is somebody who has not signed in since; `NamePrompt` will stop them next
  time. So the phone and the player question were the real gaps.
  ⚠️ **"1 TIME" IS WHY THERE IS A NEW COLUMN.** `profiles.no_player_confirmed_at`
  records the answer, so a coach with no children at the club is not asked at
  every sign-in forever — which is how a gate becomes something people dismiss
  without reading.
  ⚠️ **THE COLUMN GRANT IS THE PART THAT WOULD HAVE FAILED SILENTLY.**
  `authenticated` holds UPDATE on `profiles` for five NAMED columns; RLS grants
  rows, column privileges grant columns, and a policy permitting the row says
  nothing about a column nobody was granted. Granted in the same migration —
  the trap `memberships.title` already documented, met a second time and seen
  coming.
  ⚠️ **A PLAYER-ONLY ACCOUNT IS ASKED NEITHER.** Not for a phone, because this
  app already refuses to let an under-13 hold their own contact details, and a
  gate demanding one from a child is the app arguing with its own safeguarding.
  Not to add a player, because it IS the player.
  ⚠️ **AND ONE OF THE NEW TESTS FAILED AGAINST A CALL A DIFFERENT TEST MADE.**
  `tests/name-prompt.test.jsx` resets its mocks BY NAME rather than with
  `vi.clearAllMocks()`, so a newly added mock keeps its call count across cases.
  The component was right and the harness was wrong, which is the more expensive
  way round.

- `811745a` — 💄 **THE STAFF SCREEN IS AN INDEX THAT EXPANDS.** Jay picked this from three
  options built in the harness — C, opening in place like B. Every squad is one
  row: name, the jobs present, overlapped monogram bubbles, and a **Gap** chip
  where nobody is attached. Tapping unfolds that squad's people underneath, and
  several may be open at once.
  ⚠️ **THE SHAPE FOLLOWS WHAT THE SCREEN IS USUALLY LOOKING AT.** Most squads
  have nobody attached, so a card each was a page of near-identical empty boxes
  to scroll past. Collapsed, every squad fits on one screen and the gaps are what
  stands out — which is what the summary line has always led with.
  ⚠️ **SEVERAL OPEN AT ONCE, DELIBERATELY.** The task is a sweep; an accordion
  that shuts the last squad makes comparing two of them impossible.
  ⚠️ **EDITING STAYED VISIBLE.** This screen is an EDITOR — title field and photo
  uploader per person — and the Home contacts card it borrows its look from is
  read-only. Moving those behind a second tap would have been prettier and worse.
  ⚠️ **THE SUMMARY NOW READS THE TITLE, NOT THE ROLE** — Jay: *"should be Head
  Coach, Assistant Coach, Team Manager, Medic"*. The role is the permission
  (`coach`); the title is the job, and a squad with a head coach and an assistant
  reads as "Coach · Coach" if you summarise by role.
  ⚠️ **AND "Physio" BECAME "Medic" IN `STAFF_TITLES`, OVERTURNING A RULING** that
  deliberately left medic without a title of its own. The repetition it avoided
  is invisible; the cost was that the only medical suggestion on offer was a word
  this club does not use.

- `f910037` — ✨ **ACCOUNTS CAN BE VIEWED BY TYPE.** Jay: *"we need to be able to view
  accounts by type, Parent/Player, Coach, Manager, etc"*. A chip row above the
  list — Everyone, then one per role somebody actually holds, each carrying its
  count.
  ⚠️ **THE COUNTS ARE PEOPLE, NOT MEMBERSHIP ROWS**, and that is the whole
  correctness question here. `memberships` has no unique constraint, so a coach
  who also has a child holds two rows and is ONE person; counting rows would put
  a number on the chip that the list beneath it could never match. Verified in a
  real browser: every chip's number equals the rows it produces.
  ⚠️ **SOMEBODY WITH TWO ROLES APPEARS UNDER BOTH**, which is correct rather
  than duplication — filtering to the first role found would hide a coach from
  the coach list.
  ⚠️ **THE HEADER COUNT DOES NOT MOVE.** "N with access" is a fact about the
  club, not about the filter; a number that changed on every tap is a counter
  people stop believing.
  ⚠️ **AND THE APPROVAL QUEUE IS NEVER FILTERED.** Asking who the coaches are is
  not asking to see fewer people waiting to be let in, and a pending request
  hidden behind a chip is how one sits unnoticed for a week.
  ⚠️ **NO CHIP FOR A ROLE NOBODY HOLDS, AND NO ROW BELOW TWO KINDS** — the same
  rule Schedule, Roster and Notices follow: a single pill that cannot change
  anything is furniture.

- `ff112f8` — ✨ **AN ACCESS REQUEST NOW SAYS WHO IS ASKING AND FOR WHICH SQUAD.** Jay: *"i
  still have account requests coming in and have no idea who they are because
  they don't type any extra info"*. A required role and a required age group,
  with the free-text note kept for the rest.
  ⚠️ **AND THE REASON IT WAS FREE TEXT TURNED OUT TO BE FALSE.**
  `RequestAccess.jsx` stated that every SELECT policy bottoms out in a
  memberships row, so this user "reads zero rows from every table including
  teams" — and a whole SECURITY DEFINER RPC was written on the strength of that
  sentence before anybody checked it. **The `team read` policy is
  `auth.uid() IS NOT NULL`: any signed-in caller reads every squad.** Measured on
  production — 15 teams against 0 players, 0 memberships and 0 events for the
  same impersonated user, which is the control proving RLS was applied rather
  than bypassed. The function was created, measured and dropped the same hour;
  the form reads `teams` directly. **The claim in that header is corrected rather
  than deleted** — it was load-bearing, it is why the form had no picker for a
  fortnight, and it still holds for every other table on that screen.
  ⚠️ **THE INSERT POLICY IS THE GATE, NOT THE `<select>`.** A required dropdown
  means somebody finds out before they press the button; the policy is what makes
  a blank request impossible to file.
  ⚠️ **AND THE MIGRATION IS DELIBERATELY IN TWO HALVES, IN A FIXED ORDER.**
  Columns and RPC first (additive, safe against the running app), then the form
  deploys, then the policy tightens. Landing the policy with the columns would
  refuse every signup in between — a stranger trying to join the club told, in
  effect, that they are not allowed, with nothing on screen to explain it.
  ⚠️ **FOUR MOCKS AND A HARNESS STUB HAD TO GAIN THE NEW EXPORT**, and an
  unmocked one is `undefined` — called in an effect, it throws before anything
  renders, so the whole file goes red at once. `tests/harness-stubs.test.js` caught
  its half, the fifth time that guard has earned its keep.

- `1611380` — 🗄️ **THE SQUADS LOST THEIR " Contact" SUFFIX — a live data change, applied to
  production.** Jay: *"we need to remove the word contact from age groups that
  have it, its implied already"*. Ten of fifteen squads carried it; U6-U8 Tag and
  the two QR squads are untouched, because Tag is the distinction the word was
  ever making. `db/migrations/20260816_squad_names_drop_contact.sql`.
  ⚠️ **DATA, NOT DISPLAY, AND THAT WAS THE CHOICE.** `teams.name` is the single
  source — `information_schema` shows no other text column in `public` holding a
  squad name. Stripping it in the UI would have left the database saying one
  thing and every human seeing another.
  ⚠️ **EVERY CLASSIFIER WAS PROVED UNCHANGED BEFORE IT RAN**, not reasoned about:
  all ten squad-name predicates in `src/lib` run against all fifteen names, before
  and after. Identical. They read the leading `U`+digits for the band and the
  letter TOUCHING those digits for gender — never the words "Contact" or "Tag".
  The only differences were the squad name inside user-facing message text, which
  is the point.
  ⚠️ **ANCHORED `\s+Contact$`, NEVER `replace(name,'Contact','')`**, and the
  migration raises if any row is left carrying the suffix.

- 💄 **"View team list" is now "View roster" on Home**, and it is sentence case
  because that is the app's convention — measured, not assumed: the only Title
  Case strings in `src/` are proper nouns ("Club Youth Manager", "Google
  Calendar", "Quins Club Hub"). Jay asked whether the lowercase was deliberate;
  it is, and he kept it.

- 🧪 **THE DASHBOARD TEST FIXTURES CARRIED NO `status`, SO THEY WERE GREEN FOR
  THE WRONG REASON.** `canPostNotice` mirrors `private.can_edit_team` and needs
  an active status, so every Quick actions assertion passed while never
  exercising the post button that card had just gained. **Third place the same
  gap appeared in one day**, after the "view as" synthetic row and the harness
  fixtures. A fixture that does not match a real row does not simplify a test; it
  quietly narrows it.

- `55a7a00` — 💄 **THE POST ACTION MOVED INTO QUICK ACTIONS, AND HOME NOW DRAWS THE SAME
  NOTICE CARD AS /notices.** Three corrections to the same afternoon's work,
  all reported by Jay against the live site.
  ⚠️ **The first placement sat between the noticeboard and the next fixture** —
  the one piece of vertical space Dashboard's own comments defend hardest. It is
  in the Quick actions card now, and it LEADS that card: the two buttons below it
  go to Schedule and Roster, which are also tabs on the bottom nav, so the item
  with no other route belongs above the two with one.
  ⚠️ **`full` on More was wrong** — a stretched button read as the card's primary
  action when the card's primary action is the LINK above it. Home keeps `full`,
  because there it sits in a stack of full-width buttons. Same component; the
  caller decides.
  ⚠️ **AND HOME HAD ITS OWN NOTICE RENDERING, WHICH IS THE REAL LESSON.**
  `NoticeBoard` carried a terser `NoticeItem` on the theory that Home points at
  the board rather than being it. The moment the board's card was redesigned, one
  notice looked two ways — *"it doesn't look like how the same notice looks in the
  notice section"*. The terser version is DELETED rather than restyled to match:
  restyling keeps the mechanism and drifts again at the next change. This is the
  third time today one thing has been rendered twice.
  ⚠️ **THE HARNESS FIXTURES HAD THE SAME MISSING `status` THAT CAUSED THE
  ORIGINAL BUG.** Ten membership literals in `harness/main.jsx` carried no
  status, so the harness could not render the post button at all and quietly
  showed less than the app does. Fixed, and it is the same shape of fault as the
  "view as" row — a fixture that does not match a real row hides the thing it was
  built to reveal.

- `1c67b5b` — 🐞 **A "VIEW AS" PREVIEW COULD NOT POST A NOTICE, AND THE BOARD LOOKED EMPTY.**
  Jay, previewing as a coach: *"i don't see the ability to post a notice for
  comms, the link takes me to a page with nothing there"*. `syntheticMemberships`
  built a row with role, team_id, player_id and club_id — the fields `scope.js`
  reads — while `src/lib/notices.js` mirrors `private.can_edit_team` more closely
  and requires `status === 'active'`. Against a row with no status,
  `canPostNotice` returned false and the button did not render.
  ⚠️ **IT SURVIVED BECAUSE IT FAILS SILENTLY.** A preview quietly holding fewer
  rights has no error path, and the noticeboard has no rows yet, so "nothing
  there" read as "nothing posted".
  ⚠️ **EVERY EXISTING TEST PASSED AN EXPLICIT `status`**, which is exactly why
  they stayed green. The shape never exercised was a row without one — now a
  tombstone test, because the fix belongs on the ROW and not on the predicate:
  the database checks `status = 'active'`, so a lenient client would offer a
  composer the database refuses.

- ✨ **POSTING A NOTICE IS NO LONGER A PLACE YOU GO.** Jay: *"need the ability to
  post the comm from the more screen, not a seperate screen"*, then Home as well.
  New `PostNoticeAction` opens the composer in place on both; the composer itself
  moved out of the screen into `src/components/NoticeComposer.jsx` because one
  behaviour in three places is three copies that drift.
  ⚠️ **IT RENDERS NOTHING FOR SOMEBODY WHO MAY NOT POST**, which is what makes
  the Home placement survivable — Dashboard's own note forbids pushing the hero
  down on an ordinary week, and for a parent nothing changes at all.

- 💄 **THE NOTICE CARD WAS BLAND AND NOW LEADS WITH THE PERSON.** Jay: *"i don't
  like how the notice looks, too bland"* — shown three treatments and picked a
  combination. Monogram tile, author and role lead; a coloured edge stripe and an
  audience mark carry club-wide (red) against squad (green); the title is bigger
  and the body has room.
  ⚠️ **COLOUR IS NEVER THE ONLY CHANNEL** — the audience is also a word on the
  chip and a drawn mark, so a colour-blind reader loses nothing.
  ⚠️ **THE CARD SHOWED NO TIME AT ALL**, which is much of why it read as
  system-generated. `created_at` was already selected and already ordered the
  list; `postedLabel` now renders it, relative for a week and an absolute club-time
  date after that.
  ⚠️ **THE FIRST DRAFT USED EMOJI AND THAT IS BANNED** — `design-system.md` says
  100% inline SVG, no emoji, and this app already ships SVG flags because Windows
  renders emoji flags as two letters.
  ⚠️ **AND THE SCREEN HAD NO HARNESS SCENARIO AT ALL**, which is how a bland card
  shipped unreviewed: it reads three tables, so it was only ever reviewed as JSX.
  `NoticeRow` is now a pure-props component with its own scenario in the overflow
  gate.

- `29cff96` — ♻️ **THE MATCH SHEET IS NEVER TYPED ON, AT ANY WIDTH — AND THE PNG IS NOW
  IDENTICAL BY CONSTRUCTION.** Jay: *"make the facsimile a preview at every
  width"*. The width-dependent editor added hours earlier meant TWO renderings of
  a document whose only job is to be photographed and sent, and they had already
  drifted 25px. Deleting the editable branch deletes the drift: **measured
  1720×2182 from a 375px viewport and 1720×2182 from a 1400px one**, with the
  photographed block byte-identical (`innerHTML` equal, same table heights).
  ⚠️ **AND `useMediaQuery` WENT WITH IT.** The hook, the 900px query and the
  `preview` prop threaded through eleven call sites are all gone; `Cell` takes a
  value and nothing else. **Do not put an input back on the form** — typing on
  the paper is pleasant on a laptop, and the price is a governing body receiving
  two different documents depending on what the coach was holding.
  ⚠️ **THE 22 GO TWO-UP ON A WIDE SCREEN VIA A `desktop:` CLASS, NOT THE HOOK**,
  which is the distinction `src/lib/useMediaQuery.js` draws: same DOM, same
  order, two columns. Duplicated CONTENT needs JS; presentation does not, and
  there is no duplicated content left.
  ⚠️ **A TEST NOW ASSERTS ITS OWN OPPOSITE.** The case that pinned "a wide screen
  puts the inputs back on the form" is replaced by one pinning that the form
  holds no controls at any width, plus a DOM-equality check across both branches.

- `60e6005` — 📓 **THE MATCH SHEET'S "NEVER EXERCISED" ITEM WAS ABOUT TO MISLEAD.**
  Still true that no coach has filed one for a real match — but the sheet had by
  then been opened and shared from a phone, and three bugs fell out and were
  fixed, so `open-items.md` would have sent the next session hunting for bugs
  that no longer exist. Also cited `d576bb1`, and recorded the `shareImage.js`
  desktop-download observation as an open item rather than fixing it unprovoked.

- `0a4525f` — ✨ **THE MATCH SHEET IS FILLED IN OFF THE FORM ON A PHONE.** The fixed-width fix
  earlier today made RCM's facsimile LEGIBLE on a phone and left it awful to FILL
  IN — 22 names into 40px boxes, scrolling sideways, standing at a pitch. Jay:
  *"i think we should go with the stacked mobile version"*. Below 900px every
  value is typed in a new `MatchSheetEntry` and the facsimile becomes a PREVIEW of
  what Share sends; at 900px and above the paper fits and nothing changes.
  ⚠️ **RENDERED, NOT CSS-HIDDEN, AND `src/lib/useMediaQuery.js` ALREADY SAID WHY.**
  Both branches emit the same fields, so a `hidden` class would leave two of
  everything in the DOM and `getByLabelText('Player 1')` would match twice — the
  roster hit this exact wall first.
  ⚠️ **THE LABELS ARE IDENTICAL ACROSS THE TWO BRANCHES, AND THAT IS THE DESIGN.**
  jsdom has no `matchMedia`, so the whole suite runs the phone branch — and every
  pre-existing match-sheet test passed untouched, because they query names rather
  than layouts.
  ⚠️ **THE PREVIEW IS NOT PIXEL-IDENTICAL TO THE PAPER AND THE NUMBER IS WRITTEN
  DOWN: 1090px against 1115px, 2%, one to four pixels across ~20 rows.** Same
  columns, same content, nothing clipped — the spans grow with their text. It is
  recorded rather than rounded off because the bug this screen was fixed for this
  morning was a form 501px too wide, and the way that stays away is treating a
  growing number as a regression.
  ⚠️ **TWO TRAPS FOUND BY MEASURING RATHER THAN REASONING.** A `disabled` checkbox
  is greyed by every browser, so the obvious way to make the preview inert would
  have reintroduced a phone/laptop mismatch by the back door — `pointer-events-none`
  plus `tabIndex={-1}` renders identically. And the FR tap target was 34×60: tall
  enough, too narrow, which is the easy half of the 44px floor to pass and the easy
  half to miss.

- `d576bb1` — 🐞 **THE MATCH SHEET WAS UNREADABLE ON A PHONE, AND THE SHARED IMAGE WAS THE
  SAME BUG, NOT A SECOND ONE.** Jay shared a sheet from his phone and it arrived
  mangled — "COMPETITION" printed over the competition's name, HOME TEAM and
  FINAL SCORE wrapped and clipped. Nothing was wrong with the share. The
  facsimile's first row is a single `colSpan={8}` instruction strip, so
  `table-fixed` divides the width into EIGHT EQUAL COLUMNS: 103px each at
  desktop, where it is perfect, and ~40px at 375px, where "COMPETITION" is one
  unbreakable word half again wider than its cell. html2canvas photographs the
  screen, so the phone's broken layout is what reached WhatsApp.
  **Fixed by taking the viewport out of it**: a fixed `w-[860px]` inside an
  `overflow-x-auto` wrapper (Jay chose scroll-and-pinch over shrink-to-fit).
  ⚠️ **MEASURED, NOT ASSUMED: the PNG from a 375px viewport is now 1720×2230**
  — 860 × the `scale: 2` — i.e. byte-for-byte the shape a laptop produces.
  ⚠️ **THE WRAPPER IS LOAD-BEARING AND THE FAULT INJECTION PROVED IT.** Strip
  `overflow-x-auto` and the DOCUMENT goes to 876px at a 390px viewport, which is
  the failure `harness/check-overflow.mjs` exists to catch and which breaks the
  masthead three layers away. All five of that gate's widths measured clean.

- 🐞 **THE AWAY TRIES HAD NO BOX.** The number was printed inside the "TRIES"
  heading — "TRIES 5" — while the row's eighth column went to an empty spacer,
  so the two halves of a symmetric form were not the same shape. Eight cells,
  four pairs, both sides identical.

- ✨ **THE 22 NOW COME FROM THE LINEUP.** Jay: *"names are not auto populating
  into them"* — they never had. The sheet's only help was the `squad-players`
  datalist, a typeahead you discover by starting to type, on a phone, at the
  side of a pitch, while `lineups` already held exactly who played. Blank rows
  fill from the fixture's lineup on open, starters first then replacements;
  a two-step **Refill** re-pulls a lineup changed after the sheet was started.
  ⚠️ **SEQUENTIAL, NOT 1-15 AND 16-22.** `players_per_side` is the coach's
  choice per lineup, so a squad playing 10s would file a form with five blank
  rows in the middle of it.
  ⚠️ **AND FR IS NEVER TICKED FOR THEM.** Front row cover is a SAFETY
  declaration; a lineup records positions, which is a different question. The
  screen says so out loud rather than leaving a coach to assume it carried over.

- `dceb2eb` — 📓 **`state-of-play.md` STILL SAID "NO MONITORING EXISTS AT ALL".** It is
  reading-order step 3, so the highest-traffic file after `CLAUDE.md` was telling
  every new session something that had been false for hours. Corrected, and Jay's
  position on the staff-attachment item recorded — *it resolves as staff sign in,
  it is not blocking* — so the next session stops raising it as the top priority.
  ⚠️ **The file went to 81 lines, one over its own stated ceiling**, and was
  trimmed rather than excused; the detail belongs in the runbook.

- `d4c06af` — 🐞 **SENTRY IS LIVE, AND THE LAZY LOAD HOLDS ON THE REAL BUNDLE.** DSN added in
  Netlify and the site rebuilt, EU region. Proven by firing an unhandled rejection
  on the live site: the SDK chunk loaded on demand, POSTed to the ingest endpoint,
  got **200**, and the issue appeared in Sentry.
  ⚠️ **THE MEASUREMENT THAT MATTERS: the entry chunk grew 0.3 KB** — 259.6 →
  259.9 KB gzip — while the 159.3 KB SDK sits in its own chunk fetched only on a
  crash. **Count `captureException` in the entry to check this: 1 is our call
  site, 11 would be the SDK**, and 11 means somebody has "tidied" the dynamic
  import into a top-level one and every phone is paying for it.
  ⚠️ **AND OUR OWN IGNORE GATE NEARLY SWALLOWED THE DEPLOY.** The last commits
  were docs-only, so `scripts/netlify-ignore.mjs` would have CANCELLED a normal
  "Deploy project" — the env var never baked in, nothing visibly wrong. Predicted
  before clicking by running the gate with the real refs (exit 0 = skip), and
  **Deploy project without cache** used instead, which the gate always builds.
  A redeploy after an env-var change is exactly when this trap fires.
  ⚠️ **STACK TRACES ARE MINIFIED — SEEN, NOT PREDICTED.** The smoke-test issue
  reads `?(<anonymous>)` as its location. No source maps are uploaded, so an error
  gives the message, page, browser and affected count, but no file and line. The
  trigger for adding them is the first real error nobody can place; it costs a
  build secret and a Vite plugin.

- `cf2ebae` — 🔎 **AN UNKNOWN CALENDAR TOKEN GETS A CALENDAR, NOT A 404 — and two changelog
  entries above this one say otherwise.** Found by accident: a monitoring drill
  was about to be built on a made-up token, on the assumption it would fail. It
  returns **200 with a valid, EMPTY calendar** (254 bytes, zero events).
  ⚠️ **THE CAUSE IS A FILTER, NOT A GUARD.** `calendar_events_for_token` selects
  events `where exists (… calendar_tokens … memberships …)`, so a token nobody
  holds makes that EXISTS false for every row and the RPC returns an EMPTY SET
  rather than raising. The edge function then builds a well-formed calendar out
  of nothing.
  ⚠️ **THE CORRECTION.** Entries below claim the function "returns the same 404
  whether the token is missing or Supabase is unreachable". It does not. A
  missing or malformed token is refused on SHAPE with 404 before Postgres is
  touched; an RPC failure returns **503**; an unknown-but-valid token returns 200.
  The CONCLUSION drawn from the wrong reason still holds — a tokenless probe
  cannot see a database outage — but only because it never reaches the database
  at all. The full table is now in `RESTORE.md`.
  ⚠️ **THE CONSEQUENCE WORTH A DECISION**: `reset_my_calendar_token` exists, so
  when somebody resets their token the OLD subscription in their phone keeps
  succeeding — 200, valid calendar, no events, forever, with no error a calendar
  app could show. Right for privacy, silent for a legitimate person who mistyped
  or reset. Left as-is pending Jay; changing it to 404 would tell a prober which
  tokens exist.

- `f4f3973` — 🟢 **MONITORING IS ACTUALLY ON — two Better Stack monitors, live, 16 Aug 2026.**
  `https://adhquins-clubhub.com/` and the calendar feed at
  `/calendar.ics?token=…`, both 3-minute checks with e-mail alerts. Set up in
  Jay's own browser with him watching. ✅ **E-mail delivery proved on the spot**
  via *Send test alert*.
  ⚠️ **AND THE RUNBOOK'S CENTRAL INSTRUCTION WAS WRONG UNTIL THE SIGNUP SCREEN
  DISPROVED IT.** It said to use a keyword monitor asserting `BEGIN:VCALENDAR`.
  On Better Stack the *Alert us when* dropdown carries a **Billable** badge —
  keyword and status-code options are visible but **not on the free plan**, and
  selecting one risks moving the account to a paid tier. It was not selected.
  **That recommendation had been written from research rather than from the
  product**, which is the same failure as the Sentry bundle-size estimate the
  day before: a claim made confidently about a thing nobody had opened.
  ⚠️ **THE RESULTING GAP IS ONE CASE, AND IT IS NAMED RATHER THAN PAPERED OVER**:
  if the `/calendar.ics` proxy rule were deleted from `netlify.toml`, the path
  falls through to the SPA catch-all and answers 200 with the app's HTML —
  monitor green, every calendar subscription in the club dead. Everything else is
  caught, because the monitor carries a REAL token and the feed only answers 200
  when it genuinely built. Not worth swapping provider for: UptimeRobot's free
  tier has keyword monitors but is personal/non-commercial only, and StatusCake
  deactivates accounts idle for 90 days.
  ✅ **AND THE DRILL WAS ACTUALLY RUN, WHICH IS THE WHOLE POINT.** The live site
  was disabled for **4m 15s** (09:44:04 → 09:48:19 UTC) on Jay's say-so. Both
  monitors opened an incident at **09:44** — *"Status 404"* — the e-mail alerts
  arrived, and the incidents auto-resolved by 09:52. Restoration was under a
  second.
  ⚠️ **DETECTION WAS UNDER A MINUTE, NOT THE THREE THE CHECK INTERVAL IMPLIES.**
  Written down so nobody later "fixes" the frequency from the setting rather than
  from the measurement.
  ⚠️ **AND THE NETLIFY CONTROL IS NOT CALLED "PAUSE"** — it is **Project
  configuration → General → Danger zone → Disable project**, with `Delete this
  project` immediately below it in the same panel and no undo on that one.

- `bca0e02` — ✂️ **THE MONITORING WORK WAS CUT BACK — Jay: *"i just want simple, not over
  engineered"*.** He was right, and the over-engineering had a single root: a
  self-imposed rule that the monitor must not hold a calendar token.
  ⚠️ **THAT ONE CONSTRAINT PRODUCED ALL OF IT.** Without a token
  `/calendar.ics` returns 404, so the monitor had to be configured to treat 404
  as healthy — an assertion that reads as a misconfiguration to anyone who later
  sees it, that ruled out most free tiers (UptimeRobot puts custom status codes
  behind the Pro plan), and that needed two pages of prose to justify. **And it
  bought a WEAKER check**: the edge function deliberately returns the same 404
  whether the token is missing or Supabase is unreachable, so the monitor stayed
  green through a total database outage.
  ⚠️ **THE ORDINARY VERSION IS STRICTLY BETTER.** The monitor now carries Jay's
  OWN token and expects a plain 200 with a `BEGIN:VCALENDAR` keyword — which
  catches the database case as well, needs no exotic provider, and looks like
  what it is. The token exposes fixtures for squads he can already see, which
  this repo has long treated as not sensitive.
  ⚠️ **AND THE SCRIPT WAS DELETED, NOT KEPT "JUST IN CASE".** `live-check.mjs`
  was written for the tokenless design; with two monitors running it checked
  nothing they do not. `docs:check` caught the dangling path references on the
  way out, which is the check working.
  **Kept:** the Sentry work, which is genuinely small, and the runbook, now a
  third of its length.

- `4ec95c3` — 🐛 **ERROR TRACKING, LOADED ONLY ONCE SOMETHING HAS ALREADY GONE WRONG.**
  `src/lib/errorReporting.js`, wired into `ErrorBoundary.componentDidCatch` and
  into `main.jsx`. Jay picked the lazy-load option of the three in
  `claude/runbooks/monitoring.md`.
  ⚠️ **AND THE NUMBER THAT DECISION WAS PRESENTED ON WAS WRONG BY FIVE TIMES, IN
  THE DIRECTION THAT MAKES THE CHOICE MORE RIGHT.** The options said
  `@sentry/react` costs "25-30 KB gzip, about 11%". **Measured after installing
  it: 482 KB raw / 159 KB gzip — +61% against a 260 KB main bundle.** Loading it
  normally was never the modest option it was described as. The estimate was a
  recollection dressed as a measurement, which is exactly what this repo keeps
  being bitten by; the correction is in the runbook and in `open-items.md`.
  ⚠️ **MEASURED BOTH WAYS, BECAUSE "IT IS LAZY" IS A CLAIM ABOUT THE BUILD.**
  With `VITE_SENTRY_DSN` unset the entry chunk is 259.6 KB gzip and **no Sentry
  code is emitted at all** — `import.meta.env` is substituted at build time, so
  `if (!DSN) return` makes the dynamic import unreachable and Rollup drops it;
  `captureException` is absent from `dist/`. With a DSN set the entry chunk is
  259.8 KB — plus 0.2 KB for the call site — and the SDK goes to its own chunk.
  ⚠️ **THE GLOBAL HANDLER IS NOT REDUNDANT WITH THE BOUNDARY, AND WITHOUT IT THIS
  WOULD HAVE BEEN NEARLY POINTLESS.** An error boundary catches errors thrown
  during RENDER and nothing else — a rejected Supabase call never reaches one, and
  in this app that is where the failures are. A failed `<img>` is deliberately
  NOT reported: `window.onerror` fires for those with a null `error`, and they
  are how an error tracker fills with other people's ad-blocker noise.
  ⚠️ **IT SENDS NOTHING UNTIL JAY SETS `VITE_SENTRY_DSN` IN NETLIFY AND A BUILD
  RUNS** — `VITE_*` is substituted at build time, so adding the variable alone
  changes nothing. Two faults injected and both caught.

- `7bb870d` — 📡 **THE MONITORING ASSERTIONS ARE WRITTEN DOWN AND RUNNABLE, AND ONE OF THEM
  IS THE OPPOSITE OF WHAT ANYBODY WOULD CONFIGURE.** `npm run check:live`
  (`live-check.mjs` (deleted 16 Aug 2026), no dependencies, no credentials) plus
  `claude/runbooks/monitoring.md`. The accounts are still Jay's and still
  uncreated — this is the half that did not need one.
  ⚠️ **A `/calendar.ics` MONITOR EXPECTING 200 IS GREEN EXACTLY WHEN THE CALENDAR
  FEED BREAKS.** Measured against production: unauthenticated, that path returns
  **404 `text/plain`** — the Netlify rule proxies it to the edge function, which
  refuses a missing token, and that is the healthy state. If the proxy rule were
  ever lost the path would fall through to the SPA catch-all and return **200
  `text/html`**: every calendar subscription in the club silently broken, and a
  naive uptime check reporting success. So healthy is 404 and the failure
  signature is 200. `open-items.md` half-caught this — it said to assert
  `text/calendar`, which is right for a request carrying a token and wrong for a
  monitor, because a monitor must not hold one: a calendar token grants access to
  a family's fixtures.
  ⚠️ **THE CHECK CARRIES ITS OWN CONTROL**, because "not the SPA catch-all" would
  otherwise pass for the wrong reason if the whole site were down — a known-bogus
  path must still return the catch-all for the calendar assertion to mean
  anything. Proved by pointing the checker at a local dev server, which has SPA
  fallback and no Netlify proxy: the two calendar assertions failed with the
  right message while the control passed.
  ⚠️ **AND IT CRASHED INSTEAD OF FAILING — EXIT 127, NOT 1.** `process.exit(1)`
  tears the loop down while undici still holds a keep-alive socket, tripping a
  libuv assertion on Windows/Node 24. A CI job would have reported a broken
  script rather than a failed check, which is the fastest way to get a check
  ignored. Fixed with `process.exitCode` and `connection: close`; both exit codes
  then measured, 1 and 0.
  ⚠️ **A GREEN CALENDAR CHECK CANNOT SEE A DATABASE OUTAGE**, deliberately: a
  non-uuid token is rejected by shape before Postgres is touched, and the
  function returns the same 404 for "no such token" as for "database down"
  because distinguishing them hands a token-guesser an oracle.
  **Sentry is NOT wired in and that is a decision waiting on Jay** — the main
  bundle is 260 KB gzip and `@sentry/react` adds ~11%. Three options are set out
  in the runbook; `ErrorBoundary.componentDidCatch` already has the hook.

## 15 Aug 2026

- `4945f5c` — 🧹 **A DELETED PLAYER'S PHOTOGRAPH USED TO OUTLIVE THEM, AND NOW SOMETHING
  COUNTS THE ONES THAT SLIP THROUGH.** Found while clearing five orphans by hand
  after the positioner bug: `deletePlayer` removed the row and left the file, and
  account deletion did the same. Both now delete the object.
  ⚠️ **A STORAGE OBJECT CANNOT BE A CASCADE, AND THAT IS NOT A DESIGN CHOICE.**
  `storage.objects` refuses direct SQL deletion outright — a `protect_delete`
  trigger raising 42501 — so no trigger, cascade or database function can reach
  one. `delete_my_account` could not clean up after itself if it wanted to. The
  Storage API is the only route, which means a CLIENT has to do it.
  ⚠️ **AND THE TWO PATHS ORDER THEMSELVES OPPOSITELY, WHICH LOOKS LIKE AN
  INCONSISTENCY UNTIL YOU TRY IT THE OTHER WAY.** `deletePlayer` deletes the row
  first, so a failed cleanup leaves a recoverable orphan rather than a live row
  pointing at a missing file. Account deletion CANNOT: the RPC destroys the
  session, and the storage policy authorises by `auth.uid()`, so afterwards
  nobody is permitted to remove the file. It is now or never. Pinned by a test
  asserting the call order, because it is exactly the kind of thing a later
  reader tidies into the house pattern.
  ⚠️ **THE NIGHTLY SCAN REPORTS AND DOES NOT DELETE — Jay's call, 16 Aug 2026**,
  taken over an auto-sweeping version on one fact: `staff-photos` is mirrored
  NOWHERE (`backup-player-photos` pins `SOURCE_BUCKET = 'player-photos'`), so a
  scheduled delete there has no safety net and a bug that wrongly cleared
  `photo_path` would become permanent loss, on a timer, unwatched. Counting is
  reversible. **Do not "finish" it by adding a delete.**
  ⚠️ **THE 24-HOUR GRACE PERIOD IS LOAD-BEARING EVEN FOR A COUNTER.** An upload
  and the row write that records it are not atomic, so an object seconds old with
  nothing pointing at it is a photo mid-save. Measured on live: only one staff
  object is currently older than a day, so without the grace period the very
  first run would have reported a bucket full of orphans.
  ⚠️ **APPLIED TO PRODUCTION 16 Aug 2026, AND THE CAPTURE FOUND A GRANT NOBODY
  ASKED FOR.** A new table in `public` inherits Supabase's default privileges, so
  `photo_orphan_scans` arrived with the full SELECT/INSERT/UPDATE/DELETE set
  granted to `authenticated`. RLS has no policies so nothing was readable — which
  is exactly what makes it a trap rather than a harmless leftover: **the day
  somebody adds a policy for an admin screen, the ceiling is already open and the
  policy is the only thing deciding.** Revoked in a second migration. `anon` was
  checked with `has_table_privilege` rather than assumed, and held nothing —
  `20260814_revoke_anon_table_privileges.sql` only ever touched the tables that
  existed then.
  ⚠️ **THE HARNESS WAS RUN AGAINST LIVE AND ITS THREE INJECTIONS ALL FIRED** —
  a stranded object found, a just-uploaded one correctly ignored, a row repointed
  at a missing file found — so the four zeros above it mean something. ⚠️ **AND
  THE ROLLBACK WAS PROVED BEFORE THE HARNESS RAN, NOT AFTER**, because one of
  those faults repoints a LIVE profile: a throwaway `create table` inside
  `begin … rollback` was confirmed gone first. Object counts were 5 and 10 before
  and after.

- `42b2456` — 🔗 **A SECOND RUN OF ENTRIES IN THIS FILE WAS ATTRIBUTED TO THE WRONG COMMIT —
  the Dependabot block, which the pull request below spotted and deliberately
  left alone.** Four entries each carried the SHA of the entry beneath them:
  *"the squad tiles line up"* held `199d4ec`, a react-router bump; *"React Router
  6 → 7"* held `09fc372`, jsdom; *"jsdom 25 → 30"* held `b3628c7`, vitest; and
  *"vitest 2 → 4"* held `a24b360`, an `actions/setup-node` bump. Repaired by
  matching each headline against `git log -1 --format=%s` for the SHA it cites,
  over every entry in the file rather than only the flagged ones.
  ⚠️ **SAME OFF-BY-ONE AS THE PHOTO RUN, DIFFERENT CAUSE.** There a later pass
  filled blank slots by position. Here each commit stamped the previous merge's
  SHA onto its OWN new entry instead of onto the entry below — plainly visible in
  the diffs of `b3628c7`, `09fc372` and `199d4ec`, every one of which adds a
  brand-new entry already carrying somebody else's SHA.
  ⚠️ **IT IS NOT A UNIFORM SHIFT, WHICH IS WHY GUESSING WOULD HAVE FAILED — and
  the previous pull request was right not to.** `ebce0b1` legitimately backs TWO
  adjacent entries, the picker and the tile column being two halves of one pull
  request, so the run stops there; and `a9bef62`, `fffb123` and `d480aa2` below
  it were already correct. A blanket "move every SHA down one" would have broken
  both ends of the block.
  ⚠️ **`a24b360` HAD NO HONEST SLOT AT ALL, AND THAT IS WHERE THE RUN STARTED.**
  Its pull request added no entry, reasoning that the actions entry already
  covered both halves — but the coverage check reads only the SHA at the start of
  a `- ` item and cannot see a commit named in prose, so it stayed uncited and
  the next pull request paid for it by stamping the vitest entry. It now has its
  own bullet, which is what the check was always asking for.
  ⚠️ **`docs:check` STILL CANNOT SEE ANY OF THIS**, said here for the second time
  in two pull requests because it is the reason both shifts survived: the check
  asks whether each SHA EXISTS and whether every commit appears SOMEWHERE, and a
  shifted attribution satisfies both. **The only detector is headline against
  commit subject, and it is worth running across the whole file** — doing so here
  is what confirmed the rest of the changelog is sound and that the entries which
  merely word things differently from their commit subjects are fine.

- `e4d3c23` — 🔍 **A REVIEW PASS OVER THE PHOTO FEATURE — four findings, ranked and fixed.**
  **1)** Every admin "Change photo" was STRANDING THE OLD OBJECT in a private
  bucket of real people's photographs, forever — and a failure after upload
  stranded the new one. Invisible to the suite, which mocks the data layer; the
  fix copies MyPhotoField's ordering and the new tests pin CALL ORDER, proved
  able to fail by fault injection.
  **2)** The drop zone accepted photos the uploaders reject: `image/*` let a
  HEIC — every iPhone's default — through to a BLANK preview and a failure two
  steps later. Drop filter, `accept` attribute and uploaders now name the same
  three types.
  **3)** Admin could add and change a photo but never REMOVE one; the RPC always
  allowed it. A Remove button now exists — row first, object second.
  **4)** Dragging the focal point re-rendered four images per pointer event; an
  rAF gate makes it one update per painted frame, for the mid-range Android this
  app is built for.
  ⚠️ **THE SUITE WAS ALSO SILENTLY DOUBLED — 125 files ran as 250.** Another
  session's agent worktree at `.claude/worktrees/<name>/` is a full checkout of
  this repo INSIDE this repo, and the `**/` include collected every test twice —
  the duplicates running against the WORKTREE'S OLDER SOURCE, so their result
  said nothing about the code under edit. The include is now anchored to
  `tests/`, where every tracked test file lives (measured: 126 there, 0
  elsewhere).
  ⚠️ **TWO FIX ATTEMPTS DIED SILENTLY FIRST, BECAUSE `test:` ALREADY HAD AN
  `include:` LOWER IN THE SAME OBJECT.** A duplicate key in an object literal is
  not an error — the later one wins — and every probe of the earlier one reads
  as "the config is being ignored". Twenty minutes of theory; one
  `grep -n include vite.config.js` answered it.

- `f4c36f6` — 🎯 **THE PICKER NOW SHOWS WHICH PARTS OF A PHOTO WILL ACTUALLY APPEAR.** Jay:
  *"can't we have a circle on the photo preview that shows which parts of the pic
  will actually appear?"* The stage draws the region that survives **every** one
  of the three shapes, dimmed outside it, moving as the point moves.
  ⚠️ **A CIRCLE INSCRIBED IN THAT REGION WAS BUILT FIRST AND WAS WRONG, AND ONLY
  LOOKING AT IT IN CHROMIUM CAUGHT IT.** On a 4:3 photo the safe zone is 18% wide
  and 71% tall, so the largest circle that fits is an 18% blob at mid-height — and
  a face near the top of the frame fell OUTSIDE it **while the Featured preview
  two inches below plainly showed that face.** An overlay contradicting the
  preview beside it is worse than none. Drawn as the actual window with fully
  rounded ends instead; the regression is pinned by a test.
  ⚠️ **AND IT EXPOSED A LATENT DRAG BUG.** The stage was `w-full object-contain`,
  so a PORTRAIT photo — which a head shot usually is — sat pillarboxed inside a
  wider interactive box while the drag maths measured that box. Measured at 390px:
  the box was 358 wide against a 210px photo, so **148px of dead grey strip
  registered as photo** and every position in between was skewed. The box is
  shrink-wrapped to the image now, which is also what lets the overlay be
  positioned in plain percentages with nothing to measure.
  ⚠️ **THE INTERSECTION IS A PER-AXIS MINIMUM, AND THAT IS PROVED RATHER THAN
  ASSUMED** — all three windows are placed by the same focal point, so the
  narrower always nests inside the wider. Three separate faults were injected and
  each was caught; the focal-point marker shrank 24px → 12px because at 24 it was
  over a third of the zone's width and the two rings read as one diagram.

- `102423a` — 🐞 **THE PHOTO POSITIONER NEVER MOVED A SINGLE PHOTO ON THE SCREENS IT WAS
  BUILT FOR.** Jay, on the U18B head coach's tile: *"no matter how many times i
  try to adjust this head coaches photo, it always cuts off the top of his head
  in that double tall pill, like it isn't adjusting the photo in the pill at
  all"*. It was not adjusting it. The focal point saved correctly, the picker's
  preview showed it correctly, `/admin/staff` drew it correctly — and the two
  components that render a face for everybody else, `SquadStaffCard` and
  `PlayerAvatar`, had **no `object-position` at all**, so `object-cover` centred
  every crop. On the lead tile, the tallest shape in the app, centring a
  landscape photograph throws the top of it away, and a head goes with it.
  ⚠️ **THREE LAYERS WERE MISSING, NOT ONE**, which is why it survived a feature
  that shipped in four phases: `public.my_squad_staff()` did not RETURN the two
  columns, `listMySquadStaff` did not MAP them, and the tiles did not APPLY
  them. Any one of the three left alone keeps the bug intact.
  ⚠️ **`20260815_my_squad_staff_focus.sql` APPLIED TO PRODUCTION 15 Aug 2026**,
  by drop-and-recreate (42P13 — `create or replace` cannot change a RETURNS
  TABLE). **Verified after applying rather than assumed**, because a dropped
  function comes back anon-executable through Supabase's default privileges:
  `anon` EXECUTE false, `authenticated` true, `proacl` identical to before the
  drop. `db/schema/functions.sql` re-captured from the catalogue in the same
  breath, and its header stopped claiming a "FIXED SEVEN-COLUMN RESULT" — the
  list had been eight since 13 Aug, which is what a count written beside the
  thing it counts always does.
  ⚠️ **AND THE SAME OMISSION HIT PLAYERS**, found while fixing staff — a parent
  has been able to position their child's head shot since the picker shipped,
  and the roster, the dashboard and the detail hero all ignored it.
  ⚠️ **THE FIRST VERSION OF THE REGRESSION TEST WAS VACUOUS AND WAS MEASURED TO
  BE.** jsdom's computed `object-position` is already `50% 50%`, so
  `toHaveStyle({objectPosition: '50% 50%'})` passes on an `<img>` carrying no
  positioning whatsoever — the bug itself. Asserted on the inline style instead;
  all eight new tests were then confirmed to fail against the deleted line.
  `focusToObjectPosition` moved to `src/lib/photoFocus.js` so drawing a face
  does not pull the picker's drag maths into Home's bundle.
  ⚠️ **AND SEVEN ENTRIES IN THIS FILE WERE ATTRIBUTED TO THE WRONG COMMIT** —
  the whole photo-positioning run, from *"a club admin may set a staff member's
  photo"* down to *"an admin can actually upload a staff photo"*. Each carried
  the SHA of the entry BELOW it. The cause is visible in the shape of it: the
  first entry of the run was correctly left unSHA'd (a commit cannot cite
  itself), and the next pass filled the SHAs in **by position**, so one blank
  slot shifted every attribution after it by one. `docs:check` cannot see this —
  it asks whether each SHA EXISTS and whether every commit appears SOMEWHERE,
  and a uniform shift satisfies both. Repaired by matching each entry's headline
  to the commit subject.
  ⚠️ **A SECOND, OLDER SHIFT WAS FOUND HERE AND DELIBERATELY LEFT ALONE**, across
  the Dependabot block (`ebce0b1` through `a24b360`), rather than guessed at
  inside a bugfix. **Repaired since — see the entry above.**

- `a9891de` — 📓 **THREE FEATURES WENT LIVE AND NOBODY HAD LOOKED AT ANY OF THEM**,
  recorded in `claude/open-items.md` as UNVERIFIED rather than working, with the
  four things a harness cannot settle — chief among them that the contact tiles
  have never been drawn with a real photograph. `package.json` gained
  `"license": "UNLICENSED"` in the same breath, folded into a pull request that
  was going to deploy anyway.

- `361fd6f` — 🔑 **A CLUB ADMIN MAY NOW SET A STAFF MEMBER'S PHOTO — REVERSING A RULING MADE
  TWO DAYS EARLIER.** `20260813_staff_photos.sql` narrowed the write policy to
  own-photo-only and argued it well: *"A coach is an adult with their own login.
  Nobody else picks the picture of your face that thirty families see."*
  ⚠️ **OVERRULED ON A FACT THE ORIGINAL DID NOT WEIGH** — two of fifteen staff
  have a photo and most will never log in, so the principle was producing no
  faces rather than consented ones. Jay was shown the ruling and reversed it;
  `claude/decisions/2026-08-15-admin-may-set-staff-photos.md`.
  ⚠️ **AND IT MATCHES THE PLAYER-PHOTO RULE, AFTER A SECOND PASS.** Jay: *"just
  like teamsnap, sometimes photos need to be uploaded by staff when parents
  forget"* — already live for players, and always has been. The first pass made
  the staff rule club-admins-only, which left a split nobody would defend: a U16
  coach could upload a child's photo but not a fellow coach's. Widened to
  `can_edit_team`, so both buckets now say the same thing. `set_my_photo` stays
  self-only.
  ⚠️ **AND THREE-VALUED LOGIC NEARLY OPENED A HOLE.** The first predicate
  returned **NULL**, not false, with no signed-in user — and the two callers
  disagreed about it: a storage policy treats NULL as not-true and denies, but
  `if not <NULL> then raise` never fires, so the RPC would have fallen through
  to its UPDATE. Not reachable (`anon` has no EXECUTE, and an authenticated
  caller has a non-null uid) but one revoke away from it. Fixed with
  `coalesce(..., false)` inside the predicate rather than a guard per caller.

- `f88f07e` — 🐞 **"CHANGE PHOTO" DID NOTHING ONCE A PHOTO EXISTED.** Jay, minutes after the
  feature shipped: *"put an U18 head coach photo, saved, tried to change photo
  and nothing happens"*. With a photo stored, opening the editor ALWAYS rendered
  the positioner — the stored URL was truthy, so the drop zone was unreachable —
  and "Choose a different photo" cleared only the LOCAL preview, which the
  stored one immediately overruled. There was no route to a new file at all.
  ⚠️ **"REPLACING" IS A SEPARATE STATE FROM "HAS NO PHOTO"**, and collapsing the
  two is the whole bug. While replacing, the stored photo must not win.
  ⚠️ **EVERY EXISTING TEST PASSED, AND THAT IS THE SHAPE WORTH REMEMBERING.**
  They all started from a staff member with NO photo, so the happy path was
  covered and the SECOND use of the same control was not. Proved the new ones
  catch it by restoring the single buggy expression: two fail, exactly as
  reported.

- `b42541c` — 📐 **AN ODD LAST TILE KEEPS ITS WIDTH AND LEAVES A GAP.** Jay, on the real
  six-person squad: *"i don't like the bottom one going full length"*. It was
  promoted to full width to avoid the hole, on the reasoning that a lone tile
  beside a gap looks unfinished. Seen on the real thing, a tile stretched to
  twice its neighbours' width is the more obviously wrong of the two — it reads
  as a different KIND of thing rather than as the last of a set.
  ⚠️ **THE SINGLE-PERSON CASE IS STILL FULL WIDTH AND IS NOT THE SAME CASE.**
  With one tile there is no set for it to be the odd one out of, and a
  half-width tile alone on a row is a card that looks truncated.
  ⚠️ **THE INVARIANT IN THE TESTS CHANGED WITH THE RULE**, rather than being
  quietly deleted: it used to assert an even number of half tiles so none was
  ever alone. It now asserts that `wide` appears ONLY for a squad of one.

- `ea3ccad` — 🧱 **THE LEAD TILE GOES BACK TO TWO TILES TALL, AND THE CONTACT ICONS SHRINK.**
  Jay, having seen BOTH layouts with a real photograph in them: the lead is two
  small tiles tall and the rest flow around it — under as well as beside.
  ⚠️ **THIS REVERSES A RULE FROM EARLIER THE SAME DAY, SO DO NOT "FIX" IT BACK.**
  The previous version gave the lead the whole left column, because tiles
  wrapping back to the left margin looked like a broken grid. True — and the
  cure was worse: at six people the lead became **175×712, a 1:4 strip**, and a
  photograph of a person in it is a vertical sliver. Measured after: 175×280.
  ⚠️ **THE BUTTONS ARE 36px AND THE TAP TARGET IS STILL 44px.** 44px of visible
  red on a 175px tile was most of the row; an `after:` block extends the hit
  area back out without drawing anything, so the floor Button.jsx argues for is
  intact. Measured: box 36×36, hit area 44×44.
  ⚠️ **AND 372px NOW MEANS SOMETHING ELSE.** It was derived from three 44px
  buttons; they shrank and the threshold did NOT follow, because at 320px a
  two-column grid puts the NAME in a ~140px box and a long one wraps to three
  lines. The binding constraint moved from the buttons to the type.

- 🐛 **AND THE ADMIN UPLOAD WAS BROKEN IN PRODUCTION FOR AN HOUR** — `permission
  denied for function may_set_staff_photo`, reported by Jay from the live screen.
  ⚠️ **A HELPER USED INSIDE AN RLS POLICY IS EVALUATED AS THE CALLER.** It was
  revoked from `public` and granted to nobody, which is right for a helper only
  called from a SECURITY DEFINER body and wrong for one a storage policy also
  calls. **The RPC always worked** — it runs as `postgres` — which is exactly why
  the grants that were verified all looked fine. Test the path, not the
  destination.

- `a7fcb53` — 🧒 **PLAYER PHOTOS GET THE PICKER TOO — phase 3 finished, and the plan is now
  complete bar one question for Jay.** Drop zone and positioner on the coach form
  and the parent form.
  ⚠️ **NOTHING SAVES ITSELF THERE.** `focus` is the surrounding form's state
  exactly as `file` and `removed` already were, because the FORM decides when any
  of it reaches the database — the property that stops an abandoned form leaving
  an orphaned photograph of a child in the bucket.
  ⚠️ **THE TWO FORMS SAVE IT DIFFERENTLY, MIRRORING THE PATH.** The coach form
  carries both columns in ONE `upsertPlayer`, so no window exists where a photo
  has a position chosen for the previous one. A parent has no such reach and goes
  through `set_own_player_photo_focus`, scoped by `private.is_own_player`.
  ⚠️ **AND THE "Add photo" BUTTON STAYS HERE** where the staff card lost it —
  that card had no other control so its button and drop zone were duplicates by
  accessible name; this one sits beside Change/Remove, whose labels differ.

- `95524d9` — 🙂 **STAFF CAN POSITION THEIR OWN PHOTO TOO — phase 3, the staff half.** A drop
  zone and the positioner on the "Your photo" card, and the avatar honours the
  stored focal point.
  ⚠️ **POSITIONING IS A SECOND ACTION, NOT PART OF THE UPLOAD.** The upload there
  is immediate and its ordering is argued for at the top of the file for reasons
  unrelated to where a face is.
  ⚠️ **AND THE RESET IS BEST-EFFORT, OUTSIDE THE ROLLBACK — AN EXISTING TEST
  FORCED THAT.** Awaited inside the upload's `try`, a failure would land in the
  `catch` and DELETE A PHOTO THAT HAD ALREADY SAVED, turning a cosmetic problem
  into data loss. The test that caught it was written for a different reason
  months of work earlier.
  ⚠️ **THE "Add a photo" BUTTON WAS REMOVED RATHER THAN KEPT BESIDE THE DROP
  ZONE** — two controls with the same accessible name doing the same thing is a
  duplicate to a screen reader, and a test caught it as "Found multiple elements
  with the role button".
  ❌ **The two PLAYER fields are still not wired** — stated in the plan rather
  than left to be discovered.

- `2f77eb6` — 📸 **AN ADMIN CAN NOW ACTUALLY UPLOAD A STAFF PHOTO — the screen half.** A
  control on every `/admin/staff` row: drop zone, positioner, save. Phase 4 of
  `claude/plans/2026-08-15-photo-positioning.md`.
  ⚠️ **`uploadStaffPhoto` NEEDED NO SIBLING** — it already took a profile id and
  built the key from it, so what had blocked an admin all along was the STORAGE
  POLICY, not the client. The client change was one new function.
  ⚠️ **THE SIGNED URL IS RE-FETCHED AFTER SAVING.** `staff-photos` is private, so
  the RPC returns only the key. Reusing the local object URL would show the right
  face until the next reload and then break.
  ⚠️ **THE KEY IS BUILT FROM THE PROFILE ID, NOT THE MEMBERSHIP ID**, which meant
  `toStaffMember` had to start carrying it — a shape with only the membership id
  cannot upload. Pinned by a test, because the wrong id fails at the database
  with a permission error rather than looking wrong on screen.
  ⚠️ **A GREEN BUILD PROVED NOTHING HERE.** The import block for the picker
  silently failed to land, `npm run build` passed anyway — undefined identifiers
  are a runtime error, not a build one — and the tests caught it with
  `ReferenceError: clampFocus is not defined`.

- `0556e61` — 👀 **THE LIVE SITE WAS FINALLY LOOKED AT, AND IT IS FINE.** Eight deploys in a
  day — three UI features, a react-router major, a layout change — every one
  verified in a harness against invented data and none seen by a person. Jay
  opened it on a phone at the end of the day and reported no problems.
  ⚠️ **WHAT THAT DOES AND DOES NOT ESTABLISH.** It closes the failure nobody
  could have detected from here: sign-in and tab navigation work under
  react-router 7. It is one person on one device looking — not a per-item check,
  and **the contact tiles have still never been drawn with a real photograph.**
  `claude/open-items.md` keeps the narrower items open for that reason.

- `550e72e` — 🗄️ **THE FOCAL POINT REACHES THE DATABASE — PHASE 2, APPLIED TO PRODUCTION.**
  `photo_focus_x` / `photo_focus_y` on `players` and `profiles`, plus
  `set_my_photo_focus` and `set_own_player_photo_focus`.
  ⚠️ **PROVED THE CHECK BITES** rather than trusting a `success: true` —
  `photo_focus_x = 999` inside a transaction raised `check_violation`, and the
  transaction rolled back so no real row moved.
  ⚠️ **NEW FUNCTIONS, NOT NEW ARGUMENTS.** Defaulted parameters on the existing
  `set_my_photo` would create an OVERLOAD, and PostgREST resolves an RPC by the
  JSON keys it is handed — an existing call carrying only `_photo_path` would
  have become ambiguous and started failing. Repositioning also should not
  require re-uploading.
  ⚠️ **AND `revoke … from public` DOES NOT REMOVE AN `anon` GRANT.** Supabase's
  default privileges grant EXECUTE to `anon` EXPLICITLY, and revoking from the
  PUBLIC pseudo-role leaves that alone — `proacl` still read `anon=X` after the
  usual revoke/grant pair. **This repo's own security-advisor walk recorded that
  exact finding hours earlier, and it was reproduced anyway by someone who had
  just read it.** The revoke has to name `anon`. Both RPCs now return 404 to an
  anon key.

- `ebce0b1` — 📷 **THE PHOTO PICKER: DRAG AND DROP, AND A FOCAL POINT YOU CAN SEE THE EFFECT
  OF.** Phase 1 of `claude/plans/2026-08-15-photo-positioning.md`.
  ⚠️ **IT STORES A FOCAL POINT, NOT A CROP, AND THAT RULING IS THE WHOLE DESIGN.**
  The same photograph renders at three very different shapes — the lead tile at
  ~1:4, the half tiles at ~1.9:1, and a 28px circle — so a crop that frames a
  face in one is a sliver of forehead in another. **There is no single crop that
  is right for all three.** One point drives `object-position` everywhere,
  including shapes that do not exist yet.
  ⚠️ **THE HARNESS SCENARIO IS LOAD-BEARING, NOT A CONVENIENCE.** jsdom gives
  every element a zero-sized box, so `getBoundingClientRect()` returns zeros and
  every pointer position collapses to the same answer — the drag maths is exactly
  what the unit tests cannot reach. Verified in Chromium with a generated image
  carrying a different colour in each corner: dragging to the top-left gave
  `2% 2%` and every preview followed.
  ⚠️ **`isAcceptableImage()` EXISTS BECAUSE DRAG-AND-DROP BYPASSES `accept`.** The
  file input can refuse a video by attribute; a drop target is handed whatever the
  OS gives it, so without it the two routes into one field disagree.
  ⚠️ **THE MIGRATION IS WRITTEN AND NOT APPLIED** —
  `db/migrations/20260815_photo_focal_point.sql`. Two smallints with a range
  CHECK rather than one text column, because the value is user-controlled and
  ends up in a style attribute, and two integers cannot carry anything else.

- `ebce0b1` — 🧱 **THE SQUAD TILES LINE UP: THE LEAD OWNS THE LEFT COLUMN, EVERYONE ELSE THE
  RIGHT.** Jay, looking at the real six-person squad: *"only head coach should be
  furthest left, then the rest should be to the right"*. The old rule gave the
  lead two rows and let the remainder wrap BELOW it and back to the left margin,
  so two ordinary tiles shared a left edge with the featured one and the column
  stopped meaning anything. Measured after: exactly **two distinct left edges**
  at every size.
  ⚠️ **THE LEAD'S ROW SPAN IS COMPUTED, SO IT IS AN INLINE STYLE.** Tailwind
  cannot see `row-span-${n}` built at runtime — it would resolve to nothing and
  the lead would silently collapse to one row, the same trap the Dashboard's
  per-row animation delay carries.
  ⚠️ **AND IT ONLY APPLIES ABOVE 372px**, the width the grid gains its second
  column at, via `useMediaQuery` — the hook Roster and Schedule already use.
  Below that a multi-row lead in a single-column grid would leave a hole.
  ⚠️ **THE COST, MEASURED AND NOT YET RESOLVED: at six people the lead is 712px
  tall and 175px wide on a phone — a 1:4 strip.** Fine at three or four; extreme
  at six. Flagged rather than quietly capped, because capping it puts tiles back
  under the lead, which is the thing this change removed.

- `199d4ec` — 🛣️ **REACT ROUTER 6 → 7, AND THE PRODUCTION ADVISORIES GO TO ZERO.** This is
  the one that mattered: `npm audit --omit=dev` was 2 moderate for weeks and is
  now **0**. The whole tree is down to 4, from 10 when scanning was switched on
  this morning.
  ⚠️ **A FRAMEWORK MAJOR ON A LIVE SITE, SO IT WAS EXERCISED RATHER THAN TRUSTED.**
  The app uses only the declarative API — `BrowserRouter`, `Routes`, `Route`,
  `Link`, `NavLink`, `Outlet`, `useNavigate`, `useLocation`, `useParams`,
  `useSearchParams`, `Navigate` — and no data router, which is what makes v7 a
  bump here rather than a migration. Checked: build, 2413 tests, and **real
  navigation in Chromium** (`/` → Schedule → `/roster`, URL and content both
  changing), because every test uses `MemoryRouter` and the app ships
  `BrowserRouter`.
  ⚠️ **`App.jsx` STILL PASSES `future={{ v7_startTransition, v7_relativeSplatPath }}`**
  and v7 accepts it without complaint — those flags are the default now, so the
  prop is inert rather than wrong. Harmless to leave, tidier to remove.

- `09fc372` — 🏗️ **jsdom 25 → 30, AND IT COSTS TEST TIME.** Five majors of standards and
  security fixes in the environment 123 test files render into. All 2413 tests
  pass unchanged.
  ⚠️ **IT ROUGHLY DOUBLES THE jsdom BUILD COST, MEASURED RATHER THAN FEARED.** On
  a fixed five-file set, warm: `environment` 3.4s on jsdom 25 against ~6s on 30.
  ⚠️ **THE FIRST RUN OF EACH IS USELESS FOR THIS** — the same five files measured
  50.96s then 3.35s on identical back-to-back runs, because run one carries
  cold-start. Compare warm runs or compare nothing.
  ⚠️ **IT MATTERS MORE IN CI THAN ON A DEV MACHINE**, for the reason
  `vite.config.js` already records: on many cores the wall clock is set by the
  slowest FILE, but at the four workers a runner has, CPU is the bottleneck and
  environment cost shows up as time. **Measured on the runner: the `test` job went
  99s on jsdom 25 to 124s on 30.** It is a devDependency either way — nothing here
  reaches a phone.

- `b3628c7` — 🧪 **VITEST 2 → 4, AND THE CRITICAL ADVISORY GOES WITH IT.** `npm audit` drops
  from 10 findings to 6 — **zero critical**, where the critical was vitest itself.
  A dev dependency, so it never reached a phone; it did run on maintainers'
  laptops.
  ⚠️ **A MAJOR TEST-RUNNER JUMP IS EXACTLY WHERE THIS SUITE'S TUNING COULD HAVE
  BROKEN**, so it was run rather than trusted: 123 files, 2413 tests, all passing,
  plus `npm run build` and `vitest related --run`. The 15000ms `testTimeout` and
  the per-file `@vitest-environment node` docblocks both survive.
  ⚠️ **`--reporter=basic` NO LONGER EXISTS** and fails with `ERR_LOAD_URL` about a
  custom reporter module — which reads like a project failure and is not. Nothing
  in this repo uses it; it is written down because it is an easy flag to reach for
  when reading CI output, and the error names nothing helpful.

- `a24b360` — 🤖 **`actions/setup-node` 4 → 7 — the other half of the actions
  bump.** Dependabot raises a major on its own, so the two halves arrived as two
  pull requests; the entry below carries the reasoning and the proof for both.
  ⚠️ **THIS BULLET EXISTS BECAUSE THE COVERAGE CHECK COUNTS BULLETS, NOT PROSE.**
  `docs-check` reads only the SHA at the START of a `- ` item, so an entry that
  names a second commit in its body leaves that commit uncited. The pull request
  behind this one decided against "a second entry saying the same thing twice"
  and put the citation on the NEXT entry instead — which is exactly where the run
  of wrong attributions above began. Two short bullets is the price of one honest
  attribution, and it is cheaper than the alternative turned out to be.

- `a9bef62` — 🤖 **THE WORKFLOW ACTIONS GO 4 → 7** — `actions/checkout`, and
  `actions/setup-node` in the pull request behind it. Three majors each, on
  actions that run with access to this repo on every push, which is the supply
  chain the github-actions half of `.github/dependabot.yml` exists to watch.
  ⚠️ **THE PROOF IS THE RUN ITSELF**, which is the pleasant property of an
  actions bump: the `test` job on that pull request checked out and set up Node
  using the NEW versions, so a green check is not circumstantial evidence — it is
  the thing working.

- `fffb123` — 📦 **THE FIRST DEPENDABOT BATCH — the grouped minor and patch updates.**
  `@supabase/supabase-js` 2.45 → 2.112, `@testing-library/user-event` 14.5 → 14.6,
  `postcss` 8.4 → 8.5.
  ⚠️ **THE SUITE PASSING PROVES ALMOST NOTHING ABOUT THE SUPABASE JUMP**, and that
  is worth saying out loud: every test file mocks `@supabase/supabase-js`, so 2413
  green tests exercise the mock and not the client. Sixty-seven minor versions of
  the app's entire data layer went unverified by the thing that looked like it
  was verifying them. Checked separately against the LIVE API instead: the new
  client makes a real RPC call (`calendar_events_for_token`, bogus token, 0 rows)
  and an anon read of `teams` is still refused with `permission denied for table
  teams` — the grant-level refusal the 14 Aug revoke introduced, intact.
  ⚠️ **EVERY DEPENDABOT PULL REQUEST FAILS `docs-check` ON ARRIVAL, BY DESIGN AND
  NOT BY FAULT.** The changelog's one-behind rule requires each pull request to
  cite the previous merge's squash SHA, and Dependabot does not write changelog
  entries. So a dependency bump needs a human commit adding its entry and the
  citation before it can go green — which is the correct outcome rather than a
  workaround, because these bumps DEPLOY and belong in the changelog like
  anything else. Expect it; do not "fix" `docs-check`.

- `d480aa2` — ⚙️ **CI MOVES TO NODE 24, AND EIGHT TEST FILES LEAVE jsdom BEHIND THEM.** All
  three workflows pinned Node 20; both dev PCs run 24, and that gap was not
  cosmetic — `@supabase/supabase-js` needs a global `WebSocket`, which jsdom
  supplies and Node 20 does not (it became a global in Node 22). Eight files
  therefore passed locally and failed only in CI, with an error naming nothing to
  do with the cause. They now run in `node`; `environment` across the eight went
  to **3ms**.
  ⚠️ **PROVED THE BUMP IS WHAT FIXED THEM** rather than trusting a green run,
  using the technique `vite.config.js` already documented: `delete
  globalThis.WebSocket` in `src/test/setup.js` turns a dev machine into a Node 20
  runner, and with it those eight fail with the exact CI error.
  ⚠️ **NETLIFY'S BUILD NODE IS A DIFFERENT SETTING AND IS STILL UNPINNED** — no
  `.nvmrc`, no `NODE_VERSION` — so CI's build is not proving the production
  build's runtime. Recorded, deliberately not changed.

- `268f866` — 🔎 **DEPENDENCY SCANNING EXISTS NOW, AND IT GATES WHAT ACTUALLY SHIPS.**
  Dependabot watches npm weekly and the workflow actions monthly — grouped, so
  minor and patch arrive as one reviewable pull request and majors arrive alone
  — and `npm audit --omit=dev --audit-level=high` is a step of the `test` job,
  which is a REQUIRED check, so it gates immediately rather than waiting on
  somebody editing branch protection.
  ⚠️ **`--omit=dev` IS THE DESIGN.** Measured: the full tree carries **10
  advisories — 5 moderate, 4 high, 1 CRITICAL — and eight, including the
  critical (`vitest`), are devDependencies that never reach a phone.** Gating on
  the whole tree would let a critical in a test runner block a fix to the live
  site.
  ⚠️ **AND `high` RATHER THAN `moderate`, BECAUSE THE TWO PRODUCTION ADVISORIES
  HAVE NO NON-BREAKING FIX.** Both are react-router; the advisory range runs to
  7.17.0 and 6.30.4 is already the newest v6, so `npm audit`'s
  `fixAvailable: true` means **a major**, not a bump. Gating at `moderate` would
  red every build from day one, and a permanently red gate teaches people to
  ignore the gate.
  ✅ **Proved the gate can fail** — the same command at `moderate` exits 1 today
  and at `high` exits 0.

- `69dfdaa` — 🛡️ **THE SUPABASE SECURITY ADVISOR, WALKED IN FULL FOR THE FIRST TIME.**
  Sixteen warnings that nobody had read. **Fourteen are deliberate and correctly
  guarded; two are untidy grants worth one small migration; none is a hole.**
  ⚠️ **THE LINT FLAGS EXPOSURE, NOT VULNERABILITY** — fifteen of the sixteen say
  a `SECURITY DEFINER` function is callable through the API, which is true of
  every RPC this app has. The question it cannot answer, and the walk did, is
  whether each function guards itself. Every mutating one does, by its own code
  rather than by its grant, and all fourteen already set `search_path`.
  ⚠️ **FIVE PROBES RUN AGAINST PRODUCTION rather than reasoned about**, including
  one built so it could not write even if the guard it was testing had failed —
  it passed a team id that does not exist, so a second guard stood behind the
  first. Zero rows created, confirmed after. `claude/open-items.md` has the table.

- `d3b8b3f` — 🔐 **LEAKED-PASSWORD PROTECTION WAS ALREADY ON, AND TWO FILES SAID OTHERWISE.**
  Read off the dashboard 15 Aug 2026 after Jay said he thought he had done it.
  ⚠️ **THE POINTER WAS WRONG TOO**: both files sent people to Authentication →
  Policies; it lives under Authentication → **Attack Protection**. A wrong
  pointer is worse than none — it produces a confident negative.
  ⚠️ **The advisor agreed, and its silence counted only because it was noisy** —
  16 security lints returned and not the leaked-password one. Captcha protection
  is OFF on the same screen and is now recorded, deliberately without a
  recommendation.

- `2701039` — 📬 **THE DMARC REPORTS ARE READABLE NOW, AND THE ONE THAT WOULD MATTER SETS AN
  EXIT CODE.** Jay asked why "Report Domain: …" mail was arriving daily; the
  answer was our own `rua=` tag, and the attachments were gzipped XML nobody
  could read. `scripts/dmarc-summary.mjs` (`npm run mail:dmarc`) reads the
  `.xml.gz` Yahoo and Docomo send and the `.zip` Google sends, with no
  dependency added for either. ⚠️ **Failing spoofs are noise and it says so; the
  alarm is a spoof that PASSED**, which means a leaked DKIM key or an SPF record
  authorising a stranger, and that alone exits non-zero.
  Investigated in full: four forged messages on 13 Aug from four IPs in four
  countries — Congo, Brazil, Israel, Uzbekistan — using invented subdomains
  (`raker.`, `ichu.`, `visto.`) that resolve to nothing and are covered by no
  wildcard. All quarantined, none authenticated, and a week of Google's reports
  over the same period saw no spoofing at all. Not targeted, not a breach, and
  the app was not involved. `claude/runbooks/dmarc-reports.md` has the standing
  guidance and the `p=reject` change that is still to make — ⚠️ **not yet,
  because no root-domain Microsoft 365 mail has ever appeared in a report, so
  its alignment is untested rather than proven.**

- `9721bb6` — 📓 **A PLAN THAT SAID "NOT YET MERGED" FOR TWO PULL REQUESTS AFTER IT WENT
  LIVE.** `claude/plans/2026-08-14-match-lineups.md` still carried
  **STATUS: PHASE 1 BUILT … NOT YET MERGED OR DEPLOYED** while `/lineup/:eventId`
  had been routed on `main` since `61b657a` (#130) and `a7d66cd` (#131). Three
  more of its claims were wrong with it, and the last one is the nasty one:
  ⚠️ **IT NAMED THE TABLE `match_lineups`, WHICH DOES NOT EXIST.** The table is
  `lineups`. Anyone checking the feature by querying the name this file gave gets
  `relation does not exist` — which reads as "never built" rather than as "wrong
  name", and would have sent a session off to rebuild something that is live.
  ⚠️ **AND "no coach has picked a team" WAS FALSE — MEASURED.** `lineups` and
  `lineup_players` both hold real rows, so the save round trip the file said had
  never been run against production has been run. **The genuinely unverified half
  survives and moved to `claude/open-items.md`:** whether a lineup image has ever
  reached a WhatsApp group. The image is the deliverable and no query can answer
  that — it needs a human with a phone.
  ⚠️ **THIS IS THE INVERSION `RESTORE.md` WARNS ABOUT**, in a file nobody re-reads
  after shipping: a status line is worse than an omission, because an omission
  looks like an omission. `docs:check` enforces that a plan STATES whether it
  shipped; it cannot tell whether the statement is true.
  Also recorded: the RCM match sheet, the register and the noticeboard have **no
  rows at all**, so each has only ever been seen in its empty state on the live
  site — correct for a club three days into onboarding, and a note rather than a
  fault. And the roster item's proposed "tidy fix" is now half-done by a different
  route (see below), so the complaint it records is unchanged for the squads it was
  actually about.
  ⚠️ **Two untracked PNGs deleted from the repo root** — `logo-glow.png` and
  `logo-ring.png`, app-icon option boards from 14 Aug. They were drawn on the
  wordless bat mark from #99, which `7228442` (#109) replaced with the crest two
  hours later, so they decorate artwork that no longer exists. Never tracked, so
  nothing was ever published.

- `de82481` — 🧒 **U10 AND BELOW GET A SIMPLIFIED APP, AND A CARD EXPLAINING THEIR SEASON.**
  Four facts from the club's youth section, only the last of which this repo had
  ever recorded: **the league starts at U11**; U6-U8 play **Mighty Minis** at the
  cricket stadium on league match weekends; U9-U10 play **friendly festivals** of
  three or four clubs, each hosting one weekend; and the RCM sheet's own
  instructions say *"U11 to u16 Games"*. Gone below U11: the League competition
  option, the league team, the tier, the round, the match sheet, player grades,
  forward-or-back and positions. `src/lib/minis.js`;
  `claude/decisions/2026-08-15-minis-simplified.md`.
  ⚠️ **`matchSheetDeadline` HAD BEEN HANDING EVERY BAND UNDER 18 A DEADLINE, U6
  INCLUDED** — *"Due within 24 hours of the final whistle"*, stated confidently,
  for a governing-body form nobody has ever filed for those squads. The quote
  that says otherwise was in `claude/plans/2026-08-11-match-sheets.md` when the
  sheet was built; the lower bound was simply never implemented.
  ⚠️ **IT FAILS OPEN, THE OPPOSITE OF `allowsOwnContact`, AND THE WOMEN'S XV IS
  WHY.** `ageBandFromTeamName` answers null for a senior side and for junk alike;
  `isMinisTeam` reads that as **not minis, keep everything**. WXV is named on the
  RCM form and carries no age band, so a rule that failed closed would have
  silently taken its match sheet away. Do not unify these two defaults —
  `src/lib/scoring.js` already argues the same asymmetry for its own.
  ⚠️ **A LEGACY VALUE KEEPS ITS CONTROL.** A U8 fixture already filed as a league
  match still shows the League option, the league team, the tier and the round,
  because hiding a control over a stored value makes it uneditable and invisible
  at once. Nothing is normalised on open.
  ⚠️ **THE HOME CARD IS GROUPED BY FORMAT, NOT BY SQUAD** — Jay: *"we have some
  parents who could have up to 5 age groups worth of players"*. Two formats
  exist, so it is at most two cards however many children somebody has.
  ⚠️ **AND U6 AND U7 RECORD NO SCORE AT ALL** — Jay, asked directly the same day:
  *"i would say keep scoring for U8/U9/U10"*. **That is a THIRD boundary and it
  matches neither of the other two**: scores stop at 8, the Mighty Minis format
  ends at 8, and the league and match sheet start at 11. **U8 is where all three
  disagree** — Mighty Minis, no league, no sheet, and it still scores. Each has
  its own named constant and `tests/minis.test.js` writes them out band by band,
  so tidying two together requires deleting a test first. Also excluded from the
  Dashboard's "Needs a score" tile, which would otherwise have counted a U6
  fixture for ever — the same un-emptiable queue the Youth Manager's list had.
  ⚠️ **`recordsScores` IS NOT `scoringForTeam`.** That one answers WHICH KINDS may
  be scored and its thresholds are mirrored in the database by
  `private.scoring_kinds_for_team`, so moving it means a migration. This one
  answers whether anybody enters a score and is UI-only.
  ⚠️ **`tests/roster.test.jsx`'s FIXTURE SQUAD WAS NAMED `U10` AND IS NOW `U12`.**
  Four grouping tests in that file had quietly become assertions about the minis
  rule. U12 is the only band that is both above the minis threshold and below the
  U13 own-contact one, which that file also covers.
  ⚠️ **EVERY SCREEN TEST IS PAIRED WITH A U14 CONTROL**, because the failure this
  could introduce is *"everybody lost it"* rather than *"the minis kept it"*.
  Proved both ways by injecting a fault into `isMinisBand`: forced false, 23
  tests failed; forced true, all six controls failed.

- `03de5ca` — 🖼️ **SQUAD CONTACTS BECOME A TILE MOSAIC, WITH CALL, WHATSAPP AND EMAIL.**
  Jay picked the bento mosaic from four previewed options: a poster tile per
  person, the lead's spanning two rows, photo filling the tile, title at the top,
  name and three contact buttons at the bottom.
  ⚠️ **THE LEAD IS CHOSEN BY TITLE, NEVER BY ROLE, BECAUSE A RULING ALREADY SAYS
  SO.** `src/data/staff.js` sorts by NAME in two places and states both times that
  role order "reads as a hierarchy the club has not agreed to" — and a featured
  tile picked by role would restate that hierarchy at twice the size. A title is
  a string an admin typed, so featuring it states only what the club already
  chose to say. Visible consequence: only two people in the club are titled
  "Head Coach", so most squads render as an even grid until titles are set.
  ⚠️ **THE MONOGRAM IS THE ORDINARY CASE.** Measured 15 Aug 2026: **two** of the
  club's fifteen staff have a photo, so it is designed rather than patched.
  ⚠️ **`tileSpans()` IS A FUNCTION BECAUSE AUTO-PLACEMENT LEAVES HOLES AT THE
  SIZES THE CLUB HAS** — 1, 1, 4 and 6. Any tile that would sit alone on a row
  goes full width; the lead only gets the tall tile from three people up.
  ⚠️ **A CLIPPED BUTTON THAT NO OVERFLOW CHECK COULD SEE.** At 320px three 44px
  buttons needed 144px inside a 140px tile, and because the tile clips, the
  document did not overflow and `harness/check-overflow.mjs` stayed green while
  the email button was sliced in half. The grid is one column below 372px, and
  the button gap is 4px because 6px left exactly zero slack at 375 — the iPhone
  SE and mini.
  ⚠️ **`bg-white/92` GENERATED NO RULE AT ALL.** Tailwind's opacity scale runs in
  fives, so the title pill and the ghost buttons rendered fully transparent. An
  off-scale value needs `bg-white/[.92]`.
  ⚠️ **THE NUMBER AND ADDRESS ARE NO LONGER PRINTED**, which is what the tile
  costs: an email address is one unbreakable word and will not fit a 168px tile.
  A display change, not a privacy one — the 13 Aug opt-in ruling is untouched and
  the details are one tap away.
  ⚠️ **EVERY SQUAD AFTER THE FIRST COLLAPSES**, on Jay's ceiling: "we have parents
  who could have up to 5 age groups worth of players". Measured: an open
  four-person squad is 488px and a collapsed one is 44px, so five squads goes
  from 2,440px — three phone screens — to 664px. The cost is real and was the
  reason it was a decision rather than a tweak: the contact buttons for the
  second child onward are behind a tap. The header carries the faces and the
  count so the row still says who is in there.
  ⚠️ **THE `hidden` ATTRIBUTE ALONE DID NOTHING.** Preflight's
  `[hidden] { display: none }` and the `.grid` utility have the same specificity
  and the utility comes later, so a "hidden" panel measured 484px tall and fully
  rendered. The display class is swapped as well; the attribute stays for the
  semantics. jsdom cannot see this, so the test pins the class.

- `d5b8667` — 🎨 **THE HOME REDESIGN, REBUILT ON A DASHBOARD THAT MOVED UNDER IT.** PR #79
  previewed this on 13 Aug and was never merged; `main` moved 59 commits and
  changed all three files it touched, so this is a rebuild rather than a rebase.
  Shipped: the 3px state edge on every fixture row, the skeleton replacing the
  first-load spinner, the hero's radial highlight and red→green hairline, the
  40ms staggered entrance, and the 2.2s pulse on the eyebrow dot.
  ⚠️ **#79's STAGGER WAS A SILENT BUG AND IS NOT WHAT SHIPPED.** It wrapped each
  row in a `<div>`; the row carries `last:border-b-0`, so inside a wrapper every
  row is its parent's `:last-child` and the divider vanishes from the WHOLE list.
  Measured in Chromium — five rows went from 1/1/1/1/0 px of bottom border to
  0/0/0/0/0. `FixtureRow` now takes `className`/`style` so the row stays a direct
  child of the Card, and both test files pin the structure.
  ⚠️ **#79's SKELETON HELD THE WRONG HEIGHT.** Written against the 13 Aug screen,
  which has since gained a greeting and the fortnight strip. Every number in it
  is now a browser measurement, listed in the component. The hero is TALLER on a
  phone than on a desktop — 214 against 170 — because the headline wraps.
  ⚠️ **THE FIRST SCREENFUL IS HELD; THE PAGE STILL GROWS BELOW IT.** Measured at
  390×844: the loading block goes from 110px with the spinner to 942px with the
  skeleton. That is what stops the lurch. The document is ~1800px loaded, so
  content below the fold still arrives — the claim is "nothing above the fold
  moves", not "nothing moves".
  ⚠️ **THE DELAY CAP IS UNREACHABLE AND SAYS SO IN THE CODE.** `upcoming` is
  sliced to five, so `Math.min(index, 6)` never binds. Kept as a guard for the
  day the slice changes, rather than left looking load-bearing.
  ⚠️ **`harness/stubs/events.js` NOW SHIFTS ITS DATES TO TODAY.** Pinned to July
  2026 they had aged into the past, so the harness rendered neither the hero nor
  a single Upcoming row — which is why #79 shipped its hero unverified and said
  so in its own description. The literals stay (they encode same-day, same-series
  and day-boundary relationships) and the set moves by one constant.

- `61ba5a3` — 📓 **THE REAL MERGE ROUTE, AND `docs-check` FAILING IN BOTH DIRECTIONS.**
  ⚠️ **`gh pr merge --auto` DOES NOT WORK HERE** — auto-merge is off as a repository
  setting, and the trap is that it APPEARS to succeed when the checks are already
  green. `claude/runbooks/session-and-push.md` now carries wait-then-merge instead.
  ⚠️ **AND `docs-check` FAILS THE OTHER WAY TOO, ON A ONE-COMMIT BRANCH** — measured
  on PR #138. CI's `HEAD~1` is the base tip, so the previous PR's squash SHA is
  inside the checked range and is demanded, while locally the one-behind allowance
  still covers it: **green locally, red in CI**, which is the mirror image of the
  case `CLAUDE.md` already described. Both directions are now written down.
  `claude/open-items.md` also gains "shipped but never seen against real data" —
  deliberately not the same claim as known-broken — and "not built, and
  deliberately so", which records that nothing compares a player's grade against a
  fixture's tier.

- `3044872` — 🎯 **THE ROSTER LANDS ON THE TIER GROUPING, AND THE COLUMN SORT STILL WORKS.**
  Jay: *"i want it to land default on Tier, then forwards and backs view instead of
  nothing view"*. It shipped the previous day defaulting to `none` — that was
  Claude's call, argued from the club-wide view where nobody is graded yet putting
  one "Not graded" heading over everything. Still true, still stated, and overruled:
  a coach opening their own squad is what this screen is for.
  ⚠️ **A PARENT'S ROSTER IS NEVER GROUPED, and this became load-bearing the moment
  grouping went on by default.** A parent cannot see grades, so `tierByPlayer` is
  empty for them and grouping by tier would head every child on the roster with
  "Not graded" — a statement about the club's record-keeping made to the one
  audience who cannot act on it. Gated on `canEditAnything`, not left to the data.
  ⚠️ **THE COLUMN SORT SILENTLY STOPPED WORKING AND THE SUITE CAUGHT IT.** Grouping
  reorders the table, so the headers went on highlighting and flipping their arrow
  while changing nothing on screen. The sort is now applied WITHIN each section —
  the only reading that can coexist with headings, since a row crossing a heading
  makes the heading a lie. Two existing tests asserted end-to-end ordering; they now
  select the "Nothing" grouping first, which is exactly what it means.

## 14 Aug 2026

- `e5c583e` — 📓 **A LICENCE AND A SECURITY POLICY, ON A PUBLIC REPO THAT HAD NEITHER.**
  `LICENSE.md` is **all rights reserved, Abu Dhabi Harlequins RFC** — Jay's call,
  14 Aug. The repo is public for transparency and for security review, and that
  is now stated rather than inferred; the club's name, crest and photographs are
  named as outside it entirely. `SECURITY.md` routes reports to
  `admin@adhquins-clubhub.com` — already the app's public contact on the privacy
  and account-deletion screens — and forbids a GitHub issue, which would be a
  disclosure. ⚠️ **The testing rules are written for a live service holding
  children's data with no staging environment**: own account only, stop at proof
  of access, no scanning or load testing. It points at `claude/open-items.md`
  for what is already known.
  ⚠️ **BOTH ARE `.md` DELIBERATELY.** A bare `LICENSE` is not matched by
  `scripts/netlify-ignore.mjs`'s root-markdown pattern `/^[^/]+\.md$/`, so it
  would have published a live release to add a text file. GitHub recognises
  `LICENSE.md` identically.

- `cf8a221` — 👓 **THE COACH'S ROSTER SHOWS WHAT A COACH NEEDS AND DROPS WHAT REPEATS ITSELF.**
  Jay, on the U16B coach view: a tier grade and a second position had been recorded
  and neither appeared; Gender read "Male" on every row of a single-gender squad;
  Age group read "U16B Contact" on every row of a roster filtered to that squad.
  ⚠️ **THE LAST TWO ARE ONE FAULT, AND IT IS DERIVED RATHER THAN SPECIAL-CASED.**
  `constantColumns()` hides any column whose value is identical on every visible
  row, so the rule also covers cases nobody has thought of and reverses itself when
  the filter widens. A MISSING value counts as a difference — a squad with one
  player whose gender is unset keeps the column, which is exactly the row to fix.
  ⚠️ **GROUPING IS NESTED (tier, then forwards and backs) AND OFF BY DEFAULT.**
  Jay chose nested over a flatter shape with a FWD/BCK chip. Off by default because
  he asked to *be able to* group — a control, not a new default — and grouping 315
  ungraded players would put one "Not graded" heading over the whole club. Empty
  sub-groups never render a heading; ungraded players go last and are never dropped.
  ⚠️ **TIER IS COACH-ONLY IN THREE PLACES**: RLS refuses `player_grades`, the screen
  does not request them for a parent, and the column is not passed. A refused
  request is still a request.
  ⚠️ **HIDING THE AGE GROUP COLUMN TAKES ITS INLINE EDITOR WITH IT** — accepted
  deliberately. The player sheet still moves a player between squads, and widening
  the filter brings the column back.
  ⚠️ **`positionGroup()` MOVED to `src/lib/rosterUnit.js`** from `Roster.jsx`,
  unchanged: `src/lib/rosterGrouping.js` needs it, and a lib importing a screen runs
  the dependency the wrong way.

- `9a700a1` — 🎓 **A/B/C GRADING AND MULTIPLE POSITIONS — phase 2 of tiers and game time.**
  ⚠️ **`events.tier` IS PREFILLED FROM THE LEAGUE TEAM BUT NEVER DERIVED FROM IT.**
  For a league fixture the two agree; for a tournament they need not, because we
  may send our B team to an A-tier tournament — and deriving would record a B
  appearance for a match played at A level, backwards for the eligibility the
  grade exists to police. The prefill only fills a BLANK, so it cannot undo a tier
  somebody chose.
  ⚠️ **THE PLAYER GRADE IS ITS OWN TABLE, NOT A COLUMN ON `players`.** RLS grants
  ROWS not COLUMNS and a parent and a coach are the same `authenticated` role, so
  a column could not have been hidden from parents by any mechanism this schema
  has — not a policy, not a column GRANT. `player_grades` is coach-only on BOTH
  read and write: a parent cannot see their own child's grade, and it never
  reaches the shared team-sheet image.
  ⚠️ **`player_positions` IS DELIBERATELY THE OPPOSITE SHAPE** — squad-readable,
  coach-writable, like `players.position` itself. A position is not a judgement
  about a child. Do not tidy the two into one shape.
  ⚠️ **`players.position` SURVIVES AS THE PRIMARY**, kept in step with the first
  ticked position: six things read it and none were rewritten. Backfilled so the
  new table is not empty on day one.
  ⚠️ **THE WRITE ORDER WAS WRONG AND THE SUITE CAUGHT IT**: the two new writes sat
  before the contact save, so a refused position write returned early and a phone
  number was never stored. Ten tests failed. They now run last, and a test pins
  the order.

- `3688e47` — 🔄 **AN INSTALLED APP NOW NOTICES A DEPLOY WHEN YOU LOOK AT IT.** Jay: *"changes
  are immediately showing up on the desktop site but not the app"*.
  ⚠️ **MEASURED BEFORE CHANGING ANYTHING, AND BOTH OBVIOUS SUSPECTS WERE
  INNOCENT**: production serves `sw.js` as `public, must-revalidate, max-age=0`,
  so nothing stale was cached, and the deployed worker does contain `skipWaiting`
  and `clientsClaim`, so it takes over and reloads the moment it is fetched. The
  gap was only ever **WHEN** the app asks. A browser tab re-checks the worker
  script on every page load, which is why the site looks instant; **an installed
  PWA never navigates** — you switch away and back — so it waited on an hourly
  timer, and the moment somebody looks is exactly the moment it has not checked.
  Now it also checks on `visibilitychange` and on `online`, floored at one check
  a minute so switching between apps on a phone is not a request per flick. The
  hourly timer stays as the backstop for a screen left open and untouched.

- `27ca965` — 🏉 **FORWARD OR BACK, BEFORE ANYBODY DECIDES WHICH FORWARD.** Jay: *"designate
  players as forwards or back and then later on we will drill that down to
  specific positions"*. ⚠️ **The roster ALREADY grouped into Forwards and Backs —
  but it DERIVED that from `players.position`**, so the grouping only existed once
  somebody had named a specific position, and a nine-year-old who is plainly a
  forward sat in **"Other"** until prop-or-lock was decided. `players.unit` says
  the coarse thing directly. ⚠️ **THE UNIT WINS WHERE THE TWO DISAGREE** — Jay's
  explicit choice between two options: a `back` whose position says "Flanker" is a
  data error for a human to fix, not something the app reconciles. Deriving unit
  from position was rejected because it cannot express "forward, position not
  decided", which is the entire reason the column exists. ⚠️ **Every existing row
  is NULL, so the fallback is the whole club** until coaches fill it in, and a
  test pins that the roster still groups exactly as it did. ⚠️ **NOT sensitive** —
  same class as `position`, which parents already read; **the A/B/C ability tier
  is not this and must not live on `players`** (see the plan for why RLS cannot
  hide a column from a parent).

- `1419a21` — 🕐 **WHO HASN'T HAD A GAME — phase 1 of tiers and game time.** Jay: *"tracking
  which players haven't had a chance to play in matches or tournaments"*.
  A coach-only rollup per squad, **ordered fewest-first**, because a list sorted
  by name answers "who is in this squad" — which the Roster already does — and
  this screen exists only to answer "who am I overlooking".
  ⚠️ **NO SCHEMA CHANGE.** It reads `lineup_players` joined to `events`, so the
  team sheets coaches already fill in are the record. ⚠️ **An appearance is a
  SELECTION, not attendance and not minutes**: `attendance` had ZERO rows in use
  (measured), so counting from it would have reported every player in the club as
  having played nothing — a confident, wrong answer. `role` gives starts vs bench
  for free, so "always a replacement" is visible without recording minutes.
  ⚠️ **COACH-ONLY BY CONSTRUCTION** — `lineup_players` RLS returns zero rows to a
  parent, so no gate in the screen could be trusted and none is relied on.
  ⚠️ **HISTORY STARTS WHEN TEAM SHEETS DID, and the screen says so out loud**: a
  0 means "not picked since the club started using them", not "never played". A
  bare zero beside a long-serving player is a lie of omission.
  Design and the tier model: `claude/plans/2026-08-14-tiers-and-game-time.md`.

- `a7d66cd` — 🏉 **"WHAT IS THE SQUAD SECTION, IT IS EMPTY" — reported by Jay from the live
  app**, having picked all four U16B players. Nothing was broken: that list is the
  players NOT yet picked, so picking everyone empties it. ⚠️ **But it had no empty
  state**, and a heading over an empty card reads as broken — the same defect as
  the orphaned timezone note on the event form earlier the same day, and jsdom
  cannot see either. ⚠️ **The heading was also wrong**: "Squad" reads as THE squad
  (the whole roster), so an empty one looks like the roster failed to load. Now
  "Still to pick", with TWO different empty states — "everyone is picked" is
  success, "no players in this squad" is a roster gap for an admin, and saying the
  first when the second is true sends somebody hunting a bug that is missing data.
- `61b657a` — 🏉 **PICKING A TEAM, AND SHARING IT — phase 1 of match lineups.** Jay's ask:
  a GUI for coaches to select a lineup from players who marked themselves
  available, *with the option to add players who did not*, plus generate-and-share
  to a WhatsApp group, and **the coach chooses how many players per side**.
  ⚠️ **DELIBERATELY NOT THE RCM MATCH SHEET** (Jay, in as many words) — that is a
  document FILED after the match; this is a plan made before it. ⚠️ **And keeping
  them apart removed the hardest constraint for free**: `match_sheets.event_id` is
  UNIQUE, so a squad fielding two teams at a tournament could never be expressed
  against it. `lineups.event_id` deliberately carries NO unique index, and the
  migration's guard FAILS if one appears.
  ⚠️ **`players_per_side` is on the LINEUP, not the squad** — a squad plays 10s
  one weekend and 7s the next — and it is a GUIDE, NOT A GATE: the screen counts
  "8 of 10" and warns when over, never refusing the 11th.
  ⚠️ **Not drag-and-drop, deliberately**: HTML5 drag does not work on touch at
  all, this is used pitch-side on a phone, and an accessible keyboard path has to
  exist regardless — at which point drag is a second implementation of one piece
  of state.
  ⚠️ **The share was EXTRACTED, not rewritten.** `MatchSheet` has shared a PNG
  this way since 12 Aug; it now lives in `src/lib/shareImage.js` and both screens
  call it. ⚠️ **`anon` was explicitly revoked on both new tables** — Supabase's
  DEFAULT PRIVILEGES still grant `anon` on a new table depending on which role
  creates it, which the 14 Aug grants sweep did not change. Measured, then
  fault-injected: `anon` is refused at the GRANT with 42501, and an authenticated
  caller with no membership is refused by the POLICY. Full names on the shared
  image, Jay's explicit call over first-name-plus-initial.
- `f6ccb28` — 📓 **THE SECOND 14 Aug SESSION RECORD.**
  `claude/handoffs/2026-08-14-tbd-tournaments-and-pitches.md`, covering the
  evening's four merges and the traps behind them. ⚠️ **It corrects the earlier
  handoff's claim that `apply_migration` and `execute_sql` are refused here** —
  both were used to apply two migrations. What IS gated is a production `DELETE`
  and `gh pr merge` without `--auto`. ⚠️ It also records that **the calendar edge
  function does not deploy with Netlify** and sat on the pre-TBD version for
  hours, which is the closest thing to a live incident today.

- `5f61f92` — 🏟️ **NO PITCH REQUEST ON AN AWAY MATCH** (Jay). An away fixture is played on
  somebody else's ground, so there is no pitch of ours to ask for — and offering
  the button put a request into the allocator's queue for a match the club is not
  hosting. ⚠️ **The check is a strict `home === false`, NOT `!event.home`.**
  `EventForm` writes `home: null` for every training and social, so the loose
  version would have hidden the button from the MAJORITY of the fixtures that
  want a pitch — the club trains far more often than it plays. A null means
  "nobody said", not "away", the same rule the dashboard hero follows.
  ⚠️ **An EXISTING request still shows on an away fixture**, so one switched to
  Away after the fact can still be withdrawn; what is suppressed is the OFFER,
  never the record of one already made. First tests to render `PitchRequest` at
  all — they pin the pre-existing gates too, and both new arms were verified by
  injecting `!event.home` and watching them fail.

- `58432ba` — 🏆 **A TOURNAMENT IS NAMED, NOT OPPOSED.** Reported by Jay from the live
  schedule: a tournament read **"Quins vs Al Ain Tournament"**. ⚠️ **The cause was
  the REQUIRED OPPONENT FIELD, not the title function.** A match could not be
  saved without an opponent and a tournament has none, so the only way to enter
  one was to type the tournament's name into the opponent box — after which
  `Quins vs <opponent>` was doing exactly what it was told. The opponent is now
  optional for a tournament, which is also what lets a club put a tournament on
  the schedule months ahead and add the draw later. `eventTitle` renders the
  tournament's own name, ⚠️ **checked AHEAD of the opponent** so the fixtures
  already carrying the workaround read correctly with no data migration.
  ⚠️ **The calendar feed had to learn `competition_type`** — it received the
  tournament's NAME but never the type, so it could not tell one from a legacy
  free-text row (`db/migrations/20260814_calendar_feed_competition_type.sql`).
  ⚠️ **Inferring it from "`competition` is not null" was REJECTED**: that is what
  the app does for legacy rows and is very nearly right, and "very nearly right by
  a convention the writer happens to follow" is how the two sides drift.

- `be92c0c` — 🗓️ **"WE DON'T KNOW YET", AS A THING A FIXTURE CAN SAY — plus R0 and a duration
  shortcut.** Jay's three asks on the event form. ⚠️ **The migration
  (`db/migrations/20260814_competition_tbd_and_time_tbd.sql`) MUST BE APPLIED
  BEFORE THIS DEPLOYS**, or a coach picking TBD gets a raw CHECK violation.
  ⚠️ **`'tbd'` does NOT reopen the `'friendly'` ruling** refused on 12 Aug: that
  rejected a value which already had a representation, and `'tbd'` had none —
  NULL still means a friendly and nothing may collapse the two.
  ⚠️ **The TBD start time is a FLAG, never a nullable `starts_at`** — that column
  is the sort key of every read path, and a NULL there loses a fixture from a
  list silently rather than erroring. The app writes midnight club time as the
  placeholder, and **nothing may infer TBD from that midnight**; the flag is the
  only truth. ⚠️ **R0 needed no migration but 0 IS FALSY** — every renderer was
  checked for `round != null` before it was added. The calendar feed emits an
  **all-day** entry for a TBD kick-off rather than a made-up 00:00, which is why
  the migration also recreates `calendar_events_for_token`.
  See `claude/schema-history.md`.

- `c8e805e` — 🔗 **A LINK PREVIEW, SO A SHARED LINK STOPS SHOWING AN UPSCALED FAVICON.**
  Reported by Jay: sharing the club hub link on WhatsApp gave "a very blurry
  logo". ⚠️ **The cause was not a broken image — `index.html` carried NO Open
  Graph tags at all**, so WhatsApp fell back to the only image it could find,
  the 180×180 `apple-touch-icon`, and scaled it into a preview slot several
  times its size. Added `public/og-image.png` (1200×630 — below roughly 300px a
  side WhatsApp shows a small square thumbnail instead of the large card) plus
  the `og:` and `twitter:` tags. ⚠️ **Every URL in them is ABSOLUTE**: a scraper
  has no page to resolve a relative `og:image` against and ignores it silently,
  which lands straight back on the blurry icon with nothing on screen to say
  why. ⚠️ **The tags are STATIC and must stay static** — a scraper runs no
  JavaScript, so anything React sets at runtime is invisible to it. The image is
  in workbox `globIgnores` for the same reason the country flags are: only
  WhatsApp's servers ever fetch it, so precaching would cost every install 100KB
  for a file no member's device renders. Verified absent from `dist/sw.js`.

- `ae9e4bc` — 📓 **THE 14 Aug SESSION RECORD, AND A CORRECTION TO `CLAUDE.md` ITSELF.**
  `claude/handoffs/2026-08-14-migrations-and-merges.md`.
  ⚠️ **`CLAUDE.md` DESCRIBED THE `docs:check` CI MECHANISM WRONGLY**, and the
  wrong version was load-bearing — it read "the one-behind allowance falls on
  your last real commit", which implies a three-commit branch still fails in CI
  on the earlier two. **Measured: it does not.** The check runs
  `BASELINE..HEAD~1`, and on a `pull_request` run `HEAD~1` is the synthetic
  merge commit's FIRST PARENT — the base branch tip — so the range holds only
  what is already on `main` and **every branch commit is outside it, however
  many.** Evidence: PR #121 carried three commits and `docs-check` passed in CI.
  ⚠️ **The handoff also records that Claude cannot apply a migration here** —
  `execute_sql` and `apply_migration` are both refused by the permission layer —
  and that `npm run db:check` still cannot run anywhere, because neither PC
  holds `SUPABASE_DB_URL`. **Both new harnesses have therefore never been run by
  the runner**, only proved via the Supabase MCP.

- `7bd6299` — ✅ **BOTH 14 Aug MIGRATIONS ARE NOW APPLIED TO PRODUCTION.** Run by Jay in the
  Supabase SQL editor as one `begin; … commit;`, so they landed together or not
  at all. Measured immediately after, not assumed:
  - **`anon` holds SELECT, INSERT, UPDATE and DELETE on 0 of 24 tables**;
    `authenticated` and `service_role` still hold all 24.
  - **60 policies still 60, bare `auth.*` calls 0, wrapped 24**, and Supabase's
    `auth_rls_initplan` lint went from **18 entries to none**.
  ✅ **THE PROTECTION DEMONSTRABLY MOVED FROM POLICY TO GRANT.** `set local role
  anon; select … from teams` used to return zero rows silently. It now raises
  `42501: permission denied for table teams` — and the hint names the missing
  GRANT, so it is refused by the gate this change was aimed at rather than by
  something earlier. ⚠️ **A negative that fails for the right reason is the
  whole assertion**; the old silent zero and the new hard refusal look equally
  "safe" from the app and are not the same thing.
  ✅ **The calendar feed was smoke-tested live afterwards** — `/calendar.ics`
  with a bogus token: **200, `content-type: text/calendar; charset=utf-8`, a
  real `BEGIN:VCALENDAR` body.** The content-type is the assertion, never the
  200 — the SPA catch-all answers any unknown path with `index.html`.
  ⚠️ **THE ADVISOR IS STILL NOISY AND THAT IS NOT A FAILURE.** 132 lints remain,
  **100 of them `multiple_permissive_policies`** — untouched by either migration
  and a separate question. Read the lint NAME, not the count.
  ⚠️ **Claude could not apply these itself** — both `execute_sql` and
  `apply_migration` were refused by the permission layer, so the SQL was handed
  over as a single paste. Worth knowing before planning any future migration
  session around Claude applying it.

- `56f1dd7` — 🔧 **A MIGRATION TO STOP 18 RLS POLICIES RE-EVALUATING AN `auth.*`
  CALL PER ROW, WRITTEN AND PROVEN.**
  `db/migrations/20260814_rls_initplan_wrap_auth_calls.sql` with
  `db/tests/rls-initplan.sql`. 19 bare calls across 18 policies, wrapped as
  `(select auth.uid())` so Postgres evaluates them once per query instead of
  once per row.
  ⚠️ **THE OBVIOUS SEARCH FINDS 17 OF THE 18.** `open-items.md` described this
  as "18 policies call `auth.uid()` bare"; the 18th, `invites / invites read
  own`, calls **`auth.jwt()`**. A migration written to that description fixes
  17 and leaves the lint reporting one forever.
  ✅ **SIX POLICIES ALREADY USED THE WRAPPED FORM** — all on `announcements`
  and `announcement_reads` — so this follows a precedent rather than inventing
  one. An earlier draft of the open item claimed the opposite; that claim came
  from a query which filtered the wrapped policies out before counting them.
  ✅ **`alter policy`, NOT drop-and-create.** The name, command, roles and
  PERMISSIVE/RESTRICTIVE flag are never restated, so they cannot be got wrong —
  which matters in a schema where `memb no self promotion` is RESTRICTIVE and
  would open a hole if recreated permissive by omission.
  ⚠️ **`profile update own` HAS NO WITH CHECK AND MUST NOT ACQUIRE ONE** —
  Postgres reuses USING for the check there, so adding one is a behaviour
  change dressed as a rewrite.
  ✅ **EQUIVALENCE PROVED, NOT ASSERTED:** the expressions Postgres re-prints
  from its own parse tree were captured before and after inside a rolled-back
  transaction and compared with the wrapper normalised away — **60 policies in,
  60 out, zero differences in meaning, bare calls 18 → 0.** ⚠️ **And the
  comparison was proved able to fail**, by injecting one policy rewritten with
  `and` where the original had `or`: the mismatch was reported.

- `27047d1` — 🔧 **A MIGRATION TO TAKE TABLE PRIVILEGES OFF `anon`, WRITTEN AND
  PROVEN BUT NOT YET APPLIED.** `db/migrations/20260814_revoke_anon_table_privileges.sql`
  with `db/tests/anon-table-grants.sql`. The sibling of 13 Aug's function-execute
  revoke: same Supabase default, different object type.
  ⚠️ **`anon` can SELECT, INSERT, UPDATE and DELETE on 23 of the 24 tables** —
  `photo_backup_runs` is the lone exception. `claude/open-items.md` said "seven
  tables"; seven was a sample that had been read as a total.
  ✅ **NOTHING IS EXPOSED TODAY, AND THAT IS MEASURED RATHER THAN ARGUED.**
  `set local role anon` returns zero rows across ten tables where the same
  counts, run unprivileged, return real ones — so the zero discriminates.
  ⚠️ `announcements` reads zero on both sides and proves nothing; it is empty.
  ⚠️ **ONE POLICY LOOKS LIKE A HOLE AND IS NOT.** `memb no self promotion` has a
  WITH CHECK that passes for anybody, which would let `anon` insert a membership
  — except it is **RESTRICTIVE**, not permissive. The predicate alone cannot
  tell you which; `pg_policies.permissive` can. Do not "fix" it.
  ⚠️ **THE FIX IS PARTIAL AND THE FILE SAYS SO.** Two default-privilege entries
  govern new tables in `public`; the `postgres` one was closed, the
  `supabase_admin` one **refused** — verified by reading `pg_default_acl` back
  inside a transaction rather than by reading the error. So the harness walks
  every table instead of trusting a default.
  ✅ **PROVEN BEFORE BEING WRITTEN DOWN:** migration and harness were run
  together in a rolled-back transaction — the check passed clean against the
  migrated schema, then caught a real injected `grant select … to anon`, with
  the grant confirmed live at the moment of the catch. Production re-measured
  afterwards and unchanged.

- `46102ad` — ✅ **THE RECEIPTS SHEET NOW SAYS WHO HAS SEEN A NOTICE, NOT ONLY WHO HAS NOT.**
  Found by Jay on the **first real notice ever posted** — U16B, read by one other
  person — where the sheet said *"1 of 6 seen"* above a list of the five who had
  not, and offered no way to learn who the one was.
  ⚠️ **THE DATA WAS THERE THE WHOLE TIME.** `announcement_audience` returns
  `read_at` for every member of the audience; the sheet computed the seen COUNT
  and rendered only the unseen NAMES. Nothing in the plan or the code argued for
  hiding it — it was simply never built.
  ⚠️ **THE CHASE LIST STAYS, AND STAYS FIRST.** The two halves answer different
  questions: seen is *"did it land?"*, unseen is *"who do I ring?"*. A test
  exists specifically so "add the seen list" cannot quietly become "replace the
  unseen list", and it was proved by making exactly that swap and watching it go
  red.
  ⚠️ **EACH NAME CARRIES WHEN, IN THE CLUB'S ZONE**, through the existing
  `formatTableDate`/`formatTime`. "Did they see it before training?" is the real
  question behind a read receipt and a bare name cannot answer it.
  ✅ **`tests/notice-receipts.test.jsx` IS THE FIRST TEST THE RECEIPTS SHEET HAS
  EVER HAD** — the whole component was uncovered. Six tests, written before the
  code and red first.
  ⚠️ **AND THE FIRST DRAFT OF THAT FILE USED REAL MEMBER NAMES**, lifted from a
  screenshot of the live board, hours after `CLAUDE.md` rule 9 was written to
  forbid exactly that. `docs:check` caught ONE of five, and only because it
  collided with the retired-names list. **A checker is not the gate here;
  inventing the data is.**
  ❌ **STILL NO REAL-BROWSER COVERAGE FOR `/notices`** — `harness/` carries only
  the pure `NoticeBoard` card, so the sheet cannot be reached there.

- `15ef4e8` ✅ **The `state-of-play.md` rebuild itself** — 56 lines,
  `claude/open-items.md` new, `writing-to-github-from-claude.md` 55. Detail below.

- `6de277b` ✅ **THE SCORING TRIGGER'S `search_path` IS PINNED, AND THE REPO HAD
  CLAIMED IT ALREADY WAS.** `db/migrations/20260814_pin_scoring_trigger_search_path.sql`,
  applied to production and verified live.
  ⚠️ **THE CLAIM WAS HALF TRUE, WHICH IS WHY IT SURVIVED.**
  `db/schema/functions.sql` said `social_idea_owner` and
  `events_result_from_components` "were both pinned on 13 Aug". The first was.
  The second was not, for a day, inside the file whose whole job is to be the
  capture. **A prose claim in a schema capture is not a measurement.**
  ⚠️ **FOUND BY RUNNING `get_advisors` WHILE CHECKING SOMETHING ELSE** — Jay
  asked whether leaked-password protection had taken. It had; this had not.
  ⚠️ **IT MATTERS MORE THAN THE LINT SUGGESTS**: that trigger recomputes a
  fixture's score from its components, and its stated job is that a tampered
  request cannot produce a score contradicting them.
  ⚠️ **`search_path = ''`, NOT `public`** — the body's only call is already
  schema-qualified, so the empty path is available and is strictly stronger.
  ✅ **EXERCISED BEFORE IT WAS APPLIED**, in a rolled-back transaction on
  production. **4 tries returned 20, not the 24 predicted — and the wrong-looking
  number is the proof**: that squad is U10 and scores TRIES ONLY, so a broken
  search_path could not have produced a band-correct answer, it would have
  raised.
  ✅ **`db/tests/search-path.sql` IS NEW** — every function in `private` must be
  pinned except a NAMED exemption, and it goes red if the exemption itself is
  ever pinned. ⚠️ **Named, not counted**: a "at most one unpinned" rule stays
  green while the wrong function drifts. Proved by injecting a real unpinned
  function and watching it raise, plus a self-test arm inside the file.

- ❌ **AND THE REBUILT `state-of-play.md` CARRIED A STALE FACT WITHIN THE HOUR.**
  Its "test data in the live database" section warned about a seeded September
  that **no longer exists — zero rows, measured the same day**. It was copied
  from the old file without being re-run, which is exactly the failure the
  rebuild was for. Corrected, and the correction left in place as the lesson.

- `60f7093` ✅ **`writing-to-github-from-claude.md` emptied and rebuilt** — see the
  entry below; it keeps only the routes that work and the traps that have bitten.

- `15ef4e8` ✅ **The rebuild itself** — `state-of-play.md` 56 lines,
  `claude/open-items.md` new, `writing-to-github-from-claude.md` 55. Detail below.
  ⚠️ **`scripts/docs-check.mjs` READS ONLY THE FIRST SHA ON A LINE**, so two
  commits cannot share one entry. Found twice in one session.

- `0e7cfd4` ✅ **`state-of-play.md` WAS EMPTIED TO A HEADING BY JAY AND REBUILT
  FROM SCRATCH.** The first had
  reached **2,151 lines**; roughly half was dated narrative, much of it about its
  own past wrongness, because every correction was appended rather than replacing
  anything. It had been rewritten once before, on 10 Aug, at 591 lines.
  ⚠️ **THE TWO HALVES WERE NOT THE SAME PROBLEM.** "Where things stand" (1,106
  lines) rots by design and is gone, correctly. The rulings and the audit backlog
  did not rot — the file's own audit said every wrong claim in its history was a
  rotted MEASUREMENT and never a wrong ruling.
  ✅ **The audit backlog is rescued into `claude/open-items.md`** and compressed
  hard. It carried the only record of the 13 Aug readiness audit, which was
  deliberately never committed as a report.
  ⚠️ **The rulings section was NOT rescued — Jay's call**, on the grounds that
  most of it is also recorded in `RESTORE.md`, in migration headers and in
  `claude/decisions/`. **Not all of it is.** It remains in git history at
  `480b38d` and can be mined if something turns out to be missing.
  ⚠️ **`state-of-play.md` NOW CARRIES A SIZE RULE** — nothing dated, and a note
  that passing ~80 lines means something has crept back in.
  ❌ **BOTH PUSHES TURNED `main` RED** (`docs-check`, commits missing from the
  changelog). Fixed by this entry. **A direct push to `main` still runs the
  required checks** — owner bypass lets the push through, it does not make the
  build pass.

- `480b38d` ✅ **Trailing newlines restored on eight test files**, collateral from
  the `@vitest-environment node` work.

- `acc0798` ✅ **THE DOM-FREE TEST FILES RUN IN `node`, NOT jsdom.** Every test file that
  touches no DOM now carries `// @vitest-environment node` as its first line.
  Reasoning in `vite.config.js`.
  ⚠️ **THE CHECK IS VITEST'S `environment` FIGURE, NOT "THE TESTS STILL PASS".**
  A docblock that is malformed or not on the first line is **silently ignored**
  — the file keeps running in jsdom and keeps passing, so a green run proves
  nothing. Across the qualifying files that figure went **43.91s → 10ms**, with
  all of their tests passing either way.
  ⚠️ **IT BARELY MOVES A 16-CORE WALL CLOCK (~40s, unchanged) AND THAT IS
  EXPECTED** — the run is bound by the slowest FILE, not by total CPU. At four
  workers, the shape of the CI runner, **~59s → ~50-53s**.
  ⚠️ **The candidate list was picked conservatively** — anything mentioning a
  DOM global, storage, `navigator`, testing-library or `render(` was left in
  jsdom, which is why `data.test.js` and `calendar-grid.test.js` did not
  qualify. A file that later grows a DOM assertion fails loudly with
  `document is not defined`; the fix is to delete its docblock.
  ⛔ **AND EIGHT OF THEM HAD TO GO BACK, BECAUSE THE FIRST ATTEMPT PASSED
  LOCALLY AND FAILED IN CI.** `@supabase/supabase-js` needs a global
  `WebSocket`. jsdom supplies one; **Node 20, which the workflow pins, does not**
  — it became a global in Node 22, and both dev PCs run Node 24. The CI error is
  `Node.js detected but native WebSocket not found`, which names nothing to do
  with the docblock that caused it. **Any file whose closure reaches supabase-js
  stays in jsdom.**
  ⚠️ **THE CLOSURE, NOT THE VISIBLE IMPORTS.** Four of the eight reach it only
  transitively, and `tests/session-guard.test.js` reaches it through a **dynamic**
  `import(MODULE_PATH)` that no grep for `from '…'` finds — the first pass missed
  exactly that one.
  ✅ **PROVED LOCALLY BOTH WAYS** by deleting `globalThis.WebSocket` in the setup
  file to turn a dev machine into Node 20: the annotated files pass without it,
  and a supabase-touching file put back on `node` fails with the exact CI error.
  ⚠️ **Bumping CI to Node 22+ would retire this and let the eight join the rest.
  Not done** — changing the runtime the production build runs on is a bigger
  decision than a test speed-up.

- `b1a9826` ✅ **THE SUITE IS A QUARTER FASTER, AND THERE IS FINALLY A COMMAND
  FOR THE EDIT-TEST LOOP.** `npm run test:watch` (reruns only what your save affects)
  and `npm run test:related -- <file>`. `CLAUDE.md` now says which to use when.
  ⚠️ **THE POINT IS THE LOOP, NOT THE TOTAL.** A full run was ~40s and was being
  used as feedback while editing. Watch mode is 1-3s per save.
  ✅ **`userEvent` NOW DEFAULTS TO `delay: null`.** user-event's default is an
  awaited macrotask between EVERY KEYSTROKE, and on a suite that types into this
  many forms that was most of the wall clock. Measured: `invite-form` **11.8s →
  4.7s**, and the whole suite at four workers — the shape of the CI runner —
  **77.9s → ~59s**. All 2189 tests pass either way.
  ⚠️ **SAFE ONLY BECAUSE NOTHING IN THIS APP DEBOUNCES A KEYSTROKE, and that was
  checked rather than assumed** — the only debounce in `src/` is the realtime
  subscription, which already takes an injectable `debounceMs`. A future
  debounced input must pass its own delay.
  ⚠️ **PATCHED IN `src/test/setup.js`, NOT AT THE 283 CALL SITES.** Editing every
  `userEvent.setup()` in 46 files measured ~5s FASTER again (~55s), and was
  rejected: it fixes today's tests and silently loses the speed the first time
  somebody writes a new one the ordinary way.
  ⚠️ **A STATIC IMPORT THERE BREAKS THE SUITE, AND THE ONE NODE-ENVIRONMENT FILE
  CAUGHT IT.** `setup.js` runs for every test file including
  `tests/test-timeout.test.js`, which declares `@vitest-environment node`;
  user-event reads `window.navigator` at import time, so the failure is
  `Cannot read properties of undefined (reading 'navigator')` in a file that
  never mentions user-event. It is imported conditionally.
  ⛔ **`pool: 'threads'` WAS TRIED AND MUST NOT BE ADOPTED.** ~9% faster and it
  BREAKS: **eleven test files mutate `process.env.TZ`** and threads share one
  process, so it leaks. Measured failures — `expected 25 to be 24` in
  `event-format`, `expected 21 to be 20` in `schedule`, both date off-by-one.
  Forks isolate by process, which is the only reason the current suite is
  correct. **Do not re-propose it without first removing the TZ mutation.**
  ✅ **DONE the same day — see the entry above.**

- `bed0619` ✅ **THE FLAKY SUITE IS FIXED, AND IT WAS ONE CONFIG LINE.**
  `vite.config.js` now sets `testTimeout: 15000`; vitest's default is 5000.
  Guard: `tests/test-timeout.test.js`.
  ⚠️ **IT WAS NEVER CROSS-FILE STATE.** The heaviest tests here legitimately cost
  **1.4-2.6s** in jsdom — the worst types five search terms into a picker over a
  45-player roster, re-rendering on every keystroke — so against a 5000ms ceiling
  they ran with a margin of about **2x**. Contention slows everything
  proportionally, so **whichever test sits nearest the ceiling tips over, and
  which file that is depends on machine load.** That is why four unrelated files
  were blamed in turn and none of them was the problem.
  ✅ **Reproduced on demand instead of waited for** — oversubscribing the pool
  (16 logical CPUs, 40 forks) gave **8 loaded runs, 8 failures, all
  "Test timed out in 5000ms"**, in three files none of which were the four
  originally blamed.
  ✅ **Proved: 6 loaded runs green under the identical command, then red again
  the moment 5000 was put back.** The guard was proved against both faults — the
  value lowered, and the line deleted.
  ⚠️ **The guard runs in the `node` environment**: importing `vite.config.js`
  pulls in esbuild, which refuses to load under jsdom and fails as a collection
  error naming esbuild, with zero tests run.
  ❌ **THREE OF THE FOUR BLAMED FILES FIT THE MECHANISM; `notice-board` DOES
  NOT** — it is synchronous and runs in ~160ms. Its failure was never reproduced
  and its message never recorded. Recorded as unexplained rather than assumed
  closed.

- `e0fcc1f` ✅ **WORKED EXAMPLES USE INVENTED NAMES, AND `CLAUDE.md` RULE 9 SAYS
  SO.**
  The registration-guard migration, its harness, the `db/schema/functions.sql`
  capture and `state-of-play.md` all demonstrate the first-token/last-token
  matching rule; they now do it with made-up names whose spellings reproduce the
  real cases exactly — `Sara Ahmed` / `sara noor ahmed` for the middle-name
  match, `PIETER VOS` / `Lars Vos-Meijer` for the double-barrelled non-match.
  **Nothing the documentation demonstrates is lost.**
  ⚠️ **THIS REPO IS PUBLIC AND ITS MEMBERS ARE MOSTLY CHILDREN**, so a worked
  example is a publication. **Invent the data, keep the shape**; identify a real
  row from the database, never from a document.
  ⚠️ **`docs:check` CANNOT ENFORCE IT** — a denylist of real names would put
  those names into the repo, in the checker.
  ✅ **The invented names were checked against live before use** — zero matches
  in `players`, `profiles` and `player_parents`, **with a control token that
  returned a real row**, so the zeros mean something.
  ⚠️ **Documentation only. The migration is already applied**, and
  `apply_migration` strips `--` comments, so the database never held either set.

- `e0fcc1f` ❌ **`state-of-play.md` SAID ⛔ "THE TWO BAD ROWS ARE STILL THERE"
  WHILE THEY WERE ALREADY DELETED**, for a day, in the file that is step 3 of
  the reading order. Only this file recorded the cleanup. Corrected, and re-measured live:
  neither row exists, and the parent's LOGIN correctly survived. **A ⛔ in the
  entry point is an instruction to the next session** — this one pointed at two
  rows that are not there.

- `8c7e62e` ✅ **NOTHING GRANTS SQUAD ACCESS WITHOUT AN ADMIN —
  `claim_roster_access` NOW INSERTS `pending`.** `db/migrations/20260814_claim_roster_access_pending.sql`.
  It was the one path that opened an age group with no human involved.
  ⚠️ **OVERTURNS A DELIBERATE RULING** — `20260809_notify_pending_membership.sql`
  says *"a roster email match IS the verification"*, which held while the club
  expected to import a roster. Since the no-roster-import ruling every
  `player_contacts.email` was written by whoever registered that child, so a
  match now proves only that two accounts share an address.
  ⚠️ **REACHABLE, NOT THEORETICAL** — children carrying their own email on their
  contact record were handed the whole squad on sign-up. **Measured: 1 player of
  6 visible now, where it was all 6.**
  ⚠️ **THE MATCHING IS UNCHANGED, ONLY THE GRANTING.** Identifying which child an
  account belongs to and granting that account access are two different jobs;
  this function was doing both.
  ✅ **Admins now get told** — the pending trigger fires where these inserts used
  to slip past it silently. ⚠️ **No existing membership was downgraded.**

- `8c7e62e` ✅ **A `parent` OR `player` MEMBERSHIP MUST NOW POINT AT A PLAYER.**
  `db/migrations/20260814_family_role_needs_player.sql`, constraint
  `memberships_family_role_needs_player`. Jay: *"nobody outside staff should be
  able to create an account without a player"*.
  ⛔ **THIS DOES NOT STOP ANYBODY CREATING A LOGIN, AND NOTHING CAN.** Signing up
  is Supabase auth and the app requires it BEFORE registration. An account with
  no membership is a normal, temporary state — three existed, all people whose
  child had already been registered by somebody else — and they are listed under
  "waiting for access" on Accounts. **Do not read this as "orphan logins are
  impossible".**
  ⚠️ **WHAT IT STOPS** is an account let into a squad pointing at no player: it
  can see every child in that squad and cannot touch its own, because
  `is_own_player` needs a real id.
  ⚠️ **THE SCREEN ALREADY REFUSED IT; THREE OTHER WAYS IN DID NOT** —
  `accept_invite` (an invite with no player), `grantMemberships`
  (`player_id ?? null` straight into an INSERT), and hand-written SQL. The guard
  was in the component, one layer above every other caller.
  ⚠️ **`accept_invite` FIXED IN THE SAME MIGRATION, GUARD BEFORE `accepted_at`**
  — after it, a refused invite would be burned and the person left with a link
  reporting "already used". Proved still unaccepted.
  ⚠️ **THE CONSTRAINT NAMES THE TWO FAMILY ROLES**, not `player_id is not null`:
  eleven staff rows legitimately have none. Half of
  `db/tests/family-role-needs-player.sql` proves the rule stays OFF for staff,
  and that an UPDATE clearing the player is caught too, not just an INSERT.
  ✅ **The one violating row was fixed first, on evidence** — the child's own
  `player_parents` row names that parent with a matching email AND phone, not a
  shared surname.

- `8c7e62e` ✅ **THE TWO BAD ROSTER ROWS ARE GONE** (14 Aug, on Jay's
  instruction).
  ⚠️ **A PLAIN DELETE WOULD HAVE DESTROYED A PARENT'S PHONE NUMBER.** The
  parent-as-player row carried the family's TWO `player_parents` records — the
  father's and the mother's — while the real child had NONE, and
  `player_parents` CASCADES. They were moved to the child first.
  ⚠️ **`memberships.player_id` IS `ON DELETE SET NULL`**, so the dangling
  membership was deleted explicitly rather than left pointing at nothing.

- `5ab98c5` ⛔ **SELF-REGISTRATION WAS PUTTING THE WRONG PEOPLE ON THE ROSTER — FIXED.**
  `db/migrations/20260814_registration_duplicate_guards.sql`. Reported by Jay
  from the real club. `register_my_player` INSERTed a new `players` row
  **unconditionally on every call**: no uniqueness of any kind, at any layer, on
  a roster of children. Two different failures, both still on the live roster —
  U18B held **one boy twice** (his father's account and his own, spelled
  differently), and U14B held a **parent as a player** (his own name in the name
  box while "Who are you registering?" stayed on its default).
  ⚠️ **THE CHECK CANNOT LIVE IN THE CLIENT, AND THAT IS WHY THIS EXISTED.** A
  registering parent holds a PENDING membership, so `player read` returns
  nothing and a client-side "is this already here?" answers **no** every single
  time. The rule lives in SQL and nowhere else — `private.name_match_key`, first
  token + last token, case- and punctuation-blind.
  ⚠️ **TWO CONFIRMATION FLAGS, NOT ONE**, with a harness assertion: one flag
  would mean confirming *a different child with the same name* also waved
  through *I am registering myself as my own child*.
  ⚠️ **THE LIVE APP WAS GUARDED BEFORE THE DEPLOY** — both parameters default to
  false and PostgREST calls by name, so the serving bundle resolved to the new
  function immediately. Verified against live before applying.
  ⚠️ **An enumeration oracle was accepted knowingly** and is argued in the
  migration; the message does not echo the stored spelling.
  ✅ **AND BOTH BAD ROWS ARE NOW CLEANED UP** (14 Aug, on Jay's instruction). The
  duplicated U18 pair went first; the U14 parent-as-player row was removed last.
  ⚠️ **A PLAIN DELETE WOULD HAVE DESTROYED A PARENT'S PHONE NUMBER.** That bogus
  player row carried the family's TWO `player_parents` records — the father's and
  the mother's — while the real child had NONE, and `player_parents` CASCADES on
  delete. They were moved to the child first. ⚠️ **`memberships.player_id` is
  `ON DELETE SET NULL`**, so the dangling membership was deleted explicitly rather
  than left pointing at nothing.
  ✅ **The confirm UI HAS now been seen in a real browser** — `signup` scenario
  added to `harness/`, both refusals and both ticks confirmed, and editing the name
  withdraws the tick.

- `15159bf` 🐛 **THE VIEW-AS DROPDOWN SHIPPED CLIPPED TO A SLIVER, AND THE CHECK THAT
  MISSED IT IS THE POINT.** Reported from a screenshot minutes after the deploy.
  The panel was `absolute` inside the trigger's wrapper and **the masthead row
  carries `overflow-hidden`** — deliberately, to clip the `harlequin` diagonals
  that bleed off its right edge — so the menu was clipped with it.
  ⚠️ **THE PRE-MERGE BROWSER MEASUREMENT COULD NOT HAVE CAUGHT IT.** It asked
  `getBoundingClientRect()` whether the menu sat inside the viewport, and **a
  layout box reports its full size even when an ancestor is clipping it to
  nothing**. Proved by injecting the bug back in: the rect was **identical at
  264×475 in both states** while `document.elementFromPoint` went from **5/5**
  sample points hitting the menu to **0/5**. **Geometry and visibility are
  different questions and only one is the one a person asks.**
  ✅ Fixed by portalling the panel to `<body>` and positioning it `fixed` from
  the trigger's rect, recomputed on resize and capture-phase scroll. Verified
  5/5 visible at 1280px and at 320px, first menu item clickable, no document
  overflow.
  ⚠️ **`position: fixed` ESCAPES THE CLIP ONLY BECAUSE NO ANCESTOR SETS
  `transform`/`filter`/`perspective`** — `Sheet.jsx` leans on the same property
  and carries the same caveat; a page-transition wrapper would break both.
  ⚠️ **PORTALLING CHANGED THE OUTSIDE-CLICK RULE AND GETTING IT WRONG WOULD HAVE
  BEEN SILENT**: the handler must test the wrapper AND the panel, or every click
  on a menu item counts as "outside" and closes the menu before the click lands
  — picking a persona would do nothing at all.

- `7228442` **The app icon is the crest again — wordless, with CLUB HUB above the bat, lightly
  3D.** Jay: *"i've changed my mind, i want to revert back to the original Quins logo
  crest"*, then *"remove all the wording"*, *"put Club Hub inside the logo white part,
  above the bat"*, *"make the logo look somewhat 3d"*, and white for the tile.
  ⚠️ **This partly reverses `ffdcddf` (#99), which replaced the crest with a bat mark**
  — but it KEEPS that change's real contribution: the maskable tiles measure **0%
  outside the 80% safe circle**, and are measured on the RENDERED tile with the drop
  shadow included, because blur and offset extend past the artwork and would otherwise
  make "mask-safe" true of the crest and false of the icon. ⚠️ **The lettering removal
  took three attempts and the first two failed identically:** keying on "is this pixel
  red / is this pixel white" strips glyph CORES and leaves ANTI-ALIASED FRINGES, so the
  wordmark stayed perfectly readable as pale pink outlines and "RUGBY CLUB" as an
  embossed ghost. The fringes are neither red nor white, and on green they run through
  pale greens that satisfy any is-green test. Fixed by keying on DISTANCE from the
  sampled panel colour, bracketed per row by the panel's own extent, threshold 12 —
  at 30 a letter-shaped residue of 7–18px per row survived on the "1970" line. Residual
  is now **0**, and the script reports it so a future tweak cannot quietly bring a ghost
  back. New `harness/make-icons.mjs` — ⚠️ **#99 generated its icons by hand and left no
  script**, which is what made a one-line brief into a research task; icons are derived
  artefacts and deriving them is now repeatable. Playwright resolved at runtime, same as
  the shoot scripts, so it stays out of `package.json`. ⚠️ **`src/assets/logo-mark.svg`
  is now ORPHANED** — nothing in `src/` imports it and the icons no longer derive from
  it. Left in place deliberately rather than deleted; see the note below.
  ⚠️ **NOT verified on a real phone** — the only true test of an icon is a home screen.

- `cb0c5e0` ✅ **NOTICES — THE CLUB NOTICEBOARD, PHASE 1. LIVE.**
  Plan `claude/plans/2026-08-14-notices.md`. `public.announcements` (scoped by
  `team_id`, null meaning the whole club), `public.announcement_reads`, two
  `SECURITY DEFINER` functions for the receipts, `/notices`, the pinned card on
  Home and a link on `/more`.
  ⚠️ **NOTHING IN IT SENDS EMAIL, ON PURPOSE.** Resend Pro removed the 100/day
  ceiling on 13 Aug — a brake nobody designed — so the outbox, preferences and
  unsubscribe are phase 2 and the email itself is phase 3. **Do not bolt a
  notify trigger onto phase 1.**
  ⚠️ **THE READ GATE IS `can_see_team`, SO A PENDING MEMBER SEES AN EMPTY
  BOARD** — deliberately unlike `event read`, because the audience count is a
  feature and must not include accounts nobody has approved.
  ⚠️ **`team_id` IS NOT UPDATABLE**, enforced by the column grants rather than
  the policy: a squad notice thirty people have read must not become club-wide
  afterwards.
  ⚠️ **A READ MEANS "IT APPEARED ON THEIR SCREEN"**, and the receipts sheet says
  so on the screen.
  ✅ Exercised against production in a rolled-back transaction, 13 of 14 green
  first time; the fourteenth was the harness's own bug (`handle_new_user` wins
  the race, so `on conflict do nothing` left the fixtures nameless).
  ✅ Home card measured at 320px in Chromium, proved non-vacuous with a 900px
  probe. ❌ The `/notices` screen has no real-browser coverage.
  ✅ **APPLIED TO PRODUCTION 14 Aug 2026, and the harness then ran against live
  for real: 15 of 15 green.** All five `db/schema/` files re-captured from the
  catalogue afterwards — `pg_policy`, `pg_constraint`, `pg_indexes`,
  `pg_get_triggerdef`, `information_schema.*_privileges` — not pasted from the
  migration.
  ⚠️ **THE CAPTURE FOUND SOMETHING THE MIGRATION DID NOT GRANT:** `anon` holds
  `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` on both new tables.
  **So does every other table probed** — `events`, `players`, `memberships`,
  `match_sheets`, `social_ideas` — so it is the schema's pre-existing shape from
  Supabase's default privileges, not something notices introduced. Deliberately
  NOT fixed here: tightening two tables would leave the schema inconsistent
  while fixing nothing reachable. Logged in `claude/state-of-play.md` §Open.
  ✅ **DEPLOYED AND VERIFIED IN THE SERVED BUNDLE, 14 Aug 2026** — not in a
  browser, which the service worker has made a liar before. Fetched
  `/index.html`, read `/assets/index-B0FJg607.js` out of it, fetched that and
  searched it: `All notices`, `Post a notice`, `Nothing on the board`,
  `Take it down`, `announcement_stats` and `announcement_audience` all present.
  ⚠️ **AND THE SEARCH WAS PROVED NON-VACUOUS**, because a `.Contains` that
  always returns true proves nothing: the harness fixture strings
  (`ZZ Probe Squad`, `Sarah Nolan`, `A Volunteer With A Long Name`) and a
  nonsense control all came back ABSENT from the same bundle.
  ⚠️ **`Zayed` IS IN THE BUNDLE AND IS NOT A LEAK** — it was used as a control
  and came back FOUND. `src/screens/EventForm.jsx` has
  `DEFAULT_VENUE = 'Zayed Sports City, Abu Dhabi'`, so it was always there. A
  control has to be checked against the source before it is believed.
  ❌ **STILL UNEXERCISED: no coach has posted a notice and no parent has read
  one.** The bundle being served is not the feature working.

- ⏳ **THE AUTHOR IS NO LONGER IN THEIR OWN NOTICE'S AUDIENCE.** Jay: *"make the
  author change"*. `db/migrations/20260814_announcement_author_not_audience.sql`,
  **applied to production 14 Aug 2026**.
  ⚠️ **A COACH POSTING TO THEIR OWN SQUAD WAS COUNTED IN THE AUDIENCE THEY WERE
  WRITING TO**, and the client marks a notice read on render — so the receipts
  read **"1 of 25 seen"** the instant they pressed Post. The 1 was them and the
  25 counted them.
  ⚠️ **IT WAS INVISIBLE IN THE FIRST REAL TEST, WHICH IS THE PART TO CARRY.**
  That notice was posted by a CLUB-WIDE admin to a squad they are not attached
  to, so they were already outside its audience and it read a correct "1 of 8".
  **Whether the author was counted depended on the shape of their membership** —
  the same screen meant different things for a coach and for an admin, and
  nothing on it said so.
  ⚠️ **BOTH FUNCTIONS, OR THE SCREEN CONTRADICTS ITSELF.** `announcement_stats`
  makes the number and `announcement_audience` makes the list under it; the
  numerator needs the exclusion as well as the denominator, or a notice can
  report "1 of 0 seen".
  ⚠️ **Accepted consequence: a squad whose only active member is the coach now
  has an audience of ZERO**, so the counter disappears rather than reading
  "0 of 0" — already the documented behaviour, now reachable in one more case.
  ✅ Proved in a rolled-back transaction first (6 of 6), applied, then verified
  live: both functions carry the clause and `anon` is still refused execute.
  `db/tests/announcements.sql` gains steps 09c–09f and a C2 injection.

- 🐛 **SQUAD CONTACTS SAT FLUSH AGAINST THE CARD ABOVE IT** — reported from a
  screenshot. ⚠️ **The cause is worth more than the fix: `BlockTitle` carries
  `mt-[18px] first:mt-0`, and `first:` compiles to `:first-child`, which is
  scoped to the element's PARENT.** Wrapping a BlockTitle in a `<div>` therefore
  makes it that div's first child and silently zeroes its top margin. **The two
  other wrapped BlockTitles on that screen already carry a compensating margin**,
  which is exactly why this read as a one-off rather than as a pattern.
  ⚠️ **No test in the suite could see it** — jsdom applies no CSS. Pinned as a
  class token, the same proxy (and the same admission of being one) as
  `tests/page-header-wrap.test.js`.

- `2fa89fc` ✅ **VIEW-AS IS A DROPDOWN IN THE MASTHEAD, ON EVERY SCREEN.** Jay: *"i want
  to be able to select view as with a drop down from any screen, as an admin"*.
  Ruling: `claude/decisions/2026-08-14-view-as-everywhere.md`.
  ⚠️ **THIS OVERTURNS THE 7 Aug DECISION on its conclusion and NOT on its
  reasoning.** That one moved the control out of the masthead because an **84px
  text pill** truncated the club wordmark to "ABU DHABI HARLE…" — every item in
  that row is `shrink-0` except the wordmark, so the wordmark eats all overflow.
  It is now a **32px icon** and the persona is stated by `ViewAsBanner` directly
  above instead. **Do not put the persona text back on the trigger.**
  ✅ **MEASURED IN CHROMIUM, NOT REASONED**: trigger 32px, wordmark 257/257 not
  truncated, **296px of slack left** — and the slack is a probe result that
  matches the measured `flex-1` spacer exactly. Menu fits at 375px and 320px
  with no document overflow; Escape closes and returns focus.
  ⚠️ **THE FIRST PROBE WAS A BROKEN CHECK AND READ AS A PASS.**
  `scrollWidth > clientWidth` never fires here — it reported "not truncated" at
  every width down to a 142px box. The wordmark re-flows rather than overflowing
  its own box, so the working detector compares the NATURAL TEXT WIDTH
  (`Range.selectNodeContents`) against the box.
  ⚠️ **Rows are labelled "Coach"/"Parent" under a squad heading, and each
  carries an `aria-label` of "Coach of U12 Boys"** — a visual heading is a
  visual association only, and without it a screen reader gets fifteen buttons
  all called "Coach".
  ⚠️ **`AdminDashboard` lost its copy** rather than keeping a second one, and
  its "change who you are previewing **below**" copy was reworded — "below" now
  points at nothing.
  ⚠️ **Escape, outside-click and focus-return are hand-written now** that this
  is not a `Sheet`. `tests/view-as.test.jsx` is what stands behind them.

## 13 Aug 2026

- `8213cad` ✅ **STAFF PHOTOS — THE SQUAD CONTACTS CARD HAS FACES, AND THE PLAN IS DONE.**
  Phase 4, the last of `claude/plans/2026-08-13-squad-staff-on-home.md`. All
  four phases shipped in one day. `profiles.photo_path`, a private
  `staff-photos` bucket, two storage policies, `public.set_my_photo()`, and a
  "Your photo" card on `/more`.
  ⚠️ **A SEPARATE BUCKET FROM `player-photos` — a ruling, not tidiness.** That
  one holds photographs of CHILDREN behind policies written around squad
  membership; nothing written for staff can widen it.
  ⚠️ **OWN PREFIX ONLY, narrower than the player rule.** A player photo may be
  uploaded by that child's coach because a nine-year-old cannot. A coach is an
  adult with their own login.
  ⚠️ **`FOR ALL` with BOTH `using` AND `with check`** — an INSERT consults
  `with check` alone, so `using` by itself would let anybody signed in write
  under somebody else's prefix. Proved by executing it, both ways.
  ⚠️ **`private.can_see_staff_photo` mirrors `my_squad_staff()`**; the card
  takes the name from one and the face from the other, so drift means a
  photograph of somebody the app will not name. Harness
  `db/tests/rls-staff-photos.sql` — 8 steps, an injected fault that flips the
  read, and a separate arm proving a PENDING coach's photo stays hidden.
  ⚠️ **`profiles.photo_path` is NOT column-granted**, unlike `memberships.title`
  — a column grant covers the whole `authenticated` role, and this is written by
  the person themselves through the RPC, which refuses a key under anyone
  else's id.
  ⚠️ **`getMyProfile` is a column list and needed the name adding.** Omit it and
  `/more` shows the monogram forever while an upload appears to save and then
  vanishes — silent, and it looks like storage.
  ⚠️ **The harness email fixture was LENGTHENED because it had gone vacuous.**
  The 40px avatar took 52px out of the row, and the old 44-character address
  stopped overflowing with or without `break-all` — so the overflow check would
  have passed on a card with no guard. At 84 chars, removing `break-all` gives
  **521px against a 320 viewport**. Measured both ways.
  ❌ **Nobody has uploaded one in the real app** — no `/more` scenario exists in
  `harness/`, so the control itself is unit-tested and unexercised.

- `4ba07e7` — ❌ **NINE OF THE FIFTEEN DATABASE HARNESSES COULD NOT FAIL, AND `db:check`
  ITSELF WAS THE REASON.** Found hours after that runner shipped. It threw on a
  SQL *error* and discarded every result set — so a harness asserting via SELECT
  (`select count(*) as leaked_expect_0`) reported `ok` whatever came back. The
  verdict was computed, printed and compared to nothing, in nine files, every one
  guarding an RLS boundary. **The same bug one layer up: the runner removed the
  friction that stopped anyone RUNNING the checks and left most of them unable to
  report a wrong answer.**
  ✅ **The runner now refuses a harness with no `raise exception`** — the same
  shape as its begin/rollback gate — **and prints every result row.** All fifteen
  carry assertions, and every one was proved to fire against an injected fault.
  ❌ **`rls-can-edit-team-status.sql` was broken THREE ways**, none ever hit:
  it inserted `profiles.club_id` (no such column — instant 42703), never granted
  its temp table to `authenticated` (42501, which reads exactly like the RLS
  refusal it tests), and chose its subject squad by `order by sort_order limit 1`
  — **today that is U6 Tag, with zero players and zero events**, so every
  "expect 0" was trivially true and the injection could never flip. It now picks
  the squad with the most data and **raises if no squad has both**.
  ⚠️ **The rule: a harness must pick its subject by the property it needs, never
  by an ordering that happens to have it today.**

- `4ba07e7` — ✅ **`anon` COULD EXECUTE TEN OF THE FOURTEEN `public` FUNCTIONS. NOW TWO,
  BOTH DELIBERATE.** `db/migrations/20260813_revoke_anon_execute.sql`.
  ⚠️ **The house pattern does not do what it reads as**: Supabase ships
  `alter default privileges … grant all on functions to anon, …`, a grant BY
  NAME that `revoke … from public` never touches. Nine migrations are written as
  though it does.
  ⚠️ **BOTH REVOKES ARE NEEDED — the first attempt fixed five of eight and
  looked done.** A function can hold a named `anon` grant and a `PUBLIC` grant
  independently, and `anon` inherits through PUBLIC. **Only
  `has_function_privilege` answers this**, never the migration text.
  ⛔ **`calendar_events_for_token` and `register_my_player` keep `anon`.** The
  first is the calendar feed; a subscribed URL cannot be changed remotely, so
  revoking it would break every feed in the club unrepairably.
  `db/tests/grants.sql` §3b now fails in **both** directions, and its self-test
  proves each arm catches.
  ✅ **Smoke-tested live afterwards: 200, `text/calendar; charset=utf-8`, valid
  VCALENDAR.**

- `4f2df85` — ✅ **AN AGE GROUP CAN SEE WHO LOOKS AFTER IT — "Squad contacts" is on Home.**
  Phase 3 of `claude/plans/2026-08-13-squad-staff-on-home.md`, completing Jay's
  13 Aug ask. One card per squad the person is attached to: name, title or role,
  and **tappable `tel:` / `mailto:` links**.
  ⚠️ **CONTACT DETAILS ARE IN ON A RULING THAT OVERTURNED THE PLAN.** The plan
  recommended a per-person opt-in toggle defaulting OFF; Jay: *"the staff
  automatically opts in when accepting the position"*. Do not narrow it back.
  ⚠️ **A `SECURITY DEFINER` FUNCTION, NEVER A POLICY ON `profiles`** —
  `public.my_squad_staff()`, `db/migrations/20260813_my_squad_staff.sql`. **RLS
  authorises ROWS, not COLUMNS**, so a policy wide enough to show a coach's name
  hands over their whole row; a column grant cannot fix it either, because
  grants apply to the whole `authenticated` role including the admins who need
  `email`/`phone` on Accounts. The boundary is the fixed seven-column result,
  which is why `is_super` and `admin_rights` are unreachable rather than undrawn.
  ⚠️ **GATED ON `can_see_team`, NOT `is_attached_to_team`** — the difference is
  `status = 'active'`. A pending member sees an empty card; fixtures are not
  sensitive and a phone number is.
  ⚠️ **THE BLOCK IS BUILT FROM THE PERSON'S OWN MEMBERSHIPS, NOT `visibleTeams()`**,
  which would give an admin fifteen cards — and that filter is what makes
  view-as narrow correctly.
  ✅ **PROVED AGAINST AN INJECTED FAULT ON LIVE, IN A ROLLED-BACK TRANSACTION.**
  `db/tests/rls-squad-staff-visibility.sql`: the other squad's coach is invisible,
  **and becomes visible the moment the same person joins that squad** — without
  which every zero is equally explained by "the function returns nothing to
  anyone". A control asserts the member still cannot read `profiles` directly.
  ⚠️ **STILL EMPTY FOR MOST OF THE CLUB, BY DESIGN** — re-measured the same
  evening, 12 of 15 squads have nobody attached and 0 of 8 staff have a title.
  The wording says the staff are not *listed*, never that the squad has none.
  ⚠️ **AND `revoke … from public` DOES NOT KEEP `anon` OUT.** Supabase's default
  privileges grant to `anon` by name. Six other public RPCs are anon-executable;
  this one carries an explicit `from anon` revoke and the harness asserts it.

- `ffdcddf` — **New app icon — the crest's bat on a harlequin field — and the maskable icons
  are mask-safe for the first time.** The bat is traced from `src/assets/crest.png`
  as Bézier curves rather than redrawn. ⚠️ **The old maskable files were not
  maskable:** 9.6% of the crest sat outside the 80% safe circle, so Android's mask
  clipped the shield shoulders and the top of the wordmark. Measured 0% outside
  now. `src/assets/logo-mark.svg` is the same mark for the masthead; the five
  screens that render `crest.png` are deliberately untouched, so only the installed
  icon and the favicon change.

- `4990e1d` — ⛔ **THE RESTORE DRILL IS TABLED — Jay, 13 Aug 2026: "table the restore drill
  until i bring it up again".** Do not start it, do not offer to, do not ask
  again.
  ⚠️ **TABLED IS NOT DONE, AND THE SECTIONS DESCRIBING IT ARE KEPT IN FULL.** He
  tabled the WORK, not the FINDING — the same split a session had to write down
  when he tabled the AI build but not the AI ruling. **Nobody has ever got a
  photograph back, the backup is still an untested claim for restore, and every
  document keeps saying so.** Softening those lines would turn a known gap into
  an invisible one, which is the failure the whole feature exists to guard
  against.

- `c536656` — ✅ **THE PLAYER PHOTOGRAPHS ARE BACKED UP — live, nightly, and verified.** The
  only unrecoverable thing in the club now has a copy. Cloudflare R2 bucket
  `quins-player-photos` (APAC, private), edge function deployed with
  `verify_jwt: false`, `pg_cron` at 22:17 UTC.
  **6 of 6 copied, zero failed, five seconds**; the second run copied nothing.
  ⚠️ **`pg_cron` INSTALLED** — previously recorded as absent, and as the reason a
  scheduled edge function was impossible on this project.
  ✅ **THE SCHEDULE WAS PROVED TO FIRE.** A temporary probe job at `* * * * *`
  reached `succeeded` in `cron.job_run_details` with its summary in
  `net._http_response`, then was unscheduled. **A schedule that has never fired
  is not a schedule.**
  ✅ **BYTE-IDENTITY BY MD5, NOT BY MATCHING SIZE** — `etag_mismatches: 0` on all
  six, comparing ETags from both sides. ⚠️ **The zero is not vacuous**: every
  source row carries an ETag and both sides deliver it QUOTED, so the
  quote-stripping bug a unit test caught pre-deploy would have shown six
  mismatches, not zero. That bug was real — quotes were stripped before trimming.
  ✅ **APPEND-ONLY IS NOW ENFORCED BY R2, NOT ONLY BY THE CODE** — bucket lock
  `retain-one-year`, 365 days, applied while the bucket was empty so it binds
  every object ever written. **This closes the gap the plan called unfixable in
  the credential**: R2 tokens are Object Read only or Object Read AND Write, and
  write includes delete. ⚠️ **The cost, chosen knowingly: a deletion request
  cannot be fully honoured in the backup for up to a year.**
  ❌ **NOBODY HAS GOT A PHOTOGRAPH BACK YET. Copying is not restoring**, and the
  drill's fourth requirement is outstanding.
  ⚠️ **Two traps recorded in the runbook**: `R2_ACCOUNT_ID` set to the whole
  endpoint URL rather than the account id, and Supabase's confirmation dialog on
  replacing a secret — miss it and the value silently does not save, which looks
  exactly like the fix not working.
  ⚠️ **No credential was ever handled by the assistant.** The function is invoked
  the way cron invokes it — Postgres reads the shared secret from the vault — and
  the R2 values were verified by comparing SHA-256 digests rather than by reading
  them.

- **`npm run db:check` — the SQL harnesses finally have a way to be run.**
  `scripts/db-check.mjs`, runbook `claude/runbooks/db-harnesses.md`, nightly job
  `.github/workflows/db-check.yml`.
  ⚠️ **THE FIX WAS FRICTION, NOT DISCIPLINE.** `db/tests/grants.sql` had been red
  against live for three days because running the harnesses meant pasting
  fourteen files into the Supabase SQL editor by hand, so it happened roughly
  never. A prose warning in the file's own header did not help — it said "parts 1
  and 2 were run against live and passed", which was true on the day and is
  exactly what stopped anyone looking again.
  ⚠️ **THE RUNNER ENFORCES THE ROLLBACK RATHER THAN TRUSTING IT.** It refuses any
  harness containing `commit;`, or lacking `begin;`/`rollback;`, **before it
  connects** — because several harnesses inject a real fault on production to
  prove they are not vacuous, and one of them is "any club admin may rewrite any
  member's login email". **Both refusals proved by planting a bad file.**
  ⚠️ **THE NIGHTLY JOB IS INERT UNTIL THE SECRET EXISTS**, rather than failing
  every night with a credential error everyone learns to ignore. **No
  `pull_request` trigger, and that is a security decision** — this repo is
  public, and `schedule`/`workflow_dispatch` are the only triggers a fork cannot
  fire.
  ⚠️ **NOT A REQUIRED CHECK AND MUST NOT BECOME ONE.** These assert against LIVE:
  a red run means production drifted, not that the branch is bad.
  ✅ **`db/tests/photo-backup.sql` closes a gap opened the same day** — those
  grants had been verified as ad-hoc SQL in a chat session, which is once, by one
  person, somewhere nobody can re-run. Verified against live including its
  self-test, and the injected grant confirmed gone after the rollback.
  ⚠️ **`pg` added as a devDependency** — the first for tooling rather than the
  app. `psql` is not on jay-pc, and a runner Jay cannot run does not fix the
  friction that caused this.

- `3a3b05d` — **The player photographs get a backup — written, and at the time of that PR NOT RUNNING.** ✅ **It is running now** — see the entry at the top of today. An append-only
  mirror of `player-photos` into a private Cloudflare R2 bucket:
  `supabase/functions/backup-player-photos/index.ts`,
  `db/migrations/20260813_photo_backup.sql`, and the deploy/restore/drill
  procedure in `claude/runbooks/player-photo-backup.md`.
  ⛔ **NOTHING HAS RUN AND THE GAP IS NOT CLOSED.** No Cloudflare account, no
  applied migration, no deployed function, no installed `pg_cron`, and **no
  photograph has ever been copied or got back.** The ⛔ item in
  `claude/state-of-play.md` stays open until the runbook's drill passes.
  ⚠️ **APPEND-ONLY IS ENFORCED BY THE CODE HAVING NO WAY TO SAY "DELETE"**, not by
  a flag — a mirror that faithfully replicates a deletion is no protection against
  the most likely thing that will go wrong, which is a deletion. In this app a head
  shot is destroyed by REPLACEMENT: a new timestamped key is written and the old
  object removed, so the old key stays in R2 forever. **A test asserts no export
  ever matches `/delete|prune|remove|sync/`**, proved by adding an
  `objectsToDelete` and watching it go red.
  ✅ **THE FIRST EDGE-FUNCTION LOGIC IN THIS REPO WITH ANY VITEST COVERAGE.**
  `plan.ts` and `sigv4.ts` import nothing, so Deno and vitest both load them.
  Signing is asserted against the SHA-256 of the empty string and RFC 4231's first
  HMAC case — ⚠️ **fixed facts of the algorithms rather than a published signature
  constant, which would only have been worth the accuracy of the number recalled.**
  ⚠️ **`pg_cron` IS NOT INSTALLED on this project** (`installed_version` null,
  measured), so the migration installs no extension and the schedule is a step in
  the runbook.
  ⚠️ **R2's TOKEN CAN DELETE.** Its presets are Object Read only or Object Read and
  Write; there is no create-without-delete. Bucket versioning plus Object Lock is
  the real control and is **not done**.
  ✅ **The migration IS applied** — rehearsed first in a rolled-back transaction on
  production, where the listing function returned the live object count and both
  new objects were confirmed gone after the rollback. Captured into
  `db/schema/tables.sql`, `functions.sql`, `policies.sql` and `grants.sql` in the
  same commit.
  ⚠️ **`photo_backup_runs` IS THE FIRST TABLE IN THIS SCHEMA WHERE `anon` HOLDS NO
  PRIVILEGE AT ALL.** Every other table leans on RLS alone against Supabase's
  default grant; here the default was revoked too.
  ❌ **AND RUNNING THE VERIFICATION FOUND SOMETHING OLDER: `db/tests/grants.sql`
  had been failing against live since 10 Aug and nobody had seen it, because
  nobody had run it.** Its "these five are the only column-level grants" became
  false the same day it was written. The database was right and the check was
  wrong. Fixed, re-run green, and two assertions added that nothing had —
  `memberships.title` must still be granted, `is_super` and `admin_rights` must
  not be. ⚠️ **A check nobody runs is not a check, in the same way a check that
  has never failed is not a check.**
  ⚠️ **`db/schema/policies.sql`'s RLS list had also drifted** — `social_ideas` was
  missing since 12 Aug. Re-measured against `pg_class`; nothing was exposed.

- `22739ad` — ✅ **EVERY SQUAD AND WHO LOOKS AFTER IT — `/admin/staff` is live**, plus
  `memberships.title` so a coach can be a Head Coach.
  ⚠️ **BUILT IN THE OPPOSITE ORDER TO THE REQUEST, ON A MEASUREMENT.** Jay asked
  for age groups to see their coaches on the HOME screen. Measured first: twelve
  of fifteen squads had no coach, manager or medic attached at all — so the
  member-facing card would have shipped empty to 80% of the club with no way to
  see why. The admin directory needs no migration for its reads, no RLS change
  and no photos, and it is the only view that surfaces the missing data the rest
  of the feature depends on. The Home card is still phase 3.
  ⚠️ **THE COLUMN NEEDED ITS OWN GRANT, AND THE OBVIOUS FIX IS A SECURITY HOLE.**
  `authenticated` has no table-level UPDATE on `memberships` — it holds
  column-level UPDATE on six columns, with `is_super` and `admin_rights`
  deliberately excluded. `title` is the first column added since that became
  true, so it was unwritable until granted explicitly, and the failure reads
  exactly like an RLS refusal. **`grant update on memberships to authenticated`
  would fix the symptom and hand every admin the ability to self-promote to
  super admin.**
  ⚠️ **NO CHECK CONSTRAINT ON THE TITLE**, the same ruling `admin_rights`
  carries: a constraint means a migration per job title, for a value that labels
  a person and grants nothing. ⚠️ **And a title is NEVER permission** —
  `can_edit_team` keys off `role`.
  ⚠️ **TWO QUERIES AND A CLIENT-SIDE JOIN, NOT ONE EMBEDDED READ** — a
  deliberate retreat. The tidy version depends on PostgREST keeping a parent row
  when an embedded filter matches nothing; if that assumption were wrong the
  twelve empty squads would vanish, which is the one thing the screen exists to
  show, and it would read as "no gaps" rather than as a bug.
  ⚠️ **NOBODY IS ATTACHED TO A SQUAD FROM THIS SCREEN**, deliberately — the
  grant flow lives in the 1,612-line `Accounts.jsx` that the accounts redesign
  also wants to change, and pulling it in would collide with that work.
  ✅ **Three faults injected and all three caught by the test written for them**,
  with the other 21 still passing: the blank-name fallback losing whitespace, a
  failed load rendering as "0 squads have nobody", and a refused title save
  leaving the typed value on screen.

- **Realtime APPLIED and observed working; a third events index; and the schema
  capture gains a category it never had.** Two migrations applied to production
  and captured in the same commit:
  `db/migrations/20260813_realtime_publication_events.sql` and
  `db/migrations/20260813_events_starts_index.sql`.
  ✅ **Realtime delivery proved end-to-end, twice** — a fixture edited in one
  browser tab changed in another with no refresh, and again in reverse on the
  undo. ⚠️ **The confound was ruled out rather than assumed**: looking at the
  second tab focuses it, so a focus-refetch would have faked it. There is no
  `visibilitychange`, focus listener or `refetchOnWindowFocus` in `src/` — and
  that negative was checked against a control search that found real matches.
  ✅ **The RLS policy proved to discriminate**, separately: a genuine non-admin
  sees a probe fixture in their own squad and not one in a squad they are not
  in, inside a rolled-back transaction. **The visible row is the control.**
  ❌ **NOT observed: a non-admin failing to receive someone else's change.**
  Both tabs were the same admin. Well-evidenced, not measured.
  ⚠️ **That outstanding test must be an EDIT, never a DELETE.** Supabase does
  not apply RLS to deletes, so a deleted fixture reaches every subscriber — a
  false alarm that would revert a working migration under the test's own rule.
  ⚠️ **`events_club_starts_idx` DOES NOT SERVE THE PATH IT WAS ADDED FOR.** Its
  own comment states the rule that condemns it: `listEvents` sends no `club_id`
  predicate, so the club-wide read was still a `Seq Scan`. `(starts_at, id)`
  turns it into an Index Scan with the Sort node gone — measured against ~4,000
  seeded events in a rolled-back transaction on production, read by plan shape
  rather than wall time. ⚠️ **Deep paging barely improves**; OFFSET walks the
  skipped rows regardless, so do not justify the index that way.
  ⚠️ **`db/schema/` NEVER CAPTURED PUBLICATIONS**, which is how a feature that
  had never once worked stayed invisible to every audit. Now captured, with the
  queries added to `db/schema/README.md`.
  ⚠️ **Corrected in `state-of-play.md`: the audit's "no index on `team_id` or
  `starts_at`" was fixed the same day it was written** and the file went on
  asserting it in a line labelled load-bearing.

- `3d9b61f` — **The club went live, and three findings stopped being
  theoretical.** `state-of-play.md` said *"Only Jay uses the app. No parent or
  coach has been onboarded."* Measured the same afternoon: 16 auth users, 12
  people across 3 squads, 9 players, **5 child photographs**, 3 calendar links,
  3 super admins.
  ⚠️ **The photos have no backup, the calendar links cannot be revoked, and the
  flaky suite now guards a site real families use.** All three were written as
  future problems that morning.
  ⚠️ **Also corrected the audit's realtime finding, which was wrong**, and caught
  a volunteer's real name being committed to a PUBLIC repo — `docs:check`
  stopped it, and the line names the job instead.
- `4306689` — **Realtime is turned ON — it had never worked, and the fix is the
  opposite of the obvious one.** ✅ **THE MIGRATION IS NOW APPLIED AND VERIFIED
  LIVE** — see the entry above this one for the proof;
  `db/migrations/20260813_realtime_publication_events.sql`.
  ⚠️ **`src/data/events.js` has subscribed to `postgres_changes` since the app was
  built and never received a single message**, because `public.events` was not in
  the `supabase_realtime` publication — measured, that publication held ZERO
  tables. Two features silently did not work: Schedule/Dashboard auto-refresh and
  the live availability list.
  ⚠️ **NO CLIENT-SIDE FILTER, WHICH REVERSES THE ORIGINAL INSTRUCTION.** A
  `team_id` filter reads as an optimisation and is a bug: `events` is replica
  identity DEFAULT, so a DELETE carries the primary key only, the filter matches
  nothing, and **a cancelled fixture stops disappearing from other people's
  screens**. RLS already scopes delivery. ⚠️ **And do NOT raise replica identity to
  FULL to make filters work** — Supabase does not apply RLS to deletes, so FULL
  would broadcast opponent, venue and notes to every subscriber.
  ⚠️ **A test now asserts the config carries no `filter` key**, and it was proved
  by injecting the filter and watching it go red — along with removing the
  debounce, and forgetting to cancel the pending fire on unsubscribe. Three
  faults, three reds, one control.
  400ms debounce added, because the callback is a full schedule refetch.
  ⚠️ **SCOPE: `events` only.** `availability` is excluded deliberately — its
  subscription ALREADY filters on `event_id` and it is also replica identity
  DEFAULT, so switching it on would immediately have the same delete bug. **That
  needs its own ruling rather than being buried in a fix.**

- `dd80f48` — **⚠️ THE APP HAD BEEN TELLING WAITING PARENTS SOMETHING FALSE FOR FOUR DAYS.**
  `PendingApprovalBanner` in `src/components/AppShell.jsx` said *"Nobody is emailed
  automatically, so if nothing has changed in a few days, mention it to your coach or
  team manager."* That was **true when written and false from 9 Aug**, when
  `db/migrations/20260809_notify_pending_membership.sql` put a trigger on the membership
  row that emails every coach, team manager and admin for the squad via the
  `notify-approval` function — **confirmed ACTIVE on the live project, and confirmed by
  Jay and the U18 team manager both receiving one.** So the app was sending parents to
  chase a club that had already been told. ⚠️ **Claude repeated the false claim back to
  Jay as a "still open" gap, twice, having read it from the comment rather than measured
  it** — the correction came from Jay: *"i do get the emails."* ⚠️ **NO TEST ASSERTED
  THE SENTENCE**, which is exactly why a green suite carried it for four days; there is
  now an anchor pinning the CLAIM rather than the prose, and **it was fault-injected by
  restoring the old sentence and watching it fail.** `src/components/RequestAccess.jsx`'s
  comment was half-stale in the same way and is corrected: the club IS now told when an
  access request arrives (`20260812_access_request_notify.sql`), while **nobody is
  emailed on APPROVAL** — still true, and the only direction that paragraph speaks to.
  ⚠️ **The notification still fails CLOSED and silently** if its Vault secrets are
  missing, so the new wording stops short of promising delivery.

- `280f37b` — **The registration form requires a FAMILY name too, and deliberately breaks with the
  rest of the app to do it.** Jay: *"why would we only have them enter their first
  name?"* — a fair challenge, and the honest answer was that the field had been copied
  from an existing convention rather than thought about. ⚠️ **`NamePrompt`,
  `RequestAccess` and the You card all mark the family name OPTIONAL**, and
  `src/components/NamePrompt.jsx` states why: *"plenty of people have one name, and a
  gate nobody can pass is worse than a sortable list."* That holds for those fields,
  which exist so the app has A name for somebody. It does not hold for this one, which
  exists **only** so a coach can identify a stranger asking to join a children's squad —
  and "Sarah" does not do that in a club with hundreds of families. ⚠️ **Measured before
  changing it, not argued:** of 13 adults with a confirmed name, **ZERO** have no family
  name, and **zero of 9** players have a single-word name — the exemption was protecting
  nobody here. Jay declined the offered "I have only one name" escape hatch, so this is a
  hard requirement; ⚠️ **if a genuine mononym ever registers, the guard in
  `firstProblem()` is the line to revisit and the escape hatch is the fix — not deleting
  the requirement.** ⚠️ **Fault-injected:** disabling the guard makes the "refuses a
  first name alone" test fail. The old assertion was INVERTED rather than deleted, and a
  positive twin was added — the same journey must still succeed once the family name is
  filled in, so the negative is not passing for the wrong reason.

- `02e9a05` — **The SAME nameless-row fix, at the two sites the first pass missed.** ⚠️ **The
  previous commit fixed `PendingApprovals` and left `'No name yet'` in the "Waiting for
  access" list and the dismissed list — and those are the more visible of the three**,
  because a person who signs up and completes NEITHER onboarding form still lands there
  carrying nothing but an address. **Found by grepping the DEPLOYED production bundle
  for the string that was supposed to be gone and finding it still there**, not by a
  test: the suite was green because the two remaining sites had a test asserting the
  placeholder. Both now fall back to the email address, and the address is suppressed
  from the line below so it is not printed twice, a line apart. The old assertion in
  `tests/accounts.test.jsx` is rewritten rather than deleted, and now pins the count at
  exactly one. ⚠️ **THE LESSON: a green suite proved only that the sites WITH tests were
  fixed.** The verification that caught it was checking the shipped artefact against the
  claim, which is why "must be GONE" belongs in a post-deploy check and not only in a
  test.

- `d7643b8` — **The approval queue can name the person it is asking about.** Plan:
  `claude/plans/2026-08-13-registrant-name.md`. Reported by Jay watching a real
  registration land with no name on it, and asking whether it was waiting on email
  confirmation. ⚠️ **It was not, and the database rules that out outright** —
  `register_my_player` refuses to run unless `email_confirmed_at` is set, so a queue row
  cannot predate confirmation. **Measured on the live database instead:** profile
  created 08:34:27, email confirmed 08:34:46, membership created 08:35:50, name
  confirmed 08:38:33 — **a 2m 43s window in which an admin was asked to approve somebody
  the screen could not name.** ⚠️ **THE ORDER WAS FORCED AND BACKWARDS.** `NamePrompt` is
  the only thing that captures a person's own name and `src/components/AppShell.jsx`
  mounts it inside the `ready` branch (`memberships.length > 0`) — and the membership is
  ALSO what creates the queue row, so the row could not help but exist first. ⚠️ **And
  NamePrompt is skippable, so the gap does not always close.** Fix: the registration form
  now asks for the registrant's own name when `name_confirmed_at` is null, and writes it
  **before** the first `register_my_player` call — the ORDER is the fix, and the tests
  assert on call order rather than on the calls merely happening. Plus a fallback in
  `src/screens/Accounts.jsx`, which rendered `Added by No name yet · deniro@example.com`
  — a placeholder standing in front of the one fact identifying the person; the address
  is now promoted into the name slot and not repeated. ⚠️ **NOT caused by the multi-child
  change** — that commit touched neither `AppShell.jsx`, `NamePrompt` nor the queue.
  ⚠️ **Fault-injected three ways, each reverted, all three reproduced:** skipping the name
  write entirely → both "written BEFORE any child" tests fail on the missing call;
  **relocating the name write to AFTER the children loop → both order assertions fail
  while every other test stays green**, which is the one that matters, because that is
  precisely the regression that would silently restore the race; and restoring the old
  placeholder → the queue test fails printing the original string back verbatim,
  `Added by No name yet · hannah@example.com`. ⚠️ **NOT verified live by Claude** — needs
  a parent sign-in.

- `1d87af7` — **A count on the approvals entry point — DESIGNED, NOT SHIPPED.**
  ⚠️ **NO SHA, DELIBERATELY.** This entry cited `6c4325f` — the BRANCH commit —
  and CI went red with *"changelog cites a SHA that is not a commit"*. The branch
  was rebased, so that SHA no longer exists; it survived only as a loose object in
  the clone that wrote it, which is exactly the trap `CLAUDE.md` describes for
  squash merges. **Never cite a branch SHA.** The next pull request cites the
  squash SHA, which is the only one that will exist.
  `claude/plans/2026-08-13-approval-badge.md`, plus the SHA catch-up for `231b660`.
  ⚠️ **`docs:check` does NOT validate paths inside `claude/plans/`** (`scripts/docs-check.mjs`
  excludes it, because a plan may name files that do not exist yet), so that plan's paths
  were checked by hand. (SHA added here by the next commit, per the one-behind rule.)

- `231b660` — **A parent can register more than one child — the FORM was the limit, never the
  database.** Plan: `claude/plans/2026-08-13-multi-child-registration.md`. Jay: *"we
  need the ability for parents to add multiple children, up to 5, i thought we built
  that in"* — we had not. ⚠️ **The "5" that made it look built is the anti-abuse
  brake**, and `claude/decisions/2026-08-08-parent-self-registration.md` says so in as
  many words: *"refuse beyond a small number of pending rows per profile"*. It counts
  PENDING rows precisely so an approved parent may add another child later, which
  `db/migrations/20260808_register_my_player.sql` also states outright. Meanwhile
  `AddYourPlayer` took one name and `AppShell` mounts it only while
  `memberships.length === 0`, so it vanished after the first child and the only
  remaining route was an admin on a desktop-only screen. **No migration** — new
  `src/components/PlayerRegistrationForm.jsx` (up to five rows, saved SEQUENTIALLY so a
  partial failure can name which child is missing, the same reasoning
  `src/screens/Register.jsx` already recorded), rendered by both `AddYourPlayer` and a
  new card in `src/components/YourPlayers.jsx`. ⚠️ **That card's gate is the ROLE, not
  the player list** — it used to return `null` on an empty list, which hid it from a
  parent whose hand-granted membership carries `player_id = null`, the exact bug
  `src/screens/More.jsx` already had written down. Plus a per-child "waiting for
  approval" chip, because `isPendingOnly` is `every` and a parent with one approved and
  one pending child correctly gets no banner. ⚠️ **Fault-injected five ways, each
  reverted after, and FOUR of the five reproduced:** leaving saved rows in the list →
  the retry test finds 2 rows where it expects 1; reversing the save loop → the ordering
  assertion gets Ada where Chidi belongs; restoring the old `players.length === 0` gate
  → the null-`player_id` test cannot find the button; changing the chip to an
  account-wide `every(status === 'pending')` → the chip vanishes from the mixed account.
  ⚠️ **THE FIFTH DID NOT REPRODUCE, AND THE CODE COMMENT WAS THE THING THAT WAS WRONG.**
  Switching the row key to the array index was predicted to leave one row's typed name
  in another's box; the removal test stayed GREEN, because every field is CONTROLLED
  from state, so React re-renders the reused node with the right value. The classic
  index-key bug needs an uncontrolled field and there is none here. The stable key is
  kept — the field `id`s are derived from it — but `blankRow`'s comment now says plainly
  that **no test discriminates on it**, instead of describing a bug that cannot happen.
  ⚠️ **NOT verified live by Claude** — the real flow needs a parent sign-in, which Claude
  does not do.

- `747eb7f` — **The 13 Aug audit backlog was missing four of its own findings.**
  `claude/state-of-play.md` gains the calendar-token, dependency-scanning, CSP and
  repo-hygiene items, plus the measured bundle numbers. ⚠️ **That section IS the
  audit** — the report was never committed — so a line deleted from it is a finding
  that ceases to exist. (SHA added here by the next commit, per the one-behind rule.)

- `3d3e5bc` — **Session handoff for the day**, `claude/handoffs/2026-08-13-session.md`.
  Seven PRs, and the half worth reading is the five things the session got wrong.

- `328fba4` — **The error-boundary fallback is verified in a real browser.**
  Chromium at 360px, a realistic crash injected into the PUBLIC `/privacy` route
  so no login is needed and the OUTER boundary is the one exercised.
  ⚠️ **A by-hand check, not a gate** — `harness/check-overflow.mjs` still has no
  crashing scenario. Session record: `claude/handoffs/2026-08-13-session.md`.

- `d10602d` — **A crashed screen no longer blanks the whole app.** There was no error
  boundary anywhere in `src/`; React 18 unmounts the entire tree on an uncaught
  render error, so one null where a component expected a string gave a parent a
  white page with no text and no way back.
  ⚠️ **AND REFRESHING DID NOT FIX IT**, which is what made this worse than the
  ordinary case — the service worker serves the same bundle, and the
  NetworkFirst cache may return the same poisoned response. So the fallback
  offers **Clear saved data** (purge then reload) as well as **Try again**.
  ⚠️ **TWO BOUNDARIES, NOT REDUNDANT**: AppShell wraps the routed screen only so
  the nav survives; App wraps everything, including the four public routes that
  render outside any AppShell — two of which the Play Store opens cold.
  ⚠️ **AppShell's is KEYED ON `pathname`**, or a crashed screen never clears
  while the person taps other tabs.
  ⚠️ **THE WIRING IS TESTED SEPARATELY FROM THE COMPONENT.** Proved by injecting
  three faults: **removing the AppShell boundary turns the wiring file red while
  the component file stays GREEN** — the exact state `src/` was in this morning,
  and the reason a component test alone would have been worthless.
  ⚠️ **Two of the repo's own guardrails caught the first draft and both were
  right** — `button-sweep` rejected two hand-rolled buttons, `theme` rejected a
  raw hex. Fixed by routing through `<Button>` and `text-ink-muted`, not by
  exempting either.
  ✅ **VERIFIED IN CHROMIUM AT 360px**, by injecting a realistic crash
  (`Cannot read properties of null (reading 'full_name')`) into the PUBLIC
  `/privacy` route — no login needed, and it exercises the OUTER boundary that
  `harness/` cannot reach. `scrollWidth` 360 against a 360 viewport: no
  overflow. ⚠️ **A by-hand check, not a gate** — `harness/check-overflow.mjs`
  still has no crashing scenario, so look again if the fallback's markup
  changes.
- `74862ce` — **The `search_path` rule is a THREE-WAY TEST, not "everything is pinned except
  one"** — plus a migration pinning
  `private.events_result_from_components` (**written, NOT yet applied**,
  `db/migrations/20260813_pin_scoring_trigger_search_path.sql`).
  ⚠️ **The same advisor warning got three different CORRECT answers in one day**,
  which is why the exemption note was rewritten as a test rather than left as a
  rule that read as general: DEFINER → always pin; INVOKER but decides access or
  runs in a policy or trigger → pin anyway; INVOKER touching and calling nothing →
  recording it is enough. `squad_expects_gender` is the only function reaching the
  third branch, and its exemption is unchanged and still correct.
  ⚠️ **PIN IT TO THE RIGHT VALUE — `'public, pg_temp'` here, NOT the `''` used on
  `social_idea_owner` hours earlier.** This one reads `public.events` and calls
  into `private`; an empty path breaks it at the first trigger fire. Matched to its
  own sibling `scoring_kinds_for_team`, not to the most recent nearby fix.
  ⚠️ **A CHANGED ADVISOR LIST IS NOT EVIDENCE THE DATABASE CHANGED.** The warning
  appeared hours after a run that omitted it, which read as an unannounced
  production change. It was not: the function has been unpinned since 12 Aug
  (`390a6e5`, `c8a05c7`) and repo and live match exactly. **Checked before acting;
  the alarming reading was false.**
- `c181233` — **THE BACKUP RESTORE IS DRILLED AND IT WORKS** — 12 Aug 18:05 backup restored
  into a throwaway project, checked, deleted within the hour. £0.
  ⚠️ **The discriminating check, because "there were rows" proves nothing: SIX
  `Test Player` rows in the restore against ZERO live.** They were deleted on
  13 Aug, after the backup, so that number cannot be produced by an empty restore,
  a partial one, or by querying the wrong database.
  ❌ **THE PREDICTION WAS WRONG, WHICH IS THE POINT.** `auth.users` was named as
  the thing most likely to fail; it restored cleanly, all 8. Sound reasoning, wrong
  answer.
  ⚠️ **AND THE PASS IS NARROWER THAN IT SOUNDS. NO PLAYER PHOTOGRAPH IS
  RECOVERABLE** — storage objects are outside the backup, so a restore yields every
  player record pointing at an image that does not exist. **The five edge functions
  do not transfer either.** A real recovery is restore + redeploy five functions
  with `verify_jwt: false` + rebuild auth + repoint `.env` and Netlify.
  ⚠️ **A BACKUP IS AS SENSITIVE AS THE LIVE DATABASE** — all four vault secrets came
  back DECRYPTABLE in a brand-new project.
  ⚠️ **Jay initially chose to skip the drill and mark backups confirmed. He then
  chose to run it.** The photo gap and the edge-function gap are both things no
  amount of trusting Supabase would have surfaced.
  `claude/runbooks/backup-restore-drill.md` carries the numbers and the three
  things the runbook itself got wrong.
- `672c3e4` — **The 13 Aug migration is APPLIED, and `db/schema/` re-captured in
  the same breath** — `events_team_starts_idx`, `events_club_starts_idx`,
  `events_league_team_id_idx`, the membership arm on `social idea image write`, and
  a pinned `search_path` on `private.social_idea_owner`.
  ⚠️ **Captured from the catalogue, not pasted from the migration** — `pg_indexes`
  and `pg_get_functiondef`. Pasting the DDL is what left `pitches` and
  `pitch_requests` with unnamed constraints on 11 Aug.
  ⚠️ **VERIFIED BY EXECUTION, BEFORE AND AFTER.** With the old policy a
  zero-membership account was ALLOWED to upload; with the new one it is REFUSED,
  while an active member is still allowed under their own prefix and still refused
  under somebody else's. Both runs were transactions on PRODUCTION that rolled back
  — and ⚠️ **the rollback mechanism itself was probed with a throwaway table first**,
  rather than trusted.
  ⚠️ **NOTHING WAS MEASURED TO BE FASTER AND NOTHING WAS EXPECTED TO BE.** At 9
  events there is nothing to speed up. A cliff was removed, not a gain banked.
- `d0c531f` — **Supabase Pro and Resend Pro, and the fifteen lines that stopped
  being true.** ⚠️ **This entry carried NO SHA when it was written, deliberately,
  and the squash SHA is filled in here by the next pull request — which is the
  whole one-behind mechanism working as designed rather than an oversight being
  corrected.**
  Jay bought both plans on 13 Aug. **Measured, not reported:**
  `get_organization` → `plan: "pro"`.
  ⚠️ **THE UPGRADE FIXED A MECHANISM AND NOT A SINGLE LINE OF CODE.** Daily
  backups now exist, the project no longer pauses after 7 days idle, storage went
  1 GB → 100 GB, and Resend's 100/day cap is gone. **Nothing else on the 13 Aug
  audit list moved.**
  ⚠️ **AND A BACKUP NOBODY HAS RESTORED IS A BELIEF** —
  `claude/runbooks/backup-restore-drill.md` is new, and **NOT DONE**. It is the
  only open item whose failure is unrecoverable.
  ⚠️ **LOSING THE 100/DAY CAP REMOVED A BRAKE NOBODY DESIGNED.** Five senders
  share one Resend key and one sending domain; a runaway used to stop at 100 and
  now does not. The wanted throttle is unchanged and its REASON changed — from
  "we run out" to "Resend suspends `send.adhquins-clubhub.com`", which takes
  sign-in with it because auth mail rides the same domain.
  Corrected in `CLAUDE.md`, `claude/state-of-play.md`,
  `claude/runbooks/email-and-domain.md`, `db/schema/README.md`, four edge
  functions and two screens. ⚠️ **`claude/decisions/` was left alone on purpose**
  — a decision record is a record of a moment.
- **Two live-measured holes written up as a migration, NOT YET APPLIED**
  (`db/migrations/20260813_events_indexes_and_social_upload_gate.sql`).
  ⚠️ **`public.events` HAS NO INDEX ON `team_id` OR `starts_at`** — measured
  live, it carries exactly `events_pkey`, `events_series_id_idx`,
  `events_group_id_idx`. Every schedule, dashboard, calendar-feed and allocation
  read filters and sorts on those two. This partly overturns the "unindexed
  foreign keys are fine on an empty table" ruling, **and that ruling's own last
  line — "re-measure before citing this once real data lands" — is what asked
  for it.**
  ⚠️ **THE `social-ideas` STORAGE WRITE POLICY HAS NO MEMBERSHIP CHECK** while
  the row policy for the same feature does. Verified against live. A signed-in
  account with zero memberships can upload 5 MB objects without limit, and an
  orphaned object appears on no screen. ⚠️ **`player-photos` is unaffected and
  must not be "fixed" to match.** Harness: `db/tests/rls-social-upload.sql`,
  which injects the old policy to prove it can go red.

## 12 Aug 2026

- `a39d69a` — **The docs caught up with the calendar, the App button and the
  desktop pass.** The one-commit-behind entry for `7df6ea3` below, cleared by the
  next pull request exactly as the rule requires. ⚠️ **It was then left uncited
  for a day**, and `npm run docs:check` is what found it — run AFTER committing,
  which is the run that predicts CI.
- `7df6ea3` — **A full calendar for Pitch Management, an App button
  in the top bar, and a desktop pass.** Three things Jay asked for on 12 Aug.
  ⚠️ **Day | Week | Month on `/admin/allocation`, and it OPENS ON MONTH** — Jay's call
  when offered the choice, superseding the 11 Aug "opens on today, in Day view". The
  calendar first shipped with Day still the landing view and the question was PUT TO HIM
  rather than answered by whoever was typing.
  ⚠️ **The week starts MONDAY** because the UAE weekend is Sat–Sun and rugby is played on
  it; a Sunday-start week splits the two days Pitch Management cares about across two
  screens. ⚠️ **Clash and waiting-for-a-pitch are marked by SHAPE as well as colour** and
  spelled out in the aria-label.
  ⚠️ **`src/lib/calendarGrid.js` is tested in a NON-UTC zone**, because every bug it can
  have is a time-zone bug and under a UTC runner they all pass. Month paging **clamps
  rather than rolls over** (31 Jan +1 is 28 Feb, not 3 March), and events file by the
  CLUB'S calendar day (a 01:00 Abu Dhabi kick-off is 21:00 UTC the day before).
  ❌ **THE App BUTTON'S GREEN WAS SAMPLED OFF adhjrt.com AND FAILED THE BUILD.** `#3bd070`
  is the **RETIRED** brand green — that site still runs the pre-6-Aug palette — and
  `tests/press-feedback.test.js` exists to stop exactly that. It uses `accent` instead.
  ❌ **AND A MASTHEAD MEASUREMENT WAS WRONG IN A WAY WORTH KEEPING.** "Headroom" was
  computed as the wordmark's own width minus its natural text width — **a number that
  calculation can only ever return as ~0** — and the account first name was deleted on
  the strength of it. A probe that GREW until the wordmark visibly truncated disagreed:
  the real buffer is a `flex-1` spacer and it breaks at +190px. The name is restored.
  ⚠️ **Desktop: the content well goes 1120 → 1360px at `wide`**, so a 1440px monitor
  stops leaving 320px empty; the roster table gains 240px of real column width.
  ⚠️ **`shadow-card` is now a PAIR** — 1px contact + wide ambient — rather than one wide
  soft blur. `claude/specs/design-system.md` records the divergence from the prototype's
  single `--shadow` rather than being rewritten over it.
  ⚠️ **The portal cards LIFT on hover instead of flattening.** They carried
  `hover:shadow-[0_0_0_1px_…]`, which set the ONLY shadow and so removed every bit of
  elevation at the moment the card is meant to look reachable.

- `275bba8` — **The URL breaks before the row cap does, and the
  club lands on it.** `listPlayers` pages instead of capping, and four `.in()` readers
  are chunked.
  ⚠️ **THE LIMIT NOBODY HAD MEASURED.** PostgREST takes `.in()` as a query **STRING**,
  so a uuid costs ~37 bytes of URL. Measured with real uuids: **300 ids → 11,196-byte
  URL → 200; 400 → 14,896 → the fetch THREW; 900 → 33,396 → 400.** `MAX_ROWS` does
  nothing about it — the request never gets far enough to return a row.
  ⚠️ **The 400-id failure is a CONNECTION failure, not a status**, so it reads as a bad
  network rather than as a request built wrong.
  ⚠️ **Fifteen squads at ~25 players is ~375** — between the last size measured working
  and the first measured failing. Chunked at 200 (~7.5KB) via `fetchByIds`:
  `listContactsForPlayers`, `listParentsForPlayers`, `listAvailabilityForEvents`,
  `listMatchSheetsFor`.
  ⚠️ **`listPlayers` pages by `full_name, id`** — the tiebreak is load-bearing, because
  `full_name` is not unique and this club holds no squad numbers.
  ⚠️ **Two tests were REWRITTEN, not deleted**: they pinned the cap, they now pin paging
  and the tiebreak. Same precedent as the `listEvents` rewrite on 10 Aug.
  ❌ **AND TWO PROCESS TRAPS WERE WALKED INTO AND ARE RECORDED IN `state-of-play.md`:**
  an injection that silently matched nothing because the working tree is CRLF and the
  script searched for `
` — **a green run that was evidence about the script, not the
  code** — and `git checkout --` eating uncommitted work **twice**, exactly as
  `CLAUDE.md` rule 6 warns.

- `c910842` — **Admins are told when somebody asks for access.**
  Migration `access_request_notify`; edge function `notify-access-request` (v2,
  `verify_jwt: false`). `state-of-play.md` said "Nobody is emailed when an access
  REQUEST arrives" and predicted the cost exactly: *"a third is a copy with a
  different recipient query."*
  ⚠️ **NOT the approval email.** That fires for a pending MEMBERSHIP — somebody already
  attached to a squad. This fires for somebody with NO membership at all. Two queues,
  two sections of the Accounts screen.
  ⚠️ **Recipients are EVERY ACTIVE ADMIN, measured rather than copied.** There is no
  `accounts` right; acting on a request needs `is_admin_anywhere()` to read the list
  and `is_admin(club_id)` to grant, and both are plain admin. Copying the pitch
  function's `is_super or right` clause would have silently excluded the ordinary
  admins who can actually do the job.
  ⚠️ **The endpoint is DERIVED from `approval_notify_url` in SQL** — anchored on the
  final path segment — so the host cannot drift and **nobody ever reads, pastes or
  types the value.** This repo is public.
  ⚠️ **The `when (new.status = 'pending')` guard is load-bearing.**
  `dismissAccessRequest` UPSERTS, and an upsert with no existing row INSERTS a row
  that is already `dismissed` — so without it, turning away a stranger who never
  asked would email every admin about the person just turned away. **Injection
  confirmed red:** removing the guard took that insert's queue delta 0 → 1.
  ❌ **THE FIRST DEPLOYED VERSION WAS BROKEN AND ONLY A LIVE PROBE FOUND IT.**
  `access_requests` has TWO foreign keys to `profiles`, so a bare `profiles(...)`
  embed is ambiguous and PostgREST refuses the whole query. **The only symptom was a
  500 and no email** — precisely the quiet failure this design knowingly accepts.
  Fixed with the explicit constraint name; same probe before and after, **500 → 404**.
  ⚠️ **The Resend call is the one branch NOT exercised live** — a real send would put
  a test email in a third volunteer's inbox. Everything else was: the auth gate (its
  own `unauthorised` body, which is what proves the request reached the function
  rather than a JWT gate), the vault derivation, the trigger on all four write paths,
  and the database read.

- `97bf93d` — **The drop is back on, in the right order this
  time, and the docs stop describing a state that did not exist.**
  `drop_match_sheet_scores_after_deploy`, applied only once the new bundle was actually
  serving.
  ⚠️ **Verified the SERVED BUNDLE first**, the way `state-of-play.md` keeps insisting —
  fetch `/index.html`, read the `/assets/index-*.js` name out of it, fetch that and
  search it. **All three new strings present AND the old `Away final score` box absent**:
  a control on both sides, so it distinguishes "new build" from "any build".
  ⚠️ **Then the columns, also with controls.** All four answer `400 / 42703` through
  PostgREST while `manager_phone` and `id` answer 200 — otherwise a broken request looks
  exactly like a dropped column. The whole new write path (`events`' eight components,
  `teams.scoring_kinds`) resolves against live.
  ⚠️ **`db/schema/tables.sql` and `state-of-play.md` said DROPPED for the window in which
  it was not.** Both now agree with live. The temporary note was written down at the time
  rather than left to be discovered, which is the only reason this was a footnote instead
  of the next session's mystery.

- `c8a05c7` — **The match sheet had no real-browser scenario at
  all, and it is the widest screen in the app.** `harness/main.jsx` gains `match-sheet`,
  `harness/stubs/matchSheets.js` is its stub, and the overflow gate's `SCENARIOS` list
  gains the entry.
  ⚠️ **Unlike `availability`, `playerform` and `event-detail`, THIS ONE IS ACTUALLY
  MEASURED** — MatchSheet is a routed screen rather than a `Sheet`, so its contents are
  in the document's `scrollWidth`.
  ⚠️ **Verified in Chromium, NOT through `npm run check:overflow`.** Playwright is still
  deliberately not a dependency and is not installed on this PC. Measured by driving the
  harness in a real browser at 320 / 360 / 375 / 390 / 414: **zero overflow at every
  width.**
  ⚠️ **And the measurement was proved RED before the clean result was believed** — a
  900px `shrink-0` probe in the Score card produced **611px of overflow at 320px**, which
  is exactly what the same injection FAILED to do inside a `Sheet` on 12 Aug. The other
  28 scenarios were not re-run; nothing in the commit touches them.

- `c8a05c7` — **The sheet stops holding a score.** Applied live as
  `drop_match_sheet_scores`. Step 4 of the scoring plan, run LAST and only once nothing
  read the columns.
  ⚠️ **`tries_us` / `tries_them` went too, and the plan did not say so** — it named only
  `score_us` / `score_them`, because when it was written `events` had no home for a try
  at all. Step 2 gave them one, which turned these into exactly the duplicate the other
  two were.
  ⚠️ **Re-measured immediately before applying, not assumed from the plan**: one sheet
  exists and all four columns were NULL on it. **The plan said to re-measure for exactly
  this reason** — a human filed that sheet between the plan being written and this
  running.
  ❌ **AND IT WAS APPLIED TOO EARLY AND BROKE THE LIVE SITE FOR ABOUT TEN MINUTES.**
  "Run last" was read as *last in the branch*; `main` was still deployed and its bundle
  still sent all four columns on every save, so PostgREST answered **400 / PGRST204** and
  **Save draft and Submit failed on the live match sheet** while the PR waited to merge.
  Undone by re-adding them — all NULL, so it cost nothing — and re-applied once the new
  bundle was serving.
  ⚠️ **THE RULE, now in the migration header and in `state-of-play.md`: a DESTRUCTIVE
  schema change against a live SPA is DEPLOY-FIRST, DROP-SECOND.** An additive one is
  safe in either order, which is why `manager_phone` going in early was fine and this was
  not. **"Nothing reads it" has to mean nothing anyone is RUNNING.**

- `c8a05c7` — **The score is ENTERED AS COMPONENTS, and the form's
  total can no longer disagree with its own tries.** Steps 3 and 5 of the scoring plan,
  plus the picker the step-2 migration added a column for and nothing could set.
  Migration `match_sheet_manager_phone`, applied live.
  ⚠️ **The facsimile's FINAL SCORE and TRIES boxes were free text and are now DERIVED.**
  A Score card above the form offers exactly the boxes `scoringForTeam()` allows for that
  squad; the total is computed from them by the same `totalFor()` the database trigger
  mirrors. **A coach can no longer file a governing-body form whose total contradicts the
  tries printed beside it.**
  ⚠️ **The card sits OUTSIDE the facsimile deliberately.** RCM's form has two boxes per
  side; conversion, penalty and drop-goal boxes inside it would photograph as a form the
  governing body never issued.
  ⚠️ **Components go to `public.events`, never to the sheet** — Jay ruled one score, on
  the fixture. **The fixture is written FIRST and the sheet second**, so a failure leaves
  the score right and the sheet unsaved rather than the reverse.
  ⚠️ **`EventForm` goes READ-ONLY on a fixture that has components, and this was a real
  silent bug.** It does not send the components, so the trigger recomputed from the
  stored ones and overwrote whatever was typed — 30–0 in, 22–12 back, nothing anywhere
  saying why.
  ⚠️ **`getEvent()` now embeds `teams.scoring_kinds`.** Without it the club's override is
  silently ignored and a coach gets the age-band default instead — the standing cost of
  that embed being a column list rather than `*`.
  ⚠️ **`db/tests/scoring.sql` now exists — the step-2 migration already CLAIMED it did.**
  Run against production: all fifteen squads agree with `src/lib/scoring.js`, and all six
  trigger cases pass. **Fault injection confirmed red** — an unconditional recompute
  turns the hand-typed 22–12 into 0–0.
  ⚠️ **Four more injections, four reds, on the JS side**: a recorded 0 read as "not
  recorded", an unconditional recompute on screen, a one-sided component check in
  `EventForm`, and the squad picker storing tick order instead of `SCORE_KINDS` order.
  ⚠️ **Manager name and phone are a DEFAULT, NOT A LOCK** — they fill a blank box and
  never touch one that already holds something, because a manager fills the form and a
  coach signs it.

- `669cc6c` — **The scoring rules are the CLUB'S, not another
  project's — a provenance correction, no behaviour change.**
  Jay: *"this app and project should have absolutely nothing to do with adhjrt, that is a
  completely different project, i only told you to use the same type of scoring setup"*.
  ❌ **The first pass read that as a dependency.** It documented another club system as an
  upstream source of truth, called this app's table "the third copy", and warned it could go
  **"silently wrong"** if an organiser over there changed something. **All of that was a
  misreading of the brief, and none of it was true.** A try is five points because that is
  rugby.
  ⚠️ **Corrected rather than softened, across the module header, both database functions, the
  migration, the tests and the plan** — a wrong "why" sends the next reader into another
  codebase to understand this one, and the note it leaves behind outlives whoever wrote it.
  ⚠️ **The ONE duplication that is real survives, because it always was real: the three
  thresholds exist in `src/lib/scoring.js` AND in `private.scoring_kinds_for_team`.** That is
  deliberate — without it the form would show one total and the database would store another,
  and both would look plausible.
  ⚠️ **No values changed. No behaviour changed.** The suite is the proof.
  ⚠️ **Genuine adhjrt references elsewhere are untouched and correct** — the nav and tab
  styling measured off `adhjrt.com`, `ADHJRT` as a tournament NAME in the competition
  picker, and the retired `app.adhjrt.com` alias. **The project is a real thing this club
  plays in; it is simply not this app's authority for scoring.**

- `390a6e5` — **Scoring components on a fixture, and the club's
  per-squad scoring set.** Step 2 of the scoring plan, applied live as
  `scoring_components`.
  Eight component columns on `events`, `teams.scoring_kinds`, and a trigger deriving
  `result_us` / `result_them` from them.
  ⚠️ **The trigger is GUARDED PER SIDE and that is the whole point of it.** A side with no
  components keeps whatever result it already had — fixtures exist whose result was typed by
  hand before components existed, and an unconditional recompute turns a real 22–12 into
  0–0 with no error anywhere. **Verified against exactly that row before anything else.**
  ⚠️ **The band rules are replicated in SQL — a FOURTH copy, deliberately.** The alternative
  was worse: a trigger summing every component while `scoring.js` ignores the kinds a squad
  may not score would make the FORM show one total and the DATABASE store another. What is
  copied is three thresholds, not fifteen rows.
  ⚠️ **No grants.** `authenticated` already holds table-level UPDATE on `events` and `teams`
  — **measured, not assumed** — and a table-level privilege covers columns added later.
  Verified live: all fifteen squads resolve correctly **including `U12G QR`**, the name that
  once broke the JS regex; and restricting U16B to tries-only recomputed 27 → 20, ignoring a
  conversion and a penalty, matching `totalFor` exactly.
  ⚠️ **One test proved nothing and was nearly reported as passing** — a U10 write matched
  zero rows because no seeded U10 fixture exists. An empty result is not a pass.
  ⚠️ **And a real result was destroyed proving this.** See `state-of-play.md`: the completed
  U16B sheet hangs off a fixture INSIDE the seeded September group, so selecting a test row
  by `group_id` is not safe. Jay ruled the loss acceptable; the trap is recorded.

- `cf88ce6` — **The age-band scoring model, as a pure module.**
  Step 1 of `claude/plans/2026-08-12-scoring-model.md` — the table and the arithmetic only,
  no schema and no UI, so the rest can be built against something already pinned.
  ⚠️ **The fifteen upstream rows collapse onto three band rules, and the test asserts EVERY
  row rather than a sample** — three rules may replace fifteen entries only if all fifteen
  agree, and nothing else would say so.
  ⚠️ **Keyed on the band NUMBER, never the squad name's letter.** In `U14B` the trailing
  letter is GENDER, and `src/lib/ageGroup.js` already carries a note about `U12G` failing to
  parse for exactly that reason.
  ⚠️ **The unknown band fails OPEN, deliberately opposite to `allowsOwnContact`, which fails
  CLOSED.** The harm is asymmetric in opposite directions — a twelve-year-old's phone number
  versus a coach unable to record a drop goal that was kicked. Both the module and the test
  say so, because somebody will try to unify them.
  ⚠️ **`teams.scoring_kinds` is the club override — Jay, 12 Aug: scoring should be selectable
  "in the area where teams are created".** A COLUMN, never the squad's name, the same rule
  `is_senior` and `self_registration_allowed` already carry.
  ⚠️ **`hasNoComponents` exists to protect live data**: the U16B fixture holds 22–12 with
  every component null, and an unconditional recompute would make it 0–0 silently.
  Proved against an injected fault: shifting the 11→12 threshold and flipping the unknown
  default reddened 7 tests and no others.

- `3bad675` — **The league-team tab is named after the job, the tab
  row can wrap, and the scoring model is specced.**
  Jay: *"need a better identifier for the section that allows admins to create league team
  names, right now it just says Club"*. **"Club" named the container rather than the job** —
  and that tab is where ADHQ1 / ADHQ2 are created, which is what the match sheet's TEAM box
  is stamped from. So the one screen that fixes an empty TEAM box was the one screen nobody
  could find: the other half of the U16B defect, arriving from the opposite direction.
  ⚠️ **The rename came with a hazard that had to be fixed in the same commit.** The tab row
  was a bare `flex` with no `flex-wrap`. A flex row that overruns does not clip — **the
  DOCUMENT gets wider than the viewport**, and every element sized to the viewport then
  renders short or clipped on screens three away. Already recorded against Schedule's
  header, where it read as four separate bugs because the bottom nav is `fixed`.
  **Lengthening a label into an unwrapped row is exactly how that returns.**
  Also adds `claude/plans/2026-08-12-scoring-model.md` (**NOT SHIPPED**), which measured the
  scoring rules the club actually needs. ⚠️ **Its provenance framing was WRONG on the first
  pass and is corrected later the same day** — see the entry above.

- `4e8f646` — **The RCM match sheet stopped printing the club's own
  squad name in the governing body's TEAM box.**
  Jay filed a U16B sheet whose TEAM box read **"U16B Contact"**. Measured on the live row,
  not read off the screenshot: `league_team_id` was NULL, and `ourName` ended `?? squadName`.
  ⚠️ **The FALLBACK was the bug, not the missing data.** A blank box is an obviously
  unfinished form; a confidently wrong one is not, and it was photographed and sent. **Same
  shape as the incident already recorded against `src/lib/ageGroup.js`** — the absent value
  fell through to the least safe answer. The lesson was the null default, not the regex, and
  it had not been learned.
  ⚠️ **The screen also ignored `match_sheets.league_team_id`**, the column stamped at save
  precisely so a filed record is FROZEN — so correcting a fixture in March would have
  silently rewritten a form RCM already holds. The saved sheet now wins.
  ⚠️ **The complete-gate is ONE-WAY**: it stops a sheet reaching ready-to-send and never
  stops one being reopened, or the app defends its own rule against the person obeying it.
  ⚠️ **The score half is deliberately NOT in this change.** `events.result_us/result_them`
  and `match_sheets.score_us` are two stores of one fact; Jay ruled the fixture wins, but
  **tries have no home on `events` at all** and the scoring model decides where they go.
  ⚠️ Proved against **two** injected faults, because the first left two assertions unproven:
  restoring `?? squadName` turned 4 of 6 red, and making the gate two-way turned exactly the
  reopen test red. **An injection that fails to go red is data about the CHECK.**

- `41adbbf` — **`state-of-play.md` was missing four shipped features
  and calling one of them "never started".**
  League teams, the RCM match sheet, the Club Youth Manager portal, event duplication and
  the PWA install prompt had all shipped across PRs #51-#60, and **none of them appeared
  in the file every session reads as step 3 of the reading order.** §Open meanwhile listed
  *the Club Youth Manager dashboard* and *the Social Media Management dashboard* under
  **"Never started"** — one had been live since 11 Aug, the other since earlier the same
  day.
  ⚠️ **A claim about what does NOT exist is the one kind nothing can check.** `docs:check`
  verifies that referenced paths resolve and that plans carry a STATUS line; there is no
  file for "we never built X" to fail against, and no test either. This is the third
  instance in three days — `2290bf7` was the same failure about league teams, and the
  plan-status rot it named was the same shape.
  Also records the AI ruling of 12 Aug (*"yes it may"*) against the line that still said
  nobody had asked him.
  ⛔ **And both 12 Aug plans are marked TABLED — Jay, same day**: *"table 1 and 2 for now
  until i bring them back up again"*. `claude/plans/2026-08-12-ai-integration.md` and
  `claude/plans/2026-08-12-training-session-plans.md`. ⚠️ **A plan left at plain "NOT
  SHIPPED" reads as work waiting to be picked up** — which is the same failure as the
  "never started" line this commit removes, pointed the other way.
  ⚠️ **He tabled the BUILD, not the RULING.** The children's-data permission stands and
  still governs anything that sends club data to a third party.

- `ea3d500` — **Social Media Management is live: what's on, and an idea inbox.**
  The last grey card on the chooser opens. Two screens behind the `media` right — **What's on**
  (every event past and upcoming, split into *Coming up* and *Recently*, because a fixture that
  has happened wants a report and one that hasn't wants a preview) and **Ideas**, an inbox any
  member submits into from More.
  ⚠️ **It does NOT touch `player-photos`.** The obvious build — offer the roster photos every
  admin can already see — was ruled out by Jay before it was proposed: seeing a child's photo on
  the roster and putting it on Instagram are different acts needing different consent. Everything
  here is submitter-chosen, in a **second private bucket**.
  ⚠️ **`from_staff` is stamped by a BEFORE INSERT trigger, never sent by the client** — a
  browser-supplied "I am staff" would be a self-awarded triage priority.
  ⚠️ **Column grants on UPDATE**: an admin marking an idea can write `status`, `decision_note`,
  `decided_by`, `decided_at` **and nothing else**. Verified after applying — table-level UPDATE
  to `authenticated` is none. Policies authorise the row; grants authorise the column.
  ⚠️ **Removing an idea deletes the OBJECT first and the row second.** Storage cannot be cleared
  by SQL (`42501`), so a row-first failure would orphan the exact image being removed.
  ⚠️ **First nested tabs in the app**, which needed `end` on the tab `NavLink` — without it
  "What's on" stays marked current while you stand on "Ideas".
  `claude/decisions/2026-08-12-social-media-management.md`

- `2290bf7` — **League teams shipped days ago; the status line said otherwise.**
  ⚠️ **`docs-check` asserts a plan HAS a `**STATUS:` line, never that the line is TRUE**, so a
  stale one is invisible to it and reads as authoritative. It rotted because the work was split
  into a design file and an implementation file and only the second was marked. **A plan split in
  two has two status lines, and the one nobody is looking at is the one that rots.**

- `f4e1ce6` — **Recorded what shipped, and the cache trap that made a green deploy look failed.**
  ⚠️ **After Netlify said `main@78649aa` Published, the live site still served the OLD app** —
  the admin route still redirected to Accounts and still drew the old tab row. That is
  indistinguishable from a release that did not take. It was the **service worker** serving a
  cached shell. ⚠️ **Neither the browser nor the Netlify UI can settle this** — both report what
  some cache decided. What does: fetch `/index.html`, read the `/assets/index-*.js` name out of
  it, fetch that bundle, and search it for a string only the new build contains.
  Also records that `notify-pitch-request` was redeployed to version 3, and that ⚠️ **an edge
  function is not part of the Netlify build.**

- `78649aa` — **`/admin` is a chooser, and each job is its own portal.**
  Jay: *"i'd like more of a split off for the dashboards"*. The tab row that grew with every
  right somebody held is replaced by four cards — Club Admin, Pitch Management, Club Youth
  Manager, Social Media Management — each entering a space with its own tabs.
  ⚠️ **Every card renders for every admin**; not holding the job, or the job having no screen,
  greys it. ⚠️ **A grey card is not a link IN THE MARKUP** — this repo has already shipped a
  control that drew itself and swallowed the tap.
  ⚠️ **"No screen yet" and "this job hasn't been added to your account" stay DIFFERENT
  messages** — a super admin fixes one, only building fixes the other.
  ⚠️ **Navigation only. It narrows nothing** — a portal holder is still a full admin.
  ⚠️ **Only bare `/admin` changes**; every URL under it is untouched, so nothing bookmarked
  breaks. `src/lib/portals.js` is the single list both the chooser and the tab row read.
  `claude/decisions/2026-08-12-admin-portals.md`

- `78649aa` — **Jobs, not people: the three club jobs are named and the
  volunteers are not.** *(Same squash commit as the portal split — the two shipped together.)* `Youth Manager` → **Club Youth Manager**, `Social Media Manager` →
  **Social Media Management**, `Pitch Manager` → **Pitch Management**.
  ⚠️ **Two of the three stop being job titles, so five sentences moved rather than the words**
  — three not-authorised screens and both pitch emails, because "you're a Pitch Management"
  is not English. The mismatch was put to Jay before the change and he chose this wording.
  ⚠️ **The emails are a Supabase edge function and deploy separately from the app.**
  ~60 human names replaced with the job name across `src/`, `tests/`, `db/schema/` and the
  instructional docs; ⚠️ **`claude/handoffs/`, `claude/plans/` and `db/migrations/` keep
  theirs**, being dated records of a moment. Enforced by `RETIRED_NAMES` in
  `scripts/docs-check.mjs` — ⚠️ **regexes with word boundaries, or `Nick` would fail every <!-- stale-ok -->
  line containing "nickname"** — scanned in code as well as docs, because every occurrence
  outside the docs was a code comment.
  `claude/decisions/2026-08-12-jobs-not-people.md`

- `b8fd9a0` — **`app.adhjrt.com` is retired.**
  The app's original address, kept as a working alias since the 5 Aug domain move, no longer
  resolves. Removed in three places: the Supabase redirect allow-list, the Netlify domain alias,
  and the DNS record — ⚠️ **which went automatically, because `adhjrt.com` is on Netlify DNS and
  the alias and the record are the same object.** The plan said to delete a CNAME by hand and
  that was wrong.
  ⚠️ **A stale `feat-password-auth` deploy-preview entry was found in the same allow-list and
  removed** — that list decides where an auth token may be sent.
  ⚠️ **Verified by `Resolve-DnsName` against `8.8.8.8` with `adhjrt.com` itself as a control**,
  because the browser's own origin gate makes a failed navigation ambiguous. Console settings
  only — no deploy, no credits.
  `claude/decisions/2026-08-12-retire-app-alias.md`

- `88c5a04` — **Two rulings: jobs not people, and the admin portal split.** No code, four
  documents. **Jobs not people** — the club's three jobs are named (Club Youth Manager, Pitch
  Management, Social Media Management) and the volunteers holding them are not, in the app, in
  code comments, in the decision records or in conversation. **The portal split** — `/admin`
  stops redirecting to Accounts and becomes a chooser, each job getting its own space; every
  card renders for every admin, greyed and inert where the right is not held or no screen
  exists yet. ⚠️ **Navigation only — it narrows nothing.** A portal holder is still a full
  admin with every child's name, photo and parent contact details.
  ⚠️ **Combined into one commit deliberately.** The two rulings were written and committed
  locally by an earlier session and never pushed — one on a branch, one stranded on local
  `main`, which is protected and could never accept it. Two commits would have put a branch
  SHA in this file that ceases to exist on squash-merge.
  `claude/decisions/2026-08-12-jobs-not-people.md`,
  `claude/decisions/2026-08-12-admin-portals.md`

- `a309092` — **"Add Quins to your home screen" — the app was always installable and nothing said so.**
  Jay asked *"do we have a PWA for this?"* on 12 Aug 2026, which is the entire justification:
  if the person who commissioned it does not know it installs, no parent will work it out.
  ⚠️ **Measured live before writing a line of it** — `manifest.webmanifest` serves with
  `display:standalone`, all four icons (192/512 and both maskable) return 200 `image/png`,
  and `sw.js` is served and registered. Every installability criterion has been met since
  the PWA plugin landed.
  ⚠️ **ONE BANNER, TWO PLATFORMS, AND THEY ARE GENUINELY DIFFERENT.** Android/Chrome fires
  `beforeinstallprompt`, which is captured and replayed against a real Install button. **iOS
  NEVER fires it** — Apple has no programmatic install — so iOS gets the Share → Add to Home
  Screen steps and **deliberately no button**, because a button there could not work. That is
  the dead-affordance defect `EventDetail` already shipped once.
  ⚠️ **It must be SAFARI, not merely iOS.** Add to Home Screen is absent from Chrome and
  Firefox share sheets on iPhone, so those render nothing rather than instructions that send
  someone hunting for a menu item that is not there.
  ⚠️ **iPadOS 13+ reports itself as a Mac** (`platform === 'MacIntel'`); the touch-point count
  is the only thing separating an iPad from a desktop Mac.
  ⚠️ **The event is captured at MODULE LOAD, not in a `useEffect`** — `beforeinstallprompt`
  fires once and early, often before React mounts, and is never re-fired. A listener in an
  effect misses it on exactly the load where it mattered.
  ⚠️ **`navigator.standalone` is checked as well as `display-mode: standalone`** — iOS never
  implemented the standard one for this, so checking only it shows the banner to every iPhone
  user who has already installed.
  Renders above the loading/error/ready split in `AppShell`, so a parent still waiting for
  approval sees it. Dismissal persists, and blocked `localStorage` cannot take the shell down.

- `ea0b8ac` — **Duplicate an event, and three type marks that mean something.** Two
  requests from Jay, shipped together only because they touch the same two files.
  **Duplicate:** `EventDetail`'s footer becomes Edit | Duplicate | Delete, and Duplicate
  opens the CREATE form prefilled from the fixture. Jay: *"the details take the effort,
  not the date."*
  ⚠️ **The date opens BLANK, Jay's choice over three smarter defaults** — a prefilled
  guess quietly becomes wrong, and here wrong means a session in fifteen parents'
  subscribed calendars on a day nobody chose. It needed **no new guard**: the form
  already refuses to save without a date.
  ⚠️ **Score, round and id are cleared; times, venue, pitch, notes, squad, competition
  and league team carry.** The round goes because "Round 4" twice is a wrong result filed
  with the governing body; the league TEAM stays because it belongs to the squad, which
  carries.
  ⚠️ **`series_id` cannot leak in, STRUCTURALLY** — neither it nor `group_id` is in
  `initialValues`, and the only writers are the repeating/multiSquad branches. A duplicate
  that inherited one would be swept up by "delete this and every later session" from an
  occurrence it has nothing to do with.
  ⚠️ **The whole implementation is `editing = Boolean(event?.id) && !duplicate`** — that
  one flag already gated the id, the series checkbox, Repeats, the extra-squads picker,
  the title and the submit label. **Repeats coming back is a bonus, not an accident:**
  duplicate + repeat is the only way to extend a finished series.
  **The marks:** whistle/shirt/trophy out, solid rugby ball / rounded-tip cone / two
  people in, moved OUT of `EventDetail.jsx` into `src/components/EventTypeIcon.jsx` with
  **`Chip` deciding the icon rather than each caller**. A whistle starts training as often
  as a match; a shirt says "kit"; a trophy means WINNING and was sitting on the BBQ.
  ⚠️ **Only the three event types get one** — win/loss/draw and the neutral squad pill
  never do. The ball is solid where the others are outlines because its chip is the only
  dark fill, and its seam is a **mask** with a `useId` id, since two match chips in one
  list would collide on a literal one.
  ❌ **A claim was written, tested and WITHDRAWN mid-build, and it is the most useful part:**
  "`flex-wrap` on the three-button footer stops the document overflowing" was wrong twice
  over. Measured — the buttons fit one line at 320px — and, more importantly,
  ⚠️ **`harness/check-overflow.mjs` IS BLIND TO ANYTHING INSIDE A SHEET**, because `Sheet`
  is `position:fixed` and sets `body{overflow:hidden}`. A 900px `shrink-0` button injected
  into an open sheet left the gate GREEN. That applies to the `availability` and
  `playerform` scenarios too. Caught only because a control fault was injected after the
  first injection came back clean. Recorded in `state-of-play.md`.

- `d551caf` — **The AI ruling, and two plans.** ✅ **CHILDREN'S DATA MAY LEAVE THE CLUB FOR A
  THIRD-PARTY API — Jay, 12 Aug 2026, asked directly and answered "yes it may".**
  `state-of-play.md` recorded that EVERY AI feature was gated on this one question and
  that nobody had asked him. Recorded in
  `claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`.
  ⚠️ **"May" is permission, not a design** — the implementation default is MINIMISATION,
  with a written field list. Photos, contacts, medical notes and attendance are NOT sent
  without a separate conversation.
  ⚠️ **`match_sheets.medical_notes` is the trap this schema now carries**: a match-report
  feature doing `select('*')` would send concussion notes about named children to a third
  party. **No `select('*')` on the AI path** — deliberately the opposite of the convention
  everywhere else in `src/data/`.
  ⚠️ **The model is `claude-haiku-4-5`** (Jay's call) as ONE constant, and it does NOT take
  `effort` — copying a request body from an Opus example errors.
  ⚠️ **"Scrape the web for the best rugby training sessions" cannot be built as
  described**, and the reason is copyright rather than capability: World Rugby, the RFU and
  the rest own that material. The plan reaches the same outcome by linking out, using search
  to DISCOVER rather than copy, and generating original sessions from age-grade principles
  — which are facts, not expression. `drills` deliberately has **no full-text column**, and
  its absence is the design.

- `3c64990` — **RCM match sheets — Project 2, shipped.** `match_sheets`, `match_sheet_slots` (22 per
  sheet) and `match_sheet_cards`, the editor at `/match-sheet/:eventId`, and the Club Youth
  Manager's list at `/admin/youth` behind the `youth` right — which had existed since 10 Aug
  and granted access to nothing.
  ⚠️ **The layout is a FACSIMILE of the real form**, which Jay supplied mid-build. Three
  things came from the document and not from the field list: the 22 run in **two columns**
  (1-12 left, 13-22 right, each with its own FR); **FINAL SCORE/TRIES are HOME and AWAY, not
  us and them**, so an away fixture puts our score on the right; and **CLUB is the club while
  HOME TEAM is the LEAGUE TEAM** — an earlier guess had the club name in both.
  ⚠️ **Instruction 5 on the form — "WAP, DIV1, DIV2 Games are completed on sportslive app" —
  is independent support for the null deadline.** Those senior competitions do not use this
  sheet at all.
  ⚠️ **One editor for every age group** (Jay's ruling), but `matchSheetDeadline` still reports
  U18's real deadline of **one hour BEFORE kick-off**. Not offering a pre-match flow is a
  different thing from telling a coach something untrue, and the module says so.
  ⚠️ **`full_name` is stored as text even when a player is linked** — the form demands the
  name "as per registration", and a filed sheet must survive a player being renamed or
  removed. A third justification ("the club only has 7 players") was **retired**: Jay's ruling
  is to build for the loaded club, so the roster picker is first-class and free text is the
  fallback.
  ⚠️ **`complete` means READY TO SEND, never SENT.** Nothing in the app can know whether RCM
  received anything; submission is a human dropping a file into a WhatsApp group.
  ⚠️ **Share generates a real PNG** via a lazily-imported html2canvas (measured 198,689
  bytes), because **WhatsApp cannot be handed a file by a link** — `wa.me/?text=` is text
  only. This overturns the plan's "no new dependency"; Jay accepted the cost.
  ⚠️ **`EventDetail` gets a handler prop, not a `<Link>`** — a router-aware element in a
  component rendered inside a Sheet broke eighteen tests, and the file already had the
  pattern in `onOpenRegister`. It renders **only when a handler exists**, the lesson from the
  dead availability button.
  ⚠️ **RCM's red is a named token (`rcm`), not a raw hex** — `tests/theme.test.js` refused the
  arbitrary value, correctly. It is **their** brand colour on **their** document and must
  never be used as an app accent.

- `18e4e12` — **Competition is a CHOICE, not a free-text box** — League or Tournament, or neither.
  Jay, 12 Aug 2026. League offers **Round 1-8**; Tournament offers **ADHJRT, Dubai Youth
  Festival, Al Ain Tournament, Small Blacks Tournament** and a "Something else" box.
  ⚠️ **"Neither — a friendly" is the DEFAULT and a real answer.** Nothing may read the blank
  as "assume league" — the same rule `league_team_id` carries.
  ⚠️ **`competition_type` is a COLUMN, not derived from `round`.** Deriving it needed no
  migration and was wrong: a league fixture whose round nobody has entered yet would read as
  a friendly. The type is a fact somebody states; the round is a detail they may not know.
  ⚠️ **`round` now hangs off the COMPETITION, not off the league team.** A round is a
  property of the competition, and the old coupling silently discarded it on a league fixture
  whose team had not been picked. `fixtureLabel` still refuses to RENDER a round without a
  league team — a display rule, deliberately not the same rule as what gets stored.
  ⚠️ **`competition` now means "the tournament's name"** and is NULL for a league fixture.
  Switching type clears the other side's answer, in the form and in the save.
  ⚠️ **An old row with free text and no type is READ as a tournament**, keeping what somebody
  typed. **A read, not a backfill** — the migration wrote nothing, so nothing in the database
  can be mistaken for an answer somebody gave.
  ⚠️ **`competition_type` rides in `common`, unlike the league fields** — an ADHJRT weekend
  fanned out across every age group is genuinely one tournament for all of them, whereas
  which of our teams played it is a fact about the squad.
  ⚠️ **The tournament list is hard-coded, unlike pitches, deliberately**: the pitch list
  became a table the day clash detection had to reason about pitches; nothing reasons about a
  tournament, it is a label. Four regulars plus an escape hatch costs no schema.
  ⚠️ **`EventDetail` had to change or every league match would show no competition at all** —
  the row tested `event.competition`, which is now null for exactly those.

- `102fa48` — **A league team's name is unique per SQUAD, not per club** — and the save now says which
  of the two things went wrong. ⚠️ **Both defects were found by Jay using the app within
  hours of the feature shipping, and no test could have caught either.**
  ⚠️ **`unique (club_id, rcm_name)` was wrong.** Every age group has its own ADHQ1/ADHQ2/
  ADHQ3, one per division, so the name only identifies a team WITHIN an age group. The
  original constraint let the club hold exactly one ADHQ1 anywhere, and blocked the second
  age group outright. Now `unique (team_id, rcm_name)`.
  ⚠️ **The design note that got this wrong reasoned carefully about the thing it checked.**
  It proved a column on `teams` could not hold three league teams — true, and why this is a
  table — then assumed without asking that names were club-unique. Jay's sentence was
  "multiple teams at an age group"; nothing in it said the names do not repeat BETWEEN age
  groups.
  ⚠️ **One message naming two causes is not a message.** `upsertLeagueTeam` threw *"you may
  not have permission, or the name may already be in use"* for every failure, so the person
  hitting the constraint was told it might be either and reported it as a permission problem.
  Now `23505` names the duplicate and the squad, `42501` names permission, and anything else
  surfaces the database's own message. **The repo's rule is to read the RESPONSE rather than
  the coloured box; a hedged message denies the user the same thing.**
  ⚠️ **`db/tests/league-team-name-scope.sql` asserts BOTH directions** — a test that only
  proved the second squad is now allowed would pass equally against a table with no unique
  constraint at all.

## 11 Aug 2026

- `8be9668` — **The calendar feed names the league team** (task 8). `calendar_events_for_token()` gains
  `league_team_name`, `league_division` and `round`; the edge function puts the team's NAME
  in `SUMMARY` (in place of the squad) and the full `ADHQ2 · Div B · Round 4` first in
  `DESCRIPTION`.
  ⚠️ **The feed's columns come from the function's `RETURNS TABLE`, not from the edge
  function** — which is why this needed a migration at all, and why the plan's description of
  task 8 was wrong.
  ⚠️ **`RETURNS TABLE` cannot be changed in place**, so the migration DROPs and re-creates —
  **and a drop takes the grants with it.** This function is anon-executable deliberately (it
  IS the feed; the token is the gate), so the migration re-grants from the ACL measured on
  live immediately beforehand. Without that, every subscribed parent's calendar fails silently.
  ⚠️ **LEFT JOIN, never inner** — an inner join would drop every non-league fixture from the
  feed, which is most of them and all training, with a 200 and a valid `.ics` and no error
  anywhere.
  ⚠️ **SUMMARY carries only the team's NAME, deliberately unlike the app's chip.** A phone
  truncates `SUMMARY` hard and "ADHQ2 · Div B · Round 4 v Dubai Exiles" loses the opponent —
  the one thing a title exists to carry. Same facts, same order, different room.
  ⚠️ **No vitest can execute the feed** (Deno, `Deno.serve` at module scope), so
  `tests/calendar-league-team.test.js` is a **rot detector** over the source and the
  migration, not a behaviour test. It fails if the app's format changes and the feed's does
  not, which is the failure this duplication actually has.
  ⚠️ **THE DROP RE-GRANTED THREE ROLES AND SILENTLY ADDED A FOURTH.** `create function`
  grants EXECUTE to **PUBLIC** by default, which this function did not have; the ACL read
  back afterwards differed from the one read before. A follow-up `revoke … from public`
  restored it exactly. **Re-granting what you measured is not restoring what you measured** —
  compare the whole `proacl`, not just the role you were worried about.
  ✅ **Verified live**: the deployed feed returns **200 `text/calendar; charset=utf-8`** on
  both the function URL and `adhquins-clubhub.com/calendar.ics` — not `text/html`, so
  neither the SPA catch-all nor the service worker is intercepting — and the RPC returned
  every event in the window, **so the LEFT JOIN dropped nothing**.
  ⚠️ **BUT THE LEAGUE PATH ITSELF IS UNEXERCISED.** At verification the database held **zero**
  league teams and zero tagged fixtures, so what was proved is that nothing BROKE, not that
  the label works. Creating one league team on the Club tab and tagging one fixture is the
  outstanding check, and it exercises tasks 5-8 at once.

- `b48edde` — **A match records which league team played it, and every fixture screen says so**
  (tasks 6-7). `EventForm` gains a **League team** select and a **Round** box, both matches-only;
  `FixtureRow`, `EventDetail` and the allocation grid render `fixtureLabel`.
  ⚠️ **The picker offers only the chosen squad's teams**, and **changing the Age group clears
  the league team** — pick U14B, pick ADHQ2, then realise it was the U16 fixture, and without
  the clear the save writes a U14 team onto a U16 fixture.
  ⚠️ **The league fields are deliberately NOT in `common`** — `common` is stamped on every row
  by the multi-squad fan-out, so a league team there would be given to all three squads'
  copies at once. They ride on the primary squad's payload only, which also keeps them out of
  the series-edit write.
  ⚠️ **`round` is written NULL unless a league team is set**, whatever the input still holds —
  the same rule `fixtureLabel` enforces when rendering.
  ⚠️ **`listEvents` now EMBEDS the league team** (`*, league_team:league_teams(...)`) instead
  of each screen querying it. Four screens rendering the label off the row they already have
  is what stops one of them drifting. **`tests/data.test.js` pinned `select('*')` and caught
  the change**, which is the check working.
  ⚠️ **`EventDetail` keeps Age group AND adds League team** — different facts, and it is the
  one screen with room for both. Elsewhere they collapse into one chip.
  ⚠️ **Task 8, the calendar feed, is NOT in this change**: the feed's columns come from
  `calendar_events_for_token()`'s `RETURNS TABLE`, so it needs a migration plus a separate
  edge-function deploy. Editing `supabase/functions/calendar/index.ts` alone would change
  nothing — that exact trap cost a day in Aug 2026.

- `ee85430` — **The Club tab manages the club's league teams** (task 5). Each age group in the Age
  groups list now carries its own league teams as chips, plus a "+" to enter another.
  ⚠️ **A league team is entered against the squad whose "+" was tapped** — the panel
  carries that squad's `team_id` and `club_id`, because a U14 team filed under U16 reaches
  the governing body as a wrong result rather than an obvious slip.
  ⚠️ **`division` is sent as NULL, never `''`** — the column carries a check constraint of
  `('A','B','C')`, so an empty string is a violation rather than "no division", and the
  save would fail on a field somebody deliberately left blank.
  ⚠️ **Retired teams are shown, greyed, and ANNOUNCED as retired** — this is the only
  screen that can bring one back, and hiding it would make it look deleted and get it
  re-added under a name that collides with `league_teams_club_id_rcm_name_key`.
  ⚠️ **A new `listAllLeagueTeams` reads club-wide, and is NOT a picker source** — the
  squad-scoped `listLeagueTeams` still exists for exactly that reason; this one saves
  fifteen round trips on a screen that lists every squad, and the screen groups by
  `team_id` itself. ⚠️ **The screen offers no Delete, deliberately**: `ON DELETE SET NULL`
  would strip the league identity off every fixture the team ever played, leaving them
  indistinguishable from friendlies.

⚠️ **AND `f16c025` DID DIE THE MOMENT PR #52 MERGED — REPOINTED TO `ee85430` ABOVE. THIS
IS A TREADMILL, NOT A ONE-OFF, AND IT HAS NOW RUN TWICE IN TWO PRs.**

⚠️ **`npm run docs:check` CANNOT CATCH THE DEAD SHA ON THE MACHINE THAT WROTE IT, AND THAT
IS THE TRAP THAT BIT ON PR #53.** A squashed-away commit is still a loose object in the
clone that authored it, so `git cat-file` finds it and the check goes green locally while
CI — a fresh clone with only `main`'s history — fails on the same file. **A green local
`docs:check` is not evidence for a changelog SHA.** Verify with
`git cat-file -e <sha> 2>/dev/null` inside a clone that never had the branch, or simply
trust CI over the laptop. Same shape as the CRLF trap in `state-of-play.md`, in reverse:
there CI is blind and the PC sees it; here the PC is blind and CI sees it.

`docs:check` requires every commit to be cited by SHA, and
`main`'s only merge method is squash, so **every** branch SHA a changelog entry cites stops
existing at merge and `main` goes red until the next PR repoints it. That is the mechanism
that broke below, and it will repeat after this PR, and after the one after that.
**Decide the rule rather than paying it each time** — the options are citing the PR number
instead of the SHA, teaching `scripts/docs-check.mjs` to accept an unreachable SHA that a
squash subject matches, or writing the changelog entry only in a follow-up. Not fixed here
because it changes a check, and that is Jay's call.

⚠️ **`b640b4a` and `8cd5ff0` USED TO HEAD THE NEXT TWO ENTRIES AND ARE NOT COMMITS.** They
were branch commits, and `main`'s only merge method is SQUASH — so the moment PR #51
merged they ceased to exist and `docs:check` went red on `main` itself, not merely on a
branch. **Cite the SHA the squash produced, which nobody can know until after the merge:**
that is exactly the "changelog is allowed to be one commit behind" rule, and the reason it
must be the NEXT PR that fills it in. Repointed to `725d0e6` below rather than deleted —
`CLAUDE.md` rule 7, an anchor that has rotted gets repointed, never removed.

- `725d0e6` — **`league_teams`, the data layer, and one shared fixture label** (tasks 1-4,
  PR #51). Squashed from the two entries that follow, which are kept for their detail.

- (in `725d0e6`) — **The league-team data layer and one shared fixture label** (tasks 3-4).
  `listLeagueTeams` / `upsertLeagueTeam` / `setLeagueTeamActive`, plus the formatter every
  screen will render. ⚠️ **The null case is tested FIRST** — no league team means no
  division and no round, and a stale round left on a fixture later changed to a friendly
  must not leak out. ⚠️ **`upsertLeagueTeam` throws when RLS filters a write to zero
  rows**: that refusal arrives as `data === null` with `error === null`, so without the
  explicit check a non-admin's rename reports back as saved while nothing changed.
  ⚠️ **`listLeagueTeams` is always scoped to ONE squad** and returns `[]` rather than
  querying without one — a club-wide list on the event form would let a U14 fixture be
  filed under a U16 team, which the league receives as a wrong result rather than an
  obvious mistake. Nothing user-visible yet; the display work is tasks 5-7.

- (in `725d0e6`) — **`league_teams`: the club's COMPETING teams, distinct from its SQUADS**
  (tasks 1-2). `ADHQ2` is a league team; `U14B Contact` is a training squad; one squad can
  enter three. Plus `events.league_team_id` and `events.round`.
  ⚠️ **The RLS harness was run BEFORE the migration existed**, where it could not run at
  all — that is the fault injection — and again after. All five steps pass, including a
  coach's INSERT refused with **42501 specifically**, because a refusal caused by a
  mistyped table name would otherwise read as "RLS works".
  ⚠️ **The harness's first run died with "permission denied for table `_r`"**, which looks
  exactly like an RLS failure on `league_teams` and was nothing of the kind: its temp
  results table was granted to `authenticated` but not `anon`. **A harness that cannot
  record its own result reports a bug that does not exist.**
  ⚠️ **`events.league_team_id` is ON DELETE SET NULL, never cascade** — deleting a league
  team must cost a fixture its LABEL, which is recoverable, and never the FIXTURE.

- `4b5a152` — **An implementation plan for Project 1**, `claude/plans/2026-08-11-league-teams-implementation.md`
  — eight TDD tasks. ⚠️ **Task 4 is written null-case-first on purpose** and step 5 proves
  that test discriminates by injecting a default into the null branch. ⚠️ **One shared
  label formatter rather than four call sites**, because the calendar feed
  deploys separately from the bundle, so drift there stays invisible until a parent's
  subscribed calendar disagrees with the app. ⚠️ Task 1 writes the RLS harness BEFORE the
  migration and runs it expecting failure, so it is proved against the absence of the
  thing it tests — and asserts `insufficient_privilege` specifically, because a negative
  check that passes on a mistyped table name proves nothing.
  ⚠️ **`docs-check` only validates `claude/`, `src/` and `db/` paths**, so the plan's
  `supabase/functions/calendar/index.ts` reference was verified by hand — a green
  `docs-check` would not have covered it.

- `45d50d4` — **Two specs for the Club Youth Manager's match sheets, and the brainstorm found a modelling gap that
  would have wasted the build.** `claude/plans/2026-08-11-league-teams-and-fixtures.md`
  and `claude/plans/2026-08-11-match-sheets.md`, split because the work spans EventForm,
  Schedule, the calendar feed and the allocation grid before a sheet is even rendered.
  ⚠️ **"MATCH SHEET" IS NOT A CLUB REPORT — it is the RCM Official Match Result Sheet**,
  a governing-body form returned per team per game, submitted to a WhatsApp group as a
  file or photo. Jay supplied a filled example, which settled the format outright.
  ⚠️ **THE SAME FORM HAS TWO DEADLINES ON OPPOSITE SIDES OF THE MATCH**: U11–U16 within
  24 hours AFTER, U18 one hour BEFORE kick-off. Jay described it as an after-the-match
  report, which is true of the age groups he had in mind and not of U18.
  ⚠️ **THE GAP THAT MATTERED: two different things here are both called "team".** A
  SQUAD (`U14B Contact`) is a training group and is all the app models; a LEAGUE TEAM
  (`ADHQ2`) is a competing entity in one division, and each age group can field three.
  A first design storing one RCM name per squad was agreed and then withdrawn when Jay
  said so — one column cannot hold three teams. ⚠️ **And the letter in a squad name is
  GENDER, not division**: `U14B` is Boys. Anything parsing a division out of `teams.name`
  reads the gender instead.
  ⚠️ **Measured while designing, and it shapes the build: 7 players in the whole
  database, 0 with a position, 0 captains, and `attendance` still empty.** A 22-man sheet
  cannot be built from a 7-player roster and there is deliberately no import — so names
  are stored as TEXT alongside the optional `player_id`, which is the load-bearing
  decision in the project. Auto-filling from the register is deferred for the same
  reason the attendance flags are.

- `0ef43d4` — **Corrected what the Roster pill change actually was** — the gender filter,
  not the squad or age-group one.

- `d6a1f1b` — **The fortnight strip, the gender filter and the match pill all take the
  12px corner.**
  Jay: *"things like the next two week buttons can be like the age group buttons on the
  tournament website, things like match pills etc can be similar too"*. Three changes, all
  corner-only:
  `UpcomingStrip` day cells (`rounded-[11px]`→`rounded-tab`) — ⚠️ **already adhjrt's shape
  in every other respect**: white with a hairline idle, solid red for today, exactly as
  those buttons go white then red when selected. Only the corner disagreed, and 11px is
  the app's SURFACE radius, the wrong token for something you press.
  `Roster`'s **gender** filter (`rounded-pill`→`rounded-tab`) — a horizontal row of
  filters, white until chosen and filled red when it is. It was a 100px pill.
  ❌ **`d6a1f1b` and PR #47 both call this "the squad filters" and "the closest analogue
  to adhjrt.com's age-group buttons". It is neither.** The three controls are
  All / Male / Female; AGE GROUP on that screen is a `<select>`, so no age-group control
  was touched at all. Caught by verifying live after the deploy rather than by review —
  the selector written to confirm it found zero elements, and chasing that down is what
  exposed the mislabelling. Neither the commit message nor the PR body can be edited.
  `Chip` (`rounded-[20px]`→`rounded-tab`) — the match pill, and per `design-system.md`
  §4.7 its neutral variant is also the age-group label, so this is the single largest
  visual change in the sweep and what ties the fixture rows to the strip and the nav.
  ⚠️ **`Chip`'s COLOURS ARE UNTOUCHED.** Every pairing in it was chosen to clear AA at
  11.5px bold and several are deliberately not the brand tokens — the component header
  gives the ratio for each. This was the corner and nothing else.
  ⚠️ **The remaining `rounded-pill` uses are BADGES, not controls, and stay round on
  purpose**: the masthead role label and account chip, the Accounts flag, Allocation's two
  counts, PitchRequest's status and PlayerDetail's two. A pill is the right shape for a
  thing that reports state; 12px is for a thing you press. **Do not "finish the job".**

- `449641e` — **The top menu now carries adhjrt.com's type, sheen and underline — measured, including
  the hover state.** Jay: *"not all capital letters, seems like the font is smaller on the
  tournament site, tournament site tabs have nice animation and a shimmer when you scroll
  over them"*. `.hdr-nav a` there is **15px/600, `text-transform: none`, radius 8px,
  padding 7px 11px 9px**; on hover it lifts 1px, washes to `rgba(255,255,255,.07)`, runs a
  115° sheen across a `::before` at `mix-blend-mode: screen`, and wipes in a gradient
  underline from the left. ⚠️ **Three of its `:hover` rules could not be read from the
  stylesheet, so the hover state was captured by HOVERING THE REAL ELEMENT** and reading
  the computed styles back — the sheen's `opacity: .85` and `holoSweep` timing exist
  nowhere else.
  ⚠️ **8px, WHICH CORRECTS THE COMMIT BEFORE IT.** `005dbc0` put 12px on the top menu from
  adhjrt.com's AGE-GROUP tabs; its header nav is a different control at 8px — which is
  `rounded-btn`, the app's own button radius, so the top menu now agrees with the
  site-wide rule that started this.
  ⚠️ **Two things deliberately not copied, both Jay's calls:** the sheen is red→white, not
  red→white→**green**, because green means SUCCESS in this app and the chrome should not
  spend it; and the current page keeps its **solid red fill** rather than adhjrt's
  colour-only marker, because this is an app people navigate constantly and colour alone
  is the weakest signal of state. The underline may be red→green — it reuses `brand-rule`,
  the club's existing decorative hairline — and is suppressed on the active item, where a
  red-to-green rule inside a red box reads as a rendering fault.
  ⚠️ **Smaller type gives the masthead back ~50px.** 16px→15px and `px-4`→`px-[11px]`
  across five items frees width in a row where the wordmark is the only non-`shrink-0`
  item. **A side effect, not the fix** — the `sr-only` cutoff at `wide` is unchanged and
  the truncation Jay reported is still unexplained.
  Harness: `tests/nav-sheen.test.js`, asserting the BUILT stylesheet.

- `005dbc0` — **The TOP MENU is now 12px too — and this is the control Jay actually meant.**
  `src/components/Nav.jsx` carried `desktop:rounded-pill` (100px); it is now
  `desktop:rounded-tab`. ⚠️ **The previous entry fixed the wrong row.** "The rounded off
  buttons at the top" was read as the `/admin` dashboard tabs, and the ambiguity had
  already been spotted and put to Jay — *"just those four tabs, or every `rounded-pill`
  in the app?"* — then resolved by guessing rather than by waiting for the answer. It
  cost a deploy. **An ambiguity you have already noticed is not one to resolve on the
  balance of probability.**
  ⚠️ **ONLY THE CORNER IS COPIED FROM adhjrt.com, deliberately.** Its idle tab is
  black-on-white, which works on a white page. This row sits on the near-black masthead,
  so a white fill would put four bright boxes into the chrome — far more than was asked
  for, and against the palette's "identity lives on the chrome so the data surfaces stay
  calm" idea. Idle stays transparent, active stays brand red.
  ⚠️ **A stale contrast figure was corrected in passing.** `Nav.jsx` documented the
  active item as **4.79:1** white-on-red. Measured live it is **5.88:1** — 4.79 is the
  ratio for `#e11b22`, which is *adhjrt.com's* red, not this app's `#c8102e`. Wrong
  number, right conclusion, sitting in the file as fact.
  The `/admin` tabs from the previous entry stay at 12px — Jay's call, and they now
  agree with the top menu.

- `5d88d03` — **The `/admin` tabs are modelled on adhjrt.com's, and the spec was MEASURED rather
  than eyeballed.** Jay: *"i want them like the tabs on the adhjrt.com website"*, after
  noticing the pills disagreed with the site-wide 8px button rule. `getComputedStyle` on
  the live age-group tabs there gives **12px radius, 0.8px border, white fill idle, red
  fill active** — so a new `rounded-tab` token (12px), ⚠️ **deliberately neither `btn`
  (8px) nor `card` (16px)**: a tab is softer than a control you press and tighter than
  the surface it sits on, and reusing `btn` would keep the row reading as buttons, which
  is what prompted the change.
  ⚠️ **ONE THING WAS DELIBERATELY NOT COPIED: adhjrt.com puts BLACK text on the red
  active tab.** Measured there it is **4.38:1** — already failing WCAG AA, since 13px
  bold does not qualify as large text (that needs 18.66px+). Against this app's darker
  red (`brand` #c8102e) the same choice measures **3.57:1**. White on #c8102e is
  **5.88:1** and is what ships. **The look is copied; the contrast bug is not.**
  ⚠️ Also worth knowing: the tab row was NOT covered by the 10 Aug button sweep, which
  excluded tabs and pills on purpose — but that decision's own closing section said
  nobody had audited whether each raw control was still right, and called it a design
  question. This is that question being answered, not a ruling being overturned.
  ⚠️ **A TAILWIND CONFIG CHANGE NEEDS THE DEV SERVER RESTARTED; a class change does
  not.** The first render came back `borderRadius: 0px`, which looks exactly like a
  typo. Every pre-existing token applied correctly and only the NEW one was missing —
  that asymmetry is the tell. Verified in the built CSS too, with a fabricated token as
  the control emitting zero rules.

- `c06e51a` — **Claude Code's auto-scaffolded `.claude/launch.json` is gitignored**, and
  the deploy cost recorded. See the two entries below, which this commit shipped.

- **A deploy costs 15 Netlify credits, and that is now written down.** `rules.md` tells
  every session to look the figure up in `CLAUDE.md`; it had never been recorded, so
  deploys were described as vaguely expensive and no session could say what a build was
  worth. Jay's framing — *"it's not really expensive"* — is recorded with it, because
  the number without it invites the opposite error. ⚠️ **Skipping a pointless deploy is
  tidiness, not thrift**; what still needs an explicit yes is that `main` is LIVE.
  ⚠️ Recorded alongside it: **`scripts/netlify-ignore.mjs` treats a DOTFILE as
  deploy-relevant** — its root pattern is `/^[^/]+\.md$/`, so `.gitignore`,
  `.gitattributes` and `netlify.toml` all build. Correct for `netlify.toml`, whose
  redirects and headers only take effect by deploying. **Run the gate before promising
  a skip** — PR #43 claimed one in its own description while the preview was building.

- **Claude Code's auto-scaffolded `.claude/launch.json` is gitignored.** The app wrote
  it mid-session; it is a per-machine dev-server config and has no business travelling
  between the two PCs. ⚠️ **`.claude/settings.json` STAYS TRACKED** — it wires
  `scripts/session-guard.mjs`, so an ignore rule wide enough to catch it would silently
  untrack the clone-staleness guard and nothing would say so until a session ran on a
  stale clone. The rule names the one file, and the check that matters is the negative
  one: `git check-ignore .claude/settings.json` must stay empty.
  ⚠️ **`settings.local.json` was already covered by the GLOBAL gitignore**
  (`~/.config/git/ignore`), not by this file — asserted here as un-ignored first, and
  `git status` had already been showing otherwise. **`git check-ignore -v` names the
  file AND the rule; `git status` only tells you what it decided.**

- `0c27689` — **`db/schema/` had drifted for two days, and the re-capture found three
  claims that had INVERTED rather than merely gone stale.** Seven objects were live with no entry
  in the directory: `private.is_super_admin`, `public.set_admin_rights`, the
  `memb no self promotion` policy, `memberships.is_super` / `.admin_rights`,
  `private.notify_pitch_request`, its two triggers, and
  `teams.self_registration_allowed`. ⚠️ **`policies.sql` said "Every policy is
  PERMISSIVE"** — `memb no self promotion` is RESTRICTIVE, the only one in the schema,
  and it is what stops an admin INSERTing themselves an already-super membership row
  (the column grant only closes UPDATE). ⚠️ **Its RLS-enabled list named thirteen
  tables against sixteen live**; all sixteen do have RLS on, but that list is the only
  thing in the repo that would show a table created without it, and Supabase's
  defaults hand `anon` full rights on any new `public` table. ⚠️ **`functions.sql`
  described a `register_my_player` signature the 11 Aug migration DROPS**, so the live
  4-arg version and its self-registration guard appeared nowhere. ⚠️ **And the
  `pitches` / `pitch_requests` blocks were the migrations' DDL pasted in, not a
  capture** — inline unnamed constraints, so `pitches_club_id_name_key` and
  `pitch_requests_status_check` existed nowhere in the repo as strings and a rename
  would have diffed to nothing. Also recorded, not reconciled: the live
  `register_my_player` body carries SHORTER comments than the committed migration, so
  re-applying that file would rewrite the live function. Detail in
  `db/schema/README.md`.

- `5979c21` — **A U13+ player can register themselves.** "Add your player" asks *is this
  you, or your child?* for squads that permit it, and the membership role becomes
  `player` rather than `parent`. ⚠️ **The permission is a new `teams` column, never the
  squad name** — `20260806_claim_roster_access.sql` ruled that a rename must not hand an
  account a role it should not have. The database refuses a self-registration for a
  squad that disallows it (`0A000`, deliberately unmapped so the sentence naming the
  squad reaches the person). ⚠️ **The 3-arg `register_my_player` is dropped**, because
  Postgres prefers an exact arity match and every existing client would otherwise keep
  resolving to it. Design and the rejected alternatives:
  `claude/plans/2026-08-11-youth-self-registration.md`.

- `0e62899` — **The machine facts were measured on the machine, and two were wrong.**
  cafnet was synced from `build/v1-mvp` — a branch deleted from origin, 76 commits
  behind — and the claims about it checked by running the commands there. ⚠️ **`NODE_ENV`
  is not set on cafnet at any scope**, contradicting the "BOTH PCs" wording that had
  replaced an earlier "cafnet only" — wrong in both directions, and copied rather than
  run both times. npm is not blocked from PowerShell there; `core.fileMode` is `false`.
  `CLAUDE.md` now carries a per-machine table as the single home and the three files
  that restated a value point at it. ⚠️ **The `jay-pc` column is SECOND-HAND and says
  so** — the first draft asserted "measured ON THAT MACHINE" over a column assembled on
  cafnet from what other documents claimed, reproducing inside the fix the exact failure
  it was fixing.
  Also records three traps: the stale-`dist` one (`npm test` does not build, and three
  test files read `dist/`), the `0 0`-against-a-dead-ref one, and that **pushing and
  opening a PR are different credentials** — no git command opens a pull request, the
  account-level connector still returns `Bad credentials`, and feeding git's stored
  token to `gh` is blocked by the permission classifier and should be. `gh` is now
  installed and authenticated on cafnet. ⚠️ **`hosts.yml` existing is not proof of
  login.**

- `2008269` — **Tell the next cafnet session what a plain `git pull` will not fix.**
  That clone was last measured 7 Aug on a branch since deleted, and `.gitattributes`
  landed 10 Aug. ⚠️ **Git applies `eol` attributes on CHECKOUT, so a pull normalises
  only the files that pull changed** — every `.mjs` older than 10 Aug and untouched
  since keeps its CRLF, and the suite then fails with a `SyntaxError` naming a blank
  line in an unrelated test. **CI cannot see it**: Actions checks out LF and stays
  green. Recommends a fresh clone, gated on checking `git status` AND `git stash list`
  first.

- `cc49604` — **Bring the docs up to date, and record `bfcb571`.**

- **11 Aug — the docs caught up with the session.** `state-of-play.md` carried three
  claims the day had falsified (the pitch screens and email "NOT BUILT YET", the
  super-admin tier "NOT YET BUILT"), `RESTORE.md` had no record of the notification
  plumbing, and the session had no handoff. ⚠️ **All three stale claims were the same
  kind: a status line that was true when written and was carried past the change that
  falsified it** — the precise failure `state-of-play.md` exists to catch, and the
  third instance in a week.

- `bfcb571` — **Email Pitch Managers on a pitch request, and the coach on the answer.**

- **11 Aug — a pitch request now EMAILS: the Pitch Managers when it is asked, the
  coach when it is answered.** Trigger `notify_pitch_request` on `pitch_requests` plus
  the `notify-pitch-request` edge function. Closes Jay's "email multiple people,
  appear in two dashboards, trackable from submission to assignment".
  ⚠️ **THE DATABASE SENDS IT, NOT THE APP — and not for tidiness.** The submit mail
  goes to admins, and **the coach who triggers it cannot read admin email addresses**:
  `profiles` is not bulk-readable by a coach and `profiles.email` is column-granted,
  not merely policy-gated. A client-side send would need either the club's admin list
  in every coach's browser or a service-role key in it. The recipient list HAS to be
  built server-side.
  ⚠️ **SUPER ADMINS ARE RECIPIENTS TOO, deliberately.** A super holds every right
  implicitly, so filtering on the `pitches` right alone would exclude the one person
  certain to be able to act — and on a club where nobody has been given the job yet,
  that is EVERY recipient. Today that is not hypothetical: nobody has been granted
  Pitch Management, so both current recipients are Jay's own accounts.
  ⚠️ **THE FAILURE IS GENUINELY QUIET, and an earlier claim that it was "visible"
  was wrong.** Both triggers swallow everything into a `raise warning` nobody reads,
  so a dead endpoint costs an email silently. That is only acceptable because **the
  queue is in-app**: the request sits on the allocation screen whether or not the mail
  arrives. The email is a prompt to go and look, never the record.
  ⚠️ **`allocatePitch`'s write ORDER is what makes the allocated mail correct.** It
  writes `events.pitch` first and closes the request second — chosen so a refused
  fixture write leaves a job to do rather than a lie, but it also means the fixture
  already holds the real pitch when the trigger fires. Reversing those two writes
  would email "you are on Pitch TBD".
  ⚠️ **Verified live because nothing else could verify it** — a Postgres trigger and
  a Deno function are not modules vitest can import, so this ships with NO unit tests.
  All three branches exercised on production: `submitted` → 2, `declined` → 1,
  `allocated` → 1, test row deleted, `events` never written. Two checks that would
  otherwise have passed while lying: the 401 was confirmed by its **body**, since the
  gateway also returns 401 for a missing JWT and the status code alone cannot prove
  `verify_jwt: false` took effect; and the trigger was proved to fire by inserting
  inside a transaction and forcing a ROLLBACK — the pg_net queue row lives in that
  transaction too, so it went 0 → 1 and vanished with everything else, proving the
  wiring without sending anything.
  ⚠️ **The copy no longer names `Pitch TBD`.** It said the fixture was "showing Pitch
  TBD", but that string is an option a coach PICKS in the event form — `requestPitch`
  never writes to `events`, so a fixture awaiting a pitch just as often has an empty
  one. The claim was false about half the time.
  Reuses `approval_notify_secret` rather than minting a second secret to rotate and
  forget; new vault entry `pitch_notify_url` is DERIVED from `approval_notify_url` so
  the host cannot drift between the two.

- `852dbf2` — **The pitch request loop closes — ask, answer, and see the outcome.**

- **11 Aug — the pitch request LOOP closes: a coach asks, Pitch Management answers, the coach
  sees the outcome.** `PitchRequest` on the event sheet, and a queue on the allocation
  screen. `pitch_requests` finally has something writing to it.
  ⚠️ **`events.pitch` REMAINS THE ONLY SOURCE OF TRUTH for which pitch** — Jay's
  ruling. The request table records the CONVERSATION and has no pitch column; a second
  copy would disagree with the fixture the moment anyone edited the fixture directly.
  The accepted cost: you cannot ask "what did Pitch Management allocate, and has it changed
  since?", only "was this answered?".
  ⚠️ **A DECLINE IS INVISIBLE ON THE FIXTURE — also Jay's ruling.** It keeps
  `Pitch TBD`, which still reads "not allocated yet". So the request block is the ONLY
  route to that fact, which is why it renders for a DECIDED request too and why the
  decline reason is required rather than optional: "declined" with no reason leaves a
  coach nothing to act on.
  ⚠️ **ALLOCATING WRITES THE FIXTURE FIRST, THEN CLOSES THE REQUEST.** Closing first
  and then failing would tell the coach they have a pitch while the schedule still
  said `Pitch TBD`. This way a failure leaves the request OPEN and the fixture
  correct — a job still to do rather than a lie. **Not atomic** (no transaction over
  PostgREST); the order is the mitigation, not a fix. Proved by swapping it: three
  tests fail.
  ⚠️ **THE QUEUE IS NOT FILTERED BY THE DAY ON SCREEN.** A request is a job waiting,
  not an event on a date — filtering to the visible day would hide next Saturday's
  requests every weekday, so the queue would look empty exactly when there is work.
  ⚠️ **The request block takes NO handler**, unlike the availability and register
  blocks beside it — each of which shipped a dead button when a screen forgot to pass
  one. Nothing here can be wired up wrongly by the next caller.
  ⚠️ **AND CI CAUGHT THE SAME CLASS OF FAILURE A SECOND TIME.** Five allocation screen
  tests: green here, red on Linux, twice in one evening. The cause both times was an
  **unmocked data module** — the component reached for `placeholder.supabase.co` (CI
  sets placeholder env vars, so the client constructs happily), which fails fast
  locally and does not in CI, leaving `Promise.all` unsettled and the screen in
  `loading`. The symptom is several "unable to find an element" errors naming nothing.
  ⚠️ **A global `fetch` guard was written to catch this class permanently, and then
  REMOVED.** It did make local match CI, but it did not produce the explanatory
  message it existed to give — the throw is swallowed by the component's own `.catch`
  — and the mechanism could not be pinned down. **A guard whose comment promises a
  clear failure and delivers a silent one is worse than no guard**, so it was taken
  out rather than shipped on a claim that could not be substantiated. The rule is
  written into `src/test/setup.js` instead, with the worked example in the test.
  ⚠️ **The identity comes from the client library at write time, not a prop or a React
  context.** RLS checks `auth.uid()` against the token the request is sent with, so
  that is the only id that can be right — and requiring a context broke six unrelated
  event-sheet tests the moment the component was added, because those screens render
  without an AuthProvider.
- `9fa06c0` — **The allocation grid — pitches down the side, the day across the top.**

- **11 Aug — the ALLOCATION GRID (option C).** `/admin/allocation`: pitches down the
  side, the day across the top, clashes in amber. The screen the pitch work existed
  for — a Saturday morning fits on one view and a double booking reads without reading
  a word. Tab order puts Allocation before Pitches, because allocating is weekly and
  setting the list up is twice a season.
  ⚠️ **It opens on TODAY — Jay's call, asked directly.** Today is often a quiet
  Tuesday, so an empty day says **"Nothing on today. Use Next to look ahead."** rather
  than drawing fifteen empty rows, which reads as the app failing to load.
  ⚠️ **THE HOUR COLUMNS ARE DERIVED FROM THE DAY'S FIXTURES, NOT FIXED.** A fixed
  08:00–20:00 grid would silently drop a 07:00 kick-off — the fixture would exist, be
  allocated, and simply not appear.
  ⚠️ **A RETIRED OR UNLISTED PITCH GETS A ROW IF SOMETHING IS ON IT.** Showing only
  active pitches would make that booking vanish from the one screen whose job is to
  show what is booked — it would still exist and still clash, invisibly. Not
  hypothetical: `events.pitch` is free text and 16 seeded fixtures name pitches outside
  the list. Both cases are labelled on the row ("retired" / "not listed").
  ⚠️ **FIXTURES WITH NO PITCH GET THEIR OWN LIST**, because they appear in no row —
  without it, the emptier the grid looked the more work there actually was.
  ⚠️ Clashes reuse `findPitchClashes`, so the exemptions hold: a multi-squad fan-out
  is not a clash, touching is not overlapping, `Pitch TBD` never clashes. Counted once
  per pair rather than once per fixture.
  ⚠️ Both invisible-fixture guards proved by injected fault; removing the retired-row
  logic took four tests down.
  ⚠️ **AND THE TEST FILE PASSED HERE WHILE FAILING IN CI** — five screen tests green
  on Windows, all five red on Linux. The cause was the test, not the screen: it mocked
  `pitches.js` with `vi.doMock` AFTER importing the module, then re-imported. That
  happened to re-evaluate locally and did not in CI, so the real `listPitches` ran and
  reached for Supabase. Fixed by hoisting to `vi.mock` with `importActual` (keeping
  the real clash detector), plus an explicit assertion that the mock is in use —
  otherwise the failure arrives as five "unable to find an element" errors that name
  nothing. **The usual version of this trap is CI-green/local-red; this was the mirror
  image, and local green proved nothing.**
- `6421579` — **The pitch setup screen — blocks as columns.**

- **11 Aug — the pitch setup screen: blocks as columns.** `/admin/pitches`, picked by
  Jay from **six** options laid out at browser width. Four block cards, all fifteen
  pitches visible at once on a desktop, stacking on a phone; tap a chip to rename or
  retire, `+` to add one to that block.
  ⚠️ **The `pitches` admin right gates the TAB and the SCREEN, and neither is
  security.** Every admin can already write the table — the RLS policy is `is_admin`
  deliberately, because these rights decide which specialist dashboard somebody is
  SHOWN. So the screen says "you haven't been given the Pitch Manager job", not "you
  are not allowed". The screen repeats the tab's check because a route is linkable and
  somebody will paste the URL. A **super admin** gets in without the right being
  listed, since a super admin holds all of them implicitly.
  ⚠️ **THE BLOCK IS DERIVED FROM THE NAME, not stored.** The club already puts it in
  the name (A1, C5), and a `block` column would be a second place for it to be wrong.
  The cost is that a name like "Clubhouse lawn" has no block, so `Other` exists as a
  real bucket — and it always sorts LAST, because a stray bucket in the middle of
  A/B/C/D reads as a block the club does not have.
  ⚠️ **THE RENAME WARNING IS PART OF THE FEATURE.** `events.pitch` is TEXT with no
  foreign key, so renaming a pitch does NOT touch the fixtures already naming it —
  they keep the old string and silently stop matching for clash detection. The screen
  says so, every time, and points at retiring instead. Proved by deleting the warning:
  the test fails.
  ⚠️ **A retired pitch is ANNOUNCED as retired**, not just drawn with a dashed
  outline — the outline is invisible to a screen reader, and "what is out of action"
  is the main question this screen answers. Also proved by injected fault.
  ⚠️ **This is NOT the allocation screen.** Allocating is weekly and gets its own grid
  (option C, not built). They are separate so a rare destructive action does not live
  on the screen used every week.
- `0ae522b` — **`pitch_requests`: a coach asks, an admin allocates.**

- **11 Aug — `pitch_requests`: a coach asks, an admin allocates. SCHEMA AND RLS ONLY —
  no screen and no email yet.** Jay's four rulings: a request **attaches to an existing
  fixture** (so it appears in the schedule at once carrying `Pitch TBD`, which is what
  that placeholder already means); **Pitch Management allocates**; **the referee is a tickbox on
  the same request**, because both are asked for at the moment a match is arranged;
  and it must be **trackable from submission to assignment by the person who submitted
  it**, in two dashboards, with email.
  ⚠️ **CREATE is `can_edit_team`, DECIDE is `is_admin`, and that difference IS the
  feature.** A coach may ASK for their own squad; only an admin may ANSWER. Widening
  "decide" would let a coach allocate their own request — the exact thing a request
  exists to prevent. **Proved live: a coach's own UPDATE is filtered to zero rows.**
  ⚠️ **The read policy's `requested_by = auth.uid()` arm is a REQUIREMENT, not a
  convenience.** Without it the submitter cannot see their own request and the feature
  becomes a black hole with an email at the end. Proved live: after the admin
  allocates, the requester reads back `allocated`.
  ⚠️ **Withdrawing is a DELETE, not a status write** — the UPDATE policy is admin-only,
  and widening it to the requester would also let them write `allocated`. Deleting an
  UNDECIDED request is the narrow power that cannot be abused; once decided the policy
  stops applying. Proved live: refused after a decision.
  ⚠️ **One row per event, by constraint.** A second request is the same question asked
  twice — two rows would mean two queue entries, two emails and a race.
  ⚠️ **An early run of the harness showed the admin with NO access at all**, which
  looked exactly like a broken policy. It was the test: a **membership** id had been
  used as the JWT subject where a **profile** id was needed. The policy was correct
  throughout. Recorded because the failure mode is indistinguishable from a real one.
- `dc01d37` — **The pitch list is the club's real pitches, not the seed's.**

- **11 Aug — the pitch list is the club's REAL pitches: A1-A4, B1, C1-C5, D1-D5.**
  ⚠️ **The list seeded hours earlier was a list of nothing.** It was derived from
  whatever text sat in `events.pitch`, and that text was almost entirely SEED DATA:
  of the 22 allocations, **16 came from the seeded September** — "Pitch 1" through
  "Pitch 7" and "Clubhouse lawn", fixtures nobody at the club ever played. **A list
  seeded from data is only as real as the data**, and this one was caught solely
  because Jay read it and said what the pitches actually are.
  ⚠️ **The seeded rows were DELETED, not retired** — a deliberate exception to this
  table's own rule. `is_active` protects pitches that were once real; retiring these
  would leave eight fictional pitches in the management screen forever.
  ⚠️ **`Pitch D2` was remapped to `D2`, and it was the only one.** Six real events
  carried it, **none from the seed**, and it unambiguously means D2. The rest were
  left: they belong to the seeded September, which is due for deletion before a
  pilot, and rewriting fixtures about to be thrown away is work performed on rubbish.
  ⚠️ **Verified after: 16 events still name a pitch outside the list, and ALL 16 are
  from the seed — zero real fixtures orphaned.**
  ⚠️ Sort order leaves gaps between the letter blocks (1-3, 11, 21-24, 31-35) so a B2
  or C5 slots in without renumbering. Alphabetical would order correctly today and
  break the moment a pitch is named A10.
  ⚠️ **Applied in two steps**: Jay's first message said A1-A3 and C1-C4, corrected
  minutes later to A1-A4 and C1-C5. The migration FILE carries the end state so a
  replay produces all fifteen; Supabase's own list is the authority on what ran.
- `2ed48b1` — **A managed pitch list, and the clash detection it unblocks.**

- **11 Aug — a managed pitch list, and the clash detection it unblocks.**
  `db/migrations/20260811_pitches.sql`. ⚠️ **This OVERTURNS the 5 Aug decision**,
  which chose "free text beside Venue. No pitches table, no clash detection." That
  was the right scope call for one person entering fixtures; Pitch Management IS a
  job now, and the free text had already drifted — measured 11 Aug: **"Pitch 2"
  AND "Pitch D2"** both in use, plus "Clubhouse lawn". No clash detector can group
  by a string somebody retyped.
  ⚠️ **`events.pitch` STAYS TEXT WITH NO FOREIGN KEY**, and this is the part most
  likely to be "tidied" later. **`Pitch TBD` is a placeholder, not a pitch** — Jay's
  ruling, because without it nobody can tell "not allocated yet" from "the app didn't
  say" — and it is 26 of 48 rows. A foreign key would force it to become a fake pitch
  row or NULL, and NULL loses the distinction the ruling exists to preserve. The list
  is a picker source, not a constraint.
  ⚠️ **The free-text box survives beside the picker, deliberately.** Existing events
  name things that predate the list, and a picker that could not express "Clubhouse
  lawn" would force somebody to mis-file a fixture or invent a pitch row for a lawn.
  ⚠️ **If the pitch list cannot be read, the form falls back to free text** rather
  than refusing to save. Nobody should be unable to record a match because a lookup
  table was unreachable.
  ⚠️ **CLASH DETECTION REPORTS, IT NEVER REFUSES**, and the exemptions are the whole
  design: a **multi-squad fan-out is not a clash** (one event per squad sharing a
  `group_id`, on the same pitch at the same time BY CONSTRUCTION — reporting those
  would make every multi-squad fixture look double-booked and the feature would be off
  within a week); **touching is not overlapping** (18:00 finish, 18:00 start is how a
  Saturday runs); **`Pitch TBD` never clashes**; and with a null `ends_at` only an
  identical start counts, because assuming a duration invents a clash from data nobody
  entered. Both load-bearing rules proved by injected fault.
  ⚠️ **A green build did not mean a working screen**: the picker shipped referencing
  an undefined constant because the patch anchor matched a different file. `npm run
  build` passed; the unit suite caught it.
- `f85d90f` — **The screen a super admin uses to assign admin rights.**

## 10 Aug 2026

- **10 Aug — the screen that assigns admin rights.** `AdminRightsEditor`, rendered
  under each ADMIN membership in the Accounts editor, **for a super admin only**.
  Three tickboxes (Youth Manager, Social Media Manager, Pitch Manager) plus a Super
  admin toggle, saving on every tick rather than behind a Save button that can be
  forgotten. ⚠️ **Hiding it from an ordinary admin is NOT the enforcement** — the
  column grant and the `set_admin_rights` RPC are, and this repo's rule stands: a
  screen that hides a row is not security. The gate exists so an ordinary admin is
  not offered a control that could only fail.
  ⚠️ **A REFUSED SAVE PUTS THE TICK BACK.** The write is optimistic, so without the
  revert somebody walks away certain that an account holds Pitch Management while the database
  disagrees — the lying-UI failure. Proved by deleting the revert: the test fails.
  ⚠️ **A super admin's boxes show ticked AND disabled**, because a super admin holds
  every right implicitly and empty boxes would read as "no rights", the opposite of
  the truth.
  ⚠️ **Both of Jay's accounts are now super** — `jayjmuir@gmail.com` and the backup
  `jayjmuir@yahoo.com`. A single super account is one lost password away from needing
  SQL to recover; the cost is that two accounts can hand out club-wide authority.
  A **third ordinary admin** (not super) is **legitimate**, confirmed by Jay — recorded
  so it is not raised again as a stray. ⚠️ **Its login address stood here until 20 Aug
  2026**; identify the row from the database, not from this line.
  ⚠️ **A fault injection could not be reverted by `git checkout --`** because the
  file was UNTRACKED, so the restore silently did nothing and left the injected fault
  in the working tree. Caught by re-grepping for the line afterwards. **Check the
  restore, not just the injection** — the third variant of this trap today.
- `10283a9` — **The super-admin tier and per-admin rights (foundation).**

- **10 Aug — the super-admin tier and per-admin rights. FOUNDATION ONLY: no
  dashboard uses a right yet.** The model Jay asked for: base admin unchanged
  (full club data), **admin rights** as ADDITIVE specialist capabilities —
  Youth Manager, Social Media Manager, Pitch Manager — each intended to unlock
  a dashboard, and a **super admin** who assigns rights and assigns admin.
  ⚠️ **A FLAG, NOT A ROLE VALUE, and the reason is measured.** Twelve places in
  the schema test `m.role = 'admin'`. A new role value needed all twelve, and
  each is a chance to miss one — where a miss silently strips a super admin of
  an ordinary power. `memberships.is_super` makes a super admin an admin, so
  all twelve keep working untouched.
  ⚠️ **THE PART THAT MAKES IT REAL RATHER THAN THEATRE.** `memb manage` is
  FOR ALL and admin-only, so **any admin could already write membership rows,
  including their own** — a plain column would have let any admin set
  `is_super` on themselves. **RLS cannot close that**: a policy authorises the
  ROW, and "an admin may write membership rows in their club" is true before
  and after the row gains the flag. The protection is a COLUMN PRIVILEGE —
  `authenticated` lost table-level UPDATE on `memberships` and got back six
  named columns — plus `public.set_admin_rights`, SECURITY DEFINER, which
  checks the caller first and RAISES rather than returning quietly. Exactly the
  shape `profiles.email` and `approve_membership` already use.
  ⚠️ **Proved live in a rolled-back transaction, BOTH directions**: an ordinary
  admin is refused on the UPDATE path (42501, column privilege), the RPC path
  and the INSERT path, while still writing the columns it should; a real super
  admin does all of it and an unknown id is refused rather than reported as
  saved. Without that second half a build that refuses EVERYONE looks identical.
  ⚠️ **RIGHTS GATE SCREENS, NOT DATA** — every admin already sees every child's
  name, photo and contacts. A right decides which dashboard appears; it
  withholds nothing. **A future right that must genuinely withhold data needs
  RLS; hiding a menu item is not security.**
  ⚠️ **The first super admin was set by hand in SQL** (`jayjmuir@gmail.com`),
  because none can exist to grant it.
  ⚠️ **A fault injection silently changed no bytes and reported green** — a
  `
` against a CRLF file, the second time today. Caught only because the
  script printed the occurrence count before and after. **Print the count.**
- `5648530` — **A super-admin TIER, attendance has no data, and why it is a flag.**

- `b0e9602` — **A Player can be granted access before they are on the roster.**

- **10 Aug — a Player can be granted access when they are NOT on the roster yet.**
  Jay created a login for his son and found the only choices were six unrelated
  `Test Player` rows: no way to add a new player, so the account was ungrantable.
  ⚠️ **This is the NORMAL case, not an edge one** — the 10 Aug no-roster-import
  decision settled that parents self-onboard and the old roster most likely never goes
  in, so almost every player ever granted access will not be on the roster first.
  ⚠️ **IT CREATES THE PLAYER RATHER THAN REUSING THE PARENT'S FALLBACK, and the
  difference is not stylistic.** A parent with children off-roster gets age-group rows
  with `player_id` null. That cannot work for a player: `private.is_own_player` is
  `m.player_id = _player AND role in ('parent','player')`, so a player membership with
  a null `player_id` **matches nothing** — the account could never set its own
  availability, photo or gender. It would look granted and behave like a stranger.
  ⚠️ **THE PLAYER IS CREATED LAST, after every refusal has passed**, and that ordering
  is the point: creating first would leave a real child on the roster every time the
  grant was then refused, and in `players` a stray row is a stray CHILD. Proved by
  moving the duplicate check after the creation — the test then fails with "a refused
  grant must not leave a child on the roster".
  ⚠️ **The membership follows the row the DATABASE returned**, not the id posted to it,
  so a trigger or default placing the player elsewhere cannot leave the account scoped
  to a squad the child is not in.
  ⚠️ **A first draft of that orphan test proved nothing while passing** — its existing
  row carried a `player_id`, which does not collide with the row as built (`playerId`
  null), so the refusal never fired. A collision has to match what the duplicate check
  actually compares.
- `bfaeb16` — **Page the event reads.**

- **10 Aug — event reads are PAGED, so an admin on all squads is no longer an error
  screen.** `listEvents` sent one capped request that THREW above 900 rows. That
  refusal was right in principle — a short list that looks complete is worse than an
  error — and wrong in practice: fifteen squads over the 18-month window is ~1,690
  rows, so the cap turned Schedule into an error with no action that fixed it short of
  filtering to one squad. `fetchAllPages` (`src/data/limits.js`) walks `.range()` until
  a short page arrives. ⚠️ **The guarantee is unchanged: everything, or a throw. Never
  some of it.**
  ⚠️ **`MAX_TOTAL_ROWS` (5,000) is a PRODUCT limit, not a PostgREST one.** `MAX_ROWS`
  exists because one request cannot exceed `db-max-rows`; paging removes that wall, so
  something else has to decide when "a lot of fixtures" means "something is wrong".
  Nothing changes in the database at 5,000 — it is ~3× the club's realistic worst case.
  ⚠️ **THE SORT MUST END IN A UNIQUE COLUMN, AND THAT IS THE SUBTLE PART.** `.range()`
  is OFFSET/LIMIT. Two events can share a `starts_at` — a Saturday of age-group matches
  all kicking off at 09:00 is the normal case — and an under-specified sort lets
  Postgres order tied rows differently between requests, so one row comes back on two
  pages and another on none, **with no error anywhere**. `events` therefore pages by
  `starts_at, id`.
  ⚠️ **Both traps proven by injected fault**: `range(offset, offset + page)` instead of
  `- 1` returns 27 rows from 25 (duplicated boundaries), and removing the `id` tiebreak
  fails the sort assertion. ⚠️ The first attempt at that second injection silently did
  nothing — a `\n` in the patch script did not match CRLF — and reported green.
  **An injection that changes no bytes is not a passing test.**
  ⚠️ `listPlayers` still uses the flat cap; it is under 900 today, and `fetchAllPages`
  is written to be reused when it is not.
- `aec8264` — **Edit a whole repeating series, not just cancel it.**

- **10 Aug — a repeating series can be EDITED, not just cancelled.** Deleting a series
  shipped 8 Aug; editing one did not. `EventForm` now offers "Apply to this and every
  later session" when the event has a `series_id`, ⚠️ **defaulting to OFF** — the wider
  choice rewrites a term and there is no undo, so it must be reached for on purpose.
  ⚠️ **TWO WRITES, BECAUSE THE TIME CANNOT BE THE SAME STATEMENT.** `updateSeriesFrom`
  sets the date-independent fields (`type`, `title`, `opponent`, `home`, `venue`,
  `competition`, `pitch`, `notes`) in one PostgREST update. The time cannot work that
  way — **each occurrence has its own DATE**, so "move to 18:30 for the rest of term"
  is a different `starts_at` per row. That goes through a new RPC,
  `public.set_series_time_from`. Client-side it would be N round trips and non-atomic:
  half a term moved, half not, and nothing on screen saying which.
  ⚠️ **The RPC is SECURITY INVOKER — the only one in the schema that is, and that is
  the safety argument.** The UPDATE is evaluated as the caller, so `event edit`
  (`private.can_edit_team`) filters it exactly as it filters a PostgREST update. It
  grants nothing. A DEFINER version would have to re-implement that check by hand,
  including the status gate added hours earlier.
  ⚠️ **Duration is preserved, not recomputed** — `ends_at` moves with `starts_at`, so a
  90-minute session stays 90 minutes and a null stays null. Verified live in a
  rolled-back transaction: three sessions at 18:00, moved from the second onward — the
  first stayed put and all three stayed 90 minutes.
  ⚠️ **The field list is opt-in.** Adding a column to `events` does NOT make it
  series-editable; `starts_at`/`ends_at`, the scores and `team_id` are excluded by
  name, because the cost of getting it wrong is rewriting a term.
  ⚠️ **FUTURE ONLY and `>=` not `>`**, matching the delete's ruling: sessions already
  played keep their results and attendance, and the occurrence being edited moves too.
  ⚠️ **A fault injection exposed a weak test, and it was fixed rather than accepted.**
  Swapping `.gte` for `.gt` first failed with "gt is not a function" — red by CRASHING
  on a missing mock method, which proves the line was touched but not that the test
  knows what it should say. The mock now supports `gt`, so the same swap fails on the
  assertion instead. **A test that only crashes is not a test that checks.**
  ⚠️ `group_id` (multi-squad fan-out) is still deliberately NOT handled, exactly as
  `deleteSeriesFrom` does not handle it — Jay deferred it 8 Aug.
- `a72d07b` — **`can_edit_team` checks membership status.**

- **10 Aug — `private.can_edit_team` now checks membership status.**
  `db/migrations/20260810_can_edit_team_status.sql`. ⚠️ **This overturns a DELIBERATE
  decision, not an oversight** — `20260808_membership_pending_status.sql` states in as
  many words that it was "deliberately NOT status-gated", because staff roles are
  admin-granted and a pending coach cannot arise, so the check "implies a state that
  has no way of arising, and an unreachable branch is a lie about the model". **That
  premise is still true.** Jay ruled the other way: **thirteen** policies hang off
  this function — events, players, player_contacts, player_parents, all four
  attendance policies, three availability writes, one arm of `avail read`, and the
  player-photo storage policy — so the day any flow grants staff access through a
  pending state, all thirteen open at once and nothing in the causing diff looks like
  access control. The original author's own words were that the check is harmless.
  ⚠️ **Proved live, both directions**: a pending coach gets `can_edit_team` false,
  0 players, 0 contacts and a refused insert; flipped to active in the same rolled-back
  transaction, it becomes true with 4 players and 4 contacts. Without that second half
  the whole harness would pass while running as the owner with RLS bypassed.
  ⚠️ **AND A DRAFT OF THAT HARNESS ASSERTED THE WRONG THING.** It expected a pending
  coach to see 0 events. They see 34, and that is CORRECT: `event read` is gated on
  `private.is_attached_to_team`, which is status-blind **on purpose** — "fixtures are
  not sensitive, and a pending parent needs them to be worth signing in at all".
  Shipping that assertion would have taught a future session to "fix" a working
  design. **`is_attached_to_team` must stay status-blind.**
  ⚠️ Consequence, correcting an older note: the `avail read` policy's `can_edit_team`
  arm is now genuinely redundant rather than only looking it. Left in place.
- `c4c6491` — **Switch RSVP on.**

- **10 Aug — RSVP is switched on.** `FEATURES.availability` → `true`. Jay's call, after
  asking "where is the availability function?" twice in one day. It was false from
  29 Jul because the club was not ready to rely on digital RSVP — a readiness
  judgement, not a defect, and his to withdraw. ⚠️ **The flip needed no other change**,
  exactly as the flag's comment promised: it gates EventDetail's two entry points and
  nothing else. The screen, the `availability` table, its policies, the realtime
  subscription and `tests/availability.test.jsx` were live the whole time it was off.
  Full suite green on the flip, no test needed rewriting. ⚠️ **Availability is RSVP,
  the INTENT; attendance is the FACT** — a separate table, a separate screen, and
  deliberately not behind this flag. Do not compute one from the other.
  ⚠️ **Nobody has used it in anger** — switched on and unit-tested, not exercised by a
  real parent.
- `262d81b` — **A rolling date window, so the event screens stop asking for everything.**

- **10 Aug — the event screens stopped asking for every event ever.** `listEvents` has
  accepted `from`/`to` since it was written and **no caller ever passed one**;
  Schedule and Dashboard now both pass a rolling window from
  `src/lib/eventWindow.js`. ⚠️ **A READ FILTER, NOT A RETENTION POLICY — nothing is
  deleted, ever.** Events outside the window stay in the database, stay in the
  calendar feed, and stay reachable by paging the calendar, which refetches.
  ⚠️ **12 MONTHS BACK, AND THE NUMBER CAME FROM JAY'S QUESTION.** The first proposal
  was 3 months back / 9 forward; he asked "in 6 months will I still be able to see
  events from Sept?" **The answer was no.** Results is derived from the SAME single
  fetch as Upcoming, so a 3-month lookback would have emptied the season-in-review
  screen from February onwards — a lookback shorter than a season is wrong at every
  point after its first months. 12 back always spans the current season from any
  point inside it, and needs no season boundary stored anywhere and no annual edit.
  That question is now `tests/event-window.test.js`'s headline test, and it fails on
  the rejected proposal.
  ⚠️ **Paging the calendar past the edge WIDENS the window and refetches** — never
  renders an unloaded month as an empty one, which is the "short answer that looks
  complete" failure `limits.js` exists to prevent. Widening rather than moving means
  it settles instead of trading updates with the fetch effect forever.
  ⚠️ **The scoping tests were kept EXACT rather than loosened to `objectContaining`**:
  they existed to catch a query asking for more than it should, and waving the window
  through would have waved through a stray filter too.
  ⚠️ **Still open: admin viewing ALL squads.** At ~75 events per squad per season
  (measured: the two squads with realistic data run 2.0–2.3 per active week), 15
  squads over 18 months is ~1,690 rows — over `MAX_ROWS` at any boundary. **That is a
  pagination problem, not a window one.**
  ⚠️ **`git checkout --` wiped the Schedule half of this mid-session**, exactly as
  `CLAUDE.md` rule 6 warns: it reverts to the last COMMIT, and the work was
  uncommitted. Rule 6 says commit before injecting a fault. It was not.
- `ca79dbb` — **A real overflow gate, and the injection that nearly buried a good fix.**

- **10 Aug — a real overflow gate, and the fault injection that nearly discredited a
  correct fix.** `harness/check-overflow.mjs` drives all 28 harness scenarios through
  a real Chromium at five phone widths and fails on a document wider than its
  viewport, naming the outermost offending element rather than just a number. It also
  refuses to believe a clean result from a scenario that rendered blank.
  ⚠️ **IT PROVES `6cde750` WAS RIGHT, AFTER A BOTCHED INJECTION SAID OTHERWISE.** The
  first attempt reverted only `flex-wrap` from Schedule's header, came back green, and
  was reported to Jay as "the check disproves the fix". **It did not.** The fix is TWO
  classes and `min-w-0` is the load-bearing one — it lets the title shrink and absorb
  the row — so leaving it in place never restored the bug. The true pre-fix markup
  fails **8 of 140 pairs**. **An injected fault only proves a check when it restores
  the WHOLE original; reverting half a fix tests nothing and reads exactly like a
  pass.** Rule 6 says prove every new assertion against an injected fault; it now also
  means prove the injection.
  ⚠️ **The first width list — 320/375/414 — STRADDLED THE PHONE THAT REPORTED THE
  BUG.** Schedule overflows 53px at 320 and 13px at 360, and is clean by 375. 360 is
  the commonest Android width (1440 at DPR 4) and is what Jay was holding. A width
  list that skips the commonest phone reports green on a visibly broken screen.
  ⚠️ **Also measured: Roster's header does NOT overflow without its fix.** That half
  of `6cde750` is house-pattern consistency, not a fix, and must not be described as
  one. Only Schedule was broken.
  ⚠️ **Not wired into CI**, deliberately — Playwright is not a dependency of this repo
  and a ~300MB browser download on every build is not a trade that has been agreed.
  `npm run harness` then `npm run check:overflow`.
- `6cde750` — **The page header overflowed a phone, and took every screen with it.**

- **10 Aug — the page header overflowed a phone, and took every screen with it.**
  Jay, from a phone: "seems buggy, not scaling correctly." ⚠️ **One cause, four
  symptoms, three screens.** The page-header row is `justify-between` with a title
  on the left and a **`shrink-0`** action group on the right; `shrink-0` means the
  buttons never give way, so when the row does not fit it does not clip — **the whole
  DOCUMENT becomes wider than the viewport.** After that everything sized to the
  viewport renders short or clipped: the masthead stops reaching the right edge, and
  an open `Sheet` loses its close button and every field value. ⚠️ **The bottom nav
  looks fine throughout because it is `fixed`**, which is what makes one bug read as
  several unrelated ones. Measured in a real browser at 375px against the built
  stylesheet, because **jsdom reports every width as 0**: the row wanted 368px inside
  a 339px box, and "Add to calendar" alone is 150px. ⚠️ **PRE-EXISTING — the same
  probe with the pre-sweep classes is 25px over, against 29px after.** `973df0f`
  made it visible, not real. Fixed with `flex-wrap` + `min-w-0`, already the house
  pattern in `AdminDashboard.jsx` and `Register.jsx`; re-probed at 0px overflow.
  Roster got the same treatment — "Roster & members" is the longest title in the app.
  ⚠️ **The anchor is a SOURCE check and says so**: `tests/page-header-wrap.test.js`
  pins the class on every page header and proves its own selector is not blind, but
  it catches the guard being removed, not a new way of overflowing. A real check
  needs Playwright in `harness/` and does not exist yet.
  ⚠️ **This is what the missing browser pass costs**: the sweep shipped green, and
  the first person to open it on a phone found a layout bug within the hour.
- `8071428` — **The sweep's live verification proved the previous commit.**

- **10 Aug — ❌ CORRECTION: the routing sweep's "verified on production" claim was
  worthless.** The sign-in screen was measured on the deploy preview and on
  production, everything came back as designed, and it was reported as live
  verification of the sweep. ⚠️ **`src/screens/Login.jsx` was ALREADY routed before
  the sweep** — one of three files that already imported `Button` — so that screen is
  byte-identical before and after `973df0f`, and the measurement was evidence for
  `87c7566`, the commit before it. **Jay caught it in one look**: "I don't see
  different buttons or really anything different at all." He was right, and on the
  signed-out path he always would have been — it contains nothing the sweep touched.
  ⚠️ **Rule 6 says a measurement that merely confirms your own change was applied is
  not a verification; this did not even do that.** The generalisable lesson:
  **before citing a live measurement, check the thing measured is in the diff.**
  ⚠️ Also recorded while correcting this: **the sweep and bloom are `hover:` effects
  and never fire on a touch device**, so on a phone the whole Touchline change is the
  taller tap target, the 8px corner and the bottom edge — nothing moves.
- `973df0f` — **Route the app's buttons through `<Button>`, and what fell out.**

- **10 Aug — the routing sweep: the app's action buttons now go through `<Button>`.**
  The work the corrected audit below was meant to justify, done. Every action button
  in `src/` — anything carrying a fill or a hairline border — is routed; the rest stay
  raw ON PURPOSE and `src/components/Button.jsx` now lists each category and why
  (layout boxes, masthead chrome, toggles and tabs, text links, pills and icons).
  Three `<Link>`s carrying an identical hand-rolled button string went through
  `as={Link}`. ⚠️ **Two new variants, `danger` and `dangerQuiet`** — not invented,
  they are the destructive cluster already written by hand across five files, and
  they deliberately get no sweep and no bloom. Reasoning:
  `claude/decisions/2026-08-10-button-routing.md`.
  ⚠️ **Three defects fell out of it that no test could see:** Schedule's day-sheet
  "Add event" carried `hover:bg-brand-dark`, a token that does NOT exist in
  `tailwind.config.js` and the only use of that name anywhere in `src` — Tailwind
  emitted nothing, so that button alone had no hover state at all; Dashboard's
  `BUTTON_BASE`/`BUTTON_GHOST` were both dead, with `BUTTON_GHOST` referenced nowhere
  in `src` or `tests`; and `EventDetail`/`PlayerDetail`'s `FOOTER_BUTTON` would have
  left `rounded-[11px]` racing `rounded-btn` on equal specificity, because `className`
  is appended last and the winner would have been whichever Tailwind happened to emit
  second. ⚠️ **`tests/button-sweep.test.js`'s radius test was REPOINTED, NOT DELETED**
  (`CLAUDE.md` rule 7): its stated exit condition — "delete this when 11px has gone" —
  could never fire, because 11px is the SURFACE radius and stays. The anchor that
  actually guards this work now reads the source for a raw button carrying the action
  signature, with a companion test proving it is not vacuous. Both proven by injected
  fault, as were the two new variant assertions.
- `8a83ba6` — **Correct the button counts published in `87c7566`.**

- **10 Aug — ❌ CORRECTION: the button counts published hours earlier were wrong.**
  The 10 Aug button entry below, PR #16 and commit `87c7566` all say "105 raw
  buttons carrying the same padding + radius + weight signature" and lean on
  `rounded-[11px]` appearing 117 times as evidence of drifting button radii.
  ⚠️ **The grep behind those figures counted every element with that radius plus
  padding and called them all buttons.** Measured properly: **100 `<button>`
  elements, of which only 20 use `rounded-[11px]`**, while **98 of the 117
  occurrences are not buttons at all** — 38 are `<p>` alerts, the rest inputs,
  panels and cards. So `rounded-[11px]` is the app's general SURFACE radius, used
  correctly, and not the drift it was presented as. **The consolidation argument
  survives on its own numbers (100 vs 11 uses of `Button.jsx`); the radius half of
  the reasoning does not.** Caught while starting the routing work the wrong
  figures were meant to justify — the first file opened was full of `<p>` alerts
  carrying the radius, not buttons. Exactly the rotted-measurement failure this
  repo's own §How to read notes as the only kind of wrong claim it has ever made.
- `87c7566` — **The Touchline button, and the audit that explains the two radii.**

- **10 Aug — the buttons got a look, and an audit explaining why they had none.**
  Jay asked for an audit and a different look; the audit found the reason the look
  was hard to change. ⚠️ **`src/components/Button.jsx` exists and is used 12 times,
  against 105 raw buttons still carrying hand-written class strings.** Its own
  header says it was built to replace "76 hand-written class strings across 26
  files" — that consolidation was started and never finished, and there are now
  more hand-rolled buttons than when it was written. ⚠️ **The `rounded-btn` token
  is used TWICE while its identical literal `rounded-[11px]` appears 117 times**,
  across 16 distinct radii. So restyling meant editing 34 files, and the next
  person would add button 106 with its own string. The look chosen ("Touchline",
  from four directions, then "Sweep" from three motion studies) therefore lands in
  the COMPONENT and the token only: 8px radius, a weighted 3px bottom edge so a
  button reads as a key with a top and a bottom, a taller tap target (py-2.5 →
  py-3, for a wet thumb on a pitch), and on hover a band of light crossing the fill
  over a bloom of brand red. ⚠️ **Primary actions only** — applied to all 105 it
  reads cheap and stops meaning anything, and a glowing "Cancel" pulls the eye
  toward the destructive-adjacent choice; secondary gets a third-strength bloom and
  no sweep. ⚠️ **The two radii now sit side by side on purpose** — 8px on the twelve
  buttons that go through the component, 11px on the other 105 — as the visible
  receipt for work that is not finished. ⚠️ **Tested against the BUILT stylesheet**,
  like the press-feedback rule, and that caught two things the source would not:
  the minifier collapses `::after` to `:after` AND rewrites `translateX(…)` to
  `translate(…)`, so assertions on the authored spelling would have passed in dev
  and failed only in production. `isolation: isolate` is pinned too — the sweep
  sits at `z-index: -1` to pass under the label, and without its own stacking
  context it vanishes behind the button entirely, which debugs as a timing problem.
  ⚠️ The stale "THERE IS NO SHARED BUTTON COMPONENT" comment in `src/index.css` is
  repointed rather than deleted, per rule 7.
- `195bf6f` — **The register: a coach can record who turned up.**

- **10 Aug — the register: a coach can now record who turned up.**
  `src/screens/Register.jsx`, opened from the event detail sheet, ⚠️ **only for
  an event that has already STARTED** — a register for a session that has not
  happened is a guess, and offering it early is how a squad gets marked present
  on Tuesday for a Saturday match. ⚠️ **NOT the availability sheet with
  different words.** There is no per-row `editable`: attendance is coach-only,
  full stop, because a parent marking their own child present destroys the only
  thing the number is worth. ⚠️ **"Not recorded" is never a stored row** — it is
  derived by diffing the squad against the rows that exist, because defaulting
  to `absent` would manufacture an absence for every session a coach forgot to
  take, and those would feed the percentage. **"Mark remaining N present"** is
  the affordance that makes it usable on a touchline (the common case is that
  nearly everyone came) and it touches only players with NO record yet, so a
  coach who logs two absences first can sweep the rest without undoing their own
  work; sequential rather than `Promise.all`, so a failure halfway leaves the
  earlier writes saved and says so. ⚠️ **No realtime subscription**, unlike the
  RSVP sheet: a register is taken once by one person, and a list re-sorting
  under a coach's thumb mid-tap would be worse than stale. ⚠️ **Not behind
  `FEATURES.availability`** — the 10 Aug ruling was to ship attendance INSTEAD
  of switching RSVP on, and wiring it to that flag would switch both together.
  Proved by injecting `canEdit = true`: the two parent tests fail.
- `714d477` — **`attendance`: the table, the policies and the data layer.**
- **10 Aug — `attendance`: who actually turned up.** Nothing in the database
  recorded it. ⚠️ **`availability.status` is `in`/`out`/`maybe` — INTENT, not
  attendance** — and it was the only thing resembling the data the brainstormed
  AI features assume ("17% attendance", "consecutive absences", "lowest
  attendance"). Built on it, those would report WHO SAID THEY WOULD COME as WHO
  CAME: a confident number about a child's commitment, derived from a tickbox
  their parent ticked a week earlier. ⚠️ **And RSVP is switched off**
  (`FEATURES.availability`), so that table holds no real intent anyway — hence
  Jay's ruling to skip RSVP and go straight to attendance, because ticking who
  turned up is something coaches already do on paper. ⚠️ **A NEW TABLE, NOT A
  COLUMN ON `availability`**, despite the identical (event, player) grain: the
  two facts have different WRITE AUTHORITIES — availability is `is_own_player`,
  attendance is `can_edit_team` — and one row with two write authorities on
  different columns is a column-grant problem, which this same session spent an
  afternoon proving invisible. Kept at ROW level, where `policies.sql` can show
  you. ⚠️ **The read policy is deliberately narrower than the house style**:
  every other team-scoped table uses `can_see_team`, so a parent sees the squad;
  here staff see the squad and **a parent sees only their own child**, because
  "which children miss training, and how often" is safeguarding-adjacent and
  becomes touchline gossip. ⚠️ **`is_own_player` is in the read policy and in no
  write policy** — a parent must never mark their own child present, since the
  whole value of the number is that somebody else recorded it. `status` has
  three values and the third is load-bearing: the percentage is
  present/(present+absent) with `excused` excluded from both sides, so a player
  away injured is not ranked as uncommitted. Applied to live and verified
  (4 policies, RLS on, 4 indexes, 6 constraints); `db/schema/` re-captured in
  the same breath, including `grants.sql` — where **the new table proved §1**,
  arriving with all eight privileges for `anon` from no GRANT statement at all,
  with `enable row level security` the only thing between it and the internet.
  Harness in `db/tests/attendance.sql`; data layer carries the row cap.
- `631dcd9` — **The dashboard's availability button was drawn, tappable and dead.**
- **10 Aug — the dashboard's availability button was dead, and the feature is
  flag-off.** Jay asked where the availability function was. ⚠️ **Answer:
  `FEATURES.availability` is FALSE** (`src/lib/features.js`, set 29 Jul because the
  club was not ready to rely on digital RSVP) and **that was written down nowhere**
  outside the flag's own comment — so the screen, table, policies and tests are all
  intact and simply hidden. Now recorded in `claude/state-of-play.md`.
  ⚠️ **The flag was also concealing a real defect.** `EventDetail` rendered "Set my
  availability" from Schedule AND the Dashboard, but only Schedule passed
  `onOpenAvailability`, and the call site was `onOpenAvailability?.(event)` — so on
  the home screen the button drew itself, invited a tap, and the optional call
  swallowed it. A drawn, tappable, dead button, on the most common path in the app:
  parent opens the app, taps the next fixture, taps availability. **No test could
  have caught it** — every availability test drove Schedule. Fixed both ways: the
  Dashboard now passes the handler and renders the sheet, and the button renders
  ONLY when a handler exists, so a forgetful caller gets no button instead of a
  lying one. ⚠️ Also fixed a stale-state bug the wiring introduced —
  `availabilityOpen` is screen-level, not per-event, so without resetting it the
  NEXT fixture tapped would skip its detail sheet and open straight into that
  event's RSVP. `tests/dashboard-availability.test.jsx` mocks the flag ON and pins
  both; it is a separate file because `tests/dashboard.test.jsx` deliberately runs
  with the real flag, off.
- `e83fdbc` — **Jay's roster ruling, and two measurements from the dashboard.**

- **10 Aug — the roster-import blocker was closed by Jay, and it was never a
  blocker.** `state-of-play.md` carried "NOBODY HAS RECORDED WHERE THE REAL ROSTER
  LIVES … a rollout is blocked on that. Ask Jay" and duly had every session ask
  him. The question had a false premise: **parents will self-onboard, and the
  imported roster most likely never goes back in.** ⚠️ **The ruling matters less
  than what it promotes.** Several things were filed as harmless *because* a bulk
  import was assumed to be the real path, and are now on the critical path —
  chiefly that `register_my_player` reads `teams.is_senior` and, with no senior
  squad, makes every self-registration a PARENT ("dormant, not broken" until it
  became the primary onboarding route), and that Resend's free cap now sits
  directly on the rollout while hitting it does not look like a limit.
  `src/screens/PlayerImport.jsx` is explicitly NOT retired by this — "most likely"
  is not "never", and it must not be deleted as dead code.
  `claude/decisions/2026-08-10-no-roster-import.md`.
- **10 Aug — two things measured in the Supabase dashboard, one of them a trap.**
  (1) ✅ **`db-max-rows` is 1000**, so `MAX_ROWS` 900 sits under it and the
  truncation detector added earlier today can actually fire — the assumption the
  whole guard rested on, now measured rather than assumed. ⚠️ **The setting has
  moved**: not Settings → API but **Integrations → Data API → Settings**.
  (2) ⚠️ **THE DASHBOARD OFFERS TO UNDO THE `profiles` COLUMN GRANTS IN ONE CLICK,
  AND FRAMES IT AS FIXING AN INCONSISTENCY.** Under Exposed tables, twelve of the
  thirteen `public` tables show a green tick; `profiles` is amber, with the tooltip
  *"This table has custom grants. Select it to override with standard Data API
  grants…"*. The "problem" it offers to fix is the protection standing between a
  club admin and rewriting any member's login email. One click, no confirmation
  naming what is lost, no test failure, no visible change in the app — the app
  never attempts that write, so the extra privilege would stay invisible until
  somebody used it. Recorded in `db/schema/grants.sql` §4 and in
  `claude/state-of-play.md`: **the amber row is correct and must stay amber.**
- `4b86646` — **The unbounded list reads cap, and say so.** ⚠️ **This started as
  the scale item and found a correction first.** `state-of-play.md` said the
  unpaginated queries "will show as a slow screen long before anything errors".
  That is wrong, and wrong in the dangerous direction: what waits at the end of
  an unbounded `select('*')` is a SHORT ANSWER THAT LOOKS COMPLETE, because
  PostgREST applies a `db-max-rows` ceiling and returns the first N rows with
  HTTP 200 and no indication anything was left out — a roster missing a child,
  with no error anywhere. The same silence as the zero-row 200 that produced the
  session guard, and the empty search read as proof of absence, twice.
  `src/data/limits.js` gives `listEvents` and `listPlayers` a cap and makes them
  THROW rather than return a truncated list. ⚠️ **The +1 is the load-bearing
  part**: the request asks for one row MORE than the cap, because a plain
  `.limit(900)` cannot tell "exactly 900" from "more than 900". ⚠️ **And the cap
  must stay below `db-max-rows`** or PostgREST trims the sentinel first and the
  detector reads green precisely when it should fire — which is why `MAX_ROWS`
  is 900 against a documented default of 1000. ⚠️ **`db-max-rows` has NOT been
  measured on this project** — it is a PostgREST setting no query here can read;
  it is in the dashboard under Settings → API → Max rows. Measured instead:
  `authenticated` carries `statement_timeout=8s`. **Nothing got faster, and
  pagination and a date window on events are deliberately NOT done** — both
  change what a person sees, and "how far back should the schedule go" is Jay's
  ruling, not a data-layer detail. `listEvents` has accepted `from`/`to` since it
  was written and no caller passes one.
- `cb8d6da` — **A stat that moves, and a fortnight that admits it is empty.**
- **10 Aug — the stat band's weakest number, and the fortnight strip's empty
  cells.** Both were on the "open, not blocking" list. (1) ⚠️ **The stat band's
  third cell was "Age groups"** — `scopedTeams.length`, a count of how the club
  is CONFIGURED, which changes when somebody adds a squad and therefore
  approximately never — rendered at 42px inside the loudest element the
  dashboard has. It is now matches that have been played and carry no score:
  the same backlog Schedule's Upcoming tab already keeps visible under Task
  11's ruling, counted. It moves, it is somebody's job, and it appears nowhere
  else on the screen. ⚠️ **The band's styling is deliberately untouched** — the
  complaint was that the loudest element carried the weakest data, and the
  honest fix for that is better data, not quietening the club website's
  strongest signature. Zero is a real answer on it. (2) **The fortnight strip
  drew fourteen bordered, dotless cells** when nothing fell in the next two
  weeks — ~90px of furniture above the fold on a phone, which also read as
  though it were still loading, because "cells with no dots" and "cells whose
  dots have not arrived" look identical. It now says "Nothing on in the next
  two weeks". ⚠️ **A sentence, not `<Empty>`**: the shared empty state is a
  42px icon with `py-11`, which would have made the nothing-on case taller than
  the something-on case and given back none of the space. ⚠️ **Three of the
  strip's own tests were pinning the defect**, asserting fourteen cells for an
  empty event list — the third time this repo has hit that shape in two days,
  after "Fixtures to play" and `loadMyMemberships`. They were repointed to keep
  asking their original questions rather than deleted. Also removed a dead
  `teamNames` local on the dashboard, computed and never rendered.
- `a882500` — **Table and column GRANTS are captured and checked.**
- **10 Aug — table and column GRANTS are captured and checked.** `db/schema/`
  captured tables, policies, functions and triggers and **no table or column
  grants at all**; `state-of-play.md` called it "the one real gap and nothing
  currently checks it", and `db/schema/README.md` had spelled out why it
  mattered — the larger half of `20260808 profile_phone_and_column_grants` is a
  column-level revoke on `profiles`, and nothing in that directory would diff
  it. `db/schema/grants.sql` now captures table grants, column grants and the
  DEFAULT privileges. ⚠️ **Capturing them turned up three things nobody had
  written down.** (1) `profiles.email` is protected by a COLUMN GRANT, not a
  policy: RLS authorises the row and `profile update club admin` authorises an
  admin against every member row in the club, so the five-column ceiling is the
  only thing making that not "may rewrite anyone's login email" — and
  `policies.sql` cannot tell you so. (2) Supabase's default privileges give
  `anon` full table rights on every new table in `public`, so a table created
  without RLS is open to anyone with the project URL, and the `create table`
  does not say so. (3) The 8 Aug revoke was applied to `authenticated` only —
  `anon` still holds table-level UPDATE on `profiles` and is stopped by RLS
  alone; measured, no live hole, recorded rather than changed. Checked two ways:
  `scripts/docs-check.mjs` gained a seventh check that fails the build when a
  migration grants on a table the capture does not name, and `db/tests/grants.sql`
  asserts the invariant against live. ⚠️ **Neither sees live from CI** — the repo
  is public — so re-capturing with the migration is still the mechanism. The
  docs-check was proved by injecting an uncaptured table grant (caught) and a
  function grant (correctly ignored); the live assertions were proved
  non-vacuous read-only, by asking the same probe about a column that IS granted
  and watching it raise.
- `77e1f9a` — **The CI-skip token banned, and the deploy skip became a gate.**
  `CLAUDE.md` rule 3 asked for `[skip ci]` on docs-only commits so a
  documentation edit would not publish a release. Protecting `main` the same day
  turned that into a trap: ⚠️ **GitHub Actions honours `[skip ci]` too** — on
  `push` AND `pull_request`, matching the HEAD commit — so it suppressed the
  now-REQUIRED `test` and `docs-check` runs, the checks sat pending forever, and
  the pull request could not be merged. ⚠️ **The header comment in
  `.github/workflows/docs.yml` asserted the opposite in so many words** ("it
  suppresses the NETLIFY build, not this workflow"), and nothing in the run
  history could have caught it: every `[skip ci]` commit in this repo predates
  the workflows, which were created that morning. The commit message was
  answering two questions at once; they now have separate answers. The checks
  always run, and `scripts/netlify-ignore.mjs` — wired as `ignore` in
  `netlify.toml` — decides the deploy from the DIFF. Same move as the clone
  check: a rule that has to be remembered at exactly the right moment becomes a
  gate that cannot be forgotten. ⚠️ **Netlify inverts the exit code** (0 CANCELS
  the build) and a cancelled build reports as a SUCCESS, so being backwards here
  would stop deploying the app from behind a green deploy list. Hence: the
  allowlist is deliberately narrower than "everything that cannot reach `dist`",
  `netlify.toml` is explicitly excluded from it, every uncertain case builds, and
  the inversion is pinned end-to-end against a throwaway git repo rather than
  this one's history — which would also have broken under CI's depth-1 checkout.
  ⚠️ **AND IT TURNED UP A WINDOWS-ONLY TRAP WORTH MORE THAN THE CHANGE.** The new
  script carried a `#!/usr/bin/env node` shebang and is IMPORTED by its test.
  Git checks out CRLF on both PCs; esbuild strips the shebang up to the newline
  and leaves the `\r`, which is not a valid token — so the file failed to parse
  and the error was reported against the IMPORT LINE IN THE TEST, several files
  from the cause, on a line that is blank. ⚠️ **CI cannot see it**: Actions runs
  on Linux and checks out LF, so `test` stays green while the suite fails on
  both of Jay's PCs — the mirror image of the usual trap, which means a green
  pull request is no evidence here. `.gitattributes` now pins `*.mjs`, `*.sql`
  and `*.sh` to LF, removing the class rather than the instance.
- `87bafba` — **The clone check became a gate rather than a rule.**
- **10 Aug — `claude/state-of-play.md` rewritten, 591 lines to 283, and a session
  handoff written.** ⚠️ **Its own audit had already found the pattern and this
  edition is organised around it: every wrong claim in that file's history was a
  rotted MEASUREMENT, never a wrong ruling.** So the rulings and traps are kept in
  full and separated out as the durable half; the dated status is short; and no
  number a query can produce is quoted anywhere — the queries are given instead.
  What went: the layered history of its own corrections, and the shipped-on-date
  sections that duplicate this changelog and `claude/handoffs/`.
  ⚠️ **AND THE REWRITE CAUGHT A CLAIM THAT HAD GONE FALSE.** The file rested
  "nothing sends email of its own accord" on `pg_net` not being installed. It IS
  installed (0.20.4, measured), and `private.notify_pending_membership` calls
  `net.http_post` on every pending membership insert — that is how approval emails
  fire, and has been since 9 Aug. True when written, carried past the change that
  falsified it.
- **10 Aug — the clone check became a gate.** `scripts/session-guard.mjs` plus a
  SessionStart hook in `.claude/settings.json`: it says so, loudly, when the
  clone is SHALLOW or BEHIND `origin/main`. ⚠️ **The reasoning matters more than
  the script.** `CLAUDE.md` reading-order step 2 is the most useful rule in this
  repo and it keeps being skipped — not defied, skipped, because a rule in prose
  has to be remembered at exactly the right moment. Four incidents in four days,
  every one with a written warning already against it. Compare with what stopped
  the moment `main` was protected: pushing to the wrong branch, force-pushing
  over work, merging without tests. Those became structural. ⚠️ **It never
  blocks** — a SessionStart hook that refuses to start is one flaky network call
  from making the repo unusable, and it is silent when the clone is fine, so it
  does not become another thing people stop reading.
- `b96a729` — **The club name stopped truncating, and the hero stopped repeating
  itself.**
- **10 Aug — the club's name stopped truncating, and the hero stopped
  repeating itself.** Two instances of one thing: the design was built at a
  size the club has outgrown.
  (1) ⚠️ **The masthead rendered "ABU…"** at the `desktop` breakpoint (820px,
  where the top nav replaces the bottom tab bar) — on every screen, for every
  role. The 8 Aug note in `tests/app-shell.test.jsx` recorded truncation at
  ~1114px and fixed the ACCOUNT NAME's breakpoint; the club name itself was
  left to truncate and was far worse. It is STRUCTURAL: every other item in
  that row is `shrink-0`, so the wordmark is the only thing that can give and
  it gives everything — at 840px the row needs ~690px before the wordmark
  starts, leaving ~150px for something wanting 257. No width setting fixes
  that. The name is now painted only at `wide`, with "Quins Club Hub" carrying
  the identity below it. ⚠️ `sr-only`, not `hidden`, so the page keeps exactly
  one h1 at every width. ⚠️ Shortening it to "Harlequins" or "ADH Quins" was
  rejected — both invent a wordmark the club does not use.
  (2) **The dashboard hero said the same word twice**, the same defect fixed in
  the fixture row: eyebrow "NEXT TRAINING · U16B CONTACT" over a 42px
  "TRAINING". The squad now moves up into the headline when the title only
  echoes the type, and out of the eyebrow — so the headline always carries the
  most specific fact available. ⚠️ **NO TEST COVERED THE BROKEN CASE**, which
  is why it shipped: every training fixture in `tests/dashboard.test.jsx` is
  NAMED ("U10 skills session"), while every session in the real database is
  titled "Training".
- `fe2fe20` — **Quieter fixture rows, an honest fixture count, and a squad select.**
- **10 Aug — the squad filter became a select. It was a pill row.**
  design-system.md §4.8 specifies a `.pill-row` here and it was right when it
  was written — against four age groups. At 18 it wrapped to FOUR lines on a
  laptop, putting ~150px of filter chrome above the first fixture on Schedule:
  sub-tabs, four lines of squad pills, then the event-type row. The controls
  took more of the screen than the thing being controlled. ⚠️ **And most of
  them led nowhere** — two squads had events, thirteen pills opened an empty
  list; on Roster the row said so out loud, "U6 Tag · 0" four lines deep.
  A select is one line at any club size, which is what matters for a club
  heading to 600-700 players. ⚠️ **The cost, recorded so nobody re-litigates it
  blind:** one tap to switch squad becomes tap-choose-dismiss. Judged worth it
  because fifteen pills over three lines is not a control anyone reads. Jay's
  call. ⚠️ The per-squad COUNTS survived into the option labels — they are why
  the Roster row was tolerable at all. ⚠️ `PillButton` stays: Schedule's
  sub-tabs and event-type row are still pill rows and correctly so, at four
  options each. `TeamPills.jsx` renamed to `src/components/TeamFilter.jsx`.
- **10 Aug — the three senior squads removed from the live database.**
  Senior Men 1st XV, Senior Men 2nd XV and Women's XV, all with zero players,
  events, memberships, invites and invite targets — verified before the delete,
  so nothing cascaded. 15 age groups now, all youth. ⚠️ **CONSEQUENCE:**
  `register_my_player` picks 'player' or 'parent' from `teams.is_senior`, so
  with no senior squad every self-registration now creates a parent. Dormant,
  not broken — it returns with the first senior side. Restore SQL is in the
  commit that removed them.
- **10 Aug — the fixture row stopped saying the same word twice, and a known
  pitch now reads louder than a TBD one.** A training titled "Training" rendered
  a green "Training" chip with a bold "Training" heading directly beneath it —
  the row's two heaviest treatments carrying one fact. `titleRepeatsType` in
  `src/lib/eventFormat.js` drops the echo, so the bold line in a list belongs
  only to matches and to sessions somebody named ("Extra session before
  Saracens" keeps its title). Venue and pitch are now separate elements so a
  known pitch can sit a step darker. ⚠️ **`Pitch TBD` still renders** — Jay's
  ruling: without it nobody can tell "no pitch allocated yet" from "the app
  didn't say", and the calendar feed already argues the same for LOCATION.
  ⚠️ The KNOWN pitch is darkened rather than the TBD lightened: `ink-faint` is
  already the lightest AA-safe token on that surface.
  ⚠️ **A LARGER RESTRUCTURE WAS PROPOSED AND REJECTED ON EVIDENCE.** Grouping
  the schedule by month with hoisted constants was designed and agreed — then
  a realistic September was seeded and the existing list read fine, because
  matches, socials and a second squad break up the trainings on their own. The
  "wall of identical rows" was an artefact of a database holding one squad and
  one repeating series. Judge list density against real data, not seed data.
- **10 Aug — a realistic September seeded into the live database.** Sixteen
  events for U16B and U16G: four matches across three venues, a named extra
  session, a barbecue, and one back-dated result so Results and the dashboard's
  Last result card are not empty. All carry
  `group_id = 5eed0000-0000-4000-8000-000000000001`, so
  `delete from events where group_id = '5eed0000-0000-4000-8000-000000000001'`
  removes every one and touches nothing else. Inserts only — no existing row
  was modified.
- `38b82a9` — **The club-wide contact list is no longer kept on people's devices.**
  Jay's call: keep the offline copy where it earns its place and drop it where
  it does not. `addf3c4` purges the cache when the signed-in person changes,
  which closes the one-device-two-people hole — but it cannot help with a phone
  left unlocked or a laptop stolen, and for that the answer is not to store the
  sensitive things at all. KEPT: fixtures, training times, age-group names,
  squad lists, availability, a player's own contact and parent rows, and the
  caller's OWN membership and profile rows. DROPPED: the three club-wide admin
  reads — `listClubMembers` (every family's name, email and phone),
  `listPendingProfiles`, `listAccessRequests`.
  ⚠️ **The FILTER is the discriminator, not the table.** `memberships` and
  `profiles` are each read two ways, once scoped to the caller and once
  club-wide; excluding by path alone would leave the app unable to render
  anything offline, because every screen reads the caller's own memberships to
  know what they may see.
  ⚠️ **And the match is anchored on `?` or `&`** — a bare
  `search.includes('id=eq.')` is also satisfied by `club_id=eq.`, so a future
  club-wide read filtered on some other id column would be silently re-admitted
  by a check that reads as correct. `tests/pwa-cache-rules.test.js` pins that
  case. ⚠️ Devices stop holding the list only once each has loaded this build.
- `37970b9` — **`db/schema/` reconciled against live: ZERO DRIFT.** Not a
  re-capture; nothing had changed, so nothing was rewritten. 35 policies, 29
  function bodies, 29 functions' security settings, 4 triggers, 25 constraints,
  27 indexes, the RLS state of all 13 tables and the `player-photos` bucket
  settings all matched. ⚠️ **`public.accept_invite` still carries its
  incomplete-invite guard** — the regression this directory exists to catch has
  not recurred. Both objects the 7 Aug capture missed (`events_group_id_idx`,
  `invites_role_check`) are correctly recorded. Supabase's security linter was
  run alongside and produced nothing this repo had not already written down.
  ⚠️ **Column and table GRANTs remain uncovered** — a clean reconciliation here
  is not evidence about them. Recorded in `db/schema/README.md`.
- `addf3c4` — **The offline REST cache is now scoped to one person, and a token
  refresh no longer unmounts the routed screen.** Four fixes from a
  full-codebase review, plus `.github/workflows/test.yml`: `main` deploys on
  push and the unit suite had never run anywhere but a laptop, so Netlify's
  `npm run build` caught a compile error and **nothing caught a failing test**.
  ⚠️ The cache leak was confirmed by inspection on the deploy preview before the
  fix went in, not only by reading the code — `listClubMembers()` is unfiltered,
  so its url carries no user identifier and was shared by every caller,
  admin and coach alike. ⚠️ Deploying does not purge what is already on club
  devices; the owner check on load does that, once per device.

## 9 Aug 2026

- **9 Aug — the offline REST cache was not per-person, and a token refresh was
  unmounting the screen.** Four fixes from a full-codebase review, none of them
  visible on screen.
  (1) ⚠️ `vite.config.js` caches `GET /rest/v1/*` in Cache Storage, which is
  keyed by URL and scoped to the ORIGIN rather than to the person — and
  `listClubMembers()` produces a byte-identical url for an admin on
  /admin/accounts and a coach on /approvals. So an admin's club-wide member list
  (every name, email and phone) sat on a shared club laptop after sign-out, and
  NetworkFirst would hand it to the next person to open that screen with no
  signal. `src/lib/apiCache.js` purges it on every sign-out path and on any
  change of owner. ⚠️ **Deploying this does not purge what is already on club
  devices** — the owner check on load is what does that, once each device has
  run this build.
  (2) `MembershipProvider` keyed its effect on the `session` OBJECT, which
  supabase-js rebuilds on every token refresh — roughly hourly while the app is
  open — so the load re-ran, `loading` went true, `AppShell`'s `ready` gate went
  false, and the routed screen UNMOUNTED under whoever was using it, taking an
  open EventForm sheet and everything typed into it. Keyed on the uid now.
  (3) `NamePrompt` never primed `useMyProfile`'s cache, so a first sign-in
  answered the name gate and then read as nameless — or as the Google name it
  had just been told was wrong — for the rest of the session.
  (4) The membership-load error state had no sign-out. It was the one branch of
  `AppShell` not honouring "someone who cannot get in must always be able to get
  out".
- **9 Aug — the unit suite now runs in CI.** `.github/workflows/test.yml`.
  ⚠️ `main` deploys on push and the only workflow was `docs.yml`, so nothing ran
  vitest before a release: Netlify's `npm run build` caught a compile error and
  **nothing at all caught a failing test**. Two things the workflow has to do
  that are not obvious from reading `package.json` — supply placeholder
  `VITE_SUPABASE_*` vars, because `src/lib/supabase.js` throws at IMPORT time
  and ten files otherwise fail to COLLECT rather than to assert; and run
  `npm run build` first, because `tests/press-feedback.test.js` inspects the
  built stylesheet in `dist/`.
- `f42cc23` — **The handoff stopped naming a tip SHA, and gained the scale work.**
- `d9dc63f` — **Four indexes and an `availability` policy merge, for 700 players not 6.**
  ⚠️ LIVE DATABASE CHANGE. See the entry above this list's date heading in
  `claude/schema-history.md` for the reasoning; the equivalence proof is
  `db/tests/rls-availability-equivalence.sql`.
- `5332eff` — **Cold-start tested the handoff, and fixed what it could not answer.**
  A fresh agent given only the handoff rated it 6/10. ⚠️ **The branch trap:** this clone
  sat on a local branch named `feat/password-auth` at `main`'s tip, and
  `git rev-list --left-right --count` returned `0 0` because it compares SHAs, not branch
  names. Also a dead pointer telling document-reading sessions to read a commit message,
  and two contradictions introduced by that morning's own corrections.
- **9 Aug, LIVE DATABASE CHANGE — `scale_indexes_and_availability_policy_merge`.**
  Jay: the club is heading for **600-700 players, possibly double in parent
  accounts**. Four indexes (`availability(player_id)`, `memberships(team_id)`,
  `memberships(player_id)`, `players(team_id)`) and the four `availability`
  policies merged into one per command. ⚠️ `availability(player_id)` was the one
  real defect of 135 advisor lints — ~70,000 rows at full size, and the existing
  unique index on `(event_id, player_id)` **does not cover it**. ⚠️ The merge was
  proved equivalent across seven caller types by
  `db/tests/rls-availability-equivalence.sql`, fault-injected both ways. ⚠️ And
  it surfaced a latent gap left deliberately unfixed: **`can_edit_team` does not
  check `status`**, so a pending coach would pass every policy built on it.
- `f561736` — **The handoff was describing a world two commits old.** It listed
  `db/schema/` as stale and the `Greeting.jsx` magic-link comment as open after `6df8ee5`
  had closed both. ⚠️ Also recorded that **a shallow clone (`--depth`) implies
  `--single-branch`** — a session using one saw only `origin/main` and reported
  `build/v1-mvp` deleted. It was not.
- `6df8ee5` — **`db/schema/` re-captured against live, and nine claims in `RESTORE.md`
  corrected.** ⚠️ The 7 Aug capture's "Nothing unintended was found" was **wrong**: two
  objects live since 5 Aug had no line in the files, and `invites_role_check` asserted four
  roles when the database has had six. Plus five `proacl` lines that did not match, three
  attributable to no migration — and **Postgres keeps no timestamp for a GRANT**, so that
  cannot be settled from the catalogue. ⚠️ **`db/schema/` captures no table or column
  grants**, and **`apply_migration` strips `--` comments before executing**. In `RESTORE.md`:
  "an admin sees all 15 teams" (wrong policy, wrong count), "zero memberships reads zero
  rows including `teams`" (false since 8 Aug), and "CHANGE ONE, CHANGE BOTH" on
  `can_see_team` — **that mirror is broken deliberately** and the old line invited a "fix".
- `c1a223c` — **The 9 Aug handoff, and three decision records that were never committed.**
  ⚠️ All three of that day's decision records existed only in the Claude project — the same
  failure this repo records against 4-7 Aug, caught by `docs:check` flagging a broken path
  reference rather than by anyone noticing. ⚠️ One of them carried a live secret in plain
  text; **this repo is public**, so the committed copy names the secret and not its value.
  Also backfilled `52023db` from 8 Aug, which the coverage check caught as missing.
- `ebe3b6f` — **Schedule: a Matches/Training/Socials filter on Upcoming**, seen by
  everyone, and the head renamed to "Schedule". An unrecognised stored filter shows
  EVERYTHING, never an empty list; each filter carries its own empty message, because one
  shared "No upcoming fixtures yet" tells a parent who tapped Socials that the club has
  nothing on.
- `bd41b13` — **The Quick actions heading had no gap above it on mobile.** `BlockTitle`'s
  `first:mt-0` is right for the desktop two-column layout and wrong the moment the columns
  stack. MEASURED with Playwright (0px → 18px at 390px) — **no test in this repo can see
  this bug**, jsdom has no layout.
- `08fe678` — **"My memberships" meant "every membership I can read".** `loadMyMemberships`
  never filtered by profile id, so RLS decided the answer — and for an admin RLS returns
  the whole club. Jay saw two test players under "Your players". It would have hit coaches
  and managers the same way.
- `e03332b` — **The parent phone was lost on save, and the You card now needs an Edit
  tap.** `player_parents` stores one E.164 string; the editor holds two fields. PlayerForm
  converted both ways inline, MyPlayerForm did neither. One implementation now, in
  `src/lib/parentRows.js`. ⚠️ The commit that fixed it also **overstated it** — fault
  injection proved an untouched save kept the number. Comments corrected.
- `67cb5a5` — **A plain-text alternative on every email, honest copy, and a corrected DNS
  diagnosis.** ❌ A session told Jay his SPF/DKIM/DMARC were missing, from a lookup at
  `send.adhquins-clubhub.com`. **Resend puts the bounce domain one level BELOW the sending
  domain** — they are at `send.send.…` and were all Verified. He was one step from editing
  DNS that did not need editing.
- `fe5a308` — **Auth links now land on the club's own domain.** `/auth/confirm` redeems
  the `token_hash` with `verifyOtp`, so no email points at `lusmshimxdcxpnrktlgz.supabase.co`
  any more. Sender domain ≠ link domain is a phishing signature and was the one concrete
  spam cause found. `safeNext` refuses other origins, lookalike hosts, `//host` and `/\host`.
- `f7755a9` — **An Edit person sheet** — name, phone, role and squads in one place, email
  deliberately not editable. ⚠️ The first version **shipped a crash**: `displayName` was
  declared inside a `.map` callback and the moved rows left that closure, blanking the
  whole screen.
- `0b30ebc` — **Squad-scoped approvals, approval emails, the weekday in the schedule, and
  in-place player edit.** Approval is an RPC, NOT a widened policy: `memb manage` is
  `FOR ALL`, so a coach clause would also have granted role changes — including to admin —
  reassignment and deletion. The migration aborts if that policy is ever not admin-only.
- `0c4dd7b` — **Gender is required on the single-gender squads**, and a mismatch warns
  loudly without ever blocking. ⚠️ The suffix must TOUCH the digits — `U6 Tag` ends in a G.
- `e19e21b` — **The real 15 youth + 3 senior squads, and a SAFEGUARDING fix.**
  `/^u(\d{1,2})\b/i` needs a word boundary after the digits and a letter is a word
  character, so `U12G QR` matched nothing, the band came back `null`, and `allowsOwnContact`
  read `null` as "a senior side: adults" — offering a 12-year-old girls' squad the child's
  own contact fields. Squads renamed IN PLACE so 6 players, 26 events and 1 membership
  survived.

## 8 Aug 2026

- `52023db` — **Masthead wrap on a real phone, and a parent can now edit their own name
  and phone.** ⚠️ **Missed from this file until 9 Aug** — the changelog check caught it.
  The wordmark broke across two lines because a flex line does not wrap, so the only way
  the span could give ground was to break its own text. A hypothesis about the tap target
  was recorded as WRONG rather than quietly dropped. ⚠️ And the hole found while building
  it: **RLS grants ROWS, NOT COLUMNS**, so "profile update own" let a person rewrite any
  column on their own profile — including the email an admin reads when approving a
  stranger. Column privileges are now an explicit allow-list.
- `7765ebe` — **Parents register their own player and wait for approval.** `team read`
  had to be widened or the age-group dropdown was permanently empty for exactly the
  person who needed it. Approval is ADMIN-only, not "coach or admin" as the spec assumed.
  1317 tests.
- `212022b` — **The pending membership state, `register_my_player`, and an RLS harness.**
  Measured the danger first: a brand-new parent could see the WHOLE squad. `can_see_team`
  now requires `status='active'`; a new `is_attached_to_team` gates fixtures only.
  `db/tests/rls-pending-membership.sql` is safe to re-run on production. `[skip ci]`
- `dc7d900` — **Event end time, additional info, and cancelling the rest of a series.**
  The calendar had been inventing an end time; it now uses the real one. The edge-function
  change was INERT until `calendar_events_for_token()`'s `RETURNS TABLE` was widened — the
  same failure that hid the pitch for a day. 1290 tests.
- `ae96828` — Corrected three rotted claims (the 200/hour email ceiling, the yahoo backup
  admin, the rollout-blocker framing) and recorded that password auth is live. `[skip ci]`
- `5917386` — Recorded the test-data wipe and the three things it taught us. `[skip ci]`
- **8 Aug, no commit — LIVE DATABASE CHANGE.** Test data wiped: 316 players, 315
  contacts, 17 events, 1 invite. Seeded 6 obviously-fake players on U16 as a fixture for
  the pending-state RLS work. `U15` renamed to `U16`, duplicate empty `U16` deleted
  (14 teams). Jay's 2 logins, 2 memberships and his calendar token kept. Three things
  learned and recorded in `state-of-play.md`: `invites`/`invite_targets` are
  `NO ACTION` and block a team delete; `storage.objects` refuses SQL deletion outright;
  and nothing in the app can delete a login.
- `e3fbc60` — **Copy fix, and password auth is now LIVE on `main`.** Two screens stopped
  asserting things the app cannot know: the Accounts header said "2 people" while five
  logins existed (it counts people WITH ACCESS, not accounts), and Login's post-signup
  panel claimed an email had been sent when a repeat signup sends nothing. Both traced to
  one incident. `1244` tests, fault-injected.
- `6198ea6` — Empty commit to trigger the first branch deploy. Netlify only builds on a
  push event, so enabling branch deploys does not retroactively build a branch that was
  already pushed — the preview URL 404'd until this landed.
- `649072f` — **Email + password sign-up, sign-in and reset.** Step 1 of the self-registration decision; touches
  no RLS. New `src/lib/password.js` mirrors the live Supabase policy so a parent sees a
  live checklist instead of GoTrue's 422, which enumerates all four character sets every
  time and therefore never says which one is missing. Magic link and Google hidden behind
  `SHOW_PASSWORDLESS`, code intact. Two review bugs fixed rather than worked around:
  `ResetPassword`'s one-way `linkDead` latch, and sign-in with an empty password advising
  the parent to check an inbox.
- `40ba837` — Recorded the mothball rulings: hide the magic-link and Google buttons but
  keep the code, no feature flags, `claim_roster_access` stays live rather than
  mothballed, old roster data deleted not archived. `[skip ci]`
- `70182cc` — **Decision: parents self-register, and a `pending` membership state.** Spec
  for the U13/U16/U18 pilot. Records why the pending state must exist — `can_see_team()`
  is squad-wide, so immediate access on a self-declared age group would expose that
  squad's children — and two silent failures found while writing it. `[skip ci]`
- `0342003` — Recorded the branch flip as verified; refreshed the Machines table.
  `[skip ci]`
- `39d6c06` — Applied the `sync_profile_name` single-word fix live and re-captured
  `db/schema/functions.sql` with it. Verified on a probe table and fault-injected against
  the old derivation. `[skip ci]`
- `5ac7714` — Changelog catch-up for `eb8c385`, and recorded the catch-up regress.
  `[skip ci]`
- `eb8c385` — **`main` is now the production branch, not `build/v1-mvp`.** `main` was a
  strict ancestor (`0 25`), so a fast-forward. Updated the 8 hard-coded branch references
  across 5 instruction-bearing files — `.github/workflows/docs.yml` being the one that
  would have failed silently. Added `db/migrations/20260808_sync_profile_name_single_word.sql`
  (**not applied to the live database**), and corrected two stale `state-of-play.md` claims:
  the single-word-name bug fires from `handle_new_user()` on every signup, not from the name
  gate, and the `search_path` bullet still said "Not applied" under its own PINNED heading.
  `[skip ci]`
  ⚠️ **That "not applied to the live database" is now out of date: it WAS applied later
  the same day** — see the entry above it. Left as written, because the commit message it
  summarises said the same thing and was true when written.

## 7 Aug 2026

- `066df2c` — Changelog catch-up for `6a96d4c`. `[skip ci]`
  ⚠️ **A catch-up commit needs its own catch-up.** The coverage check exempts only `HEAD`,
  so every "catch up the changelog" commit becomes an unlisted `HEAD~1` the moment anything
  lands after it. This entry was added on 8 Aug when exactly that happened. **When you write
  a catch-up commit, list the PREVIOUS catch-up in it too, or the regress just moves along.**
- `6a96d4c` — Re-captured `db/schema/` after three days and ~14 migrations of drift.
  Nothing unintended found; `tables.sql` had been asserting the opposite of the truth
  about the `memberships` unique index. `[skip ci]`
- `f7ffa60` — Pinned `search_path` on `sync_profile_name`; the last non-noise security
  advisor finding. Testing it surfaced a latent single-word-name bug. `[skip ci]`
- `3c6fbbf` — `npm run docs:check` + CI: six documentation rules that can now fail a
  build. Fixed five dead pointers, a removed component cited in a live a11y contract,
  three stale runbooks and seven missing plan status lines. `[skip ci]`
- `c3c038b` — One home per machine fact (NODE_ENV was wrong in two of three files),
  refreshed the Machines table, backfilled this changelog. `[skip ci]`
- `1f75dae` — Audited `state-of-play.md` against the live database: six claims corrected,
  four gaps added. `[skip ci]`
- `f6b45bd` — Split `RESTORE.md`; reading order 1,115 → 732 lines. Fixed a `git add -A`
  sitting in its own push example. `[skip ci]`
- `5fbbc57` — The `friendlyAuthError` fix was already shipped; the file said otherwise. `[skip ci]`
- `8a92421` — Split status out of `RESTORE.md`, promoting the durable half. `[skip ci]`
- `79c91b1` — Restored 17 orphaned decision/handoff/plan docs to the repo. `[skip ci]`
- `bb6aca6` — `CLAUDE.md` corrections.
- `bf1d884` — Moved View As to `/admin` so the wordmark fits for admins.
- `c3acc92` — Club wordmark was truncating to "ABU DHABI HARLE…".
- `8e22dca` — Stat band sat flush against the fortnight strip.
- `12b0fe0` — Male/Female on a player, and everything that follows from it.
- `8ee3d91` — Country picker rendered the dial code twice.
- `3b7070b` — Privacy policy wrongly said parents see only their own children.
- `8254a45` — Contact and parent rows never rendered on More.
- `7aa73ad` — More shows your own details, your players and the calendar link.
- `44e4c93` — Removed the countdown, and the timer that fed it.
- `0aa3263` — Fortnight strip on the dashboard.
- `f517593` — Stopped calling a training session a fixture.
- `9ea243f` — Account name shows at wide, not desktop.
- `6008433` — Time-based greeting, and a My account button in the masthead.
- `319c853` — Stat band is staff-only.

## 6 Aug 2026

- `923c421` — Inter replaces Anton + Barlow + Barlow Condensed.
- `172ae23` — Added the Button component the app never had, plus the arrow badge.
- `c5315ba` — Press feedback, and a green the palette re-point missed.
- `d47c671` — Re-pointed the palette at the current club redesign.
- `054e896` — Open a player from their name, and show their face.
- `fd3f203` — Login explains the sign-out, survives the email cap, embeds cleanly.
- `9eebd7d` — Account deletion and a privacy policy.
- `c80f51e` — **Session guard:** stops supabase-js silently downgrading a signed-in
  request to `anon`. See `claude/decisions/2026-08-06-session-guard.md`.
- `57a04e0` — Granted anon EXECUTE on the two profiles helpers that lacked it. `[skip ci]`
- `d449d3c` — Translated Supabase's auth rate-limit error into something a parent can act on.
- `e1e8275` — **Roster auto-onboarding**, and a hard name gate at first sign-in.
- `174bffd` — Sign-in returns you to the page you started on, not the site root.
- `1af744a` — Save button stopped promising events it would refuse to add.
- `0975c06` — **Auth email rolled back to Resend** while Microsoft stays blocked.
- `c70be86` — Dropped two redundant RLS read policies. `[skip ci]`
- `28d9a02` — Baseline security response headers.
- `782086e` — App hands out feed links on our own domain, not Supabase's.
- `b68d341` — Calendar feed proxied through our own domain.
- `034d9d8` — Pitch carried into the subscription feed.

## 5 Aug 2026

- `5009efb` — Team Manager and Medic roles; staff role set centralised in `scope.js`.
- `73eeb38` — One session across several age groups, and a pitch.
- `2e26d35` — One `/admin` dashboard, and `/more` given back to everyone.
- `562b92c` — Add a training session once and get the whole term.
- `cb10861` — Plan for repeating events. `[skip ci]`
- `7ed389c` — Mail-scoping runbook fix: the group takes the DEFAULT domain. `[skip ci]`
- `f8300ad` — Covered the day sheet, and fixed two stale notes.
- `98abea6` — Tapping any calendar day opens that day, and can add an event.
- `e563079` — Recorded the domain move, Resend, and the 5.7.708 investigation. `[skip ci]`
- `a9e8492` — Recovered the deployed Microsoft Graph send-email function into git.
- `5025497` — Recorded the auth email fix and verification. `[skip ci]`
- `df03d67` — Corrected the Supabase webhook secret prefix in the send-email hook.
- `a2565d6` — Switched club auth email from Microsoft Graph to Resend.

## 4 Aug 2026

- `3c6b12c` — Runbook for defederating the M365 tenant from GoDaddy. ⚠️ **Now obsolete —
  see `CLAUDE.md`.** `[skip ci]`
- `8713025` — Reorganised `docs/` into `claude/specs`, `plans`, `runbooks`, `archive`. `[skip ci]`
- `3c14d2a` — Wrote down how this codebase actually behaves. `[skip ci]`
- `50bcd2b` — Added `CLAUDE.md`, pointing at the docs that already exist. `[skip ci]`
- `23cedc8` — Club-branded auth email via Microsoft Graph and the Send Email Hook, plus the
  domain runbook. **Built and deployed but INERT** until the Entra/M365/Supabase steps are
  done. Replaces Supabase's built-in mail (2/hour, no SLA).
- `7b3daa7` — Recorded the self-service and calendar-feed decisions in `RESTORE.md`.
- `7f533fd` — Calendar subscription feed for Google and Apple: `calendar_tokens`, three
  RPCs, and a `calendar` Edge Function serving iCalendar.
- `dd0d5c9` — Parents and players can maintain their own record: photo, own contact row and
  parent rows. `players.photo_path` goes through a SECURITY DEFINER function because RLS
  grants access to rows, not columns.
- `3a512c5` — Scope/read-only banner removed everywhere; player sheet leads with a large
  photo, parent contact laid out like the player's own.
- `da2811a` — Login copy no longer sends people hunting for an admin the app can reach
  itself. Corrected a stale note claiming Google OAuth was unconfigured.
- `aea42df` — Signup gated behind admin approval: `access_requests`, a RequestAccess screen,
  Dismiss/Restore on Accounts.
- `5a39f5d` — `vite.config.js` survives an ambient `NODE_ENV=production`.
- `7b6d7a4` — Re-captured `db/schema/` after the parents+photos migration, and fixed the
  drift it exposed.

## Earlier

See `git log`. This file starts on 4 Aug 2026; everything before it is in the
`.superpowers/sdd/` task ledgers and the commit history.
