# Youth self-registration — a U13+ player registers themselves

**STATUS: SHIPPED** — 11 Aug 2026, commit `5979c21` (PR #41), live on
https://adhquins-clubhub.com. Migration `20260811085312 self_registration`.

⚠️ **This line said "NOT SHIPPED. …implementation follows in the same branch"
until the next commit, and the implementation was in the SAME COMMIT as the
plan — `5979c21` added this file and the migration and the screen together.** The
instruction it carried — "update this line the moment it lands" — could not be
obeyed, because the moment it landed was the moment the file was created.
`npm run docs:check` enforces that a plan STATES whether it shipped; it cannot
tell whether the statement is true. **If a plan is being committed alongside the
code it plans, write the status as SHIPPED in that commit** — a plan whose
status is a promise about the same commit is a promise nobody is left to keep.

## The question

A U16 or U18 player wants an account of their own rather than a parent making one
for them. Today they can — but the app calls them a Parent, and the club ends up
holding a child with no guardian on file.

## What is true today — measured 11 Aug 2026, not assumed

- **Every squad has `is_senior = false`.** All fifteen. The three senior squads were
  deleted on 10 Aug. Queried live, not read from a doc.
- **Both onboarding paths therefore assign `'parent'`.** `register_my_player` and
  `claim_roster_access` share one line:
  `case when team.is_senior then 'player' else 'parent' end`.
- **The role is cosmetic.** ⚠️ **No RLS policy distinguishes `'parent'` from
  `'player'`** — zero matches in `db/schema/policies.sql`. The only function naming
  them uses `role in ('parent','player')` (`private.is_own_player`), and `scope.js`
  treats them identically in `isOwnPlayer` and the own-players list. The difference
  is the word shown on screen.
- **`is_senior` is read in exactly two places** — those two functions — and nowhere
  in `src/`.
- **Nothing needs migrating.** `memberships` holds **0** rows with role `'player'`
  and **1** with `'parent'`; there are 8 players. This is the cheapest moment this
  change will ever have, and it will not stay that way.

## What already exists, and is being reused rather than rebuilt

- **`player_parents`** — name, relationship, email, phone, `is_primary`. Built 3 Aug
  for exactly this. ⚠️ **It already carries Jay's ruling in a comment: "NO 'at least
  one parent' constraint, deliberately (warn, never block)."** The decision taken
  today is the same decision, which is why this design does not fight the schema.
- **`MyPlayerForm`** — the linked person can already edit their own player's parent
  rows; `player_contacts` and `player_parents` have owner policies. **A
  self-registering player needs no new editing screen.**
- **`listParentsForPlayers`** — already answers "which of these players has nobody on
  file", already used by `YourPlayers.jsx`. It is not yet wired into any club-side
  view, which is the gap Part 3 fills.

## Decisions taken (Jay, 11 Aug 2026)

1. **Warn, never block.** A self-registering player gets full access immediately.
   No guardian requirement stands between them and the app.
2. **The club is told, not just the child.** A banner asking a teenager to act is not
   a safeguarding control on its own, so the absence is also surfaced club-side.
3. **U13 and above.** Seven squads: `U13 Mixed Contact` through `U18G Contact`.
   Below U13 nothing changes at all.

## Design

### Part 1 — the question at registration

`AddYourPlayer` gains one choice: **"Is this you, or your child?"**, shown only when
the chosen squad permits it. Answering *this is me* produces a membership with role
`'player'`.

⚠️ **The permission is a COLUMN on `teams`, never the squad's name.**
`self_registration_allowed boolean not null default false`, set true for the seven
U13+ squads by a migration that asserts the resulting count is 7.

**Why not parse `U13` out of the name:** `20260806_claim_roster_access.sql` records
the ruling — *"teams.is_senior, never teams.name. A squad rename must not be able to
hand an account a role it shouldn't have."* Deriving this from text would let a squad
rename silently change who may hold their own account. `squad_expects_gender` does
parse the name, and that is not a counter-example: it validates data quality, it does
not decide who gets an account.

⚠️ **`register_my_player` enforces it, not the screen.** The RPC takes a new
parameter and raises `42501` if self-registration is claimed for a squad where
`self_registration_allowed` is false. Hiding a control in the UI is presentation;
the refusal has to be server-side or it is not a rule. The role becomes:

```sql
case when p_self_register or team_row.is_senior then 'player' else 'parent' end
```

— keeping `is_senior` intact so a returning senior squad still behaves correctly.

### Part 2 — the nudge

A player-role membership whose player has **zero `player_parents` rows** sees a
banner pointing at the existing parent editor. Dismissible; it returns on the next
session. It never blocks a screen and never gates availability.

### Part 3 — the club-side flag

The Roster marks a self-registered player with no parent rows as **no guardian on
file**, reusing `listParentsForPlayers`. This is the half that does not depend on a
teenager acting on a banner.

## Out of scope, deliberately

- **No verification that the guardian address belongs to an adult.** It cannot be
  checked, and implying otherwise would be worse than not claiming it.
- **No change to squads below U13**, and no change to the parent-registering flow.
- **No new table**, and no change to `claim_roster_access` — a roster match means the
  club already put that email on the player.

## Verification

⚠️ **Each check must be proved against an injected fault (`CLAUDE.md` rule 6).** A
test that passes when the rule is removed is worse than none.

- **RLS harness** `db/tests/rls-self-registration.sql`: self-registration is refused
  for a squad with `self_registration_allowed = false`, and the refusal comes from
  that check rather than from an earlier guard — assert on the message, and confirm
  the same call succeeds once the column is true.
- **Unit**: the role is `'player'` when self-registering and `'parent'` otherwise;
  the choice does not appear for a U12 squad; the banner shows only with zero parent
  rows and hides once one exists.
- ⚠️ **The gender rule still applies and must not regress** — `U16B`/`U18G` demand a
  gender through the `B`/`G` suffix, whoever is registering.
