import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import PhoneInput from './PhoneInput.jsx'
import { confirmMyDetails, confirmNoPlayer, getMyProfile } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { joinPhone, splitPhone } from '../lib/phone.js'
import { primeMyProfileCache } from '../lib/useMyProfile.js'

// The sign-in gate: who you are, how to reach you, and whether you have a
// player at the club — asked once each, before the app is usable.
//
// ⚠️ THE FILE IS STILL CALLED NamePrompt AND THAT IS NOW NARROWER THAN WHAT IT
// DOES (16 Aug 2026). It gates three things. The name is deliberately kept
// because a dozen comments across src/ refer to this component by it and a
// rename that leaves those stale trades one inaccuracy for twelve; the rename
// is a sweep worth doing on its own, not as a side effect of adding a field.
//
// ⚠️ WHY PHONE WAS ADDED. Jay, 16 Aug 2026: "we need to have a pop up that
// forces people to fill out their full name and phone number later on when they
// login again, if they haven't fill that out". Measured before building it:
// 14 of 27 profiles had no phone number at all, against 1 with no name — so the
// name half of that request was already working and the phone half was the real
// gap.
//
// ⚠️ AND WHY THE PLAYER STEP EXISTS. "also force them to add a player or
// confirm again 1 time they don't have a player". The "1 time" is load-bearing:
// `profiles.no_player_confirmed_at` records the answer so a coach with no
// children at the club is not asked at every sign-in forever.
//
// ⚠️ A PLAYER-ONLY ACCOUNT IS ASKED NEITHER. It is not asked for a phone,
// because this app already refuses to let an under-13 hold their own contact
// details (allowsOwnContact, and the club's own rule behind it), and a gate that
// demands one from a child is the app arguing with its own safeguarding. And it
// is not asked to add a player, because it IS the player.
//
// ⚠️ THIS USED TO BE A SKIPPABLE PROMPT AND IS NOW A HARD GATE (6 Aug 2026,
// claude/decisions/2026-08-06-roster-auto-onboarding.md). The old header
// promised "it never blocks the app"; that promise is deliberately broken and
// the reasons are worth keeping:
//
//   1. Roster onboarding brings ~279 parents in at once with nobody vetting
//      them one at a time. A skippable prompt gets skipped, and a club of
//      "Unnamed member" rows cannot be administered at all.
//   2. A name is now load-bearing for coaches, not decoration.
//
// WHY EVERYONE SEES IT, NOT JUST THE UNNAMED — this is the part that is easy
// to get wrong. private.handle_new_user() seeds full_name from Google's
// metadata, and private.sync_profile_name() splits it, so a Google sign-up
// arrives with first_name and last_name ALREADY POPULATED. Gating on "is the
// name empty" would therefore skip every Google user — about half the club.
//
// And those are exactly the names most likely to be wrong. Google supplied
// "Jason Muir" for an account whose owner is known at this club as "Jay Muir".
// The name was present, populated, and not what anyone would search for. So
// the gate opens on `name_confirmed_at is null` — has this person told US
// their name — and prefills whatever we already think it is, making it a
// two-second confirmation for the people who have nothing to correct.
//
// Rules that still hold from the original:
//   - A failed profile READ does not open the gate. If we cannot tell whether
//     the name is confirmed, locking someone out of the app on a network blip
//     is far worse than asking again next load.
//   - Nothing about this lives in localStorage. The old version suppressed
//     itself with a per-device key, which a hard gate cannot use: it would be
//     escapable by opening the app on a phone, and would re-nag someone who
//     had already answered on their laptop. `profiles.name_confirmed_at` is
//     the state, and it is per-person, not per-device.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

