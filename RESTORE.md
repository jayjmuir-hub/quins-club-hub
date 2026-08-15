# Quins Club Hub — what is TRUE about this codebase

**This file is the DURABLE half.** How the code actually behaves, the rulings that
cost real effort to discover. It should not need editing because a status changed.

⚠️ **STATUS DOES NOT LIVE HERE.** Where things stand today — what is shipped, what is
blocked, test counts, which domain is live, which clone is behind — is
`claude/state-of-play.md`. This file previously carried all of that and went badly
stale: on 7 Aug 2026 it was still announcing a domain move that had completed two days
earlier, a test count four revisions old, and **"DO NOT INVITE THE COMMITTEE"** over an
email blocker that no longer existed. Because `CLAUDE.md` ranks this file ABOVE
`state-of-play.md`, the most authoritative document was the most wrong one.

**If you are about to write a date, a count, a deploy id or a "currently" into this
file — it belongs in `state-of-play.md` instead.**

Reading order and precedence are in `CLAUDE.md`. Single source of truth for the code is
https://github.com/jayjmuir-hub/quins-club-hub (public). Branch `main` is the live
work and the production branch. ⚠️ **Until 8 Aug 2026 that was `build/v1-mvp`,
and `main` held only early scaffold history** — an old clone or an old document may
still say so.

**Two things that used to live here now have their own files, because neither is
"how the code behaves":**

- `claude/schema-history.md` — the REASONING behind each migration. Reference, read
  it before changing a policy. Not in the reading order.
- `claude/runbooks/session-and-push.md` — how to start a session and how a change
  gets pushed. Procedure, not truth.

---

## Two rulings worth reading before touching auth or roles

1. **"View as" is a cosmetic preview, not a security boundary.** RLS scopes on the real
   `auth.uid()`, so an admin previewing as a coach still *receives* club-wide rows — the
   browser just declines to render them. Never cite this feature as evidence to the
   committee that coaches cannot see other squads' data (that claim is true, but RLS is
   the evidence, not this). Real impersonation needs a server-side scoped token; noted
   for the AWS migration.
2. **The switcher and its banner gate on `realMemberships`, never on effective
   `memberships`.** Previewing as a parent makes `isAdmin(memberships)` false. If the
   exit control were gated on the effective set, the admin could only escape by clearing
   localStorage. This is the single highest-risk line in that feature.

---

## Toolchain — locked in

The v1 MVP build was reviewed task by task, and every review round was closed by a
scoped re-review. The ledger at
`.superpowers/sdd/quins-v1-mvp/progress.md` records every ruling, fix round and deferred
minor, and it is committed to this repo — a resuming session gets it from the clone.

**Toolchain locked in:** React 18, Vite 5, Tailwind 3 (not 4 — later tasks assume the
config-file API), React Router v6 with `v7_startTransition` and `v7_relativeSplatPath`
future flags, Vitest + React Testing Library. No ESLint or Prettier. `npm test` runs unit
tests only and never touches the network; `npm run test:integration` runs the
`*.integration.test.js` files against the live Supabase project.

---

## How this codebase actually behaves

Things that are true, non-obvious, and have already cost someone an hour. Every entry is
something a session discovered by hitting it.

### UI components with a trap in them

**The roster is TWO components.** Cards on mobile (`data-testid="player-row"`), a table on
desktop (`data-testid="roster-table-row"`). ❌ **This said BOTH are in the DOM at every
width with one CSS-hidden. That stopped being true on 29 Jul and the claim survived here
until 9 Aug.** The switch is made in JS: `useMediaQuery` (`src/lib/useMediaQuery.js`)
decides, and `Roster.jsx` renders one or the other, never both — precisely so a selector
cannot match a hidden twin. The two `data-testid` values are still correct.

⚠️ **On desktop the row is NOT the button — the NAME is** (`RosterTable.jsx`), and
clicking it opens the detail sheet. The **"Open"** button in the last column still exists
but is no longer the only way in. **Four** columns edit in place — position, age group,
captain and **gender** (added 7 Aug), not the three this said.

⚠️ **`FixtureRow` MUST STAY A DIRECT CHILD OF ITS LIST, AND WRAPPING IT IS A SILENT BUG.**
The row carries `last:border-b-0` — CSS `:last-child` — so wrapping each row in its own
`<div>` (to hold an animation, a link, anything) makes EVERY row its wrapper's last child
and strips the divider from the whole list, not just the final one. Measured in Chromium
15 Aug 2026: five rows went from 1/1/1/1/0 px of bottom border to 0/0/0/0/0. This is why
the component takes `className` and `style` — pass them instead of wrapping.
⚠️ **jsdom CANNOT SEE IT**, because it computes no CSS, so the guard is structural:
`tests/dashboard.test.jsx` asserts each row's `parentElement` IS the list card.

