# Runbook — prove the backup can actually be restored

✅ **DONE 13 Aug 2026. THE RESTORE WORKS — MEASURED, NOT ASSUMED.** See the log at
the bottom for the numbers. This file was written the same day saying *"until the
log at the bottom has an entry, this club has backups and no known recovery"*, and
that sentence was true for about four hours.

⚠️ **BUT "THE RESTORE WORKS" IS NARROWER THAN IT SOUNDS, AND §What does NOT come
back IS THE PART TO READ.** The database comes back whole. **No player photograph
does**, and neither do the five edge functions. A recovery that stops at the
restore leaves a club with every record intact, no photos, no calendar feed and
no email.

---

## Why this file exists, in one paragraph

Supabase Pro was bought on 13 Aug 2026 and daily backups with 7-day retention
came with it. That closed the mechanism half of the problem and **not the other
half.** This repo's standing rule is that a measurement nobody has taken is not a
fact, and its harsher cousin — *a check that has never failed is not a check* —
applies exactly here. **A backup nobody has restored is a belief.** The failure
mode is not "the backup is missing"; it is "the backup exists, is 40 KB, and
restores an empty schema", and you find that out on the worst day of the project.

⚠️ **This is the only item on the 13 Aug audit list whose failure is
unrecoverable.** Everything else is a bad afternoon.

---

## Before you start

| | |
|---|---|
| Time | ~30 minutes, most of it waiting |
| Cost | ⚠️ **A second Supabase project on a Pro org may bill.** Read §5 before you create anything, and delete it the same day. |
| Risk to production | **None, if you follow the order below.** You never restore INTO the live project. |
| Who does it | **Jay.** It needs the dashboard and it creates a project — Claude does neither. |

⚠️ **THE ONE WAY TO GET THIS WRONG IS TO RESTORE OVER PRODUCTION.** Supabase's
restore flow will happily target the live project. Every step below names the
project explicitly for that reason. If a screen does not say the name of the
scratch project, stop and re-read it.

---

## 1. In Supabase — confirm a backup actually exists

Dashboard → project **quins-club-hub** → **Database** → **Backups**.

You are looking for a list of dated daily backups. Write down:

- the **date and time** of the most recent one,
- how many there are.

⚠️ **If the list is empty, stop here and tell Claude.** Pro enables daily
backups but the first one is taken on the project's normal schedule, so a
project upgraded today may have none until tomorrow. That is expected on day
one, and it is also exactly what a broken configuration looks like — the only
way to tell them apart is to come back tomorrow and check again.

⚠️ **Do not confuse this screen with Point-in-Time Recovery.** PITR is a further
paid add-on, deliberately not bought (see `CLAUDE.md`). If the screen is offering
to sell you something, that is the thing it is offering.

---

## 2. Record what "correct" looks like, BEFORE restoring

In Supabase → **SQL Editor**, on the **live** project, run this and keep the
output somewhere you can read it in half an hour:

```sql
select 'players' t, count(*) from players
union all select 'teams', count(*) from teams
union all select 'events', count(*) from events
union all select 'memberships', count(*) from memberships
union all select 'profiles', count(*) from profiles
union all select 'match_sheets', count(*) from match_sheets
union all select 'calendar_tokens', count(*) from calendar_tokens
order by 1;
```

⚠️ **THIS IS THE HALF PEOPLE SKIP, AND IT IS THE HALF THAT MAKES THE DRILL MEAN
ANYTHING.** Without it you will look at the restored database, see rows, and
conclude it worked. **Seeing rows is not the test. Seeing the RIGHT NUMBER of
rows is the test** — and this repo has already been bitten twice by a short
answer that looked complete.

⚠️ **The numbers will not match exactly if anyone uses the app between the
backup being taken and you running this.** Expect the restore to have *fewer or
equal* rows, never more. A restored table with MORE rows than live means you are
looking at the wrong project.

---

## ⚠️ What does NOT come back — read this before trusting the pass

Taken from Supabase's own confirmation dialog on 13 Aug 2026, and from the
scheduled-backups page. **This is the half of recovery that a restore does not
do**, and none of it was written down anywhere before the drill.

