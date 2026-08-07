# Decision — Club Hub email: all Microsoft, in a new US tenant

**Date:** 4 August 2026 · **Status:** decided by Jay
**Supersedes:** the "OPEN DECISION — sending provider" section of
`claude/handoffs/2026-08-04-email-domain.md`

> ⚠️ **This document was rewritten twice on the day it was written.** An earlier version
> recommended a split — M365 for mailboxes, Resend for the app. That recommendation was
> **wrong** and Jay caught it. The reasoning is preserved in the tombstone at the end,
> because the argument for splitting is not stupid and will be made again.
> A second correction: the tenant country was written as UAE on an assumption. It is
> **United States**. See below — that field is permanent.

---

## The decision

| Job | Provider |
|---|---|
| Jay's mailboxes on `adhquins-clubhub.com` + `techslower.com` | **Microsoft 365 Business Basic**, new **US** tenant bought direct from Microsoft, 30-day trial first |
| Club Hub magic links (transactional) | **The same tenant**, via Microsoft Graph `sendMail` with client credentials |

Cost: **~$84/yr** for one Business Basic licence ($7/user/mo, USD, after the 1 Jul 2026
rise from $6). US state sales tax may apply depending on the billing address. The app
sending is $0 on top — a shared mailbox needs no licence.

---

## ⚠️ Tenant country = United States. This is permanent.

**Verified against Microsoft's own answer:** a tenant's Country/Region **cannot be changed
after creation**. The only remedy is building a new tenant and migrating everything.

It locks four things:

- **Billing currency and tax**
- **Payment methods** — these *inherit* the tenant country. A card whose billing address
  is in a different country **will be rejected.**
- **Data residency** — which datacentre geo holds the data
- **Service availability**

**The decisive input is the billing address on the card, not nationality and not where the
club plays.** Jay pays with a **US card at a US billing address**, so the tenant is
**United States**. An earlier draft of the walkthrough said UAE; that was an assumption
drawn from his timezone and the club's location, and it was wrong.

**Consequences accepted:**

- Datacentres are in the US, ~200–250ms from Abu Dhabi. **Irrelevant for email**, which is
  asynchronous. Mildly sluggish for Outlook on the web, Teams and OneDrive.
- ⚠️ **If the club ever wants to own and pay for this subscription, it cannot.** A UAE club
  card cannot pay a US-country tenant. The club would need its own tenant. Accepted
  knowingly — this subscription is fundamentally Jay's, and serves `techslower.com` too.

**Data residency worry that does NOT apply:** the club's player records, including minors,
live in **Supabase, ap-northeast-1 (Tokyo)** — not in Microsoft 365. The tenant holds only
mailboxes. The only club data in it would be correspondence in the shared mailbox. Tenant
country is not the safeguarding question; Supabase's region is.

**Nothing technical changes with country.** Domain Connect, DKIM, SPF, DMARC and the app
registration behave identically either way.

---

## Why all-Microsoft, and why the earlier Resend recommendation was wrong

The Resend case was built when the only Microsoft option was the **GoDaddy-encumbered
tenant** — intercepted admin centre, `403`s on federation operations, an unknown
`SupportedServices` state, and PowerShell gymnastics to do what a button normally does.
Against *that*, three steps and $0 was clearly better.

**A clean tenant Jay owns removes almost all of it.** The recommendation was not
re-derived after the ground moved. That is the same failure this project already has a
lesson written about: reasoning from a conclusion instead of rechecking it.

**What actually decides it:**

1. **The Graph code already exists, is tested and is deployed.** 940 tests, the Standard
   Webhooks verification reviewed line by line, confirmed inert until secrets are set.
   Switching providers means rewriting the one function whose entire job is deciding
   whether to trust an unauthenticated caller. That is new work and new risk on
   security-sensitive code, spent to avoid a calendar reminder.
2. **The tournament app runs this exact pattern in production** and has for months. One
   mechanism across both projects, not two.
3. **Jay already carries a Graph client-secret expiry for adhjrt.** A second is not a new
   category of risk — it is the same discipline already required.
4. **Volume is not close.** Exchange Online allows 10,000 recipients/day per mailbox with
   a tenant ceiling in the thousands, and the External Recipient Rate limit Microsoft
   planned for 2025 was **cancelled outright in 2026** after customer pushback. Resend's
   free tier is **100/day**. A single announcement across 15 age groups would exceed
   Resend free and not trouble Microsoft. This was quoted as a footnote when it should
   have been a column.

---

## ⚠️ Two conditions attached to this decision

### 1. `New-ApplicationAccessPolicy` is not optional

`Mail.Send` as an **application** permission lets the registered app send as **any mailbox
in the tenant**. In the new tenant that now includes Jay's personal `techslower.com` mail.
It must be scoped to the single sender mailbox.

⚠️ **This is a live gap on `adhjrt.com` today.** The `23cedc8` commit message records that
the restriction "is still not applied" there — meaning the tournament app can currently
send as `admin@adhjrt.com`. Separate repo, separate job, but it is real and unfixed.

