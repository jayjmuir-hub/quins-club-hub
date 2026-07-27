import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { getPlayerContact } from '../data/players.js'

// The player detail sheet (design-system.md §5.7): a branded hero carrying
// the jersey number, a set of key/value rows, and — only when the database
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
// Edit/Delete actions are deliberately absent: Task 15 owns player writes.
// Adding a disabled affordance now would promise a control that doesn't
// exist yet.

// design-system.md §4.22 (.kv). Duplicated from EventDetail rather than
// extracted: the Task 9 shared-primitives set deliberately doesn't include
// it, and two small copies is not yet a pattern. If Tasks 14/15's forms need
// a third, extract it then.
function KeyValue({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#e6e3e1] py-3 last:border-b-0">
      <span className="text-[14.5px] font-semibold text-[#77726e]">{label}</span>
      <span className="text-right text-[14.5px] font-bold text-[#221f1d]">{children}</span>
    </div>
  )
}

// tel: hrefs must not contain spaces; the stored number is freeform.
function telHref(phone) {
  return `tel:${String(phone).replace(/\s+/g, '')}`
}

// design-system.md §3: .btn is padding 10px 15px, radius 11px, 14px/700 —
// filled maroon for the primary action, --maroon text on white for the ghost
// variant (#C21F32 on white measures 5.94:1, clearing AA). Hover on the
// filled variant is --magenta #D62A3D, the same pairing Empty and the retry
// buttons already use.
const ACTION_BASE =
  'flex flex-1 items-center justify-center gap-2 rounded-[11px] px-[15px] py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2'
const PRIMARY_ACTION = `${ACTION_BASE} bg-quinsRed text-white hover:bg-[#D62A3D]`
const GHOST_ACTION = `${ACTION_BASE} border border-[#e6e3e1] bg-white text-quinsRed hover:bg-[#faf8fb]`

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
      <p role="alert" className="rounded-[11px] bg-[#fbeae8] px-3 py-2 text-sm font-semibold text-quinsRedDark">
        {error.message || "We couldn't load contact details. Try again."}
      </p>
    )
  }

  // Nothing to show, and nothing to say about why. See the header comment.
  if (!contact || (!contact.phone && !contact.email)) return null

  return (
    <div>
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-[#77726e]">Contact</h4>
      {contact.phone && (
        <KeyValue label="Phone">
          <a className="text-[#2F7D3D] underline" href={telHref(contact.phone)}>
            {contact.phone}
          </a>
        </KeyValue>
      )}
      {contact.email && (
        <KeyValue label="Email">
          <a className="break-all text-[#2F7D3D] underline" href={`mailto:${contact.email}`}>
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

export default function PlayerDetail({ player, team, onClose }) {
  const jersey = player.jersey_num == null ? '–' : String(player.jersey_num)
  const teamName = team?.name ?? 'Not set'
  const position = player.position || 'Not set'

  return (
    <Sheet open onClose={onClose} title="Player">
      {/* Negative margins bleed the hero to the sheet's edges, matching the
          prototype's .detail-hero (design-system.md §4.21). The prototype
          suffixed a captain's name with "©"; that glyph is announced as
          "copyright" by screen readers and carries no meaning on its own, so
          captaincy is stated in the Role row below instead. */}
      <div className="-mx-[18px] -mt-4 mb-4 bg-[image:linear-gradient(135deg,theme(colors.quinsRedDark),theme(colors.quinsRed))] px-[18px] py-[22px] text-white">
        <div
          className="mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-white/20 text-[22px] font-extrabold"
          aria-hidden="true"
        >
          {jersey}
        </div>
        <h3 className="text-[22px] font-bold leading-tight">{player.full_name}</h3>
        <p className="mt-1 text-sm font-semibold text-white/[.85]">
          {position} · {teamName}
        </p>
      </div>

      <div className="mb-4">
        <KeyValue label="Position">{position}</KeyValue>
        <KeyValue label="Age group">{teamName}</KeyValue>
        <KeyValue label="Jersey number">{player.jersey_num == null ? 'Not set' : player.jersey_num}</KeyValue>
        <KeyValue label="Role">{player.is_captain ? 'Captain' : 'Player'}</KeyValue>
      </div>

      <ContactBlock playerId={player.id} />
    </Sheet>
  )
}
