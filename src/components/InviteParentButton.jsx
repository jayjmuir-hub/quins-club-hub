import { useState } from 'react'
import Button from './Button.jsx'
import { inviteParent } from '../data/parents.js'

// The Invite button on one parent/carer row (plan:
// claude/plans/2026-08-16-account-creation-redesign.md, item 4).
//
// Jay, 16 Aug 2026: "when parent is added to a player account then there should
// be an invite button that the coaches, managers, and admin can click to send
// that person an email invitation" — and then the case that matters most, "if
// the father adds the mother for example".
//
// A player_parents row IS the club's knowledge of an adult, written in the
// wrong table: a name and an address pointing at no account. This turns it into
// an offer.
//
// ══ WHO SEES IT: NOBODY IS GATED HERE, AND THAT IS CORRECT ═══════════════
//
// This renders inside ParentsEditor, which is only ever reached from PlayerForm
// (a coach, manager, medic or admin editing a squad's player) and MyPlayerForm
// (a parent editing their own child). That is exactly `can_edit_team OR
// is_own_player` — the pair of policies that grants the row in the first place,
// and the same pair public.invite_parent checks before it does anything.
//
// ⚠️ SO A ROLE CHECK HERE WOULD BE A SECOND RULE FREE TO DISAGREE WITH THE
// FIRST, and the wrong one would be the one nobody tested. The function refuses
// with 42501 and the refusal is shown; that is the boundary.
//
// ══ THE ONE THING THIS COMPONENT ACTUALLY GUARDS ═════════════════════════
//
// ⚠️ THE INVITE GOES TO THE ADDRESS IN THE DATABASE, NOT THE ONE ON SCREEN.
// public.invite_parent takes a row id and reads the email off the row —
// deliberately, because an address passed as a parameter would turn "invite
// this row" into "invite anyone". The consequence up here is that a half-edited
// form is a trap: type a corrected address, press Invite before Save, and the
// old address is the one that gets an account. So the button refuses to appear
// while the box and the stored value differ, and says why.
//
// ⚠️ WHICH IS ALSO WHY A NEW, UNSAVED ROW GETS THE SAME TREATMENT rather than
// nothing at all. "Where is the button?" is the question the coach who has just
// typed the mother's details will ask, and silence answers it badly.

/** Matches Accounts.jsx's formatJoined — one date format across the app. */
function formatWhen(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const NOTE = 'mt-2 text-[12.5px] leading-relaxed text-ink-muted'

export default function InviteParentButton({ parent, disabled = false }) {
  const [sending, setSending] = useState(false)
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)

  const typed = String(parent?.email ?? '').trim()
  const saved = String(parent?.savedEmail ?? '').trim()

  // No address anywhere on the row: the empty Email box above is already the
  // prompt, and an Invite button beside it would only be able to refuse.
  if (!typed && !saved) return null

  // A row that has never been saved has no id to invite, and an edited address
  // has not reached the database yet. Same sentence for both, because from the
  // user's side they are the same thing: what is on screen is not what the club
  // holds.
  const unsaved = !parent?.id || typed.toLowerCase() !== saved.toLowerCase()

  const who = String(parent?.full_name ?? '').trim() || 'this contact'

  if (unsaved) {
    return (
      <p className={NOTE} role="status">
        Save this player first, then you can invite {who} to their own account.
      </p>
    )
  }

  function send() {
    if (sending) return
    setSending(true)
    setError(null)

    inviteParent(parent.id)
      .then((row) => {
        setInvite(row)
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        setSending(false)
      })
  }

  if (invite) {
    // ⚠️ NO EMAIL IS SENT BY THIS APP, AND THE COPY SAYS SO RATHER THAN LEAVING
    // IT TO BE DISCOVERED. InviteForm has always shown the link for the admin to
    // send by hand — there is no invite-sending edge function yet — so a button
    // that claimed "invitation sent" would be the only screen in the app
    // promising a mail nobody posted.
    const link = `${window.location.origin}/accept-invite/${invite.token}`
    const pending = invite.grant_status !== 'active'

    return (
      <div className="mt-3 rounded-[11px] border border-line bg-surface-card p-3" role="status">
        <p className="text-sm leading-relaxed text-ink">
          Invite ready for <strong>{invite.email}</strong>. Send them this link — there&apos;s no
          automatic email for it yet.
        </p>
        <input
          type="text"
          readOnly
          aria-label={`Invite link for ${who}`}
          value={link}
          onFocus={(domEvent) => domEvent.target.select()}
          className="mt-2 w-full rounded-[11px] border-[1.5px] border-line bg-surface-mute px-3 py-[11px] text-[16px] text-ink outline-none"
        />
        {/* ⚠️ SAYING WHICH IT IS, EVERY TIME. "Sent" alone would let a parent
            believe they had just granted somebody access to the squad, and let
            a coach believe they had left work in the queue when they had not.
            The value is read off the row the function returned, never guessed
            from the current user's role — the two disagree for a medic. */}
        <p className={NOTE}>
          {pending
            ? 'When they accept, they will be added to the approval queue for a coach, ' +
              'manager or admin to approve.'
            : 'They get access as soon as they accept — you could already approve them, ' +
              'so there is nothing left to queue.'}
        </p>
      </div>
    )
  }

  const invitedWhen = formatWhen(parent?.invited_at)

  return (
    <div className="mt-3">
      <Button
        variant="secondary"
        size="sm"
        onClick={send}
        disabled={disabled || sending}
        aria-label={invitedWhen ? `Send ${who}'s invite link again` : `Invite ${who}`}
      >
        {sending ? 'Working…' : invitedWhen ? 'Send the link again' : 'Invite to the Club Hub'}
      </Button>

      {/* The middle state the plan asks for. Without it two coaches invite the
          same person on the same evening, and neither knows. It is NOT proof of
          delivery — nothing here posts an email — so it says "invited", not
          "sent". */}
      {invitedWhen && <p className={NOTE}>Invited {invitedWhen}.</p>}

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
        >
          {error.message}
        </p>
      )}
    </div>
  )
}