**`PhoneInput` takes `country` + `national` + `onCountryChange` + `onNationalChange`** —
not `value`/`onChange`. Phones are stored E.164 and split for editing with
`splitPhone`/`joinPhone` (`src/lib/phone.js`). Formatting is deliberately NOT applied
as-you-type; that reintroduced a caret-jump bug.

**Netlify serves `dist/` from a Vite build — the repo root is NOT served.** (Unlike the
adhjrt tournament repo, where the root IS the deployed site. Rules copied from there about
scratch files in the repo root do not apply here for that reason. The `git add -A` rule
still does, for the `.env` reason.)


### Tests, jsdom and the `harness/`

**The test suite needs `.env`, which is gitignored.** A fresh clone fails with "Missing
required Supabase env var(s)" until you create it — values in
`claude/runbooks/session-and-push.md`.
Delete it before committing.

**⚠️ `npm test` does NOT build, and some tests read the BUILT stylesheet.**
`tests/button-sweep.test.js`, `tests/press-feedback.test.js` and `tests/pwa-build.test.js`
all read `dist/` on purpose — those CSS rules live in `@layer components` and are only
real if Tailwind emits them. But `dist/` is gitignored, so it survives `git reset --hard`
and goes stale in silence. **After syncing, run `npm run build` before `npm test`** or the
sweep tests fail as though the CSS regressed, pointing at button styling that is perfectly
fine. ⚠️ **The file's own guard does not catch a stale bundle** — its "run `npm run build`
first" message hangs off a `css.length > 1000` check, which any old build passes. It
discriminates between *missing* and *present*, not between *fresh* and *stale*. Cost four
red tests on cafnet on 11 Aug 2026, immediately after a 76-commit sync.

**jsdom applies no Tailwind.** Any test asserting "this is visible" proves nothing about
real rendering. Assert class tokens, and verify anything visual in Chromium via `harness/`.

**jsdom has no `URL.createObjectURL`.** Touching a file input without the stub in
`src/test/setup.js` throws inside an effect and React unmounts the ENTIRE tree — an empty
`<body>` and an error mentioning nothing about object URLs.

⚠️ **THE HARNESS'S EVENT DATES ARE RELATIVE TO TODAY, AND THAT IS A FIX, NOT A FLOURISH.**
`harness/stubs/events.js` writes its fixtures as literals against 2026-07-27 and shifts the
whole set to today by one constant at the bottom of the file. Pinned to July they aged into
the past, and the Dashboard then correctly rendered NEITHER the next-fixture hero NOR a
single Upcoming row — so the harness silently stopped being able to show the thing under
test, and PR #79 shipped its hero unverified for exactly that reason. **Keep the literals
when you edit them**: they encode same-day, same-series and day-boundary relationships that
`today + n` by hand would lose.

**`harness/` stubs must mirror the real modules, and `tests/harness-stubs.test.js` enforces
it.** Add an alias in `harness/vite.config.js` without a matching stub — or add an export to
a real data module without adding it to the stub — and every harness scenario goes dark at
once, because `harness/main.jsx` imports every screen into one bundle.

**The harness needs a stub for anything AppShell imports TRANSITIVELY.** `AppShell` →
`RequestAccess` → `data/accessRequests.js` → the real Supabase client, which throws on
missing env vars before a single pixel renders.

**The pinned Playwright expects a Chromium build a cloud sandbox may not have.** Launch with
an explicit `executablePath` rather than downloading a second copy — see
`harness/shoot-playerdetail.mjs`.


### Postgres, RLS and the schema

**`composite IS NOT NULL` is only true when EVERY field is non-null.** A perfectly good
`players` row reads as null because `jersey_num` is empty. This made a working RPC look
broken. Test a FIELD, not the row.

**A temp table created before `set local role` is unreadable afterwards.** In an RLS
verification script, `create temp table` as one role then `set local role anon` gives
"permission denied" until you `grant select` explicitly.

**`private.can_see_team` has a hand-copied twin.** `public.calendar_events_for_token`
restates the same visibility rule against a token-resolved profile, because a calendar
client has no JWT and `auth.uid()` is unavailable.

