import { useState } from 'react'
import Card from './Card.jsx'
import { compareSquadStaff } from '../lib/squadStaff.js'
import { labelForRole } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'
import { whatsappUrl } from '../lib/phone.js'
// ⚠️ FROM `lib/`, NOT FROM `PhotoPositioner.jsx`. Importing it from the picker
// would pull the drop zone and the drag maths into Home's bundle to render a
// percentage; the helper was moved out for exactly this. Same function either
// way — the picker re-exports it — so the preview and this face cannot disagree.
import { focusToObjectPosition } from '../lib/photoFocus.js'

// "Who looks after this squad" — the member-facing half of the staff feature.
// Phase 3 of claude/plans/2026-08-13-squad-staff-on-home.md; the admin half is
// src/screens/AdminStaff.jsx and the two read the same shape from
// src/data/staff.js.
//
// ⚠️ THE EMPTY STATE IS THE MAJORITY CASE, NOT AN EDGE CASE. Re-measured live
// 15 Aug 2026: ELEVEN of the club's fifteen squads have nobody attached, and of
// the four that do, two have one person, one has four and one has six. So a
// squad with no staff must say something a parent can understand, and must
// never render as a blank box or vanish — a card that disappears reads as the
// app having lost something, and a blank one reads as a bug.
//
// ⚠️ IT SAYS "not listed", NOT "there isn't one". Every one of those eleven
// squads has real adults running it; what is missing is the DATA, and telling a
// parent their child has no coach would be false as well as alarming.
//
// ── The card language (25 Aug 2026) ─────────────────────────────────────────
// Home and Chat already speak in editorial cards: hairline Card, a circular
// face, ink on paper, contact actions as a row of 44px squares. This block
// used to be a glossy mosaic of poster tiles (photo or role-gradient filling
// the tile, white type over a dark scrim). That language never reached Chat
// or Notices, so "Squad contacts" read as a leftover from the 15 Aug tiles.
// The people, the buttons, the collapse stay. Order within a squad is
// Head Coach, Team Manager(s), Assistant Coaches, Medics — Jay, 25 Aug
// 2026, reversing the old "name only because role order was not agreed"
// ruling. Same role: name order. The TILE is gone.
//
// ⚠️ THE PHONE ROW MUST NOT WRAP. After #407 the editorial Card had face +
// name + four 44px actions with `flex-wrap`, which dumped the buttons onto
// the next line at ~320–390px (Jay, phone PWA: "completely messed up").
// Name truncates; the action cluster stays on the same line. Do not bring
// the glossy mosaic back to "solve" this.

// ⚠️ ONLY TWO OF THE CLUB'S FIFTEEN STAFF HAVE A PHOTO (measured 15 Aug 2026).
// The monogram is still the ordinary case. It is now the same circular mark
// Chat and Notices already use — initials on a role-keyed gradient — not a
// watermark bled across a poster.

// The monogram's gradient, keyed to role. The role is written in words on the
// same row, so the colour repeats it rather than carrying it — the same rule
// the fixture row's state edge follows.
// ⚠️ NAMED TOKENS, NOT `to-[#7d0a1c]` — tests/theme.test.js refuses a raw hex
// inside a Tailwind arbitrary value, and it caught the first version of this
// file. The gradients themselves live in tailwind.config.js under
// `backgroundImage`, beside `hero-grad` and `stat-band`.
const MONOGRAM_TONE = {
  coach: 'bg-monogram-coach',
  manager: 'bg-monogram-manager',
  medic: 'bg-monogram-medic',
}

function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}

function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3.2 20.8l1.3-4a8.2 8.2 0 1 1 3.1 3l-4.4 1Z" />
      <path d="M9 8.4c.3 0 .5.1.6.4l.6 1.3c.1.3 0 .5-.1.7l-.4.5c-.1.2-.2.4 0 .6a7 7 0 0 0 2.8 2.4c.2.1.4 0 .5-.1l.5-.6c.2-.2.4-.2.6-.1l1.3.7c.3.1.4.4.3.7-.2.7-.9 1.2-1.7 1.2-2.5 0-5.9-3.3-5.9-5.8 0-.8.5-1.5 1.2-1.7Z" />
    </svg>
  )
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function MailIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3 6.5 9 6 9-6" />
    </svg>
  )
}

function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
    </svg>
  )
}

/**
 * One contact button.
 *
 * ⚠️ 44px SQUARE, AND THAT IS THE FLOOR RATHER THAN A PREFERENCE. Button.jsx
 * carries the same number and the same reason: this app is used one-handed, at
 * the side of a pitch in Abu Dhabi, often with wet hands.
 *
 * ⚠️ THEY MUST FIT ON THE NAME'S ROW AT PHONE WIDTH. Four of these plus a
 * 44px face is tight at 320–390px; the name truncates and this cluster does
 * not wrap. Wrapping (`flex-wrap` on the row) was the 25 Aug 2026 phone-PWA
 * bug after #407. Do not "fix" it by shrinking below 44px or by bringing
 * the mosaic tiles back.
 *
 * ⚠️ THE ICON IS aria-hidden AND THE LINK CARRIES THE WORDS. An icon-only
 * control with no accessible name is a button that announces itself as "link",
 * which is the most common way a pretty toolbar becomes unusable.
 */
