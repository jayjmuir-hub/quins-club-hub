import { useEffect, useState } from 'react'
import { getMyProfile, updateProfileNames } from '../data/members.js'
import {
  createAccessRequest,
  getMyAccessRequest,
  listSquadsForRequest,
} from '../data/accessRequests.js'
import Button from './Button.jsx'

// What a signed-in account with NO membership sees. Replaces the older
// "You're signed in / ask a club admin for an invite" dead end.
//
// This is the user-facing half of the approval gate (see
// db/migrations/20260804_access_requests.sql for why the gate is approval
// rather than closing signup: invites are accepted behind RequireAuth, so an
// invitee needs a session before they can accept, and disabling signup would
// kill the invite flow for every new member).
//
// It shows one of four things, and which one it is matters:
//   - hasn't asked  -> a form, so a real member can put themselves in front of
//                      an admin instead of having to find one out of band
//   - waiting       -> confirmation, so they stop wondering whether it worked
//   - dismissed     -> a clear "not approved", NOT a form. Re-asking is
//                      blocked server-side (no update/delete policy for the
//                      owner, plus a UNIQUE key), so offering a form here
//                      would be offering a button that cannot work.
//   - couldn't load -> the plain message, never a broken form
//
// This screen deliberately shows almost NO club data, because it has almost
// none to show: nearly every SELECT policy in the database bottoms out in a
// memberships row for auth.uid(), so this user reads zero rows from players,
// memberships, events and the rest.
//
// ⚠️ `teams` IS THE EXCEPTION, AND THIS COMMENT ASSERTED THE OPPOSITE UNTIL
// 16 Aug 2026. It said the note below was free text "because there is nothing
// to populate a dropdown with", and a whole SECURITY DEFINER function was
// written on the strength of that sentence before anybody checked it. The
// `team read` policy is `auth.uid() IS NOT NULL`: any signed-in caller reads
// every squad. Measured on production — 15 teams against 0 players, 0
// memberships and 0 events for the same impersonated user, which is the control
// that proves RLS was applied rather than bypassed.
//
// ⚠️ THE CLAIM IS CORRECTED RATHER THAN DELETED, because it was load-bearing:
// it is why this form had no squad picker for its first fortnight. It still
// holds for every other table here, and `auth.uid() IS NOT NULL` still excludes
// `anon`, so nothing on this screen is readable without a session.

// ⚠️ NO 'admin'. Every role here is squad-scoped and granted by a coach or
// manager approving a stranger; admin is club-wide and granted by an existing
// admin on a different screen. The CHECK constraint in the migration holds the
// same list, and the database is the one that matters — if these ever disagree,
// a request fails on save rather than being quietly downgraded.
//
// ⚠️ 'volunteer' IS A ROLE SOMEBODY MAY CLAIM AND NOBODY MAY HOLD, added
// 17 Aug 2026 (Jay's call — see the head of
// db/migrations/20260817_access_request_volunteer_role.sql). Until then a
// committee member had to claim one of the other five, which is the "no idea
// who they are" problem wearing a role that fits even worse. It is deliberately
// NOT in `memberships_role_check`, so an admin approving one still chooses what
// access they actually get, and nothing can grant "volunteer" by accident.
const REQUESTABLE_ROLES = [
  { value: 'parent', label: 'Parent or guardian' },
  { value: 'player', label: 'Player' },
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Team manager' },
  { value: 'medic', label: 'Medic or physio' },
  { value: 'volunteer', label: 'Committee or volunteer' },
]

function Shell({ title, children }) {
  return (
    <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-line bg-surface-card p-6 shadow-card">
      <h2 className="text-center text-lg font-extrabold text-ink">{title}</h2>
      {children}
    </div>
  )
}