⚠️ **THE MIRROR IS NOW BROKEN, DELIBERATELY, AND THIS FILE SAID "CHANGE ONE, CHANGE BOTH"
UNTIL 9 Aug.** `private.can_see_team` gained `and m.status = 'active'` on 8 Aug and the
calendar function did **not**. The consequence a reader needs: **a PENDING member's
calendar token still returns their squad's fixtures**, which matches the app (a pending
parent sees the schedule and not the roster) and is therefore intended. Read both bodies
in `db/schema/functions.sql` before assuming either is wrong.

**⚠️ "Which rows may I see" is not "which rows are mine".** `loadMyMemberships` had no
`profile_id` filter, so RLS decided the answer — and `memb read` is
`(profile_id = auth.uid()) OR private.is_admin(club_id)`, which for an admin is **the
whole club**. An admin opening their own account saw other people's children listed under
"Your players", and every coach and manager would have hit the same shape. It now throws
without a profile id rather than defaulting to whatever the policy allows.

**⚠️ An unparseable name must not fall through to the least safe answer.**
`src/lib/ageGroup.js` decides whether a player may hold their own email and phone (U13 and
above may; below U13 may not, and the fields must not render). Its regex was
`/^u(\d{1,2})\b/i`; `\b` needs a word boundary after the digits and **a letter is a word
character**, so `U12G QR` matched nothing, the band came back `null`, and
`allowsOwnContact` reads `null` as "a senior side: adults" → **true**. It is
`/^u(\d{1,2})(?![0-9])/i` now. **The regex was the symptom; the null default was the
bug.**

**Gender: blank is REFUSED on a single-gender squad, a MISMATCH is allowed with a loud
warning.** Two rules pointing opposite ways, and that is deliberate — the club has had
four women recorded in "Senior Men 2nd XV", and blocking it would make such a player
uneditable by anybody, including whoever was trying to correct them. ⚠️ **Do not tidy
these two together.** ⚠️ **And the B/G suffix must TOUCH the digits** — `U6 Tag` ends in a
G, and a looser pattern makes every Tag squad in the club girls-only.

**RLS grants access to ROWS, not COLUMNS.** This is why `players.photo_path` is written by
`set_own_player_photo()` and not by an owner policy: a row-level owner policy on `players`
would hand a parent `team_id` as well. Don't "simplify" it back into a policy.


### Auth and onboarding

**⚠️ `accept_invite` matches on EMAIL, and that is an onboarding trap.** Invite someone
at `jane@work.com`, they create an account as `jane@gmail.com`, and the invite does not
match — they land in the access-request queue instead. Nothing is broken when that
happens, but it looks like a failure to the person it happens to. The email check itself
is intact (`if lower(inv.email) <> lower(caller_email) then raise exception`).

⚠️ **The illustration used to be "they sign in with Google" and that route is now
mothballed** — `SHOW_PASSWORDLESS` in `src/screens/Login.jsx` hides both Google and magic
link as of 8 Aug. The trap now fires on a work-vs-personal address at password signup.
**Do not read this paragraph as evidence Google sign-in is live.**

---

## Rulings that cost real effort to discover — don't rediscover them

### Scope and RLS

**RLS is stricter than the plan assumed.** Every SELECT policy — `clubs`, `events`,
`players`, `availability` — requires a `memberships` row matching `auth.uid()`. A signed-in
user with zero memberships reads **zero rows** from them — no error, just empty.

❌ **THREE PARTS OF THIS WERE WRONG UNTIL 9 Aug**, all from 8 Aug:

- **`teams` is NO LONGER in that list.** `team read` is now simply
  `auth.uid() is not null`, so any signed-in account reads **every** team row —
  `20260808164111 teams_readable_before_registration`. It had to be, or the age-group
  dropdown was permanently empty for the one person who needed it: a parent registering
  their child.
- **"Correct for an invite-only club app" — the club is not invite-only any more.**
  Parents self-register (`register_my_player`, `src/components/AddYourPlayer.jsx`).
- **The zero-membership screen is not a "not linked to a squad yet" message.** `AppShell`
  renders **`AddYourPlayer`** — register your child — with `RequestAccess` as the opt-in
  second branch. (This file also named a component `NoMembershipState` that has never
  existed.)

⚠️ **AND THE ASYMMETRY THAT REPLACED IT, which is load-bearing:**
`private.can_see_team` requires `status = 'active'` and gates **people**;
`private.is_attached_to_team` accepts any status and gates **fixtures**. So a **pending**
member sees the schedule and not the roster. That is deliberate. Do not "align" them.

