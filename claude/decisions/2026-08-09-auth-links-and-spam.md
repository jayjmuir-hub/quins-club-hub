# Decision — auth links on our own domain, and the spam work (9 Aug 2026)

**Status:** ✅ done and **verified end to end**. Commits `fe5a308` and
`67cb5a5`. `send-email` v30, `notify-approval` v2 (v3 later the same day),
Netlify deploy ready.

⚠️ **Written into the Claude project on 9 Aug and committed here later the same day.**

**Live proof, 9 Aug 2026** — a real signup to a Gmail address:

- delivered to the **Inbox**, not spam
- subject *"Confirm your email address"*, body says they'll sign in with the
  password they just chose
- link reads
  `https://adhquins-clubhub.com/auth/confirm?token_hash=…&type=signup&next=…`
  — no `supabase.co`, no project ref
- **clicking it signs the person in.** Jay confirmed.

## ⚠️ CORRECTION — the DNS was never broken

An earlier version of this document said the SPF TXT and bounce MX were
**missing** and that this was the spam cause. **That was wrong.** Jay's
screenshot of the Resend dashboard showed all three records Verified, and a
re-query confirmed it:

```
TXT  send.send.adhquins-clubhub.com   v=spf1 include:amazonses.com ~all
MX   send.send.adhquins-clubhub.com   10 feedback-smtp.ap-northeast-1.amazonses.com
TXT  resend._domainkey.send.adhquins-clubhub.com   p=MIGfMA0...
```

**⚠️ NOTE THE DOUBLE `send`.** Resend puts the bounce/envelope domain **one
level below** the sending domain, so a domain of `send.adhquins-clubhub.com`
has its MAIL FROM at `send.send.adhquins-clubhub.com`. The earlier check queried
the single-`send` name, got `NoAnswer`, and reported the records as absent — a
wrong diagnosis reached by looking in one place and never checking it was the
right place. **Jay was one step from editing DNS that did not need editing.**

Alignment was fine all along: DKIM signs as `send.adhquins-clubhub.com`,
matching the From domain; the envelope domain shares the organisational domain,
which relaxed DMARC (`aspf=r`) accepts. **DMARC passes on both mechanisms.**

Region is **Tokyo (ap-northeast-1)**, matching the MX host. No reason to change
it — see the region note below.

## What was actually wrong

### 1. The link — a real cause, now fixed

Every auth email pointed at
`https://lusmshimxdcxpnrktlgz.supabase.co/auth/v1/verify?...`, while the mail
was *from* `send.adhquins-clubhub.com`.

**⚠️ Sender domain ≠ link domain is a textbook phishing signature**, weighted
heavily by Gmail, Outlook and Yahoo. So *"how do we fix the link saying lush?"*
and *"why is it going to spam?"* were the same question.

**⚠️ Nothing ever forced that shape.** The Send Email Hook hands over a
`token_hash`, **not a finished URL**. Links now go to `/auth/confirm` on the
club's own domain (`src/screens/AuthConfirm.jsx`), which redeems the token with
`verifyOtp` and routes the person onward.

The paid alternative — Supabase's custom-domain add-on — was rejected on cost:
it needs a paid plan and this org is on **Free**, so Pro + add-on ≈ **$35/month**
to change a hostname in an email. Revisit only if the project moves to Pro
anyway; `/auth/confirm` keeps working either way.

#### ⚠️ The open redirect this could have been

`next` arrives in a query string, from an email, and redirects **after** a
session exists. Unvalidated, that is a link on the club's own domain that signs
someone in and bounces them to an attacker's site carrying the club's trust.

`safeNext()` accepts **same-origin paths only**, tested against the four ways
people get this wrong:

- absolute URLs on another origin
- lookalike hosts — `https://adhquins-clubhub.com.evil.example/`
- **protocol-relative `//evil.example`** — passes a naive "starts with `/`"
  check, and a browser reads it as a *host*
- the backslash variant `/\evil.example`, which browsers normalise into it

Fault-injected with the naive check: 2 red.

#### Two other traps in that screen

- **Recovery ignores `next`, always.** `verifyOtp` establishes a recovery
  session that exists for one purpose; honouring `next` would drop the person on
  the dashboard holding it with nowhere to spend it.
- **The token is single-use and StrictMode mounts effects twice.** ⚠️ The first
  version of that test used `rerender`, which re-renders the *same mounted
  component* and never re-runs the effect — it passed with the guard
  deliberately removed. Rewritten with `StrictMode`, which does fail.

### 2. The copy was lying — twice, from the same root

**The signup email.** `signup` shared the magic-link template — correct when
magic links *were* the sign-in method, wrong from the moment password auth
landed on 8 Aug. Every parent who created an account with a password was then
told, by name: *"You won't need a password."* Now its own template.

**"The button below."** Every intro said it. There is no button in a plain-text
part, so the instruction pointed at something absent. Reworded to *"the link
below"*, true in both halves.

Both share a root: **templates written for one channel and one auth method,
inherited by another without being re-read.**

### 3. HTML-only mail

Both functions now send **multipart/alternative**.

⚠️ `layout()` returns **both halves from one set of inputs** rather than
exposing a second function taking the same arguments. Two entry points would be
two things to remember, and the plain-text one — which almost nobody looks at —
would be the one left stale.

⚠️ **The text part is not HTML-escaped**, deliberately. The HTML half escapes
because the values land in markup; escaping plain text would show a reader
`&amp;` in the body of the mail.

## What is left, and it is not technical

The domain was added to Resend on **5 August**. Filters treat a new sending
domain with no history as untrusted, and **Yahoo is harshest about it** — a
parent's confirmation was junked there before these fixes.

⚠️ **The Gmail result above does NOT settle Yahoo.** It was Gmail→Gmail, the
easiest possible case. Test a Yahoo address before judging deliverability, and
expect to tell the first pilot parents to check their junk folder. That is
normal for a domain this new and is **not** a sign anything is broken.

## Replies

`MAIL_FROM` is `noreply@send.adhquins-clubhub.com`, `REPLY_TO` points at the
admin account, and replies also land in the noreply mailbox — so a parent who
replies **is** reaching a person. Confirmed by Jay.

Cosmetic only: `noreply@` tells parents not to use a channel that works.
`hello@` or `clubhub@` would invite the question instead. Only `MAIL_FROM`
changes; the domain is already verified, so nothing needs re-verifying.

## On changing the Resend region

Possible — delete the domain, re-add choosing a new region, republish DNS — but
**it regenerates the DKIM key and stops mail until the new records verify**. It
would not have fixed anything here. Four regions exist (N. Virginia, Ireland,
São Paulo, Tokyo); none is in the Middle East. Tokyo is fine. Don't.

## Left to do

1. ~~`APPROVAL_NOTIFY_SECRET` in Supabase → Edge Functions → Secrets.~~
   ✅ **Set by Jay and verified end to end** later on 9 Aug — a real registration
   produced `{"sent":2}`. See
   `claude/decisions/2026-08-09-approvals-emails-and-accounts.md`.
2. Test deliverability to a **Yahoo** address (see above). **Still outstanding.**
