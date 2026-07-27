# Task 5 Report — Login screen

## What I implemented

**`src/screens/Login.jsx`** — default export `Login`, self-contained (no
router dependency, no shared component imports — the shared library is
Task 9). Consumes `useAuth()` for `signInWithEmail` and `signInWithGoogle`
only (`signOut`/`session`/`user`/`loading` are not used here — this screen
is for signed-out visitors).

Structure: full-viewport red→green brand gradient background (same gradient
literal already used in `src/App.jsx`), a centred white card (crest, app
name, tagline, one-sentence invite-only context line), then either:
- the sign-in form (email field + "Email me a link" primary button, a
  divider, "Continue with Google" secondary/outlined button), or
- a "Check your email" confirmation (shown after a successful send, names
  the exact address, offers a "Use a different email" button back to the
  form).

State is exactly the three fields specified: `email`, `status` (`'idle' |
'sending' | 'sent'`), `error`. No form library.

Validation: native `type="email"` + `required` on the input, plus a JS guard
(`EMAIL_PATTERN` — a simple non-empty regex check, not a validation
library) that blocks the call and shows an error if the trimmed value is
empty or doesn't look like an email.

Both `signInWithEmail` and `signInWithGoogle` share the same `status`/`error`
state: clicking either sets `status: 'sending'` (disabling both buttons),
catches a thrown error into `error` and resets `status` to `'idle'`, or (for
email) advances to `status: 'sent'` on success. The error paragraph has
`role="alert"` so it's announced, and is used identically for both the
client-side validation message and any error thrown by `useAuth`.

## What I tested (10 cases in `tests/login.test.jsx`)

`../src/lib/auth.jsx` is mocked (`vi.mock`) so the test exercises only the
screen's own behaviour, not `AuthProvider`'s internals, and never touches the
network.

1. Email field has an accessible name (`getByLabelText`) — fails if the
   `<label>`/`htmlFor` wiring is missing.
2. Renders the app name, tagline, and an invite-only context sentence.
3. Entering an email and submitting calls `signInWithEmail` with that exact
   email.
4. Shows "Check your email" naming the submitted address after a successful
   send.
5. "Use a different email" returns to the form (confirmation disappears,
   email field reappears).
6. An empty or invalid email never reaches `signInWithEmail` (guard test).
7. An error thrown by `signInWithEmail` renders in a `role="alert"` element
   with the thrown message.
8. The submit button is `disabled` while the `signInWithEmail` promise is
   pending, and re-enables/advances once it resolves (tested with a
   manually-resolved promise to catch the in-flight window).
9. Clicking "Continue with Google" calls `signInWithGoogle`.
10. An error thrown by `signInWithGoogle` renders in a `role="alert"`
    element with the thrown message.

## TDD evidence

### RED
Command: `npm test -- tests/login.test.jsx` (run before `src/screens/Login.jsx` existed)
```
FAIL  tests/login.test.jsx [ tests/login.test.jsx ]
Error: Failed to resolve import "../src/screens/Login.jsx" from "tests/login.test.jsx". Does the file exist?
...
 Test Files  1 failed (1)
      Tests  no tests
```
Expected: the screen module didn't exist yet, so the suite failed to collect
— confirms the tests genuinely target the not-yet-built screen.

### GREEN
Command: `npm test -- tests/login.test.jsx` (after implementing `src/screens/Login.jsx`)
```
 ✓ tests/login.test.jsx (10 tests) 608ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### Full suite + build (final verification, post-commit)
`npm test`:
```
 ✓ tests/auth.test.jsx (12 tests) 259ms
 ✓ tests/login.test.jsx (10 tests) 660ms
 ✓ tests/supabase.test.js (4 tests) 69ms
 ✓ tests/app.test.jsx (1 test) 34ms

 Test Files  4 passed (4)
      Tests  27 passed (27)
