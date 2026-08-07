# Session handoff — Quins Club Hub: email + new domain

**Date:** 4 August 2026 · **updated 4 Aug, session 2**
**Status:** ✅ Domain problem **solved**. ⚠️ Blocker unchanged: **email authentication
is broken and will send every magic link to spam.** Fix that before anything sends.
⏸️ **Sending provider undecided** — Resend vs Microsoft/Graph. Jay has the comparison.

---

## Read these first

- `CLAUDE.md` (repo root) — Jay's pointer file
- `RESTORE.md` — "How this codebase actually behaves"
- `claude/state-of-play.md`
- `claude/runbooks/email-and-domain.md` — **resume at step 3**, with the corrections below
- `claude/m365-federation-before-state.md` (project) — tenant capture + rollback material
- `claude/runbooks/defederate-m365.md` — ⚠️ **obsolete, see tombstones. Do not follow it.**

**Never answer from memory about current state.** `git fetch origin` before believing
anything. Jay works from two PCs.

---

## Opening move for the next session

1. **Get the provider decision first** (Resend vs Microsoft/Graph — table below). Everything
   downstream forks on it. Do not start step 4 of the runbook without it.
2. Re-check DNS for `adhquins-clubhub.com` — SPF, DKIM selectors, DMARC (values below).
   **Do not enable the Supabase email hook until SPF and DKIM pass.**
3. `git fetch origin`; compare `build/v1-mvp` against `3c6b12c` and the Netlify deploy id
   against `6a7197c5824b460008131f48`.
4. Ask Jay what `_transfer.b64` is — still untracked in a public repo root. Asked twice, unanswered.

**Do not re-open defederation, and do not propose buying an M365 licence.** Both were
examined in full on 4 Aug and both are dead. Two tombstones at the end say why, with the
evidence. If the argument surfaces again, read them before spending a token on it.

---

## Session 2 (4 Aug) — verification pass, no changes made

Everything below was re-measured from outside, not taken from the doc.

| Check | Expected | Actual |
|---|---|---|
| `origin/build/v1-mvp` | `3c6b12c` | ✅ `3c6b12c` |
| Netlify deploy id | `6a7197c5824b460008131f48` | ✅ same, `ready`, **unmoved** |
| Deploy's commit | — | `23cedc8` — the last non-`[skip ci]` commit |
| Netlify secret scan on that deploy | — | 278 files, **0 matches** |
| `adhquins-clubhub.com` SPF/DKIM/DMARC/MX | broken | ✅ **identical, nothing fixed** |

`[skip ci]` is confirmed working: four docs commits have landed on the deploy branch since
`23cedc8` and the deploy id has not moved. That is the verification pattern — the deploy id,
not the build log.

**Decisions taken this session:**

- **MX → point at Microsoft.** Jay chose option 1. See the blocking caveat immediately below.
- **Shared mailbox — NOT created.** Confirmed by Jay, not assumed.
- **`techslower.com` — unrelated.** Jay's own domain, nothing to do with Quins or the
  tournament. Do not raise it again. (It was still useful as a control; see below.)
- **Sending provider — still open.** Explained in full; Jay has not chosen.

---

## ⚠️ NEW BLOCKER on the MX decision — the domain isn't switched on for email

Found by checking whether the MX target Jay chose actually exists:

```
adhjrt-com.mail.protection.outlook.com           -> 52.101.50.1, 52.101.9.17, ...  ✅
adhquins-clubhub-com.mail.protection.outlook.com -> NXDOMAIN                       ❌
```

**There is nothing to point MX at.** Microsoft has not provisioned an inbound endpoint for
the new domain.

Most likely cause: `New-MgDomain` + `Confirm-MgDomain` adds and verifies a domain but does
**not** set `supportedServices`. The admin-centre wizard normally does that, and the wizard
is on the intercepted page. Exchange showing the domain as an Authoritative accepted domain
is **not** the same flag. Could also be provisioning lag — it was added the same day.

**Diagnose before touching MX** — in PowerShell 7:

```powershell
Get-MgDomain -DomainId "adhquins-clubhub.com" |
  Format-List Id, IsVerified, AuthenticationType, SupportedServices
```

