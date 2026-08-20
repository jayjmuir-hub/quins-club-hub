# Handoff — 20 Aug 2026, onboarding, and what a row is allowed to mean

**History, not instruction.** This describes a moment. Check anything here
against the code and the database before acting on it.

**Nine pull requests, #255 to #263**, most of them reacting to something Jay saw
on the live Accounts screen while real families were signing up around us.

## Where things are

| Squash | What |
|---|---|
| `e4f79a5` | the screenshot harness rendered every screen through the first-login gate |
| `8344ab6` | the install banner says "Download the App" |
| `407e5e4` | the clone check watches the main clone too |
| `2a4049e` | "Email confirmed" on the waiting list — column mirrored out of `auth.users` |
| `4452849` | `club_id` — approvals were failing outright — and "Hasn't said what they need" |
| `678ee8c` | the squads are asked on the FIRST screen, multi-select, and the ask is recorded |
| `e0340d2` | a request is no longer read as "nothing left to do" |
| `cb6c2b9` | a parent with no child on the roster can be approved, by adding the child |
| `4424a9a` | the follow-up emails for people who signed up and never finished |

Two migrations applied to production, one edge function deployed
(`notify-unfinished-signup`), one `pg_cron` job scheduled.

## ⚠️ THE ONE IDEA THIS SESSION KEEPS RETURNING TO

**Widening who writes a row silently changes what reading one means.** It caused
two separate defects today and nearly caused a third.

`access_requests` used to be written by ONE path — the "I help the club another
way" tick — so "has a request" honestly meant *waiting on an admin, nothing more
to ask*. `678ee8c` made the first screen write one for **everybody**.

1. **Within the hour**, `RollCall`'s mount check — `setStep(asked ? 'helper' :
   'ask')`, three files away, untouched — turned the sign-up screen into a DEAD
   END. A parent who chose their squads and closed the tab came back to
   `RequestAccess`, which is terminal, and could never add their child. Fixed in
   `e0340d2`. **It was found by Jay asking a question, not by a test.**
2. **The follow-up nudge would have repeated it** — "don't chase anybody who has
   a request" was the obvious rule and would have chased nobody, ever. The rule
   that survived is in `private.unfinished_signup_candidates`.

**The rule, written down so the next person does not rediscover it:**
any **membership row** (pending included) means they finished something —
registering a child and claiming a squad both write one; a **`volunteer`**
request IS the whole ask; a **dismissed** request means the club already said
no. Everything else with a confirmed email and no membership row is somebody who
was interrupted.

## ⚠️ TWO OF JAY'S OWN RULINGS WERE IN DIRECT CONTRADICTION, AND SHIPPED

The Accounts screen offered *"their children aren't on the roster yet"* for a
parent, which built a membership with `player_id` null. The database refuses
exactly that — `memberships_family_role_needs_player`, the 14 Aug ruling
*"nobody outside staff should be able to create an account without a player"*.

So the control **failed every single time it was used**, and the refusal came
from `src/data/members.js`, a layer the admin cannot see, which is why it read
as a mystery rather than as a rule.

⚠️ **THE SAME DEAD END EXISTED IN INVITES AND WAS THE CRUELLER OF THE TWO.**
`accept_invite` carries its own copy of the guard. On the Accounts screen the
ADMIN met the refusal at once; on an invite the admin saw success, the mail went
out, and the FAMILY hit the wall days later on a link that looked broken.

Both now do what the player role always did: add the person, then link.

## ⚠️ THREE GREEN TESTS WERE HOLDING BROKEN BEHAVIOUR IN PLACE

Not missing tests — **passing** ones, asserting the defect:

- `tests/access-new-player.test.jsx` demanded the new-player payload be
  **exactly** `{ full_name, team_id }`. It was green *because* `club_id` was
  missing, which is the column the database requires.
- `tests/accounts.test.jsx` asserted age-group rows with `playerId: null` for a
  parent — the row the CHECK constraint forbids — and gave its teams **no
  `club_id`**, a row that cannot exist.
- `tests/invite-form.test.jsx` pinned an invite that could never be accepted.

All three stayed green because `grantMemberships`, `createInvite` and
`upsertPlayer` are mocked, and the rules they broke only run in Postgres.
**A green test over a broken control is worse than no test.**

## Traps worth carrying forward

⚠️ **GREPPING THE DEPLOYED BUNDLE IS NOT A DEPLOY CHECK.** Twice I reported a
change live after finding a string in the published JavaScript that had been
there all along. **Compare the chunk hash** (`/assets/index-XXXX.js`) against the
previous deploy — that is the only thing that moves.

⚠️ **A REQUIRED FIELD CAN STRAND SOMEBODY, AND A TEST FOUND IT, NOT A REVIEW.**
The new squad picker demanded a choice that could not be made when the squad
list came back empty. `tests/parent-self-registration.test.jsx` renders exactly
that case. The requirement is now conditional on there being squads.

⚠️ **55 EXISTING TESTS BROKE WHEN THE FIRST SCREEN GAINED A MANDATORY FIELD, AND
ALL OF THEM WERE RIGHT TO.** The helpers find the picker by its **legend**, not
by a squad name, because the three files that drive it name their squads
differently.

⚠️ **THE HARNESS DEFAULT WAS THE BUG, NOT A MISSING KNOB.** Its stubs left the
gate's questions unanswered, so every scenario had to opt OUT of a sheet it never
wanted and none did. Defaults now describe a settled account, as
`name_confirmed_at` and `phone` already did.

⚠️ **THE CLONE CHECK WAS POINTED AT THE WRONG FOLDER.** Sessions run in linked
worktrees, which are cut fresh from `origin/main` and cannot be stale — so the
one folder it never looked at was the only one that could rot, and had, by 35
commits. It now checks both.

## Still open

- ⏰ **THE FIRST FOLLOW-UP EMAIL HAS NEVER SENT.** It fires daily at 07:10 UTC
  (11:10 Abu Dhabi) and one person qualified at the time of writing. **Nothing
  has ever gone out through this path** — check `public.signup_nudges` for a
  claimed row, and that it actually arrived. Claim-first means a row can exist
  for a mail that failed.
- **A real personal email address is hard-coded in `harness/stubs/`**, in a
  public repo, while every neighbouring stub uses the reserved `@adhq.example`
  domain.
- **`shoot-pending.mjs` blocks 4b and 4c** fill `#name-prompt-full-name` and
  click "Not now". Neither exists — the name split into two fields and the skip
  was removed. What they should assert today is a decision, not a repair.
- **Seven merged local branches and one stash** need clearing; the commands were
  refused by a permission rule and were handed to Jay.
- **Two parent-facing guides exist as published Artifacts, not in this repo** — a
  full walkthrough and a short setup one, both built from harness screenshots
  with invented data.
