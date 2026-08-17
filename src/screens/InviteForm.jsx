import { useCallback, useMemo, useRef, useState } from 'react'
import AccessBuilder from '../components/AccessBuilder.jsx'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import { createInvite } from '../data/members.js'
import { listPlayers } from '../data/players.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { visibleTeams } from '../lib/scope.js'

// The admin-only invite creation form, opened in the shared Sheet from
// Admin.jsx's "Invite a member" entry point. Two fields, conceptually: WHO
// (an email address) and WHAT ACCESS they get on acceptance.
//
// The access half is AccessBuilder — the same component the Accounts screen
// uses to grant access to someone who has already signed up — because the
// question is identical in both places: build the SET of access rows this
// person should hold. One invite now carries MANY targets, so a parent of two
// children in different age groups gets ONE link (design spec 2026-08-03),
// instead of the old one-invite-per-age-group workaround. The mapping is
// exact: AccessBuilder returns rows of {role, teamId, playerId} that all
// share one role, and an invite is one role plus a list of {teamId, playerId}
// targets, each of which becomes one membership at accept time.
//
// AccessBuilder owns the submit button (that is how it validates its own
// targets before handing them over), so this form has no separate "Send
// invite" button — its button is AccessBuilder's, relabelled. A consequence
// worth knowing: AccessBuilder's own refusals (no role, no children chosen)
// are reported before this form ever looks at the email, so with both blank
// the role message comes first. Both are still one click away from being
// fixed, and the alternative — a second submit button — would give the admin
// two things to press for one action.
//
// Access control is NOT enforced here: the invites table's "invites manage"
// RLS policy (ALL, USING+WITH CHECK is_admin(club_id)) is the real boundary,
// as is `invite targets manage` on invite_targets. This form is only ever
// opened from Admin.jsx, which already gates on isAdmin() before rendering an
// "Invite a member" button at all — but createInvite() still turns a
// hypothetical non-admin refusal into a thrown, visible error rather than a
// silent no-op, the same as every other write in this codebase.
//
// ❌ "THERE IS NO EMAIL-SENDING INFRASTRUCTURE IN THIS BUILD" — TRUE UNTIL
// 17 Aug 2026, AND NO LONGER. An AFTER INSERT trigger on `invites` now posts to
// the `notify-invite` edge function, which mails the invitee. It fires for EVERY
// invite, including the ones made here (Jay's call: a rule about which invites
// get emailed is a second rule free to disagree with the first).
//
// ⚠️ THE ACCEPT LINK IS STILL SHOWN, AND THAT IS DELIBERATE RATHER THAN
// LEFTOVER. pg_net queues the request and nothing waits for the result, so a
// failed send is SILENT by design — the admin who pressed the button is the only
// person in a position to notice and act.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const FIELD = 'mb-3.5'
const INPUT_BASE =
  'w-full rounded-[11px] border-[1.5px] bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

// What AccessBuilder's aria-labels are built from ("Role for the new member",
// "Children for the new member", "Send invite for the new member").
const WHO = 'the new member'

// A deliberately simple check, matching the input's own type="email" intent:
// this is a friendly-typo catch, not the source of truth on validity — the
// database has no email-format constraint either, and Supabase Auth is what
// actually verifies an address by requiring the invitee to click a real
// magic link sent to it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const BAD_EMAIL = 'Enter a valid email address before sending.'
// The client-side half of the rule that used to be the
// `invites_team_required_unless_admin` CHECK constraint. That constraint has
// been DROPPED; accept_invite enforces it instead, but it does so at ACCEPT
// time — i.e. the admin would send a link that looks fine and the invitee
// would hit "This invite is incomplete" days later, with no way to tell what
// went wrong. Refusing here keeps that link from existing. AccessBuilder's
// own validation already makes this unreachable through the UI (every
// non-admin role requires at least one target); it stays as the explicit,
// tested statement of an invariant the database no longer holds for us.
export const NO_ACCESS_CHOSEN =
  "That invite has no age group, so it wouldn't give anyone access. Choose an age group first."

function inputClasses(invalid) {
  return [INPUT_BASE, invalid ? 'border-brand-deep' : 'border-line'].join(' ')
}

