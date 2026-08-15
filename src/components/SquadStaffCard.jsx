import { useState } from 'react'
import { labelForRole } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'
import { whatsappUrl } from '../lib/phone.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

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
// ── The tile layout (15 Aug 2026) ───────────────────────────────────────────
// Jay chose a BENTO MOSAIC of poster tiles over the previous list of rows: the
// lead's tile spans two rows down the left, everyone else flows into wide tiles
// beside it. A photo fills the tile, the title sits at the top, the name and
// the contact buttons sit at the bottom over a scrim.
//
// ⚠️ ONLY TWO OF THE CLUB'S FIFTEEN STAFF HAVE A PHOTO (measured 15 Aug 2026).
// So the monogram is not a fallback here, it is the ORDINARY case, and it is
// designed rather than patched: a brand gradient keyed to the role, with the
// initials set large and low-contrast as a watermark. A wall of them has to
// look deliberate, because for now a wall of them is what this is.

/**
 * Who gets the big tile.
 *
 * ⚠️ IT IS DECIDED BY TITLE, NEVER BY ROLE, AND THAT IS A RULING THIS FILE IS
 * OBEYING RATHER THAN INVENTING. `src/data/staff.js` sorts staff by NAME in two
 * places and says why both times: role order "would put every coach above every
 * manager, which reads as a hierarchy the club has not agreed to". A featured
 * tile chosen by role would reintroduce exactly that hierarchy, in the loudest
 * possible form — one person's face at twice the size of everyone else's.
 *
 * A TITLE is different: it is a string an admin typed on /admin/staff, so
 * featuring it states only what the club has already chosen to state.
 *
 * ⚠️ CONSEQUENCE, AND IT IS VISIBLE TODAY: only two people in the club are
 * titled "Head Coach", so most squads have NO lead and render as an even grid.
 * That is correct, not a bug — the way to get a featured tile is to set a title,
 * which is a thing the club decides and not a thing this component guesses.
 */
export function leadIndex(staff) {
  return staff.findIndex((member) => /\bhead\b/i.test(member?.title ?? ''))
}

/**
 * How each tile spans the two-column grid — `'lead' | 'wide' | 'half'`.
 *
 * ⚠️ THIS IS A FUNCTION RATHER THAN CSS AUTO-PLACEMENT BECAUSE AUTO-PLACEMENT
 * LEAVES HOLES, AND THE HOLES LAND ON THE SQUAD SIZES THE CLUB ACTUALLY HAS —
 * 1, 1, 4 and 6 today.
 *
 * The rules, in order:
 *   - One person gets the full width. There is no column to be the left of.
 *   - With a lead, the lead takes the WHOLE left column and everyone else
 *     stacks on the right. See the note inside.
 *   - With no lead, an even two-per-row grid, and a tile that would sit alone
 *     on the last row goes full width instead.
 */
export function tileSpans(count, hasLead) {
  if (count <= 0) return []
  if (count === 1) return ['wide']

  // ⚠️ THE LEAD OWNS THE LEFT COLUMN OUTRIGHT — Jay, 15 Aug 2026, looking at the
  // real U16B squad: *"only head coach should be furthest left, then the rest
  // should be to the right"*. The previous rule gave the lead two rows and then
  // let everyone else wrap underneath it, so at six people two more tiles sat
  // BELOW the lead and back at the left margin. Two tiles starting at the same
  // left edge, one of them the featured one, reads as a broken grid rather than
  // as a hierarchy — the eye cannot tell which column means anything.
  //
  // Now: one tall tile on the left, everything else stacked on the right, and
  // the left edge means "this is the lead" and nothing else.
  if (hasLead) return ['lead', ...new Array(count - 1).fill('half')]

  // No lead: an even grid, and the only special case is a tile that would sit
  // alone on the final row.
  const spans = new Array(count).fill('half')
  if (count % 2 === 1) spans[count - 1] = 'wide'
  return spans
}