If `SupportedServices` lacks `Email`:

```powershell
Update-MgDomain -DomainId "adhquins-clubhub.com" `
  -SupportedServices @("Email","OfficeCommunicationsOnline")
```

Then wait ~15 min and re-check that the MX hostname resolves **from outside DNS** before
changing anything at GoDaddy. Pointing MX at a name that does not exist bounces every
inbound message.

⚠️ **This only matters on the Microsoft path.** If Jay picks Resend, MX is a separate,
optional question about receiving replies and is not on the critical path at all.

---

## ⚠️ THE STANDING BLOCKER — email authentication

Re-verified 4 Aug against Google, Cloudflare and Quad9. **Unchanged. Not fixed.**

```
SPF    v=spf1 include:spf.em.secureserver.net ?all
DKIM   none — selector1/selector2._domainkey both NXDOMAIN
DMARC  v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net
MX     0 smtp.secureserver.net / 10 mailstore1.secureserver.net
```

That SPF authorises **GoDaddy's email-marketing IPs only**. There is no DKIM. And
`p=quarantine` is already published.

Note `?all` is **neutral**, not softfail. That matters: DMARC only passes on an SPF *pass*,
so neutral counts as a fail just as surely as `-all` would. The domain is instructing
receivers to quarantine its own sign-in emails.

**Required regardless of which provider is chosen.** This is not Microsoft-specific work.

### The fix — SPF (certain either way, on the Microsoft path)

**In GoDaddy DNS**, edit the *existing* `v=spf1` TXT at `@`:

```
FROM:  v=spf1 include:spf.em.secureserver.net ?all
TO:    v=spf1 include:spf.em.secureserver.net include:spf.protection.outlook.com ~all
```

Exactly **one** `v=spf1` record. Two is a spec violation and produces PermError.
On the Resend path the records come from Resend instead, typically on a `send.` subdomain,
which leaves the root record untouched — and relaxed DMARC alignment (`aspf=r`) still passes.

### The fix — DKIM, **not** via the Defender portal

The runbook says Defender portal. Use **Exchange Online PowerShell** instead: we do not know
whether `security.microsoft.com` is intercepted like `admin.microsoft.com` is, and this route
reads Microsoft's *actual* CNAME values rather than a constructed guess.

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline -UserPrincipalName "admin@NETORG20906799.onmicrosoft.com"

# Create the keypair but DON'T sign yet — the CNAMEs must exist in DNS first
New-DkimSigningConfig -DomainName "adhquins-clubhub.com" -Enabled $false
Get-DkimSigningConfig -Identity "adhquins-clubhub.com" |
  Format-List Selector1CNAME, Selector2CNAME, Enabled, Status

# ... publish both CNAMEs at GoDaddy, verify from outside DNS, THEN:
Set-DkimSigningConfig -Identity "adhquins-clubhub.com" -Enabled $true
```

Use the **break-glass** account, not `admin@adhjrt.com` — the latter round-trips through
GoDaddy SSO for no reason.

Leave DMARC at `p=quarantine`. It is correct *once mail actually authenticates*.

---

## ✅ New finding — the club domain is NOT entangled with GoDaddy

`techslower.com` (unrelated domain, same registrar) was queried as a control:

```
                    techslower.com        adhquins-clubhub.com
NS                  ns43/ns44             ns43/ns44             same
MX                  secureserver          secureserver          same
SPF                 ...secureserver ?all  ...secureserver ?all  same
DMARC               p=quarantine          p=quarantine          same
DKIM                none                  none                  same
```

Byte-identical. **Those GoDaddy MX/SPF/DMARC records are registrar boilerplate stamped on
every domain registered with GoDaddy.** They are not a mail service, nobody configured them,
and nothing is behind them.

Three consequences worth writing down:

1. **Jay bought no 365 on `adhquins-clubhub.com`** — confirmed by evidence, not just his word.
2. **Replacing that MX is completely safe.** There is no mailbox behind it to break.
3. **`adhquins-clubhub.com` is clean.** The GoDaddy entanglement is exactly one object — the
   federation trust on `adhjrt.com`'s tenant. It does **not** extend to these domains. Jay
   owns them outright; GoDaddy merely runs a DNS panel for them.

