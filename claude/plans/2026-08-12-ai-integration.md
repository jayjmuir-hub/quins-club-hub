# AI integration — the plan

**STATUS: NOT SHIPPED — TABLED BY JAY, 12 Aug 2026.** Written 12 Aug 2026.
His words: *"table 1 and 2 for now until i bring them back up again"*.

⚠️ **TABLED IS NOT REJECTED, AND IT IS NOT A QUEUE EITHER.** Do not start this,
do not propose starting it, and do not ask again — **Jay reopens it or it stays
closed.**

⚠️ **THE RULING THAT UNBLOCKED THIS IS UNAFFECTED AND STAYS IN FORCE.**
`claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md` — *"yes it
may"* — is a standing permission about the club's data. **Jay tabled the
BUILD, not the ruling**, and the two must not be collapsed into one. Anything
that ever sends club data to a third-party API still answers to that decision's
minimisation default and its field list, whether or not it comes from this plan.

⚠️ **NOTHING WAS BUILT, SO THERE IS NOTHING TO UNDO.** No Anthropic key exists,
no vault entry, no `ai-assist` edge function, no spend limit. **If this is
reopened, the two preconditions at the foot of this file are still the first two
steps** — Jay creates the key himself, and the spend limit is set BEFORE the
first call.

⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit.

## What unblocked this

`claude/state-of-play.md` recorded that **every** AI feature Jay had
brainstormed — Smart Comms, natural-language queries, match reports, auto
lineup — was gated on one ruling nobody had asked him for: **may children's
data leave the club for a third-party API?**

**Asked and answered, 12 Aug 2026: "yes it may."**
Recorded in `claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`,
which is the governing document for everything below.

⚠️ **"May" is permission, not a design.** That decision sets **minimisation** as
the standing default: each feature sends the least data that makes it work, and
every feature must be able to say exactly which fields it transmits. Photos,
contact details, medical notes and attendance history are **not sent** without a
separate conversation.

## The model: Claude Haiku 4.5 — Jay's call, 12 Aug 2026

`claude-haiku-4-5`. **$1 per million input tokens, $5 per million output**,
200K context, 64K max output.

⚠️ **THE MODEL ID IS A CONSTANT IN ONE PLACE, NOT A STRING PER FEATURE.** Six
features naming their own model is six places to miss when this changes, and the
one that gets missed is the expensive one. `AI_MODEL` lives in the edge
function.

⚠️ **HAIKU 4.5 DOES NOT TAKE THE `effort` PARAMETER, AND `thinking` USES THE OLD
`budget_tokens` SHAPE.** Sending `effort` errors. Do not copy a request body
from an Opus example — the request surfaces genuinely differ between tiers, and
this is the first thing that will break when somebody upgrades the model without
reading. The upgrade path is a decision, not a string swap.

⚠️ **Cost sanity, so nobody has to guess later.** A match report from one
fixture is roughly 1-2K tokens in and a few hundred out — a fraction of a US
cent. **The features that could actually cost money are the ones that send a
LIST**: every fixture in a season, every player in the club. Those are the ones
to cap and measure, not the single-record ones.

## Architecture: an edge function, and the key never reaches a browser

```
  browser  ──▶  supabase/functions/ai-assist  ──▶  api.anthropic.com
  (session)      (service role, vault secret)       (claude-haiku-4-5)
                        │
                        └── the FIELD ALLOWLIST lives here
```

⚠️ **THE API KEY MUST NEVER BE IN THE BUNDLE, AND THIS IS NOT A STYLE
PREFERENCE.** Anything a `VITE_` variable holds is in the JavaScript every
parent downloads. `VITE_SUPABASE_ANON_KEY` is fine there because it is public by
design and RLS is the real boundary; an Anthropic key is a billable credential
with no row-level security behind it. It goes in `supabase_vault`, the same
place `approval_notify_secret` lives.

⚠️ **AND THE ALLOWLIST HAS TO BE SERVER-SIDE FOR THE SAME REASON THE PITCH
EMAIL IS.** A client that assembles the prompt can be made to assemble a
different one — by a bug, or by anyone who opens devtools. The edge function
receives IDs and a feature name, reads the rows **itself**, and builds the
prompt from a field list written in its source. **What leaves the club is
decided by code in this repo, not by whatever the caller sent.**

⚠️ **`verify_jwt` STAYS ON — the opposite of the calendar feed.** The feed is
anonymous because a subscribed calendar client cannot authenticate; this is
called from a signed-in app, so the caller's JWT is what proves they are a coach
and not a stranger with the URL. ⚠️ **The function must then check what that
person may SEE** — an admin's key calling on behalf of a coach must not return
another squad's data. Reuse `private.can_edit_team`.