| Not transferred | What that means here |
|---|---|
| **Storage objects** | ⚠️ **NO PLAYER PHOTOGRAPH IS RECOVERABLE.** The backup holds the database's *metadata* about each object — the row, the path — and not the file. A restore gives you every player record pointing at an image that does not exist. Supabase says so in a grey box on the Backups page: *"Restoring an old backup does not restore objects that have been deleted since then."* |
| **Edge functions** | All five — `calendar`, `send-email`, `notify-approval`, `notify-pitch-request`, `notify-access-request`. Until they are redeployed: no calendar feed, no sign-in email, no notifications. ⚠️ **And `verify_jwt: false` cannot be encoded in this repo** (see `RESTORE.md`), so whoever redeploys must know to pass it or every email dies silently. |
| **Auth settings & API keys** | The publishable key changes, so `.env` and Netlify both need updating. Redirect URLs, the Send Email Hook and its secret all need rebuilding. |
| **Database extensions and settings** | ⚠️ **The dialog says this and the drill contradicted it** — `pg_net` and `supabase_vault` both came across. Do not rely on either claim; check. |

**So a real recovery is:** restore → redeploy five edge functions with
`verify_jwt: false` → rebuild auth settings → repoint `.env` and Netlify →
accept the photos are gone.

⚠️ **The photos are a SEPARATE, UNSOLVED problem.** Nothing in this club backs
them up. They are the one irreplaceable thing in the system — a fixture can be
re-entered, a child's photograph cannot be re-taken retrospectively.

---

## 3. In Supabase — create the scratch project

❌ **THIS STEP IS OBSOLETE — DO NOT DO IT BY HAND.** Written before the drill,
and wrong: **Database → Backups → "Restore to new project"** creates the project
for you as part of the restore. Kept as a tombstone so nobody re-adds it.

⚠️ **The tab matters and is the one genuinely dangerous choice on that page.**
"Scheduled backups" and "Restore to new project" show the SAME list of dates with
the SAME `Restore` buttons. The first restores **over production**. Confirm the
tab is underlined before clicking anything.

⚠️ **Naming still applies:** put the date in it — `quins-RESTORE-DRILL-13aug`.
A project called `quins-test` is one you are still paying for in November.

⚠️ **It asks for a database password. Claude does not enter passwords into
fields, ever** — use "Generate a password" and let a password manager keep it.
The drill does not need the password afterwards; the restored project is
queryable through the Supabase MCP connection.

## 3b. (superseded) In Supabase — create the scratch project

Dashboard → **New project**.

- Name it something unmistakable: **`quins-RESTORE-DRILL-13aug`**. Put the date
  in the name. A project called `quins-test` is one you will still be paying for
  in November.
- Region: **ap-northeast-1**, the same as production. Not required, but it keeps
  the restore honest.
- Set a database password and let your password manager store it. ⚠️ **Do not
  paste it into a chat, a document or a commit.**

Wait for it to finish provisioning.

---

## 4. Restore the backup into the SCRATCH project

Supabase's restore-to-a-different-project flow is under **Database → Backups**
on the **live** project, and it asks you to choose a target.

⚠️ **READ THE TARGET FIELD OUT LOUD.** It must say
`quins-RESTORE-DRILL-13aug`. If it says `quins-club-hub`, you are about to
overwrite production with an older copy of itself. Cancel.

If the dashboard does not offer restore-to-another-project on this plan, use the
download-and-load route instead:

1. Download the backup file from the Backups screen.
2. In the scratch project → **Database** → **Connection string**, copy the
   **direct** connection string (not the pooler — a restore needs a real
   session).
3. On your PC, in PowerShell:
   ```bash
   psql "<scratch-project-connection-string>" -f "<downloaded-backup-file>"
   ```
   ⚠️ If `psql` is not installed, say so and Claude will write the alternative.
   Do not improvise with a GUI tool you have not used before — the failure mode
   is a partial load that looks finished.

---

## 5. Check the restore against §2 — the actual test

In Supabase → **SQL Editor**, now on the **scratch** project, run **the same
query from §2** and compare, row by row, against what you wrote down.

**Then run one more, because counts alone can hide a broken restore:**

```sql
-- Did the SECURITY-CRITICAL machinery come back, or just the tables?
select 'policies'  k, count(*)::text v from pg_policies where schemaname = 'public'
union all select 'functions',  count(*)::text from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private')
union all select 'rls tables', count(*)::text from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
union all select 'auth users', count(*)::text from auth.users;
```

