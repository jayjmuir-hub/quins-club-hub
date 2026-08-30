import { forwardRef } from 'react'

// The pitch-layout PICTURE — the day and week share cards, and the on-screen
// "visual representation" they double as (Jay, 30 Aug 2026).
//
// ⚠️ FIXED LIGHT PALETTE, ON PURPOSE, AND THAT IS WHY THE COLOURS ARE INLINE
// RATHER THAN design-system TOKENS. This element is photographed by html2canvas
// (src/lib/shareImage.js) and sent to WhatsApp, so it has to render the same on
// a phone, a desktop, and in a dark-themed browser — a token that flips in dark
// mode would produce light text on the forced white background and an unreadable
// PNG. It is a document, like the match sheet, not app chrome. Solid fills only
// for the same reason: html2canvas is unreliable with repeating-gradient hatching.
//
// ⚠️ COLOUR IS NEVER THE ONLY SIGNAL (design-system §accessibility, the club is
// mostly men and ~8% have a colour-vision deficiency). Every segment is named in
// text inside or beside it, every pitch carries its "full / free / over" status
// in words, and each pitch bar is role="img" with a spoken label.

const FIELD = ['#2f7d4f', '#3a8a5c'] // alternating greens for adjacent squads
const OVER_FILL = '#c2410c' // amber-brown: an overloaded pitch, said in words too
const SPARE_FILL = '#e6eaee'
const BRAND = '#c8102e'
const INK = '#15181c'
const MUTED = '#5b626b'
const LINE = '#e6e8eb'
const WHITE = '#ffffff'

/** The leading token of a squad name — "U12G QR" → "U12G" — for the tight week
 *  columns where the full name will not fit a quarter-width segment. */
const shortSquad = (name) => String(name ?? '').split(/\s+/)[0] || name

/** A club-wide booking labels by its TITLE, which is free text and can be long.
 *  Cap it so it stays readable and cannot dominate a tight segment — the CSS
 *  ellipsis is the visual clip, this bounds the string the exporter measures. */
const clip = (name, max) => {
  const s = String(name ?? '').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/** The label a segment shows: a squad code (clipped to its leading token on the
 *  tight week bars) or, for a club-wide booking, its capped title. */
const segLabel = (seg, compact) =>
  seg.clubWide ? clip(seg.squad, compact ? 16 : 30) : compact ? shortSquad(seg.squad) : seg.squad

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
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
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
  const full = !over && spareFraction < 1e-9
  const bg = over ? '#fbe4d8' : full ? '#fbe1e6' : '#e2f0e8'
  const fg = over ? '#9a3412' : full ? BRAND : '#1f6b41'
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
  // ⚠️ THE COMPACT LABELS MUST NOT BE TINY, AND HERE IS WHY — Jay, 30 Aug 2026.
  // The SHARE picture is drawn by html2canvas, and html2canvas does not render
  // small text: at the old 8px the white squad codes came out as a row of
  // dashes/dots in the exported PNG while the live card looked perfect (black
  // "D2" at 11px and the red time at 9.5px rendered fine — it is a size floor,
  // ~10px, not the font or the colour). Confirmed by exporting the card in the
  // harness and reading the pixels back. So the compact codes are 11px, and the
  // week card is widened (see PitchWeekCard's Shell) so U12G/U14G still fit a
  // quarter bar at that size. No negative letter-spacing and no text-shadow
  // either — both are extra ways to make html2canvas mangle small text, and
  // neither earns its keep on a share picture.
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