## The field allowlist, written down

| Field | Sent? |
|---|---|
| Player first name / full name | **yes**, where the feature names a player |
| Squad / age group name | **yes** |
| Fixture facts — date, opponent, venue, score, competition, round | **yes** |
| League team (`rcm_name`, `division`) | **yes** |
| Player **photos** | **no** |
| Parent/player **email, phone** | **no** |
| **Medical notes** (match sheets carry these) | **no** |
| Attendance history | **no** |
| Date of birth | not held by this app at all |

⚠️ **THE BOTTOM HALF IS A CONVERSATION WITH JAY, NOT A JUDGEMENT CALL.**
Widening it is a one-line change and impossible to undo — the data has left.

⚠️ **`match_sheets.medical_notes` IS THE TRAP IN THIS SCHEMA.** A match report
feature that naively selects `*` from a match sheet sends concussion notes about
named children to a third party. **Every query in the edge function names its
columns explicitly. No `select('*')`, ever, on the AI path** — which is the
opposite of the convention everywhere else in `src/data/`, and is why it is
written here in capitals.

## Features, in the order they should ship

### 1. Match report from a completed sheet — FIRST, and it is the smallest

**Input:** one fixture + its match sheet (score, tries, the 22 names, cards,
captain). **Output:** a few paragraphs a coach can paste into WhatsApp.

Why first: the data is already in the app as of today, the output is obviously
useful, and it exercises the whole pipeline — vault secret, allowlist, RLS
check, edge function, one screen — on the **smallest possible** payload.

⚠️ **NOT medical notes**, per the table above. The report is about the rugby.
⚠️ **The coach edits before sending. It is a DRAFT, never a publication** — the
same rule the pitch email follows, for the same reason: nothing here can know
whether it got a child's name wrong.

### 2. Smart Comms — a draft message to a squad

**Input:** the fixture, the squad name, and what the coach wants to say.
**Output:** a tidy message.

⚠️ **DRAFTS ONLY, AND IT NEVER SENDS.** The app already has a rule that the
approval email is "a prompt to go and look, never the record". A feature that
composed AND sent a message to parents would be the first thing in this app to
speak to families without a human reading it first. **Not without Jay saying so
explicitly**, and it is not in this plan.

### 3. Natural-language queries over the schedule

*"Who are we playing next Saturday?"*, *"how many home games left?"*

⚠️ **THIS ONE IS A SECURITY DESIGN, NOT A PROMPT.** The obvious build — hand the
model a database connection or let it write SQL — hands a language model the
job RLS does. **The model must never see a query it authored reach the
database.** Build it the other way round: the app runs the SAME `listEvents`
the Schedule screen runs, under the caller's own RLS, and the model only
summarises rows the person could already see. If it hallucinates a fixture, that
is a wrong answer; if it could reach a row RLS forbids, that is a breach.

### 4. Auto lineup — LAST, and possibly never

Suggest a 22 for a match sheet.

⚠️ **BLOCKED ON DATA THAT DOES NOT EXIST.** `attendance` had **zero rows** when
last measured, and a lineup suggested from nothing is a random 22 with a
confident tone. ⚠️ **AND IT IS THE ONE FEATURE WHERE A BAD OUTPUT HAS A
SAFEGUARDING EDGE** — front-row cover is a safety declaration on the RCM form,
not a preference. **A model must not be the thing that decides who can pack
down.** If this is ever built, front row stays a human tick.

## What has to be true before any of it ships

- [ ] **Jay creates an Anthropic API key and puts it in the vault himself.**
  ⚠️ Claude never handles it — the same rule as the `sb_secret_…` key. The
  click-by-click goes in a runbook.
- [ ] **A spend limit on the Anthropic account, set before the first call.**
  ⚠️ Not a nice-to-have: an unbounded loop against a paid API is the one failure
  in this whole app that costs money per second. Netlify's 15 credits a deploy
  is the current worst case; this is not bounded that way.
- [ ] `db/tests/` harness proving the edge function refuses a caller who is not
  staff on the squad — **injected fault first**, per rule 6.
- [ ] A test asserting the allowlist: given a match sheet WITH medical notes,
  the assembled prompt does not contain them. ⚠️ **That test is the whole
  safeguarding story in one assertion** — write it before the feature.

## What this plan deliberately does NOT do

- **No AI writes to the database.** Every feature drafts; a human saves.
- **No AI message reaches a parent unread.** See feature 2.
- **No model-authored SQL.** See feature 3.
- **No photos, contacts, medical notes or attendance leave the club.**
- **No second model.** One constant, one tier, one place to change it.