**Admin memberships have `team_id = NULL`** — admin is club-wide. `visibleTeams`
special-cases admin rather than collecting `team_id` values.

❌ **The reasoning this used to give was wrong twice over.** It said the `teams` read
policy "matches on `club_id`, so an admin still sees all **15** teams". The policy stopped
matching on `club_id` on 8 Aug (it is now `auth.uid() is not null`), and the squad count
had changed — the three senior sides were never inside the "15" it named.
⚠️ **Do not put a squad count back into this file** — including in a sentence explaining
why the last one was wrong, which is what the 9 Aug correction did; `db/migrations/20260809_age_groups_rename.sql`
holds the guard and `claude/decisions/2026-08-09-single-gender-squads.md` the list.

**`canEditTeam(memberships, null)` returns `false`, even for an admin.** Deliberate, and a
knowing departure from the plan's literal wording. A null team id means "we don't know which
team", and the safe answer to "may I edit an unknown team?" is no. `events.team_id` and
`players.team_id` are both NOT NULL, so only a bug or a partial load reaches that path.
There is a comment in `scope.js` saying so — don't "fix" it back.

**`listEvents({teamIds: []})` returns `[]` without querying.** An empty array means "no
teams, show nothing", not "no filter, show everything". One keystroke apart, opposite in
consequence: a user with no squads would otherwise see the whole club.


### Domain rules the club actually uses

**A fixture is a "result" when a score is present, not when its date has passed.** The
prototype used this rule. A match played last week with no score entered is still Upcoming.

**The club does not use jersey numbers.** `players.jersey_num` stays in the schema (nullable,
harmless, available if a senior side ever wants it) but nothing in the UI reads it. Roster rows
and the PlayerDetail hero show initials instead, via `src/lib/playerFormat.js`. Never add a
jersey field to the event/player forms.

**"Upcoming" and "not yet scored" are two different questions that happen to look similar.**
Schedule's Upcoming *tab* deliberately shows unscored events regardless of date — a match still
needing a score stays visible until someone scores it. That's correct and must not change.
Dashboard's "what's coming up" list and its stat tile want something different: chronologically
future events (`starts_at > now`), because trainings and socials can never have a score and
would otherwise sit in "Upcoming" forever. Don't collapse these two back into one filter — they
were split apart on purpose in Task 13.


### Time — everything is Abu Dhabi time

**All event times are forced to Abu Dhabi time (`Asia/Dubai`), always** — a deliberate,
twice-reviewed decision, not a leftover default. One club, one ground: "20:00" must always mean
20:00 at Zayed Sports City, regardless of the viewer's browser timezone. Route every date/time
formatter through `src/lib/eventFormat.js`'s Dubai-anchored functions — never `toLocale*` with
an implicit zone, never a hardcoded `+04:00` offset (use the IANA zone via `Intl`'s `timeZone`
option; offsets are a derived fact and the wrong abstraction). Calendar day-bucketing and any
"today" highlight must also be computed in club-local days, not the browser's. **Any test
touching this must prove zone-independence, not assume it** — pin a fixed instant and
demonstrate the same output under a hostile `TZ` (e.g. `America/New_York`); a test that only
passes because the runner sits in UTC is not evidence. This exact failure mode has shipped
twice already, hiding in tests that *looked* zone-safe.

**Task 14's event form must interpret an entered date and time as Abu Dhabi time** when it
builds the `starts_at` value. A naive `new Date(\`${d}T${t}\`)` resolves in the browser's zone,
so a coach entering 20:00 from outside the UAE would write a 23:00 (or worse) Abu Dhabi
kick-off. This is the mirror image of the read-side timezone fix and is easy to miss.


### Data access conventions

**`getPlayerContact` uses `.maybeSingle()`, not `.single()`.** Zero rows is the normal
outcome for a parent — RLS hides contacts from them. `.single()` throws on zero rows, which
would turn a safeguarding feature into a crash.

**`auth.users` already has an `on_auth_user_created` trigger** calling `handle_new_user()`,
which creates the `profiles` row. No app-side profile creation needed.

**Writing a player's contact details is two separate calls, never one.** `upsertPlayer` then
`upsertContact` — so a partial failure (player saved, contact rejected) is surfaced distinctly
rather than silently rolled into one ambiguous error.

**Conventions set by earlier tasks:** data-access functions **throw** on error, never return
`{data, error}` tuples, and return `[]` not `null`. `src/lib/scope.js` holds only pure
functions with zero imports. Screens catch and render errors in a `role="alert"` region.
Data modules never import React.


### Safeguarding — contact details

