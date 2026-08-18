# Club email + the Club Hub domain — runbook

Everything Jay has to do by hand, in order. Claude cannot create accounts, enter
passwords, or handle the API key — those steps are marked **YOU**.

> **5 Aug 2026 — provider switched to Resend.** This used to be a Microsoft 365 /
> Entra / Graph runbook. Jay reversed that decision the same week it was made — see
> `claude/decisions/2026-08-05-resend.md` for the full reasoning, including why the
> Microsoft path looked right for a day and what changed. If you're reading old
> context (`MS_TENANT_ID`, Entra app registration, a new US-country tenant), that
> plan is dead. Don't resume it without reading that doc first.

## Why this shape

**The problem.** Auth email currently goes through Supabase's built-in service:
**2 messages per hour, no delivery SLA, explicitly not for production.** That cannot
onboard a club of 300, and it is why nobody should be invited until this is done.

**Why not Supabase custom SMTP.** It is password-only — host, port, username, password.
Resend supports SMTP too, but the HTTPS API is simpler, is what the Send Email Hook
expects to call, and needs no credential rotation story of its own — the API key doesn't
expire on a clock the way an Entra client secret does.

**What we do instead.** Resend, called from a Supabase **Send Email Hook** over plain
HTTPS with an API key. No tenant, no OAuth dance, no client secret with a 24-month clock.

## Decisions already made

- Club Hub gets its **own domain**, separate from the once-a-year `adhjrt` tournament:
  `adhquins-clubhub.com`, already bought.
- **Email sends from a subdomain of it**, `send.adhquins-clubhub.com`, not the root.
  Two reasons: it's the pattern Resend's own setup wizard defaults to, and it keeps the
  root domain's DNS untouched — no risk of ending up with two `v=spf1` TXT records at
  `@`, which is a spec violation (PermError) that silently breaks SPF for everything
  else at the root. The relaxed DMARC alignment already published at
  `_dmarc.adhquins-clubhub.com` (`adkim=r; aspf=r`) means a subdomain sender still
  passes DMARC. **Leave that alignment relaxed** — if anyone ever tightens it to `s`,
  subdomain sending breaks.
- **The app moves to this domain too, before anyone is invited.** An email from one
  domain linking to sign-in on another is the exact pattern people are taught to
  distrust, and this is a PWA — a home-screen install is pinned to its origin, so a
  later move costs every member a delete-and-reinstall. Right now the only install is
  Jay's.
- Reply-To starts as Jay's own address. Easy to change later; not on the sending path.

---

## 1. YOU — sign up for Resend

**Use your own personal email, not a Microsoft/work account** — this has nothing to do
with the M365 tenant and shouldn't get tangled with it.

Go to resend.com → sign up.

⚠️ **THIS STEP DESCRIBED THE FREE TIER UNTIL 13 Aug 2026, AND THE ACCOUNT IS NOW ON
RESEND PRO.** The old text read: *"Free tier: 3,000 emails/month, **100/day**, 1
verified domain, 30-day log retention. That ceiling is fine for a club of 300 doing
sign-ins and occasional announcements; if it ever binds, the fallback noted in the
decision doc is Amazon SES."* Recorded rather than deleted because this is a
**setup runbook** — anyone following it from scratch starts on the free tier and
meets that ceiling first.

**On Pro the 100/day cap does not exist.** ⚠️ **Do not write the monthly allowance
into this file** — every number this repo has written down has rotted. Read it off
the Resend dashboard, and note the trap recorded in `claude/state-of-play.md`: the
usage figures render in a `number-flow-react` web component whose shadow DOM holds
every digit 0-9 per column, so text extraction and `aria-label` both return
nonsense. **Read that page from a screenshot, or expand the row.**

The Amazon SES fallback is still the fallback and has never been needed.

## 2. YOU — add the sending domain

Resend dashboard → **Domains → Add Domain**.