Point 3 matters for morale as much as for engineering. The recurring instinct that the club
domain is "stuck in GoDaddy" and needs escaping is what keeps resurrecting the defederation
plan. It is false. What stands between the club and working email is **three DNS records.**

---

## ⏸️ OPEN DECISION — sending provider

Both cost **$0**. Jay has had the full explanation; he has not chosen.

| | **Resend** | **Microsoft / Graph** |
|---|---|---|
| Cost | $0 (3,000/mo, **100/day**, 1 domain, 30-day retention) | $0 — shared mailbox needs no licence |
| Steps remaining | **3** — sign up, paste 3 DNS records, API key into Supabase | **6** — see runbook step 4 |
| Expiring credential | **No** | **Yes — client secret, 24 mo max. Silently kills sign-in** |
| Receives replies | **No**, send-only — needs a `Reply-To` | Yes, real club mailbox |
| Volume ceiling | 100/day is the binding limit | effectively none |
| Tenant involvement | **none** | app registration, admin consent, access policy |
| Code change | ~30 lines: Graph token + `sendMail` → one HTTP POST | none — already written |

**Recommendation on file: Resend.** The deciding factor is not step count, it is the
expiring client secret — it fails silently, a year later, and the symptom is "nobody can log
in" with no error anywhere.

**What does NOT change either way:** the SPF/DKIM/DMARC work above, and the inbound security
of `send-email`. The Standard Webhooks signature check — constant-time compare, five-minute
replay window, raw-text body, fails closed, 940 tests — is untouched by a provider swap.
Only the outbound call changes. It is a reversible door.

**If Resend is chosen:** `New-DkimSigningConfig`, the shared mailbox, the `SupportedServices`
fix and the MX change all become unnecessary. Resend generates its own records and has a
Verify button. Reply-To can point at Jay's own address initially and be changed later without
touching the sending path.

**If 100/day ever binds:** Amazon SES is $0.10/1,000 with no daily cap, same
DNS-records-only pattern, extra friction of a production-access request to leave the sandbox.

---

## ✅ What was achieved (session 1) — the domain problem is solved

`adhquins-clubhub.com` is a **verified** domain in the tenant.

| Check | Result |
|---|---|
| Added to tenant (`New-MgDomain`) | ✅ |
| TXT ownership verified (`Confirm-MgDomain`) | ✅ |
| Exchange admin → Mail flow → Accepted domains | ✅ Authoritative, Allow Sending: Yes |
| Inbound MX endpoint provisioned | ❌ **NXDOMAIN — see new blocker above** |

**Cost: £0.** Nothing defederated, no licence bought, no password reset, nobody locked out,
and ~AED 105 of prepaid GoDaddy service not forfeited.

### The route that works

The M365 admin centre is intercepted by GoDaddy and its Domains page is unreachable — real,
and reproduced. But **only the web console is blocked.** Everything was done via Graph:

```powershell
Connect-MgGraph -TenantId "d184153b-527c-4035-92cb-967af9d50d89" `
  -Scopes "Domain.ReadWrite.All","Directory.ReadWrite.All","User.Read.All","RoleManagement.Read.Directory"

