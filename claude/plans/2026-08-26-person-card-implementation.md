# Person Card Implementation Plan

**Status: SHIPPED — all nine tasks done. Merged as `abef0d7` (#434); the
Task 2 apply landed once Jay approved it, and the Task 9 live check ran on
the deployed site the same day. The parent-privacy negative is proven by the
harness, not by the live check — an admin login cannot demonstrate it, and
"View as" does not change what the database answers.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap any adult's name anywhere in the app → a bottom-sheet card with photo, role and Call / WhatsApp / Email / Chat, enforced server-side.

**Architecture:** One new SECURITY DEFINER RPC (`member_contact_card`) applies the visibility ruling in the database; one `PersonCard` sheet and one `PersonName` tappable wrapper on the client; screens adopt `PersonName` one at a time. Spec: `claude/plans/2026-08-26-person-card.md`.

**Tech Stack:** React + Vite, Tailwind, Supabase (Postgres RLS + RPC), vitest, `db/tests/` rolled-back SQL harnesses.

## Global Constraints

- **Never `git add -A`** — stage explicit paths. Never `[skip ci]`.
- **Invented names only, everywhere** — tests and SQL comments use the house `Zz Probe …` / `zz-…@example.invalid` pattern (CLAUDE.md rule 9).
- **The ruling (Jay, 26 Aug 2026, option C):** an active staff or admin role (coach / manager / medic / admin role value, or `is_super`) makes your phone + email visible to ANY active club member. Parents: contacts visible only to super admins and to staff of a squad the parent belongs to (existing scopes). Children: never a contact card.
- Migration must be IDEMPOTENT (`create or replace`, `drop … if exists`) — the harness inlines it verbatim and re-runs against a database where it is already applied.
- `npm run test:watch` while editing; `npm run test:related -- <file>` for one check; full `npm test` only before push. `npm run docs:check` after any `claude/` edit and after each commit.
- DB harness: `npm run db:check -- person-card` (needs `SUPABASE_DB_URL`; if missing, STOP and ask Jay — `claude/runbooks/db-harnesses.md`). Everything rolls back.
- Work stays on branch `claude/person-card`. Pushing and merging is Jay's call.

---

### Task 1: The migration and its harness

**Files:**
- Create: `db/migrations/20260826_member_contact_card.sql`
- Create: `db/tests/person-card.sql`
- Modify: `db/schema/functions.sql` (re-capture the two functions at the end of the task)

**Interfaces:**
- Produces: RPC `public.member_contact_card(_profile uuid)` returning one row
  `(profile_id uuid, full_name text, role text, title text, is_super boolean, squads text[], phone text, email text, photo_path text, photo_focus_x smallint, photo_focus_y smallint)` — `phone`/`email` are NULL unless the viewer is entitled. Task 3 calls it via `supabase.rpc('member_contact_card', { _profile })`.

- [ ] **Step 1: Write the migration**

`db/migrations/20260826_member_contact_card.sql`:

```sql
-- 26 Aug 2026 — the person card: tap any name, contact the person.
-- Jay's ruling (option C, claude/plans/2026-08-26-person-card.md): taking a
-- staff or admin role makes you contactable by ANYONE in the club — extends
-- the 13 Aug "staff automatically opts in" ruling from squad-scoped to
-- club-wide. Parents stay chat-only except to the staff who manage them
-- (super admins, or squad staff of a squad the parent belongs to — the same
-- scopes Player Detail's parent block already uses). The card never grants
-- access: this function nulls the contact columns server-side, so a phone
-- number never reaches the browser of somebody not entitled to it.

begin;

create or replace function public.member_contact_card(_profile uuid)
returns table(
  profile_id uuid, full_name text, role text, title text, is_super boolean,
  squads text[], phone text, email text,
  photo_path text, photo_focus_x smallint, photo_focus_y smallint
)
language sql stable security definer
set search_path to 'public'
as $$
  with viewer as (
    select exists (
      select 1 from memberships m
       where m.profile_id = auth.uid() and m.status = 'active'
    ) as is_member
  ),
  -- The target's "best" active membership carries the role line.
  best as (
    select m.role, m.title, m.is_super
      from memberships m
     where m.profile_id = _profile and m.status = 'active'
     order by case when m.is_super then 0
                   when m.role = 'admin' then 1
                   when m.role = 'coach' then 2
                   when m.role = 'manager' then 3
                   when m.role = 'medic' then 4
                   else 5 end
     limit 1
  ),
  entitled as (
    select
      -- Ruling C: any member sees a staff/admin's contacts…
      exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and (m.role in ('coach','manager','medic','admin') or m.is_super)
      )
      -- …and the existing manage scopes see a parent's.
      or private.is_admin_anywhere()
      or exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and m.role = 'parent' and m.team_id is not null
           and private.can_edit_team(m.team_id)
      ) as contacts
  )
  select p.id, p.full_name,
         best.role, best.title, coalesce(best.is_super, false),
         coalesce((select array_agg(t.name order by t.name)
                     from memberships m join teams t on t.id = m.team_id
                    where m.profile_id = _profile and m.status = 'active'
                      and m.team_id is not null), '{}') as squads,
         case when entitled.contacts then p.phone else null end,
         case when entitled.contacts then p.email else null end,
         case when private.can_see_staff_photo(p.id) then p.photo_path else null end,
         p.photo_focus_x, p.photo_focus_y
    from profiles p
   cross join viewer
   cross join entitled
    left join best on true
   where p.id = _profile
     and viewer.is_member;
$$;

revoke all on function public.member_contact_card(uuid) from public;
revoke all on function public.member_contact_card(uuid) from anon;
grant execute on function public.member_contact_card(uuid) to authenticated;

-- The FACE follows the same ruling. can_see_staff_photo mirrored
-- my_squad_staff (squad-scoped) since 13 Aug; without this arm the card
-- names a cross-squad coach but refuses their photograph. The old arms
-- stay: they also cover self and shares_admin_club.
create or replace function private.can_see_staff_photo(_profile uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    _profile = auth.uid()
    or private.shares_admin_club(_profile)
    or exists (
      select 1
      from memberships staff
      join memberships mine
        on mine.team_id = staff.team_id
       and mine.profile_id = auth.uid()
       and mine.status = 'active'
      where staff.profile_id = _profile
        and staff.status = 'active'
        and staff.role in ('coach', 'manager', 'medic')
        and staff.team_id is not null
    )
    -- 26 Aug 2026, ruling C: any active member may see any staff/admin's photo.
    or (
      exists (
        select 1 from memberships mine
         where mine.profile_id = auth.uid() and mine.status = 'active'
      )
      and exists (
        select 1 from memberships staff
         where staff.profile_id = _profile and staff.status = 'active'
           and (staff.role in ('coach','manager','medic','admin') or staff.is_super)
      )
    );
$$;

commit;
```

- [ ] **Step 2: Write the harness (the failing test)**

`db/tests/person-card.sql`, in the house pattern of `db/tests/chat-prefs.sql` — synthetic club, invented names, `pg_temp.as_user`, `_log`, everything rolls back. The migration is INLINED VERBATIM (strip the `begin;`/`commit;` — the harness owns the transaction). Fixture: one club `ZZ Cardprobe Club`; squad `t-card-1`; four users — `zz-card-coach@example.invalid` (active coach on t-card-1), `zz-card-parent-one@example.invalid` (active parent on t-card-1, phone `+971500000101`), `zz-card-parent-two@example.invalid` (active parent on t-card-1), `zz-card-outsider@example.invalid` (active parent on a SECOND squad `t-card-2` — no squad shared with the coach). Give the coach profile phone `+971500000100`.

Assertions (each with a raise on failure, logged to `_log`):

```sql
-- 1  RULING C: the outsider (no shared squad) gets the coach's phone
--    — the discriminating case; under the old squad-scoped rule this is
--    exactly the row that came back null.
-- 2  parent-two gets parent-one's row with phone AND email NULL
--    — and the CONTROL: the same call as the coach (who manages t-card-1)
--    returns parent-one's phone. The negative fails because the RPC nulled
--    it, not because the fixture is missing.
-- 3  the coach gets parent-one's phone (the manage arm).
-- 4  a caller with NO active membership (insert a fifth user, no
--    membership) gets ZERO rows for anybody.
-- 5  can_see_staff_photo: true for outsider→coach (new arm),
--    false for parent-two→parent-one (a parent is not staff).
```

- [ ] **Step 3: Run the harness — expect FAIL before the migration exists in the file**

Run: `npm run db:check -- person-card`
Expected while the inlined migration block is still missing/mistyped: FAIL (function does not exist). With the migration inlined correctly: PASS with the `_log` lines listed. If `SUPABASE_DB_URL` is not set, STOP and ask Jay.

- [ ] **Step 4: Prove the discriminator**

Temporarily break assertion 1's premise: in the inlined copy only, change the ruling-C arm to also require a shared squad (`and m.team_id is not null and private.can_see_team(m.team_id)`); run — expected: ASSERT 1 FAILED. Revert. This proves the harness catches the exact regression it exists for (rule 6).

- [ ] **Step 5: Re-capture the schema**

Update `db/schema/functions.sql`: replace the `private.can_see_staff_photo` body with the new one and add a `public.member_contact_card` section in the house comment style (header naming the migration, the REVOKE/GRANT lines as above). docs:check rule 7 does not fire here (no table grants), but the capture keeps `db/schema/` honest.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/20260826_member_contact_card.sql db/tests/person-card.sql db/schema/functions.sql
git commit -m "feat(db): member_contact_card — the person card's server-side visibility ruling"
npm run docs:check
```

---

### Task 2: Apply the migration to production and verify

- [ ] **Step 1: Apply** via the Supabase MCP `apply_migration` (project `lusmshimxdcxpnrktlgz`, name `member_contact_card`) with the migration file's content (without begin/commit — apply_migration wraps it).

- [ ] **Step 2: Verify with a control** — `execute_sql`:

```sql
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname = 'member_contact_card';
```

Expected: one row. Then the negative control — confirm the function is NOT callable as `anon`:

```sql
select has_function_privilege('anon', 'public.member_contact_card(uuid)', 'execute');
```

Expected: `false`.

- [ ] **Step 3: Re-run the harness against production** (`npm run db:check -- person-card`) — expected: PASS (idempotent inline re-run).

---

### Task 3: The data layer — `getPersonCard`

**Files:**
- Create: `src/data/personCard.js`
- Test: covered by Task 1's harness (logic) and Task 4's component tests (shape); no separate unit file.

**Interfaces:**
- Produces: `getPersonCard(profileId) → Promise<{profileId, name, role, title, isSuper, squads, phone, email, photoUrl, focus} | null>` (null when the RPC returns no row). `photoUrl` is a signed URL or null; `focus` is `{x, y}` or null.

- [ ] **Step 1: Write it**

```js
import { supabase } from '../lib/supabase.js'

// The card's one fetch. The DATABASE decides what comes back —
// member_contact_card nulls phone/email server-side unless the viewer is
// entitled (claude/plans/2026-08-26-person-card.md). This file only reshapes.
export async function getPersonCard(profileId) {
  if (!profileId) return null
  const { data, error } = await supabase.rpc('member_contact_card', { _profile: profileId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  // Same private bucket + signing stance as listMySquadStaff: photo_path is
  // an object key, viewable only via a signed URL. One person, one sign.
  let photoUrl = null
  if (row.photo_path) {
    const { data: signed } = await supabase.storage
      .from('staff-photos')
      .createSignedUrl(row.photo_path, 3600)
    photoUrl = signed?.signedUrl ?? null
  }

  return {
    profileId: row.profile_id,
    name: row.full_name,
    role: row.role,
    title: row.title,
    isSuper: row.is_super,
    squads: row.squads ?? [],
    phone: row.phone,
    email: row.email,
    photoUrl,
    focus: row.photo_focus_x == null && row.photo_focus_y == null
      ? null
      : { x: row.photo_focus_x, y: row.photo_focus_y },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/personCard.js
git commit -m "feat(data): getPersonCard — one fetch for the person card"
```

---

### Task 4: `PersonCard` — the sheet

**Files:**
- Create: `src/components/PersonCard.jsx`
- Modify: `src/components/SquadStaffCard.jsx:123` (`function ContactButton` → `export function ContactButton`)
- Test: `tests/person-card.test.jsx`

**Interfaces:**
- Consumes: `getPersonCard` (Task 3), `Sheet({open, onClose, title, children})`, `ContactButton({href, label, tone, onClick, children})` and the icon components from `SquadStaffCard.jsx` (export whichever of PhoneIcon / WhatsAppIcon / MailIcon / ChatIcon are defined there; they are module-local today), `whatsappUrl` from `src/lib/phone.js`, `labelForRole` from `src/lib/scope.js`, `initials` from `src/lib/playerFormat.js`, `focusToObjectPosition` from `src/lib/photoFocus.js`, `openConversation` from `src/data/messages.js`.
- Produces: `<PersonCard profileId={uuid|null} onClose={fn} />` — renders nothing when `profileId` is null; fetches on open; Chat navigates to `/chat/dm/<conversationId>`.

- [ ] **Step 1: Write the failing test** — `tests/person-card.test.jsx`, invented names, mocking the data layer:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PersonCard from '../src/components/PersonCard.jsx'

const getPersonCard = vi.fn()
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: (...a) => getPersonCard(...a) }))
const openConversation = vi.fn()
vi.mock('../src/data/messages.js', async (orig) => ({ ...(await orig()), openConversation: (...a) => openConversation(...a) }))

const coach = {
  profileId: 'p-coach', name: 'Zz Probe Coach', role: 'coach', title: 'Head Coach',
  isSuper: false, squads: ['U10 Mixed'], phone: '+971500000100',
  email: 'zz-probe-coach@example.invalid', photoUrl: null, focus: null,
}
const parent = { ...coach, profileId: 'p-parent', name: 'Zz Probe Parent', role: 'parent', title: null, phone: null, email: null, squads: [] }

function mount(profileId) {
  return render(<MemoryRouter><PersonCard profileId={profileId} onClose={() => {}} /></MemoryRouter>)
}

describe('PersonCard', () => {
  beforeEach(() => { getPersonCard.mockReset(); openConversation.mockReset() })

  it('shows every action for a staff card', async () => {
    getPersonCard.mockResolvedValue(coach)
    mount('p-coach')
    expect(await screen.findByText('Zz Probe Coach')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /call zz probe coach/i })).toHaveAttribute('href', 'tel:+971500000100')
    expect(screen.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /email zz probe coach/i })).toHaveAttribute('href', 'mailto:zz-probe-coach@example.invalid')
    expect(screen.getByRole('button', { name: /chat with zz probe coach/i })).toBeInTheDocument()
  })

  it('⚠️ a parent card is chat-only — no call, no email, and that is a normal card, not an error', async () => {
    getPersonCard.mockResolvedValue(parent)
    mount('p-parent')
    expect(await screen.findByText('Zz Probe Parent')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /email/i })).toBeNull()
    expect(screen.getByRole('button', { name: /chat with zz probe parent/i })).toBeInTheDocument()
    expect(screen.queryByText(/could not/i)).toBeNull()
  })

  it('a load failure shows words in the sheet, never a dead tap', async () => {
    getPersonCard.mockRejectedValue(new Error('nope'))
    mount('p-coach')
    expect(await screen.findByText(/nope|could not/i)).toBeInTheDocument()
  })

  it('chat drives the existing DM path', async () => {
    getPersonCard.mockResolvedValue(coach)
    openConversation.mockResolvedValue('conv-1')
    mount('p-coach')
    fireEvent.click(await screen.findByRole('button', { name: /chat with zz probe coach/i }))
    await waitFor(() => expect(openConversation).toHaveBeenCalledWith('p-coach'))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:related -- tests/person-card.test.jsx`
Expected: FAIL — `PersonCard.jsx` does not exist.

- [ ] **Step 3: Implement**

`src/components/PersonCard.jsx` — a `Sheet` whose body: avatar (photo via `focusToObjectPosition(focus)` object-position, else `initials(name)`), name, role line (`title ?? labelForRole(role)`, `isSuper` renders "Super admin", squads joined with " · "), then a `ContactButton` row exactly like `StaffRow`'s: `tel:` when `phone`, `whatsappUrl(phone)` when it yields, `mailto:` when `email`, and a Chat button calling `openConversation(profileId)` then `navigate('/chat/dm/' + id)`, catching into an inline error line (the refusal is the database's words — same contract as `openDmWith` in `src/screens/Chat.jsx:348`). Fetch in a `useEffect` keyed on `profileId`; loading state renders the sheet with a skeleton row, error state renders the message inline. Export `ContactButton` (and its icons) from `SquadStaffCard.jsx` rather than duplicating them.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:related -- tests/person-card.test.jsx` — expected: PASS. Also `npm run test:related -- src/components/SquadStaffCard.jsx` — expected: PASS (the export change breaks nothing).

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonCard.jsx src/components/SquadStaffCard.jsx tests/person-card.test.jsx
git commit -m "feat(ui): PersonCard — the bottom-sheet contact card"
```

---

### Task 5: `PersonName` — the tappable name

**Files:**
- Create: `src/components/PersonName.jsx`
- Test: `tests/person-name.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `<PersonName profileId={uuid|null} selfId={uuid|null} onOpen={fn(profileId)} className={string}>Zz Name</PersonName>` — a button when tappable; PLAIN TEXT when `profileId` is null (deleted accounts, "the system") or `profileId === selfId`. Screens own the card state: `const [cardFor, setCardFor] = useState(null)` + `<PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />`, passing `setCardFor` as `onOpen`. (Player names do NOT use PersonName — they keep their existing Player Detail links.)

- [ ] **Step 1: Write the failing test**

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PersonName from '../src/components/PersonName.jsx'

describe('PersonName', () => {
  it('is a button that reports the profile id', () => {
    const onOpen = vi.fn()
    render(<PersonName profileId="p-1" selfId="p-2" onOpen={onOpen}>Zz Probe Coach</PersonName>)
    fireEvent.click(screen.getByRole('button', { name: 'Zz Probe Coach' }))
    expect(onOpen).toHaveBeenCalledWith('p-1')
  })

  it('⚠️ your own name and a missing profile render plain text — no button', () => {
    const onOpen = vi.fn()
    const { rerender } = render(<PersonName profileId="p-2" selfId="p-2" onOpen={onOpen}>Me</PersonName>)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<PersonName profileId={null} selfId="p-2" onOpen={onOpen}>an account since deleted</PersonName>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npm run test:related -- tests/person-name.test.jsx`. Expected: FAIL, file missing.

- [ ] **Step 3: Implement** — a `<button type="button">` with the `ChatBubble` author affordance (`underline decoration-dotted underline-offset-2 hover:decoration-solid`) merged with any `className`; the two plain-text branches return `<span className={className}>{children}</span>`.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonName.jsx tests/person-name.test.jsx
git commit -m "feat(ui): PersonName — any name becomes a door to the person"
```

---

### Task 6: Wire the admin screens (the screenshot's gap)

**Files:**
- Modify: `src/screens/AdminStaff.jsx:351` (the `{member.name}` span in the staff row)
- Modify: `src/screens/Accounts.jsx` (the account rows' `realName` renders near `:299` and `:520`)
- Modify: `src/screens/AdminRightsLog.jsx:92` and `:103` (subject and actor)
- Test: extend `tests/rights-log.test.jsx`; the staff/accounts screens' existing test files gain one assertion each (find them via `npm run test:related -- src/screens/AdminStaff.jsx`).

Pattern per screen (repeat, don't abstract): add `const [cardFor, setCardFor] = useState(null)`, render `<PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />` once at screen root, and replace each name render with `<PersonName profileId={…} selfId={selfId} onOpen={setCardFor} className="…existing classes…">{name}</PersonName>`. `selfId` comes from `useAuth()` (`user?.id`), already imported on these screens or added. In AdminRightsLog the ids are `row.profile_id` and `row.actor_id` — `actorName`/`subjectName` may return `GONE` or `'the system'`; pass `profileId={row.actor_kind === 'system' ? null : row.actor_id}` for the actor so those stay plain text (PersonName's null branch).

- [ ] **Step 1: Write the failing assertions** — in the rights-log test: rendering a row with a real actor id yields `getByRole('button', {name: 'Zz Probe Admin'})`; a `actor_kind: 'system'` row yields no button. In the staff screen test: the member's name is a button.
- [ ] **Step 2: Run them — expected FAIL** (`npm run test:related -- tests/rights-log.test.jsx`).
- [ ] **Step 3: Wire the three screens as above.**
- [ ] **Step 4: Run — expected PASS**, plus `npm run test:related -- src/screens/Accounts.jsx`.
- [ ] **Step 5: Commit**

```bash
git add src/screens/AdminStaff.jsx src/screens/Accounts.jsx src/screens/AdminRightsLog.jsx tests/rights-log.test.jsx
git commit -m "feat(admin): every name on the admin screens opens the person card"
```

(stage the exact test files you touched)

---

### Task 7: Wire Squad Hub, Home and Player Detail

**Files:**
- Modify: `src/components/SquadStaffCard.jsx` (StaffRow's name `<p>` at `:220` — this covers Home's tiles and Squad Hub in one edit, since `Dashboard.jsx:1133` renders the same component)
- Modify: `src/screens/PlayerDetail.jsx` (parent names in `ParentsBlock` `:99-:209`)
- Test: `tests/squad-staff-home.test.jsx`, plus the PlayerDetail test file found via `npm run test:related -- src/screens/PlayerDetail.jsx`

`StaffRow` already receives `onChat` and `selfId`; add an `onOpenCard` prop threaded from `SquadStaffCard`'s own new prop, and wrap the name. The row's existing Call/WhatsApp/Email buttons STAY — the card is additive. Screens that render `SquadStaffCard` (Dashboard, Squad Hub) own the `cardFor` state and pass `onOpenCard={setCardFor}`; a screen that passes nothing keeps plain-text names (same contract as `onAuthor`). In `ParentsBlock`, parent rows carry a linked profile id only when the parent has claimed an account — pass it if present, else PersonName renders plain text.

- [ ] **Step 1: Failing assertions** — squad-staff-home: with `onOpenCard` given, the staff name is a button; without it, plain text (the discriminating pair).
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement.** **Step 4: Run — PASS**, plus `npm run test:related -- src/screens/Dashboard.jsx`.
- [ ] **Step 5: Commit**

```bash
git add src/components/SquadStaffCard.jsx src/screens/Dashboard.jsx src/screens/PlayerDetail.jsx tests/squad-staff-home.test.jsx
git commit -m "feat(hub): staff and parent names open the person card"
```

(stage the exact screen/test files you touched; Squad Hub's screen file if it needed the state)

---

### Task 8: Wire Notices and the group-chat member line

**Files:**
- Modify: `src/components/NoticeRow.jsx:90-92` (author name; NoticeRow gains `onOpenCard`/`selfId` props, the Notices screen owns the state — author id is on the notice's `author` join; if only `full_name` is selected today, add the author's profile id to the select in `src/data/` for notices)
- Modify: `src/screens/DirectMessages.jsx:259-260` (the group `memberLine` — render as a wrapped row of `PersonName`s separated by " · " instead of one string; DMs keep their plain header)
- Test: `tests/notice-board.test.jsx` (or the file `npm run test:related -- src/components/NoticeRow.jsx` names) and `tests/group-thread.test.jsx`

- [ ] **Step 1: Failing assertions** — notice author is a button when `onOpenCard` given; each group member's name is a button except your own.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement.** **Step 4: Run — PASS.**
- [ ] **Step 5: Commit**

```bash
git add src/components/NoticeRow.jsx src/screens/DirectMessages.jsx
git commit -m "feat(chat,notices): authors and group members open the person card"
```

(stage the exact data/test files you touched too)

---

### Task 9: Full suite, docs, and the ruling's record

**Files:**
- Create: `claude/decisions/2026-08-26-staff-contacts-club-wide.md`
- Modify: `claude/plans/2026-08-26-person-card.md` (status → SHIPPED), this file's status line, `claude/changelog.md`, `claude/state-of-play.md` (one line under "Where things stand")

- [ ] **Step 1: Full run** — `npm test`. Expected: PASS. Fix anything red before proceeding.
- [ ] **Step 2: Write the decision record** — why C beat A (strict mirror) and B (staff-to-staff): the 13 Aug opt-in ruling's logic doesn't stop at squad boundaries; the argument AGAINST C (widest exposure of staff personal numbers) recorded so it isn't re-litigated blind; B named as the fallback if C proves too open.
- [ ] **Step 3: Update the docs** — changelog entry (unSHA'd; the next PR cites the squash), plan status lines, state-of-play line. Run `npm run docs:check` — expected: all green.
- [ ] **Step 4: Commit**

```bash
git add claude/decisions/2026-08-26-staff-contacts-club-wide.md claude/plans/2026-08-26-person-card.md claude/plans/2026-08-26-person-card-implementation.md claude/changelog.md claude/state-of-play.md
git commit -m "docs: person card shipped — ruling C recorded"
npm run docs:check
```

- [ ] **Step 5: Hand to Jay** — the branch is ready for a PR; pushing and the deploy (15 credits) are his call. After deploy, the live check from the spec: from a real parent account, tap a staff name in a notice → number visible; tap another parent → Chat only.
