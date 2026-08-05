# Decision: auth email via Microsoft Graph — and the 5.7.708 block

*5 August 2026. Status: BUILT and DEPLOYED. **Auth email does not work.**
Blocked on Microsoft support case 2608050030005980.*

## What changed

Auth email moved from Resend to Microsoft Graph `sendMail`, using an OAuth
client-credentials token against a new Microsoft 365 tenant. Reason: Jay bought
Microsoft 365 for `adhquins-clubhub.com`, so club mailboxes and app mail now
live in one place.

## ⚠️ DRIFT: the deployed function is not in git

**Supabase has version 19+ (Microsoft Graph). `origin/build/v1-mvp` has the
Resend version (`df03d67`).** Nothing was committed on 5 Aug.

To fix, pull the deployed source rather than hand-rewriting it — it contains two
fixes that are easy to lose:

```
get_edge_function(project lusmshimxdcxpnrktlgz, slug send-email)
```

Write it to `supabase/functions/send-email/index.ts` and commit.

> Version numbers move on their own. **Saving an Edge Function secret
> re-provisions the function and bumps its version** with no code change — v19
> became v20 and then v21 purely from editing `MAIL_FROM` during testing. Do not
> read a version bump as evidence of a deploy.

## The Microsoft 365 setup

| Thing | Value |
|---|---|
| Tenant | `quinsclubhub.onmicrosoft.com` |
| Tenant ID | `8173da5a-1a0c-4c62-8b10-51f71f916dcf` |
| Region | `namprd02` (North America) |
| Subscription | Microsoft 365 Business Basic, Active, 25 seats, 1 assigned |
| App registration | "Quins Club Hub — auth email" |
| Client ID | `bec2ed8e-4174-466d-b6ad-7f701534d67a` |
| Permission | `Mail.Send`, **Application**, admin consent granted |
| Client secret | expires **4 Aug 2028** (reminder set 5 June 2028) |
| Sending mailbox | `noreply@adhquins-clubhub.com` (shared, unlicensed — correct) |

Bought direct from Microsoft, **not** through GoDaddy. Clean and separate from
the old GoDaddy tenant `d184153b-527c-4035-92cb-967af9d50d89`.

`adhquins-clubhub.com` had to be **released from that old tenant first** — it
had been silently verified there, which blocks verification anywhere else.

Supabase secrets set: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`,
`MAIL_FROM`.

## ⛔ THE BLOCKER — 550 5.7.708

Every application-submitted send fails with:

```
550 5.7.708 Service unavailable. Access denied, traffic not accepted
from this IP. AS(7910)
```

The Edge Function returns **200** — Graph accepts the message. Exchange Online
then refuses to let it leave. Message trace shows `Receive → Submit → Fail` with
no delivery attempt.

## ⚠️ The first diagnosis was WRONG. Read this before theorising.

The original conclusion was: *"This is not a configuration problem and nothing
on our side is wrong. It is Microsoft's standard outbound restriction on a
brand-new tenant."*

**That is false.** It was never tested — it was inferred from the error code and
the tenant's age, and then written down as settled.

### The isolation test that disproved it

Two variables had been changed at once and never separated: the **sender** and
the **submission path**.

| | Outlook on the web | Graph, app-only |
|---|---|---|
| `admin@quinsclubhub.onmicrosoft.com` | ✅ **Delivered** | ❌ **5.7.708** |
| `noreply@adhquins-clubhub.com` | not tested | ❌ **5.7.708** |

Same mailbox. Same recipient (`jayjmuir@gmail.com`). Same tenant. Interactive
mail delivers; application-submitted mail does not.

**The block follows the submission path, not the sender.** Both failures show
the same source IP, `40.126.38.102`. Exchange Online routes application-
submitted mail through a different outbound pool than interactive user mail, and
that pool is the one with the reputation problem.

Run the test by temporarily setting `MAIL_FROM` to a licensed mailbox,
requesting a magic link, then reading the message trace — and set it back.

### What this rules out

- ❌ Tenant-wide outbound block — interactive mail leaves fine
- ❌ Domain reputation on `adhquins-clubhub.com` — it fails on
  `.onmicrosoft.com` too
- ❌ The missing DKIM — `.onmicrosoft.com` has Microsoft-managed DKIM and still
  fails
- ❌ The unlicensed shared mailbox — a licensed mailbox fails identically
- ❌ Restricted entities — a restricted sender returns **5.1.8**, not 5.7.708
- ❌ Volume or threshold — nothing has ever been delivered

### NDR header evidence

Both `Received:` hops are internal Exchange Online servers:

```
DM6PR02MB6409.namprd02.prod.outlook.com (2603:10b6:5:1f9::30)
  → CO6PR02MB7650.namprd02.prod.outlook.com (2603:10b6:303:b2::10)