function ContactButton({ href, label, tone = 'ghost', onClick, children }) {
  const base =
    'grid h-11 w-11 shrink-0 place-items-center rounded-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'
  const tones = {
    solid: 'bg-brand text-white hover:bg-brand-deep',
    ghost: 'bg-surface-mute text-brand-ink hover:bg-surface-sunk',
  }

  if (onClick) {
    return (
      <button type="button" aria-label={label} onClick={onClick} className={`${base} ${tones[tone]}`}>
        {children}
      </button>
    )
  }
  return (
    <a href={href} aria-label={label} className={`${base} ${tones[tone]}`}>
      {children}
    </a>
  )
}

/**
 * The face, or the monogram — a circle, the same shape Chat and Notices use.
 *
 * ⚠️ NOT `PlayerAvatar`, AND THE DIFFERENCE IS THE BUCKET. That component signs
 * against `player-photos`, which holds photographs of children behind policies
 * written around squad membership. These come from `staff-photos` and are
 * signed in one batch by `listMySquadStaff` before anything renders — so this
 * takes a URL and never signs, which is also why there is no effect here.
 *
 * ⚠️ THE FALLBACK IS THE NORMAL CASE, NOT AN ERROR STATE. Thirteen of the
 * club's fifteen staff have no photo, so "no photo", "could not sign" and "the
 * image 404s" must all render identically and none of them may announce itself.
 * The same ruling PlayerAvatar carries.
 *
 * ⚠️ `object-position` IS WHAT MAKES THE PICKER MEAN ANYTHING. `object-cover`
 * alone centres the crop, so on a 44px circle a landscape photograph loses the
 * top of a head. The format comes from `focusToObjectPosition`, which is also
 * where the picker's PREVIEW gets its value — the only reason the preview can
 * be trusted to predict this face.
 */
