# Plan — the approval queue can name the person it is asking about

**STATUS: SHIPPED, 13 Aug 2026.** Written and built the same day, immediately
after `2026-08-13-multi-child-registration.md`.

## The report

Jay, watching a real registration land: *"when people are creating accounts and
the approval is popping into the approval section, it is not showing their name
or what they are requesting"* — then, minutes later: *"now it is appearing, is
it doing that temp until they confirm their email or whats going on?"*

## The measurement, not the theory

⚠️ **Email confirmation is ruled out, and the database says so.**
`register_my_player` refuses to create anything unless `email_confirmed_at` is
set, so a row in that queue **cannot** predate confirmation.

One real registration, read off the live database:

| Time (UTC) | Event |
|---|---|
| 08:34:27 | Profile created (signed up) |
| 08:34:46 | **Email confirmed** — 19s later |
| 08:35:50 | `register_my_player` → membership + player. **Queue row appears, nameless** |
| 08:38:33 | `name_confirmed_at` set. **Row fills in — 2m 43s later** |

## Root cause

`NamePrompt` is the only thing that captures a person's own name, and
`src/components/AppShell.jsx` mounts it inside the `ready` branch, which
requires `memberships.length > 0`.

**The membership is also what creates the queue row.** So the order was forced
and backwards, every time:

1. Sign up → profile, **no name**
2. Register a child → membership → **admin's queue row exists, nameless**
3. Only now is `ready` true, so only now does the name prompt appear
4. Name typed → row fills in

⚠️ **And it does not always resolve.** `NamePrompt` is skippable. Anyone who
taps past it stays nameless indefinitely — so this is not merely a few minutes
of cosmetic lag.

⚠️ **NOT caused by multi-child registration.** That change touched neither
`AppShell.jsx`, `NamePrompt` nor the queue. The gating predates it by days; the
volume of people arriving through self-registration is simply what made it
visible.

The comment at the `ready` gate explains the original reasoning — *"a name
prompt stacked on top of 'you have no access yet' is noise"* — which was a fair
call when the only people with zero memberships were strangers asking for
access. It was not revisited when self-registration became the primary route.

## What was built

**No database change.** Two fixes, and the first is the real one.

### 1. The registration form asks for the registrant's own name

`src/components/PlayerRegistrationForm.jsx` gains an **About you** fieldset —
first name required, family name optional — shown **only when
`profiles.name_confirmed_at` is null**. A parent adding a second child from
`/more` has long since answered and never sees it.

⚠️ **The name is written BEFORE the first `register_my_player` call, and the
order is the entire fix.** Writing it afterwards would leave the race exactly
where it was. A failure on the name write aborts the whole submit: nothing has
been created yet, and continuing would produce precisely the nameless row this
exists to prevent.

`updateProfileNames` reads the row back and throws on a refusal rather than
reporting a silent zero-row success, so that guard is real rather than hopeful.
The `useMyProfile` cache is primed on success — otherwise the person has just
given their name and the masthead keeps showing `?` until a reload.

### 2. The queue falls back to the email address

`src/screens/Accounts.jsx` rendered `Added by {full_name || 'No name yet'}` and
then printed the address as a **separate segment**, so a nameless row read
*"Added by No name yet · deniro@example.com"* — a placeholder standing directly
in front of the one fact that identifies the person. The address is now promoted
into the name slot, and not repeated.

This is the safety net, not the fix: rows created before today, or by any future
route that reaches a membership without a name, still land here.

## The arguments against

- **"Just move `NamePrompt` outside the `ready` gate."** Tempting and smaller,
  but it puts a modal in front of somebody who has just been told they have no
  access yet — the exact thing the original comment declined — and it still
  fires *after* registration, so the queue row would keep appearing first. It
  fixes the symptom's duration, not its order.
- **"Make `NamePrompt` non-dismissible."** A modal a person cannot leave is a
  trap, and `Sheet`'s own header says so. It also does nothing about the window
  between registering and answering.
- **"Show the email and stop worrying about the name."** That is fix 2, and it
  is worth having, but an admin approving a child recognises a parent's name far
  more readily than an address — and the club's whole approval decision rests on
  recognising people.

## Verification

Full suite green, production build green, `docs:check` green. New assertions,
each fault-injected — see the changelog entry for what was broken and what
failed as a result.

Covered: the field is absent when a name is already confirmed; present when it
is not; `updateProfileNames` is called **before** `register_my_player` (asserted
on call ORDER, which is the fix itself); a blank name creates nothing at all; a
refused name write creates nothing; a first name alone is accepted; the queue
shows the email when there is no name, exactly once; and it still shows both
when both are known.

⚠️ **NOT verified live by Claude** — the flow needs a parent sign-in, which
Claude does not do.
