# Flagging a possible duplicate at APPROVAL — design

**31 Aug 2026.** A second duplicate reached the roster, and the guard added on
14 Aug (`db/migrations/20260814_registration_duplicate_guards.sql`) could not
have stopped it. This is the design for the check that would have.

⚠️ **EVERY NAME BELOW IS INVENTED.** This repo is public and its members are
mostly children. The spellings reproduce the real case exactly, which is the
only thing a worked example was ever for.

## What happened, and why the existing guard was blind to it

A parent registered a child in a contact squad on 13 Aug. On 31 Aug the child
registered HIMSELF from his own address, and a second roster row appeared. Both
memberships were approved; the club noticed, not the software.

The 14 Aug guard compares a `first token + last token` key, case-folded and
punctuation-blind. It sees through middle names and hyphens, which is what the
August cases needed:

    'Hamza Alkhatib'              -> 'hamza alkhatib'
    'hamza nabil alkhatib'        -> 'hamza alkhatib'   <-- middle name ignored

It is **exact string equality on the tokens themselves**, so it cannot see
through a different TRANSLITERATION of the same name:

    'Hamza Tarek Nabil Alkhatib'  -> 'hamza alkhatib'   (the parent typed this)
    'Hamsa Alkhatib'              -> 'hamsa alkhatib'   (the child typed this)

One letter apart, and the keys differ, so Guard 1 never looked twice. That is
not an oversight in the 14 Aug work — it is the variance a club with
Arabic-script and transliterated names produces, and nothing in the design had
met it yet.

## Why the check goes at APPROVAL and not at registration

The obvious move is to loosen the registration guard. It is the wrong place,
for a reason the 14 Aug migration already sets out at length: **the registering
parent cannot see the roster.** They hold a PENDING membership, and `player
read` requires an active one. So the registration-time message may not echo the
stored spelling — it can only answer yes/no about a string the person typed
themselves.

That constraint is survivable for an EXACT match. It gets worse the fuzzier the
matching becomes:

* A loose match with a vague message ("someone with a similar name…") gives the
  family nothing to act on and no way to tell a false positive from a real one.
* A loose match that DID name the existing row would turn a deliberately narrow
  yes/no oracle into "type a surname, learn who is in this squad".
* A false positive at registration **blocks a real family from joining** until a
  human intervenes. A false positive at approval costs an admin one glance.

The approver has none of these problems. They can already see every name in the
squad, so naming the suspected match discloses nothing they cannot read on the
next screen, and the match can be as loose as is useful.

⚠️ **The argument AGAINST, stated so nobody has to rediscover it:** approval is
LATER than registration, so the duplicate row exists by the time anyone is
warned. Accepted deliberately. The row is cheap to remove while the membership
is still pending, and the alternative — blocking at registration on a fuzzy
match — trades a tidy-up for a family who cannot register at all. **A missed
duplicate is a tidy-up; a false block is a family locked out.** That is the same
direction the 14 Aug migration chose when it made a NULL key fail open.

## Where the rule lives

A new pure module, `src/lib/duplicateMatch.js`, following the
`src/lib/completeness.js` precedent: one shared rule, no React, no network, and
unit-testable on its own.

It needs **no migration and no new database function.**

⚠️ **THIS SECTION CLAIMED IT NEEDED NO NEW READ EITHER, AND THAT WAS WRONG.**
The original text read: *"The Accounts screen already loads the roster it would
compare against — `listPlayers` at `src/screens/Accounts.jsx`."* It does not.
`players` is loaded **lazily**, only when an access builder actually opens,
deliberately so that ~315 rows are not fetched on every visit to the screen —
the comment above that state says so in as many words, and this design was
written without reading it. Matching against that state found an empty array
and the warning silently never appeared. **Measured with a probe during
implementation, not deduced afterwards.**

What shipped is narrower than either the claim or the obvious fix. A duplicate
is only ever looked for WITHIN one squad, so the queue reads **the pending
squads' rosters and nothing else** — a handful of rows per pending card. That
is the same "no wider than the decision" rule the effect's existing reads
follow, rather than an exception to it, and it leaves the lazily-loaded club
roster alone. Dates of birth then come from a second read over the matched
candidates only.

⚠️ **The lesson, which is not about React.** The claim "no new read" was
attractive enough that it went into a design document unchecked, and it was one
`grep` away from being known to be false. A performance argument about existing
code is a MEASUREMENT, not a recollection.

## The rule

Given a pending player and the roster, flag a candidate when **both** hold:

1. the LAST tokens are equal, after folding to lowercase and stripping accents
   and punctuation; and
2. the FIRST tokens are equal, OR within **edit distance 2**, OR one is a
   prefix of the other of at least three characters.

Date of birth is **corroboration only**. An equal birthday strengthens the
wording; it never raises a flag on its own.

That last sentence is load-bearing, and it comes from live data. A sweep of the
whole roster on 31 Aug found exactly one other same-squad, same-birthday pair,
and they are **twins** — same surname, birthday identical, first names four
edits apart. A rule that flagged on birthday alone would nag about a family
whose record is perfectly correct, every time anyone opened the queue.

Worked, against the invented spellings above:

| A | B | First-token distance | Flagged? |
|---|---|---|---|
| `Hamza Tarek Nabil Alkhatib` | `Hamsa Alkhatib` | 1 | ✅ yes — the case that got through |
| `Rowan Fairbairn` | `Reuben Fairbairn` | 4 | ❌ no — the twins |
| `Tom Smith` (U12) | `Tom Smith` (U16) | 0 | ❌ no — different squads, two boys |
| `Tom Smith` (U16) | `Tom Smith` (U16) | 0 | ✅ yes — someone ticked past the guard |

Scoped to the SQUAD, never the club, for the reason the 14 Aug migration gives:
brothers routinely share a surname, and two boys called Tom Smith in different
age groups are two boys.

## What the approver sees

One line on the pending card, positioned and styled like the existing
`Still missing:` line:

> **Possible duplicate** — Hamza Tarek Nabil Alkhatib is already in this squad.

and, when the birthdays match, `, and has the same date of birth` appended —
which is the sentence that turns "possible" into "almost certainly".

⚠️ **The Approve button is untouched.** The screen already states this rule
about its other annotation, and it applies with more force here: a fuzzy match
that leaves a real family waiting is worse than the duplicate it prevents.
Approving a flagged row must stay one click, because most flags will be right
and the admin will be approving the CONNECTION, not the row.

## Testing

Unit tests on the matcher, each proved against an injected fault:

* a transliteration pair one letter apart **flags**;
* a twin pair sharing surname and birthday **does not flag** — the fixture that
  discriminates, and the one the whole design turns on;
* the same name in two different squads **does not flag**;
* an identical name in the same squad **flags**;
* a nameless row, and a row whose name is punctuation alone, return no matches
  and do not throw.

⚠️ **The twins fixture is the one that matters.** A matcher that flagged on
birthday would pass every other assertion on this list. A test suite without
that case would report confidence in exactly the rule that makes this feature
annoying enough to be switched off.

## What this does NOT do

* It does not merge anything. Connecting an account to an existing roster row is
  still manual — no such function exists in the database, and adding one is a
  separate piece of work with its own permission argument to make.
* It does not touch `register_my_player`. The 14 Aug guard stays exactly as it
  is; this is a second net, further down, where the person reading it can see
  what they are being told about.
* It does not flag ACROSS squads, or on birthday alone. Both were considered and
  rejected above.