New-MgDomain -Id "adhquins-clubhub.com"
Get-MgDomainVerificationDnsRecord -DomainId "adhquins-clubhub.com" | Format-List *
#   -> TXT, name "@", value "MS=ms36218624"
Confirm-MgDomain -DomainId "adhquins-clubhub.com"
```

DNS for all three domains is at **GoDaddy** (`ns43`/`ns44.domaincontrol.com`).

---

## What GoDaddy actually blocks — tested, not assumed

| Operation | Result |
|---|---|
| General directory write (`Update-MgUser`) | ✅ works |
| **Add a domain** (`New-MgDomain`) | ✅ **works** |
| Verify a domain (`Confirm-MgDomain`) | ✅ works |
| Delete `adhjrt.com` federation config | ❌ **403 `Authorization_RequestDenied`** |
| M365 admin centre → Domains | ❌ redirects to `productivity.godaddy.com` |
| M365 admin centre → Billing | ❌ same interception — see tombstone 2 |

GoDaddy **owns the federation trust object** on `adhjrt.com`, and Microsoft will not let a
customer delete a partner-owned federation config regardless of role — confirmed against a
verified Global Administrator. A narrow protection, not a tenant-wide lock.

Corroborated by r/msp: *"GoDaddy has a direct relationship with Microsoft that gives them a
level of ownership of all NETORGFT tenants."* This tenant is `NETORG20906799`. GoDaddy is a
**syndication** partner here, which is an older and deeper arrangement than an ordinary CSP
reseller — that distinction is the reason the DIY guides do not apply.

---

## Corrections — claims in earlier docs that are FALSE

1. **"`adhquins-clubhub.com` cannot be added"** — false. Only the *web console* route was
   ever tested. Graph works. This one untested assumption put a paid, irreversible tenant
   migration on the table.
2. **"Exchange Online Plan 1 is cheaper than GoDaddy Email Essentials"** — false.
   GoDaddy: **AED 114.48/yr**. Moot: **no licence is needed at all.**
3. **"Conditional Access is blocking Graph PowerShell"** — false. The tenant has **zero**
   CA policies and isn't licensed for the feature.
4. **`Update-MgDomain` to flip `authenticationType`** — wrong cmdlet. Correct one is
   `Remove-MgDomainFederationConfiguration` (which then 403s for the real reason above).
5. **⚠️ NEW — "`secureserver.net` publishes no SPF record → PermError"** — overstated.
   What is actually observable: TXT queries for `secureserver.net` **time out** from Google,
   Cloudflare and Quad9, and from the authoritative servers directly, while `SOA` for the
   same name and `TXT` for `spf.em.secureserver.net` answer instantly on the same path. A
   dropped query is a **TempError** under RFC 7208, not a PermError — receivers typically
   *defer* rather than reject. TCP retry could not be attempted from the cloud sandbox, so an
   oversized-response cause is not ruled out. **Still broken, mechanism unconfirmed.**
   `adhjrt.com` only — tournament work, not this app.

---

## Graph PowerShell — environment notes that cost real time

- **PowerShell 7 only.** 5.1 installs the modules but `Import-Module` silently fails and
  every `Get-Mg*` reports `CommandNotFoundException`. jay-pc has **7.6.4**.
- Install the **sub-modules**, not the meta-module: `Microsoft.Graph.Authentication`,
  `Microsoft.Graph.Identity.DirectoryManagement`, `Microsoft.Graph.Users`, `-Scope CurrentUser`.
- **`-TenantId` is mandatory on `Connect-MgGraph`.** Without it the SDK uses the `common`
  endpoint, routes sign-in to the **personal** Microsoft account directory, and reports
  *"That Microsoft account doesn't exist"* for a valid work UPN.
- **`-UseDeviceCode` fails** here with `AADSTS530035`. Cause unconfirmed. Interactive works.
- **Interactive sign-in cannot be driven from a headless process** — WAM returns *"A window
  handle must be configured."* **Jay must run `Connect-MgGraph` in a PowerShell 7 window he
  opens himself**, and paste subsequent commands. The browser window **hides behind other
  windows** — tell him to alt-tab.

---

## Tenant facts (verified 4 Aug 2026)

| | |
|---|---|
| Tenant | adhjrt com |
| Tenant ID | `d184153b-527c-4035-92cb-967af9d50d89` |
| Primary domain | `NETORG20906799.onmicrosoft.com` |
| Directory licence | Entra ID Free |
| Conditional Access policies | **none** (not licensed) |
| Users / Groups / Devices | 3 / 0 / 0 |
| Delegated admin partner | 1 — GoDaddy, GDAP |

**Domains**

| Domain | Auth type | Verified | Accepted domain | Mail endpoint |
|---|---|---|---|---|
| `NETORG20906799.onmicrosoft.com` | Managed | ✓ default | ✓ | — |
| `adhjrt.com` | **Federated** (GoDaddy) | ✓ | ✓ | ✓ provisioned |
| `adhquins-clubhub.com` | Managed | ✓ | ✓ Allow Sending | ❌ **NXDOMAIN** |

`techslower.com` is Jay's, registered at GoDaddy, **not in the tenant** and unrelated to
either project.

**Global Administrators**

| Name | UPN / type | Notes |
|---|---|---|
| Jason Muir | `admin@NETORG20906799.onmicrosoft.com` | **Break-glass.** Initial domain, never federated. Password reset + GA confirmed 4 Aug. Object id `cc43d87a-9960-478c-8427-d1eb9b4423a5` |
| Admin ADHJRT | `admin@adhjrt.com` | Signs in via GoDaddy SSO. Object id `d6208a82-24da-460f-a66e-346df83dbaf6` |
| Partner Center Web App | ServicePrincipal | GoDaddy |
| Support | ServicePrincipal | GoDaddy |

Those two service principals are the "hidden GoDaddy admin logins" r/msp warns about.
They're identified; they have not been touched.

**Consoles**

| Console | Result |
|---|---|
| `entra.microsoft.com` | ✅ works |
| `admin.cloud.microsoft/exchange` | ✅ works |
| `admin.microsoft.com` | ❌ intercepted → `productivity.godaddy.com` |
| `security.microsoft.com` (Defender) | ❓ **untested** — assume intercepted, use PowerShell |

---

## GoDaddy subscription + the GDAP clock

| | |
|---|---|
| Product | Microsoft 365 Email Essentials, 1 seat (`admin@adhjrt.com`) |
| Cost | AED 108.00 + 6.48 tax = **AED 114.48/yr** |
| Last invoice | **8 July 2026**, paid |
| Auto-renew | **OFF** (Jay, 4 Aug 2026) |

⚠️ Auto-renew off means the subscription **expires ~8 July 2027**. Cancelling while GoDaddy
holds delegated admin is documented to trigger a cleanup that **deletes all users and removes
the primary domain**. Whether a natural *expiry* fires the same cleanup is **unconfirmed**.
Assume destructive.

**Action before July 2027:** remove the GDAP relationship (Entra → Partner relationships) —
a separate act from cancelling, and *not* the destructive trigger. Also delete GoDaddy's
admin service principals.

⚠️ **The trap, written down so it isn't rediscovered too late:** `adhjrt.com` remains
federated to GoDaddy's IdP, and `admin@adhjrt.com` signs in *through* it. If that IdP stops
honouring the account after expiry, that login dies — and it cannot be defederated to fix,
because that is the exact operation that 403s. **The break-glass
`admin@NETORG20906799.onmicrosoft.com` is Managed and never federated, so it survives. That
account is the entire safety net. Do not lose its password.**

Tournament housekeeping on a 2027 clock. Not app work, not blocking.

---

## Remaining work — `claude/runbooks/email-and-domain.md`

Steps 1–2 **done**. That runbook says to use the M365 admin centre, which is intercepted —
**use Exchange admin or Graph instead.** Steps 3, 4 and the MX change are **Microsoft-path
only** and evaporate if Resend is chosen.

- [ ] **⚠️ DECIDE: Resend or Microsoft/Graph** — everything below forks on this
- [ ] **⚠️ SPF + DKIM on `adhquins-clubhub.com`** — required on **either** path, before anything sends
- [ ] *(MS path)* `SupportedServices` fix — the domain has no inbound mail endpoint
- [ ] *(MS path)* **Step 3 — shared mailbox** `quinsclubhub@adhquins-clubhub.com`.
      Free, no licence. **EAC → Recipients → Mailboxes → Add a shared mailbox**.
      *Status 4 Aug: confirmed NOT created.*
- [ ] *(MS path)* **Step 4 — Entra app registration**: `Mail.Send` **application** permission,
      **grant admin consent**, client secret + a calendar reminder for its expiry, then
      `New-ApplicationAccessPolicy` to restrict it to that one sender mailbox
- [ ] *(MS path)* MX → `adhquins-clubhub-com.mail.protection.outlook.com` **once it resolves**,
      plus `autodiscover` CNAME → `autodiscover.outlook.com`
- [ ] *(Resend path)* sign up, add domain, paste 3 generated records, verify; swap the
      outbound call in `send-email`; set a `Reply-To`
- [ ] **Step 5 — Supabase Edge Function secrets** (`SEND_EMAIL_HOOK_SECRET` + provider creds)
- [ ] **Step 6 — enable the Send Email Hook** in Supabase
- [ ] **Step 7 — move the app** from `app.adhjrt.com` to the new domain. **Before inviting
      anyone** — PWA installs pin to their origin. Update Supabase redirect URLs.
- [ ] **Step 8 — verify live**: >2 emails in an hour, and spam placement on Gmail,
      Outlook.com and iCloud. Read the `Authentication-Results` header, not the inbox folder.

### MX on `adhquins-clubhub.com` — decided, blocked

Jay chose **option 1: point MX at Microsoft** so the shared mailbox genuinely receives.
Blocked until the mail endpoint exists (see new blocker). Irrelevant on the Resend path,
where a `Reply-To` covers the same need with no DNS change at all.

---

## Git / deploy state (re-verified 4 Aug 2026, session 2)

- Repo `jayjmuir-hub/quins-club-hub` — ⚠️ **PUBLIC**
- `build/v1-mvp` = **`3c6b12c`** → https://app.adhjrt.com
- Netlify deploy id **`6a7197c5824b460008131f48`**, `ready`, **unmoved**, commit `23cedc8`
- Other branches: `main` `77244cb`, `feat/desktop-schedule` `21f48bc`,
  `feat/availability-flag-off` `9a3b002`
- jay-pc fast-forwarded to `3c6b12c` in session 1. cafnet state still unknown.
- ⚠️ **`_transfer.b64` untracked in the repo root, NOT gitignored.** Root is served publicly.
  **Asked twice, still unanswered.** Ask again before any commit.
- ⚠️ cafnet has machine-wide `NODE_ENV=production`; use `npm install --include=dev`.

**A push to `build/v1-mvp` is a live release.** Diff first, explicit yes. A stop hook asking
is not Jay asking. `[skip ci]` for docs-only, verified by the deploy id not moving.

---

## Standing rules — non-negotiable

- **Never `git add -A`.** Stage explicit paths. `.env` is gitignored; only `.env.example` tracked.
- **Never put a secret in a tool call, URL, commit or message.** Dummy value to test plumbing,
  SHA-256 fingerprint to compare a real one. If one is disclosed — including by Jay pasting
  it — say so and tell him to rotate it.
- **Claude never creates accounts, enters passwords, or touches `sb_secret_…` or any client secret.**
- **Prove every new assertion against an injected fault.** Note the control used this session:
  `techslower.com` was queried purely to test whether the GoDaddy records were configuration
  or boilerplate. A second domain in a known-unrelated state is a cheap discriminating fixture.
- **Verify live after deploying**, not just green tests.
- Label every procedural step with its platform — "In Entra: …", "In PowerShell: …",
  "In GoDaddy DNS: …". Every step, in order, nothing assumed.

---

## 🪦 Tombstone 1 — Plan B (defederate from GoDaddy)

**Planned 4 Aug 2026. Abandoned the same day, unexecuted. Re-opened and re-closed the same
day — see the addendum.**

The plan: remove federation → reset passwords → buy Exchange Online Plan 1 → assign licence
→ remove GDAP → cancel GoDaddy. ~AED 205 year one, plus an irreversible tenant migration and
a sign-in outage.

**Why dropped:** its entire justification was that `adhquins-clubhub.com` could not be added
to the tenant. Never true — only the *web console* route was blocked. Adding it took four
Graph commands.

**Why it was never executable anyway:** `claude/runbooks/defederate-m365.md` points at the
tminus365 guide, whose step C is `Update-MgDomain` to flip Federated → Managed. **That is
precisely the command that 403s on this tenant.** Both it and the correct
`Remove-MgDomainFederationConfiguration` were refused. The DIY route works only where the
customer owns the federation trust; here GoDaddy does.

**Microsoft's official position** ([learn.microsoft.com](https://learn.microsoft.com/en-us/microsoft-365/admin/get-help-with-domains/godaddy-defederation-process)):
*"Microsoft and GoDaddy don't support the use of unauthorized non-Microsoft sites or steps to
complete the defederation process."* The MSP blogs are explicitly the thing Microsoft says
not to follow.

**The sanctioned route, if ever wanted** ([GoDaddy help](https://www.godaddy.com/help/move-my-microsoft-365-email-away-from-godaddy-40094)):
GoDaddy performs it via a support ticket. ~5 business days minimum. All admin passwords reset
to one temporary password. 7 days to buy replacement licences. **One-way.**

### Addendum, session 2 — "did we miss a step? Remove GDAP first?"

Asked, investigated, **answer: no.** Three independent reasons:

1. **Step order, from the source.** In the [tminus365 guide](https://docs.tminus365.com/configurations/godaddy/defederating-godaddy-365),
   removing GoDaddy as delegated admin is **step G**; the Federated→Managed flip is **step C**.
   The warning about GoDaddy's user-deleting cleanup script is a prerequisite for
   **cancelling** (step H), not for defederating. Doing G first would not have unblocked C.
2. **GDAP is additive.** It *grants* a partner roles in your tenant; it does not *subtract*
   rights from your own Global Administrator. A customer GA being denied cannot logically be
   caused by a partner holding extra access. The denial comes from the domain object being
   partner-owned.
3. **Even success wouldn't help.** In [Microsoft's own Q&A](https://learn.microsoft.com/en-us/answers/questions/5636677/need-help-removing-godaddy-reseller-relationship-f),
   a customer who *successfully defederated* was still locked under the GoDaddy CSP
   relationship, and Microsoft's moderator ended up recommending a **new tenant plus a
   tenant-to-tenant migration**. Defederation is not the unlock.

**The one route never tested, and it is dead:** `Set-MsolDomainAuthentication` from the
MSOnline module hit a different legacy API than Graph does. **MSOnline retired in April
2025.** Not available.

---

## 🪦 Tombstone 2 — "just buy 365 for the club domain through Microsoft"

**Proposed and rejected 4 Aug 2026, session 2.** Motivated by fatigue with the complexity,
which was fair; the escape hatch was the wrong one.

**Why it fixes nothing:** the blocker is SPF and DKIM. Those are DNS records. **A licence
purchase publishes no DNS records.** The setup wizard that offers to write them for you only
does so when Microsoft controls the nameservers; here they are `ns43`/`ns44.domaincontrol.com`.

**Two concrete traps:**

1. **Buying inside the current tenant** — the purchase flow lives at `admin.microsoft.com` →
   Billing, the page GoDaddy intercepts. The transaction likely cannot be completed.
2. **Buying a fresh tenant for the domain** — `adhquins-clubhub.com` is already verified in
   tenant `d184153b`, and a domain verifies in exactly one tenant. It would have to be
   removed first, and the same SPF and DKIM records typed into GoDaddy DNS by hand anyway.

**Cost of being wrong:** Microsoft 365 Business Basic rose **$6 → $7 per user per month on
1 July 2026** (annual commitment). ~$84/yr for a purchase that changes nothing. It is
strictly worse than finishing the Microsoft/Graph path, which needs **no licence at all** —
a shared mailbox is free.

**The legitimate feeling underneath it, and the honest answer:** the club domain is *not*
trapped in GoDaddy. Confirmed with the `techslower.com` control above. Three DNS records
stand between the club and working email — and if six Microsoft steps still feel like too
many, **Resend is three steps and $0**, which is the actual escape hatch.

---

## Lesson worth keeping

Session 1's lesson: an untested assumption got written into a runbook as "verified live",
and every later document reasoned from it rather than rechecking it. **Ask which route was
verified** — "the Domains page is unreachable" and "the domain cannot be added" are different
claims, and only the first was ever true.

Session 2 adds the mirror image: the *same* doc then asserted the domain was "mail-enabled"
on the strength of it appearing in Accepted Domains. Checking the one thing that would
actually be true if that were so — does the inbound MX hostname resolve? — showed it did not.
**A status page saying a thing is on is not the thing being on.** Query the effect, not the
console.