- Domain: **`send.adhquins-clubhub.com`** (the subdomain, not the root — see above).
- Region: pick the one closest to your users if asked; doesn't matter much for
  transactional mail latency.

Resend will show you a small set of DNS records to publish — typically an MX and a TXT
for SPF, and a TXT (or CNAME) for DKIM, all scoped to the `send.` subdomain.

## 3. YOU — publish the records in NETLIFY DNS

⚠️ **THIS STEP SAID "GoDaddy DNS" UNTIL 18 Aug 2026 AND FOLLOWING IT WOULD HAVE WASTED
AN AFTERNOON WITH NOTHING TO SHOW.** GoDaddy is the **registrar only**. The domain's
nameservers were moved to **Netlify**, and edits made in a GoDaddy zone that is not
authoritative save cleanly, look correct, and change nothing — there is no error to
notice, which is what makes it expensive. Measured 18 Aug 2026:

```
adhquins-clubhub.com  NS  →  dns1.p09.nsone.net … dns4.p09.nsone.net
```

`nsone.net` is NS1, which is what Netlify DNS runs on. The old text named
`ns43`/`ns44.domaincontrol.com`, which is GoDaddy's — that is no longer what answers for
this domain. **Re-run `nslookup -type=NS adhquins-clubhub.com` before believing this
line either**; it has been wrong once.

**In Netlify** → your team → **Domains** → `adhquins-clubhub.com` → **DNS records**, add
each record Resend showed you, exactly as given — host/name, type, value. They'll be
named things like `send` and `resend._domainkey.send`, not `@`, because they belong to
the subdomain.

⚠️ **Do not touch the existing `@` records — and they are NOT what this file used to say
they were.** The old text called them "GoDaddy's registrar boilerplate
(`v=spf1 include:spf.em.secureserver.net ?all`)". Measured 18 Aug 2026, the root now
carries **Microsoft 365's** records, because club mailboxes live there:

```
adhquins-clubhub.com  MX   →  adhquinsclubhub-com02b.mail.protection.outlook.com
adhquins-clubhub.com  TXT  →  v=spf1 include:spf.protection.outlook.com -all
adhquins-clubhub.com  TXT  →  MS=ms38515168          (M365 domain verification)
autodiscover          CNAME →  autodiscover.outlook.com
```

**Breaking any of those stops club mail arriving**, which is a much worse failure than
breaking app sending — nobody notices inbound mail that silently stops. Leave the root
alone and keep every Resend record on the `send.` subdomain, which is what the
subdomain-sending decision at the top of this file is for.

Wait 10–30 minutes for propagation, then back in Resend click **Verify**. If it doesn't
verify within an hour, recheck the exact record values — a missing or extra character in
a DKIM TXT value is the most common cause.

## 4. YOU — create an API key

Resend dashboard → **API Keys → Create API Key**.

- Name it something identifiable, e.g. `quins-club-hub-send-email`.
- Permission: **Sending access** only if Resend offers a scoped option — no reason for
  this key to be able to manage domains or other account settings.
- The value is shown **once**. Copy it now.

Unlike the Microsoft path, this key doesn't have a fixed expiry — no calendar reminder
needed for it to silently lapse. It's still a live credential: if it ever leaks, revoke
it from this same screen and issue a new one.

## 5. YOU — set the Edge Function secrets

Supabase dashboard → **Edge Functions → Secrets**:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 4 |
| `MAIL_FROM` | a sending address on the verified subdomain, e.g. `Abu Dhabi Harlequins <hello@send.adhquins-clubhub.com>` |
| `REPLY_TO` | Jay's own email address, so replies to a sign-in email land somewhere real |
| `SEND_EMAIL_HOOK_SECRET` | generated in step 6 — paste it here too |

If any old `MS_TENANT_ID` / `MS_CLIENT_ID` / `MS_CLIENT_SECRET` secrets exist from the
abandoned Microsoft path, delete them — dead credentials sitting in the secrets list are
just something to accidentally rotate wrong later.

