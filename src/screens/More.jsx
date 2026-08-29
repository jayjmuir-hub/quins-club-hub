import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import PostNoticeAction from '../components/PostNoticeAction.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import CalendarSubscribe from '../components/CalendarSubscribe.jsx'
import IdeaForm from '../components/IdeaForm.jsx'
import MyPhotoField from '../components/MyPhotoField.jsx'
import PhoneInput from '../components/PhoneInput.jsx'
import PushNotificationsToggle from '../components/PushNotificationsToggle.jsx'
import YourPlayers from '../components/YourPlayers.jsx'
import IdentityBadges from '../components/IdentityBadges.jsx'
import { updateMyProfile } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'
import useMyProfile, { primeMyProfileCache } from '../lib/useMyProfile.js'
import { useMemberships } from '../lib/memberships.jsx'
import { joinPhone, splitPhone } from '../lib/phone.js'
import { roleLabel, visibleTeams } from '../lib/scope.js'

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
      {/* Your own hats, officer titles first — Jay, 26 Aug 2026: "those
          people should see their own titles too". Same shared strip as the
          DM header and the person card; renders nothing for most members. */}
      <IdentityBadges profileId={profile?.id} className="mb-3" />
      <form onSubmit={handleSubmit}>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink"
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
  // `reload` is passed to YourPlayers so that a child added there lands in the
  // provider — the new membership is created server-side and nothing pushes it
  // here. Kept as a prop rather than a second useMemberships() call inside that
  // component, so it stays a pure props component and its tests stay free of
  // the provider.
  const { memberships, teams, reload } = useMemberships()
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const squads = visibleTeams(memberships, teams)

  // #notifications lands here from the Home nudge ("Turn them on"), which
  // used to link to bare /more — Jay's phone, 25 Aug 2026: "it takes you to
  // the screen ... but does not scroll down automatically to that section".
  // React Router does not scroll to hashes on its own. The double rAF lets
  // the sections above lay themselves out first; without it the measurement
  // happens against a half-painted page and lands short. Any future section
  // that wants to be linkable gets an id and a scroll-mt the same way.
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (!el) return
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' })),
    )
    return () => cancelAnimationFrame(frame)
  }, [hash])

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">Settings</h2>
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

      {/* ⚠️ ITS OWN CARD, NOT A FIELD INSIDE YouCard, AND THAT IS DELIBERATE.
          YouCard is read-only until "Edit" is pressed (Jay, 9 Aug 2026) because
          /more is mostly opened for other reasons — folding a photo control
          into it would mean either putting the photo behind that Edit gate,
          where nobody would find it, or breaking the gate. A photo is also not
          a text field: it saves on choose rather than on submit, so it has a
          different lifecycle from every other row in that card.
          Phase 4 of claude/plans/2026-08-13-squad-staff-on-home.md. */}
      <div className="mt-3">
        <MyPhotoField profile={profile} userId={user?.id} />
      </div>

      {/* Renders nothing at all for a coach or admin with no child at the
          club — an empty "Your players" card would imply something missing.
          ⚠️ Since 13 Aug 2026 it also holds the ONLY parent-facing route to
          adding a second child, so "renders nothing" is now decided by ROLE
          rather than by whether the list came back empty. */}
      <YourPlayers memberships={memberships} teams={teams} reload={reload} />

      {/* ⚠️ EVERY MEMBER SEES THIS, for the same reason the post-idea card
          below does: More is the one screen every role reaches on a phone. The
          Home card shows PINNED notices only, so without this link an ordinary
          notice is unreachable for anyone who does not happen to have one
          pinned — and the pin is the poster's choice, not the reader's. */}
      <SectionTitle>Notices</SectionTitle>
      <Card className="p-[14px]">
        <Link
          to="/notices"
          className="flex items-center justify-between gap-3 text-[14px] font-bold text-brand-ink"
        >
          <span>Club and squad notices</span>
          <span aria-hidden="true">›</span>
        </Link>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          Everything the club and your squads have posted.
        </p>
        {/* ⚠️ POSTING HAPPENS HERE, NOT BEHIND THE LINK ABOVE — Jay, 16 Aug
            2026. A coach reaching for the noticeboard from a pitch wanted to
            WRITE one, and the route to that was More → Notices → wait → find a
            button. PostNoticeAction renders nothing at all for somebody who may
            not post, so this card is unchanged for a parent. */}
        {/* ⚠️ NOT `full` — Jay, 16 Aug 2026: "in More the post a notice tab
            expands the entire width of the screen". A stretched button reads as
            the card's primary action, and this card's primary action is the LINK
            above it; the button is the secondary thing you can also do here.
            Home is the opposite case and does pass `full`, because there it sits
            in the Quick actions stack where every button is full-width and a
            short one would be the odd one out. Same component, caller decides —
            which is why `full` is a prop and not baked in. */}
        <PostNoticeAction className="mt-3" variant="secondary" />
      </Card>

      {/* ⚠️ EVERY MEMBER SEES THIS, and that is the ruling rather than an
          oversight (Jay, 12 Aug 2026): a parent with a good photo of Saturday's
          match is exactly who the social media manager needs to hear from. It
          lives on More because More is the one screen every role reaches on a
          phone — the same reason the approvals entry below is here.
          claude/decisions/2026-08-12-social-media-management.md */}
      <SectionTitle>Social media</SectionTitle>
      <SendAnIdea />

      {/* ⚠️ THE "Manage" CARDS MOVED TO THE ACCOUNT MENU on 29 Aug 2026, with
          the More tab (Jay). A coach/manager's Approvals link and an admin's
          Admin door are rows in AccountMenu.jsx now, gated by the same
          canApproveAnything / isAdmin. Do not re-add a door here — the whole
          point of the move was to stop More being the grab-bag with three
          entry points to everything. */}

      {/* The Game time entry that lived here 14-22 Aug 2026 moved to the
          Squad Hub's front doors: its audience is exactly the hub's (people
          who pick teams), the hub is on the phone's tab bar now, and the
          desktop sidebar carries it under Roster — so the More card had
          become the third entry point, not the only one. */}

      {/* The .ics feed already existed but lived only on Schedule. This is
          where someone comes looking for "my stuff", so it belongs here too;
          the component is shared, not copied. */}
      {/* `id`/`scroll-mt` so the account menu's "Add to your calendar" row can
          land here, the same hash-scroll the Notifications section uses. */}
      <div id="your-calendar" className="scroll-mt-24">
        <SectionTitle>Your calendar</SectionTitle>
        <Card className="p-[14px]">
          <CalendarSubscribe />
        </Card>
      </div>

      {/* ⚠️ FIRST TRIGGER ONLY — a reply to your own report, and nothing
          else yet. Jay asked for push notifications directly, 18 Aug 2026,
          then corrected the first framing: "I don't want more emails, I just
          want app push notifications." Real Push API, not a second email
          under a different name. Every member sees this, same reasoning as
          SendAnIdea above: More is the one screen every role reaches on a
          phone.
          claude/plans/2026-08-18-push-notifications.md. */}
      {/* `scroll-mt` keeps the title clear of the sticky masthead when the
          #notifications hash scroll (above) lands here. */}
      <div id="notifications" className="scroll-mt-24">
        <SectionTitle>Notifications</SectionTitle>
        <Card className="p-4">
          <PushNotificationsToggle />
        </Card>
      </div>

      {/* ⚠️ THE Chat toggle AND the Account links (Privacy policy, Delete your
          account) MOVED TO THE ACCOUNT MENU on 29 Aug 2026. Enter-sends is a
          row there; Privacy and Delete are links to their own routes
          (/privacy, /delete-account), which are unchanged — this page just no
          longer duplicates them. Notifications and Your calendar stay above,
          because a permission flow and a subscribe URL are page-sized; the menu
          links to those two sections by hash. */}

      {/* Sign out is rendered by AppShell below this, on this route only.
          See the header comment — do not add a second one here. */}
    </section>
  )
}
