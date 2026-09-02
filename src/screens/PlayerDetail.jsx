import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { deletePlayer, getPlayerContact, getPlayerDob, markPlayerLeft, restorePlayer } from '../data/players.js'
import { formatLeftDate, isLeaver } from '../lib/leavers.js'
import { listParents } from '../data/parents.js'
import useOwnContactGate from '../lib/useOwnContactGate.js'
// The club's own age function, so the number shown here cannot drift from the
// one that decides which squad a child belongs in.
import { ageAt } from '../lib/ageGrade.js'
import { formatPhone } from '../lib/phone.js'
import { genderLabel } from '../lib/gender.js'
import PlayerAvatar from '../components/PlayerAvatar.jsx'
import Button from '../components/Button.jsx'
import PersonCard from '../components/PersonCard.jsx'
import PersonName from '../components/PersonName.jsx'

// The player detail sheet (design-system.md §5.7): a branded hero carrying
// the player's initials, a set of key/value rows, and — only when the database
// actually returns one — a contact block. Mounted only while a player is
// selected (Roster renders it conditionally), so there is no `open` prop to
// thread through and no hidden-but-present DOM.
//
// Safeguarding, and the single most important rule in this file: a null
// contact row is the NORMAL outcome for a parent. player_contacts exists as
// a separate table precisely so RLS can withhold it, including for minors.
// So a null row renders *nothing*: no error, and no "contact details are
// hidden" note either — such a note would confirm to someone who may not see
// the data that there is data to see. The prototype showed a parent a lock
// message here (design-system.md §5.7); that is the one place this screen
// deliberately departs from it.
//
// Footer actions (design-system.md §5.7, Task 15): Edit + Delete for a user
// who can edit this player's squad, and nothing at all for everyone else.
// Delete is two-step — the confirm replaces the buttons in place rather than
// using a native confirm(), which is unstyled, unannounced and untestable in
// the browser check. `canEdit` is passed in rather than computed here: this
// component stays presentational and Roster already holds memberships (the
// same split EventDetail uses).
//
// The footer sits OUTSIDE ContactBlock, unlike the Call/Email row which sits
// inside it. That difference is deliberate and safeguarding-relevant: Call
// and Email expose the contact data itself, so they must vanish with it,
// whereas Edit/Delete are about the player record and are governed by squad
// edit rights alone. Whether a contact row came back is never allowed to
// change what the footer shows — if it did, the footer would become a way to
// infer that withheld details exist.

// design-system.md §4.22 (.kv). Duplicated from EventDetail rather than
// extracted: the Task 9 shared-primitives set deliberately doesn't include
// it, and two small copies is not yet a pattern. If Tasks 14/15's forms need
// a third, extract it then.
function KeyValue({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="text-[14.5px] font-semibold text-ink-faint">{label}</span>
      <span className="text-right text-[14.5px] font-bold text-ink">{children}</span>
    </div>
  )
}

// tel: hrefs must not contain spaces; the stored number is freeform.
function telHref(phone) {
  return `tel:${String(phone).replace(/\s+/g, '')}`
}

// design-system.md §3: .btn is padding 10px 15px, radius 11px, 14px/700 —
// filled maroon for the primary action, --maroon text on white for the ghost
// variant (#e11b22 on white measures 5.94:1, clearing AA). Hover on the
// filled variant is --magenta #f0343a, the same pairing Empty and the retry
// buttons already use.
const ACTION_BASE =
  'flex flex-1 items-center justify-center gap-2 rounded-[11px] px-[15px] py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'
const PRIMARY_ACTION = `${ACTION_BASE} bg-brand text-white hover:bg-brand-deep`
const GHOST_ACTION = `${ACTION_BASE} border border-line bg-surface-card text-brand-ink hover:bg-surface-mute`

function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 6 4Z" />
    </svg>
  )
}

function MailIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  )
}