/**
 * How many grid rows the lead tile spans — one per tile beside it.
 *
 * ⚠️ IT IS AN INLINE STYLE BECAUSE IT IS COMPUTED. Tailwind cannot see a class
 * name built at runtime, so `row-span-${n}` would silently resolve to nothing
 * and the lead would collapse to a single row — the same trap the Dashboard's
 * staggered animation delay documents.
 */
// ⚠️ THE SAME 372px THE GRID USES, AND THE NUMBER IS DERIVED, NOT CHOSEN: three
// 44px contact buttons plus two 4px gaps plus 22px of tile inset is 162, and two
// of those plus the 8px grid gap and 32px of page padding is 364. 372 is that
// with a little air. It appears twice — here and as the `min-[372px]:` Tailwind
// variant — because a media query cannot be read from a class name.
export const TWO_COLUMN_QUERY = '(min-width: 372px)'

export function leadRowSpan(count) {
  return Math.max(1, count - 1)
}

// The monogram's gradient, keyed to role. The role is written in words in the
// pill on the same tile, so the colour repeats it rather than carrying it —
// the same rule the fixture row's state edge follows.
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

// WhatsApp's glyph is its own mark; drawn as a simple handset-in-a-bubble so
// the row of three reads as one family rather than one logo and two icons.
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

/**
 * One contact button.
 *
 * ⚠️ 44px SQUARE, AND THAT IS THE FLOOR RATHER THAN A PREFERENCE. Button.jsx
 * carries the same number and the same reason: this app is used one-handed, at
 * the side of a pitch in Abu Dhabi, often with wet hands. Three of them plus
 * their gaps is 144px, which is why the small tiles cannot be any narrower than
 * they are.
 *
 * ⚠️ THE ICON IS aria-hidden AND THE LINK CARRIES THE WORDS. An icon-only
 * control with no accessible name is a button that announces itself as "link",
 * which is the most common way a pretty toolbar becomes unusable.
 */
function ContactButton({ href, label, tone = 'ghost', children }) {
  // ⚠️ `/90` AND `/95`, NOT `/92`. Tailwind's opacity scale is 0-100 in steps of
  // five, so `bg-white/92` generates NO RULE AT ALL — and the failure is silent
  // and specific: the element renders with a transparent background, which on a
  // dark photo tile looks like red text floating on the picture rather than
  // like a missing class. It shipped that way into the first screenshot of this
  // component. An off-scale value needs the arbitrary form, `bg-white/[.92]`.
  const base =
    'grid h-11 w-11 shrink-0 place-items-center rounded-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
  const tones = {
    solid: 'bg-brand text-white hover:bg-brand-deep',
    ghost: 'bg-white/90 text-brand-deep hover:bg-white',
  }

  return (
    <a href={href} aria-label={label} className={`${base} ${tones[tone]}`}>
      {children}
    </a>
  )
}

/**
 * The face, or the monogram.
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
 */
