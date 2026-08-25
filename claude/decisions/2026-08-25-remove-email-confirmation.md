# 2026-08-25 — Email confirmation is removed; the mail becomes a welcome

**Jay's decision, 25 Aug 2026, in his own words: "we are going to remove the
need to confirm an email address, we will change it to just sending an email
confirming they created their account and welcoming them to ClubHub, this is
my decision."**

## What changed

- The Supabase dashboard's **"Confirm email" toggle goes OFF** (it had been ON
  since 8 Aug 2026). A signup returns a live session; the person is in the app
  the moment they choose a password.
- The mail a new account gets is a **welcome** — "your account is created,
  a volunteer will approve your request" — with **no token and no link that
  gates anything**. Sent by the house notify pattern:
  `on_auth_user_created_welcome` trigger → pg_net → `notify-welcome` edge
  function → Resend. Migration:
  `db/migrations/20260825_welcome_email_no_confirm.sql`.
- `private.apply_signup_intent` **lost its email_confirmed_at gate** and now
  also runs from `handle_new_user` when the row is born confirmed. Without
  that, autoconfirmed signups would never have their wizard answers turned
  into pending memberships — the UPDATE the old trigger watched for never
  happens.

## Why

The confirmation step was costing real signups: measured on the Accounts
screen on 25 Aug, a four-day-old login that had never opened the mail, and
confirmed people landing as "Unnamed" (the problem the same-day
`signup-before-confirm` work addressed from the other side). The email proved
an inbox; **admin approval was always the real gate** on anything the club
acts on, and it still is.

## What was deliberately given up

- **"A typo'd address must not mint a child."** A mistyped email now creates
  an account and pending rows like a correct one. Accepted: the pending row is
  visible to an admin either way, and the welcome mail bouncing is the signal.
- The anti-enumeration property weakens at the API level: a signup that
  returns a session says the address was new. GoTrue's obfuscated
  already-registered response is unchanged and the screen copy still refuses
  to say "that address is taken".

## What was kept, deliberately

- `on_auth_user_email_confirmed` and the send-email `signup` template —
  legacy accounts created before the flip still confirm through their old
  links. Mothballed, not deleted (same ruling shape as passwordless, 8 Aug).
- `complete_signup_intent` RPC — now also called from Login when a session
  comes back, as the client retry for the insert-time trigger.
- `AuthConfirm.jsx` — still the lander for recovery and email-change links.

## Made obsolete once the toggle flips (recorded in open-items)

- `notify-unfinished-signup` and the `signup_nudges` machinery — nobody can
  be "unconfirmed" any more; the remaining pre-flip limbo cohort is the only
  audience it will ever have again.
- The send-email `signup` template becomes unreachable for new signups.

## Order of operations (the toggle is LAST)

1. Deploy the `notify-welcome` edge function (`verify_jwt: false`).
2. Apply the migration — safe while the toggle is still ON: everything in it
   is keyed on a row being born confirmed, which cannot happen yet.
3. Merge/deploy the app code — also state-agnostic.
4. **Jay flips "Confirm email" OFF in the dashboard.** Nothing before this
   step changes behaviour.
