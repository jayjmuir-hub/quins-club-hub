# Getting Quins Club Hub onto the Google Play Store

Written 6 Aug 2026. Decisions taken this session: **personal** developer
account, **TWA** packaging.

---

## 1. The two dates that set the timetable

**31 August 2026 — target API 36.** From that date every new app submitted to
Play must target Android 16 (API level 36). That is 25 days away. It is not a
problem — we build for 36 from the start — but it must not be got wrong,
because a TWA generator left on its default may emit an older target. An
extension to 1 Nov 2026 can be requested in the Play Console if needed.

**14 continuous days of closed testing, minimum.** A **personal** developer
account registered after 13 Nov 2023 — which yours will be — cannot publish to
production until it has run a closed test with **at least 12 testers opted in
continuously for 14 days**. Then you apply for production access and answer
questions about the testing.

⚠️ **The 14 days do not start until the app is uploaded and 12 people have
opted in.** If a tester drops out and the count falls below 12, the clock
restarts. Realistic earliest public launch, assuming nothing goes wrong:

| | |
|---|---|
| Account registration + identity verification | a few days, occasionally longer |
| Build, listing, forms, upload | 1–2 days of work |
| Closed test | **14 days minimum** |
| Production access review | up to ~7 days |
| **Earliest realistic public launch** | **≈ 4 weeks** |

The club has 279 people on the roster. Finding 12 testers is the easy part —
but they must each **accept the opt-in link and keep the app installed**.

---

## 2. The blocker nobody expects: the reviewer cannot get in

**This is the single most likely cause of a rejection, and it is not obvious.**

Play reviewers must be able to use the app. Quins Club Hub offers exactly two
ways in — a magic link by email, and Continue with Google — and it is
**roster-gated**: an account with no membership reads zero rows from every
table. A reviewer cannot receive a magic link sent to a club email, and handing
over a real Google account is both awkward and fragile.

Verified this session against the live auth server: a password sign-in attempt
returns `invalid_credentials`, **not** a provider-disabled error. So the
password grant **is already enabled** on the Supabase project. The missing half
is entirely in the app — there is no password field anywhere in the UI.

Public signup is closed (`/signup` returns 422), so a demo account has to be
created deliberately. That is the right posture; it just has to be done.

### The options

1. **Add password sign-in to the normal login screen.** Honest, testable, and
   useful beyond review — some parents will never manage a magic link. Most
   work. It also means password reset, which is a whole flow.
2. **A dedicated reviewer account with a password, reachable at a normal
   route.** Less work, no reset flow, no new surface for 279 members. The
   account is real and must be locked to a demo squad with no real children's
   data.
3. **Hand Play a Google account.** No code, but 2FA and Google's own
   "suspicious sign-in" checks make it unreliable, and the credentials sit in
   the Play Console indefinitely.

**Recommendation: option 2**, with the reviewer account scoped to a demo team
containing invented players. ⚠️ Do not point a reviewer at real children's
names, photographs and parents' phone numbers — that is an unnecessary
disclosure to a stranger, and the whole roster is visible once inside.

---

## 3. What is already done

- **Privacy policy** at a public URL that renders signed out — Play requires
  exactly this, and it was verified live this session.
- **Account deletion** at `/delete-account`, public, with the in-app route as
  well. Play requires both a web URL and an in-app path.
- **PWA manifest** is complete and TWA-ready: `standalone`, `scope: /`,
  `start_url: /`, 192 and 512 icons, and **maskable** variants. Nothing to add.
- **HTTPS with a real certificate**, service worker, offline behaviour.
- **No ads, no analytics, no third-party scripts** — which makes the Data
  Safety form short and honest.

---

## 4. Decisions needed from you before I can build anything

### 4a. Which domain is the app?

`app.adhjrt.com` and `adhquins-clubhub.com` **both serve the app with a 200 and
no redirect.** A TWA is bound to exactly one origin by the Digital Asset Links
file, and Play's listing points at one.

Pick one as canonical. The other should 301 to it. If we skip this, the app
works but the same content sits on two addresses, and any future asset-links
change has to be made twice or it silently breaks.

⚠️ This also affects the calendar feeds already subscribed by members — those
URLs cannot be changed remotely. Check which host they were handed before
retiring either domain.

### 4b. Reviewer access — option 1, 2 or 3 above.

---

## 5. The build, once those are settled

**Packaging: PWABuilder rather than Bubblewrap.** Both produce the same kind of
TWA. Bubblewrap is a command-line tool needing a JDK and the Android SDK
installed and matching; PWABuilder does it in a browser and hands back a signed
package. For a one-app, non-developer setup, the CLI's only advantage is
repeatability we do not need yet.

⚠️ **Check the generated target SDK before uploading.** This is the 31 August
item. If it is below 36, it must be raised.

**Digital Asset Links.** After the first upload, Play App Signing shows a
SHA-256 certificate fingerprint. That goes into
`public/.well-known/assetlinks.json` in this repo, deployed to the canonical
origin. ⚠️ **Until that file is live and correct, the app opens with a browser
address bar across the top** — which looks broken and is the most common TWA
complaint. It cannot be tested before the fingerprint exists, so this is a
deploy that happens mid-process, not up front.

### Listing assets still to be made

| Asset | Requirement |
|---|---|
| App icon | 512×512 PNG |
| Feature graphic | 1024×500 |
| Phone screenshots | at least 2 |
| Short description | ≤ 80 characters |
| Full description | ≤ 4000 characters |

The crest exists at 512; the feature graphic and screenshots do not exist yet.

### Data Safety declaration — drafted from the actual schema

Read off the live database this session, not assumed:

**Collected:** name, email address, phone number, photos (player head shots),
user IDs, and app activity (availability answers).

**Not collected:** location, financial info, health or medical info, contacts,
messages, browsing history. There are no such columns.

⚠️ The netlify.toml security-headers comment claims the app holds **dates of
birth**. It does not — there is no such column in any table. The privacy policy
is correct and does not claim it. Fix the comment so nobody later declares a
data type the app has never held.

**Also declare:** data encrypted in transit (yes), users can request deletion
(yes — `/delete-account`), data not shared with third parties, no data used for
advertising.

### Content rating and target audience

Answer the IARC questionnaire honestly — no violence, no gambling, no user-generated
public content. Expect "Everyone / 3+".

⚠️ **Target audience: adults only.** The app holds children's data but is not
*for* children — parents, coaches and staff hold the accounts and a child never
signs in, which the privacy policy already states. Declaring a child audience
pulls the app into Play's Families policy, with materially stricter rules.
Answer this deliberately, not quickly.

---

## 6. Order of work

1. Decide the canonical domain (4a) and the reviewer route (4b).
2. Register the Play developer account — **start this first, it has the
   longest and least predictable wait.**
3. Build the reviewer sign-in and the demo squad.
4. Generate the TWA, confirm target SDK 36, upload to closed testing.
5. Add `assetlinks.json` with the real fingerprint, deploy, confirm no address
   bar on a real device.
6. Listing assets, Data Safety, content rating, target audience.
7. Recruit 12 testers, confirm all 12 opted in, start the 14-day clock.
8. Apply for production access.

**Nothing in steps 3–8 can start before the account exists.** Register today.