**Never render a loading state for `getPlayerContact`.** Render nothing until a row arrives.
A spinner there put an aria-live "Loading contact details…" announcement in front of a parent
who is not permitted to see them.

**A component that states a safeguarding invariant must enforce it itself.** Task 15's
`PlayerForm` claimed "a null contact row here can only mean nothing recorded yet, never
withheld" — true only because *something else* (`Roster.jsx`) gated who could open the form
for which player. The form's own gate was coarser ("has any editable squad"). Fixed by
folding the per-player check directly into the component that makes the claim:
`Boolean(player) && !canEditTeam(memberships, player.team_id)`. Nothing leaked — RLS and
Roster's gating were both already correct — but don't split "asserts" from "enforces" across
files again.

**Contact disclosure copy must match the real RLS predicate, not the intuitive one.** The
effective read permission is `can_edit_team(...) OR is_own_player(player_id)` — the linked
player can read their own contact row, not just coaches/admins. ⚠️ **This used to name a
"read policy". There isn't one:** `"contact read"` was dropped on 6 Aug as an exact
duplicate of the OR of the two `FOR ALL` policies that remain (`"contact edit"` and
`"contact edit own"`). A commented tombstone in `db/schema/policies.sql` says **do not
restore it** — the redundancy is mutual but the two sides are not interchangeable. Copy shown to whoever is entering a minor's
guardian details must name both.


### UI state, forms and design

**A selected team pill must be reconciled against live scope.** Both Schedule and Roster
derive `activeFilter = teamIds.includes(teamFilter) ? teamFilter : ALL_TEAMS_ID`. Without it,
a membership reload that drops the selected team leaves the list filtered to nothing — and
below two teams both screens hide the pill row entirely, so there is no "All" pill to click
as a manual recovery.

**Pill counts come from the search-only set, never the team-filtered set.** Otherwise every
unselected pill reads "· 0" the moment any pill is clicked.

**Distinguish first load from refresh.** `setLoading(true)` on every refetch flashes a
spinner over already-rendered content — Schedule uses a derived `isFirstLoad`, EventDetail a
`settledForEvent` ref (an empty availability list is a legitimate steady state there).

**A `<button>` used as a layout box inherits Chromium's UA content-centring**, which no jsdom
test can see. Task 11's calendar shipped with populated day cells floating 66px below their
empty neighbours at desktop width. Set layout explicitly on any interactive non-text element.

**Contrast:** `quinsGreen #7DC351` on white is ~1.9:1 and fails AA for text — gradient stop
or block fill only. Error text uses `quinsRedDark #8E1526` (~7.9:1). The neutral chip's text
was darkened to `#5c5854` (6.04:1) because the design system's `--muted` on the chip
background was 4.07:1, under the threshold. `--muted #77726e` also fails on the **paper**
background `#f5f4f3` (4.33:1) while passing on white inside a card (4.75:1) — on-paper text
uses `#5c5854` (6.42:1).

**Delete confirmation is a two-step inline control, never a native `confirm()`.** A native
dialog blocks the event loop and hangs Playwright's browser check dead — established in
Task 14, reused in Task 15's player delete.

**Squad reassignment on edit must fall back to the entity's own team, not the first editable
one.** `editableTeams[0]` as a fallback silently reassigns whoever is being edited to a coach's
first squad the moment the form opens. Reconcile against the entity's actual `team_id` instead.
Fixed in `PlayerForm.jsx`; `EventForm.jsx` has the identical shape and has NOT been fixed —
it's a separate file and a separate decision, deliberately left alone in Task 15's fix round.


### Routing, React and the PWA build

**A screen that must be reachable before a user has any memberships cannot live inside
`AppShell`.** `AppShell` deliberately refuses to render its routed content at all until
`memberships.length > 0` (showing `AddYourPlayer`, or `RequestAccess` on the opt-in
second branch) — correct for every normal
screen, but it means any future screen aimed at a membership-less user (Task 18's
`/accept-invite/:token` is the first, and likely not the last — an invite-decline flow, an
"invalid invite" landing page, etc. would have the same shape) must be routed as a sibling
OUTSIDE `AppShell`, per-route now that `src/App.jsx` wraps each route in its own `<AppShell>`
individually rather than one shared instance around a shared `<Routes>`. Don't nest a new
"pre-membership" screen inside an `AppShell`-wrapped route and expect it to be reachable.

