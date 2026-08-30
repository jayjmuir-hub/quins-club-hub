import { forwardRef } from 'react'
import {
  FIELD,
  OVER_FILL,
  SPARE_FILL,
  BRAND,
  INK,
  MUTED,
  LINE,
  WHITE,
  FONT_STACK,
  statusChipColours,
  segLabel,
} from '../lib/pitchShareStyle.js'

// The pitch-layout PICTURE, on-screen form — the day and week cards as the
// "visual representation" Jay asked for (30 Aug 2026).
//
// ⚠️ THIS RENDERS ON SCREEN; THE SHARED PNG IS DRAWN NATIVELY, NOT PHOTOGRAPHED.
// Until 30 Aug 2026 this very element was the html2canvas target too, and that
// exporter mangled the small squad codes into dashes. The Share button now draws
// the picture on a <canvas> instead (src/lib/pitchShareCanvas.js), which renders
// crisp text at any scale. Both renderers read the same numbers (pitchOccupancy)
// and the same palette and label rules (pitchShareStyle), so the on-screen card
// and the sent picture stay in step.
//
// ⚠️ FIXED LIGHT PALETTE, NOT design-system TOKENS — imported from
// pitchShareStyle. This card doubles as the reference for the shared document, so
// it has to look the same on a phone, a desktop, and in a dark-themed browser; a
// token that flips in dark mode would break that. Solid fills only.
//
// ⚠️ COLOUR IS NEVER THE ONLY SIGNAL (design-system §accessibility, the club is
// mostly men and ~8% have a colour-vision deficiency). Every segment is named in
// text inside or beside it, every pitch carries its "full / free / over" status
// in words, and each pitch bar is role="img" with a spoken label.

// ⚠️ A CAPTURE WIDTH, NOT A RESPONSIVE ONE. html2canvas photographs the element
// at its rendered size, so a card squeezed onto a phone would produce a cramped
// PNG. minWidth keeps the picture legible; the SCREEN wraps the card in an
// overflow-x-auto so a phone scrolls it rather than the whole page widening.
function Shell({ title, children, innerRef, minWidth, maxWidth }) {
  return (
    <div
      ref={innerRef}
      style={{
        background: WHITE,
        border: `1px solid ${LINE}`,
        borderRadius: 16,
        padding: '18px 18px 12px',
        color: INK,
        minWidth,
        maxWidth,
        fontFamily: FONT_STACK,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: BRAND, display: 'inline-block' }} />
          CLUB HUB · Pitch Allocation
        </span>
        <span style={{ fontWeight: 800, fontSize: 13, color: INK }}>{title}</span>
      </div>
      {children}
      <div
        style={{
          textAlign: 'center',
          fontSize: 11,
          color: MUTED,
          fontWeight: 600,
          paddingTop: 8,
          marginTop: 8,
          borderTop: `1px solid ${LINE}`,
        }}
      >
        Abu Dhabi Harlequins RFC · generated from Club Hub
      </div>
    </div>
  )
}

/** The reassurance line coaches and managers get with the picture: the pitch
 *  they can see here is already on their session in the app, so it is not a
 *  to-do (Jay, 30 Aug 2026). Part of the shared PNG, so it travels with it. */
function SavedNote() {
  return (
    <div
      style={{
        marginTop: 14,
        background: '#f4f6f8',
        borderRadius: 8,
        borderLeft: `3px solid ${BRAND}`,
        padding: '9px 11px',
        fontSize: 12,
        color: INK,
        fontWeight: 600,
        lineHeight: 1.45,
      }}
    >
      These pitches are already saved to each squad&apos;s training session — coaches and managers
      will see them on the session in Club Hub, so there&apos;s nothing to add.
    </div>
  )
}

/** The status pill — brand for full, green for spare, amber for an overload. */
function StatusChip({ over, spareFraction, text }) {
  const { bg, fg } = statusChipColours({ over, spareFraction })
  return (
    <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: bg, color: fg }}>
      {over ? '⚠ ' : ''}
      {text}
    </span>
  )
}

/** One carved pitch. `compact` is the tight week form: a short squad code, no
 *  status chip, a thinner bar. Full form (the day card) shows the name, the
 *  portion, the chip, and a spare segment when the pitch is not full. */
