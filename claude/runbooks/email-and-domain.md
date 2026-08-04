# Club email + the Club Hub domain — runbook

Everything Jay has to do by hand, in order. Claude cannot create accounts, enter
passwords, or handle the client secret — those steps are marked **YOU**.

## Why this shape

**The problem.** Auth email currently goes through Supabase's built-in service:
**2 messages per hour, no delivery SLA, explicitly not for production.** That cannot
onboard a club of 300, and it is why nobody should be invited until this is done.

**Why not Supabase custom SMTP.** It is password-only — host, port, username, password.
The club's mail is Microsoft 365, where **basic-auth SMTP is being retired** (tenants keep
it only until the end of December 2026, new tenants blocked from January 2027). Wiring
Supabase to M365 over SMTP would buy a few months and then fail in the worst possible way:
nobody can sign in, because magic links silently stop being delivered.

**What we do instead.** Microsoft Graph with OAuth client credentials, called from a
Supabase **Send Email Hook**. No deadline, no new vendor, no SMTP. It is also the pattern
the tournament app at `adhjrt.com` has run in production for months — see
`netlify/functions/_email.js` in that repo.

## Decisions already made

- Club Hub gets its **own domain**, separate from the once-a-year `adhjrt` tournament.
- **Both the app and the email live on it.** An email from one domain linking to another is
  the exact pattern people are taught to distrust.
- Do the move **before inviting the committee**. This is a PWA: a home-screen install is
  pinned to its origin, so moving domains later means everyone deletes and reinstalls.
  Right now the only install is Jay's.

---

## 1. YOU — buy the domain

Whatever you settle on. Lead with the club name: "Club Hub" alone is trademarked (Anytime
Fitness) and crowded, which is why the branding note says always to prefix it.

## 2. YOU — add it to your existing Microsoft 365 tenant

You do **not** need a second M365 subscription. A tenant holds hundreds of domains.

1. Microsoft 365 admin → **Settings → Domains → Add domain**
2. Verify ownership with the TXT record it gives you (GoDaddy DNS)
3. Add the DNS records it asks for. **MX only if you want to receive mail** on this domain;
   **SPF and DKIM you want regardless** — a new domain starts with no keys and no sending
   reputation, and unsigned auth mail gets filtered.
4. Enable **DKIM** for the new domain (Defender portal → Email & collaboration → Policies →
   Threat policies → Email authentication settings → DKIM), then publish the two CNAMEs it
   generates.

## 3. YOU — create the sender mailbox

Create the sender as a **shared mailbox** — free, no licence needed, and the same thing the
tournament app already sends from.

Microsoft 365 admin → **Teams & groups → Shared mailboxes → Add**, on the new domain.

Give it a real destination for replies: people **will** reply to a sign-in email, and a
reply that vanishes is worse than no reply address at all.

## 4. YOU — Entra app registration

A **separate** registration from the tournament's is recommended: one secret per system, so
an expiry or a leak takes down one thing rather than both.

1. entra.microsoft.com → **App registrations → New registration**, single tenant, no
   redirect URI
2. **API permissions → Microsoft Graph → APPLICATION permissions → `Mail.Send` → Add**,
   then **Grant admin consent**. The status must read *Granted* or every send returns 403.
3. **Certificates & secrets → New client secret.** The Value is shown **once**.
4. **Record the expiry in a calendar reminder.** When a secret expires, email stops
   *silently* — nothing else breaks, so nobody notices until someone can't sign in.

### Do this bit, it is not optional housekeeping

`Mail.Send` as an *application* permission lets that app send as **any mailbox in the
tenant**. Restrict each registration to its own sender:

```powershell
New-ApplicationAccessPolicy -AppId <client-id> `
  -PolicyScopeGroupId <the sender mailbox or a mail-enabled security group> `
  -AccessRight RestrictAccess -Description "Quins Club Hub auth email"
```

The tournament app's own source flags this as outstanding for its registration too. With two
apps in the tenant it matters more, not less: a leaked secret otherwise sends as anyone at
your domains.

## 5. YOU — set the Edge Function secrets

Supabase dashboard → **Edge Functions → Secrets**:

| Name | Value |
|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID |
| `MS_CLIENT_ID` | Application (client) ID |
| `MS_CLIENT_SECRET` | the secret's Value |
| `MAIL_FROM` | the shared mailbox address |
| `SEND_EMAIL_HOOK_SECRET` | generated in step 6 — paste it here too |

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
   DNS instructions.
2. Supabase → **Authentication → URL Configuration**: set **Site URL** to the new origin, and
   add `https://<new-domain>/**` to **Redirect URLs**. Keep the old ones during the switch so
   links already in inboxes still work.
3. **Do not touch** the `adhjrt.com` root site — that is a separate Netlify project
   (`serene-gingersnap-1d0eb6`), the tournament app. This app only ever owned the `app.`
   subdomain.

## 8. Verify before telling anyone

- Sign in with a magic link. The email must come **from the club address**, look like the
  club, and its link must land on the **new** domain.
- Check it does **not** land in spam — new domain, so this is the real risk. Send to a
  Gmail, an Outlook.com and an iCloud address if you can.
- Confirm the app still loads, signs in and shows the roster on the new origin.
- Reinstall the PWA from the new domain and delete the old install.
- Send more than two emails within an hour. That is the old ceiling; it should no longer
  exist.

---

## What Claude has already built

- `supabase/functions/send-email/index.ts` — the hook. Verifies the Standard Webhooks
  signature (constant-time, with a five-minute replay window), builds the verify URL from
  the `token_hash` the hook provides, renders the club-voiced template, and sends via Graph.
  Fails closed if the secret or the Graph config is missing.
- Templates for magic link / signup, recovery, email change and invite. Plain HTML on
  purpose: no images, no external CSS, no tracking pixel — it is a sign-in email, it should
  load instantly on one bar of signal and give a spam filter nothing to dislike.

## If it breaks

| Symptom | Cause |
|---|---|
| Every send 401s | `SEND_EMAIL_HOOK_SECRET` doesn't match the one in the Hooks screen |
| `invalid_client` in the logs | Wrong secret, or the secret **expired** |
| 403 from Graph | Admin consent was never granted, or an application access policy excludes this sender |
| Mail sends but lands in spam | DKIM not enabled for the new domain, or SPF missing |
| Nothing arrives and nothing logs | The hook isn't enabled — Supabase is still sending its own |