**React 18 StrictMode's dev-only double-invoke can permanently break a non-idempotent effect
if a `mounted`-ref guard and a `calledRef`-style once-only guard fight each other.** Task 18's
`AcceptInvite` hung forever in `npm run dev` (never in a production build) because the
StrictMode mount→cleanup→remount cycle set `mounted = false` in the throwaway first mount's
cleanup, and the guarded second mount declined to start a new call — so the real in-flight
promise's result got silently discarded by the `if (!mounted) return` check with nothing left
to ever flip `mounted` back. The fix was to drop the `mounted` flag and rely solely on the
once-only guard, since the underlying call (`accept_invite`) is deliberately not safely
re-callable anyway. Any future one-shot side-effecting screen (payment confirmation, a
one-time RPC) should be built with this in mind, and tested by literally rendering under a
real `<React.StrictMode>` wrapper in RTL — jsdom/RTL doesn't do this by default, so a normal
test render won't catch it.

**⚠️ A Workbox `urlPattern` function cannot see build-time module scope.** Workbox
stringifies and re-executes those functions inside `dist/sw.js`, which does not share
`vite.config.js`'s scope — an outer-scope `const` (e.g. `SUPABASE_HOST`) is `undefined`
at runtime. Only visible by reading the real generated `dist/sw.js`, never the plugin
config object. **This is why `tests/pwa-build.test.js` shells out to a real `vite build`
rather than asserting on config.** Fixed by inlining the hostname as a string literal.

---

## Two bugs worth knowing about, because the tests didn't catch them

**jsdom does not apply Tailwind's CSS** — also listed above, repeated here for the story. Any test asserting "this is visible" proves nothing
about real rendering. This hid a role label that was CSS-hidden on every phone while
`getByText('Coach')` passed happily. The fix was to assert on class tokens directly, and to
render the real components in Chromium via `harness/` as a controller-side check. That
browser pass also caught the club crest being squashed flat by `object-fit: fill` in a
square badge.

**The bottom-sheet modal ate keystrokes.** `Sheet` had `onClose` in a `useEffect` dependency
array; every parent re-render gave it a new identity, re-running the effect, whose cleanup
stole focus back to the trigger. Typing "Tom" into a field inside a sheet produced "T".
Every add/edit form in Tasks 14-16 opens in a `Sheet`, so this would have broken all of
them. Fixed with the latest-ref pattern and pinned by a regression test verified to fail
against the pre-fix code.

Both are the same lesson: for anything visual or focus-related, verify in a browser, not
just in jsdom.

---

## Changing the schema safely — `db/schema/`

Everything above describes the schema in prose. **Prose does not diff.** That is precisely
how an older migration named `accept_invite_multi_target` got re-applied on 2026-08-03 and
silently reverted the incomplete-invite guard inside `public.accept_invite` — repeatedly,
undetected, because there was no file in the repo to compare the live function against.

`db/schema/` fixes that. It holds a **capture of the live database** — five SQL files
(`tables.sql`, `policies.sql`, `functions.sql`, `triggers.sql`, `grants.sql`) generated
from read-only catalogue queries (`information_schema.columns`, `pg_constraint`,
`pg_policies`, `pg_proc` + `pg_get_functiondef` + `proacl`, `pg_trigger`,
`pg_class.relrowsecurity`).

Read `db/schema/README.md` first. The essentials:

- **It is a capture, not a migration runner. Do not run those files.** Supabase migrations
  remain the one and only mechanism for changing the schema.
- The workflow after any schema change is: apply the migration → re-capture into
  `db/schema/` → commit both together. If the re-capture shows changes you did not intend,
  something drifted or was reverted. That is the whole point.
- ⚠️ **PASTING THE MIGRATION'S DDL IS NOT CAPTURING THE DATABASE, and it produces a file
  that looks complete.** `pitches` and `pitch_requests` were written into `tables.sql`
  this way on 11 Aug: `CREATE TABLE IF NOT EXISTS`, inline unnamed `UNIQUE` and `CHECK`.
  Live names those constraints — `pitches_club_id_name_key`, `pitch_requests_status_check`
  — and neither string existed anywhere in the repo, so dropping or renaming either would
  have diffed to **nothing**. Capture from the catalogue, always, even when you wrote the
  migration ten minutes ago.
- ⚠️ **A "reconciled — zero drift" note is a MEASUREMENT and rots like every other one.**
  The 10 Aug reconciliation was correct when run and was falsified the same day by a
  migration applied hours later, while `claude/state-of-play.md` quoted it as current
  state for two days. **The date on such a note is the load-bearing half, not the verdict.**
