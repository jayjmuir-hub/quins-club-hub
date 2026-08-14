# Runbook — backing up, and restoring, the player photographs

**Written 13 Aug 2026 alongside the code. ✅ §1 IS DONE — THE BACKUP IS LIVE AND
RUNNING NIGHTLY. ⚠️ §3, the restore, has still NOT been drilled.**

✅ **Stood up 13 Aug 2026**, all of §1: R2 subscription, bucket
`quins-player-photos` (APAC, private, `retain-one-year` lock), an Account-scoped
Object Read & Write token limited to that bucket, four Supabase secrets, the
migrations applied, the function deployed with `verify_jwt: false`, and a
`pg_cron` job at 22:17 UTC. First run copied **6 of 6, zero failed**;
`etag_mismatches: 0`.

⚠️ **THE ONE THING NOBODY HAS DONE IS GET A PHOTOGRAPH BACK.** Copying is not
restoring. §4's drill is not complete and this feature should not be described as
proven until it is.

⚠️ **Two traps hit while standing this up, both now guarded against below:**
`R2_ACCOUNT_ID` was first set to the whole endpoint URL rather than the account
id (§1.2), and Supabase's secrets form shows a **confirmation dialog** when
replacing an existing secret — miss it and the value silently does not save,
which looks exactly like the fix not working.

**Why this exists, in one line: the photographs of children are the only
unrecoverable thing in the club.** `claude/runbooks/backup-restore-drill.md`
proved the database restores. It also proved what does not — storage objects are
not in the Supabase backup at all, only the database's metadata about them — so a
restored club has every player row pointing at an image that does not exist.

Design and the arguments against it:
`claude/plans/2026-08-13-player-photo-backup.md`.

## What has been built, and what it is worth

| | |
|---|---|
| `supabase/functions/backup-player-photos/index.ts` | The mirror. Lists both sides, copies the difference, deletes nothing |
| `supabase/functions/backup-player-photos/plan.ts` | The append-only rule, in the one file both Deno and vitest can load |
| `supabase/functions/backup-player-photos/sigv4.ts` | Request signing for R2's S3 API |
| `db/migrations/20260813_photo_backup.sql` | The object listing function and the run log |
| `tests/photo-backup-plan.test.js`, `tests/photo-backup-sigv4.test.js` | The suite's only edge-function coverage |

⚠️ **A GREEN SUITE HERE MEANS ALMOST NOTHING ABOUT THE BACKUP.** Nothing in it
touches Supabase Storage or Cloudflare. It proves the mirror cannot express a
deletion and that the signature is assembled as documented. **The claim "a
photograph can be got back" is made by §4 and by nothing else** — this repo's own
finding from the database drill is that the thing everyone predicted would fail
restored cleanly, and reasoning is not evidence.

---

## 1. Standing it up

### 1.1 Cloudflare R2 — **Jay**

⚠️ **Claude never creates accounts and never handles credentials.** Every value
produced here goes straight into the Supabase dashboard and **never** into this
repo, a commit, a chat or a tool call. This repo is PUBLIC. If a token is ever
pasted somewhere it should not be — including into a chat — say so and roll it.

1. Sign in to Cloudflare with **an account the club owns**, not a personal one
   that leaves when a volunteer does. (Open question 3 in the plan: who else can
   reach it? A backup only one person can restore is the single point of failure
   this exists to remove, moved up a level.)
2. **R2 → Create bucket.** Name it `quins-player-photos`. Location: pick the
   automatic hint. **Do not tick public access.** R2 buckets are private by
   default and this one must stay that way — it holds exactly the same
   photographs as `player-photos`, and the plan's strongest objection is that
   this feature doubles the number of places they live.
3. **R2 → Manage API tokens → Create API token.**
   - Permission: **Object Read & Write**
   - Scope it to the single bucket above, not to all buckets.
   - No TTL, or a long one — a token that silently expires makes the backup stop
     with no symptom anywhere except a run row nobody is looking at.
4. Copy, once, the three values Cloudflare shows: **Access Key ID**, **Secret
   Access Key**, and the **account ID** in the endpoint
   `https://<account-id>.r2.cloudflarestorage.com`. The secret is shown once.

⚠️ **THE TOKEN CAN DELETE, AND THE PERMISSION MODEL CANNOT PREVENT IT.**
Cloudflare's presets are Object Read only or Object Read **& Write**, and write
includes `DeleteObject`; there is no read-plus-create option.

