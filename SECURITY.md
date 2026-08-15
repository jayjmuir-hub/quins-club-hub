# Security policy

This repository runs **https://adhquins-clubhub.com**, the club-management app
for Abu Dhabi Harlequins RFC. It is a live service used by real families, and
the database behind it holds **children's personal data** — names, dates of
birth, photographs, medical notes and parents' contact details.

Please read the testing rules below before you touch anything. They exist
because of what is in the database, not because of what is in the code.

## Reporting a vulnerability

**Email admin@adhquins-clubhub.com.** Put `SECURITY` in the subject line.

**Do not open a GitHub issue.** Issues on this repository are public, and a
public issue is a disclosure.

⚠️ **If a child's personal data is exposed, say so in the subject line.** That
is the one thing that gets looked at before anything else, whatever time it
arrives.

Useful things to include, roughly in order of how much they help:

- what you did, precisely enough to repeat it
- what happened, and what you expected instead
- the account or role you were signed in as, if any
- the URL, the HTTP status and the actual response body — not a screenshot of a
  coloured box, which is the same for several different failures
- whether you stopped at proof of access, or went further

## What to expect

This app is run by club volunteers, not a security team. There is no bounty, no
service-level agreement and nobody on call.

You should get an acknowledgement within a few days. If you have had nothing
after a week, send the email again — assume it was missed rather than ignored.

You will be told what was concluded and, if something is fixed, when it shipped.
If you would like to be credited, say so; the default is that you are not named.

## Scope

**In scope**

- `https://adhquins-clubhub.com` and everything served from it
- the `/calendar.ics` subscription feed
- the code in this repository, including the Supabase Edge Functions under
  `supabase/functions/`
- the row-level security policies in `db/`, which are the actual access control
  for this app — a policy that admits data it should not is the highest-value
  thing you could find here

**Out of scope**

- the club's other websites and domains, which are separate projects
- Netlify, Supabase and Resend themselves — report those to them; they run their
  own disclosure programmes and will handle it better than we can
- social engineering of club volunteers, coaches, parents or children
- physical access to anybody's device
- reports produced solely by a scanner, with no demonstrated impact

## Rules for testing

**This is production. There is no staging environment to test against.**

- **Use your own account only.** Do not attempt to access, modify, download or
  keep another person's data — and especially not a child's.
- **Stop at proof of access.** If you can read one record you should not be able
  to read, that is the finding. Do not enumerate the rest to size it up.
- **Delete anything you did retrieve**, and say in your report that you have.
- **No automated scanning, fuzzing, load testing or denial of service.** A
  parent trying to mark their child available for Saturday is the person your
  scan actually affects.
- **Do not send mail or notifications through the app** to anyone but yourself.
- **Do not disclose publicly** until the issue is fixed, or 90 days have passed
  and you have had no response.

Testing within these rules is welcome, and the club will not pursue you for it.
Testing outside them is not authorised by this file.

## Supported versions

**There are no releases and no version numbers.** The only supported version is
whatever is currently deployed to `https://adhquins-clubhub.com` from the `main`
branch. A finding against an older commit is only interesting if it is still
true of what is deployed.

## Already known

**`claude/open-items.md` is the live list of known weaknesses**, including
several that are unfixed and deliberately so, with the reasoning. Reading it
first will save you writing up something already on it — and if you think an
item there is rated too gently, that is itself worth an email.
