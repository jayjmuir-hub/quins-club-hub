# Chip apply is already staff

**27 Aug 2026 — Jay, option 2.** Applying a focus chip (or a From-coaches /
browse hour that uses the same `applyChipHour` path) writes that hour onto the
selected training night **and leaves visibility at `staff`**. Families do not
see it. The date strip then reads Staff, not Draft.

This is `setSessionVisibility` after `createSession` / `saveSessionBlocks`. It
is **not** `publish_training`. Calendar and template bulk publish stays the
Director RPC. Coaches already set this column from Session Plan; chip apply
uses the same write.

## What does not change

- Already **`squad`**: do not downgrade. Parents who can already see the plan
  keep seeing it.
- From-scratch Session Plan (blocks without a chip): the coach still chooses
  draft / staff / squad. `createSession`'s default is untouched.
- Library "add drills to tonight" (`appendDrillsToSession`) is not a chip
  apply. Leave it.
- No toggle on date-strip chips. `TrainingPublish.jsx` unchanged.

Settled against leaving the night as `draft` (option 1) and against promoting
it to `squad` (families) from a chip tap.
