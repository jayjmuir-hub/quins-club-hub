# Plan — the Accounts screen at 300 accounts

**Status: NOT SHIPPED. Design in progress, and INCOMPLETE — two decisions are
made, the rest are recommendations awaiting Jay.** Started 13 Aug 2026, written
up mid-conversation at Jay's request because another session was working in the
repo. ⚠️ **Nothing here has been built and nothing was committed.**

⚠️ **`npm run docs:check` does NOT validate the paths in this file.**
`scripts/docs-check.mjs` excludes `claude/plans/` from the broken-path check,
because a plan may name files that do not exist yet. Every path below was read
during this session, but re-check before relying on one.

---

## The ask

Jay, 13 Aug 2026: *"the account sections is going to get way too big, we need to
design that better, i want to see every account but not the way it is now"*.

Two halves, and they pull against each other: **see every account** (so not a
search box over a hidden list) and **not like this** (so not 300 stacked cards).

## The scale, measured — today and expected

Read off the live database, 13 Aug 2026:

| | Now |
|---|---|
| Logins (`profiles`) | 17 |
| People with any access row | 13 |
| Access rows (`memberships`) | 19 |
| People waiting, no rows at all | 4 |
| Squads | 15 |
| Most access rows held by one person | 2 |

⚠️ **Re-measure before trusting these** — this file's own numbers rot like every
other count in this repo.

**The ceiling that matters is not today's 17.** The roster work in
`claude/decisions/2026-08-06-roster-auto-onboarding.md` counts **~279 parent
email addresses** at the club, and the 10 Aug no-roster-import ruling means they
arrive by self-registration, one at a time, indefinitely. So the design target
is **300+ people, 1–3 access rows each**, arriving gradually — which is the worst
case for a layout that degrades quietly rather than breaking.

## What the screen is for — SETTLED

Jay picked three of four jobs. In his words, the screen is for:

1. **Find one person and change their access.**
2. **Let waiting people in.**
3. **Audit — see who has what across the club.**

He did **not** pick "set someone up from scratch". Invites still exist; they are
not what this screen is optimised for.

⚠️ **Jobs 1 and 3 both want density and search — a table.** Job 2 wants a queue.
That tension is the whole design problem, and it is resolved by the next
decision rather than by a layout trick.

## Decision 1 — the queue moves out — SETTLED

**The waiting/approval queue leaves the Accounts screen for `/approvals`, and
Accounts keeps one compact line: "3 people waiting →".**

Why this is cheap: **`/approvals` already exists and already renders this exact
component.** `src/App.jsx` mounts `<Accounts />` at both `/admin/accounts` and
`/approvals`, and the comment there records the reasoning — one component that
self-gates, "rather than a second copy of the queue that could drift". An admin
landing on `/approvals` gets the full screen; a coach or team manager gets the
queue alone.

⚠️ **`/approvals` is deliberately NOT desktop-only, unlike `/admin`.** Its route
comment: *"Approving a registration is a two-second decision a coach makes on a
phone."* That property must survive this work — it is the only approval route a
coach has from a phone, reached from the Manage card on `src/screens/More.jsx`.

Consequences to design around:

- The banner must show a **count**, and that count must be the caller's own
  scope, not the club's. A coach sees only their squads' pending rows because
  RLS narrows it, so the number and the destination must agree.
- ⚠️ There is already a **designed-but-unshipped** plan for a count on this
  entry point: `claude/plans/2026-08-13-approval-badge.md`. **Read it before
  building the banner — this is the same surface, and the two must not be
  designed twice.**
- The dismissed list is part of triage, not audit. It should go with the queue.

## Decision 2 — layout — RECOMMENDED, NOT CONFIRMED

⚠️ **This is where the conversation stopped.** Jay was offered mockups and asked
for the write-up instead. The following is my recommendation, not his ruling.

**One dense row per person, sortable, with search — not cards.**

The current screen renders a `Card` per person with their access rows nested
inside and an Edit button opening a sheet. At 13 people that is pleasant. At 300
it is a scroll with no shape: nothing lines up, so nothing can be compared, and
"audit" becomes impossible even though every fact is on screen.