⚠️ **`auth users` IS THE ONE MOST LIKELY TO SURPRISE YOU.** A restore that
brings back `public` and not `auth` gives you every player, every fixture and
**nobody who can sign in**. Whether Supabase's backup covers `auth` is exactly
the kind of thing this drill exists to find out rather than assume — so record
the number you get, whatever it is.

⚠️ **A zero anywhere in that second query is a failed restore even if the row
counts matched.** Tables without their policies is not a recovered database; it
is a recovered database with the locks taken off.

---

## 6. Delete the scratch project

Supabase → scratch project → **Settings** → **General** → **Delete project**.

⚠️ **Do this the same day.** ⚠️ **And check the DELETE dialog names the scratch
project, with the same care as §4.**

---

## 7. Write down what happened

Fill in the log below and commit it. ⚠️ **An undocumented successful drill is
worth almost nothing** — the next session has no way to tell it from a drill
nobody ran, which is the state this file is in today.

---

## Drill log

⚠️ **Record the numbers, not "it worked".** Every claim this repo has had to
retract was a verdict written where a measurement belonged.

| Date | Backup dated | Discriminating check | `auth.users` | Policies / functions / RLS tables | Deleted? |
|---|---|---|---|---|---|
| **13 Aug 2026** | 12 Aug 18:05 UTC | ✅ **6 `Test Player` rows** in the restore, **0** live | ✅ **8** restored (live 9 — one signup after the backup) | ✅ **53 / 39 / 21**, identical to live | ✅ same hour |

**Also measured on the restored copy:**

- ✅ `accept_invite`'s fifth guard **intact**. Worth knowing, given that guard has
  been silently reverted by a re-applied migration before.
- ✅ Both storage buckets (`player-photos`, `social-ideas`) **defined**, and the
  `storage.objects` metadata rows present.
- ✅ `pg_net` and `supabase_vault` **both installed**. ⚠️ **This CONTRADICTS the
  confirmation dialog**, which lists "database extensions and settings" under
  *needs manual reconfiguration*. The dialog is pessimistic here — but do not rely
  on that, it is one observation of one restore.
- ✅ **All four vault secrets DECRYPT** in the new project. This was the result
  most expected to go the other way: vault encryption is project-scoped, so the
  reasonable fear was four rows of unreadable ciphertext and every email silently
  dead after a recovery. Checked by **counting rows where `decrypted_secret is not
  null`** — never by selecting a value.

⚠️ **AND THAT LAST ONE HAS A SECURITY EDGE, RECORDED BECAUSE IT IS NOT OBVIOUS: a
restore reproduces the club's notification secret in READABLE form in a brand-new
project.** A backup is therefore exactly as sensitive as the live database,
secrets included. Anywhere one is stored, downloaded or shared has to be treated
that way.

### ⚠️ What the drill got WRONG about itself, worth more than the pass

- ❌ **The prediction was wrong.** This file and the audit both flagged
  `auth.users` as *"the one I'd bet on"* failing. It restored cleanly. **The
  reasoning was sound and the answer was still no** — which is the whole argument
  for running the drill rather than reasoning about it.
- ❌ **The procedure in §3 and §4 above was wrong when written.** It said to create
  a scratch project by hand and then restore into it. Supabase has a
  **"Restore to new project"** tab that provisions the project for you; the manual
  route is unnecessary. Steps corrected.
- ❌ **The cost estimate was wrong.** `get_cost` reported $10/month for a project.
  The restore dialog reported **Total $0**. Believe the dialog, delete it anyway.
- ⚠️ **The delete confirmation has a SILENT gate.** Typing the project name and
  pressing the button does nothing, with no validation message, until a reason is
  picked from the *"What made you decide to delete your project?"* list. Three
  clicks looked like a broken button. Pick a reason first.

---

## If it fails

**Do not fix it quietly and move on.** A failed restore is the most valuable
result this drill can produce and it must be written down before it is fixed —
including in the table above, as its own row.

Then, in order:

1. Say which of the two checks failed: row counts, or the policies/auth query.
   They have completely different causes.
2. Do **not** re-run the restore against production to "see if it works
   properly". That sentence is how a drill becomes an incident.
3. Until it passes, treat the club's data as **having no recovery**, and say so
   in `claude/state-of-play.md` rather than leaving the Pro upgrade to imply
   otherwise.