function PitchBar({ bar, compact = false }) {
  const load = bar.segments.reduce((sum, seg) => sum + seg.fraction, 0)
  const scale = Math.max(load, 1)
  const height = compact ? 30 : 46
  // The compact week labels are 11px and the week card is widened (see
  // PitchWeekCard's Shell) so U12G/U14G still fit a quarter bar. This sizing is
  // now only about on-screen legibility: the SHARED picture is drawn natively on
  // a canvas (src/lib/pitchShareCanvas.js), which stays crisp at any size, so the
  // ~10px html2canvas floor that once forced these choices no longer applies. The
  // sizes match the drawn picture so the on-screen card previews what gets sent.
  const labelStyle = {
    width: '100%',
    textAlign: 'center',
    fontSize: compact ? 11 : 13,
    fontWeight: 800,
    lineHeight: 1.15,
    letterSpacing: 'normal',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ marginBottom: compact ? 8 : 12 }}>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
          <span style={{ fontWeight: 900, fontSize: 14, color: INK }}>{bar.pitch}</span>
          <StatusChip over={bar.over} spareFraction={bar.spareFraction} text={bar.statusText} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 0 }}>
        {compact && (
          <span style={{ width: 24, flex: 'none', fontSize: 11, fontWeight: 900, color: INK }}>{bar.pitch}</span>
        )}
        <div
          role="img"
          aria-label={bar.spoken}
          style={{
            flex: 1,
            display: 'flex',
            height,
            borderRadius: 6,
            overflow: 'hidden',
            border: `1.5px solid ${WHITE}`,
            boxShadow: `0 0 0 1px ${LINE}`,
          }}
        >
          {bar.segments.map((seg, i) => (
            <div
              key={seg.key}
              style={{
                width: `${(seg.fraction / scale) * 100}%`,
                minWidth: 0,
                background: bar.over ? OVER_FILL : FIELD[i % FIELD.length],
                borderRight: `${compact ? 1 : 1.5}px solid ${WHITE}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: WHITE,
                overflow: 'hidden',
                padding: compact ? '0 2px' : '0 6px',
              }}
            >
              <span style={labelStyle}>{segLabel(seg, compact)}</span>
              {!compact && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>{seg.portionShort}</span>
              )}
            </div>
          ))}
          {bar.spareFraction > 1e-9 && (
            <div
              style={{
                width: `${(bar.spareFraction / scale) * 100}%`,
                minWidth: 0,
                background: SPARE_FILL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: MUTED,
                fontSize: compact ? 11 : 11.5,
                fontWeight: 700,
                letterSpacing: 'normal',
                overflow: 'hidden',
                padding: '0 4px',
              }}
            >
              {compact ? 'spare' : 'Spare'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * ONE DAY. `slots` is diagramSlots output — `[{ timeLabel, pitches: [pitchBar…] }]`.
 * A time heading, then each pitch busy at that time carved into its portions.
 */
export const PitchDayCard = forwardRef(function PitchDayCard({ title, slots }, ref) {
  return (
    <Shell title={title} innerRef={ref} minWidth={460} maxWidth={680}>
      {slots.map((slot) => (
        <div key={`${slot.timeMs}-${slot.timeLabel}`} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: BRAND, margin: '2px 0 8px' }}>{slot.timeLabel}</div>
          {slot.pitches.map((bar) => (
            <PitchBar key={bar.pitch} bar={bar} />
          ))}
        </div>
      ))}
      <SavedNote />
    </Shell>
  )
})

/**
 * ONE WEEK. `days` is diagramWeek output zipped with labels — each
 * `{ weekday, dayNum, empty, slots }`. Seven columns; a quiet day shows a dash.
 */
export const PitchWeekCard = forwardRef(function PitchWeekCard({ title, days }, ref) {
  return (
    <Shell title={title} innerRef={ref} minWidth={1540} maxWidth={1680}>
      {/* ⚠️ minmax(0, 1fr), NOT 1fr — a bare `1fr` column's min size is its
          CONTENT, so a long label (a club-wide event's title) grew its own day
          and stole width from the other six, shrinking them until even "U6"
          ellipsised to dots (Jay, 30 Aug 2026). minmax(0, …) caps every column
          at its share; the long label then just clips inside its own column. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
        {days.map((day) => (
          <div
            key={`${day.weekday}-${day.dayNum}`}
            style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 9px', minHeight: 150, opacity: day.empty ? 0.5 : 1 }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                borderBottom: `1px solid ${LINE}`,
                paddingBottom: 5,
                marginBottom: 7,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 900, color: INK, letterSpacing: '.03em' }}>{day.weekday}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: MUTED }}>{day.dayNum}</span>
            </div>
            {day.empty ? (
              <div style={{ color: MUTED, fontSize: 18, textAlign: 'center', paddingTop: 20, fontWeight: 700 }}>—</div>
            ) : (
              day.slots.map((slot) => (
                <div key={`${slot.timeMs}-${slot.timeLabel}`} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: BRAND, marginBottom: 6 }}>{slot.timeLabel}</div>
                  {slot.pitches.map((bar) => (
                    <PitchBar key={bar.pitch} bar={bar} compact />
                  ))}
                </div>
              ))
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginTop: 6 }}>
        Each bar is one pitch, split by squad. Segment width = portion (¼, ⅓, ½).
      </div>
      <SavedNote />
    </Shell>
  )
})
