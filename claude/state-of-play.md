# State of play

**Reading-order step 3.** Where things stand TODAY and what is blocked on whom.
Restarted from scratch 14 Aug 2026 — the previous edition reached 2,151 lines
because every correction was appended instead of replacing anything, and half of
it was dated narrative about its own past.

## ⚠️ The rule that keeps this file useful

**Nothing dated goes in here. If it will be wrong in a week, it does not belong.**

- **A fact about the CODEBASE** → `RESTORE.md`.
- **Why a question was settled** → `claude/decisions/`.
- **What changed and when** → `claude/changelog.md`.
- **Known-broken but not blocking** → `claude/open-items.md`.
- **What a session did** → `claude/handoffs/`.

**Never quote a number a query can produce.** Every wrong claim in this file's
history was a rotted measurement; the rulings never rotted. Measure it.

⚠️ **If this file passes ~80 lines, something dated has crept in. Cut it.**

## Where things stand

**Live at https://adhquins-clubhub.com with real families on it.** The club went
live 13 Aug 2026. Assume a real parent is looking at whatever you touch.

**The senior section is live.** Four senior squads with a `section` column,
the 2026-27 senior fixtures on their schedules, three league divisions with
computed tables and a keeper per division, the `/seniors` overview, and U18
call-ups with push and email. Where each piece stands and what is still
unbuilt: `claude/handoffs/2026-09-04-senior-build.md`. ⚠️ The points rules
on the three divisions are a default Jay has not confirmed.
**Season stats are built (#695, 4 Sep 2026)** — scorers on senior sheets,
and a per-player season line on the squad page, `/seniors` and the player
sheet; `claude/plans/2026-09-04-senior-season-stats.md`. The migration is
APPLIED to live. **The `seniors` right is built (#706)** — an admin row
carrying it (the club captain, "but might be others") reads both senior
sections' rosters, availability, fixtures and stats, and no junior squad;
⚠️ check `claude/changelog.md` for whether `20260911_seniors_right` is APPLIED.
Still unbuilt from the senior work, in order: standings
routes 2 and 3 (⚠️ DEFERRED by Jay, 4 Sep 2026 — no AI reader for now and no paste-and-parse either; route 1 stands), the club-wide cross-section switch (the fallback) and the all-seniors channel,
union registration numbers. ✅ **The whole database suite is green on live
and `npm run db:check` runs it end to end** — the hygiene of 4 Sep (#701,
#702): anon EXECUTE revoked by name on nine functions, seven bare
`auth.uid()` calls wrapped, a real `end_callup` bug fixed, harnesses that
could not fail now can, four stale harnesses repointed, one stray staff
photo deleted, and `docs:check` compares full SHAs. A new function's
migration still needs `revoke … from anon` BY NAME; `db/tests/grants.sql`
catches it if forgotten.

📄 **THE DOCUMENTS REPO IS LIVE.** Club distro to age groups plus squad
self-serve uploads, two visibility tiers, multi-squad targeting, push on new
documents. Merged as #588 with the document cells following in #599.
`claude/plans/2026-08-31-documents-repo-implementation.md`.

📷 **CHAT PHOTO ALBUMS ARE LIVE — composer AND grid.** Paste, drag-and-drop
onto the whole conversation, multi-select and an all-or-nothing send of up to
ten photos (#605); the tiled grid and lightbox that draw them (#613), verified
on the deployed bundle.
✅ **THE TWO-ACCOUNT CHECK IS DONE — Jay, 1 Sep 2026.** A real album sent to a
second account, every photo visible. That was the one failure no test could
stand in for, because the storage read policy would have failed silently.
⚠️ **It also found three lightbox bugs the suite could not** — the back arrow
missing on the first photo, controls that moved because the stage was sized to
the image, and an overlay TRAPPED in the chat dock's stacking context so the
sidebar and masthead ate its clicks (#618, #619, #620). **Use the app; the
suite does not see layout.**
⚠️ **The chat LIST still previews an album as one photo**, because `my_chats()`
returns `last_attachment_path` and no count. That is plan 4's, along with
dropping the `attachment_path` contract, which must wait on cached service
workers. `claude/plans/2026-08-31-chat-photo-albums.md`.

💬 **The whole 26 Aug chat-and-identity stack is LIVE** — shared chat
thread (the dock IS the main chat), person card, presence dots, identity
badges (every hat, sticky), and the club-officers titles, all merged and
verified on the deployed bundle. Specs under `claude/plans/`, the day's
traps in `claude/handoffs/2026-08-26-chat-parity-and-officers.md`.
Nothing in this stack is blocked on anyone.

🏉 **The Rugby Performance Director dashboard (pieces 1–3) is LIVE** — merged
`d92adb7` (#276) on 21 Aug 2026 and verified end to end on the deployed site.
Both migrations are applied (`training_plans`, `publish_training_fit_check`),
plus `training_suggestions` — APPLIED 2 Sep 2026 and live with the screens
(`d98b593`, Part 1 of `claude/plans/2026-09-02-training-suggestions-and-age-guidance.md`):
the director's publish is now a suggestion the coaches accept or decline;
`training_suggestion_push` APPLIED 3 Sep 2026 with push-send v17 (`b780840`) —
the squad's coaches are pushed once per squad per publish, and the Publish tab
has an Uptake card;
harness 8/8 against production. The `training` right is held by the club's
Rugby Performance Director. Ten squads are marked contact and five tag —
`claude/decisions/2026-08-21-quick-rip-is-tag.md`. Nothing has been published
for real yet; the library is empty. Notification email, AI assist and a
first/second-session pair are out of scope and unbuilt.

🎨 **CLUB HUB 2.0 IS LIVE — the whole retheme, one day (21 Aug 2026).**
Dark mode + toggle, the member portal's sidebar shell on desktop, the
editorial voice, admin at every width, installs as "Club Hub" v2.0.0. The
spec is CLOSED: `claude/plans/2026-08-21-retheme-and-shell.md`, all five
phases shipped and verified from deployed bundles. design-system.md §−1
is the record of what ships; §0 and the body are history where they
disagree.

🏉 **THE SQUAD HUB IS LIVE** — `/squad`, the coach/manager dashboard:
availability-vs-attendance tracking across the WHOLE season, RSVP chips,
match-sheet chasers, event drill-in, and its own section in the desktop
sidebar (Overview / Build a Match Roster / Training Plans) with the same
doors as hub cards on the phone, where it is also on the tab bar.
`claude/plans/2026-08-21-squad-hub.md`. No real coach has used the
tracking grid yet; the first one's reaction is the thing to watch.

🗓️ **Coaches can see every squad's pitch bookings** at `/pitch-calendar`
(read-only, redacted — `public.pitch_occupancy`, applied and harnessed).
Requests still go through the fixture; allocation stays admin-only.

💬 **CHAT IS WHATSAPP-SHAPED SINCE 24 Aug 2026** — one Chats list, a pencil to
start a DM, a header on every thread saying who reads it, bubbles; the author
may delete a message any time and a DM can be deleted for yourself
(`claude/plans/2026-08-24-chat-list.md`). **GROUP CHATS SHIPPED the same
evening and are VERIFIED LIVE** — member-created, named, three people
minimum, minors addable with no warnings by ruling
(`claude/decisions/2026-08-24-groups-open-no-warnings.md`); the first real
group's push arrived on a second phone the night it shipped
(`claude/plans/2026-08-24-group-chats.md`). **The same evening: the member
chat home, nine feedback fixes from Jay's first test drive
(`claude/plans/2026-08-24-chat-feedback.md` — ALL SEVENTEEN now done), the
desktop floating dock, and emoji reactions — dock and reactions verified by
Jay on the preview against the real database.** **LATER THE SAME NIGHT,
ROUNDS 2 AND 3 SHIPPED AND ARE VERIFIED LIVE** — round 2
(`claude/plans/2026-08-24-chat-round-2.md`, `bbbc1d3` #371 + two embed
hotfixes): reply-with-quote, multi-select forwarding, the desktop emoji
picker, chat buttons on the Home staff tiles, and photo attachments under a
new ruling (`claude/decisions/2026-08-24-chat-photos-open.md` — open, like
WhatsApp; the report loop is the safety valve). Round 3
(`claude/plans/2026-08-24-chat-round-3-design.md`, `34c9e1c` #380): the
WhatsApp design pass — inline stamps, side reaction triggers, day dividers,
member-name headers, quins-green own bubbles, wallpaper presets, PRIVATE
nicknames. The dock also became resizeable (`8c12fb7`, ceiling 1100 via
`43e212e`). **Rounds 4 and 5 followed before midnight**: the chevron
message menu with Copy/Pin/Star/Reply-privately (`dea42ad` #384 — pinning
is anyone-in-the-chat by ruling, via a single-column RPC; stars are
private; the quote guard relaxed for reply-privately) and the navigation
set (`043f9c3` #386 — sidebar chat categories, ?filter= chips, folds,
unread-first). Four migrations applied and measured in production across
the night (`chat_round_2`, `nicknames`, `chat_round_4`, and round 2's
bucket). Pins-as-chats and archive are offered and parked
(`claude/plans/2026-08-24-chat-navigation.md`).
⚠️ **No real member has used quotes, forwards, photos, nicknames or
wallpapers in anger yet** — tomorrow's real use is the next bug source.
Underneath, unchanged:
**SQUAD CHAT PHASES 1–3** (23 Aug 2026) — a channel per squad
and one for the club (announce-only by default), a thread per fixture with
RSVP chips, @mentions that push, a staff channel per squad, direct messages,
reports, and a Welfare dashboard behind a fifth admin right. **Who may DM whom
is the database's rule** (`private.can_dm`): a minor only by their guardian, or
by U16+ staff once a guardian opts in. ⚠️ **An admin may read a DM only if it
involves a minor or a message in it was reported** — Jay's evening ruling,
narrowing his morning one that any admin may
(`claude/decisions/2026-08-23-adult-dms-private-unless-reported.md`); every
thread's notice says which applies. Push proven on a real iPhone and a real
Android. `claude/plans/2026-08-23-squad-chat.md`; the day's record is
`claude/handoffs/2026-08-23-chat-phases-2-and-3.md`. Of Phase 4, photos
shipped with round 2 (24 Aug); retention and email digests are not started
and email was ruled low priority.
⚠️ **Nobody has the Welfare right yet and no real DM has been sent** — the
first one is the first proof.
✅ **A photo/voice-only DM previews as "📷 Photo" / "🎤 Voice message"**, not
"No messages yet" — `my_chats` returns `last_attachment_path` and `previewLine`
renders the medium; migration applied, verified live.

🛡️ **The app rides through a stalled Supabase instead of hanging.** A timeout
under idempotent reads (`src/lib/resilientFetch.js`) turns a multi-minute hang
into a retry — GETs via postgrest's own retry, read-only RPCs bounded, while
writes, uploads and auth are left untouched; the Workbox cache falls back after
8s; the load gate and signup picker say "taking longer than usual…" rather than
freeze. `claude/plans/2026-08-28-provider-resilience.md` §1–§3 (§4 browser
stale-while-revalidate unbuilt). ⚠️ **No provider migration — examined and
declined**; one bad provider week is not a reason to swap Supabase's bad days for
someone else's. A sustained pattern would reopen it with a real plan.

📋 **The importer reads columns by content, any order**, has a squad
picker for name-only pastes, and skips players already on the roster.
The first real bulk import since the rethink is the thing to watch — the
accepted residue is that an unknown word next to a name joins it, visibly.

**Current phase: onboarding, and the fixes it throws up.** Not new
infrastructure. The last four features found their bugs within hours of a real
person using them, and none of those bugs had a failing test.

## Blocked on Jay

- **Most squads have nobody attached on `/admin/staff`**, so the Home "Squad
  contacts" card shows its empty state to most of the club. Data entry, not code.
  Run the query below rather than trusting this sentence.
  ⚠️ **JAY'S POSITION: this resolves itself as staff sign in, and it is not
  blocking.** Do not keep raising it as the top priority; he has heard it.

✅ **Monitoring is no longer on this list** — two uptime monitors and Sentry are
LIVE, each proved by making it fire. ⚠️ **Read
`claude/runbooks/monitoring.md` before touching either**; two things there are
load-bearing and easy to undo by tidying.

## Tabled — do not start, do not offer, do not ask again

The photo **restore drill** and the **AI build**
(`claude/plans/2026-08-12-ai-integration.md`) (Jay, 20 Aug 2026). Jay reopens
them or they stay closed.
✅ **Training session plans came OFF this list on 20 Aug 2026**, reopened by Jay
after eight days — `claude/plans/2026-08-12-training-session-plans.md`. It is the
worked example of the list doing its job: nobody offered it, and he brought it
back himself. ✅ **The live `squad_push` test came OFF on 23 Aug 2026 — PROVEN**, a
notice and a fixture change both arriving on a real iPhone that was not the
actor's, and a fixture change arriving on a real Android the same morning. Reopened by Jay as step zero of `claude/plans/2026-08-23-squad-chat.md`.
The trap for next time is unchanged: **the actor never receives their own push**
(`squad_push_subscriptions` excludes `_actor`), so the receiver must be a
different person on a different account. ⚠️ The AI *ruling* — children's data may
leave the club, minimised — still stands and still governs;
`claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`.

## Numbers — measure, never cite

```sql
-- the club, right now
select (select count(*) from auth.users)                                as logins,
       (select count(distinct profile_id) from memberships
         where status = 'active')                                       as members,
       (select count(*) from players)                                   as players,
       (select count(*) from memberships where status = 'pending')      as awaiting_approval,
       (select count(*) from memberships where is_super)                as super_admins,
       (select count(*) from storage.objects
         where bucket_id = 'player-photos')                             as player_photos;

-- reports, and whether any carry a reply (see "Test data" below)
select ref, status, admin_note is not null as has_reply from public.feedback
 order by created_at desc;

-- squads with nobody looking after them
select t.name from teams t where not exists (
  select 1 from memberships m where m.team_id = t.id and m.status = 'active'
    and m.role in ('coach','manager','medic','admin')) order by t.sort_order;
```

## Test data still in the live database

**Two reports in `public.feedback` carry test text as the club's reply**, left
over from proving push notifications on a real phone. ✅ **They can now be
deleted** — an admin has a Delete on each row as of 19 Aug 2026, which they
could not on the morning of the same day. Jay's to clear or keep.

⚠️ **Measure before you repeat.** The last warning in this section outlived the
problem by a week, because it was copied forward instead of re-run.
