import Button from './Button.jsx'
import Empty from './Empty.jsx'
import FixtureRow from './FixtureRow.jsx'
import Sheet from './Sheet.jsx'

// The one-day chooser: every event on a tapped day, one row each.
//
// Lived inside Schedule.jsx (Task 23) until the Dashboard's fortnight strip
// turned out to have the exact defect this sheet was built to fix — tapping a
// day with several events opened dayEvents[0] and silently swallowed the rest,
// so a Saturday with three age groups playing showed three dots, opened one
// fixture, and gave you no route to the other two. Now shared by both screens.
//
// On Schedule it is shown for EMPTY days too — "nothing on, add something" is
// the answer to the question the tap asked, and it is the only place in the
// app where the date is already known when the form opens. The Dashboard never
// opens it for an empty or single-event day (empty strip days are not
// tappable, and one event opens directly), and never offers Add — the
// dashboard deliberately has no route to creating events (see Dashboard.jsx's
// formState note).
export default function DaySheet({ day, events, teamsById, canManage, onClose, onSelectEvent, onAddEvent }) {
  // A UTC-anchored throwaway Date used purely to ask "what does this calendar
  // date look like written out" — never an instant, so it cannot be dragged
  // into the reader's time zone on the way through. Same reasoning as
  // Schedule.jsx's monthAnchor.
  const title = new Date(Date.UTC(day.year, day.month, day.day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <Sheet open onClose={onClose} title={title}>
      {events.length === 0 ? (
        <Empty message="Nothing on this day." />
      ) : (
        <div className="overflow-hidden rounded-[11px] border border-line">
          {events.map((event) => (
            <FixtureRow
              key={event.id}
              event={event}
              teamName={event.team_id == null ? 'Whole club' : teamsById.get(event.team_id)?.name}
              onSelect={onSelectEvent}
            />
          ))}
        </div>
      )}

      {/* ⚠️ This carried `hover:bg-brand-dark` until 10 Aug 2026. There is no
          `brand.dark` in tailwind.config.js — only `DEFAULT`, `deep`, `ink` and
          `onDark` — so Tailwind emitted nothing and this button, alone in the
          app, had NO hover state. It was the single use of that name anywhere
          in src, which is exactly how a typo in a class string survives:
          nothing fails, the button just quietly does less. */}
      {canManage && (
        <Button size="lg" full onClick={onAddEvent} className="mt-3.5">
          Add event
        </Button>
      )}
    </Sheet>
  )
}
