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

🏉 **The Rugby Performance Director dashboard (pieces 1–3) is LIVE** — merged
`d92adb7` (#276) on 21 Aug 2026 and verified end to end on the deployed site.
Both migrations are applied (`training_plans`, `publish_training_fit_check`),
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
(`claude/plans/2026-08-24-chat-list.md`). Underneath, unchanged:
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
`claude/handoffs/2026-08-23-chat-phases-2-and-3.md`. Phase 4 (photos,
retention, email digests) is not started and email was ruled low priority.
⚠️ **Nobody has the Welfare right yet and no real DM has been sent** — the
first one is the first proof.

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
