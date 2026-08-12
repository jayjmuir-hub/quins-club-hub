# Decision: `app.adhjrt.com` is retired

*12 Aug 2026. Jay's ruling, executed the same session. Reasoning, not current
state — `RESTORE.md` and the code win on what is true today.*

## What changed

The app's original address, `app.adhjrt.com`, no longer resolves. It had been a
working alias for `adhquins-clubhub.com` since the domain move on 5 Aug 2026,
whose own record left the question open: *"whether it becomes permanent or gets
retired is still undecided"*. It is now decided.

## Why now

Jay: *"adhjrt is a completely separate project and not for your consideration on
anything involving club hub."* The alias was the last live coupling between the
two — everything else that mentions adhjrt in this repo is a copied design
value, a tournament name in a dropdown, or an iCal UID suffix, none of which is
a dependency.

⚠️ **The timing was the argument, not the tidiness.** A PWA install is welded to
the origin it was installed from, so retiring an address costs one
delete-and-reinstall **per installed device**. On 12 Aug the club still had
exactly one install — Jay's — because no parent or coach has been onboarded.
That is the same reasoning that made the 5 Aug move nearly free, and it expires
the day anyone is invited. **This is the second time that window has been used
and there will not be a third.**

## What was actually done, and in which order

A hostname needs three separate things to be true, so it was switched off in
three places:

| # | Where | What |
|---|---|---|
| 1 | Supabase → Authentication → URL Configuration | Removed `https://app.adhjrt.com/**` from the redirect allow-list |
| 2 | Netlify → project `quins-club-hub` → Domain management | Removed `app.adhjrt.com` as a domain alias |
| 3 | Netlify DNS, `adhjrt.com` zone | ⚠️ **Nothing to do — step 2 deleted the record automatically** |

⚠️ **Step 3 was expected to be manual and was not.** The plan said to delete an
`app` CNAME by hand, on the assumption the record lived at GoDaddy. It does not:
`adhjrt.com` is on Netlify DNS, so the alias and its DNS record are the same
object and removing one removed both. **The claim that it needed a manual DNS
edit was wrong and is corrected here rather than quietly dropped.**

⚠️ **`adhquins-clubhub.com` was confirmed to be the PRIMARY domain before
anything was removed.** Removing an alias is safe; removing a primary takes the
live site down, and the two sit in the same list behind identically-worded
menus.

## ⚠️ A stale entry was found alongside it, and removed

The Supabase redirect allow-list also carried
`https://feat-password-auth--quins-club-hub.netlify.app/**` — a branch-deploy
URL for a branch deleted on 10 Aug. Removed in the same pass.

A redirect allow-list is the list that decides **where an auth token may be
sent**. Dead wildcards in it are not neutral clutter; they are the kind of entry
nobody re-reads and nobody can justify a year later. Four entries remain: the
canonical domain, the `netlify.app` domain, and the two localhost ports.

## How it was verified

⚠️ **The browser could not answer this and was not trusted to.** Navigating to
the old address failed, but the Browser pane refuses unapproved origins too, so
a failure there is ambiguous — **a negative check that fails for the wrong
reason proves nothing.**

Measured instead with `Resolve-DnsName` against `8.8.8.8`, so a local cache
could not answer, and with two controls:

| Query | Result |
|---|---|
| `adhquins-clubhub.com` — control | resolves |
| `adhjrt.com` — control | resolves |
| `app.adhjrt.com` — target | **NXDOMAIN** |

⚠️ **The second control is the one that makes this evidence.** It proves the
`adhjrt.com` zone is alive and answering, so the NXDOMAIN is specific to the
`app` hostname rather than the whole zone having gone dark. Without it, a
broken nameserver and a successful retirement look identical.

The live site was then loaded and served its dashboard over HTTPS, while Netlify
re-provisioned the Let's Encrypt certificate — which had covered
`*.adhjrt.com, *.adhquins-clubhub.com, adhjrt.com, adhquins-clubhub.com` and
now needs only the club hub names.

## ⚠️ What was NOT touched

The `adhjrt.com` DNS zone still holds eight records — two `NETLIFY` records
pointing at `adhquins-jrt.netlify.app`, an `MX` to Outlook, an `autodiscover`
CNAME, a GoDaddy mail CNAME and three `TXT` records including its SPF. **All of
it belongs to the other project and none of it was changed.**

⚠️ **The two Netlify project slugs are confusingly close** — club hub is
`quins-club-hub`, the other is `adhquins-jrt`. Read the slug, not the display
name: the projects list shows both by their primary domain.

## Consequences worth knowing

- **Jay's home-screen icon is dead** until he reinstalls from
  `https://adhquins-clubhub.com`. Known and accepted at the time — *"don't worry
  about my app icon, i can take care of that later"*.
- **No deploy and no credits.** Every change was a console setting.
- **Subscribed calendars are unaffected.** `CALENDAR_ORIGIN` in
  `src/data/calendar.js` has always been the canonical domain, which is the
  entire reason that constant is hard-coded rather than derived from
  `window.location.origin`. Its own comment named `app.adhjrt.com` as "a domain
  we may delete" — that prediction is now fact.

## Do not re-add it

If a link to the old address turns up somewhere, fix the link. Re-adding the
alias to serve it would restore the coupling this removed, and would do it
without the one-install window that made retiring cheap.
