# Decision: move the app to `adhquins-clubhub.com`

*5 August 2026. Status: DONE and verified.*

## What changed

The app moved from `app.adhjrt.com` to its own domain,
`https://adhquins-clubhub.com`.

## Why

Auth email and the app had to live on the same domain. An email from one domain
linking to another is the exact pattern people are taught to distrust, and this
app's whole job is to send sign-in links to ~300 club members who have never
seen it before.

It had to happen **before anyone was invited**. This is a PWA, and installs pin
to their origin — a later move costs every member a delete-and-reinstall. On
5 Aug the only install was Jay's, which made the move nearly free. It never
would be again.

## What was done

| Thing | Value |
|---|---|
| Nameservers | GoDaddy → Netlify DNS (`dns1`–`dns4.p09.nsone.net`) |
| Netlify primary domain | `adhquins-clubhub.com` |
| Certificate | Let's Encrypt, `CN=adhquins-clubhub.com`, expires **3 Nov 2026** |
| Supabase Auth Site URL | `https://adhquins-clubhub.com` |
| Old domain | `app.adhjrt.com` **kept** as a working alias |

Strict TLS validation passes on the apex, on `www` (301 → apex), on the old
domain, and on the `netlify.app` URL.

## `app.adhjrt.com` was deliberately NOT removed

Jay's existing PWA install still points at it, and so may anything else that has
been shared. It costs nothing to keep. **Whether it becomes permanent or gets
retired is still undecided** — see `state-of-play.md`.

> 🪦 **ANSWERED 12 AUG 2026: RETIRED.** The question this section left open was
> closed a week later — the alias is removed and the hostname no longer
> resolves. The reasoning above was right for its moment and is why the alias
> existed at all; what changed is that the club still had exactly one install,
> so the cost of retiring was still one home-screen icon and was only ever
> going to rise. Full reasoning, and the evidence:
> `claude/decisions/2026-08-12-retire-app-alias.md`. **The rest of this document
> describes 5 August and is left as written.**

## Traps found during the migration — read before touching DNS again

**1. Netlify DNS record names are not what you would guess.**
Resend's SPF pair lives at `send.send`. Microsoft's mail host is
`adhquinsclubhub-com02b` — the hyphen in `adhquins-clubhub` is *stripped*.
Both were nearly missed.

> **Rule: read record values from the provider's own UI and copy-paste them.
> Never infer a record name from a pattern.**

**2. Two records were lost in the migration and had to be restored.**
The original enumeration of the zone guessed likely record names instead of
reading the zone, and missed the `send.send` MX and TXT records.

**3. A green "Verified" badge is a historical claim, not a current
measurement.** Resend's dashboard still showed the domain as Verified after
those records had been dropped, because Resend had last checked *before* the
nameserver move. The badge was true when it was written and false when it was
read.

This one generalises. Any provider dashboard showing a green state is telling
you the result of a check that happened at some unknown time in the past. If
the answer matters, re-measure it yourself.

## Related, unresolved

Microsoft 365 DKIM for this domain has not published. Both
`selector1._domainkey` and `selector2._domainkey` CNAMEs are correct and
resolving on our side, but Microsoft's targets returned NXDOMAIN for hours
after the toggle was enabled.

This was initially assumed to share a root cause with the 5.7.708 outbound
block. **That assumption is now doubtful** — the isolation test on 5 Aug showed
5.7.708 is specific to the application send path and not to this domain at all.
See `2026-08-05-microsoft-graph-and-5.7.708.md`. Treat the DKIM gap as a
separate open item until proven otherwise.
