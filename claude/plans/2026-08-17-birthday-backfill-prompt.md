# Asking existing families for the birthdays we added after they signed up

**STATUS: BUILT 17 Aug 2026, not yet merged. Jay answered the three questions
below with one decision: make it a HARD GATE, asked once, with no way past it
except entering the dates — "please add this info to continue".**

⚠️ **THAT ANSWERS ALL THREE AT ONCE AND MAKES THE SNOOZE COLUMN UNNECESSARY.**
There is no re-ask schedule because there is no skip; there is no recorded "I'd
rather not" because a birthday is already mandatory for every new registration
and this only makes the pre-16-August families match. **No migration was needed
after all** — not even the one the third question would have required.

⚠️ **AND IT CHANGES WHERE THE RISK SITS, WHICH IS WHY THE TESTS ARE WEIGHTED THE
WAY THEY ARE.** A skippable prompt that fires wrongly is an annoyance. A blocking
one that fires wrongly locks the club out of the app with no escape and no fix
short of a deploy. So the assertions that matter most are the ones about NOT
firing: the read fails open, a player-only account is exempt, an account with no
linked child is exempt, and a child with a birthday on file is left alone.

**Built:** the `birthday` step in `src/components/NamePrompt.jsx`, between
`player` and `role`. **Sign-out lives inside the sheet** — it is the only step on
that gate that cannot be answered "no", so it is the only one that needs an exit
of its own (`AppShell`: *"someone who cannot get in must always be able to get
out"*).

⚠️ **THE ABSENT-KEY TRAP THIS PLAN PREDICTED WAS REAL, AND THE TEST FOR IT WORKS.**
Injecting the blind version — checking only for a null value, not for a missing
row — turned **six** assertions red, including the one about the shape production
actually has. Injecting a fail-CLOSED read turned exactly one red, which is the
right precision for a single-behaviour assertion.

## The problem, measured

`player_private.date_of_birth` became required for NEW registrations on 16 Aug
2026 (`PlayerRegistrationForm` refuses to submit without it). Everybody who
signed up before that has no birthday on file, and **nothing asks them for one.**

Measured on production 17 Aug 2026 — re-run rather than trusting these:

| | |
|---|---|
| Players | 26 |
| Rows in `player_private` at all | **0** |
| Children with a birthday | **0** |
| Parent accounts who would be asked | **19** |

**Zero rows is the finding.** Not one family has filled it in since the field
became required, which is what you would expect from a chase that only appears
on a screen nobody visits.

## Why nothing is reaching them

There are two family-facing surfaces and neither works for this:

- **`NamePrompt`** is the only thing that pops up at sign-in. Its steps are
  `details` (name + phone), `player` ("do you have a child here?") and `role`
  ("do you do anything else at the club?"). **It never mentions a birthday.**
- **The completeness card** (*"Could you fill these in?"*, `src/lib/completeness.js`
  via `YourPlayers`) is the only place a birthday is asked for — and `YourPlayers`
  renders **only on `/more`**. A parent has no reason to open More.

⚠️ **`AdminNeedsAttention` says "Each family is already being asked on their own
screen", and that line is true in the letter and false in the effect.** It is
what made this look handled. Fix the wording when this ships.

## What to build

A **fourth step in `NamePrompt`**, reusing the machinery that already exists
rather than inventing a second prompt.

⚠️ **NO MIGRATION, AND NO NEW WRITE PATH.** `setPlayerDob(playerId, dob)`
(`src/data/players.js:319`) already upserts `player_private`, and that table's
RLS is *"staff for that squad, or the child's own family"* — so a parent can
already write their own child's birthday today. **If a migration appears in the
implementation, something has been misunderstood.** The only new read is
`listPlayerPrivate(playerIds)`, which `YourPlayers` already calls.

### The gate

Due when the account has at least one linked child with **no birthday on file**.

⚠️ **`playerIds` COMES FROM MEMBERSHIP ROWS CARRYING A `player_id`, NOT FROM THE
SQUAD.** The same rule `YourPlayers` documents: a coach can see thirty children
and none of them are theirs.

⚠️ **AN ABSENT KEY IS A MISSING BIRTHDAY; `undefined` IS NOT.** `listPlayerPrivate`
returns only rows that exist, and today **no rows exist at all**, so every child
is an absent key rather than a null value. `YourPlayers` handles this with
`dobs.get(id) ?? null` and the comment explaining why. Copy that, or this step
will never fire for the exact 26 children it exists for.

### Where it sits in the order

`details` → `player` → **`birthday`** → `role`.

After `player` because both are about the child, and before `role` because role
is about the adult. The existing fall-through
(`setStep(nameNeeded || phoneNeeded ? 'details' : playerNeeded ? 'player' : 'role')`)
becomes a four-way; each step must stay reachable **on its own**, which is the
common case here — every existing parent has a name, a phone and a child, and
needs only this.

### The step itself

One date field per linked child missing a birthday, each labelled with the
child's name. A parent with two children answers both without a second sheet.

⚠️ **PARTIAL ANSWERS MUST SAVE.** Two children, one birthday known — the known
one is written and the other stays due. An all-or-nothing save loses the answer
they did have.

⚠️ **IT MUST NOT WRITE `plays_up_confirmed_at`.** `setPlayerDob` takes a
`playsUp` flag that defaults false, and that column means *a parent ticked a box
agreeing to a play-up*. Setting it from here would invent an agreement nobody
gave — the exact failure PR #213 was about, in reverse.

⚠️ **ENTERING A BIRTHDAY MAY REVEAL A WRONG SQUAD.** `ageGradeCheck` exists and
the cut-off was fixed on 17 Aug (`b291df7`). A child whose birthday puts them in
a different age group is a real case, and this step is where the club will first
find out. **Do NOT block the save on it, and do NOT re-run the registration
consent flow here** — record the birthday, and let `/admin/needs-attention` and
the coach roster surface the mismatch. A parent typing a date should not be
ambushed into a play-up conversation.

## What must not happen

⚠️ **IT MUST STAY SKIPPABLE AND MUST NEVER BLOCK THE APP.** `NamePrompt`'s own
header states this and its sheet already behaves this way. A parent who wants to
check Saturday's fixture must be able to.

⚠️ **AND IT MUST NOT ASK FOREVER.** `YourPlayers` records the reasoning already:
*"A chase with no visible end is ignored by about the third sign-in, and once
ignored it is worse than nothing: it trains people to skip the one place the club
asks them for something."* This is the hardest part of the design and it is
question 1 below.

⚠️ **A PLAYER-ONLY ACCOUNT MUST BE EXEMPT**, the same way it is exempt from the
phone and role steps — `playerOnly` in `NamePrompt`. That account belongs to a
child, and asking a twelve-year-old to type their own date of birth into a
safeguarding field is the app not knowing who it is talking to.

## How it gets proved

- **A jsdom test per branch**: due / not due / partially due / player-only /
  already answered.
- ⚠️ **The fixtures must carry the ABSENT-KEY case, not just a null**, because
  that is the only shape production actually has today. A fixture with a
  `player_private` row whose `date_of_birth` is null would pass a broken gate.
- **Fault injection**: remove the gate condition and confirm the tests fail —
  the assertions in this repo that turned out to be asserting nothing were all
  found this way.
- ⚠️ **`tests/more.test.jsx` and `tests/accounts.test.jsx` membership fixtures now
  carry `status`** (17 Aug). Anything new here must too; a fixture missing a
  NOT NULL column is what hid the approval-gate hole.

## ⚠️ Three questions for Jay — this is not built until these are answered

1. **How often does it re-ask somebody who skips?** Every sign-in trains people
   to dismiss it. Options: once only; every sign-in until answered; or snooze
   for N days (needs one new column, e.g. `dob_prompt_snoozed_at`, which is the
   only thing in this plan that would need a migration).
2. **Can a parent say "I would rather not"?** The other two steps have an
   explicit "no" that is recorded (`no_player_confirmed_at`,
   `no_role_confirmed_at`). A birthday has no equivalent, and it is required for
   new registrations — so is declining a real answer here, or only a delay?
3. **Is 26 children across 19 families worth a prompt at all**, or is this a
   WhatsApp message and twenty minutes of typing? The prompt earns its place if
   the next required field is coming; it does not if this is the last one.