function StaffAvatar({ name, role, url, focus, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  const box = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-11 w-11 text-[12px]'
  const tone = MONOGRAM_TONE[role] ?? MONOGRAM_TONE.manager

  if (url && !failed) {
    return (
      <span className={`relative shrink-0 overflow-hidden rounded-full ${size === 'sm' ? 'h-7 w-7' : 'h-11 w-11'}`}>
        <img
          src={url}
          alt=""
          style={{ objectPosition: focusToObjectPosition(focus) }}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-display font-extrabold text-ink-invert ${box} ${tone}`}
    >
      {initials(name)}
    </span>
  )
}

function StaffRow({ member, onChat = null, selfId = null }) {
  const role = labelForRole(member.role)
  const line = member.title ?? role
  const wa = whatsappUrl(member.phone)
  const canChat = Boolean(onChat && member.profileId && member.profileId !== selfId)
  const hasActions = Boolean(member.phone || member.email || canChat)

  return (
    <li data-testid="squad-staff-person" className="flex flex-nowrap items-center gap-2 border-b border-line px-3 py-3 last:border-b-0">
      <StaffAvatar
        name={member.name}
        role={member.role}
        url={member.photoUrl}
        focus={member.focus}
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-[15px] font-extrabold text-ink">{member.name}</p>
        {/* ⚠️ THE TITLE REPLACES THE ROLE LABEL RATHER THAN JOINING IT. "Head
            Coach" beside a "Coach" chip is the same word twice. When there is
            no title the role label carries the line on its own.
            ⚠️ A TITLE IS NEVER PERMISSION. It is a label typed by an admin;
            `private.can_edit_team` keys off `role` and must stay that way. */}
        {line && (
          <p className="mt-0.5 truncate font-condensed text-[11px] font-bold uppercase tracking-[.1em] text-ink-muted">
            {line}
          </p>
        )}
      </div>
      {/* ⚠️ REAL `tel:`, `wa.me` AND `mailto:` LINKS, NOT TEXT. The reason a
          parent wants this card at all is to contact the person.
          ⚠️ THE NUMBER AND THE ADDRESS ARE NOT PRINTED. They are one tap away
          and still on the person's own row on /admin/staff. This is a display
          choice, not a privacy one — Jay, 13 Aug 2026: "the staff automatically
          opts in when accepting the position". */}
      {hasActions && (
        <div className="flex shrink-0 flex-nowrap gap-1" data-testid="squad-staff-actions">
          {member.phone && (
            <ContactButton href={`tel:${member.phone}`} label={`Call ${member.name}`} tone="solid">
              <PhoneIcon className="h-[15px] w-[15px]" aria-hidden="true" />
            </ContactButton>
          )}
          {wa && (
            <ContactButton href={wa} label={`Message ${member.name} on WhatsApp`}>
              <WhatsAppIcon className="h-[16px] w-[16px]" aria-hidden="true" />
            </ContactButton>
          )}
          {member.email && (
            <ContactButton href={`mailto:${member.email}`} label={`Email ${member.name}`}>
              <MailIcon className="h-[15px] w-[15px]" aria-hidden="true" />
            </ContactButton>
          )}
          {canChat && (
            <ContactButton onClick={() => onChat(member)} label={`Chat with ${member.name}`}>
              <ChatIcon className="h-4 w-4" aria-hidden="true" />
            </ContactButton>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The faces shown on a collapsed squad's header, so the row says WHO is inside
 * it rather than only how many. Capped at four and overlapped, which is what
 * keeps the header one line on a phone.
 */
function FaceStack({ staff }) {
  const shown = staff.slice(0, 4)

  return (
    <span aria-hidden="true" className="flex shrink-0 items-center">
      {shown.map((member, index) => (
        <span
          key={member.membershipId}
          className={`relative overflow-hidden rounded-full ring-2 ring-surface-card ${
            index > 0 ? '-ml-2' : ''
          }`}
        >
          <StaffAvatar
            name={member.name}
            role={member.role}
            url={member.photoUrl}
            focus={member.focus}
            size="sm"
          />
        </span>
      ))}
    </span>
  )
}

/**
 * One squad's staff, or an honest empty state.
 *
 * ⚠️ EVERY SQUAD AFTER THE FIRST STARTS COLLAPSED, AND THAT IS JAY'S CALL ON A
 * REAL CEILING (15 Aug 2026): "we have parents who could have up to 5 age groups
 * worth of players". The retired mosaic made that a three-screen scroll; rows
 * are shorter, and five open squads is still too much. Collapsed, each extra
 * squad costs one 44px row.
 *
 * ⚠️ AN EMPTY SQUAD IS NEVER COLLAPSIBLE. There is nothing behind the tap, and a
 * disclosure that opens onto one sentence is a control that wastes a tap to say
 * "still nothing".
 *
 * `staff` is an array — possibly empty. The block is always drawn: a parent
 * attached to a squad should see that squad named on their home screen whether
 * or not anyone has been attached to it yet.
 */
export function SquadStaffCard({ squadName, staff = [], defaultOpen = true, onChat = null, selfId = null }) {
  const [open, setOpen] = useState(defaultOpen)
  // Sort here as well as in the data module: tests (and any future caller)
  // can hand an unsorted array and the card still draws the agreed order.
  const ordered = [...staff].sort(compareSquadStaff)

  const collapsible = staff.length > 0
  const panelId = `squad-staff-${squadName.replace(/\W+/g, '-').toLowerCase()}`

  return (
    <div className="mb-3" data-testid="squad-staff-card">
      {collapsible ? (
        <h4>
          <button
            type="button"
            data-testid="squad-staff-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((was) => !was)}
            className="mb-1 flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] px-1 text-left transition-colors hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink">
              {squadName}
            </span>
            {!open && <FaceStack staff={ordered} />}
            <span className="shrink-0 text-[12px] font-semibold text-ink-faint">
              {staff.length}
            </span>
            <ChevronIcon
              className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </h4>
      ) : (
        <h4 className="mb-2 ml-0.5 text-[15px] font-extrabold text-ink">{squadName}</h4>
      )}

      {staff.length === 0 ? (
        // ⚠️ A SENTENCE, NOT <Empty>. The same ruling the fortnight strip
        // settled on 10 Aug: <Empty>'s 42px icon and py-11 would make the
        // nothing-here case TALLER than the something-here case, and this is
        // the case eleven of fifteen squads are in.
        <Card className="px-4 py-3">
          <p className="text-[13px] text-ink-muted">
            No coach, team manager or medic listed for this squad yet.
          </p>
        </Card>
      ) : (
        // ⚠️ `hidden` RATHER THAN NOT RENDERING, so `aria-controls` always names
        // an element that exists. A disclosure button pointing at an id that is
        // absent while closed is the most common way this pattern is got wrong.
        //
        // ⚠️ AND THE ATTRIBUTE ALONE DID NOTHING WHILE THIS WAS A GRID —
        // measured 15 Aug 2026: Preflight's `[hidden] { display: none }` and
        // the `.grid` utility had the same specificity, so `display: grid`
        // won. The mosaic is gone, but the class is still swapped: `hidden`
        // (the utility) while closed, nothing that sets display while open.
        <Card
          as="ul"
          id={panelId}
          hidden={!open}
          className={`${open ? 'overflow-hidden' : 'hidden overflow-hidden'}`}
        >
          {ordered.map((member) => (
            <StaffRow
              key={member.membershipId}
              member={member}
              onChat={onChat}
              selfId={selfId}
            />
          ))}
        </Card>
      )}
    </div>
  )
}

export default SquadStaffCard
