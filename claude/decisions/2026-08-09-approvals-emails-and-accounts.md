# Decision — squad approvals, approval emails, and the Edit person sheet (9 Aug 2026)

**Status:** live. Commits `0b30ebc` and `f7755a9`. Netlify deploy `6a785416`,
state ready. ✅ **The secret named at the bottom was set by Jay and the whole path
verified end to end on production later the same day** — a real registration produced
`{"sent":2}` and the test rows were deleted afterwards.

⚠️ **Written into the Claude project on 9 Aug and committed here later the same day**,
with the secret's VALUE removed — this repo is public.

## What Jay asked for, and what he chose

| Question | Ruling |
|---|---|
| Who approves | **Coach and Team Manager** for their own age groups. Not medic. |
| Email timing | **Immediate**, one per registration. Not a digest. |
| Admin editing | **A proper "Edit person" sheet**, not inline fields. |
| Schedule row click | **The detail sheet**, same as the Open button. |

## ⚠️ Approval is an RPC, and must stay one

The obvious way to let coaches approve is to widen the `memb manage` policy.
**Read what it is first:**

```sql
"memb manage"  FOR ALL  USING private.is_admin(club_id)
```

**FOR ALL** — SELECT, INSERT, UPDATE, DELETE — and **RLS grants ROWS, not
COLUMNS**. Adding a coach clause would also hand every coach the ability to
change anyone's **role** on their squad (including to `admin`), reassign them
to another team, and **delete** access. Approving a registration and
administering the club would become one permission.

So the policy is untouched. `public.approve_membership` is `SECURITY DEFINER`
with `status` as a **literal** in its SET list — there is no parameter through
which any other column could be written. The migration's guard **ABORTS** if
`memb manage` is ever found to be anything other than admin-only, because the
RPC is pointless the moment coaches can write the table directly.

Two SELECT policies scoped to `status = 'pending'` let staff see the rows and
the names they are judging, and nothing else. The row leaves their view once
approved — correct: it is no longer waiting.

**Medic is excluded**, though `can_edit_team` includes them. A medic may edit
that squad's players; admitting a stranger to a children's squad is not a
medical decision. `private.can_approve_team` is deliberately **not**
`can_edit_team` — do not simplify one into the other.

## ⚠️ A bug the obvious shape would have had

The old approval was a table UPDATE that read the row back with `.select()`. A
coach's new read policy only shows **pending** rows — so the instant they
approved one it would leave their view, the read-back would return nothing, and
a **successful approval would have been reported to them as a refusal.** The
RPC returns the row from inside `SECURITY DEFINER`, where that policy does not
apply.

## ⚠️ The false green in the first harness run

The first version of `db/tests/rls-squad-staff-approval.sql` looked the
membership id up **as the caller under test**. An unauthorised caller cannot
*see* the row, so the subquery returned NULL, the function raised *"That
registration no longer exists"* — and the test recorded a refusal. **Every case
passed. None of them reached the authorisation check.**

Ids are now captured **as owner**, before impersonation. A refusal only counts
if it quotes the authorisation message. Eleven cases pass, including that a
**parent cannot approve themselves** and a coach's direct UPDATE writes 0 rows.

## Routing

`/approvals`, deliberately **outside** `/admin`. `AdminDashboard` gates on
`isAdmin()` and renders `<Outlet/>`, so a coach opening `/admin/accounts` would
hit the parent's not-authorised card and never reach the screen at all.

**Not desktop-only** either — the Admin pill is `hidden desktop:flex`, and
approving is a two-second decision made on a phone. Entry point is a card on
**More**, shown to approvers who are not admins.

## The email

`AFTER INSERT ... WHEN (new.status = 'pending')` → `pg_net` → the
`notify-approval` edge function → Resend. A client-fired notification is one the
client can skip; the trigger is on the row.

**Three layers of "this cannot fail a registration":** `net.http_post` queues
and returns without waiting, the vault lookup warns rather than raises, and the
whole trigger body is wrapped in `exception when others`. The screen is the
source of truth; the email is a prompt to go and look at it.

### ⚠️ The volume ceiling — stated, not discovered later

Resend free is **100 emails/day**, 3,000/month.

**One send per registration, every recipient in `bcc`.** One per *recipient*
would be ~4× that: two admins and two coaches on a squad = 4 emails per
registration, and a 100-player onboarding weekend would need **400** — four
times the cap, with the failures landing on whoever registered last. Bcc'd, the
same weekend needs 100, which is **exactly** the cap.

**So a big onboarding day can still hit it.** A 429 is logged and swallowed;
the registration and the on-screen queue are unaffected. Before the pilot,
either stagger the onboarding or move Resend to a paid tier.

## The Edit person sheet

The **permission already existed and the fields did not.** The column grants
from 8 Aug have let an admin write `first_name`, `last_name` and `phone` on
another member since the day they landed. The screen read none of them, so it
edited the legacy `full_name` and had no phone control anywhere.

⚠️ `updateMemberProfile`, **not** `updateMyProfile` with a different id. The
difference is one column: `updateMyProfile` writes `name_confirmed_at`, which
records *the person stating their own name* and is what stops NamePrompt asking
again. An admin typing a name is not that.

⚠️ **Email is read-only as a database fact**, not a UI preference. The grants
for `authenticated` are an allow-list excluding it, so an update *including*
email fails the whole statement — a field for it would break saving the name
too. Verified live: an admin's rewrite of another member's email is refused
with `permission denied for table profiles`; their name and phone write fine
and `full_name` is rebuilt by the trigger. A coach's write matches 0 rows.

**A crash shipped in the first draft** and was caught by a test, not by reading
the code back: the access rows' aria-labels used `displayName`, declared inside
the `groups.map` callback. Moving the rows into the sheet moved them out of
that closure — `ReferenceError`, whole tree unmounted, **clicking any account
blanked the screen.**

## The hand step this needed — DONE

**In the Supabase dashboard → Edge Functions → Secrets**, `APPROVAL_NOTIFY_SECRET`
was set to the same value already held in Vault as `approval_notify_secret`.

⚠️ **The value is deliberately NOT written here. This repo is public.** Read it from
Vault (`vault.decrypted_secrets`) or the dashboard if it is ever needed again.

⚠️ There is **no MCP tool** for function secrets, which is why this was a hand
step. Until it was set the endpoint answered `503 not configured` and **no email
was sent** — verified live with curl, which also confirmed `verify_jwt` is
genuinely off (the MCP deploy tool defaults it back to true and did so once
before, on 6 Aug).

To check it after any redeploy: register a test player and watch Edge Functions →
`notify-approval` → **Logs** (the Logs tab, not Invocations — the MCP
`get_logs` query shows only the HTTP access log, which is how a 500 went
undiagnosed for an hour on 5 Aug).

## Still open

- `private.is_admin()` does not check `status`.
- `db/schema/` capture is stale for every migration since 8 Aug.
- After-midnight events still can't be entered (needs an end-date field).
- Nobody is emailed when an access *request* (as opposed to a registration)
  arrives — that queue is still screen-only.