### 2. The client secret expires — 24 months maximum

This is the one genuine cost of the Microsoft path and it is not eliminated, only managed.
When it lapses the symptom is **nobody can sign in**, with no error surfaced anywhere.

- Set the secret to the full 24 months at creation.
- Schedule a reminder at ~22 months, in the Claude scheduled tasks, the moment it is created.
- Record the expiry date in `claude/state-of-play.md` as well — a reminder in one system
  only is a reminder that dies with that system.

---

## Cost comparison that informed the mailbox choice (verified 4 Aug 2026)

Jay's shape: 2 domains, 1–2 humans, several addresses.

| | Per year | Domains | Notes |
|---|---|---|---|
| **M365 Business Basic** | **~$84** | unlimited | Mail + Teams + 1TB OneDrive + Office web. $7/user/mo after the 1 Jul 2026 rise from $6 |
| Migadu Mini | $90 flat | unlimited, unlimited mailboxes | Mail only. 100 sent/day, 30GB |
| Google Workspace Starter | ~$84–100 | secondary domains OK | ⚠️ figure from a 2024 source; Google repriced Jan 2025. Range, not a number |
| Zoho Mail Lite | ~$12–24 | ⚠️ marketing copy says *one domain* — unverified for two domains | Cheapest. Mail only |
| Zoho free | $0 | one domain, 5 users | **No IMAP/POP.** Webmail + mobile app only |

Microsoft came out *cheaper than Migadu*, level with Google, and with far more included.
Only Zoho materially undercuts, and it is mail-only with an unresolved two-domain question.

**The earlier objection to buying M365 still stands and is not contradicted by this
decision:** buying a licence does not fix SPF or DKIM, and buying one *inside the old
tenant* was never possible. Buying a **new tenant direct from Microsoft** is a different
act, and a sound one.

---

## What did NOT change

**SPF, DKIM and DMARC are still required.** Every provider evaluated — Microsoft, Google,
Zoho, Migadu, Resend, SES — needs the same three record types published at GoDaddy. No
product sells you out of that. It was the blocker before this decision and after it.

What *is* easier: **Domain Connect**. In a tenant GoDaddy does not intercept, the Add
Domain wizard offers to write the MX, SPF and autodiscover records into GoDaddy DNS
directly, and the Defender DKIM page generates the two CNAMEs. Only DKIM stays manual.

---

## Sequencing

1. Sign up for the Business Basic trial. **Personal email, never a work/school account** —
   signing in with `admin@adhjrt.com` would bolt the subscription onto the GoDaddy tenant.
   **Country: United States.** Pick the `.onmicrosoft.com` name carefully — permanent, and
   it appears inside public DKIM records.
2. **Release `adhquins-clubhub.com` from the old tenant** with `Remove-MgDomain`. A domain
   verifies in exactly one tenant. `techslower.com` is clean — no `MS=` record, not in any
   tenant. Verified by DNS query, not assumed.
3. Add both domains via Domain Connect.
4. DKIM in the Defender portal, both domains.
5. Verify SPF/DKIM/DMARC **from outside DNS** before trusting any console tick.
6. Shared mailbox, app registration, access policy, Supabase secrets, enable the hook.

---

## 🪦 Tombstone — the split (M365 for mail + Resend for the app)

**Recommended and withdrawn 4 August 2026, within the hour.**

The proposal: mailboxes on M365, transactional mail on Resend at
`send.adhquins-clubhub.com`, on the reasoning that mailbox providers and transactional
services are different product classes and that the Graph client secret is a silent
single point of failure for sign-in.

**Why it was dropped:** it valued avoiding a calendar reminder above not rewriting
working, security-reviewed, deployed code. It also under-quoted Resend's 100/day free-tier
cap, which a single all-club announcement would breach.

**What was genuinely right in it, and should not be lost:**

- The subdomain point. **If a second sending provider is ever added, put it on a
  subdomain**, never the root. Two `v=spf1` records at one name is a spec violation and
  produces PermError. A subdomain still passes DMARC here *because* the root record uses
  relaxed alignment (`adkim=r; aspf=r`) — if anyone ever tightens that to `s`, subdomain
  sending breaks. Leave it relaxed.
- The product-class distinction is real. If Club Hub ever grows into genuine bulk mail —
  newsletters, fixture blasts to hundreds — Exchange Online is the wrong tool and
  Microsoft's own guidance points at Azure Communication Services or a third-party ESP.
  **The trigger to revisit is volume, not annoyance.**
- Resend remains the correct fallback if the Graph path stalls: DNS records only, no
  tenant involvement.

---

## Lesson

Two assumptions got written as instructions in this session — "the country is UAE" and
"you need a second provider" — and both were caught by Jay, not by me. The pattern is the
same one already recorded in the handoff doc: an inference from context stated in the
imperative mood reads exactly like a verified fact. **When writing a procedural step,
distinguish what was checked from what was assumed** — especially for a field that cannot
be changed afterwards.