// The parents/carers block. Same shape and the same rules as ContactBlock
// below, and for the same reason: player_parents carries adults' names and
// contact details attached to a named child, and its RLS policies are copied
// verbatim from player_contacts. So an empty result renders NOTHING — no
// error, and no "hidden" note, because such a note would confirm to someone
// who may not see the data that there is data to see.
//
// Ordering is the database's (primary first, then sort_order, then name), so
// the household's main contact is always the first row.
function ParentsBlock({ playerId }) {
  const [parents, setParents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // The person card (claude/plans/2026-08-26-person-card.md). A parent row's
  // profile_id is set only once they have claimed an account — an unclaimed
  // row stays plain text via PersonName's null branch, which is honest: there
  // is no account to chat with.
  //
  // ⚠️ NO selfId HERE, DELIBERATELY. This block does not know who is signed in
  // (useAuth would need a provider ten test files never mount), so a parent
  // tapping their OWN name gets a card about themselves — odd, never harmful.
  const [cardFor, setCardFor] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listParents(playerId)
      .then((rows) => {
        if (mounted) setParents(rows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setParents([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [playerId])

  // Nothing while in flight — the block appears late rather than announcing
  // itself and then collapsing to nothing on an empty result.
  if (loading) return null

  if (error) {
    return (
      <p role="alert" className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
        {error.message || "We couldn't load parent details. Try again."}
      </p>
    )
  }

  if (parents.length === 0) return null

  // Call/Email actions go on the MAIN CONTACT only (Jay, 4 Aug 2026). With a
  // pair on every parent the sheet became mostly buttons, and the second set
  // pushed the details themselves below the fold. The numbers are still
  // there and still tappable on every row -- it is the heavyweight action
  // pair that is reserved for the one person you'd actually ring first.
  //
  // Falls back to the first row when nothing is flagged primary, which is
  // possible for rows created before is_primary existed. The database orders
  // primary-first, so the first row is the right guess.
  const mainContactId = (parents.find((parent) => parent.is_primary) ?? parents[0])?.id ?? null

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        {parents.length === 1 ? 'Parent' : 'Parents'}
      </h4>

      {/* Laid out exactly like ContactBlock below: labelled Phone/Email rows
          and then the Call/Email actions. Parent details are the numbers
          somebody actually needs at 7am on a Saturday, so they get the same
          treatment as the player's own — not a denser, different one. */}
      {parents.map((parent) => (
        <div key={parent.id} className="border-b border-line py-3 last:border-b-0">
          <div className="flex items-baseline justify-between gap-3">
            <PersonName
              profileId={parent.profile_id}
              onOpen={setCardFor}
              className="text-[15px] font-bold text-ink"
            >
              {parent.full_name}
            </PersonName>
            {parent.relationship && (
              <span className="shrink-0 text-[13px] font-semibold text-ink-faint">
                {parent.relationship}
                {parent.is_primary ? ' · main contact' : ''}
              </span>
            )}
          </div>

          {parent.phone && (
            <KeyValue label="Phone">
              <a className="text-accent-ink underline" href={telHref(parent.phone)}>
                {formatPhone(parent.phone)}
              </a>
            </KeyValue>
          )}
          {parent.email && (
            <KeyValue label="Email">
              <a className="break-all text-accent-ink underline" href={`mailto:${parent.email}`}>
                {parent.email}
              </a>
            </KeyValue>
          )}

          {parent.id === mainContactId && (parent.phone || parent.email) && (
            <div className="mt-3 flex gap-2">
              {parent.phone && (
                <a href={telHref(parent.phone)} className={PRIMARY_ACTION}>
                  <PhoneIcon className="h-4 w-4" aria-hidden="true" />
                  Call
                </a>
              )}
              {parent.email && (
                <a href={`mailto:${parent.email}`} className={GHOST_ACTION}>
                  <MailIcon className="h-4 w-4" aria-hidden="true" />
                  Email
                </a>
              )}
            </div>
          )}
        </div>
      ))}

      <PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />
    </div>
  )
}

/**
 * The child's date of birth and the age it works out to — for whoever is
 * entitled to see it, and invisible to everyone else.
 *
 * ⚠️ IT RENDERS NOTHING WITHOUT A VALUE, WHICH IS THIS FILE'S EXISTING RULE
 * AND NOT A NEW ONE. ContactBlock states it above: never suggest withheld data
 * exists. Parents reach this screen, and `player_private` is readable only by
 * squad staff or the child's own family — so a parent looking at a team-mate
 * gets null from RLS, identical to a child with no birthday on file. An empty
 * "Date of birth" row would tell them one exists and is being kept from them.
 *
 * ⚠️ getPlayerDob's own header says null means "not set OR you may not see it"
 * and that callers MUST NOT tell them apart. This one does not try: both render
 * nothing, which is the only treatment that is honest in both cases.
 *
 * ⚠️ THE AGE IS SHOWN ALONGSIDE THE DATE, NOT INSTEAD OF IT. `ageAt` is the
 * club's own function — the same one the age-grade check uses — so the number
 * here cannot drift from the number that decides a squad. Showing only an age
 * would also make a wrong birthday harder to spot, and spotting wrong ones is
 * half the reason the club is collecting them.
 */
function BirthdayBlock({ playerId }) {
  const [dob, setDob] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    getPlayerDob(playerId)
      .then((value) => {
        if (mounted) setDob(value ?? null)
      })
      // Swallowed on purpose, like ContactBlock's own read: a failed birthday
      // read must not put an error card on a screen somebody opened to find a
      // phone number.
      .catch(() => {
        if (mounted) setDob(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [playerId])

  if (loading || !dob) return null

  const age = ageAt(dob, new Date())

  return (
    <div data-testid="player-birthday" className="mb-4">
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        Date of birth
      </h4>
      <KeyValue label="Born">
        {formatBirthday(dob)}
        {Number.isFinite(age) && (
          <span className="ml-2 font-semibold text-ink-muted">({age})</span>
        )}
      </KeyValue>
    </div>
  )
}

// en-GB, matching every other date this app renders (formatJoined in
// Accounts.jsx does the same). An ISO string on a parent-facing screen reads as
// a database field rather than a birthday.
function formatBirthday(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ContactBlock({ playerId }) {
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // No realtime source touches player_contacts, and this effect's only
  // dependency is the player id — so every run of it genuinely IS a first
  // load for that player, and a plain `loading` flag is honest here. (The
  // isFirstLoad/settled-ref dance the Schedule and EventDetail screens need
  // exists to stop a realtime refresh blanking already-rendered content;
  // there is nothing to refresh from here.)
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    getPlayerContact(playerId)
      .then((row) => {
        if (mounted) setContact(row)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setContact(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [playerId])

  // Nothing at all while the query is in flight — the block simply appears
  // late rather than announcing itself and then collapsing. A spinner here
  // drew a ~68px box exactly where contact details belong and then vanished
  // on a null row; worse, Spinner is role="status" inside an aria-live
  // region, so a parent heard "Loading contact details…" followed by silence.
  // (It was never a leak — this renders before the outcome is known, so it
  // looked identical for a player with details and one without — but it
  // contradicted this file's own "renders nothing" contract.)
  if (loading) return null

  if (error) {
    return (
      <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
        {error.message || "We couldn't load contact details. Try again."}
      </p>
    )
  }

  // Nothing to show, and nothing to say about why. See the header comment.
  if (!contact || (!contact.phone && !contact.email)) return null

  return (
    <div>
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        Player contact
      </h4>
      {contact.phone && (
        <KeyValue label="Phone">
          <a className="text-accent-ink underline" href={telHref(contact.phone)}>
            {formatPhone(contact.phone)}
          </a>
        </KeyValue>
      )}
      {contact.email && (
        <KeyValue label="Email">
          <a className="break-all text-accent-ink underline" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        </KeyValue>
      )}

      {/* The Call/Email action row (design-system.md §5.7), under the contact
          rows. Deliberately inside this block and not below it, so it cannot
          survive the early return above — an action row offering to phone a
          player whose contact row RLS withheld would be exactly the leak this
          file exists to prevent. Each button appears only if its value does.
          Anchors, not buttons: these navigate to a tel:/mailto: URL. */}
      <div className="mt-3.5 flex gap-2">
        {contact.phone && (
          <a href={telHref(contact.phone)} className={PRIMARY_ACTION}>
            <PhoneIcon className="h-4 w-4" aria-hidden="true" />
            Call
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className={GHOST_ACTION}>
            <MailIcon className="h-4 w-4" aria-hidden="true" />
            Email
          </a>
        )}
      </div>
    </div>
  )
}

// ⚠️ LAYOUT ONLY — see the identical note in EventDetail.jsx. <Button> supplies
// the radius, padding, weight, focus ring and disabled state; repeating them
// here would leave `rounded-[11px]` racing `rounded-btn` on equal specificity.
const FOOTER_BUTTON = 'flex-1'

// Footer actions (design-system.md §5.7). Since 2 Sep 2026 the staff pair is
// Edit + MARK AS LEFT, and Delete is ADMIN-ONLY (canDelete = canWriteChild):
// "the child quit" is a leaving, never a deletion — attendance and selection
// history stay, the parents' access to this squad ends, the photo goes.
// Spec: claude/specs/2026-09-02-player-leavers-design.md §5. Delete is kept
// for a duplicate registration, which is an admin's job. A LEAVER gets one
// action, Restore, and no Edit — the row is history until somebody brings it
// back. RLS and the two RPCs enforce all of this; getting it wrong here can
// only hide a control, never authorise a write.
function FooterActions({ player, canEdit, canEditOwn, canDelete, onEdit, onEditOwn, onDeleted, onLeft, onRestored }) {
  const [confirming, setConfirming] = useState(null) // null | 'left' | 'delete'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // A parent or the player themselves gets ONE action, not the staff pair:
  // they can update the photo, contact details and parent rows, and they
  // cannot mark a player as left or delete one. Wording avoids "Edit" so it
  // doesn't read as the same power staff have. A leaver's own family gets
  // nothing here either — the row is history, not something to update.
  if (!canEdit && canEditOwn && !isLeaver(player)) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <Button full onClick={() => onEditOwn?.(player)} className={FOOTER_BUTTON}>
          Update details
        </Button>
      </div>
    )
  }

  // Nothing at all for anyone else. Not being able to change a player is the
  // expected, unremarkable state for almost everyone who opens this sheet;
  // saying so in a banner every single time treats the normal case as an
  // exception worth interrupting for.
  if (!canEdit) return null

  function run(action, after) {
    setBusy(true)
    setError(null)
    action(player.id)
      .then(() => after?.(player))
      .catch((err) => {
        setError(err)
        setBusy(false)
        setConfirming(null)
      })
  }

  const alert = error && (
    <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink">
      {error.message || "We couldn't change that player. Try again."}
    </p>
  )

  if (isLeaver(player)) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        {alert}
        <Button full disabled={busy} onClick={() => run(restorePlayer, onRestored)} className={FOOTER_BUTTON}>
          {busy ? 'Restoring…' : 'Restore'}
        </Button>
      </div>
    )
  }

  const firstName = player.first_name || player.full_name
  return (
    <div className="mt-5 border-t border-line pt-4">
      {alert}
      {confirming === 'left' && (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Mark {firstName} as left? They come off the squad list and selection, their parents&apos;
            access to this squad ends, and their photo is removed. Attendance and match history
            are kept. You or an admin can undo this from the roster.
          </p>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy} className={FOOTER_BUTTON}>Keep them</Button>
            <Button variant="danger" onClick={() => run(markPlayerLeft, onLeft)} disabled={busy} className={FOOTER_BUTTON}>
              {busy ? 'Marking…' : 'Yes, mark as left'}
            </Button>
          </div>
        </div>
      )}
      {confirming === 'delete' && (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Delete this player? Their contact details go too, and this can&apos;t be undone. If they
            have simply left the club, use Mark as left instead.
          </p>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy} className={FOOTER_BUTTON}>Keep them</Button>
            <Button variant="danger" onClick={() => run(deletePlayer, onDeleted)} disabled={busy} className={FOOTER_BUTTON}>
              {busy ? 'Deleting…' : 'Yes, delete'}
            </Button>
          </div>
        </div>
      )}
      {confirming === null && (
        <div className="flex gap-2.5">
          <Button onClick={() => onEdit?.(player)} className={FOOTER_BUTTON}>Edit</Button>
          <Button variant="dangerQuiet" onClick={() => setConfirming('left')} className={FOOTER_BUTTON}>Mark as left</Button>
          {canDelete && (
            <Button variant="dangerQuiet" onClick={() => setConfirming('delete')} className={FOOTER_BUTTON}>Delete</Button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PlayerDetail({
  player,
  team,
  onClose,
  canEdit = false,
  canEditOwn = false,
  canDelete = false,
  onEdit,
  onEditOwn,
  onDeleted,
  onLeft,
  onRestored,
}) {
  const teamName = team?.name ?? 'Not set'
  const position = player.position || 'Not set'
  // null when never recorded, and the badge below is then not rendered at
  // all. Deliberately NOT 'Not set' the way position is: position has an
  // editable control everyone expects to find, whereas a "Gender: Not set"
  // line on a child's record reads as an omission somebody ought to correct
  // — on hundreds of players, to no one's benefit.
  const gender = genderLabel(player.gender)
  // ⚠️ THE BIRTHDAY NARROWS THE SQUAD'S ANSWER AND CAN ONLY NARROW IT (17 Aug
  // 2026, the re-point). A twelve-year-old playing up in U13 loses this block;
  // nothing a birthday says can add it. See src/lib/useOwnContactGate.js.
  const { allowed: ownContactAllowed } = useOwnContactGate(player.id, team?.name)

  return (
    <Sheet open onClose={onClose} title="Player">
      {/* Negative margins bleed the hero to the sheet's edges, matching the
          prototype's .detail-hero (design-system.md §4.21). The prototype
          suffixed a captain's name with "©"; that glyph is announced as
          "copyright" by screen readers and carries no meaning on its own, so
          captaincy is stated in the Role row below instead. */}
      <div className="-mx-[18px] -mt-4 mb-4 flex items-center gap-4 bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] px-[18px] py-[22px] text-white">
        <PlayerAvatar player={player} size="xl" />
        {/* min-w-0 so a long name truncates inside the flex row instead of
            pushing the photo off the sheet. */}
        <div className="min-w-0">
          <h3 className="text-[22px] font-bold leading-tight">{player.full_name}</h3>
          {/* ⚠️ STAFF ONLY, since 25 Aug 2026: position is decorated onto the
              row from a staff-only table, so for a parent it is always absent
              — and printing "Not set" for them would suggest an omission they
              are not allowed to see corrected. canEdit is the staff signal
              this sheet already carries; staff still get "Not set". */}
          {canEdit && <p className="mt-1 text-sm font-semibold text-white/[.85]">{position}</p>}
          <p className="text-sm font-semibold text-white/[.85]">{teamName}</p>
          {isLeaver(player) && (
            <p className="mt-1 text-sm font-semibold text-white/[.85]">
              {/* ⚠️ formatLeftDate, NOT toLocaleDateString. AdminClub shows the
                  same fact, and until 2 Sep 2026 the two disagreed in September
                  only — ICU's en-GB short month is 'Sept'. One formatter, in
                  src/lib/leavers.js. */}
              Left {formatLeftDate(player.left_at)}
            </p>
          )}
          {/* Captaincy used to live in a "Role" key/value row below, because
              the prototype's "©" suffix is announced as "copyright" and means
              nothing on its own. The row went with Position and Age group
              when those moved up here; this keeps the fact visible and still
              reads as a word rather than a glyph. */}
          {/* Captain and gender share one wrapping row so a captain with a
              gender recorded doesn't push the hero taller on a narrow phone.
              Each pill appears only if its value does. */}
          {(player.is_captain || gender) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {player.is_captain && (
                <span className="inline-block rounded-pill bg-white/20 px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.06em]">
                  Captain
                </span>
              )}
              {gender && (
                <span
                  data-testid="player-gender"
                  className="inline-block rounded-pill bg-white/20 px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.06em]"
                >
                  {gender}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ⚠️ RENDERS NOTHING WITHOUT A VALUE, AND THAT IS THIS SCREEN'S EXISTING
          RULE RATHER THAN A NEW ONE — see ContactBlock above: never suggest
          withheld data exists. Parents reach this screen, and player_private is
          readable only by squad staff or the child's own family, so a parent
          looking at a team-mate gets null from RLS. An empty "Date of birth"
          row would tell them there is one and they may not see it. */}
      <BirthdayBlock playerId={player.id} />

      <ParentsBlock playerId={player.id} />

      {/* A player's OWN email and phone are shown only from U13 up (Jay's
          rule, 3 Aug 2026). Below that the block is not rendered at all
          rather than rendered empty: an under-13 should have no direct
          contact route in the app, and an empty "Player contact" heading
          invites someone to go and fill it in. allowsOwnContact fails closed
          when the squad is unknown, so a team row that failed to load
          withholds rather than exposes. */}
      {ownContactAllowed && <ContactBlock playerId={player.id} />}

      <FooterActions
        player={player}
        canEdit={canEdit}
        canEditOwn={canEditOwn}
        canDelete={canDelete}
        onEdit={onEdit}
        onEditOwn={onEditOwn}
        onDeleted={onDeleted}
        onLeft={onLeft}
        onRestored={onRestored}
      />
    </Sheet>
  )
}
