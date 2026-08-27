import { eventDate, eventTitle, formatTableDate } from './eventFormat.js'

// Deep link + short caption for sharing a session plan. The picture is the
// plan; this is only the text that rides with it (spec:
// claude/specs/2026-08-27-session-plan-share.md).
//
// ⚠️ `/schedule?event=` IS THE EXISTING overlay deep-link (chat fixture cards,
// 23 Aug 2026). EventDetail is not a URL of its own; inventing `/event/:id`
// would be a second calendar. Squad Training is staff-gated, so a family who
// can already see the event would be turned away there.

export function sessionPlanShareUrl(eventId, origin = globalThis.location?.origin ?? '') {
  if (!eventId) return origin
  return `${origin}/schedule?event=${encodeURIComponent(eventId)}`
}

export function sessionPlanShareCopy(event, origin = globalThis.location?.origin ?? '') {
  const url = sessionPlanShareUrl(event?.id, origin)
  const title = eventTitle(event)
  const date = eventDate(event)
  const dateLabel = date ? formatTableDate(date) : null
  const head = [title, dateLabel].filter(Boolean).join(' · ')
  return {
    url,
    title,
    text: [head, url].filter(Boolean).join('\n'),
    filename: `session-plan-${event?.id ?? 'plan'}.png`,
  }
}
