# Defederating the Microsoft 365 tenant from GoDaddy

**Status: planned, not started.** Decided 4 Aug 2026.

## Why

`adhquins-clubhub.com` cannot be added to the tenant. This was verified live, not assumed:
the Exchange admin centre's **Accepted domains** page says to use the Microsoft 365 admin
centre, and clicking **"Microsoft 365 admin center"** from inside EAC lands on
`productivity.godaddy.com/settings#/mailbox/<id>` — GoDaddy's own single-mailbox settings
page. Every route to the Domains page is intercepted. That is the documented GoDaddy
reseller restriction, reproduced.

Defederation moves tenant management from GoDaddy to Microsoft directly, which restores the
admin centre and with it the ability to add domains, create mailboxes and manage licences.

**The email work is downstream of this**, and only because of branding: the Club Hub should
not send from the once-a-year tournament's domain. If defederation ever stalls, a
transactional provider (Resend/SES) reaches the same end with no tenant involvement at all —
DNS records only. That remains the fallback and is not a bad outcome.

## What this tenant actually looks like

Small, which is why this is worth doing rather than frightening. Verified 4 Aug 2026:

| | |
|---|---|
| Tenant | `NETORG20906799.onmicrosoft.com` (the `NETORG` prefix marks a reseller-provisioned tenant) |
| Accepted domains | 2 — the `.onmicrosoft.com` default, and `adhjrt.com` |
| Mailboxes | 2 — `registrations@adhjrt.com` (**shared**, no licence) and `admin@adhjrt.com` (user) |
| Licensed seats | **1** |
| `admin@adhjrt.com` role | **Global Administrator** — confirmed in Entra |

So: one password to reset, one licence to re-provision. The published runbooks assume an MSP
with dozens of users; almost none of that applies.

## Timing

**Do it before tournament registrations open.** `registrations@adhjrt.com` sends the
tournament's confirmation emails via Microsoft Graph, and the event is 7–8 November 2026.
Jay confirmed on 4 Aug that registrations are not yet open — that window is the reason to do
this now rather than later.

## The order, and the one step that must not be got wrong

Follow the detailed commands in
<https://docs.tminus365.com/configurations/godaddy/defederating-godaddy-365>. This section is
the shape and the hazards, not a substitute for it.

1. **Prepare** — that means Jay, and only Jay. One account.
2. **Confirm Global Admin access.** Already true.
3. **Remove federation** — PowerShell with the Microsoft Graph modules, switching the domain's
   authentication from federated to managed.
4. **Reset the password.** After defederation, sign-in stops going through GoDaddy SSO and
   becomes a normal Microsoft sign-in. **Nobody can log in until this is done**, and any
   "keep me signed in" session ends.
5. **Buy a licence directly from Microsoft** (or a CSP) — one seat. Check what the current
   GoDaddy plan includes before picking, so nothing is silently lost. Exchange Online alone
   is cheaper than a full Business plan if mail is all that is used.
6. **Assign the licence** to `admin@adhjrt.com`. Expect activation prompts in Outlook during
   the swap.
7. **⚠️ REMOVE GODADDY'S DELEGATED ADMIN ACCESS.**
8. **Only then cancel the GoDaddy subscription.**

**Steps 7 and 8 are in that order for a reason.** Cancelling while GoDaddy still holds
delegated admin triggers an automated cleanup that **deletes all users and removes the
primary domain**. On this tenant that is `adhjrt.com` email gone — both mailboxes, including
the one the tournament sends from. There is no undo worth relying on.

Mail flow itself has no downtime during the procedure. The disruption is sign-in and licence
activation, not delivery.

## After it is done

1. **Microsoft 365 admin → Settings → Domains → Add domain** — `adhquins-clubhub.com`,
   verify with the TXT record at GoDaddy DNS.
2. **DKIM** for the new domain, then the two CNAMEs.
3. **Shared mailbox** `quinsclubhub@adhquins-clubhub.com` — free, and EAC already offers
   **"Add a shared mailbox"**, so this part was never blocked.
4. Resume `claude/runbooks/email-and-domain.md` from Part D (Entra app registration). The
   `send-email` Edge Function is already written, deployed and inert; it needs only the
   secrets and the hook enabled.

## Notes for whoever does this

**`admin@adhjrt.com` already holds Global Administrator**, so no privilege escalation dance
is needed — the usual "find the hidden `admin@<random>.onmicrosoft.com` account" step in the
published guides does not apply here.

**Entra was reachable throughout**, including App registrations and **Grant admin consent** —
tested 4 Aug. It is specifically the Microsoft 365 **admin centre** that GoDaddy intercepts,
not Entra and not Exchange admin. Worth knowing, because it means the Graph half of the email
plan was never the blocked part.