**Never put any of these in this repo.** The repo is public.

## 6. YOU — enable the Send Email Hook

Supabase dashboard → **Authentication → Hooks → Send Email**:

- Type: **HTTPS**
- URL: `https://<project-ref>.supabase.co/functions/v1/send-email`
- Generate the secret, and paste the same value into `SEND_EMAIL_HOOK_SECRET` above.

That secret is the **only** thing protecting the endpoint. The function runs with
`verify_jwt` off — it has to, because Supabase Auth calls it server-to-server with no user
JWT — so it is publicly reachable and every request is authenticated by signature alone. The
function **refuses everything** if the secret is unset, rather than sending unverified mail.

## 7. YOU — point the app at the new domain

1. Netlify → the `quins-club-hub` site → **Domain management → Add domain**, then follow its
   DNS instructions. This is the app's own subdomain (e.g. `app.adhquins-clubhub.com`),
   separate from the `send.` subdomain Resend uses — they don't conflict.
2. Supabase → **Authentication → URL Configuration**: set **Site URL** to the new origin, and
   add `https://<new-domain>/**` to **Redirect URLs**. Keep the old ones during the switch so
   links already in inboxes still work.
3. **Do not touch** the `adhjrt.com` root site — that is a separate Netlify project
   (`serene-gingersnap-1d0eb6`), the tournament app. This app only ever owned the `app.`
   subdomain.

## 8. Verify before telling anyone

- Sign in with a magic link. The email must come **from the club's `send.` address**,
  look like the club, and its link must land on the **new** app domain.
- Check it does **not** land in spam — new domain, so this is the real risk. Send to a
  Gmail, an Outlook.com and an iCloud address if you can, and read the
  `Authentication-Results` header on the received message (not just which folder it
  landed in) — it will say `spf=pass`/`dkim=pass` if the DNS records actually took.
- Confirm the app still loads, signs in and shows the roster on the new origin.
- Reinstall the PWA from the new domain and delete the old install.
- Send more than two emails within an hour. That is the old Supabase ceiling; it should
  no longer exist. ⚠️ **The "stay well under the Resend 100/day ceiling while testing"
  line that used to sit here is obsolete — the account is on Resend Pro since
  13 Aug 2026 and there is no daily cap.** Test freely; the thing to watch now is
  not the quota but the sending REPUTATION of `send.adhquins-clubhub.com`, which a
  burst of bounces to fake addresses damages and a quota never did.

---

## What Claude has already built

- `supabase/functions/send-email/index.ts` — the hook. Verifies the Standard Webhooks
  signature (constant-time, with a five-minute replay window), builds the verify URL from
  the `token_hash` the hook provides, renders the club-voiced template, and sends via a
  single HTTPS POST to `api.resend.com`. Fails closed if the secret or `RESEND_API_KEY` /
  `MAIL_FROM` is missing.
- Templates for magic link / signup, recovery, email change and invite. Plain HTML on
  purpose: no images, no external CSS, no tracking pixel — it is a sign-in email, it should
  load instantly on one bar of signal and give a spam filter nothing to dislike.

## If it breaks

| Symptom | Cause |
|---|---|
| Every send 401s (from Supabase, at the hook) | `SEND_EMAIL_HOOK_SECRET` doesn't match the one in the Hooks screen |
| Resend call itself 401s | `RESEND_API_KEY` wrong or revoked |
| Resend call 403s | `MAIL_FROM`'s domain isn't verified yet in Resend — recheck step 3 |
| Resend call 429s | ⚠️ **No longer the 100/day free cap — the account is on Pro since 13 Aug 2026.** A 429 now means the per-second rate limit or the monthly allowance. Check the Resend dashboard (from a screenshot — see step 1) |
| Mail sends but lands in spam | DKIM/SPF records from step 2 not fully propagated or not verified — recheck in Resend's dashboard |
| Nothing arrives and nothing logs | The hook isn't enabled — Supabase is still sending its own |
