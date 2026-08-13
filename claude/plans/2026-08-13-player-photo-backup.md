# Plan — backing up the player photographs

**STATUS: BUILT, NOT LIVE, NOT DRILLED — 13 Aug 2026.** Written 13 Aug 2026.
Jay chose Cloudflare R2 on a recommendation the same day; everything below the
vendor choice is design, not a ruling.

⚠️ **"BUILT" IS THREE STEPS SHORT OF "THE PHOTOGRAPHS ARE SAFE", AND THIS LINE
EXISTS SO NOBODY READS IT AS DONE.** The code and the SQL are written and the
suite covers the append-only rule and the request signing —
`supabase/functions/backup-player-photos/index.ts`,
`db/migrations/20260813_photo_backup.sql`,
`claude/runbooks/player-photo-backup.md`. **Nothing has run.** There is no
Cloudflare account, the migration is not applied, the function is not deployed,
`pg_cron` is not installed, and **no photograph has ever been copied or got
back.** Until §What "done" means below is satisfied in full, this feature
protects nothing.

⚠️ **THE VENDOR CHOICE PICKED UP A LIMIT NOBODY EXPECTED, and it is in the
runbook rather than here because it is operational: R2's API tokens are Object
Read only or Object Read AND WRITE, and write includes delete.** So append-only
is a property of the code, not of the credential. Bucket versioning plus Object
Lock is the real answer and is not done.

⚠️ **`npm run docs:check` does NOT validate the paths in this file** —
`scripts/docs-check.mjs` excludes `claude/plans/`. Every path below was read
on 13 Aug 2026; re-check before relying on one.

---

## Why this exists, in one line

**The photographs of children are the only unrecoverable thing in the club.**

`claude/runbooks/backup-restore-drill.md` proved the database restores. It also
proved what does not: **storage objects are not in the Supabase backup at all**,
only the database's metadata about them. A restored club therefore has every
player row pointing at an image that does not exist, and no way back.

Supabase Pro's daily backups do not change this and buying PITR would not
either. This is a gap in *what is backed up*, not in *how often*.

## The measurements this is sized against

Read off live on 13 Aug 2026. ⚠️ **Re-measure before citing** — every number
this repo has written down has rotted.

| | |
|---|---|
| Objects in `player-photos` | 6 |
| Total size | 420 kB |
| First object / latest | 12 Aug / 13 Aug 2026 |
| Other buckets with objects | none (`social-ideas` is empty) |

```sql
select bucket_id, count(*), pg_size_pretty(sum((metadata->>'size')::bigint))
from storage.objects group by bucket_id;
```

**~70 kB per photograph.** Jay expects 1500+ members once onboarding completes;
even if a thousand of them carry a head shot that is **well under 100 MB**.

⚠️ **SIZE IS NOT A CONSTRAINT ON THIS DESIGN AND MUST NOT BE TREATED AS ONE.**
Any argument that begins "but the storage cost" is answered by that number. The
constraints here are access control, restorability and whether a volunteer club
keeps the thing running — not gigabytes.

## What actually deletes a photograph today — measured, not assumed

`deletePlayerPhoto` (`src/data/photos.js`) is called from exactly two places,
`src/screens/MyPlayerForm.jsx` and `src/screens/PlayerForm.jsx`, and **both are
the same case: a head shot was REPLACED, so the previous object is tidied up.**

Consequences, and they shape the whole design:

- ⚠️ **Deleting a PLAYER does not delete their photograph.** Nothing on that path
  calls `deletePlayerPhoto`, and `delete from storage.objects` raises
  `42501 Direct deletion from storage tables is not allowed`. The file is
  orphaned in a private bucket and survives.
- **So the realistic loss is a REPLACEMENT**, which destroys the old image
  immediately and best-effort — `deletePlayerPhoto` deliberately swallows its
  error so a failed tidy-up cannot break a good save.
- The catastrophic losses are bucket-level: somebody empties it from the
  dashboard, or the project is lost.

## The design

**An append-only mirror of `player-photos` into a private Cloudflare R2 bucket,
copied by a scheduled Supabase Edge Function.**

### ⚠️ Append-only is the load-bearing decision, not an implementation detail

The backup copies new objects and **never deletes**. A mirror that faithfully
replicates a deletion is no protection against the most likely thing that will
go wrong, which is a deletion.

This means R2 accumulates images no longer referenced by any player row.
**That is the feature.** It also means R2 holds photographs of children who may
have left the club, which is a real cost and is why §Retention below is an open
question rather than a decision.

### Why R2, and the arguments against it