function TileBackground({ name, role, url, compact = false }) {
  const [failed, setFailed] = useState(false)

  if (url && !failed) {
    return (
      <img
        src={url}
        // The name is rendered over this image, so an alt of "Photo of Rosa
        // Ferreira" would only repeat it. Empty alt marks it decorative and
        // stops a screen reader saying the name twice.
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    )
  }

  const tone = MONOGRAM_TONE[role] ?? MONOGRAM_TONE.manager

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 ${tone}`}
    >
      {/* On a tile: the initials as a watermark, not as a label — the name is
          written in full at the bottom, so this is texture. Bled off the top
          right corner so it reads as a mark rather than as centred text that
          failed to load an image.

          ⚠️ IN THE 28px HEADER FACE THAT READING INVERTS. There is no name
          beside it there, so the initials are the whole content and have to be
          centred and legible rather than a 54px watermark bleeding out of a
          circle — which is what the tile treatment renders at that size. */}
      {compact ? (
        <span className="absolute inset-0 grid place-items-center font-display text-[10px] leading-none text-white">
          {initials(name)}
        </span>
      ) : (
        <span className="absolute -top-1 right-2 font-display text-[54px] leading-none text-white/20">
          {initials(name)}
        </span>
      )}
    </div>
  )
}

/**
 * One person, as a poster tile.
 *
 * `featured` only changes the type scale — the layout span is the caller's job,
 * because only the caller knows how many tiles there are.
 */
// ⚠️ EVERY SPAN IS GATED ON `min-[372px]:`, AND 372 IS ARITHMETIC RATHER THAN
// TASTE. Three 44px buttons plus two 4px gaps is 140px, and the tile insets add
// 22 — so a tile carrying the full set of contact buttons cannot be narrower
// than 162px. Two of those plus the 8px grid gap and the screen's 32px of
// padding is 364, and 372 is that with a little air. BELOW IT, ONE COLUMN.
//
// ⚠️ THE BUTTON GAP IS 4px BECAUSE 6px LEFT EXACTLY ZERO SLACK AT 375. Measured:
// at a 375px viewport the tile is 167.5 and the button row needed all 167.5 of
// it. 375 is the iPhone SE, 12 mini and 13 mini, so that is not a corner — it is
// a phone plenty of parents have, sitting one pixel from a clipped button.
//
// ⚠️ MEASURED, AND THE FAILURE IT PREVENTS IS INVISIBLE. At 320px the tile is
// 140px wide, the button row needs 144, and the tile carries `overflow-hidden`
// — so the document does NOT overflow and harness/check-overflow.mjs stays
// green while the email button is quietly sliced in half. A clipped control
// looks like a design choice until you try to tap it.
//
// The alternative was shrinking the buttons, which is not available: 44px is
// the floor Button.jsx already argues for, in the same words, for the same
// wet-hands-at-the-side-of-a-pitch reason.
const SPAN_CLASS = {
  // ⚠️ NO `row-span-*` HERE — the lead's row span is computed from how many
  // tiles sit beside it and is applied as an inline style. See leadRowSpan().
  lead: 'min-h-[152px] min-[372px]:min-h-[280px]',
  wide: 'min-[372px]:col-span-2 min-h-[152px]',
  half: 'min-h-[152px] min-[372px]:min-h-[136px]',
}

function StaffTile({ member, span = 'half', style }) {
  const featured = span === 'lead'
  const role = labelForRole(member.role)
  const line = member.title ?? role
  const wa = whatsappUrl(member.phone)

  return (
    <li
      data-testid="squad-staff-person"
      data-featured={featured ? 'true' : undefined}
      data-span={span}
      style={style}
      className={`relative overflow-hidden rounded-[14px] bg-surface-sunk ${SPAN_CLASS[span]}`}
    >
      <TileBackground name={member.name} role={member.role} url={member.photoUrl} />

      {/* ⚠️ THE SCRIM IS WHAT MAKES WHITE TEXT LEGAL OVER AN UNKNOWN PHOTO.
          Nobody vets these images, so the type has to survive a bright one. The
          bottom stop is .82 black, which holds white text above 4.5:1 over any
          photograph at all; the softer top stop does the same for the title
          pill. Without it the contract in claude/specs/accessibility.md is not
          something this component can honour. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.82)_0%,rgba(0,0,0,.45)_34%,rgba(0,0,0,.05)_62%,rgba(0,0,0,.22)_100%)]"
      />

      {/* ⚠️ THE TITLE REPLACES THE ROLE LABEL RATHER THAN JOINING IT. "Head
          Coach" beside a "Coach" chip is the same word twice, which is what the
          dashboard hero's eyebrow/headline split already had to solve once.
          When there is no title the role label carries the line on its own — so
          a squad that has never set a title still reads properly.

          ⚠️ A TITLE IS NEVER PERMISSION. It is a label typed by an admin;
          `private.can_edit_team` keys off `role` and must stay that way. */}
      {line && (
        <span className="absolute left-2.5 top-2.5 rounded-pill bg-white/95 px-2.5 py-[3px] font-condensed text-[10.5px] font-extrabold uppercase tracking-[.09em] text-brand-deep">
          {line}
        </span>
      )}

      <div className="absolute inset-x-[11px] bottom-2.5 text-white">
        <span
          className={`block font-display leading-[1.08] ${featured ? 'text-[20px]' : 'text-[14.5px]'}`}
        >
          {member.name}
        </span>

        {/* ⚠️ REAL `tel:`, `wa.me` AND `mailto:` LINKS, NOT TEXT. The reason a
            parent wants this card at all is to contact the person, and a phone
            number they have to retype by hand is a number they will not use.

            ⚠️ THE NUMBER AND THE ADDRESS ARE NO LONGER PRINTED, AND THAT IS THE
            ONE THING THE TILE COSTS. An email address has no spaces in it, so a
            long club address is a single unbreakable word — on a tile 170px
            wide it cannot be shown at all without overflowing, which is the
            failure harness/check-overflow.mjs exists to catch. The details are
            still one tap away and still on the person's own row on
            /admin/staff.
            ⚠️ THIS IS A DISPLAY CHANGE, NOT A PRIVACY ONE. The contact details
            are here on a ruling (Jay, 13 Aug 2026): "the staff automatically
            opts in when accepting the position". Do not quietly drop the
            buttons back to name-and-title — the database returns these fields
            deliberately (db/migrations/20260813_my_squad_staff.sql). */}
        {(member.phone || member.email) && (
          <div className="mt-2 flex gap-1">
            {member.phone && (
              <ContactButton
                href={`tel:${member.phone}`}
                label={`Call ${member.name}`}
                tone="solid"
              >
                <PhoneIcon className="h-[17px] w-[17px]" aria-hidden="true" />
              </ContactButton>
            )}
            {wa && (
              <ContactButton href={wa} label={`Message ${member.name} on WhatsApp`}>
                <WhatsAppIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              </ContactButton>
            )}
            {member.email && (
              <ContactButton href={`mailto:${member.email}`} label={`Email ${member.name}`}>
                <MailIcon className="h-[17px] w-[17px]" aria-hidden="true" />
              </ContactButton>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * One squad's staff, or an honest empty state.
 *
 * `staff` is an array — possibly empty. The block is always drawn: a parent
 * attached to a squad should see that squad named on their home screen whether
 * or not anyone has been attached to it yet.
 */
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
          className={`relative h-7 w-7 overflow-hidden rounded-full ring-2 ring-surface-card ${
            index > 0 ? '-ml-2' : ''
          }`}
        >
          <TileBackground name={member.name} role={member.role} url={member.photoUrl} compact />
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
 * worth of players". Measured at 390×844, a four-person squad's mosaic is 472px,
 * so five of them is about 2,400px — three phone screens of contacts hanging off
 * the bottom of Home. Collapsed, each extra squad costs one 56px row.
 *
 * ⚠️ THE COST IS REAL AND IS THE REASON THIS WAS A DECISION RATHER THAN A TWEAK:
 * the contact buttons for the second child onward are now behind a tap, and
 * contacting someone is what this block is FOR. The header carries the faces and
 * the count so the row still says who is in there, and the first squad — the
 * only one most parents have — is untouched.
 *
 * ⚠️ AN EMPTY SQUAD IS NEVER COLLAPSIBLE. There is nothing behind the tap, and a
 * disclosure that opens onto one sentence is a control that wastes a tap to say
 * "still nothing". It renders the sentence directly, as before.
 *
 * `staff` is an array — possibly empty. The block is always drawn: a parent
 * attached to a squad should see that squad named on their home screen whether
 * or not anyone has been attached to it yet.
 */
export function SquadStaffCard({ squadName, staff = [], defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const lead = leadIndex(staff)
  // The lead first, then everyone else in the order the data module chose —
  // which is by NAME. Moving one person to the front is the only reordering
  // this component does, and it is the one the club stated by giving them a
  // title.
  const ordered = lead > 0 ? [staff[lead], ...staff.filter((_, i) => i !== lead)] : staff
  const spans = tileSpans(ordered.length, lead >= 0)
  // ⚠️ THE ROW SPAN IS A MEDIA-QUERY DECISION AND CSS CANNOT EXPRESS IT, because
  // the value is computed per squad. `useMediaQuery` — the hook Roster.jsx and
  // Schedule.jsx already use — keeps it in step with the SAME 372px the grid
  // switches columns at. ⚠️ The number is written twice, here and in the
  // Tailwind variant, and they must move together; see TWO_COLUMN_QUERY.
  const twoColumns = useMediaQuery(TWO_COLUMN_QUERY)

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
            // ⚠️ `min-h-[44px]` — this is the control that opens a collapsed
            // squad, so it is subject to the same floor as every other tap
            // target here. Measured at 36px before this line, which is under it.
            className="mb-1 flex min-h-[44px] w-full items-center gap-2.5 rounded-[10px] px-1 text-left transition-colors hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-ink">
              {squadName}
            </span>
            {/* Only when closed: an open squad shows the faces full size two
                lines below, and repeating them in the header is noise. */}
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
        <p className="rounded-card border border-line bg-surface-card px-4 py-3 text-[13px] text-ink-muted">
          No coach, team manager or medic listed for this squad yet.
        </p>
      ) : (
        // ⚠️ `auto-rows-min` MATTERS. Without it the implicit rows stretch to
        // equal heights and the lead's two-row span drags every tile beside it
        // to half its height, which looks like a bug rather than a mosaic. The
        // spans themselves come from tileSpans() — see its note on why this is
        // not left to the grid.
        // ⚠️ `desktop:max-w-[520px]` CAPS THE GRID RATHER THAN ADDING COLUMNS,
        // and it is here because the uncapped version was measured and was
        // wrong: at 1280 the two columns made each tile 613×136 and the
        // full-width one 1233×152 — letterboxes nine times as wide as they are
        // tall, with a face stretched across them. Capping keeps the tiles the
        // shape they were designed as (roughly 256×136, and the lead nearly
        // square) and leaves whitespace to the right, which is the ordinary
        // outcome for a phone-first block on a wide screen. More columns would
        // mean tileSpans() needing a second set of rules for a grid nobody in
        // this club is looking at — the app is opened on a phone.
        // ⚠️ `hidden` RATHER THAN NOT RENDERING, so `aria-controls` always names
        // an element that exists. A disclosure button pointing at an id that is
        // absent while closed is the most common way this pattern is got wrong,
        // and it is exactly when the pointer matters.
        //
        // ⚠️ AND THE ATTRIBUTE ALONE DOES NOTHING HERE — MEASURED, 15 Aug 2026.
        // Preflight's `[hidden] { display: none }` and the `.grid` utility have
        // the SAME specificity, and the utility comes later in the cascade, so
        // `display: grid` wins and the "hidden" panel renders in full. The card
        // measured 484px tall with `hidden` set. The display class has to be
        // swapped as well; the attribute stays for the semantics.
        <ul
          id={panelId}
          hidden={!open}
          className={`${
            open ? 'grid' : 'hidden'
          } auto-rows-min grid-cols-1 gap-2 min-[372px]:grid-cols-2 desktop:max-w-[520px]`}
        >
          {ordered.map((member, index) => (
            <StaffTile
              key={member.membershipId}
              member={member}
              span={spans[index]}
              // ⚠️ ONLY the lead carries a row span, and only once the grid has
              // two columns to span rows in. Below 372px it is a single column
              // and a multi-row lead would leave a hole.
              style={
                spans[index] === 'lead' && twoColumns
                  ? { gridRow: `span ${leadRowSpan(ordered.length)}` }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export default SquadStaffCard