✅ **SO THE GUARANTEE COMES FROM THE BUCKET INSTEAD, AND IT IS STRONGER THAN A
PERMISSION WOULD HAVE BEEN.** Bucket lock rule **`retain-one-year`**, no prefix,
**365 days**, applied 13 Aug 2026 while the bucket was still empty — so it binds
every object ever written. R2 itself refuses to overwrite or delete inside that
window: not this token, not a compromised Supabase project, not Jay, not a
scripted mistake. **`plan.ts` not being able to express a deletion is now the
second line of defence rather than the only one.**

⚠️ **AND IT CUTS BOTH WAYS — THIS IS THE COST, STATED PLAINLY.** A deletion
request ("please remove my child's photograph") **cannot be fully honoured in the
backup for up to a year.** Jay chose one year over ninety days knowing that. If a
parent asks, tell them the truth: the live copy goes immediately, the backup copy
expires on its own.

⚠️ **Set a lock BEFORE the first object lands.** A rule added later binds only
what is written after it, so the oldest and most irreplaceable photographs would
be the ones left unprotected.

### 1.2 Supabase function secrets — **Jay**

Supabase dashboard → **Project Settings → Edge Functions → Secrets**. Add four:

| Name | Value |
|---|---|
| `R2_ACCOUNT_ID` | ⚠️ **the account id ALONE** — the `something` out of `https://something.r2.cloudflarestorage.com`, with no `https://` and no `.r2.cloudflarestorage.com`. **This was set to the whole URL on 13 Aug and the function built a hostname out of a hostname**, failing with a DNS error. The only reason it took seconds to diagnose is that the function logs the URL it tried. |
| `R2_ACCESS_KEY_ID` | the access key id |
| `R2_SECRET_ACCESS_KEY` | the secret access key |
| `R2_BUCKET` | `quins-player-photos` |

⚠️ **REPLACING AN EXISTING SECRET SHOWS A CONFIRMATION DIALOG, AND MISSING IT
LOOKS EXACTLY LIKE THE FIX NOT WORKING.** Supabase asks "Confirm replacing
existing secret" and does nothing until you press **Replace secret**. On 13 Aug a
corrected value sat unsaved behind that dialog and the next run failed with the
identical error, which reads as "my change had no effect" rather than "my change
was never applied."

✅ **VERIFY A SECRET WITHOUT REVEALING IT.** The dashboard shows a SHA-256 digest
per secret. Hash the value you meant to store and compare:
`printf '%s' '<value>' | sha256sum`. A match proves both the content **and** the
absence of a trailing space — which is worth checking, because a key with a
stray space fails as `SignatureDoesNotMatch`, an error that reads like a wrong
credential rather than a formatting problem.

`APPROVAL_NOTIFY_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
already there and are reused. ⚠️ **The shared secret is deliberate** — same trust
domain, same caller, and a second secret is a second thing to rotate and forget.
It is the same reasoning `RESTORE.md` records for the three notify functions.

### 1.3 The migration — **Jay applies, Claude wrote**

Run `db/migrations/20260813_photo_backup.sql` in the SQL editor. Then re-capture
`db/schema/tables.sql`, `db/schema/functions.sql` and `db/schema/grants.sql` **in
the same commit** — `scripts/docs-check.mjs` fails the build if a migration
grants on a table the capture does not name, and `db/schema/README.md` records
what a late re-capture has cost twice.

### 1.4 Deploying the function

⚠️ **`verify_jwt: false`, and this is the trap that has bitten this project
before.** Postgres calls the function with no user JWT, so with verification on
the gateway rejects every call **before the function runs**, silently, because
pg_net never reads the response. The flag lives only at deploy time — this repo
has no Supabase CLI config, so it cannot be encoded anywhere in it.

⚠️ **An edge function is NOT part of the Netlify build.** Merging the pull
request changes nothing about it.

**Proving it deployed correctly, without sending anything anywhere:** call it
with a wrong secret and read the **body**, not the status.

```bash
curl -s -o - -w '\n%{http_code}\n' -X POST \
  https://lusmshimxdcxpnrktlgz.supabase.co/functions/v1/backup-player-photos \
  -H 'x-approval-secret: definitely-wrong' -H 'Content-Type: application/json' -d '{}'