Chosen for **zero egress fees**, which is not a cost argument — it is a
*testing* argument. This repo's own lesson is that "we have backups" was an
untested claim until somebody drilled it, and that the drill's confident
prediction turned out wrong. A restore that costs nothing is a restore that
actually gets rehearsed. Also: 10 GB free (see the sizing above), private by
default, S3-compatible so nothing exotic is needed, and an account **the club**
owns.

⚠️ **The arguments against, recorded because somebody will make them again:**

1. **It doubles the number of places children's photographs live.** This is the
   strongest objection and it is not answered by encryption or by good
   intentions. Two stores means two access-control surfaces, two credentials and
   two ways to leak. The counter is that the alternative is not "one safe store",
   it is "one store and no recovery" — but the objection is legitimate and the
   R2 bucket must be treated as exactly as sensitive as the live one.
2. **Another vendor, another account, another credential nobody rotates.** A
   volunteer-run club accumulates these and they outlive the volunteer who set
   them up. Mitigated only by the account being club-owned and written down.
3. **A second Supabase project would be simpler** — one vendor, one mental model.
   Rejected because it shares the failure mode: an account-level problem takes
   both copies at once. It would still cover the *likely* case (a replaced
   photo), so this is a judgement call and not an obvious one.
4. **The cheapest way to protect children's photographs is not to hold them.**
   Worth stating plainly. The feature exists, parents are uploading, and that
   ship has sailed — but a future conversation about whether the app needs
   photographs at all should not be treated as reopening a settled question.

### Shape

- A Supabase Edge Function, scheduled. The repo already runs five and knows the
  traps — see `claude/runbooks/deploy.md`, and note the `verify_jwt: false`
  requirement recorded in `claude/state-of-play.md`.
- Each run: list `player-photos`, list what R2 already holds, copy the
  difference. **Idempotent** — a re-run copies nothing and is always safe.
- **No deletes, ever.** Not a flag, not a config option.
- ⚠️ **An edge function is NOT part of the Netlify build.** Merging this repo
  changes nothing about it; it is deployed separately. That has bitten before.

### Credentials

⚠️ **Jay creates the R2 account and the API token. Claude never creates
accounts and never handles credentials.** The token goes into Supabase secrets
and **never** into this repo, a commit, a tool call or a chat — this repo is
PUBLIC. If it is ever disclosed, including by pasting, it must be rotated.

Compare a token without revealing it using a SHA-256 fingerprint.

## What "done" means — and it is not "the function ran"

⚠️ **A BACKUP IS AN UNTESTED CLAIM UNTIL A RESTORE HAS BEEN DRILLED.** The
database drill on 13 Aug is the precedent, and its most useful outcome was that
the thing everyone predicted would fail restored cleanly. Reasoning is not
evidence here.

Done requires all four:

1. The function runs on a schedule and copies new objects.
2. **A restore drill**: take a photograph out of R2 and confirm it is
   byte-identical to the original, and that it can be put back into
   `player-photos` and render in the app.
3. ⚠️ **A DISCRIMINATING CHECK.** "There were files in R2" proves nothing. The
   drill must show a specific image that exists in R2 and **does not** exist in
   `player-photos` — i.e. one that was replaced after being backed up. That
   number cannot be produced by a mirror that is silently syncing deletions,
   which is the exact failure this design is built to prevent.
4. A line in `claude/runbooks/` saying how to restore, written for somebody who
   is not the person who built it.

## Open questions for Jay

1. **Retention.** Append-only means R2 keeps photographs of children who have
   left the club, forever. Is that acceptable, or does there need to be a
   deliberate purge — and if so, who decides and on what trigger? ⚠️ **This is a
   safeguarding question, not a technical one, and it is the one I would not
   answer on his behalf.**
2. **Frequency.** Daily is the obvious default. Photographs are uploaded rarely,
   so hourly buys little; but the window between an upload and the next run is a
   window in which the only copy can be destroyed by a replacement.
3. **Who else can reach the R2 account?** One volunteer holding the only
   credential recreates the single-point-of-failure this plan exists to remove,
   one level up.
4. **Does `social-ideas` get the same treatment?** It is empty today and holds
   images submitted for publication, so the argument is weaker — but it is the
   same class of content and the same gap.

## Not in scope

- Changing how photographs are uploaded, stored or displayed. `src/data/photos.js`
  and the `player-photos` storage policies are untouched.
- The orphaned-object problem (a deleted player's photo surviving). Recorded
  above as a measurement; tidying it is a separate decision, and note that doing
  so would **increase** what this backup protects against.
- Database backups. Those exist and are drilled.
