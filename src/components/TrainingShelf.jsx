import { useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import DrillCard from './DrillCard.jsx'
import { BlockTitle } from './Editorial.jsx'
import { Sheet } from './Sheet.jsx'
import {
  applyChipHour,
  appendDrillsToSession,
  idsForProfile,
  likeCounts,
  listCoachNames,
  listLikes,
  listRecentTrainingUsage,
  toggleDrillFavorite,
  toggleDrillLike,
  toggleTemplateFavorite,
  toggleTemplateLike,
  usedThisWeekById,
} from '../data/trainingShelf.js'
import {
  decideSuggestion,
  getSession,
  listDrills,
  listPendingSuggestions,
  listTemplates,
  submitTemplateToClub,
} from '../data/trainingPlans.js'
import { clubDateTimeInputs, eventDate } from '../lib/eventFormat.js'
import { useAuth } from '../lib/auth.jsx'
import { CATEGORIES, CATEGORY_LABELS, squadFitsTemplate, totalMinutes } from '../lib/trainingPlans.js'
import {
  chipFit,
  chipHours,
  chipNeedsConfirm,
  chipReplaceMessage,
  clubWeekday,
  coachLabel,
  groupByCoach,
  shelfRowsForSquad,
} from '../lib/trainingShelf.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Spotify-style training shelf on Squad Training.
// Spec: claude/specs/2026-08-27-training-shelf.md
//
// SessionPlan stays the renderer of a night's blocks. This surface picks the
// hour (chips / browse) and hands tonight to SessionPlan via onOpenTonight.

const CHIP =
  'shrink-0 rounded-full border-[1.5px] px-3 py-1.5 text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50'

export default function TrainingShelf({ team, tonight, onOpenTonight, onApplied }) {
  const { user } = useAuth()
  const profileId = user?.id ?? null

  const [templates, setTemplates] = useState([])
  const [drills, setDrills] = useState([])
  const [session, setSession] = useState(null)
  const [drillLikes, setDrillLikes] = useState([])
  const [templateLikes, setTemplateLikes] = useState([])
  const [drillFavorites, setDrillFavorites] = useState([])
  const [templateFavorites, setTemplateFavorites] = useState([])
  const [namesById, setNamesById] = useState(() => new Map())
  const [usage, setUsage] = useState([])
  const [reloadToken, setReloadToken] = useState(0)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [pendingChip, setPendingChip] = useState(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState(null)
  // The director's pending suggestions on this squad's upcoming training.
  const [suggestions, setSuggestions] = useState([])
  const [deciding, setDeciding] = useState(false)

  useEffect(() => {
    let mounted = true
    const teamId = team?.id
    Promise.allSettled([
      teamId ? listTemplates({ teamId }) : Promise.resolve([]),
      teamId ? listDrills({ teamId }) : Promise.resolve([]),
      tonight?.id ? getSession(tonight.id) : Promise.resolve(null),
      listLikes('drill_likes', 'drill_id'),
      listLikes('template_likes', 'template_id'),
      listLikes('drill_favorites', 'drill_id'),
      listLikes('template_favorites', 'template_id'),
      listRecentTrainingUsage().catch(() => []),
      teamId ? listPendingSuggestions(teamId).catch(() => []) : Promise.resolve([]),
    ]).then(async (results) => {
      if (!mounted) return
      const value = (i, fallback) => (results[i].status === 'fulfilled' ? results[i].value : fallback)
      const nextTemplates = value(0, [])
      const nextDrills = value(1, [])
      setTemplates(nextTemplates)
      setDrills(nextDrills)
      setSession(value(2, null))
      setDrillLikes(value(3, []))
      setTemplateLikes(value(4, []))
      setDrillFavorites(value(5, []))
      setTemplateFavorites(value(6, []))
      setUsage(value(7, []))
      setSuggestions(value(8, []))
      const ids = [...nextTemplates, ...nextDrills].map((row) => row.created_by)
      try {
        const names = await listCoachNames(ids)
        if (mounted) setNamesById(names)
      } catch {
        if (mounted) setNamesById(new Map())
      }
    })
    return () => {
      mounted = false
    }
  }, [team?.id, tonight?.id, reloadToken])

  useEffect(() => {
    setPendingChip(null)
  }, [tonight?.id])

  const chips = chipHours(templates, team)
  const fromCoaches = shelfRowsForSquad(
    templates.filter((row) => row.created_by),
    team,
  )
  const visibleDrills = shelfRowsForSquad(drills, team)
  const weekday = clubWeekday(tonight) ?? 'tonight'

  const drillLikeCounts = useMemo(() => likeCounts(drillLikes, 'drill_id'), [drillLikes])
  const templateLikeCounts = useMemo(() => likeCounts(templateLikes, 'template_id'), [templateLikes])
  const myDrillLikes = useMemo(() => idsForProfile(drillLikes, 'drill_id', profileId), [drillLikes, profileId])
  const myTemplateLikes = useMemo(() => idsForProfile(templateLikes, 'template_id', profileId), [templateLikes, profileId])
  const myDrillFavs = useMemo(() => idsForProfile(drillFavorites, 'drill_id', profileId), [drillFavorites, profileId])
  const myTemplateFavs = useMemo(
    () => idsForProfile(templateFavorites, 'template_id', profileId),
    [templateFavorites, profileId],
  )

  /**
   * Accept or decline one suggestion — or every pending one at once. Accept is
   * the server copying the template's blocks into that session; the shelf
   * then reloads so tonight's hour and the date strip catch up (onApplied is
   * what Squad Training listens to). Nothing here touches the plan directly.
   */
  async function decide(rows, accept) {
    setDeciding(true)
    setError(null)
    try {
      for (const row of rows) {
        await decideSuggestion(row.id, accept, null)
      }
      onApplied?.()
      bump()
    } catch (failure) {
      setError(failure)
    } finally {
      setDeciding(false)
    }
  }

  function bump() {
    setReloadToken((n) => n + 1)
    onApplied?.()
  }

  // Suggest one of my OWN saved squad templates to the club, from the card
  // itself — so a coach who saved a plan but didn't suggest it in that moment
  // can still do it later, without re-saving (which would make a duplicate).
  async function suggestTemplate(templateId) {
    setApplying(true)
    setError(null)
    try {
      await submitTemplateToClub(templateId)
      bump()
    } catch (failure) {
      setError(failure)
    } finally {
      setApplying(false)
    }
  }

  async function applyHour(template, confirmed) {
    if (!tonight?.id) return
    setApplying(true)
    setError(null)
    try {
      const result = await applyChipHour({ eventId: tonight.id, session, template, confirmed })
      if (result.needsConfirm) {
        setPendingChip(template)
        return
      }
      setPendingChip(null)
      bump()
    } catch (failure) {
      setError(failure)
    } finally {
      setApplying(false)
    }
  }

  function onChip(template) {
    const fit = squadFitsTemplate(team, template)
    if (!fit.ok) return
    if (chipNeedsConfirm(session)) {
      setPendingChip(template)
      return
    }
    applyHour(template, false)
  }

  async function onToggle({ table, id, on, kind }) {
    if (!profileId) return
    const fn =
      table === 'drill_likes'
        ? toggleDrillLike
        : table === 'template_likes'
          ? toggleTemplateLike
          : table === 'drill_favorites'
            ? toggleDrillFavorite
            : toggleTemplateFavorite
    await fn({ id, profileId, on })
    if (kind === 'drill' && table.endsWith('likes')) {
      setDrillLikes((rows) => patchPair(rows, 'drill_id', id, profileId, on))
    } else if (kind === 'template' && table.endsWith('likes')) {
      setTemplateLikes((rows) => patchPair(rows, 'template_id', id, profileId, on))
    } else if (kind === 'drill') {
      setDrillFavorites((rows) => patchPair(rows, 'drill_id', id, profileId, on))
    } else {
      setTemplateFavorites((rows) => patchPair(rows, 'template_id', id, profileId, on))
    }
  }

  const tonightBlocks = session?.blocks ?? []
  const tonightTotal = totalMinutes(tonightBlocks)
  const statusLine = session?.coach_edited_at
    ? 'Edited by the coach'
    : session
      ? 'Published by the Director'
      : null

  return (
    <div data-testid="training-shelf" className="mb-4">
      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-danger-ink">
          {friendlyMessage(error, 'Something went wrong applying that hour.')}
        </p>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" data-testid="focus-chips">
        {chips.length === 0 && (
          <p className="text-[13px] font-medium text-ink-muted">No focus hours yet.</p>
        )}
        {chips.map((template) => {
          const fit = chipFit(team, template)
          const name = fit.ok ? template.chip_label : `${template.chip_label}, ${fit.reason}`
          return (
            <span key={template.id} className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                aria-label={name}
                disabled={applying || !tonight || !fit.ok}
                onClick={() => onChip(template)}
                className={[
                  CHIP,
                  fit.ok
                    ? 'border-line text-ink hover:border-brand hover:text-brand-ink'
                    : 'border-line text-ink',
                ].join(' ')}
              >
                {template.chip_label}
              </button>
              {!fit.ok && (
                <span className="max-w-[11rem] text-[12px] font-semibold leading-snug text-danger-ink">
                  {fit.reason}
                </span>
              )}
              {/* Age is guidance, not a gate: the chip works, the band is
                  said beside it in the muted colour, never the refusal red. */}
              {fit.ok && fit.guidance && (
                <span className="max-w-[11rem] text-[12px] font-medium leading-snug text-ink-muted">
                  {fit.guidance}
                </span>
              )}
            </span>
          )
        })}
      </div>

      {/* ⚠️ A SUGGESTION IS NOT A PLAN. Since 2 Sep 2026 the director's publish
          lands here, as a question, and nothing reaches tonight's hour until a
          coach says yes. Parents never see this card: the rows come through a
          policy that resolves for squad staff and admins only. */}
      {suggestions.length > 0 && (
        <Card className="mb-4 p-4" data-testid="director-suggestions">
          <h3 className="font-accent text-[18px] font-semibold italic text-ink">
            {`${suggestions.length} ${suggestions.length === 1 ? 'suggestion' : 'suggestions'} from the director`}
          </h3>
          <ul className="mt-2 divide-y divide-line/60">
            {suggestions.map((row) => {
              const when = row.event?.starts_at ? clubDateTimeInputs(eventDate(row.event)).date : ''
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                  <span className="font-semibold text-ink">
                    {when ? `${when} · ` : ''}{row.template?.name ?? 'Suggested hour'}
                    {row.template?.total_minutes ? ` · ${row.template.total_minutes} min` : ''}
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" disabled={deciding} onClick={() => decide([row], true)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost" disabled={deciding} onClick={() => decide([row], false)}>
                      Decline
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
          {suggestions.length > 1 && (
            <Button variant="secondary" size="sm" className="mt-2" disabled={deciding} onClick={() => decide(suggestions, true)}>
              Accept all
            </Button>
          )}
        </Card>
      )}

      <Card className="mb-4 p-4" data-testid="tonight-hour">
        <h3 className="font-accent text-[18px] font-semibold italic text-ink">
          Tonight&apos;s hour{tonightTotal ? ` · ${tonightTotal} min` : ''}
        </h3>
        {tonightBlocks.length === 0 && (
          <p className="mt-2 text-[13px] font-medium text-ink-muted">
            {tonight
              ? 'No plan yet — pick a focus chip or open the library.'
              : 'No upcoming training on the calendar.'}
          </p>
        )}
        {tonightBlocks.length > 0 && (
          <ol className="mt-2 divide-y divide-line/60">
            {tonightBlocks.map((block, index) => (
              <li key={block.id ?? `${block.drill_id}-${index}`} className="flex justify-between py-1.5 text-[13px]">
                <span className="font-semibold text-ink">
                  {index + 1}. {block.drill?.title ?? 'Drill'}
                </span>
                <span className="font-medium text-ink-muted">{block.minutes} min</span>
              </li>
            ))}
          </ol>
        )}
        {tonightBlocks.length > 0 && (
          <p className="mt-2 flex justify-between text-[13px] font-bold text-ink">
            <span>Total</span>
            <span>{tonightTotal} min</span>
          </p>
        )}
        {statusLine && <p className="mt-2 text-[12.5px] font-medium text-ink-muted">{statusLine}</p>}
        {tonight && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => onOpenTonight?.(tonight)}>
            Open tonight&apos;s plan
          </Button>
        )}
      </Card>

      {pendingChip && (
        <div
          role="alertdialog"
          aria-label="Replace your edits"
          data-testid="chip-replace-confirm"
          className="mb-4 rounded-[10px] border-[1.5px] border-brand bg-surface-mute p-3"
        >
          <p className="text-[13px] font-bold text-ink">{chipReplaceMessage(pendingChip.chip_label)}</p>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            <Button disabled={applying} onClick={() => applyHour(pendingChip, true)}>
              Replace
            </Button>
            <Button variant="secondary" disabled={applying} onClick={() => setPendingChip(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <section data-testid="from-coaches" className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <BlockTitle>From coaches</BlockTitle>
          <button type="button" className="text-[13px] font-bold text-brand-ink" onClick={() => setBrowseOpen(true)}>
            See all
          </button>
        </div>
        {fromCoaches.length === 0 ? (
          <p className="text-[13px] font-medium text-ink-muted">No coach hours yet.</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {fromCoaches.map((template) => (
              <div key={template.id} className="w-[220px] shrink-0">
                <DrillCard
                  title={template.name}
                  summary={template.notes}
                  coachName={coachLabel(template.created_by, namesById)}
                  minutes={template.total_minutes}
                  likeCount={templateLikeCounts.get(template.id) ?? 0}
                  liked={myTemplateLikes.has(template.id)}
                  favorited={myTemplateFavs.has(template.id)}
                  usedThisWeek={usedThisWeekById(usage, 'template', template.id)}
                  onLike={() =>
                    onToggle({
                      table: 'template_likes',
                      id: template.id,
                      on: !myTemplateLikes.has(template.id),
                      kind: 'template',
                    })
                  }
                  onFavorite={() =>
                    onToggle({
                      table: 'template_favorites',
                      id: template.id,
                      on: !myTemplateFavs.has(template.id),
                      kind: 'template',
                    })
                  }
                  onOpen={() => onChip(template)}
                  suggested={template.created_by === profileId && !!template.submitted_at}
                  onSuggest={
                    template.created_by === profileId && !template.submitted_at
                      ? () => suggestTemplate(template.id)
                      : null
                  }
                  suggestBusy={applying}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section data-testid="library-shelf">
        <div className="mb-2 flex items-baseline justify-between">
          <BlockTitle>Library</BlockTitle>
          <button type="button" className="text-[13px] font-bold text-brand-ink" onClick={() => setBrowseOpen(true)}>
            See all
          </button>
        </div>
        {drills.length === 0 ? (
          <p className="text-[13px] font-medium text-ink-muted">The library is empty — add drills when you have them.</p>
        ) : visibleDrills.length === 0 ? (
          <p className="text-[13px] font-medium text-ink-muted">
            No drills for this squad — open the library to show all ages.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleDrills.slice(0, 6).map((drill) => (
              <li key={drill.id}>
                <DrillCard
                  title={drill.title}
                  summary={drill.summary}
                  coachName={coachLabel(drill.created_by, namesById)}
                  minutes={drill.minutes}
                  category={drill.category}
                  minAge={drill.min_age}
                  maxAge={drill.max_age}
                  requiresContact={drill.requires_contact}
                  likeCount={drillLikeCounts.get(drill.id) ?? 0}
                  liked={myDrillLikes.has(drill.id)}
                  favorited={myDrillFavs.has(drill.id)}
                  usedThisWeek={usedThisWeekById(usage, 'drill', drill.id)}
                  onLike={() =>
                    onToggle({
                      table: 'drill_likes',
                      id: drill.id,
                      on: !myDrillLikes.has(drill.id),
                      kind: 'drill',
                    })
                  }
                  onFavorite={() =>
                    onToggle({
                      table: 'drill_favorites',
                      id: drill.id,
                      on: !myDrillFavs.has(drill.id),
                      kind: 'drill',
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {browseOpen && (
        <LibraryBrowse
          team={team}
          drills={drills}
          templates={templates}
          namesById={namesById}
          drillLikeCounts={drillLikeCounts}
          templateLikeCounts={templateLikeCounts}
          myDrillLikes={myDrillLikes}
          myTemplateLikes={myTemplateLikes}
          myDrillFavs={myDrillFavs}
          myTemplateFavs={myTemplateFavs}
          usage={usage}
          weekday={weekday}
          tonight={tonight}
          session={session}
          onToggle={onToggle}
          onApplyHour={(template) => {
            setBrowseOpen(false)
            onChip(template)
          }}
          onAppend={async (picked) => {
            if (!tonight?.id || picked.length === 0) return
            setApplying(true)
            try {
              await appendDrillsToSession({ eventId: tonight.id, session, drills: picked })
              setBrowseOpen(false)
              bump()
            } catch (failure) {
              setError(failure)
            } finally {
              setApplying(false)
            }
          }}
          onClose={() => setBrowseOpen(false)}
        />
      )}
    </div>
  )
}

function patchPair(rows, idColumn, id, profileId, on) {
  if (on) return [...rows, { [idColumn]: id, profile_id: profileId }]
  return rows.filter((row) => !(row[idColumn] === id && row.profile_id === profileId))
}

function LibraryBrowse({
  team,
  drills,
  templates,
  namesById,
  drillLikeCounts,
  templateLikeCounts,
  myDrillLikes,
  myTemplateLikes,
  myDrillFavs,
  myTemplateFavs,
  usage,
  weekday,
  tonight,
  onToggle,
  onApplyHour,
  onAppend,
  onClose,
}) {
  const [kind, setKind] = useState('drills')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  // Every row this squad may run. Youth: in-band first, the rest after
  // (age is guidance since 2 Sep 2026). Seniors: in-band only — Jay 4 Sep.
  const isHours = kind === 'hours'
  const rows = isHours ? shelfRowsForSquad(templates, team) : shelfRowsForSquad(drills, team)
  const q = query.trim().toLowerCase()

  let shown = rows
  if (category === 'mine') {
    shown = shown.filter((row) => (isHours ? myTemplateFavs.has(row.id) : myDrillFavs.has(row.id)))
  } else if (category !== 'all' && category !== 'by_coach' && !isHours) {
    shown = shown.filter((row) => row.category === category)
  }
  if (q) {
    shown = shown.filter((row) => {
      const hay = `${row.title ?? row.name ?? ''} ${row.summary ?? row.notes ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

  const featured = shown.filter((row) => row.is_featured)
  const rest = shown.filter((row) => !row.is_featured)
  const grouped = category === 'by_coach' ? groupByCoach(shown, namesById) : null

  const pickedDrills = drills.filter((d) => picked.has(d.id))
  const pickedMinutes = totalMinutes(pickedDrills)

  function renderCard(row) {
    if (isHours) {
      return (
        <DrillCard
          key={row.id}
          title={row.name}
          summary={row.notes}
          coachName={coachLabel(row.created_by, namesById)}
          minutes={row.total_minutes}
          likeCount={templateLikeCounts.get(row.id) ?? 0}
          liked={myTemplateLikes.has(row.id)}
          favorited={myTemplateFavs.has(row.id)}
          usedThisWeek={usedThisWeekById(usage, 'template', row.id)}
          onLike={() =>
            onToggle({ table: 'template_likes', id: row.id, on: !myTemplateLikes.has(row.id), kind: 'template' })
          }
          onFavorite={() =>
            onToggle({
              table: 'template_favorites',
              id: row.id,
              on: !myTemplateFavs.has(row.id),
              kind: 'template',
            })
          }
          onOpen={() => onApplyHour(row)}
        />
      )
    }
    return (
      <DrillCard
        key={row.id}
        title={row.title}
        summary={row.summary}
        coachName={coachLabel(row.created_by, namesById)}
        minutes={row.minutes}
        category={row.category}
        minAge={row.min_age}
        maxAge={row.max_age}
        requiresContact={row.requires_contact}
        likeCount={drillLikeCounts.get(row.id) ?? 0}
        liked={myDrillLikes.has(row.id)}
        favorited={myDrillFavs.has(row.id)}
        usedThisWeek={usedThisWeekById(usage, 'drill', row.id)}
        selected={picked.has(row.id)}
        onLike={() => onToggle({ table: 'drill_likes', id: row.id, on: !myDrillLikes.has(row.id), kind: 'drill' })}
        onFavorite={() =>
          onToggle({ table: 'drill_favorites', id: row.id, on: !myDrillFavs.has(row.id), kind: 'drill' })
        }
        onOpen={() =>
          setPicked((current) => {
            const next = new Set(current)
            if (next.has(row.id)) next.delete(row.id)
            else next.add(row.id)
            return next
          })
        }
      />
    )
  }

  return (
    <Sheet open onClose={onClose} title="Library">
      <div data-testid="library-browse">
        <div role="tablist" aria-label="Library kind" className="mb-3 flex rounded-full border-[1.5px] border-line p-0.5">
          {['drills', 'hours'].map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={kind === value}
              onClick={() => {
                setKind(value)
                setPicked(new Set())
              }}
              className={[
                'flex-1 rounded-full py-1.5 text-[13px] font-bold capitalize',
                kind === value ? 'bg-brand text-white' : 'text-brand-ink',
              ].join(' ')}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" data-testid="browse-chips">
          {[
            { id: 'all', label: 'All' },
            ...CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
            { id: 'by_coach', label: 'By coach' },
            { id: 'mine', label: 'My shelf' },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setCategory(chip.id)}
              className={[
                CHIP,
                category === chip.id ? 'border-brand bg-brand text-white' : 'border-line bg-surface-card text-ink',
              ].join(' ')}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <label className="mb-3 block">
          <span className="sr-only">Search {kind}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isHours ? 'Search hours' : 'Search drills'}
            className="w-full rounded-[10px] border-[1.5px] border-line bg-surface-mute px-3 py-2 text-[16px] text-ink"
          />
        </label>

        {featured.length > 0 && category === 'all' && !q && (
          <div data-testid="featured-row" className="mb-3">
            {featured.map(renderCard)}
          </div>
        )}

        {grouped ? (
          grouped.map((group) => (
            <section key={group.coach} className="mb-4" data-testid="coach-group">
              <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.6px] text-ink-muted">
                {group.coach}
              </h3>
              <div className="flex flex-col gap-2">{group.items.map(renderCard)}</div>
            </section>
          ))
        ) : (
          <div className="flex flex-col gap-2">
            {(category === 'all' && !q ? rest : shown).map(renderCard)}
            {shown.length === 0 && (
              <p className="text-[13px] font-medium text-ink-muted">Nothing in the library matches.</p>
            )}
          </div>
        )}

        {!isHours && picked.size > 0 && tonight && (
          <button
            type="button"
            data-testid="add-to-tonight"
            onClick={() => onAppend(pickedDrills)}
            className="mt-4 flex w-full items-center justify-between rounded-full bg-brand px-4 py-3 text-[14px] font-bold text-white"
          >
            <span>
              Add to {weekday} · {picked.size} {picked.size === 1 ? 'drill' : 'drills'} · {pickedMinutes} min
            </span>
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </Sheet>
  )
}
