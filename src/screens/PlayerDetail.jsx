import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import ScopeNote from '../components/ScopeNote.jsx'
import { deletePlayer, getPlayerContact } from '../data/players.js'
import { listParents } from '../data/parents.js'
import { allowsOwnContact } from '../lib/ageGroup.js'
import { formatPhone } from '../lib/phone.js'
import PlayerAvatar from '../components/PlayerAvatar.jsx'

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
// who can edit this player's squad, a read-only scope note for everyone else.
// Delete is two-step — the confirm replaces the buttons in place rather than
// using a native confirm(), which is unstyled, unannounced and untestable in
// the browser check. `canEdit` is passed in rather than computed here: this
// component stays presentational and Roster already holds memberships (the
// same split ScopeNote and EventDetail use).
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
const GHOST_ACTION = `${ACTION_BASE} border border-line bg-surface-card text-brand hover:bg-surface-mute`

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
      <p role="alert" className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep">
        {error.message || "We couldn't load parent details. Try again."}
      </p>
    )
  }

  if (parents.length === 0) return null

  return (
    <div className="mb-4">
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        {parents.length === 1 ? 'Parent' : 'Parents'}
      </h4>

      {parents.map((parent) => (
        <div key={parent.id} className="border-b border-line py-3 last:border-b-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-bold text-ink">{parent.full_name}</span>
            {parent.relationship && (
              <span className="shrink-0 text-[13px] font-semibold text-ink-faint">
                {parent.relationship}
                {parent.is_primary ? ' · main contact' : ''}
              </span>
            )}
          </div>

          {parent.phone && (
            <a
              className="mt-1 block text-[14.5px] font-semibold text-accent-ink underline"
              href={telHref(parent.phone)}
            >
              {formatPhone(parent.phone)}
            </a>
          )}
          {parent.email && (
            <a
              className="mt-0.5 block break-all text-[14.5px] font-semibold text-accent-ink underline"
              href={`mailto:${parent.email}`}
            >
              {parent.email}
            </a>
          )}
        </div>
      ))}
    </div>
  )
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
      <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep">
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

const FOOTER_BUTTON =
  'flex-1 rounded-[11px] px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

function FooterActions({ player, canEdit, onEdit, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  if (!canEdit) {
    return (
      <div className="mt-5">
        <ScopeNote tone="parent">
          <b>Read-only.</b> Only a coach or club admin can change this player.
        </ScopeNote>
      </div>
    )
  }

  function handleDelete() {
    setDeleting(true)
    setError(null)
    // Only the player row is deleted; player_contacts cascades server-side
    // (see deletePlayer), so there is no second call to fail halfway.
    deletePlayer(player.id)
      .then(() => onDeleted?.(player))
      .catch((err) => {
        setError(err)
        setDeleting(false)
        setConfirming(false)
      })
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
        >
          {error.message || "We couldn't remove that player. Try again."}
        </p>
      )}

      {confirming ? (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Remove this player? Their contact details go too, and this can&apos;t be undone.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className={`${FOOTER_BUTTON} border-[1.5px] border-line bg-surface-card text-ink hover:bg-surface-mute`}
            >
              Keep them
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={`${FOOTER_BUTTON} bg-brand-deep text-white hover:bg-brand`}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => onEdit?.(player)}
            className={`${FOOTER_BUTTON} bg-brand text-white hover:bg-brand-deep`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${FOOTER_BUTTON} border-[1.5px] border-line bg-surface-card text-brand-deep hover:bg-danger-bg`}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function PlayerDetail({ player, team, onClose, canEdit = false, onEdit, onDeleted }) {
  const teamName = team?.name ?? 'Not set'
  const position = player.position || 'Not set'

  return (
    <Sheet open onClose={onClose} title="Player">
      {/* Negative margins bleed the hero to the sheet's edges, matching the
          prototype's .detail-hero (design-system.md §4.21). The prototype
          suffixed a captain's name with "©"; that glyph is announced as
          "copyright" by screen readers and carries no meaning on its own, so
          captaincy is stated in the Role row below instead. */}
      <div className="-mx-[18px] -mt-4 mb-4 bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] px-[18px] py-[22px] text-white">
        <PlayerAvatar player={player} size="lg" className="mb-3" />
        <h3 className="text-[22px] font-bold leading-tight">{player.full_name}</h3>
        <p className="mt-1 text-sm font-semibold text-white/[.85]">
          {position} · {teamName}
        </p>
      </div>

      <div className="mb-4">
        <KeyValue label="Position">{position}</KeyValue>
        <KeyValue label="Age group">{teamName}</KeyValue>
        <KeyValue label="Role">{player.is_captain ? 'Captain' : 'Player'}</KeyValue>
      </div>

      <ParentsBlock playerId={player.id} />

      {/* A player's OWN email and phone are shown only from U13 up (Jay's
          rule, 3 Aug 2026). Below that the block is not rendered at all
          rather than rendered empty: an under-13 should have no direct
          contact route in the app, and an empty "Player contact" heading
          invites someone to go and fill it in. allowsOwnContact fails closed
          when the squad is unknown, so a team row that failed to load
          withholds rather than exposes. */}
      {allowsOwnContact(team?.name) && <ContactBlock playerId={player.id} />}

      <FooterActions player={player} canEdit={canEdit} onEdit={onEdit} onDeleted={onDeleted} />
    </Sheet>
  )
}