- ⚠️ **The cheap way to check the whole directory, which is a name-level check and finds
  every gap of the commonest kind:** dump the live inventory (`pg_proc`, `pg_policies`,
  `pg_constraint`, `pg_indexes`, `information_schema.columns`) and assert every name
  appears somewhere in the corresponding file. It will not catch a changed *expression* —
  for that you still diff bodies — but every one of the seven objects missing on 11 Aug
  was a missing object, not a changed one. **Always include a control name that must NOT
  be found**; see the PowerShell trap below for why an empty result cannot be trusted on
  its own.
- ⚠️ **Watch for a claim in these files that has INVERTED, not merely gone stale.** Three
  had by 11 Aug: `policies.sql` said "Every policy is PERMISSIVE" after a RESTRICTIVE one
  was added, and listed thirteen RLS-enabled tables against sixteen live; `functions.sql`
  described a `register_my_player` signature the database no longer has. **An inverted
  claim is worse than an omission, because an omission looks like an omission.** Same
  shape as the "DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT" note that survived a day past
  the unique index being created.

**⚠️ A POWERSHELL PIPELINE CAN SILENTLY SWALLOW OUTPUT, AND IT LOOKS EXACTLY LIKE AN
EMPTY RESULT.** Chaining commands that emit **differently shaped objects** into one
statement — `Get-ChildItem | Select-Object Name` followed by
`Select-String | Select-Object Filename, LineNumber` — makes the formatter render only
the first shape and **drop the rest with no error and no warning**. On 11 Aug this
reported `register_my_player` as absent from a file containing twenty occurrences of it.
Two consequences:

- Emit one shape per statement, or force it with `Format-Table` / `Out-String` per command.
- ⚠️ **`(Get-Content f | Measure-Object -Line).Lines` DOES NOT COUNT BLANK LINES.** It
  reported 1,428 for a 1,573-line file, which reads as a plausible answer rather than a
  wrong one. Use `(Get-Content f).Count`.
⚠️ **`npm run docs:check` PASSING LOCALLY BEFORE YOU COMMIT DOES NOT PREDICT CI.** Its
coverage check runs `git log <baseline>..HEAD~1` — the `~1` is the deliberate allowance
that a commit cannot cite its own SHA. So running it in a dirty tree tests whether the
PREVIOUS commit is recorded, not the one you are about to write. The moment you commit,
your work becomes `HEAD~1` and CI demands its predecessor be cited. **Run it again after
committing, or expect a red `docs-check` on a PR that was green on your machine.**
⚠️ And the SHA only counts **at the start of a bullet** — the pattern is
`/^-\s+\`([0-9a-f]{7,40})\`/`. Naming a SHA mid-paragraph, however prominently, is
invisible to the check.

- ⚠️ **`Select-String -SimpleMatch` WITH A REGEX-ESCAPED PATTERN FINDS NOTHING, SILENTLY.**
  `-SimpleMatch` takes the pattern literally, backslashes included, so
  `-Pattern "rgb\(200 16 46\)" -SimpleMatch` hunts for a string containing actual
  backslash characters and returns zero. It looks exactly like the content being absent —
  and on 11 Aug it was briefly read as a failed `git checkout --` restore. **Escape, or
  use `-SimpleMatch`. Never both.**

This is `CLAUDE.md` rule 6's "confirm the search can find something you know is there" in
a new costume — and the reason that rule is written as a *procedure* rather than a
caution. **Put a control in the input: a name that must be reported missing.** If the
control does not come back, the check is not running, whatever it printed.
- The files carry the notes that matter alongside the SQL: the deliberately-absent unique
  constraints on `memberships` and `invite_targets`, and a prominent header on
  `public.accept_invite` listing its five guards (signed in / token exists with
  `FOR UPDATE` / not already accepted / caller email matches / incomplete-invite check)
  that must never be weakened.
- `supabase_migrations.schema_migrations` is polluted and must not be trusted as a record
  of intent: **12 rows named `accept_invite_multi_target` are all stale** and each one
  reverts the function if re-run. The authoritative definition is the highest version
  number, `20260803150349 zzz_accept_invite_authoritative_do_not_overwrite` — the `zzz_`
  prefix is there so "the last one by name" is also the right one.

**`.superpowers/sdd/.gitignore` gets reset to `*` by tooling, repeatedly.** It silently
untracks the whole ledger. Do not fight it — stage the workspace with
`git add -f .superpowers/sdd/quins-v1-mvp/` every time.

---

## Infrastructure facts

