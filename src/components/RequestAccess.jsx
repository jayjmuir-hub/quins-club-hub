import { useEffect, useState } from 'react'
import { getMyProfile, updateProfileNames } from '../data/members.js'
import { createAccessRequest, getMyAccessRequest } from '../data/accessRequests.js'
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
// This screen deliberately shows NO club data, because it has none to show:
// every SELECT policy in the database bottoms out in a memberships row for
// auth.uid(), so this user reads zero rows from every table including teams.
// That is also why the note below is free text rather than a squad picker —
// there is nothing to populate a dropdown with.

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

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
      const created = await createAccessRequest({ profileId: userId, note })
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
            className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
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

        <label
          htmlFor="request-note"
          className="mb-1.5 mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint"
        >
          Who are you at the club? <span className="font-semibold normal-case">(optional)</span>
        </label>
        <textarea
          id="request-note"
          name="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Parent of Sam Muir, U10"
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
