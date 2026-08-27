import { CATEGORY_LABELS, bandLabel } from '../lib/trainingPlans.js'

// One library / shelf card. Spec: claude/specs/2026-08-27-training-shelf.md
//
// Title, summary, an adult coach name, likes, a personal star, category and
// age pills. ⛔ No player names, no player photos, no FaceStack, no 1–5
// rating, no pitch-diagram thumbnail — opened cards mount DrillDiagram
// instead (claude/specs/2026-08-27-drill-diagrams.md). Used-this-week is a
// count when given, not a star average.

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 21s-6.5-4.35-9.33-8.11C.7 10.4 1.2 6.7 4.05 5.15 6.2 4 8.7 4.55 12 8c3.3-3.45 5.8-4 7.95-2.85 2.85 1.55 3.35 5.25 1.38 7.74C18.5 16.65 12 21 12 21z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M12 3.2 14.4 9h6.1l-4.9 3.7 1.9 6.1L12 15.8 6.5 18.8 8.4 12.7 3.5 9h6.1L12 3.2z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function DrillCard({
  title,
  summary,
  coachName,
  minutes,
  category,
  minAge,
  maxAge,
  requiresContact,
  likeCount = 0,
  liked = false,
  favorited = false,
  usedThisWeek = null,
  onLike,
  onFavorite,
  onOpen,
  selected = false,
}) {
  const age = bandLabel(minAge ?? null, maxAge ?? null)
  const categoryLabel = category ? CATEGORY_LABELS[category] ?? category : null

  return (
    <article
      data-testid="drill-card"
      className={[
        'relative flex gap-3 rounded-[12px] border-[1.5px] bg-surface-card p-3',
        selected ? 'border-brand' : 'border-line',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block w-full text-left">
            <h3 className="font-accent text-[16px] font-semibold italic leading-snug text-ink">{title}</h3>
          </button>
        ) : (
          <h3 className="font-accent text-[16px] font-semibold italic leading-snug text-ink">{title}</h3>
        )}
        {summary ? <p className="mt-0.5 text-[13px] text-ink">{summary}</p> : null}
        <p className="mt-1.5 text-[12px] font-medium text-ink-muted">
          {[
            minutes != null ? `${minutes} min` : null,
            categoryLabel,
            age,
            requiresContact ? 'Contact' : requiresContact === false ? 'Tag' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {coachName ? <p className="mt-1 text-[12px] font-medium text-ink-muted">{coachName}</p> : null}
        {usedThisWeek != null && (
          <p data-testid="used-this-week" className="mt-1 text-[12px] font-bold text-ink-muted">
            Used this week · {usedThisWeek}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-2">
        {onLike && (
          <button
            type="button"
            data-testid="like-button"
            aria-label={liked ? `Unlike ${title}` : `Like ${title}`}
            aria-pressed={liked}
            onClick={onLike}
            className="flex flex-col items-center text-brand-ink"
          >
            <HeartIcon filled={liked} />
            <span data-testid="like-count" className="text-[12px] font-bold">
              {likeCount}
            </span>
          </button>
        )}
        {onFavorite && (
          <button
            type="button"
            data-testid="favorite-button"
            aria-label={favorited ? `Unfavorite ${title}` : `Favorite ${title}`}
            aria-pressed={favorited}
            onClick={onFavorite}
            className={favorited ? 'text-brand-ink' : 'text-ink-muted'}
          >
            <StarIcon filled={favorited} />
          </button>
        )}
      </div>
    </article>
  )
}