export default function InviteForm({ onClose, onSaved }) {
  const { user } = useAuth()
  const { memberships, teams } = useMemberships()

  // Every team in the club, in the club's own sort order — an admin invites
  // club-wide, unlike PlayerForm/EventForm's canEditTeam-filtered lists,
  // which narrow to what the *current* user may edit. visibleTeams' admin
  // special-case already returns every team sorted; this form is admin-only
  // regardless of the signed-in admin's own team_id (which is null anyway).
  const allTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])

  const [email, setEmail] = useState('')
  const [emailInvalid, setEmailInvalid] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [invite, setInvite] = useState(null)

  // The roster, loaded ONCE and only when AccessBuilder actually asks for it
  // (a parent's children, or a player invite) — ~315 rows that most invites
  // never look at. listPlayers() with no teamIds on purpose: an admin naming
  // a parent's child needs the whole club, and the child's own team_id is
  // what supplies the invite target's age group, so there is nothing to
  // pre-scope it by. This replaces the old "choose an age group, then choose
  // a player in it" pair of selects, which could only ever describe one child
  // and let the admin state an age group that contradicted the player's own.
  const [players, setPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playersError, setPlayersError] = useState(null)
  const playersRequested = useRef(false)

  // Stable across renders: AccessBuilder calls this from an effect.
  const loadPlayers = useCallback(() => {
    if (playersRequested.current) return
    playersRequested.current = true
    setPlayersLoading(true)
    listPlayers()
      .then((rows) => {
        setPlayers(rows)
        setPlayersError(null)
      })
      .catch((err) => {
        setPlayersError(err)
        // Re-loadable: a failed roster read must not permanently disable the
        // child picker for the rest of the session.
        playersRequested.current = false
      })
      .finally(() => setPlayersLoading(false))
  }, [])

  // Guards against a double submit landing two invites: `saving` state is
  // async, this is not.
  const inFlight = useRef(false)

  function handleSubmit(rows) {
    if (inFlight.current) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailInvalid(true)
      setError(new Error(BAD_EMAIL))
      return
    }
    setEmailInvalid(false)

    // Every row carries the same role — AccessBuilder builds one role's worth
    // of rows, and `invites.role` is a single column. Mixed roles in one
    // invite are deliberately out of scope (design spec): the admin adds the
    // second role from Accounts after the person signs up.
    const role = rows[0]?.role
    // An admin row has no team, so it contributes no target — an admin invite
    // is club-wide and correctly has zero invite_targets rows.
    const targets = rows
      .filter((row) => row.teamId)
      .map((row) => ({ teamId: row.teamId, playerId: row.playerId ?? null }))

    if (!role || (role !== 'admin' && targets.length === 0)) {
      setError(new Error(NO_ACCESS_CHOSEN))
      return
    }

    const clubId = teams[0]?.club_id ?? null

    inFlight.current = true
    setSaving(true)
    setError(null)

    createInvite({
      clubId,
      email: trimmedEmail,
      role,
      // The legacy single-target columns are mirrored only when there is
      // exactly ONE target, where they say the same thing the target does.
      // With several, any single value would be a lie: if the targets insert
      // failed AND its cleanup delete were refused, the leftover invite would
      // take accept_invite's legacy fallback and silently grant one of the
      // age groups. Null makes that leftover grant nothing and fail loudly
      // instead. (Removing these columns is a logged follow-up.)
      teamId: targets.length === 1 ? targets[0].teamId : null,
      playerId: targets.length === 1 ? targets[0].playerId : null,
      targets,
      createdBy: user?.id ?? null,
    })
      .then((saved) => {
        setInvite(saved)
        onSaved?.(saved)
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        inFlight.current = false
        setSaving(false)
      })
  }

  const acceptLink = invite?.token ? `${window.location.origin}/accept-invite/${invite.token}` : ''

  return (
    <Sheet open onClose={onClose} title="Invite a member">
      {invite ? (
        <div>
          {/* ⚠️ THE LINK STAYS, AND IT IS NOT LEFTOVER COPY. The email is queued
              through pg_net by a trigger and nothing waits for the result, so a
              failed send is silent by design — the admin who pressed the button
              is the only person who can notice and act. "We've emailed" rather
              than "sent", because nothing here has proof of delivery. */}
          <p className="mb-3 text-sm leading-relaxed text-ink">
            We&apos;ve emailed an invite to <strong>{invite.email}</strong>. If it doesn&apos;t
            arrive, copy the link below and send it to them directly.
          </p>
          <div className={FIELD}>
            <label className={LABEL} htmlFor="invite-link">
              Accept link
            </label>
            <input
              id="invite-link"
              type="text"
              readOnly
              value={acceptLink}
              onFocus={(domEvent) => domEvent.target.select()}
              className={inputClasses(false)}
            />
          </div>
          <Button size="lg" full onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        // The submit button lives in AccessBuilder, so this form is never
        // submitted in the DOM sense — onSubmit only swallows the implicit
        // submission a lone text input gets from Enter, which would otherwise
        // reload the page.
        <form onSubmit={(domEvent) => domEvent.preventDefault()} noValidate>
          <div className={FIELD}>
            <label className={LABEL} htmlFor="invite-email">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(domEvent) => {
                setEmail(domEvent.target.value)
                setEmailInvalid(false)
              }}
              aria-invalid={emailInvalid ? 'true' : undefined}
              placeholder="e.g. coach@example.com"
              className={inputClasses(emailInvalid)}
            />
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              They&apos;ll have to sign in with this exact address for the link to work.
            </p>
          </div>

          <div className={FIELD}>
            <span className={LABEL}>Access</span>
            <div className="rounded-[11px] border border-line bg-surface-mute p-2.5">
              <AccessBuilder
                label={WHO}
                teams={allTeams}
                players={players}
                playersLoading={playersLoading}
                playersError={playersError}
                onNeedPlayers={loadPlayers}
                saving={saving}
                error={error}
                submitLabel="Send invite"
                onSubmit={handleSubmit}
              />
            </div>
            <p className="mt-1.5 text-[12.5px] text-ink-muted">
              A parent of two children gets one link — pick both children here.
            </p>
          </div>
        </form>
      )}
    </Sheet>
  )
}