```

No external hop. **The message never left Microsoft's network.** The recipient
never saw it and never rejected it.

> ⚠️ The NDR says *"Remote server returned 550 5.7.708"*. This reads as though
> the recipient rejected the mail. It did not. "Remote server" is Exchange's
> phrasing for the next internal hop. 5.7.708 is a **Microsoft** code carrying a
> `go.microsoft.com/fwlink` URL — Gmail emits `550-5.7.1` with a
> `support.google.com` link. Do not let support redirect you to Google.

## Support case

- Case **2608050030005980**, opened 5 Aug 2026
- Reply by **email** to `supportmail@techsupport.microsoft.com`, keeping
  `TrackingID#2608050030005980` in the subject. **The admin-centre case view is
  read-only — there is no reply box in the portal.**
- Authorised contacts: `admin@quinsclubhub.onmicrosoft.com` **and**
  `jayjmuir@gmail.com`. The Gmail address was added because the first is inside
  the affected tenant.
- ⚠️ The first support response quoted **5.7.705** boilerplate ("tenant exceeded
  threshold", i.e. you sent spam). Different error. Correct it — the tenant has
  never successfully sent anything.
- Message trace IDs: `e32bf261-305a-44c8-0243-08def2e1563d` (from `noreply@`),
  `7860868e-5799-4f80-d316-08def2e1563d` (from `admin@`, the isolation test)

## The `/auth/v1` bug, fixed here and nowhere else

`email_data.site_url` from the Send Email Hook arrives with `/auth/v1` **already
on the end**. The code appended `/auth/v1/verify`, producing
`/auth/v1/auth/v1/verify` — a path that misses the API gateway's route exemption
for verify links and returns `{"message":"No API key found in request"}`.

Every magic-link email between the hook going live and this fix had a **dead
button**. Nobody noticed because every check stopped at "delivered".

```ts
const base = data.site_url.replace(/\/+$/, '').replace(/\/auth\/v1$/, '')
```

**This fix exists only in the deployed Graph version.** It is not in the
committed Resend file. Keep the normalisation.

**It has never been verified end to end**, because nothing has been delivered
since it was deployed. When mail works, confirm four things, not one: it
arrives, it is not in spam, **the button actually signs you in**, and
`Authentication-Results` shows `dkim=pass`.

## ⚠️ Overdue: scope the application permission

`Mail.Send` as an application permission currently lets this app send as **any
mailbox in the tenant**. It must be scoped:

```powershell
New-ApplicationAccessPolicy `
  -AppId bec2ed8e-4174-466d-b6ad-7f701534d67a `
  -PolicyScopeGroupId noreply@adhquins-clubhub.com `
  -AccessRight RestrictAccess `
  -Description "Restrict Quins Club Hub auth email to the noreply mailbox"
```

This was deliberately deferred so a send failure could be attributed to the code
or the policy but never both. That reasoning has expired.

⚠️ **The same restriction is still unapplied on `adhjrt.com`**, where the
tournament app can send as `admin@adhjrt.com`. Separate repo, still real.

## Next

1. Chase case 2608050030005980 until 5.7.708 is lifted.
2. Decide on the Resend rollback — see `2026-08-05-resend.md`, and note the
   `/auth/v1` fix must be ported first.
3. Commit the Graph function to git.
4. Apply `New-ApplicationAccessPolicy`.
5. Verify DKIM, then a real magic link, checking all four things above.
6. Reinstall the PWA from `https://adhquins-clubhub.com`, delete the old one.
7. Only then, invite the committee.
