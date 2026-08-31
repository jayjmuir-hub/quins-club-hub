# Profile icons — the crown for U11

**Status: SHIPPED, 31 Aug 2026 — built to this spec the same day.** Both
migrations applied, harness green with a drop-the-policy self-test, every
render point live. One deviation: no `conversation_mentionables`-style
per-surface RPC anywhere — the two read paths below shipped exactly as
specced. The live proof outstanding: Jay's first real grant, seen on a
second account. Jay's idea, 31 Aug 2026:
"give U11 staff a crown icon because they are the best age group users of
Club Hub so far … super admins would be able to designate age group staff or
individual users with cool icons." Brainstormed the same day; every ruling
below is his.

## Rulings (Jay, 31 Aug 2026)

- **Form: an emoji beside the name.** Not an avatar-corner badge (fights the
  presence dot), not both (clutter).
- **Grants: squad-staff AND individual.** A squad grant decorates whoever is
  *currently* active staff (coach/manager/medic) on that team — the crown
  follows the job, no per-person rows. An individual grant pins one person.
- **Library: curated, 31 emoji, each with a name and default meaning.**
  All grantable, **nothing automatic** — 🔑 was proposed as an automatic
  super-admin marker and Jay ruled it grantable like everything else.
- **Stacking: grants accumulate; ONE primary shows** beside the name; the
  person card lists them all with their meaning lines.
- **Placement: chat + person card first.** Author names on bubbles
  (channels, groups, DMs), the group-header member line, and the person
  card. Roster/admin/exports deliberately untouched until it proves popular.
- **Reason line: per-grant, optional**, defaulting to the icon's library
  meaning — the custom line is what a tap shows ("Best age group users of
  Club Hub, summer 2026").
- **⚰️ Custom SVG whistle: EXAMINED AND DROPPED.** There is no whistle emoji
  in Unicode, so three hand-drawn SVG candidates were mocked at 16px; Jay:
  "no, don't like those" → "go with the clipboard". 📋 covers "coach". Do
  not re-propose bespoke glyph artwork here — the library's strength is
  that every icon is instantly legible, free, and travels anywhere text
  does; one defended glyph is a maintenance tail. (An SVG-capable entry
  shape was sketched and is recorded here only so the next person knows it
  was considered: `{key, emoji}` vs `{key, glyph}` with the renderer
  picking.)

## The library

One array in one client file (`src/lib/profileIcons.js`), key → emoji, name,
default meaning. Growing it is a one-line change; the only rule is every
icon carries a name and default meaning, because that is what makes a tap on
someone's crown say something. The 31: 👑 crown (best age group) · 🏆 trophy ·
⭐ star · 🔥 on fire · 🚀 rocket · 🎖️ medal (long service) · 🛡️ shield
(guardian) · 🏉 ball · 🦁 lion · ⚡ lightning · 🎯 bullseye (the kicker) ·
🤝 handshake (spirit of rugby) · 📣 megaphone (touchline award) · 🌟 rising
star · 🔑 key (holds the keys — trusted with the club) · 🧙 wizard (the
fixer) · 🦺 hi-vis (matchday setup) · ☕ coffee · 🍪 biscuit (bake sale
legend) · 🚌 bus (the taxi service) · 📸 camera (club photographer) ·
🎓 scholar (newest qualification) · 🧭 compass (founding spirit) ·
💪 workhorse · 🌈 rainbow (lifts the mood) · 🧊 ice (cool head) · 🎉 party
(social committee) · 🌱 seedling (grows the game) · 🔨 hammer (the builder) ·
🥇 gold (top of the table) · 📋 clipboard (the gaffer — the coach icon,
standing in for the whistle Unicode never made).

The database stores only the KEY (format-checked, not an enforced enum — a
DB allowlist would cost a migration per new icon). The grant UI offers only
library keys; the renderer ignores keys it does not know, so an unknown key
fails to nothing rather than to garbage.

## Data model

`public.profile_icons`:

| column | note |
|---|---|
| `id` | uuid pk |
| `club_id` | fk clubs |
| `profile_id` | nullable — the individual grant target |
| `team_id` | nullable — the squad-staff grant target |
| `icon` | text key, format-checked (`^[a-z0-9_]{1,32}$`) |
| `reason` | text nullable — the custom line; null = library default |
| `is_primary` | boolean default false — which one shows beside the name |
| `granted_by` | fk profiles |
| `created_at` | timestamptz |

Check: **exactly one of `profile_id` / `team_id` is set.** RLS: authenticated
club members READ (recognition is public club-wide by definition); WRITES
super admins only, enforced by policy on `is_super` — a database boundary,
not a hidden button, matching the admin-rights direction.

**Who wears what** is resolved at read time, never materialised: an
individual grant decorates its person; a squad grant decorates every profile
with an active coach/manager/medic membership on that team, for exactly as
long as that membership stands. The primary shown beside a name: newest
`is_primary` grant, else newest grant.

## Read paths — two, deliberately

1. **`club_icon_map()`** — one RPC returning `(profile_id, icon)` for every
   member's primary icon in the caller's club. Chat surfaces render dozens
   of author names at once; per-author fetches would crawl. One tiny cached
   call (apiCache, same stance as presence/nicknames: decoration — a failed
   fetch renders no icons, never an error).
2. **`member_icons(_profile)`** — the person card's richer call: all of one
   person's icons with icon key, reason, and grant date, newest first. The
   card renders each with its meaning line (custom reason, else library
   default).

## The grant screen

A super-admin-only "Icons" section under admin: the library as a tappable
grid (emoji, name, default meaning), then target — "a squad's staff" (squad
picker) or "a person" (the existing person-picker) — an optional reason
line, and Save. Below: current grants (squad grants and individual grants,
labelled), each with Revoke and Make primary. Granting 👑 to U11 staff is
three taps.

## Render points

- Chat bubbles: primary icon after the author's display name (the nickname
  layer already resolves the name; the icon rides after whatever renders).
  Channels, groups, DMs — all through the shared message-row components.
- Group header member line: icon after each first name.
- Person card: the full list with meaning lines.
- **Nothing else.** No push text, no roster, no exports, no calendar. An
  emoji would technically travel in push text; that door is deliberately
  not opened in v1.
- Minors may be granted icons — recognition is the point and an emoji
  carries no personal data.

## Tests (each proven against an injected fault, red first)

- **DB harness** (`db/tests/profile-icons.sql`, rollback pattern with
  self-test): a non-super write is REFUSED (control: a super write lands);
  a squad grant decorates current staff and stops decorating someone whose
  membership is deactivated mid-transaction; `club_icon_map` matches the
  grants (control that it can see a known row); exactly-one-target check
  refuses a both-set row.
- **UI**: icon beside the author name when the map carries it, absent when
  not; person card lists all with reason lines; grant screen: library grid
  → target → save calls the RPC with the right shape; revoke and
  make-primary. All red-first.
- **Live after deploy**: a real grant made by Jay, seen on a second account.

## Out of scope, on purpose

- Avatar-corner badges, roster/admin/export rendering, push-text icons.
- Self-service or non-super granting; icon "requests".
- Custom artwork (the whistle tombstone above).
- Seasonal auto-expiry — grants live until revoked; revisit only if the
  library starts to look stale.

## Cost when built

One migration, one deploy.
