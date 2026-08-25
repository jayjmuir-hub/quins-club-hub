# Decision — finish RollCall before the confirmation email

*25 Aug 2026. Jay: people confirm the email and never come back. Waiting for
access shows no name and "hasn't said what they need".*

## What was happening

Confirmation is ON, so `signUp()` returns no session. The only moment they could
tell us who they are was *after* they opened the mail. The mail said "confirm to
finish setting up". They tapped it, closed the tab.

Anne Granelli (25 Aug, email confirmed, no name). Willow (21 Aug, not even
confirmed). Both sat in Waiting for access with Give access, looking like
approvals.

## What we do instead

1. Collect name, ticks, squads, children **before** `signUp()`.
2. Put that payload in `user_metadata.signup_intent` (not localStorage — they
   confirm on a different device).
3. `handle_new_user` copies it onto `profiles` and writes the `access_requests`
   row so the waiting card has a name and a role **before** they open the mail.
4. Players and staff memberships are created only when `email_confirmed_at` is
   set (`private.apply_signup_intent`). A typo'd address still must not mint a
   child.
5. Email copy: prove the address so the club gets the request. Not "finish
   setting up".

RollCall stays for people who already have a login and never finished.

## Explicitly not

- Turning confirmation off.
- Granting the roster at submit.
- Making parent/coach exclusive again.
