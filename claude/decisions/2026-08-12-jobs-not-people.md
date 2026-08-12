# Decision: the club's jobs are named, the people holding them are not

*12 Aug 2026. Jay's ruling. Reasoning, not current state — `RESTORE.md` and the
code win on what is true today.*

## The ruling

> "we aren't going to use human names anymore, only Club Youth Manager, Pitch
> Management, Social Media Management from now on"

Three jobs, three names, and those are the only words for them — in the app, in
code comments, in the decision records and in conversation.

| The job | The right in `src/lib/scope.js` |
|---|---|
| Club Youth Manager | `youth` |
| Pitch Management | `pitches` |
| Social Media Management | `media` |

## Why this is worth a record rather than a habit

A person's name in a comment is a fact with an expiry date nobody sets. It reads
as documentation and behaves as gossip: it goes stale the day the volunteer
changes, it cannot be checked by anything, and a reader who arrives later has to
find out who somebody was before they can read a ruling about pitch allocation.

Worse, it quietly asserts something the code does not. Nothing in this schema
ties a right to a person — `admin_rights` is an array of job names on a
membership, and a super admin holds all three implicitly. A comment naming an
individual describes one row of one table on one day and presents it as the
design.

The three names were used freely up to this point because the jobs were being
invented and the people were the clearest way to describe them. That stopped
being true the moment the jobs existed as rights in the schema.

## ⚠️ The names being retired, and the one place they may still appear

The retired terms are **Candice, Nick and Tracy**. <!-- stale-ok -->

They stay, untouched, in `claude/handoffs/`, `claude/plans/` and
`db/migrations/`. All three are dated records of a moment, `CLAUDE.md` already
defines the first two as history, and `apply_migration` strips `--` comments
before executing, so the database never held those words in the first place.
**Rewriting a record of a moment to match today's vocabulary is how a repo loses
the ability to say what it used to believe.** `scripts/docs-check.mjs` already
exempts the first two from its stale-term scan for exactly this reason.

Everywhere a session is told to ACT on — `src/`, `tests/`, `db/schema/`,
`claude/decisions/`, `claude/state-of-play.md`, `claude/changelog.md` — carries
the job name and nothing else.

## ⚠️ The labels are the wording Jay gave, and the grammar had to move to fit

The three labels were `Youth Manager`, `Social Media Manager` and
`Pitch Manager` — titles a person holds. Two of the three replacements name an
area of work instead. That mismatch was put to Jay before the change and he
chose the wording anyway, so the surrounding prose moved rather than the words:

- "You haven't been given the Pitch Manager job" became "Pitch Management
  hasn't been added to your account."
- "You're getting this because you're a Pitch Manager for the club" became
  "You're getting this because you look after Pitch Management for the club."

Recorded because the alternative reading — that somebody typed "Management"
where they meant "Manager" and the sentence was never re-read — is the obvious
one, and it would invite a well-meaning correction back to the old words.

## ⚠️ Social Media Management grants access to nothing, and that is the current state

There is no social-media screen. The `media` right is a tick-box on the Accounts
screen that unlocks no dashboard, which is exactly where `pitches` sat before
the pitch stack and where `youth` sat before match sheets.

It is kept visible rather than hidden so that the three jobs read as a set, and
because hiding it would mean the day a screen ships it has to be granted to
everyone who already thought they had it. **But nobody should grant it expecting
something to appear.** Same note in `claude/state-of-play.md`.

## What this does not decide

- **What the social-media dashboard is.** Still unspecified, still never
  started.
- **Anything about access.** The rights gate which dashboard somebody is SHOWN,
  never what the database will hand them — `claude/decisions/2026-08-10-role-dashboards.md`
  and the `pitches` RLS policy, which is plain `is_admin`, both say so. A
  rename cannot change a boundary that was never a boundary.