```
`grep -in "warn|act(|unhandled"` over the full output returned nothing — no
React `act()` warnings, no unhandled rejection noise.

`npm run build`:
```
✓ 32 modules transformed.
dist/index.html                   0.81 kB │ gzip:  0.40 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-9g-HcJG3.css    9.54 kB │ gzip:  2.77 kB
dist/assets/index-lSUaatTE.js   143.22 kB │ gzip: 46.12 kB
✓ built in 1.30s
```
Clean build, no warnings. (Note: `Login.jsx` is not yet imported by
`App.jsx`/`main.jsx` — Task 6 wires up routing — so it doesn't add to this
bundle yet; its correctness is verified via the Vitest run, which does
transpile and execute it.)

## Files changed
- `src/screens/Login.jsx` (new)
- `tests/login.test.jsx` (new)

One commit: `32f9b5d` — "feat: add login screen with magic-link and Google sign-in"

## Design-system values used, and where I took them from

All from `docs/design-system.md` unless noted:
- Header/hero gradient: `linear-gradient(100deg, var(--plum) 0%, var(--maroon) 42%, #B23A38 62%, var(--green) 100%)` (§1) — reused verbatim as the page background, matching the exact literal already implemented in `src/App.jsx` (`theme(colors.quinsRedDark)` = plum/`#8E1526`, `theme(colors.quinsRed)` = maroon/`#C21F32`, `#B23A38` inline mid-stop, `theme(colors.quinsGreen)` = `#7DC351`).
- Card: white bg, `border-radius: 16px` (`--radius`), `box-shadow: 0 6px 24px rgba(20,20,20,.10)` (`--shadow`), `1px solid var(--line)` (`#e6e3e1`) (§3, "Card").
- Text colours: `--text` `#221f1d` (headings, values), `--muted` `#77726e` (tagline, context line, labels, secondary copy) (§1).
- Form field styling (§4.17): label `12.5px`-ish/700/uppercase/`.4px` tracking/muted → implemented as `text-xs font-bold uppercase tracking-wide text-[#77726e]`; input `padding:11px 12px; border-radius:11px; 1.5px solid var(--line); font-size:16px` (16px avoids iOS zoom-on-focus, per §2) → implemented as `rounded-[11px] border-[1.5px] border-[#e6e3e1] px-3 py-2.5 text-base`; focus is a colour-only border swap to maroon (§4.17) → `focus:border-quinsRed`, deliberately not paired with `outline-none` so the browser's native focus outline is preserved (design system flags "no focus trap / no visible-focus gaps" as things to fix in the rewrite, §8).
- Buttons (§3, §4): `padding:10px 15px; border-radius:11px` → `rounded-[11px] px-4 py-2.5`; primary = maroon bg/white text (brand red per binding constraint); secondary/Google = outlined per the brief's explicit instruction (not literally in the prototype, which has no Google button — I used the prototype's existing outline/ghost button visual language: white bg, `1.5px` line border, dark text, hover border → maroon).
- Divider "or": plain hairline (`bg-[#e6e3e1]`) either side, consistent with `--line` usage elsewhere for dividers (§3).
- Error banner: intentionally **not** the literal `--bad`/`--bad-bg` pair (`#d1483b` on `#fbeae8`) — I computed its contrast ratio (~3.84:1) and it fails WCAG AA (4.5:1) for normal text. I kept the `--bad-bg` background (`#fbeae8`) but used `quinsRedDark` (`#8E1526`, already a Tailwind brand token) for the text, which gives ~7.9:1. Documented here since it's a deliberate deviation from the literal token table in service of the brief's own AA requirement.
- Confirmed `quinsGreen` (`#7DC351`) is never used as a text colour anywhere in the file — only as a gradient stop — per the binding constraint that it fails AA for text on white.

## Self-review findings

- Re-read every brief bullet against the implementation: crest ✓, email
  field ✓, "Email me a link" / "Continue with Google" labels verbatim ✓,
  success/error/loading states ✓, accessible label ✓.
- Confirmed state is exactly `email`/`status`/`error` — no extra state
  fields, no form library added.
- Confirmed no sign-up, password field, "remember me", extra social
  providers, or membership/role logic anywhere in the file.
- Confirmed the screen renders standalone with no `react-router-dom`
  import — matches "no router dependency" instruction; Task 6 will route to
  it.
- Confirmed `quinsGreen` never appears as a text colour (grepped the file).
- Computed WCAG contrast ratios by hand for every non-obvious colour pairing
  (error text on error bg, muted text on white, quinsRed as button bg and as
  button text on white) — all ≥4.5:1 for normal-weight/size text; documented
  the one deliberate deviation from the literal design-system token above.
- Verified the validation guard doesn't call `signInWithEmail` for empty or
  malformed input (explicit test), and that it doesn't leave `status` in
  `'sending'` on a validation failure (guard returns before `setStatus`).
- Verified both action handlers reset `status` to `'idle'` on error (so the
  form/buttons re-enable) rather than getting stuck disabled.
- Verified the "disabled while sending" test actually captures the in-flight
  window (manually-resolved promise) rather than only checking pre/post
  states.
- Ran `npm test` and `npm run build` after the commit as a final check
  (not just before) — both still pristine.
- Considered whether the Google button should also flip to some kind of
  "redirecting…" confirmation state like the email flow's "sent" state —
  decided against it: `signInWithGoogle` triggers a real browser navigation
  in production, so there's nothing meaningful to confirm client-side before
  the redirect happens; the shared `sending` disabled-state already prevents
  double-clicks.
- Considered clearing the `email` input when returning via "Use a different
  email" — decided to leave the value in place (likely just a typo fix, not
  a fresh start), which is a reasonable UX default not contradicted by the
  brief.

## Issues or concerns

None. All brief checklist items are covered, tests are RED→GREEN with
real behavioural assertions, `npm test` and `npm run build` are both
pristine, and accessibility (label wiring, `role="alert"`, focus
visibility, AA contrast) was independently verified, not just asserted.