```

`unauthorised` with a 401 means the request reached the function. **JSON means
the gateway answered and `verify_jwt` is wrongly ON.** A 401 alone proves
nothing — the gateway returns 401 for a missing JWT too.

### 1.5 The schedule — **Jay**

⚠️ **`pg_cron` IS NOT INSTALLED ON THIS PROJECT.** Measured 13 Aug 2026:
`installed_version` null. Enabling an extension on the production database is
Jay's call, so the migration deliberately does not do it.

Supabase dashboard → **Integrations → Cron → Enable**, which installs `pg_cron`.
Then, in the SQL editor:

```sql
-- The endpoint, DERIVED rather than typed, so the host cannot drift and nobody
-- reads, pastes or retypes a value. Same pattern as pitch_notify_url.
select vault.create_secret(
  replace(
    (select decrypted_secret from vault.decrypted_secrets where name = 'approval_notify_url'),
    'notify-approval', 'backup-player-photos'),
  'photo_backup_url',
  'Endpoint the photo-backup cron job posts to. Derived from approval_notify_url. Not a credential - the gate is approval_notify_secret.'
);
```

```sql
select cron.schedule('backup-player-photos', '17 22 * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'photo_backup_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-approval-secret',
                 (select decrypted_secret from vault.decrypted_secrets where name = 'approval_notify_secret')),
    body    := '{}'::jsonb);
$job$);
```

⚠️ **`22:17` UTC is a little after 02:00 in the UAE** — after the club has
stopped uploading for the day and before anyone is looking. The minute is odd on
purpose: nothing else in this project runs on the hour, so a coincidence in the
logs is not one.

**Daily, not hourly** — photographs are uploaded rarely. ⚠️ **The cost of daily
is stated plainly: the window between an upload and the next run is a window in
which the only copy can be destroyed by a replacement.** Jay's call; open
question 2 in the plan.

### 1.6 Confirm it is actually running

⚠️ **pg_net does not read the response, so a failing job is invisible from
cron.** `cron.job_run_details` will say the SQL succeeded whatever the function
did — it succeeded at *queueing* a request. The evidence is the run log:

```sql
select started_at, finished_at, source_objects, backup_objects,
       copied, failed, unrecognised, more_to_do, error
from public.photo_backup_runs
order by started_at desc
limit 10;
```

Read it as:

- **no row at all** → the job is not firing, or the secret is wrong. Nothing
  reached the function.
- **`finished_at` null on an old row** → the run started and vanished: a timeout,
  a deploy mid-run, or R2 hanging.
- **`more_to_do` true** → the run hit its cap with work left. Fine once; a
  standing backlog means the cap needs raising (`{"max_copies": 2000}` in the
  body of a manual call).
- **`failed` above zero** → per-object failures. The reason is only in the
  function's own logs, which Pro keeps for seven days.

---

## 2. Running it by hand

Both need the shared secret, which **Jay** supplies from the dashboard and which
never appears in this repo or a chat.

**A dry run — reads both sides, writes nothing, records nothing:**

```bash
curl -s -X POST https://lusmshimxdcxpnrktlgz.supabase.co/functions/v1/backup-player-photos \
  -H "x-approval-secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"dry_run": true}'
```

**A catch-up run with a raised cap:**

```bash
curl -s -X POST https://lusmshimxdcxpnrktlgz.supabase.co/functions/v1/backup-player-photos \
  -H "x-approval-secret: $SECRET" -H 'Content-Type: application/json' \
  -d '{"max_copies": 2000}'
```

The reply is the summary: how many objects each side holds, how many were
copied, how many failed, and **`only_in_backup`** — see §4.

---

## 3. Restoring — the half that matters

⚠️ **THIS PROCEDURE HAS NOT BEEN DRILLED.** Written to be followed by somebody
who did not build it; the parts that are guesses are marked as such.

### 3.1 Restore the database first, then the photographs

Object keys are `<player_id>/<timestamp>.<ext>` and `players.photo_path` stores
that key (`src/data/photos.js`). **The photographs are only findable through the
database**, so restoring them into an empty project buys nothing until the rows
are back. Database restore: `claude/runbooks/backup-restore-drill.md`.

⚠️ **THE KEYS MUST COME BACK IDENTICAL.** A restore that renames anything — a
different folder, a re-timestamped filename, a lower-cased extension — leaves
every `photo_path` pointing at nothing, and the app shows initials with no error
anywhere. It looks exactly like a club where nobody uploaded a photo.

### 3.2 One photograph — the everyday case

Somebody replaced a head shot and wants the previous one back.

1. Find the old key. It is in R2 and not in the source, which is what
   `only_in_backup` counts. Under the child's `player_id` prefix, the highest
   timestamp that is not the current `photo_path` is the one just replaced.
2. **Cloudflare dashboard → R2 → the bucket → navigate the prefix → Download.**
3. **Supabase dashboard → Storage → `player-photos` → open the `<player_id>`
   folder → Upload file.** ⚠️ **The filename must be exactly the old key's last
   segment**, and the upload must land in that folder and no other.
4. Set the player's photo back: on the roster, the coach or the parent re-picks
   it — or, if it must be done in SQL, write the restored key to
   `players.photo_path` for that player and nothing else.

### 3.3 The whole bucket — the disaster case

⚠️ **NOT REHEARSED AT THIS SCALE. Treat the commands as a starting point.**
`rclone` speaks both S3 and plain HTTP and is the least-worst tool; neither
Cloudflare's dashboard nor Supabase's will move hundreds of objects.

1. Configure an `rclone` remote of type `s3`, provider `Cloudflare`, endpoint
   `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, with the R2
   token. **Jay does this; the token is not handled by anyone else.**
