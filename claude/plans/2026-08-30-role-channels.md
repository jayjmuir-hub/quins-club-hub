# Role channels — club-wide chats derived from roles (30 Aug 2026)

**Status: SHIPPED** (see changelog for the PR).

Jay: group chats for club-wide staff circles, without the staleness of a
hand-ticked member list. Settled design, from the conversation of 30 Aug:

## The five channels

| Channel | key | Who is in it |
|---|---|---|
| Club Head Coaches | `headcoaches` | coach memberships with `is_head_coach`, plus admins ticked `chat-headcoaches` |
| Club Age Group Managers | `managers` | manager role anywhere, plus admins ticked `chat-managers` |
| Club Medics | `medics` | medic role, plus admins ticked `chat-medics` |
| Welfare | `welfare` | admins holding the existing `welfare` right — the grant IS the membership |
| Club Staff | `clubstaff` | any active staff role: coach, manager, medic, admin |

Membership is DERIVED, never stored: gain the role and you are in, lose it and
you are out. Admin access to the first three is a per-admin tick in the
existing admin-rights editor — super-only, audited, default off — so channels
start pure and an admin is in one only when a super deliberately puts them
there. Welfare deliberately does NOT include untick'd admins: it is the
tightest circle in the system (same grant that gates DM review).

## How it lands in the schema

`messages.channel` gains the five values (team_id NULL, conversation_id NULL —
a shape check enforces it). One new helper `private.in_role_channel(channel,
club)` answers membership; the four messages policies, `can_reply_to`, the
provenance trigger's mention filter, and `my_chats` each gain a role-channel
arm that calls it. `my_chats` returns the channel key as `kind`.

## Member sheets (all channels, not just role ones)

`public.channel_members(_channel, _team)` returns (profile_id, full_name,
reason) for any channel the caller can read — reason strings like
"Head coach — U10 Mixed" / "Manager — U18G" / "Admin — chat access", since a
derived list can explain itself where WhatsApp cannot. UI: member count under
the channel title; tap → sheet with the list, searchable; tap a member →
start a DM (the existing open-conversation flow).

## Deliberately NOT in v1

- Push notifications for role-channel posts (squad chat only pushes staff
  posts today; parity can come later).
- Tagging in ad-hoc GROUP chats — parked by Jay, 30 Aug. Role channels ride
  ChannelThread so they inherit the mention picker for free.
- channel_settings (announce-only etc.) for role channels.

## New admin rights

`chat-headcoaches`, `chat-managers`, `chat-medics` — client-list only
(ADMIN_RIGHTS has no DB constraint, by design), labels in adminRightLabel.
