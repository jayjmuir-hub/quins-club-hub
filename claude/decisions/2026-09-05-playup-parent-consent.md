# Decision — junior play-up waits on a linked parent, not on registration status

*5 Sep 2026. Jay approved the full play-up design (“go for everything”).
Slice 1 ships parent consent. Spec:
`claude/plans/2026-09-05-playup-consent-and-ops.md`.*

## What Jay decided

A junior added to a second age group is a **guest membership**. They may use
the host squad immediately for roster, chat, training, notices and documents.
They may **not** be picked for a match until a **linked parent of that child**
says yes. There is no auto-timeout. Decline (or staff remove) drops the guest
place and tells staff.

Direct super-admin add still starts as pending parent consent. Coach
request/nominate (slice 2) and Club Ops hybrid C (slice 3, `/ops`) do not
change this gate.

## Why this is not `memberships.status`

`memberships.status` is the **registration** gate (`pending` until a coach
approves a family). `private.can_see_team` requires `status = 'active'`. If a
play-up guest were `pending` there, they would disappear from the host roster
and chat — the opposite of the product.

Consent is therefore a separate enum on the guest row:
`playup_consent` = `pending` | `approved`, null on home rows and on senior
call-up twins (those already have `callup_requests`).

Do not collapse the two flags. Do not add a boolean “consented” that cannot
say pending.

## Who may answer

Only `private.is_own_player` — a linked parent (or the player’s own login).
Staff remove remains `remove_junior_playup` (super admin in slice 1). Other
parents on the host squad never see Play-up or Consent pending chrome
(#714).

## Lineup is the only block

The database refuses `lineup_players` rows for a pending guest of that
fixture’s squad. The Lineup screen hides Start/Bench. Everything else on the
host stays open.