A table fixes exactly that and nothing else — the same facts, aligned, so
patterns become visible: every admin at a glance, squads with no coach, people
who have sat with no access for weeks.

**Columns, proposed:**

| Column | Why |
|---|---|
| Name | The identifier. Falls back to the email — see the 13 Aug fallback work in `src/screens/Accounts.jsx` |
| Email | The login. Read-only everywhere (column grant, not policy) |
| Role | Highest role, per `ROLE_PRECEDENCE` in `src/lib/scope.js` |
| Squads | The access rows, compressed — "U10, U13" rather than a row each |
| Linked player | The child, where there is one |
| Joined | Sort key for "who has been waiting" |

**Open questions inside this decision, all genuinely open:**

- Does a person with three access rows get one row or three? (One, compressed,
  is my recommendation — the person is the unit an admin thinks in, which is why
  `groups` exists in the current screen.)
- Which columns can be dropped at narrower widths?
- Sort default — name, or most-recently-joined?
- Does search filter the table, or jump to a person?

## Decision 3 — mobile — OPEN

⚠️ **`/admin` is desktop-only today** (`hidden desktop:block` on the entry point
in `src/screens/More.jsx`, and the screen renders a "Needs a bigger screen" card
below 820px). A table makes that harder to change, not easier.

Two defensible answers and **no ruling yet**:

- **Leave Accounts desktop-only.** Auditing 300 accounts is not a touchline job,
  and the phone-shaped job — approving — now lives on `/approvals`, which is
  already mobile. This is the cheaper answer and it is consistent with what the
  split in Decision 1 is for.
- **Make it responsive**, table on desktop collapsing to cards on a phone. More
  work, and it re-creates the card layout this plan exists to replace.

## What is NOT in scope

- **The edit surface.** The Edit person sheet works and is not what Jay
  complained about. It keeps its current behaviour and its tests.
- **The access model.** One access row = one `memberships` row = (role, team_id,
  player_id). See `claude/specs/2026-08-03-multi-access-design.md`. Untouched.
- **Invites.** Not one of the three jobs.
- **Any database change.** This is presentation only.

## The thing a builder will hit on day one

⚠️ **`src/screens/Accounts.jsx` is 1,612 lines** and holds the member list, the
pending queue, the waiting list, the dismissed list, the counts header, the
grant flow, the edit sheet and their state machines.

Decision 1 removes three of those. **Take the queue, the waiting list and the
dismissed list out into their own file(s) as part of that move, rather than
after it** — the move is already touching them, and a second pass over a
1,600-line file to tidy up is a pass nobody funds.

⚠️ **But do not refactor beyond that.** The grant flow and the edit sheet are
not what is being redesigned, and dragging them into this change makes the diff
unreviewable.

## Testing notes, for whoever builds it

- `tests/accounts.test.jsx` is 64 tests and pins a great deal of current
  behaviour, including several assertions rewritten on 13 Aug. **Expect to
  rewrite assertions, not delete them** — an assertion deleted because the
  layout changed is a behaviour nobody is checking any more.
- The counts header (`"11 with access · 17 access rows · 16 logins"`) is
  asserted, and its wording was chosen carefully — three different numbers that
  an admin must not confuse. Whatever replaces it must keep them distinguishable.
- ⚠️ **The coach/manager path is the one that breaks silently.** A coach hitting
  `/approvals` must still get the queue and nothing else. Test it as a coach,
  not only as an admin.
- Per the repo rule: **prove each new assertion against an injected fault.**

## Open questions for Jay — the reason this file is not a spec yet

1. Table or something else? (Decision 2 — mockups were offered and not yet seen.)
2. Which columns, and one row per person or per access row?
3. Does Accounts stay desktop-only? (Decision 3.)
4. Does the dismissed list move to `/approvals` with the queue, or disappear
   from the UI entirely and become something an admin only reaches deliberately?
5. Does this supersede or absorb `claude/plans/2026-08-13-approval-badge.md`?
