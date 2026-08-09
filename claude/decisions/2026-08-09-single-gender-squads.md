# Decision — single-gender squads (9 Aug 2026)

**Status:** live. Commits `e19e21b` (rename + safeguarding fix) and `0c4dd7b`
(the gender rule). Database migrations applied and verified.

⚠️ **Written into the Claude project on 9 Aug and committed here later the same day.**
`CLAUDE.md` is explicit that a document not in the repo does not exist to a cloned
session — the same failure this repo already records against 4–7 Aug.

## What Jay asked for

The club's real 2026/27 squad list replaced the bare `U6`…`U18 Colts` names,
and "we need to be strict with the age groups that are only for boys and
girls".

## The ruling — TWO rules that point DIFFERENT ways

| Situation | Behaviour |
|---|---|
| Gender **blank** on a single-gender squad | **REFUSED** |
| Gender **contradicts** the squad | **ALLOWED**, with a loud warning |

⚠️ **The second is the one someone will eventually "fix". Do not.** The club
has had four women recorded in "Senior Men 2nd XV" — a real squad
arrangement, not a data error. Blocking it would make such a player
uneditable by anybody, *including whoever was trying to correct them*.

And the first has to exist, or the second is decoration: most players have no
gender recorded, so leaving the question unanswered is the path of least
resistance and it defeats the warning entirely.

## The squad list (18)

Single-gender — gender required:
`U12G QR`, `U14B Contact`, `U14G QR`, `U16B Contact`, `U16G Contact`,
`U18B Contact`, `U18G Contact`, `Senior Men 1st XV`, `Senior Men 2nd XV`,
`Women's XV`

Mixed — gender optional, exactly as before:
`U6 Tag`, `U7 Tag`, `U8 Tag`, `U9 Mixed Contact`, `U10 Mixed Contact`,
`U11 Mixed Contact`, `U12 Mixed Contact`, `U13 Mixed Contact`

The three senior sides stay (Jay confirmed when asked), renumbered 16–18.

## Two bugs the rename would have shipped

**1. The safeguarding one — `U12G QR`.** `src/lib/ageGroup.js` decides whether
a player may hold their own email and phone (Jay's rule, 3 Aug: U13 and above
may, below U13 may not, and the fields must not render at all). Its regex was
`/^u(\d{1,2})\b/i`. `\b` needs a word boundary after the digits; a **letter is
a word character**, so `U12G` produced no match, the band came back `null`,
and `allowsOwnContact` reads `null` as *"a senior side: adults"* → **true**.

A twelve-year-old girls' squad would have been offered the child's own contact
fields. `U14B/G`, `U16B/G`, `U18B/G` failed to parse too, but they are all 13+
so the answer came out right **by accident** — which hid the fault in every
case except the one that mattered.

Fixed: `/^u(\d{1,2})(?![0-9])/i` — allows a trailing letter, still refuses a
third digit, still cannot match "Senior Men 1st XV" on its "1".

**2. `name.includes('men')`.** The old gender rule matched substrings, which is
also true of "Development" and "Improvers". Nothing was named that yet, which
is the only reason it never misfired. Word boundaries now.

## ⚠️ The trap in the suffix pattern

**`U6 Tag` ends in a G.** The B/G suffix must **touch the digits**. Allow
anything between the number and the letter and every Tag squad in the club
becomes girls-only, and every parent of a six-year-old is asked for their
child's gender. Both the JS regex and the SQL one are anchored for this, and
both have a test that goes red if the anchor is removed.

## Where it is enforced

Four client paths — `PlayerForm` (coach/admin), `MyPlayerForm` (a parent's own
child), `AddYourPlayer` (self-registration), and the bulk paste importer. A
rule enforced on the one-at-a-time form and skipped on the 200-row paste is a
rule that applies to almost no rows in practice.

**And in the database.** `register_my_player` is the one function in the schema
that lets a person with *no membership* create rows, so a check living only in
a form is one that caller skips. New signature `(text, uuid, text default
null)`; the 2-arg version is **dropped**, because Postgres prefers an exact
arity match and a two-arg call would otherwise keep resolving to the unchecked
function.

## ⚠️ The rule is now written twice

`private.squad_expects_gender` mirrors `squadExpects()` in
`src/lib/gender.js`. **They must agree** — if they drift, a twelve-year-old's
squad gets classified one way by the form and another by the database.

- `tests/gender.test.js` pins the JS side against all 18 live names
- `db/tests/squad-gender.sql` pins the SQL side, reading the real `teams` table

## ⚠️ errcode 22004, not 22023

`src/data/members.js` maps `22023` to one generic sentence covering three other
guards. The gender-required message **names the squad**, which is the whole
reason the field became mandatory, so it raises `22004` instead and falls
through to the client verbatim. There is a test asserting the *absence* of a
mapping. Change the code and the parent starts seeing the wrong sentence.

## Verification

Production, inside a rolled-back transaction: blank refused (22004), matching
allowed, **contradictory allowed**, mixed squad allowed, `U6 Tag` allowed, junk
refused. Fault-injected — `squad_expects_gender` stubbed to `null` flipped the
blank case to ALLOWED, and the rollback restored the real function (checked
with `pg_get_functiondef`). Both form guards fault-injected: 2 tests red. Old
`ageGroup` regex restored: 8 tests red.

Netlify deploy `6a783fb6`, state ready.

## Still open (as at the moment this was written)

- The **approval queue emails nobody** when a parent is waiting. ✅ **Fixed later
  the same day** — `0b30ebc`.
- Approval is **admin-only**, not coach-or-admin. ✅ **Fixed later the same day.**
- `private.is_admin()` does not check `status`.
- `db/schema/` capture is stale for every migration since 8 Aug.
- After-midnight events still can't be entered (needs an end-date field).
