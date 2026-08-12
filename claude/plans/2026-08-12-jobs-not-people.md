# Jobs, not people — the plan

**STATUS: SHIPPED 12 Aug 2026.**

⚠️ **One thing in this plan turned out to be wrong and the code does it
differently.** §4 proposed teaching `STALE_TERMS` to carry a `RegExp`. What
shipped is a **separate `RETIRED_NAMES` list** of regexes, left alongside the
string list rather than merged into it — because the two are scanned over
different file sets. The string terms are markdown-only; the names are scanned
in `src/`, `tests/`, `db/schema/` and `supabase/` as well. One list could not
have expressed that.

The ruling and its reasoning are in
`claude/decisions/2026-08-12-jobs-not-people.md`. This file is only the work.

## What changes, in one sentence

Three admin-right labels take Jay's wording, the prose around them moves so it
still reads as English, every human name in code and instructional docs becomes
the job name, and `scripts/docs-check.mjs` grows the ability to fail a build
that puts one back.

## 1. The labels

`ADMIN_RIGHT_LABELS` in `src/lib/scope.js` is the single source. The Accounts
tick-boxes read it through `adminRightLabel`, so they need no edit of their own.

| Right | Was | Becomes |
|---|---|---|
| `youth` | Youth Manager | Club Youth Manager |
| `media` | Social Media Manager | Social Media Management |
| `pitches` | Pitch Manager | Pitch Management |

⚠️ **Two of the three stop being job titles**, so every sentence that treated
them as one has to move. These are the only such sentences in the app:

| File | Was | Becomes |
|---|---|---|
| `src/screens/Allocation.jsx` | "You haven't been given the Pitch Manager job." | "Pitch Management hasn't been added to your account." |
| `src/screens/Pitches.jsx` | same | same |
| `src/screens/YouthDashboard.jsx` | "You haven't been given the Youth Manager job." | "Club Youth Manager hasn't been added to your account." |

The trailing sentence — "A super admin can add it on the Accounts screen" — is
unchanged and still true in all three.

## 2. ⚠️ The emails are NOT part of the Netlify build

`supabase/functions/notify-pitch-request/index.ts` carries the same phrasing
twice, in the submit mail and the answer mail:

> "You're getting this because you're a Pitch Manager for the club."

becomes

> "You're getting this because you look after Pitch Management for the club."

**That file is a Deno edge function deployed to Supabase, not code Netlify
builds.** Merging this pull request changes the app and leaves the email saying
the old words until the function is deployed separately. Either deploy it in the
same session or accept the gap knowingly — do not assume a green deploy shipped
it.

⚠️ **No vitest coverage exists or can** for that file, for the reason already
recorded against the pitch email in `claude/state-of-play.md`: a Deno function is
not a module the suite can import. The wording is verified by reading it and, if
deployed, by firing a real request.

## 3. The names

~60 occurrences across 21 files at the time of writing. **Measure again before
starting** — that count is from 12 Aug and this file has no business being
trusted on it.

**Rewritten to the job name:**

- `src/screens/Allocation.jsx`, `src/data/pitchRequests.js`,
  `src/components/AdminRightsEditor.jsx`, `src/screens/YouthDashboard.jsx`
- the matching test comments in `tests/`
- `db/schema/tables.sql` — a living capture, read as current truth
- `claude/decisions/2026-08-10-role-dashboards.md`, `claude/state-of-play.md`,
  `claude/changelog.md`

⚠️ **Left alone, deliberately:** `claude/handoffs/`, `claude/plans/` and
`db/migrations/`. Reasoning is in the decision record. A tombstone line goes at
the top of nothing — the decision record IS the tombstone, and it names where
the old words survive.

⚠️ **`claude/decisions/2026-08-10-role-dashboards.md` is the awkward one.** It is
a record of a moment and it names all three people, but it is also the document
every session is pointed at to understand what a right is for, and
`scripts/docs-check.mjs` does not treat `claude/decisions/` as history. Rewrite
the names there; the verbatim quote it carries from Jay contains none, so nothing
Jay actually said is edited.

## 4. Making it stick

`scripts/docs-check.mjs`, check 6. Two changes, and the first is a bug fix the
second depends on:

1. **`STALE_TERMS` must match on a word boundary.** It is
   `line.toLowerCase().includes(term)` today, so adding `Nick` would fail every
   line containing "nickname" and adding `Tracy` every line containing
   "tracysomething". Let an entry carry a `RegExp` instead of a string, keeping
   the two existing string entries working unchanged.
2. **Scan code, not only markdown.** Jay's call, 12 Aug: every current
   occurrence of a name in this repo outside the docs is a *code comment*, so a
   markdown-only gate would police the one place the rule was not broken. Add
   `src/`, `tests/` and `db/schema/` to check 6's file set for the name terms.
   ⚠️ `db/migrations/` stays exempt, as do `claude/handoffs/`, `claude/plans/`
   and `claude/archive/`.

⚠️ **Rule 6 applies to each new term separately.** Plant `Candice`, `Nick` and
`Tracy` in turn — one in a markdown file, one in a `src/` comment — confirm the
check goes red naming the right file and line, and remove them. **An injection
that fails to go red is data about the check, not a clean bill of health**, and
this repo has been caught by exactly that twice.

⚠️ **Also plant the false positive.** A line containing "nickname" must stay
green, or change 1 was not actually made.

## 5. The social-media gap

`media` keeps its tick-box and still unlocks nothing. Add a line saying so to
`claude/state-of-play.md` alongside the existing note that the social-media
dashboard was never started, so that granting it cannot be mistaken for
switching something on.

## Testing

`npm test` covers the label strings directly — `tests/super-admin.test.js`
asserts the exact three, and `tests/admin-rights-editor.test.jsx`,
`tests/allocation.test.jsx`, `tests/pitches-screen.test.jsx` and
`tests/match-sheets.test.jsx` all match on the old wording. **Those failures are
the point: they are the existing proof that the labels reach a screen.** Update
them to the new strings rather than loosening the matchers.

`npm run docs:check` must pass, and — see `CLAUDE.md` — must be run **after the
commit, not only after `git add`**.

## Out of scope

- Building anything behind Social Media Management.
- Any change to what a right permits. The rights gate screens, never data.
- `reynekeett@gmail.com` in `claude/state-of-play.md`. It is a login address
  recorded so a session does not flag it as a stray account, not a person's name
  standing in for a job.
