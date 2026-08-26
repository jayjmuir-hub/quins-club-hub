import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from './Sheet.jsx'
import {
  ChatIcon,
  ContactButton,
  MailIcon,
  PhoneIcon,
  StaffAvatar,
  WhatsAppIcon,
} from './SquadStaffCard.jsx'
import { getPersonCard } from '../data/personCard.js'
import { openConversation } from '../data/messages.js'
import { labelForRole } from '../lib/scope.js'
import { whatsappUrl } from '../lib/phone.js'

// The person card — tap any name, contact the person
// (claude/plans/2026-08-26-person-card.md).
//
// ⚠️ THE SCREEN NEVER DECIDES WHO SEES WHAT. member_contact_card nulls the
// contact columns server-side (ruling C: a staff/admin role is contactable
// club-wide; a parent only by the staff who manage them), so a card with
// nothing but Chat is a NORMAL card — the database's answer, not an empty
// state. Do not add client-side role checks here; they would only be a
// second, driftable copy of the rule.
//
// Whether a DM is even allowed stays openConversation's call — its refusal
// is the database's words, the same contract Chat.jsx's openDmWith documents.
export default function PersonCard({ profileId, onClose }) {
  // ⚠️ THE NULL BRANCH RUNS NO HOOKS. Screens render <PersonCard> permanently
  // and pass profileId only when a name is tapped; useNavigate would throw for
  // every screen test not wrapped in a Router if it ran while closed.
  if (!profileId) return null
  return <PersonCardBody profileId={profileId} onClose={onClose} />
}

function PersonCardBody({ profileId, onClose }) {
  const navigate = useNavigate()
  const [person, setPerson] = useState(null)
  const [error, setError] = useState(null)
  const [chatError, setChatError] = useState(null)

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    // Reset per person — a stale card must never flash under a new name.
    setPerson(null)
    setError(null)
    setChatError(null)
    getPersonCard(profileId)
      .then((row) => {
        if (cancelled) return
        if (row) setPerson(row)
        else setError('Could not find this person.')
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load their details.')
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  async function chat() {
    setChatError(null)
    try {
      const dm = await openConversation(profileId)
      onClose()
      navigate(`/chat/dm/${dm}`)
    } catch (err) {
      setChatError(err.message || 'Could not open a chat with them.')
    }
  }

  const wa = person?.phone ? whatsappUrl(person.phone) : null
  // The title replaces the role label rather than joining it — "Head Coach"
  // beside a "Coach" chip is the same word twice (SquadStaffCard's rule).
  const roleLine = person
    ? [person.title ?? (person.isSuper ? 'Super admin' : labelForRole(person.role)), ...person.squads].filter(Boolean).join(' · ')
    : null

  return (
    <Sheet open onClose={onClose} title="Contact">
      {error ? (
        <p className="px-1 py-2 text-sm font-semibold text-danger" data-testid="person-card-error">
          {error}
        </p>
      ) : !person ? (
        // One skeleton row, the same footprint as the loaded card — the sheet
        // is already up, so the wait must not look like a dead tap.
        <div className="flex items-center gap-3 px-1 py-2" aria-hidden="true">
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-surface-mute" />
          <span className="h-4 w-40 animate-pulse rounded bg-surface-mute" />
        </div>
      ) : (
        <div data-testid="person-card">
          <div className="flex items-center gap-3 px-1 py-2">
            <StaffAvatar name={person.name} role={person.role} url={person.photoUrl} focus={person.focus} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-extrabold text-ink">{person.name}</p>
              {roleLine && (
                <p className="mt-0.5 truncate font-condensed text-[11px] font-bold uppercase tracking-[.1em] text-ink-muted">
                  {roleLine}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-nowrap gap-2 px-1 pb-1 pt-2" data-testid="person-card-actions">
            {person.phone && (
              <ContactButton href={`tel:${person.phone}`} label={`Call ${person.name}`} tone="solid">
                <PhoneIcon className="h-[15px] w-[15px]" aria-hidden="true" />
              </ContactButton>
            )}
            {wa && (
              <ContactButton href={wa} label={`Message ${person.name} on WhatsApp`}>
                <WhatsAppIcon className="h-[16px] w-[16px]" aria-hidden="true" />
              </ContactButton>
            )}
            {person.email && (
              <ContactButton href={`mailto:${person.email}`} label={`Email ${person.name}`}>
                <MailIcon className="h-[15px] w-[15px]" aria-hidden="true" />
              </ContactButton>
            )}
            <ContactButton onClick={chat} label={`Chat with ${person.name}`}>
              <ChatIcon className="h-4 w-4" aria-hidden="true" />
            </ContactButton>
          </div>
          {chatError && (
            <p className="px-1 pb-1 text-sm font-semibold text-danger" data-testid="person-card-chat-error">
              {chatError}
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}
