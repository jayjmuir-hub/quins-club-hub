# DMARC reports — why they arrive, how to read them, and when to worry

Every large mail provider that receives a message claiming to be from
`adhquins-clubhub.com` sends us a daily summary of what it saw. That is not a
fault and nobody subscribed to a service: our own DNS asks for it, in the
`rua=` tag of the DMARC record. Yahoo, Google and NTT Docomo all comply, so the
mailbox fills up daily and will keep doing so forever.

**The attachments are gzipped XML.** Read them with the script, not by eye:

```bash
npm run mail:dmarc -- "C:\Users\jayjm\Downloads"
```

With no folder argument it reads `~/Downloads`. It understands the `.xml.gz`
that Yahoo and Docomo send and the `.zip` that Google sends, and it ignores
anything in the folder that is not a DMARC report.

## The only line of its output that should ever alarm you

```
AUTHENTICATED FROM AN UNKNOWN IDENTITY — the one that matters
```

Spoofed mail that **fails** is noise. It is caught, it is reported, and there
is nothing to do about it — see below. Mail that **passes** from an identity we
do not send as is the serious case: it means a DKIM private key has leaked or
an SPF record authorises a sender it should not. That is the only condition
that sets a non-zero exit code, so the script can be wired to something that
shouts if it ever needs to be.

The identities we own are listed in `KNOWN_SENDERS` at the top of
`scripts/dmarc-summary.mjs`. **Add to that list whenever a new sender is set
up**, or the first report after the change will read as an incident.

## What is published today

Measured 15 Aug 2026 with `Resolve-DnsName`. Re-measure before trusting it —
CLAUDE.md rule 8.

```
NS      dns1-4.p09.nsone.net                          (Netlify DNS — change records there)
MX      adhquinsclubhub-com02b.mail.protection.outlook.com
SPF     v=spf1 include:spf.protection.outlook.com -all
DKIM    selector1/selector2._domainkey  ->  …dkim.mail.microsoft
        resend._domainkey.send.adhquins-clubhub.com
DMARC   v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc@adhquins-clubhub.com;
```

⚠️ **`adkim=r; aspf=r` must stay relaxed.** We send from
`send.adhquins-clubhub.com`, and Resend puts its bounce domain one level below
that again at `send.send.…`. Strict alignment breaks subdomain sending
outright. `claude/runbooks/email-and-domain.md` says the same thing and it is
still true.

⚠️ **`sp` is deliberately unset**, so subdomains inherit `p`. That inheritance
is what catches the invented subdomains described below. Do not add an `sp=none`
to quieten the reports — it would switch off the protection, not the noise.

## The 15 Aug 2026 investigation, and what "normal" looks like

Reports arrived naming report domains that looked wrong — `raker.`, `ichu.` and
`visto.` prefixed to our domain. They were investigated in full:

- **The subdomains do not exist.** No A record, no TXT, and a control subdomain
  invented on the spot resolved identically, so there is no wildcard. A spammer
  is generating random labels in front of a domain harvested from public DNS.
  A brand-new label has no sending reputation for a filter to hold against it,
  which is the entire point of the technique.
- **Four messages, four source IPs, four countries, one day.** A mobile network
  in the Republic of the Congo, a Brazilian ISP, a small Israeli network and
  Uzbektelekom — unrelated consumer networks with no shared infrastructure, and
  the one that was checked had no reverse DNS. That shape is a botnet renting
  out compromised hosts, not an actor who has taken an interest in the club.
- **Every one failed SPF and DKIM and was quarantined.** DMARC did its job.
- **A week of Google's reports covering the same period saw no spoofing at
  all.** It was a single burst on a single day, not a standing campaign.
- **Nothing authenticated that should not have.**
- **The app was not involved and was not being abused** — sending volume,
  signups and auth traffic were all ordinary.

⚠️ **This is the expected steady state, not an incident.** Any public domain
gets this. The reports are evidence the protection works; they are not evidence
of a problem. Do not go looking for a breach because a report names a subdomain
you do not recognise — check whether it **passed** first.

## The change still to make: `p=quarantine` → `p=reject`

Quarantine puts a forgery in the recipient's junk folder, where a parent can
still find it and believe it. Reject refuses it at the SMTP door.

Set this TXT record at `_dmarc.adhquins-clubhub.com` in **Netlify DNS**:

```
v=DMARC1; p=reject; adkim=r; aspf=r; rua=mailto:dmarc@adhquins-clubhub.com;
```

Only `p` changes. Everything else is byte-identical on purpose.

⚠️ **Do not make this change blind.** Our own mail must authenticate first, or
we reject it ourselves — and the failure mode is silent to the sender.

A week of reports to 13 Aug 2026 shows `send.adhquins-clubhub.com` clean, with
nothing failing. **What it does not show is a single message from the root
domain** — no Microsoft 365 mail appears in any report, so its alignment is
untested rather than proven, and it is exactly what `p=reject` would start
refusing. Before changing the record: send from the mailbox to a Gmail address
and a Yahoo address, wait for the next day's reports, then run
`npm run mail:dmarc` and confirm `adhquins-clubhub.com` appears with an empty
`failed` column. A domain that never sends is fine to reject for; a domain that
sends untested is not.

Reverting is a one-line DNS edit, but a rejected email is gone — the recipient
never sees it and the sender gets a bounce they may not read.

## Where the rest lives

| Read | For |
|---|---|
| `claude/runbooks/email-and-domain.md` | How the domain and sending were set up |
| `claude/runbooks/scope-mail-send.md` | The mail-send permission scope |
| `claude/handoffs/2026-08-04-email-domain.md` | The DNS audit that preceded all of it. ⚠️ History — its record of SPF/DKIM predates the current setup and no longer matches |
