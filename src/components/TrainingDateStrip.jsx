import { BlockTitle } from './Editorial.jsx'
import {
  nightDateLabel,
  nightSummary,
  nightTimeLabel,
  pitchBookedLabel,
  sessionStatus,
} from '../lib/trainingDates.js'

// Horizontal strip of this squad's training nights in the next two weeks.
// Lives on Squad Training, above the Spotify chips. Not a month calendar.
// Spec: claude/specs/2026-08-27-training-date-strip.md

const STATUS_TONE = {
  empty: 'bg-surface-mute text-ink-muted',
  draft: 'bg-surface-mute text-ink-muted',
  staff: 'bg-accent-bg text-accent-ink',
  squad: 'bg-accent-bg text-accent-ink',
}

export default function TrainingDateStrip({ nights = [], selected = null, plansByEvent, onSelect }) {
  const plans = plansByEvent instanceof Map ? plansByEvent : new Map()

  if (nights.length === 0) {
    return (
      <div className="mb-3">
        <BlockTitle>Next two weeks</BlockTitle>
        <p
          data-testid="training-date-strip-empty"
          className="px-1 py-3 text-[13px] font-medium text-ink-muted"
        >
          No training nights in the next two weeks.
        </p>
      </div>
    )
  }

  return (
    <section className="mb-3">
      <BlockTitle>Next two weeks</BlockTitle>
      <div
        data-testid="training-date-strip"
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {nights.map((event) => {
          const plan = plans.get(event.id)
          const status = sessionStatus(plan)
          const pressed = selected?.id === event.id
          const pitch = pitchBookedLabel(event)
          return (
            <button
              key={event.id}
              type="button"
              aria-pressed={pressed}
              aria-label={[nightDateLabel(event), status.label, pitch].filter(Boolean).join(', ')}
              onClick={() => onSelect?.(event)}
              className={[
                'flex min-w-[5.75rem] shrink-0 flex-col items-start gap-1 rounded-[10px] border-[1.5px] px-2.5 py-2 text-left',
                pressed ? 'border-brand' : 'border-line bg-surface-card',
              ].join(' ')}
            >
              <span className="text-[13px] font-bold text-ink">{nightDateLabel(event)}</span>
              <span className="text-[12px] font-medium text-ink-muted">{nightTimeLabel(event)}</span>
              <span
                className={[
                  'rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                  STATUS_TONE[status.key] ?? STATUS_TONE.empty,
                ].join(' ')}
              >
                {status.label}
              </span>
              {pressed && pitch && (
                <span className="text-[11px] font-semibold text-ink-muted">✓ {pitch}</span>
              )}
            </button>
          )
        })}
      </div>
      {selected && (
        <p data-testid="training-date-summary" className="mt-2 text-[13px] font-medium text-ink-muted">
          {nightSummary(selected, plans.get(selected.id))}
        </p>
      )}
    </section>
  )
}
