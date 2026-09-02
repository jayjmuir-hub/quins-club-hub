import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import DatePicker from './DatePicker.jsx'
import PhoneInput from './PhoneInput.jsx'
import {
  confirmMyDetails,
  confirmNoPlayer,
  confirmNoRole,
  getMyProfile,
  requestStaffRole,
} from '../data/members.js'
import { isPushSupported, isSubscribed } from '../lib/push.js'
// ⚠️ setPlayerDob ALREADY EXISTS AND player_private's RLS ALREADY LETS A CHILD'S
// OWN FAMILY WRITE IT (20260816_player_private_dob.sql), so the birthday step
// below needs NO migration and NO new write path. If one ever appears here,
// something has been misunderstood.
import { listPlayerPrivate, listPlayers, updatePlayerDob } from '../data/players.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { joinPhone, splitPhone } from '../lib/phone.js'
import { primeMyProfileCache } from '../lib/useMyProfile.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The sign-in gate: who you are, how to reach you, whether you have a player at
// the club, and whether you do a job here — asked once each, before the app is
// usable.
//
// ⚠️ THE FILE IS STILL CALLED NamePrompt AND THAT IS NOW NARROWER THAN WHAT IT
// DOES (16 Aug 2026). It gates four things. The name is deliberately kept
// because a dozen comments across src/ refer to this component by it and a
// rename that leaves those stale trades one inaccuracy for twelve; the rename
// is a sweep worth doing on its own, not as a side effect of adding a field.
//
// ⚠️ THE FOURTH STEP IS THE MIRROR OF THE THIRD, AND THE ASYMMETRY IT CLOSES IS
// WHY IT EXISTS. Sign-up forks two ways in AppShell — "Add your player", or
// "I'm not adding a player" — and whichever door somebody takes, the other half
// of who they are is never asked for again. The player step (added earlier the
// same day) covers the staff door. Nothing covered the parent door, so a coach
// who registered his son was filed as a parent and stayed one. Jay, 16 Aug 2026,
// having found a real one: "he got through without asking to be designated a
// coach".
//
// ⚠️ AND THE SIGN-UP SCREEN COULD NOT HAVE FIXED IT. AppShell mounts
// AddYourPlayer only while `memberships.length === 0`, so once a first child is
// registered the question can never be put there again — which also means every
// coach already miscategorised today is unreachable from there. They all meet
// this gate.
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

// Birthday cap for the DatePicker; the database is the real guard.
const TODAY = new Date().toISOString().slice(0, 10)
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand'