export default function NamePrompt() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { memberships, loading: membershipsLoading } = useMemberships()
  const userId = user?.id ?? null

  const [profileId, setProfileId] = useState(null)
  // 'details' | 'player' | null. Null is the closed gate.
  const [step, setStep] = useState(null)
  const [needPhone, setNeedPhone] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneCountry, setPhoneCountry] = useState(() => splitPhone('').country)
  const [phoneNational, setPhoneNational] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // ⚠️ ONCE SATISFIED, IT STAYS SHUT FOR THE SESSION. The effect below re-runs
  // whenever memberships change — approving somebody, or a realtime refresh —
  // and without this it would re-read a profile row it had just written and
  // could reopen the gate over the top of whatever the person went on to do.
  const settled = useRef(false)

  // ⚠️ READ OFF THE MEMBERSHIPS, NOT OFF A COUNT OF PLAYERS. A parent's link to
  // a child IS a membership row carrying player_id — that is what
  // self-registration creates — so this is the same fact the rest of the app
  // uses rather than a second query that could disagree with it.
  const hasPlayer = (memberships ?? []).some((m) => m.player_id)
  // ⚠️ `every`, AND AN EMPTY LIST IS NOT PLAYER-ONLY. Somebody with no
  // memberships at all is a stranger waiting for access, and `[].every()` is
  // true — which would silently exempt exactly the people the club knows least
  // about from every question on this gate.
  const playerOnly =
    (memberships ?? []).length > 0 && (memberships ?? []).every((m) => m.role === 'player')

  useEffect(() => {
    if (!userId || settled.current) return undefined
    // ⚠️ WAIT FOR THE MEMBERSHIPS. They arrive asynchronously, and both
    // `playerOnly` and `hasPlayer` are false while they are still loading — so
    // running now would ask a player-only account for a phone number, and would
    // ask a parent to add the child they already have.
    if (membershipsLoading) return undefined

    let active = true
    getMyProfile(userId)
      .then((profile) => {
        if (!active || !profile) return
        // ⚠️ THE NAME CONDITION IS STILL `name_confirmed_at`, NOT "is the name
        // blank" — see the header. The phone condition IS emptiness, because
        // nothing ever populates a phone on our behalf the way Google populates
        // a name, so there is no wrong-but-present case to guard against.
        const nameNeeded = !profile.name_confirmed_at
        const phoneNeeded =
          !playerOnly && !String(profile.phone ?? '').trim()
        const playerNeeded = !playerOnly && !hasPlayer && !profile.no_player_confirmed_at

        if (!nameNeeded && !phoneNeeded && !playerNeeded) return

        setProfileId(profile.id)
        // Prefill with whatever we already hold, so a Google user confirms
        // rather than retypes. Blank for a magic-link user, who types both.
        setFirstName(String(profile.first_name ?? ''))
        setLastName(String(profile.last_name ?? ''))
        const split = splitPhone(profile.phone ?? '')
        setPhoneCountry(split.country)
        setPhoneNational(split.national)
        setNeedPhone(phoneNeeded)

        // ⚠️ DETAILS FIRST, ALWAYS, EVEN WHEN ONLY THE PLAYER STEP IS DUE. The
        // details sheet is skipped outright in that case (below); ordering it
        // first keeps "who are you" ahead of "what do you have", which is the
        // order the answers make sense in.
        setStep(nameNeeded || phoneNeeded ? 'details' : 'player')
      })
      .catch(() => {
        // Deliberately silent, and deliberately leaves the gate CLOSED.
      })

    return () => {
      active = false
    }
  }, [userId, membershipsLoading, hasPlayer, playerOnly])

  function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    const first = firstName.trim()
    if (!first) {
      setError(new Error('Enter your first name.'))
      return
    }

    const phone = needPhone ? joinPhone(phoneCountry, phoneNational) : ''
    // ⚠️ REQUIRED ONLY WHERE IT WAS ASKED FOR. `needPhone` is false for a
    // player-only account and for anybody who already has one on file, and
    // demanding a value in either case would be the gate refusing to close over
    // a question it never put.
    if (needPhone && !phone) {
      setError(new Error('Enter a phone number so the club can reach you.'))
      return
    }

    setSaving(true)
    setError(null)
    // Family name is intentionally NOT required. Plenty of people have one
    // name, and a gate nobody can pass is worse than a sortable list.
    // ⚠️ `phone` IS OMITTED, NOT SENT EMPTY, WHEN IT WAS NOT ASKED FOR. The
    // data layer ignores a blank either way; the difference is at this call
    // site, where a key that is always present reads as "we collected this and
    // it was empty" rather than "we never put the question".
    confirmMyDetails({
      profileId,
      firstName: first,
      lastName: lastName.trim(),
      ...(needPhone ? { phone } : {}),
    })
      .then((updated) => {
        // ⚠️ useMyProfile's cache is module-level and never invalidates itself,
        // and right now it holds the row as it was BEFORE this save. Its own
        // header reasons that a name is "confirmed once at first sign-in and
        // effectively never edited after" — true, and it is precisely why this
        // line is needed rather than why it is not: first sign-in is when the
        // cached row has no name in it. Without this, the masthead account
        // button and the dashboard greeting stay nameless for the rest of the
        // session, having just asked this person to type their name.
        // src/screens/More.jsx does the same after its own save.
        primeMyProfileCache(profileId, updated)

        // ⚠️ STRAIGHT ON TO THE PLAYER QUESTION RATHER THAN CLOSING. Two sheets
        // one after another is the whole gate; closing here and reopening on the
        // next render would flash the app in between and read as a glitch.
        if (!playerOnly && !hasPlayer && !updated.no_player_confirmed_at) {
          setStep('player')
          return
        }
        settled.current = true
        setStep(null)
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  function handleNoPlayer() {
    if (saving) return
    setSaving(true)
    setError(null)
    confirmNoPlayer({ profileId })
      .then(() => {
        settled.current = true
        setStep(null)
      })
      .catch((err) => setError(err))
      .finally(() => setSaving(false))
  }

  // ⚠️ IT SENDS THEM TO /more, WHERE THE ADD CONTROL ACTUALLY IS. There is no
  // /register route — `YourPlayers` on More owns adding a player, and the
  // Dashboard's Register sheet is opened by its own state. Re-hosting that form
  // inside a sheet nobody can dismiss would be a second copy of the hardest form
  // in the app.
  //
  // ⚠️ AND IT DOES NOT MARK ANYTHING CONFIRMED. Somebody who taps this and then
  // abandons the form still has no player, so the gate is right to ask again
  // next sign-in. Only the explicit "I don't have one" is an answer, which is
  // why this sets `settled` for the SESSION but writes nothing.
  function handleAddPlayer() {
    settled.current = true
    setStep(null)
    navigate('/more')
  }

  if (!step) return null

  if (step === 'player') {
    return (
      <Sheet open dismissible={false} onClose={() => {}} title="Do you have a player at the club?">
        <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
          Linking your child means you see their fixtures, their squad and their availability.
          If you&rsquo;re here as a coach, manager or volunteer without a child at the club,
          say so and we won&rsquo;t ask again.
        </p>

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {error.message || "We couldn't save that. Try again."}
          </p>
        )}

        <Button size="lg" full disabled={saving} onClick={handleAddPlayer}>
          Add my player
        </Button>
        {/* ⚠️ SECONDARY, NOT EQUAL. Adding a player is the answer for most
            people who see this, and the club would rather a parent linked a
            child than took the quicker way out of a sheet. */}
        <Button
          variant="secondary"
          size="lg"
          full
          className="mt-2.5"
          disabled={saving}
          onClick={handleNoPlayer}
          data-testid="no-player"
        >
          {saving ? 'Saving…' : "I don't have a player at the club"}
        </Button>
      </Sheet>
    )
  }

  return (
    // No onClose: dismissible={false} removes the X, Escape and the backdrop
    // click, so nothing can call it. Passing a no-op rather than omitting it
    // keeps Sheet's internals from having to handle undefined.
    <Sheet open dismissible={false} onClose={() => {}} title={needPhone ? 'A couple of details' : 'What should we call you?'}>
      <form onSubmit={handleSubmit} noValidate>
        <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
          Coaches and admins see this name on team sheets and squad lists, so
          it&apos;s worth it being the one people know you by.
        </p>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="name-prompt-first-name">
            First name
          </label>
          <input
            id="name-prompt-first-name"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(domEvent) => {
              setFirstName(domEvent.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? 'true' : undefined}
            placeholder="e.g. Jay"
            className={INPUT}
          />
        </div>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="name-prompt-last-name">
            Family name <span className="font-semibold normal-case">(optional)</span>
          </label>
          <input
            id="name-prompt-last-name"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(domEvent) => setLastName(domEvent.target.value)}
            placeholder="e.g. Muir"
            className={INPUT}
          />
        </div>

        {/* ⚠️ ONLY WHEN IT IS ACTUALLY MISSING. Somebody who already gave a
            number is not made to re-enter it to get past a gate they are only
            meeting for the name — and a player-only account is never asked at
            all. */}
        {needPhone && (
          <div className="mb-3.5">
            <label className={LABEL} htmlFor="name-prompt-phone">
              Phone number
            </label>
            <PhoneInput
              id="name-prompt-phone"
              country={phoneCountry}
              national={phoneNational}
              onCountryChange={setPhoneCountry}
              onNationalChange={(value) => {
                setPhoneNational(value)
                if (error) setError(null)
              }}
              disabled={saving}
            />
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              So a coach can reach you about a fixture. Only coaches, managers and admins of
              your squads can see it.
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
          >
            {error.message || "We couldn't save that name. Try again."}
          </p>
        )}

        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </Sheet>
  )
}
