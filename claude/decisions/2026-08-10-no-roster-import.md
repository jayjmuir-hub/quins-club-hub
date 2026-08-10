# There is no roster import — parents onboard themselves

**10 Aug 2026. Jay's ruling.** Recorded because the opposite belief was written
into `claude/state-of-play.md` as a live blocker, and every session was being told
to raise it with him.

## What was being asked, and the answer

`state-of-play.md` carried this:

> ⚠️ **NOBODY HAS RECORDED WHERE THE REAL ROSTER LIVES.** The 8 Aug wipe deleted
> the imported roster, and no document in this repo says where it is, in what
> format, or who re-imports it. **A rollout is blocked on that. Ask Jay.**

Asked. The answer is that the question had a false premise: it assumed the old
roster must go back in before anyone could use the app.

> "the real roster will eventually go in, most likely i will have parents just
> onboard without putting an old roster in"

So: **parents self-register, and the imported roster most likely never returns.**
The rollout is not blocked, and has not been blocked, on finding a spreadsheet.

⚠️ **Do not re-open this.** It is the kind of question that reads as diligence
every time it is asked and is simply noise after the first answer.

## ⚠️ What this promotes from "dormant" to load-bearing

This is the part worth more than the ruling itself. Several things were recorded
as harmless *because* a bulk import was assumed to be the real path. If
self-registration is the only way a player ever gets into the database, they are
on the critical path:

- ⚠️ **`register_my_player` picks 'player' or 'parent' from `teams.is_senior`,
  and there are no senior squads.** `state-of-play.md` files this as "dormant, not
  broken" — every self-registration currently creates a PARENT. That was a
  curiosity when import was the plan. It is now the behaviour of the primary
  onboarding path, and it is correct only for as long as the club is all youth.
  The moment a senior side is restored, it starts deciding roles for real.
- **The pending-membership → approval-email chain is now the onboarding
  mechanism**, not a convenience. `private.notify_pending_membership` calling
  `net.http_post` is what tells a coach somebody is waiting.
- ⚠️ **Resend's free cap therefore sits directly on the rollout.** Onboarding N
  families means at least N auth emails plus the approval traffic, and hitting the
  cap does NOT look like a limit — see the `429 daily_quota_exceeded` trap in
  `claude/state-of-play.md`. Lifting it is a purchase, so Jay does it.
- **Single-gender squad validation matters more.** A parent choosing their own
  child's squad is now the only thing standing between the roster and a wrong age
  group, where an import had a preview screen and an admin reading it.

## What this does NOT retire

**`src/screens/PlayerImport.jsx` and `src/lib/playerImport.js` stay.** They are
tested and working, and "most likely" is not "never" — an admin pasting one squad
is still the fastest way to seed a single age group. Treat them as an available
tool rather than the plan. ⚠️ **Do not delete them as dead code** on the strength
of this document.

## The consequence for the pre-pilot wipe

Unchanged and still required: the six `Test Player` rows, the seeded September, and
`auth.users` — nothing in the app can delete a LOGIN. See `claude/state-of-play.md`.
If anything, this ruling makes the wipe more important, because the first real rows
in `players` will now be created by parents rather than by an import that could be
re-run.