- **Netlify:** project `quins-club-hub`, connected to GitHub, branch `main`,
  auto-deploys on push. ⚠️ **The branch is a Netlify UI setting, not `netlify.toml`**
  — it cannot be discovered from a clone. `CLAUDE.md` rule 3 is its home.
- ⚠️ **`adhjrt.com`'s bare root is a DIFFERENT, unrelated Netlify project**
  (`serene-gingersnap-1d0eb6`) — a tournament/registration app built from the separate
  repo `jayjmuir-hub/adhjrt`. **Never reuse, overwrite or reconfigure it.** This app owns
  the `app.` subdomain only.
- **Supabase Auth URL Configuration** must list every origin the app is served from.
  Redirect URLs have historically included `https://quins-club-hub.netlify.app/**` as a
  fallback. The app still builds `emailRedirectTo` / `redirectTo` from
  `window.location.origin` (`src/lib/auth.jsx`), and that value comes back to the hook as
  `data.redirect_to`, which becomes the `next` parameter.
  ⚠️ **This entry used to say a link "opened on an origin that is not listed fails at the
  redirect".** Emailed links no longer point at Supabase at all — they go to
  `/auth/confirm` on our own domain — so the failure mode has changed shape and
  **nobody has re-established what it now is.** `safeNext` would quietly send an
  unrecognised `next` to `/`. **Do not trust either version of this sentence without a
  live check.**

- **Supabase:** project `quins-club-hub`, ref `lusmshimxdcxpnrktlgz`, region
  `ap-northeast-1`, Postgres 17, status `ACTIVE_HEALTHY`. A second project `adhjrt-app`
  (`nnlfjbnoiyqcvxwbwsjf`) exists and is **not** used by this app.
- **Outbound mail is sent BY THE DATABASE, through two edge functions.** A trigger
  calls `net.http_post` (pg_net), the function reads its recipients back with the
  service role and sends one Resend call with everyone in `bcc`:
  `notify-approval` (`private.notify_pending_membership`, pending registrations) and
  `notify-pitch-request` (`private.notify_pitch_request`, pitch asked and answered).
  ⚠️ **BOTH MUST BE DEPLOYED WITH `verify_jwt: false`** — Postgres calls them with no
  user JWT, and with verification on the gateway rejects every call **before the
  function runs, silently**, because pg_net never reads the response. This repo has no
  Supabase CLI config file, so the flag **cannot be encoded in the repo at all**: the
  copies under `supabase/functions/` are documentation, and **the flag lives only at
  deploy time.** Redeploying without it silently kills every email.
  ⚠️ **Testing it needs the response BODY, not the status** — the gateway also
  returns 401 for a missing JWT, so a 401 alone proves nothing. The functions answer
  `unauthorised` in plain text; if you see JSON, verification is wrongly on.
  ⚠️ **They share ONE secret, `approval_notify_secret`**, on purpose — a second is a
  second thing to rotate and forget. Each has its own `*_notify_url` vault entry, and
  `pitch_notify_url` was DERIVED from `approval_notify_url` in SQL precisely so the
  host cannot drift and so no human handles the value.
  ⚠️ **Neither can fail its write, and neither reports failure anywhere a user
  sees.** Both swallow into `raise warning`. **The in-app queue or list is the record;
  the email is only a prompt to go and look.** Never describe these as reliable
  delivery.
  ⚠️ **Neither has, or can have, vitest coverage** — a Postgres trigger and a Deno
  function are not modules the suite imports. Live verification is the only check.
  **A safe way to prove a trigger fires without sending anything: insert inside a
  transaction and force a ROLLBACK** — the pg_net queue row is written in the same
  transaction, so the queue count goes up and then vanishes with everything else.
- **This repo is public.** No secret VALUE is committed and `.env` is ignored. Security
  rests on Supabase RLS, not on the code being hidden. Keep it that way.
  ⚠️ **This used to claim "no `sb_secret_` or `service_role` string appears in any tracked
  file", and that literal test is false** — `service_role` appears ~23 times in
  `db/schema/functions.sql` alone, all of them `GRANT EXECUTE ... TO service_role`, and
  `sb_secret_` appears in `CLAUDE.md` as a prohibition. **The security claim holds; the
  grep does not.** A test written as a string match is one someone will eventually run and
  wrongly believe.
  ⚠️ **And the risk is live, not theoretical:** a decision record written on 9 Aug carried
  the `APPROVAL_NOTIFY_SECRET` value in plain text so the next session could paste it. It
  lived in the Claude project, not the repo, and was redacted before being committed — but
  it was one commit from being public.
