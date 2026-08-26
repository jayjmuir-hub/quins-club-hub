# Coaches and managers preview their squad as a parent

**26 Aug 2026 — Jay.** Asked whether coaches/managers can view their age
groups as a parent; told no (View as was admin-only); offered the feature
with one design question — should a coach also get the Coach persona for
squads they don't run? His answer settled both halves at once: *"i want
them to be able to view as a parent of their own age group so they can see
what parents will see."*

## The shape

- **Who:** an ACTIVE `coach` or `manager` membership. Medic deliberately
  absent — he named coaches and managers. Pending rows count for nothing
  (the 17 Aug "a request is not access" rule, unchanged).
- **What:** the PARENT persona only, in THEIR squads only. No coach
  persona, no other squads — both were offered and declined.
- **Where enforced:** `parentPreviewTeamIds()` in `src/lib/scope.js`, read
  by the MembershipProvider gate (a stored preview in any other shape
  self-heals away exactly like a forged admin one), the AccountMenu
  trigger, `ViewAsOptions`, and `ViewAsBanner`.

## What it is not

Unchanged from the admin feature: the preview filters what this browser
displays and never widens access — RLS still answers for the person's real
auth.uid(), so a coach previewing "parent" sees their own coach-visible
data through the parent layout, nothing more. The wording ("preview",
"filtered in your browser only") stays load-bearing for that reason.

## History

The old state was itself asserted by tests ("is not offered to a coach" in
`tests/view-as.test.jsx`, "refuses to preview for a non-admin" in
`tests/memberships.test.jsx`); both flipped with this ruling and their
replacements pin the refusals that still hold (pending coach, medic,
wrong persona, wrong squad, parent).
