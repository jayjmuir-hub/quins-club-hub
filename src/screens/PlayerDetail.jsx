import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
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

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner label="Loading contact details…" />
      </div>
    )
  }

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