export default function NamePrompt() {
  const navigate = useNavigate()
  // `signOut` is for the birthday sheet's escape hatch — see its comment.
  const { user, signOut } = useAuth()
  const { realMemberships, teams, loading: membershipsLoading } = useMemberships()
  const userId = user?.id ?? null

  const [profileId, setProfileId] = useState(null)
  // 'details' | 'player' | 'birthday' | 'role' | 'notifications' | null.
  // Null is the closed gate.
  const [step, setStep] = useState(null)
  // ⚠️ WHETHER THE NOTIFICATIONS OFFER IS DUE, DECIDED ASYNCHRONOUSLY AND EARLY
  // SO THAT `finish()` CAN BE SYNCHRONOUS. Asking the Push API at the moment
  // the gate closes would mean an await between "answered the last question"
  // and "the sheet went away", which is the one place in this component where a
  // hang is not survivable.
  //
  // ⚠️ **IT DEFAULTS TO false AND EVERY FAILURE PATH LEAVES IT false.** This
  // sheet is `dismissible={false}` — the whole gate is a modal nobody can close
  // — so the dangerous direction is showing a step we did not mean to show.
  // Missing the offer costs one person one prompt; showing a broken one costs
  // the club the app. **If in doubt, close the gate.**
  const [offerNotifications, setOfferNotifications] = useState(false)
  const [needPhone, setNeedPhone] = useState(false)
  // ⚠️ THE ONLY STEP ON THIS GATE WITH NO WAY PAST IT — Jay, 17 Aug 2026, over a
  // snooze or a recorded "I'd rather not". A birthday is already mandatory for
  // every new registration, so this makes the families who signed up before
  // 16 Aug match; the other steps take an answer of "no", and this one has no
  // such answer to take.
  //
  // ⚠️ WHICH IS WHY THE SHEET CARRIES A SIGN-OUT. Every other step is passable,
  // so the person always has an exit; this one is not, and AppShell's rule
  // ("someone who cannot get in must always be able to get out") would otherwise
  // be broken by the one sheet in the app that cannot be answered "no".
  const [needBirthday, setNeedBirthday] = useState(false)
  // [{ id, name }] — this account's OWN children with no birthday on file.
  const [dobChildren, setDobChildren] = useState([])
  // player id -> the yyyy-mm-dd string being typed.
  const [dobDrafts, setDobDrafts] = useState({})
  // ⚠️ WHETHER THE ROLE STEP IS STILL DUE, HELD SEPARATELY FROM `step`. The
  // details and player steps both have to decide what comes next, and asking
  // "was the role question needed?" at that moment means re-reading a profile
  // row we already have. Captured once when the gate opens instead.
  const [needRole, setNeedRole] = useState(false)
  // null until they say they do a job here; then the two selects appear.
  const [claimingRole, setClaimingRole] = useState(false)
  const [staffRole, setStaffRole] = useState('')
  const [staffTeamId, setStaffTeamId] = useState('')
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

  // ⚠️ `realMemberships`, NEVER THE EFFECTIVE SET, AND THIS SHIPPED WRONG.
  // Jay, 16 Aug 2026, with two sons already linked: "this has popped up twice in
  // my own account… actually, it is specific to when i change viewing as".
  //
  // A "view as" preview replaces the effective memberships with ONE SYNTHETIC
  // ROW, and that row hardcodes `player_id: null` (see syntheticMemberships in
  // src/lib/memberships.jsx). So an admin previewing any role looked, to this
  // gate, like somebody with no children at the club — and got asked, every
  // time they switched.
  //
  // The rule is the one src/lib/memberships.jsx already states for the switcher
  // and the banner: gate on `realMemberships`. Whether you have a child at the
  // club is a FACT ABOUT YOU, not about the role you are pretending to be, and a
  // preview is cosmetic. The same applies to `playerOnly` below — previewing as
  // a player would otherwise exempt an admin from the phone question.
  //
  // ⚠️ A parent's link to a child IS a membership row carrying player_id — what
  // self-registration creates — so this is the same fact the rest of the app
  // uses rather than a second query that could disagree with it.
  const hasPlayer = (realMemberships ?? []).some((m) => m.player_id)
  // ⚠️ `every`, AND AN EMPTY LIST IS NOT PLAYER-ONLY. Somebody with no
  // memberships at all is a stranger waiting for access, and `[].every()` is
  // true — which would silently exempt exactly the people the club knows least
  // about from every question on this gate.
  const playerOnly =
    (realMemberships ?? []).length > 0 &&
    (realMemberships ?? []).every((m) => m.role === 'player')
  // ⚠️ 'admin' IS IN THIS LIST AND THE OTHER THREE ARE THE REQUESTABLE ONES.
  // A club admin plainly does a job here, and asking them would be the app
  // interrogating somebody about a fact it is holding. 'admin' is deliberately
  // NOT requestable (see request_staff_role and REQUESTABLE_ROLES) — it is only
  // ever granted by an existing admin — but it absolutely counts as an answer.
  //
  // ⚠️ ANY STATUS COUNTS, PENDING INCLUDED. Somebody who asked yesterday and is
  // still waiting has already told us; asking again tomorrow would read as the
  // app having lost their answer, and a second identical request is refused by
  // memberships_unique_grant anyway.
  const hasStaffRole = (realMemberships ?? []).some((m) =>
    ['coach', 'manager', 'medic', 'admin'].includes(m.role),
  )

  // ⚠️ THE CHILDREN THIS ACCOUNT IS ATTACHED TO, NOT THE SQUAD. Same rule
  // YourPlayers states: a coach can see thirty children and none are theirs.
  // `realMemberships` for the same reason as everything above — a "view as"
  // preview hardcodes player_id null and would otherwise exempt a parent.
  const myPlayerIds = [...new Set((realMemberships ?? []).map((m) => m.player_id).filter(Boolean))]
  const myTeamIds = [...new Set((realMemberships ?? []).map((m) => m.team_id).filter(Boolean))]
  const playerKey = myPlayerIds.join(',')

  /**
   * This account's own children with no date of birth on file, newest question
   * first. Empty means the step is not due.
   *
   * ⚠️ IT FAILS OPEN, AND ON A BLOCKING GATE THAT IS THE WHOLE SAFETY ARGUMENT.
   * Every other step here is passable, so a failed read costs a question. This
   * one has no way past, so a failed read that returned "due" would lock the
   * club out of the app with no escape and no fix short of a deploy. A read that
   * throws returns [] — nobody is blocked by an outage.
   *
   * ⚠️ AN ABSENT KEY IS A MISSING BIRTHDAY, AND TODAY IT IS THE ONLY CASE THERE
   * IS. `listPlayerPrivate` returns only rows that exist, and on 17 Aug 2026
   * `player_private` held ZERO rows — so every child is an absent key rather
   * than a null value. `?? null` is what collapses the two, exactly as
   * YourPlayers does it. Reading presence instead (listPlayerPrivatePresence)
   * would be wrong for the opposite reason: a row can exist with a null
   * birthday, and that is still a missing birthday.
   *
   * ⚠️ NAMES ARE FETCHED ONLY WHEN SOMETHING IS ACTUALLY MISSING. listPlayers
   * reads whole squads; doing it before the cheap check would put a squad-wide
   * read on every sign-in forever, to label a sheet almost nobody will see once
   * the backfill is done.
   */
  async function childrenMissingABirthday() {
    if (myPlayerIds.length === 0) return []
    try {
      const rows = await listPlayerPrivate(myPlayerIds)
      const dobById = new Map((rows ?? []).map((row) => [row.player_id, row.date_of_birth ?? null]))
      const missingIds = myPlayerIds.filter((id) => !(dobById.get(id) ?? null))
      if (missingIds.length === 0) return []

      const roster = await listPlayers({ teamIds: myTeamIds })
      const nameById = new Map((roster ?? []).map((player) => [player.id, player.full_name]))
      return missingIds.map((id) => ({ id, name: nameById.get(id) || 'your child' }))
    } catch {
      return []
    }
  }

  useEffect(() => {
    if (!userId || settled.current) return undefined
    // ⚠️ WAIT FOR THE MEMBERSHIPS. They arrive asynchronously, and both
    // `playerOnly` and `hasPlayer` are false while they are still loading — so
    // running now would ask a player-only account for a phone number, and would
    // ask a parent to add the child they already have.
    if (membershipsLoading) return undefined

    let active = true
    getMyProfile(userId)
      .then(async (profile) => {
        if (!active || !profile) return
        // ⚠️ THE NAME CONDITION IS STILL `name_confirmed_at`, NOT "is the name
        // blank" — see the header. The phone condition IS emptiness, because
        // nothing ever populates a phone on our behalf the way Google populates
        // a name, so there is no wrong-but-present case to guard against.
        const nameNeeded = !profile.name_confirmed_at
        const phoneNeeded =
          !playerOnly && !String(profile.phone ?? '').trim()
        const playerNeeded = !playerOnly && !hasPlayer && !profile.no_player_confirmed_at
        // ⚠️ THE MIRROR OF THE LINE ABOVE, AND IT READS THE SAME WAY. Exempt for
        // a player-only account for the same reason it is exempt from the phone
        // question — it is a child, and a gate that asks a twelve-year-old which
        // squad they coach is the app not knowing who it is talking to.
        const roleNeeded = !playerOnly && !hasStaffRole && !profile.no_role_confirmed_at

        // ⚠️ EXEMPT FOR A PLAYER-ONLY ACCOUNT, like the phone and role questions.
        // That account belongs to a CHILD, and a blocking sheet asking a
        // twelve-year-old to type their own date of birth into a safeguarding
        // field is the app not knowing who it is talking to.
        const missingChildren = playerOnly ? [] : await childrenMissingABirthday()
        const birthdayNeeded = missingChildren.length > 0
        if (!active) return

        if (!nameNeeded && !phoneNeeded && !playerNeeded && !birthdayNeeded && !roleNeeded) return

        setProfileId(profile.id)
        // Prefill with whatever we already hold, so a Google user confirms
        // rather than retypes. Blank for a magic-link user, who types both.
        setFirstName(String(profile.first_name ?? ''))
        setLastName(String(profile.last_name ?? ''))
        const split = splitPhone(profile.phone ?? '')
        setPhoneCountry(split.country)
        setPhoneNational(split.national)
        setNeedPhone(phoneNeeded)
        setNeedRole(roleNeeded)
        setNeedBirthday(birthdayNeeded)
        setDobChildren(missingChildren)

        // ⚠️ DETAILS FIRST, ALWAYS, EVEN WHEN ONLY THE PLAYER STEP IS DUE. The
        // details sheet is skipped outright in that case (below); ordering it
        // first keeps "who are you" ahead of "what do you have", which is the
        // order the answers make sense in.
        // ⚠️ THE THREE-WAY IS AN ORDERED FALL-THROUGH, NOT A CHOICE. Each step
        // is skipped only when it is not due, and the LAST one is reachable on
        // its own — which is the common case for this addition: every existing
        // parent has a name, a phone and a child, and needs only the role
        // question.
        setStep(
          nameNeeded || phoneNeeded
            ? 'details'
            : playerNeeded
              ? 'player'
              : birthdayNeeded
                ? 'birthday'
                : 'role',
        )
      })
      .catch(() => {
        // Deliberately silent, and deliberately leaves the gate CLOSED.
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playerKey is the
    // stable string form of myPlayerIds; the array itself is rebuilt on every
    // render and would restart the effect forever. Same pattern as Accounts.jsx.
  }, [userId, membershipsLoading, hasPlayer, playerOnly, hasStaffRole, playerKey])

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
        // ⚠️ BEFORE THE ROLE QUESTION, BECAUSE THIS ONE IS ABOUT THE CHILD and
        // the role question is about the adult — the same "who are you, then
        // what do you have" ordering the details step is first for. Captured in
        // `needBirthday` when the gate opened, for the reason the comment below
        // gives about needRole: nothing since then can have answered it.
        if (needBirthday) {
          setStep('birthday')
          return
        }
        // ⚠️ `needRole`, NOT `updated.no_role_confirmed_at`. The line above can
        // read the fresh row because confirmMyDetails selects that column; it
        // does not select this one, and adding it would make a name save depend
        // on a column belonging to a different question. The captured value is
        // correct in any case — nothing between the gate opening and here can
        // have answered the role question.
        if (needRole) {
          setStep('role')
          return
        }
        settled.current = true
        finish()
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
        // ⚠️ STRAIGHT ON TO THE ROLE QUESTION, AND THIS IS THE MOST USEFUL
        // MOMENT IT IS EVER ASKED. Somebody who has just said they have no child
        // at the club is, almost by definition, here for a job — a coach, a
        // manager, a volunteer. Closing the gate here would file the person the
        // club knows least about as nothing at all.
        if (needRole) {
          setStep('role')
          return
        }
        settled.current = true
        finish()
      })
      .catch((err) => setError(err))
      .finally(() => setSaving(false))
  }

  /**
   * Saves a birthday for every child the parent filled in.
   *
   * ⚠️ EVERY FIELD IS REQUIRED, because this step has no way past it — a save
   * that accepted a blank would be a skip button wearing a Save label. The
   * refusal names the child rather than saying "fill in all fields", so a parent
   * with three children knows which one they missed.
   *
   * ⚠️ PARTIAL WRITES ARE KEPT, NOT ROLLED BACK. If the second child's save
   * fails, the first child's birthday is already stored and correct — and the
   * gate re-reads on the next sign-in, so it will ask only for what is still
   * missing. Undoing the good write to make the batch atomic would throw away a
   * real answer to make a failure tidier.
   *
   * ⚠️ updatePlayerDob, NOT setPlayerDob, AND THE DIFFERENCE IS A REAL BUG THIS
   * HAD UNTIL IT WAS MEASURED. setPlayerDob writes
   * `plays_up_confirmed_at: playsUp ? now : null`, so calling it here — with the
   * flag at its default — would ERASE a parent's recorded play-up consent.
   * Harmless for a child with no row at all, which is most of them today; not
   * harmless for the case this very step also fires on, a row that exists with a
   * null birthday and an agreement already on file. Proved against production in
   * a rolled-back transaction: the old call erased it, this one keeps it.
   * That column records A PARENT TICKING A BOX, and nothing here asks them.
   *
   * ⚠️ AND IT DOES NOT CHECK THE AGE GRADE. A birthday may well reveal a child
   * is in the wrong squad, and that is real — but it is the club's problem to
   * work out, not something to ambush a parent with while they are trying to get
   * into the app. /admin/needs-attention and the coach roster are where it
   * surfaces. Jay, 17 Aug 2026.
   */
  function handleSaveBirthdays(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    const missing = dobChildren.find((child) => !String(dobDrafts[child.id] ?? '').trim())
    if (missing) {
      setError(new Error(`Enter a date of birth for ${missing.name}.`))
      return
    }

    setSaving(true)
    setError(null)
    Promise.all(
      dobChildren.map((child) => updatePlayerDob(child.id, String(dobDrafts[child.id]).trim())),
    )
      .then(() => {
        if (needRole) {
          setStep('role')
          return
        }
        settled.current = true
        finish()
      })
      .catch((err) => setError(err))
      .finally(() => setSaving(false))
  }

  // "No, I don't do a job here." Recorded once, exactly like handleNoPlayer —
  // see confirmNoRole's header for why the answer is stored rather than the
  // question being re-asked at every sign-in.
  function handleNoRole() {
    if (saving) return
    setSaving(true)
    setError(null)
    confirmNoRole({ profileId })
      .then(() => {
        settled.current = true
        finish()
      })
      .catch((err) => setError(err))
      .finally(() => setSaving(false))
  }

  /**
   * "Yes — I coach / manage / medic this squad."
   *
   * ⚠️ IT ASKS, IT DOES NOT GRANT. request_staff_role writes a PENDING
   * membership, which attaches this person to the squad's fixtures and to
   * nothing else. The sheet's copy says so, because somebody who taps this and
   * then finds the squad roster empty will otherwise assume the app is broken.
   *
   * ⚠️ NOTHING IS STAMPED ON THE PROFILE HERE. `no_role_confirmed_at` means "I
   * told you I have no job", and this person told us the opposite — the
   * membership row IS the answer, and `hasStaffRole` reads it on the next load
   * whatever its status. Writing both would record two contradictory answers to
   * one question.
   */
  function handleClaimRole(domEvent) {
    domEvent.preventDefault()
    if (saving) return

    if (!staffRole) {
      setError(new Error('Choose whether you coach, manage or medic.'))
      return
    }
    if (!staffTeamId) {
      setError(new Error('Choose which squad.'))
      return
    }

    setSaving(true)
    setError(null)
    requestStaffRole(staffTeamId, staffRole)
      .then(() => {
        settled.current = true
        finish()
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
  // ⚠️ ASKED ONCE, EVER, PER DEVICE. A gate nobody can dismiss must not put the
  // same optional question in front of somebody twice; and a push subscription
  // is per device and per browser, so the laptop and the phone are genuinely
  // separate questions. Written the moment the step is SHOWN rather than
  // answered — somebody who closes the tab on it has still been asked.
  //
  // ⚠️ A FAILURE TO READ IT COUNTS AS "ALREADY ASKED", which is the opposite of
  // NotificationsNudge's default and deliberately so: there, showing again is
  // harmless; here it is a modal on the sign-in path.
  function alreadyOfferedNotifications() {
    try {
      return localStorage.getItem('quins:notify-offered') === '1'
    } catch {
      return true
    }
  }

  useEffect(() => {
    if (alreadyOfferedNotifications() || !isPushSupported()) return undefined
    let cancelled = false
    isSubscribed()
      .then((subscribed) => {
        if (!cancelled) setOfferNotifications(!subscribed)
      })
      .catch(() => {
        // Deliberately silent, and deliberately leaves the flag false. See the
        // state declaration: the gate closing is always the safe outcome.
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Closes the gate — or, once, offers notifications on the way out.
   *
   * ⚠️ **ONE DECISION POINT, REPLACING FIVE.** Every terminal branch used to
   * call `setStep(null)` directly, in five separate places. Threading a new
   * step through all five would have been five chances to leave a modal open
   * that nobody can dismiss. This is the single place that decides, so there is
   * exactly one thing to get right and one thing to test.
   *
   * ⚠️ **`handleAddPlayer` DELIBERATELY DOES NOT CALL THIS.** It navigates to
   * /more to add a player, which is a person part-way through a job — putting
   * an unrelated question in front of them there would interrupt the thing the
   * gate just sent them to do.
   */
  function finish() {
    if (offerNotifications) {
      try {
        localStorage.setItem('quins:notify-offered', '1')
      } catch {
        // Then it may be asked again on this device. Harmless next to the
        // alternative, which is not asking because a write failed.
      }
      setStep('notifications')
      return
    }
    setStep(null)
  }

  function handleAddPlayer() {
    settled.current = true
    setStep(null)
    navigate('/settings')
  }

  if (!step) return null

  // ⚠️ THE ONLY OPTIONAL STEP ON THIS GATE, AND BOTH BUTTONS CLOSE IT. The
  // sheet is `dismissible={false}` like every other step here, so there is no
  // backstop: if neither control called setStep(null) the club would be locked
  // out of the app. That is the single thing tests/name-prompt.test.jsx must
  // never stop asserting.
  //
  // ⚠️ IT DOES NOT ASK THE BROWSER FOR PERMISSION, and must never be changed to.
  // Chrome demotes sites whose permission prompt gets dismissed, permanently and
  // for everybody — see src/components/NotificationsNudge.jsx, which makes the
  // same point at length. This offers the trip to More; the person taps there.
  //
  // ⚠️ AND IT IS LAST ON PURPOSE. Everything above it is something the club
  // needs from the person; this is the one thing the club is offering them.
  if (step === 'notifications') {
    return (
      <Sheet open dismissible={false} onClose={() => {}} title="Want to be told?">
        <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
          We can send a notification to this device when a notice goes up for your squad, or
          when somebody replies to something you&rsquo;ve reported. You choose which, and you
          can turn them off again whenever you like.
        </p>
        <div className="flex flex-col gap-2.5">
          <Button
            onClick={() => {
              setStep(null)
              navigate('/settings')
            }}
          >
            Show me how
          </Button>
          <Button variant="secondary" onClick={() => setStep(null)}>
            Not now
          </Button>
        </div>
      </Sheet>
    )
  }

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
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
          >
            {friendlyMessage(error, "We couldn't save that. Try again.")}
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

  if (step === 'birthday') {
    return (
      <Sheet open dismissible={false} onClose={() => {}} title="We need one more detail">
        <form onSubmit={handleSaveBirthdays} noValidate>
          <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
            {dobChildren.length === 1
              ? 'The club needs a date of birth for every player, so we can put them in the ' +
                'right age group. We started asking for this after you signed up.'
              : 'The club needs a date of birth for every player, so we can put them in the ' +
                'right age groups. We started asking for this after you signed up.'}
          </p>

          {dobChildren.map((child) => (
            <div key={child.id} className="mb-3">
              {/* htmlFor + id, not a wrapping <label>: a <label> around the
                  DatePicker's button would forward a calendar-day click to the
                  trigger. Empty dates are caught by handleSaveBirthdays, so the
                  native `required` is not lost. */}
              <label htmlFor={`dob-${child.id}`} className="mb-1 block text-[13px] font-bold text-ink">
                {child.name}
              </label>
              <DatePicker
                id={`dob-${child.id}`}
                testId={`dob-${child.id}`}
                value={dobDrafts[child.id] ?? ''}
                onChange={(next) => setDobDrafts((prev) => ({ ...prev, [child.id]: next }))}
                min="1900-01-02"
                max={TODAY}
              />
            </div>
          ))}

          {error && (
            <p
              role="alert"
              className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
            >
              {friendlyMessage(error, "We couldn't save that. Try again.")}
            </p>
          )}

          <Button type="submit" size="lg" full disabled={saving}>
            {saving ? 'Saving…' : 'Save and continue'}
          </Button>
        </form>

        {/* ⚠️ THE ONLY WAY OUT OF THIS SHEET, AND IT IS NOT DECORATION. Every
            other step on this gate can be answered "no"; this one cannot, and
            the sheet is dismissible={false}, so without this control a parent
            who cannot answer right now has no route anywhere — not even back to
            the sign-in screen. AppShell states the rule this keeps: "someone who
            cannot get in must always be able to get out."
            ⚠️ Deliberately quiet and deliberately last. It is an escape hatch,
            not an alternative to answering. */}
        <button
          type="button"
          data-testid="birthday-sign-out"
          disabled={saving}
          onClick={() => signOut?.()}
          className="mt-4 block w-full text-center text-[12.5px] font-semibold text-ink-muted underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Sign out instead
        </button>
      </Sheet>
    )
  }

  if (step === 'role') {
    // sort_order then name — the ordering every other age-group list in the app
    // uses (Accounts, InviteForm, AccessBuilder, PlayerRegistrationForm). A
    // coach scanning for their squad should find it where they expect it.
    const sortedTeams = [...(teams ?? [])].sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (orderDiff !== 0) return orderDiff
      return String(a.name).localeCompare(String(b.name))
    })

    return (
      <Sheet open dismissible={false} onClose={() => {}} title="One more thing">
        <form onSubmit={handleClaimRole} noValidate>
          <p className="mb-3.5 text-sm leading-relaxed text-ink-muted">
            {hasPlayer
              ? 'Do you do anything else at the club besides being a parent? Plenty of ' +
                'coaches and managers have children here too, and we only have you down ' +
                'as a parent.'
              : 'What do you do at the club? We only ask this once.'}
          </p>

          {error && (
            <p
              role="alert"
              className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
            >
              {friendlyMessage(error, "We couldn't save that. Try again.")}
            </p>
          )}

          {/* ⚠️ THE SELECTS APPEAR ONLY AFTER THEY SAY YES, and that ordering is
              deliberate. Showing two empty dropdowns to a parent who does no job
              here asks them to work out that the answer is to ignore both and
              press the grey button underneath. */}
          {!claimingRole ? (
            <>
              <Button
                size="lg"
                full
                disabled={saving}
                onClick={() => {
                  setClaimingRole(true)
                  setError(null)
                }}
                data-testid="claim-role"
              >
                Yes — I coach, manage or medic a squad
              </Button>
              {/* ⚠️ SECONDARY, NOT EQUAL — the same weighting as the player step.
                  The club would rather someone told it about a job than took the
                  quicker way out of a sheet. */}
              <Button
                variant="secondary"
                size="lg"
                full
                className="mt-2.5"
                disabled={saving}
                onClick={handleNoRole}
                data-testid="no-role"
              >
                {saving ? 'Saving…' : hasPlayer ? "No, I'm just a parent" : 'No, nothing yet'}
              </Button>
            </>
          ) : (
            <>
              <div className="mb-3.5">
                <label className={LABEL} htmlFor="name-prompt-staff-role">
                  What do you do
                </label>
                <select
                  id="name-prompt-staff-role"
                  value={staffRole}
                  disabled={saving}
                  onChange={(domEvent) => {
                    setStaffRole(domEvent.target.value)
                    if (error) setError(null)
                  }}
                  className={INPUT}
                >
                  {/* No preselected role, for the reason RequestAccess states:
                      a default that is right most of the time means everyone who
                      does not read the control files as the default. */}
                  <option value="">Choose one…</option>
                  <option value="coach">Coach</option>
                  <option value="manager">Team manager</option>
                  <option value="medic">Medic or physio</option>
                </select>
              </div>

              <div className="mb-3.5">
                <label className={LABEL} htmlFor="name-prompt-staff-team">
                  Which squad
                </label>
                <select
                  id="name-prompt-staff-team"
                  value={staffTeamId}
                  disabled={saving || sortedTeams.length === 0}
                  onChange={(domEvent) => {
                    setStaffTeamId(domEvent.target.value)
                    if (error) setError(null)
                  }}
                  className={INPUT}
                >
                  <option value="">
                    {sortedTeams.length === 0 ? 'Loading squads…' : 'Choose one…'}
                  </option>
                  {sortedTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                {/* ⚠️ SAYS WHAT TO DO ABOUT THE LIMIT RATHER THAN HIDING IT —
                    the same wording problem RequestAccess's squad picker has.
                    One row holds one squad, and a coach across two age groups
                    has a real answer to give. */}
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
                  More than one squad? Add the first here — you can ask about the rest
                  once a coach or admin has approved this one.
                </p>
              </div>

              {/* ⚠️ SAID BEFORE THEY PRESS IT, NOT AFTER. Somebody who asks to be
                  a coach and then finds the squad roster empty will assume the
                  app is broken; being told in advance that this waits for
                  approval turns the same screen into the expected outcome. */}
              <p className="mb-3.5 rounded-[11px] bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
                A club admin checks this, so you won&apos;t see the squad&apos;s players
                until they&apos;ve approved you. They&apos;re emailed as soon as you ask.
              </p>

              <Button type="submit" size="lg" full disabled={saving}>
                {saving ? 'Sending…' : 'Send this to the club'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                full
                className="mt-2.5"
                disabled={saving}
                onClick={() => {
                  setClaimingRole(false)
                  setError(null)
                }}
              >
                Back
              </Button>
            </>
          )}
        </form>
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
            className="mb-3.5 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
          >
            {friendlyMessage(error, "We couldn't save that name. Try again.")}
          </p>
        )}

        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </Sheet>
  )
}
