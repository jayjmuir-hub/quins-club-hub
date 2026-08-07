# Runbook — add an email alias to the club's shared mailbox (M365)

*Written 6 Aug 2026. Verified against Microsoft's current docs for the M365 admin centre.*

**Why this exists:** on 6 Aug the auth email `REPLY_TO` was set to
`admin@adhquins-clubhub.com`, which **had no mailbox behind it** — a reply produced
`postmaster: Undeliverable`. It was reverted to `noreply@adhquins-clubhub.com`, which is a
real shared mailbox. This runbook is the clean fix: make `admin@` an **alias** on that same
mailbox, so the friendly address works and lands in the inbox that already exists.

⚠️ **The lesson that caused this:** the address was set on the strength of "I think that
mailbox exists" rather than a test. **Prove a mailbox receives BEFORE pointing anything at
it**, not after. One outbound test email costs 30 seconds.

## Before you start

1. **In Windows:** open **Edge**, NOT Chrome. Chrome signs in as the personal `live.com`
   account and redirects into GoDaddy's cut-down console. Long-standing trap.
2. **In Edge:** go to `https://admin.microsoft.com`
3. **In Edge:** sign in as **`admin@quinsclubhub.onmicrosoft.com`** — the NEW tenant's
   admin, not `jayjmuir@gmail.com`. If the page looks GoDaddy-branded, it is the wrong
   account: sign out and back in.

## Part 1 — add the alias

4. **M365 admin centre:** left nav → **Teams & groups** → **Shared mailboxes**
5. **In the list:** click **`noreply@adhquins-clubhub.com`**
6. **In the flyout:** find **Email addresses** → **Edit**
7. **In the panel:** add `admin`, and pick **`adhquins-clubhub.com`** from the domain
   dropdown. ⚠️ Both `adhquins-clubhub.com` and `quinsclubhub.onmicrosoft.com` will be
   offered — the `.onmicrosoft.com` one is wrong here.
8. ⚠️ **Do NOT make it the primary address.** This is an *alias*. The primary must stay
   `noreply@adhquins-clubhub.com`; changing the primary changes what the mailbox SENDS as.
9. **Save.**

## Part 2 — make sure someone can actually read it

Easy to skip, and an alias nobody opens is no better than a bounce.

10. **Same flyout:** under **Manage mailbox permissions** → **Add permissions**
    (read-and-manage / Full Access) → add Jay's account → **Add**.
11. **In Outlook (web):** profile picture → **Open another mailbox** →
    `noreply@adhquins-clubhub.com`

## Part 3 — PROVE it receives

12. **Wait ~15 minutes.** Usually propagates in a couple of minutes; can take ~30.
13. **From Gmail:** send a plain email to **`admin@adhquins-clubhub.com`**.
14. **Confirm BOTH:** no `postmaster` bounce in Gmail, AND the message is visible in the
    shared mailbox from step 11.

**The "before" measurement already exists** — the 10:29 test on 6 Aug bounced with
`postmaster: Undeliverable`. So a delivery now is a real before/after on the same address,
not a hopeful green tick. Another bounce means it has not propagated yet, or step 7 picked
the wrong domain.

## Part 4 — only then, repoint REPLY_TO

15. **Supabase → Project Settings → Edge Functions → Secrets:** replace `REPLY_TO` with
    `admin@adhquins-clubhub.com`.
16. ⚠️ **Changing any secret REDEPLOYS the edge functions** (version bumps on both
    `send-email` and `calendar`). Confirm `verify_jwt` is still **false** on `send-email`
    afterwards — with it on, every auth hook call is rejected at the gateway and nobody can
    sign in.
17. **Verify on a real email**, not on the secret's digest: trigger a magic link and read
    the `reply-to` header in Gmail (open the message → the small caret under the sender →
    the details popup shows `reply-to`, `mailed-by` and `signed-by`).

## Why an alias, not a second shared mailbox

Both are free and unlicensed. A second mailbox is a second inbox to remember to check; an
alias lands in the one that already exists, so replies have exactly one destination.
