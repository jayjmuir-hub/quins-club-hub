import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import CalendarSubscribe from '../components/CalendarSubscribe.jsx'
import IdeaForm from '../components/IdeaForm.jsx'
import PhoneInput from '../components/PhoneInput.jsx'
import YourPlayers from '../components/YourPlayers.jsx'
import { updateMyProfile } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'
import useMyProfile, { primeMyProfileCache } from '../lib/useMyProfile.js'
import { useMemberships } from '../lib/memberships.jsx'
import { joinPhone, splitPhone } from '../lib/phone.js'
import { canApproveAnything, isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'

// The "More" tab, for EVERYONE (admin-dashboard plan, 2026-08-05).
//
// This file replaces the old src/screens/Admin.jsx, which rendered a
// club-wide admin overview here and a "not authorised" card for everybody
// else — so three of the four roles got a dead tab. The admin content moved
// to /admin (AdminDashboard.jsx); what stays here is the part that is
// genuinely for all roles.
//
// ⚠️ SIGN-OUT IS NOT IN THIS FILE, AND MUST NOT MOVE INTO /admin.
// AppShell.jsx renders SignOutControl when the path is exactly '/more' (see
// its `isMoreRoute`), which is the ONLY sign-out control a parent, player or
// coach can reach. That is why /more survives as a real route rather than
// redirecting into /admin: a redirect would lock every non-admin out of
// signing out. tests/app.test.jsx pins this with a parent actually clicking
// it.
//
// ⚠️ THIS SCREEN USED TO MAKE NO QUERY AT ALL, and that was written here as
// a contract. It no longer holds: as of 6 Aug 2026 it reads the caller's
// profile row (name), and YourPlayers reads the linked players, their
// contact rows and their parent rows. The role and squad list still come
// free from useMemberships().
//
// The rule that survives is the reason behind the old one: do not re-query
// anything the membership provider already loaded.

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

// Matches MyPlayerForm's field styling rather than inventing a second one —
// text-base/16px on the input specifically, because iOS Safari zooms the whole
// page when a focused input is smaller than 16px.
const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'

// A read-only row in the You card, for the facts a person can look at but not
// change. Same shape the whole card used to have.
function ReadOnlyRow({ label, value, testId, className = '' }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-[15px] font-bold text-ink">{label}</span>
      <span data-testid={testId} className="truncate text-[12.5px] font-semibold text-ink-muted">
        {value}
      </span>
    </div>
  )
}

