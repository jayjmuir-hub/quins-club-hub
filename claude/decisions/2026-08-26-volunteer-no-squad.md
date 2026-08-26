# A volunteer's access request needs no squad

**26 Aug 2026 — Jay, reversing his own 17 Aug ruling.** "Helpers should skip
the squads."

## What changed

"I help the club another way", ticked **alone**, no longer asks for or
requires an age group — in the signup wizard and in the signed-in roll-call
both. The request is written with `requested_role = 'volunteer'` and null
team columns. Every other shape is untouched: parent, player and staff
claims still carry at least one squad, and ticking helper *alongside* any
of those still demands one.

## Why the old ruling fell

The 17 Aug decision (recorded in
`claude/plans/2026-08-16-account-creation-redesign.md`, "RESOLVED 17 Aug")
kept the squad requirement for volunteers on the reasoning that a
volunteer's squad means "who to ask about me". It also said relaxing it was
"the thing not to do quietly later" — and it was not done quietly: on
26 Aug a real committee member hit the wizard's "Choose at least one squad"
wall, the tombstone was read back to Jay with options, and he chose the
reversal in his own words.

What made it safe: the admin queue was never squad-scoped — the FOR ALL
policy on `access_requests` is `is_admin_anywhere()`, so a squadless
request is exactly as visible as any other, and the Accounts card already
renders an empty squad list without complaint. The 16 Aug "who are they"
rule loses nothing: name and role are still mandatory.

## Where it is enforced

- `needsSquads()` in `src/lib/signupIntent.js` — the ONE shape rule, used
  by the wizard and `RollCall` both. False only for the sole-helper tick.
- `db/migrations/20260826_volunteer_no_squad.sql` — the INSERT policy
  (`requested_team_id is not null OR requested_role = 'volunteer'`) and
  `private.handle_new_user`'s guard, which previously created **no request
  at all** for a squadless signup.
- Proven both directions by `db/tests/volunteer-no-squad.sql` — volunteer
  through squadless, parent still refused, parent-with-squad still through.
