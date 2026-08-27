import { forwardRef } from 'react'
import { CATEGORY_LABELS } from '../lib/trainingPlans.js'
import { eventDate, eventTimeLabel, eventTitle, formatLongDate, eventPitchLabel } from '../lib/eventFormat.js'

// Share-only tree photographed by shareElementAsImage / html2canvas.
// Club Hub look (Inter, ink / muted / line / brand) in ordinary block flow.
// Chip-on-a-flex-wrap-title-row is what concatenated `touchGame` in WhatsApp;
// the category pill here is its own line, inline-block, never beside the title.
// Spec: claude/specs/2026-08-27-session-plan-share.md

const INK = '#101116'
const INK_MUTED = '#565c67'
const INK_FAINT = '#636974'
const LINE = '#e5e5e5'
const BRAND = '#c8102e'
const MUTE_BG = '#f7f7f7'
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif'

const PAPER = {
  display: 'block',
  width: '360px',
  background: '#ffffff',
  color: INK,
  fontFamily: FONT,
  padding: '18px 16px 20px',
  boxSizing: 'border-box',
}

const HEADER = {
  display: 'block',
  margin: '0 0 2px',
  padding: '0 0 14px',
  borderBottom: `3px solid ${BRAND}`,
}

const SQUAD = {
  display: 'block',
  margin: '0',
  fontSize: '13px',
  fontWeight: 800,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
  color: INK_FAINT,
}

const TITLE = {
  display: 'block',
  margin: '6px 0 0',
  fontSize: '18px',
  fontWeight: 800,
  lineHeight: 1.25,
  color: INK,
}

const META = {
  display: 'block',
  margin: '6px 0 0',
  fontSize: '12.5px',
  fontWeight: 600,
  lineHeight: 1.4,
  color: INK_MUTED,
}

const BLOCK = {
  display: 'block',
  margin: '0',
  padding: '14px 0',
  borderBottom: `1px solid ${LINE}`,
}

const TITLE_LINE = {
  display: 'block',
  margin: '0',
  fontSize: '14px',
  fontWeight: 800,
  lineHeight: 1.3,
  color: INK,
}

const PILL_ROW = {
  display: 'block',
  margin: '8px 0 0',
}

const PILL = {
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: '12px',
  border: `1px solid ${LINE}`,
  background: MUTE_BG,
  color: INK_MUTED,
  fontSize: '11.5px',
  fontWeight: 700,
  lineHeight: 1.2,
}

const NOTE = {
  display: 'block',
  margin: '10px 0 0',
  fontSize: '12.5px',
  lineHeight: 1.55,
  color: INK_MUTED,
  whiteSpace: 'pre-wrap',
}

const TOTAL = {
  display: 'block',
  margin: '14px 0 0',
  fontSize: '12.5px',
  fontWeight: 700,
  color: INK_MUTED,
}

const SESSION_NOTES = {
  display: 'block',
  margin: '8px 0 0',
  fontSize: '13px',
  lineHeight: 1.55,
  color: INK_MUTED,
}

export const SessionPlanCapture = forwardRef(function SessionPlanCapture(
  { event, team, session, total },
  ref,
) {
  const date = eventDate(event)
  const pitch = eventPitchLabel(event)
  const when = [date ? formatLongDate(date) : null, eventTimeLabel(event)].filter(Boolean).join(' · ')

  return (
    <div ref={ref} data-testid="session-plan-capture" className="force-light font-sans" style={PAPER}>
      <div style={HEADER}>
        {team?.name ? (
          <p data-testid="session-plan-share-squad" className="uppercase tracking-[.8px] text-ink-faint" style={SQUAD}>
            {team.name}
          </p>
        ) : null}
        <p data-testid="session-plan-share-title" className="font-extrabold text-ink" style={TITLE}>
          {eventTitle(event)}
        </p>
        {when ? (
          <p data-testid="session-plan-share-when" className="text-ink-muted" style={META}>
            {when}
          </p>
        ) : null}
        {pitch ? (
          <p data-testid="session-plan-share-pitch" className="text-ink-muted" style={META}>
            {pitch}
          </p>
        ) : null}
      </div>
      {(session?.blocks ?? []).map((block) => {
        const drill = block.drill ?? {}
        const category = CATEGORY_LABELS[drill.category] ?? drill.category ?? null
        return (
          <div key={block.id} data-testid="session-plan-share-block" style={BLOCK}>
            <p data-testid="session-plan-share-title-line" className="font-extrabold text-ink" style={TITLE_LINE}>
              {block.minutes} min · {drill.title ?? 'Drill'}
            </p>
            {category ? (
              <div style={PILL_ROW}>
                <span data-testid="session-plan-share-category" style={PILL}>
                  {category}
                </span>
              </div>
            ) : null}
            {block.coach_note ? (
              <p className="text-ink-muted" style={NOTE}>
                {block.coach_note}
              </p>
            ) : null}
          </div>
        )
      })}
      <p data-testid="session-plan-share-total" className="font-bold text-ink-muted" style={TOTAL}>
        Total {total} min
      </p>
      {session?.notes ? (
        <p className="text-ink-muted" style={SESSION_NOTES}>
          {session.notes}
        </p>
      ) : null}
    </div>
  )
})
