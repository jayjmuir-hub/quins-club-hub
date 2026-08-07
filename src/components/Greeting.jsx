import useMyProfile from '../lib/useMyProfile.js'

// "Good morning, Jay" at the top of the home screen.
//
// Time-based rather than rotating, chosen deliberately over a random set of
// friendly lines: this is a screen people open daily to check a pickup time,
// and randomised warmth wears thin fast. A clock-driven greeting changes for a
// reason, never repeats oddly, and is deterministic — which also means it can
// be tested without seeding a random number generator.
//
// ⚠️ THE NAME IS OFTEN MISSING, AND THAT IS NORMAL. A Google sign-in fills a
// name, a magic-link sign-in does not until NamePrompt is answered — and
// NamePrompt is skippable. So this must read correctly with no name at all,
// which is why the comma and the name are one unit that drops together
// ("Good morning." not "Good morning, ."). Roughly half the club signs in with
// a magic link, so the nameless case is not an edge case.
//
// Uses the DEVICE clock, not Abu Dhabi time. If a parent is travelling, their
// own morning is the one that matters — the club's timezone is only correct
// for fixture times, which are handled separately and explicitly labelled.

export function greetingFor(hour) {
  // Boundaries: 05:00-11:59 morning, 12:00-17:59 afternoon, else evening.
  // "Good night" is deliberately absent — it reads as a farewell, which is
  // wrong on a screen someone has just opened.
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Greeting({ now = undefined }) {
  const { firstName } = useMyProfile()
  // `now` is injectable so tests can pin the hour without faking global time.
  const date = now ? new Date(now) : new Date()
  const greeting = greetingFor(date.getHours())

  return (
    <p
      data-testid="greeting"
      className="mb-3 text-[15px] font-semibold text-ink-muted desktop:text-base"
    >
      {greeting}
      {firstName ? <span className="text-ink">, {firstName}</span> : ''}
    </p>
  )
}