// THE "YOU" CARD — the only place a member can change anything about
// THEMSELVES (Jay, 8 Aug 2026).
//
// ⚠️ WHY IT EXISTS. This card was four read-only rows. That was survivable
// only while every member reached MyPlayerForm through a linked player — and
// a membership granted by hand by an admin has `player_id = null`, so
// YourPlayers renders nothing for that person and there was no editable field
// anywhere in the app for them. A parent reported exactly that.
//
// ⚠️ THE EDITABLE SCOPE IS NAME AND PHONE. NOTHING ELSE. Not because the form
// is polite about it — because `authenticated` holds column privileges on
// public.profiles for exactly full_name, first_name, last_name,
// name_confirmed_at and phone. `email` is NOT in that list, on purpose: RLS
// grants rows, not columns, so the own-row update policy previously let
// somebody rewrite the address an admin reads on the Accounts screen when
// approving a stranger. Role and squads are decided by membership rows, which
// this caller cannot write at all. Adding an input for any of them would
// produce a form that fails on save.
//
// The phone belongs HERE and not on the player record: player_contacts.phone
// is how you reach the CHILD, this is how you reach the person signed in.
function YouCard({ profile, email, role, squads }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  // Phone is stored E.164 and edited as country + national digits, the same
  // split MyPlayerForm, PlayerForm and the parent rows use. splitPhone keeps
  // an unparseable number's digits rather than blanking the box.
  const [phoneCountry, setPhoneCountry] = useState(() => splitPhone('').country)
  const [phoneNational, setPhoneNational] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  // ⚠️ READ-ONLY UNTIL "Edit" IS PRESSED (Jay, 9 Aug 2026): "could get messed
  // up with some errant screen taps even though they would need to hit save".
  //
  // He is right, and the reason is specific to this screen rather than a
  // general preference. /more is opened for the sign-out button, the privacy
  // policy and the calendar link — the reasons people come here are mostly NOT
  // editing. Live inputs at the top of it mean every visit puts three
  // focusable text boxes under a thumb on a phone, holding the person's real
  // name, for a task they are usually not doing.
  const [editing, setEditing] = useState(false)

  // ⚠️ SEED ONCE PER PROFILE, NOT ON EVERY PROFILE OBJECT. useMyProfile
  // resolves asynchronously, so the first render has no row and the fields
  // must fill in when it arrives — but re-seeding on any later change would
  // throw away whatever the person had typed.
  //
  // ⚠️ AND THE FIELDS ARE DISABLED UNTIL IT ARRIVES (`ready`). Without that
  // there is a real, if short, window in which someone lands on /more, starts
  // typing their name into an empty box, and has it overwritten the moment the
  // row comes back — on a slow pitch-side connection that window is not
  // theoretical. A box that is briefly disabled is a straightforward thing to
  // see; text that rewrites itself under your fingers is not.
  const ready = Boolean(profile?.id)
  const seededFor = useRef(null)
  useEffect(() => {
    if (!profile?.id || seededFor.current === profile.id) return
    seededFor.current = profile.id
    setFirstName(profile.first_name ?? '')
    setLastName(profile.last_name ?? '')
    const split = splitPhone(profile.phone ?? '')
    setPhoneCountry(split.country)
    setPhoneNational(split.national)
  }, [profile])

  // ⚠️ COMPARED AGAINST THE SAVED ROW, NOT A SNAPSHOT TAKEN WHEN EDIT WAS
  // PRESSED. Typing a change and then undoing it by hand leaves the person
  // exactly where they started, and offering to save that is offering to write
  // the values that are already there.
  //
  // The phone is compared JOINED, because that is the form it is stored in:
  // comparing the two halves would call a row dirty whenever splitPhone
  // normalised a legacy number differently from the way it was typed.
  const dirty =
    firstName !== (profile?.first_name ?? '') ||
    lastName !== (profile?.last_name ?? '') ||
    joinPhone(phoneCountry, phoneNational) !== (profile?.phone ?? null)

  function cancelEditing() {
    // Put back what is stored, so Cancel means cancel rather than "stop editing
    // and keep whatever half-typed text is on screen".
    setFirstName(profile?.first_name ?? '')
    setLastName(profile?.last_name ?? '')
    const split = splitPhone(profile?.phone ?? '')
    setPhoneCountry(split.country)
    setPhoneNational(split.national)
    setError(null)
    setEditing(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const updated = await updateMyProfile({
        profileId: profile.id,
        firstName,
        lastName,
        // joinPhone returns null for an empty box, which is what clears the
        // column. It never refuses an odd-looking number — PhoneInput warns
        // beside the field instead (see src/lib/phone.js).
        phone: joinPhone(phoneCountry, phoneNational),
      })
      // The masthead initial and the dashboard greeting read this cache, and
      // it is never invalidated by itself (see useMyProfile's header note).
      // Priming it is the documented escape hatch. ⚠️ It does NOT re-render
      // the components already holding the old row — those update on the next
      // mount — so this fixes "my new name is still wrong after I navigate",
      // not "the masthead changed as I hit save".
      primeMyProfileCache(profile.id, updated)
      setSaved(true)
      // Back to read-only. Leaving the fields live after a save would put the
      // person straight back in the state this change exists to avoid.
      setEditing(false)
    } catch (err) {
      setError(err.message || "We couldn't save your details. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-[14px]">
      <form onSubmit={handleSubmit}>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 desktop:flex-row">
          <div className="flex-1">
            <label className={LABEL} htmlFor="your-first-name">
              First name
            </label>
            <input
              id="your-first-name"
              type="text"
              autoComplete="given-name"
              className={FIELD}
              value={firstName}
              disabled={saving || !ready || !editing}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="flex-1">
            {/* "Family name", the wording NamePrompt already uses. A blank one
                is allowed and saved as null — plenty of people have one name. */}
            <label className={LABEL} htmlFor="your-last-name">
              Family name
            </label>
            <input
              id="your-last-name"
              type="text"
              autoComplete="family-name"
              className={FIELD}
              value={lastName}
              disabled={saving || !ready || !editing}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>

        <div className="mt-3">
          <PhoneInput
            id="your-phone"
            country={phoneCountry}
            national={phoneNational}
            onCountryChange={setPhoneCountry}
            onNationalChange={setPhoneNational}
            disabled={saving || !ready || !editing}
          />
        </div>

        <div className="mt-3.5 flex items-center gap-3">
          {!editing && (
            <Button
              variant="secondary"
              disabled={!ready}
              onClick={() => {
                setSaved(false)
                setEditing(true)
              }}
            >
              Edit
            </Button>
          )}

          {/* ⚠️ SAVE APPEARS ONLY ONCE SOMETHING HAS ACTUALLY CHANGED — Jay's
              wording: "save would appear if they make any edits". A Save
              button that is present but does nothing teaches people that
              pressing it is meaningless, which is exactly the habit you do not
              want on the screens where it isn't. */}
          {editing && dirty && (
            <Button type="submit" disabled={saving || !ready}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}

          {editing && !saving && (
            <Button variant="ghost" onClick={cancelEditing}>
              Cancel
            </Button>
          )}

          {saved && !saving && !editing && (
            // role="status", not role="alert": a confirmation is not an
            // interruption, and this is the whole feedback a person gets that
            // the save landed.
            <span role="status" className="text-[13px] font-semibold text-ink-muted">
              Saved
            </span>
          )}
        </div>

        {/* ⚠️ READ-ONLY, AND THEY MUST STAY READ-ONLY. Email is the address
            this account signs in with and an admin approves on; role and
            squads are membership rows the caller cannot write. Rendered as
            text rather than as disabled inputs — a greyed-out box invites
            someone to try. */}
        <div className="mt-4 space-y-2.5 border-t border-line pt-3.5">
          <ReadOnlyRow label="Email" value={email ?? '—'} testId="your-email" />
          <ReadOnlyRow label="Role" value={role} testId="your-role" />
          <div>
            <span className="text-[15px] font-bold text-ink">Squads you can see</span>
            <p data-testid="your-squads" className="mt-1 text-[12.5px] font-semibold text-ink-muted">
              {squads.length === 0 ? 'No squads yet.' : squads.map((team) => team.name).join(' · ')}
            </p>
          </div>
        </div>
      </form>
    </Card>
  )
}

// The member-facing door into Social Media Management. A card rather than a
// bare button so it can carry the one sentence that explains why anyone would
// tap it — "send us a photo" means nothing without "we might post it".
function SendAnIdea() {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-4">
      <p className="text-sm leading-relaxed text-ink">
        Seen something worth posting? Send the club a photo or an idea and the social
        media manager will take a look.
      </p>
      <Button className="mt-3" onClick={() => setOpen(true)} data-testid="send-idea">
        Send a post idea
      </Button>
      <IdeaForm open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

export default function More() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const admin = isAdmin(memberships)
  const squads = visibleTeams(memberships, teams)

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">More</h2>
      </div>

      {/* Added 6 Aug 2026 (Jay): the More screen showed a role, a squad list
          and two links, so "what does the club actually hold about me?" had
          no answer anywhere in the app. Name and email come from the profile
          row and the session — both already loaded, no extra round trip.

          ⚠️ EDITABLE SINCE 8 AUG 2026, and the four read-only rows are now
          two. See YouCard above for why, and for the exact reason email is
          not one of them. */}
      <SectionTitle>You</SectionTitle>
      <YouCard
        profile={profile}
        email={user?.email}
        role={roleLabel(memberships)}
        squads={squads}
      />

      {/* Renders nothing at all for a coach or admin with no child at the
          club — an empty "Your players" card would imply something missing. */}
      <YourPlayers memberships={memberships} teams={teams} />

      {/* ⚠️ EVERY MEMBER SEES THIS, and that is the ruling rather than an
          oversight (Jay, 12 Aug 2026): a parent with a good photo of Saturday's
          match is exactly who the social media manager needs to hear from. It
          lives on More because More is the one screen every role reaches on a
          phone — the same reason the approvals entry below is here.
          claude/decisions/2026-08-12-social-media-management.md */}
      <SectionTitle>Social media</SectionTitle>
      <SendAnIdea />

      {/* ⚠️ THE COACH'S AND TEAM MANAGER'S ONLY WAY IN (Jay, 9 Aug 2026).
          The Admin pill in the tab bar is admin-only AND desktop-only, so
          without this a coach has no route to the approvals queue from a
          phone — which is exactly where they will be when a parent registers.

          Not shown to admins: they already have the Admin pill, and a second
          entry point to a screen they can reach from the nav is clutter. The
          screen itself gates independently, so this only decides who is
          OFFERED it. */}
      {!admin && canApproveAnything(memberships) && (
        <>
          <SectionTitle>Manage</SectionTitle>
          <Card className="p-[14px]">
            <Link
              to="/approvals"
              className="flex items-center justify-between gap-3 text-[14px] font-bold text-brand"
            >
              <span>Players waiting to be approved</span>
              <span aria-hidden="true">›</span>
            </Link>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
              Parents who have registered a player in your age groups, waiting for you
              to let them in.
            </p>
          </Card>
        </>
      )}

      {/* The .ics feed already existed but lived only on Schedule. This is
          where someone comes looking for "my stuff", so it belongs here too;
          the component is shared, not copied. */}
      <SectionTitle>Your calendar</SectionTitle>
      <Card className="p-[14px]">
        <CalendarSubscribe />
      </Card>

      {/* Admins only, and desktop only. /admin is a wide, table-heavy screen
          (the plan calls it desktop-only, like /accounts was), so the whole
          block is hidden below the 820px breakpoint rather than just the
          link — a lone "Manage" heading over an empty card is worse than no
          heading at all. CSS-only (`hidden desktop:block`), not
          useMediaQuery: that hook exists for the case where both branches
          would emit the SAME content into the DOM (see its header comment),
          which is not the case here. */}
      {admin && (
        <div className="hidden desktop:block">
          <SectionTitle>Manage</SectionTitle>
          <Card className="p-[14px]">
            <Button as={Link} variant="secondary" full to="/admin">
              Admin
            </Button>
          </Card>
        </div>
      )}

      {/* Account — the IN-APP half of Google Play's account deletion
          requirement (the other half is the public /delete-account URL, which
          is the same screen). Deliberately a link out to that page rather
          than a delete button here: one implementation of a destructive
          action, not two that can drift apart.

          Not styled as a danger button. This sits directly above sign-out,
          and a red "Delete" next to "Sign out" is a mis-tap waiting to
          happen on a phone — the confirmation lives on the page itself. */}
      <SectionTitle>Account</SectionTitle>
      <Card className="overflow-hidden">
        <Link
          to="/privacy"
          className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[11px] transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="text-[15px] font-bold text-ink">Privacy policy</span>
          <span aria-hidden="true" className="text-[15px] text-ink-faint">
            ›
          </span>
        </Link>
        <Link
          to="/delete-account"
          className="flex items-center justify-between gap-3 px-[14px] py-[11px] transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="text-[15px] font-bold text-ink">Delete your account</span>
          <span aria-hidden="true" className="text-[15px] text-ink-faint">
            ›
          </span>
        </Link>
      </Card>

      {/* Sign out is rendered by AppShell below this, on this route only.
          See the header comment — do not add a second one here. */}
    </section>
  )
}