2. `rclone copy r2:quins-player-photos ./restore --progress` — pulls every object
   into a local tree whose folder names are the player ids.
3. Upload each file back to `player-photos` at the identical key. There is no
   in-app mechanism and no SQL route — `insert into storage.objects` is refused
   the same way `delete from storage.objects` raises `42501`. The storage REST
   API with the service-role key is the only path, and **Jay runs it with his own
   key**, which never appears in this repo or a chat.
4. Confirm against the database rather than by eye:

```sql
select count(*) as players_with_a_photo,
       count(*) filter (where o.name is null) as photos_still_missing
from public.players p
left join storage.objects o
  on o.bucket_id = 'player-photos' and o.name = p.photo_path
where p.photo_path is not null;
```

`photos_still_missing` must be zero. ⚠️ **That query is the check, not a glance at
the roster** — a face that renders may be one of the five in someone's browser
cache.

### 3.4 What does NOT come back

- **Nothing uploaded since the last mirror run.** Up to a day, by design.
- **The bucket's own settings** — private, 5 MB limit, the three allowed MIME
  types — are database state, not objects. They come back with the database.
- **The storage RLS policies**, likewise.
- **Photographs deleted from R2 by hand.** The token can do it; see §1.1.

---

## 4. The drill — ⛔ TABLED, and still not done

⛔ **TABLED BY JAY, 13 Aug 2026: "table the restore drill until i bring it up
again". Do not start it, do not offer to, do not ask again.**

⚠️ **THE SECTION STAYS IN FULL, AND THAT IS DELIBERATE.** Tabling the work does
not retire the requirement — **nobody has ever got a photograph back, and until
somebody has, this backup is an untested claim.** Deleting or softening what
follows would turn a known gap into an invisible one, which is the exact failure
mode the whole feature exists to guard against. When Jay reopens it, this is
what to run.

⚠️ **A BACKUP IS AN UNTESTED CLAIM UNTIL A RESTORE HAS BEEN DRILLED.** The
database drill on 13 Aug 2026 is the precedent, and its most useful outcome was
that the thing the audit *and* the runbook both named as most likely to fail
restored cleanly. **Sound reasoning, wrong answer.**

Four things, all four required:

1. **It runs on the schedule and copies new objects.** A row in
   `photo_backup_runs` with `copied` above zero, from a run nobody triggered.
2. **A photograph comes back byte-identical.** Download one from R2, compare it
   to the source object, and put it back into `player-photos` and see it render
   in the app.
   ```bash
   # Same bytes, or the mirror is copying something that is not the photograph.
   sha256sum restored.jpg original.jpg
   ```
3. ⚠️ **THE DISCRIMINATING CHECK, because "there were files in R2" proves
   nothing.** Show an object that **is in R2 and is NOT in `player-photos`** —
   that is, a head shot that was replaced after being backed up. **A mirror
   quietly syncing deletions cannot produce that number**, which is precisely
   why it is the check. The function reports it as `only_in_backup`; produce it
   deliberately by uploading a replacement head shot for a test player after a
   run, then running again.
   ⚠️ **It is zero until the first replacement happens, and zero is not a
   failure — it is "not yet demonstrated". Do not tick this off on a zero.**
4. **Somebody who did not build it follows §3 and gets a photograph back.**

---

## 5. Rotating the R2 token

⚠️ **Do this if the token is ever pasted anywhere it should not be, including
into a chat.** Cloudflare → R2 → Manage API tokens → roll, then update the two
Supabase secrets, then run §2's dry run and confirm it does not 500. **The old
token keeps working until it is deleted; delete it.**

---

## 6. What this does not cover

- **`social-ideas`.** Empty at the time of writing and the argument is weaker —
  images submitted for publication, by adults, deliberately. Same class of
  content and the same gap. Open question 4 in the plan; the function mirrors one
  bucket and adding a second is a decision, not a flag.
- **Retention.** Append-only means R2 accumulates photographs of children who
  have left the club, indefinitely. ⚠️ **That is a safeguarding question for the
  club, not a technical one**, and it is the one thing in this feature nobody
  should answer on Jay's behalf.
- **Monitoring.** Nothing alerts on a failed run. The run log is a place to look,
  not a thing that tells you. This is the same gap `claude/state-of-play.md`
  records for the club as a whole.
