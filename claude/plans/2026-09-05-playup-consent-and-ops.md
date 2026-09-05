# Junior play-up — parent consent, request/nominate, Club Ops (hybrid C)

**STATUS: SLICE 1 BUILT in this pull request.** Slices 2–3 are specified here
and not built. Dated 2026-09-05. Jay approved the full design the same day
(“go for everything”). Ruling:
`claude/decisions/2026-09-05-playup-parent-consent.md`.

Migration `db/migrations/20260914_junior_playup_consent.sql` is **not applied
to live from this PR** — Jay/Grok apply it. Harness
`db/tests/junior-playup-consent.sql`.

## Locked product (all slices)

After a super-admin adds a junior play-up guest (existing Age groups UI /
`add_junior_playup`):

- Guest appears on the host roster under **From other age groups** with
  **Play-up** + **Consent pending** for staff. Parents of *that* child see
  pending on a Home card and a Hub notification. Other parents: no
  Play-up/consent chrome (same #714 badge rule). Approved guests still follow
  #714 for parent badges.
- Linked parent(s): Hub **notification** (push, `approval` category, same
  rail as call-ups) + Approve/Decline **sheet** + sticky **Home card**.
  **No auto-timeout.**
- Approve → `playup_consent = approved`; match lineups unlock.
- Decline (or staff remove play-up) → guest memberships removed; relevant
  staff are notified.
- While **pending**: usable on the host for roster, chat, training/session
  plans, notices, docs. **Block only match lineup / fixture XV** (Lineup
  screen, every add-to-lineup path, and a `lineup_players` trigger).
- Direct super-admin add (no coach request yet) still starts **pending**.

### Slice 2 (later) — Request play-up / Nominate + head-coach flag

Host or home coaches request/nominate; head-coach flag as specified when
that slice is picked up. Not in this PR.

### Slice 3 (later) — Club Ops hybrid C

Club Ops page / Home band for outstanding play-up consents. Not in this PR.

Out of scope for the whole programme here: auto-timeout, senior call-ups
(already their own consent), demo videos.

## Slice 1 schema

`memberships.playup_consent` text, null or `pending` | `approved`.

⚠️ **Not `memberships.status`.** That column is registration
(`pending`/`active`/`left`). `can_see_team` requires `active`, so reusing it
would hide the guest from roster and chat — the opposite of the product.

Null on home rows and on senior call-up twins. Guest twins from
`add_junior_playup` insert `status = 'active'` and `playup_consent = 'pending'`.

RPCs (security definer, `search_path = public`, anon EXECUTE revoked by name):

| RPC | Who |
|---|---|
| `add_junior_playup` | super admin; twins pending; notifies the family |
| `remove_junior_playup` | super admin; deletes guest twins; notifies staff |
| `answer_junior_playup(_player, _guest_team, _yes)` | `private.is_own_player` only |
| `squad_guest_flags(_teams)` | any caller who `can_see_team`; returns player_id, team_id, playup_consent for **guests only** |

`listPlayers` reads guests through `squad_guest_flags`, not `memberships`
directly — `"memb read"` is own-row or admin, so a coach would otherwise
never see another family's guest twins.

`private.refuse_pending_playup_lineup` on `lineup_players` BEFORE INSERT OR
UPDATE OF player_id: 42501 `Parent consent is still pending for this play-up.`

Push uses `private.push_to_profiles` via `private.notify_junior_playup`,
which no-ops when `app.harness = on`.

## Slice 1 UI

- Staff roster: Play-up + Consent pending (`showGuestMark`).
- Lineup pool: pending guests visible, Start/Bench hidden, “Consent pending”.
- Home: `PlayupConsentBanner` + sheet (Approve / Decline). Sticky until
  answered. No dedicated `/playups` route in this slice.
- Age groups block: Consent pending on the guest chip.

## Apply on live

1. Apply `db/migrations/20260913_junior_playup.sql` if it is not already on
   live (order first).
2. Apply `db/migrations/20260914_junior_playup_consent.sql`.
3. `npm run db:check -- junior-playup` and `npm run db:check -- junior-playup-consent`.
4. Bare `npm run db:check` before treating production as done.
