# Runbook — prove the backup can actually be restored

**Status: NOT DONE as of 13 Aug 2026.** Until the log at the bottom of this file
has an entry, this club has **backups and no known recovery**, and nobody should
say otherwise.

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

## 3. In Supabase — create the scratch project

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

| Date | Backup dated | Row counts matched? | `auth.users` restored? | Policies / functions / RLS tables | Scratch project deleted? | Notes |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | **NEVER RUN. This is the finding, not a placeholder.** |

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