// `children` is the sign-out control, passed in rather than imported: it lives
// in AppShell alongside the other place it renders, and every branch below has
// to offer it — someone who cannot get access must still be able to get out.
export default function RequestAccess({ userId, email, children }) {
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [note, setNote] = useState('')
  // ⚠️ REQUIRED SINCE 16 Aug 2026. Jay: "i still have account requests coming in
  // and have no idea who they are because they don't type any extra info". The
  // free-text note stays, but it is no longer the only thing an admin gets.
  const [role, setRole] = useState('')
  const [teamId, setTeamId] = useState('')
  const [squads, setSquads] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // ⚠️ ITS OWN EFFECT, AND A FAILURE HERE IS NOT A FAILURE OF THE SCREEN. The
  // request check below decides WHICH branch renders; this only fills a picker.
  // If the RPC is unreachable the form still has to appear — an empty squad list
  // is handled at the control, which says so, rather than by showing somebody
  // locked out of the club a page that will not load.
  useEffect(() => {
    let mounted = true
    listSquadsForRequest()
      .then((rows) => {
        if (mounted) setSquads(rows)
      })
      .catch(() => {
        if (mounted) setSquads([])
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    // Defensive only: RequireAuth guarantees a session above this, so a
    // signed-in user always has an id. Treated as "couldn't check" rather
    // than "hasn't asked yet", because the alternative is rendering a form
    // whose submit has no profile id to write against and could only fail.
    if (!userId) {
      setLoadFailed(true)
      setLoading(false)
      return undefined
    }

    let mounted = true
    setLoading(true)
    setLoadFailed(false)

    // allSettled, not all: the request row is what decides which state to
    // render, the profile only prefills a text input. A profiles read that
    // fails must not turn "you can ask for access" into an error screen.
    Promise.allSettled([getMyAccessRequest(userId), getMyProfile(userId)])
      .then(([requestResult, profileResult]) => {
        if (!mounted) return
        if (requestResult.status === 'fulfilled') {
          setRequest(requestResult.value)
        } else {
          setLoadFailed(true)
        }
        // Prefill from first/last, which a Google sign-in populates via
        // private.handle_new_user + private.sync_profile_name. Someone who
        // matched nothing on the roster has usually still arrived with a name.
        if (profileResult.status === 'fulfilled' && profileResult.value) {
          setFirstName(String(profileResult.value.first_name ?? ''))
          setLastName(String(profileResult.value.last_name ?? ''))
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [userId])

  async function handleSubmit(event) {
    event.preventDefault()

    const first = firstName.trim()
    if (!first) {
      setError('Enter your first name so the club knows who is asking.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      // Name first, and awaited: the admin's waiting list renders
      // profiles.full_name, so a request that arrives attached to "Unnamed
      // member" is a request nobody can act on.
      //
      // updateProfileNames (not updateProfileName) so this also stamps
      // name_confirmed_at. They have just told us their name in their own
      // words — being made to type it again in the sign-in gate the moment an
      // admin grants them access would be absurd.
      await updateProfileNames({
        profileId: userId,
        firstName: first,
        lastName: lastName.trim(),
      })
      const created = await createAccessRequest({ profileId: userId, note, role, teamId })
      setRequest(created)
    } catch (err) {
      setError(err.message || 'Something went wrong sending your request. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink-faint">Loading…</p>
      </div>
    )
  }

  if (request?.status === 'dismissed') {
    return (
      <Shell title="Access not approved">
        <p className="mt-2 text-center text-sm leading-relaxed text-ink-faint">
          The club hasn&apos;t approved access for{' '}
          <strong className="text-ink">{email}</strong>. If you think that&apos;s
          wrong, speak to someone on the committee — they can re-open it from
          their side.
        </p>
        {children}
      </Shell>
    )
  }

  if (request) {
    return (
      <Shell title="Request sent">
        {/* ⚠️ This used to say "We'll email <address> once someone has
            approved it". THE APP STILL SENDS NO SUCH EMAIL, and the copy below
            is unchanged — but HALF THIS COMMENT WENT STALE and is corrected
            here (13 Aug 2026).

            What is still true: NOBODY IS EMAILED ON APPROVAL. Being let in is
            something the person discovers by signing in, which is why the
            wording below tells them exactly that and promises nothing.

            What is NO LONGER true: this cited state-of-play's "Nobody is
            emailed when an access request ARRIVES". That gap was closed on
            12 Aug by db/migrations/20260812_access_request_notify.sql and the
            `notify-access-request` function, which is ACTIVE on the live
            project. The club IS told. The person asking still is not, which is
            the only direction this paragraph speaks to.

            The rule that outlives both: promising a notification that never
            arrives is worse than promising nothing, because it tells someone to
            stop checking. */}
        <p className="mt-2 text-center text-sm leading-relaxed text-ink-faint">
          Your request is with the club and someone will connect{' '}
          <strong className="text-ink">{email}</strong> to the right age groups.
          There&apos;s nothing else for you to do — next time you sign in, if
          your squads are showing, you&apos;re in.
        </p>
        {request.note && (
          <p className="mt-3 rounded-[11px] bg-surface px-3 py-2 text-sm italic leading-relaxed text-ink-muted">
            “{request.note}”
          </p>
        )}
        {children}
      </Shell>
    )
  }

  // Either they have never asked, or the request read failed. A failed read
  // must not render a form whose submit would fail on the unique key, so it
  // gets the plain message instead.
  if (loadFailed) {
    return (
      <Shell title="You&apos;re signed in">
        <p className="mt-2 text-center text-sm leading-relaxed text-ink-faint">
          Your account isn&apos;t linked to a squad yet, and we couldn&apos;t
          check whether you&apos;ve already asked for access. Try again in a
          moment, or ask a club admin to invite{' '}
          <strong className="text-ink">{email}</strong>.
        </p>
        {children}
      </Shell>
    )
  }

  return (
    <Shell title="Let&apos;s get you connected">
      {/* This copy is doing real work, so it is worth saying why it is shaped
          the way it is.

          Under roster auto-onboarding most people never see this screen at
          all — they sign in and their squads appear. Reaching this screen
          means the address they signed in with is not the one the club holds
          for their child, which is COMMON and is nobody's mistake. Someone in
          that position, expecting to be let straight in, will assume they have
          done something wrong.

          So: reassure first, then offer the fix they can apply themselves
          (sign in with the other address), then the fallback that needs an
          admin. Naming the address is the load-bearing detail — without it,
          "we couldn't find you" is unactionable, and with it most people spot
          the problem instantly. */}
      <p className="mt-2 text-center text-sm leading-relaxed text-ink-faint">
        You&apos;re signed in as <strong className="text-ink">{email}</strong>,
        and we couldn&apos;t find that address on the club roster yet.
      </p>

      <p className="mt-3 rounded-[11px] bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink-muted">
        <strong className="text-ink">Nothing has gone wrong.</strong> Usually it
        just means the club has a different email for you. If you have another
        address you&apos;ve used with the Quins, sign out and sign in with that
        one — you&apos;ll go straight through.
      </p>

      <p className="mt-3 text-center text-sm leading-relaxed text-ink-faint">
        If not, tell us who you are below and we&apos;ll connect you to the
        right age groups from our end. You don&apos;t need to do anything else,
        and you won&apos;t lose your place.
      </p>

      <form className="mt-5" onSubmit={handleSubmit} noValidate>
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink"
          >
            {error}
          </p>
        )}

        {/* Two fields, matching the sign-in name gate rather than the single
            box this screen used to have — the same person can meet both, and
            being asked for "your name" here and "first / family name" there
            reads as two different questions. */}
        <label
          htmlFor="request-first-name"
          className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint"
        >
          First name
        </label>
        <input
          id="request-first-name"
          name="firstName"
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand"
        />

        <label
          htmlFor="request-last-name"
          className="mb-1.5 mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint"
        >
          Family name <span className="font-semibold normal-case">(optional)</span>
        </label>
        <input
          id="request-last-name"
          name="lastName"
          type="text"
          autoComplete="family-name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand"
        />

        {/* ── WHO ARE YOU, AND FOR WHICH SQUAD ────────────────────────────
            ⚠️ BOTH REQUIRED, AND `required` HERE IS THE CONVENIENCE RATHER THAN
            THE RULE. The INSERT policy refuses a row without them
            (db/migrations/20260816_access_request_require_role.sql); this just
            means somebody finds out before they press the button instead of
            after. ── */}
        <label
          htmlFor="request-role"
          className="mb-1.5 mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint"
        >
          I am a
        </label>
        <select
          id="request-role"
          name="role"
          required
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-base text-ink focus:border-brand"
        >
          {/* ⚠️ NO PRESELECTED ROLE. Defaulting to "Parent" would be right most
              of the time and would mean every coach who did not notice the
              dropdown files as a parent — which is the same "no idea who they
              are" problem wearing a more confident face. */}
          <option value="">Choose one…</option>
          {REQUESTABLE_ROLES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label
          htmlFor="request-team"
          className="mb-1.5 mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint"
        >
          Age group
        </label>
        <select
          id="request-team"
          name="teamId"
          required
          disabled={squads.length === 0}
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-base text-ink focus:border-brand disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">
            {squads.length === 0 ? 'Loading squads…' : 'Choose one…'}
          </option>
          {squads.map((squad) => (
            <option key={squad.id} value={squad.id}>
              {squad.name}
            </option>
          ))}
        </select>
        {/* ⚠️ SAYS WHAT TO DO ABOUT THE LIMIT RATHER THAN HIDING IT. One squad
            is what the row can hold, and a parent with three children has a
            real answer to give — the note below is where it goes.

            ⚠️ AND A VOLUNTEER STILL HAS TO PICK ONE. Jay's call, 17 Aug 2026,
            over relaxing the policy: every request naming a squad is what lets
            an admin tell one waiting stranger from another, and that rule is
            four days old. For a club-wide committee member the squad means
            "who to ask about me", not "what I do there" — so the wording
            changes rather than the field. */}
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          {role === 'volunteer'
            ? 'No squad of your own? Pick whichever one knows you best — it just tells us who to ask about you.'
            : 'More than one child, or more than one squad? Pick the eldest and say so below.'}
        </p>

        <label
          htmlFor="request-note"
          className="mb-1.5 mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint"
        >
          Anything else? <span className="font-semibold normal-case">(optional)</span>
        </label>
        <textarea
          id="request-note"
          name="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. also a younger sibling in U8 Tag"
          className="w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand"
        />

        <Button type="submit" full disabled={submitting} className="mt-4">
          {submitting ? 'Sending…' : 'Request access'}
        </Button>
      </form>

      {children}
    </Shell>
  )
}
