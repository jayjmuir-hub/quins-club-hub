import { useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import PersonCard from './PersonCard.jsx'
import PersonName from './PersonName.jsx'
import NoticeAudienceIcon from './NoticeAudienceIcon.jsx'
import { audienceLabel, postedLabel, seenSummary } from '../lib/notices.js'
import { initials } from '../lib/playerFormat.js'

// One notice on the board.
//
// ⚠️ EXTRACTED FROM src/screens/Notices.jsx ON 16 Aug 2026, and the reason is
// the redesign that came with it. That screen reads three tables, so it has
// never had a harness scenario — the comment on the `notices` scenario in
// harness/main.jsx says so in as many words. A card nobody can look at without a
// database session is a card that gets reviewed by reading its JSX, which is how
// it stayed bland enough for Jay to say so.
//
// As a pure-props component it renders in the harness beside the Home card
// (NoticeBoard, extracted earlier for exactly the same reason) and is testable
// without mocking the data layer.
//
// ⚠️ THIS IS NOT NoticeBoard. That one draws the PINNED subset on Home and is
// deliberately terser — it is a pointer to the board, not the board. Two
// renderings of a notice is a thing to keep an eye on, but they answer different
// questions and Jay has seen both.

/* ══════════════════════════════════════════════════════════════════════════
   One notice in the list
   ══════════════════════════════════════════════════════════════════════════ */

export default function NoticeRow({ notice, teamsById, unread, stat, expired, onOpenReceipts, onDelete }) {
  // ⚠️ TWO-STEP INLINE CONFIRM, NEVER A NATIVE confirm(). Established in Task
  // 14: a native dialog blocks the event loop and hangs the browser check dead.
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  // The person card (claude/plans/2026-08-26-person-card.md): the author's
  // name is a door. Self-contained — the row owns its card, so NoticeBoard
  // and /notices get it without threading a prop through either.
  const [cardFor, setCardFor] = useState(null)
  const summary = seenSummary(stat)

  const clubWide = notice.team_id == null
  const authorName = notice?.author?.full_name?.trim() || ''
  const authorTitle = notice?.author?.title?.trim() || ''

  // ⚠️ THE STRIPE AND THE TILE SAY THE SAME THING TWICE, ON PURPOSE. Jay chose
  // colour by AUDIENCE — red for the whole club, green for one squad — because
  // that is the question a parent asks first: does this apply to my child, or to
  // everyone? Colour alone would fail a colour-blind reader, so the audience is
  // also written in words on the chip and drawn as a mark beside it. Three
  // channels, one fact.
  //
  // ⚠️ EXPIRED OVERRIDES BOTH. A notice that has run out is not a quieter squad
  // notice, it is a different state, and the board must not still be shouting a
  // fixture change that happened last month.
  const tone = expired
    ? { stripe: 'bg-line-strong', chip: 'bg-surface-mute text-ink-faint' }
    : clubWide
      ? { stripe: 'bg-brand', chip: 'bg-danger-bg text-danger-ink' }
      : { stripe: 'bg-accent', chip: 'bg-accent-bg text-accent-ink' }

  return (
    // break-inside-avoid: the Notices board lays these in CSS columns on
    // desktop, and a card split across two columns is unreadable.
    <Card className="mb-2.5 overflow-hidden break-inside-avoid" data-testid="notice-row">
      <div className="flex">
        {/* ⚠️ `aria-hidden` AND NOT A LIST MARKER. It repeats the chip beside
            it; a screen reader announcing a colour swatch is noise. */}
        <div className={`w-1.5 shrink-0 ${tone.stripe}`} aria-hidden="true" />

        <div className="min-w-0 flex-1 px-3.5 py-3.5">
        {/* ── Who posted it ─────────────────────────────────────────────────
            ⚠️ THE AUTHOR LEADS NOW, AND THAT IS THE POINT OF THE REDESIGN. It
            used to be a grey line under the body. These notices sit alongside a
            WhatsApp group in the club's life, and a message from a person reads
            differently from a bulletin from an app — Jay, 16 Aug 2026: "i don't
            like how the notice looks, too bland".

            ⚠️ THE MONOGRAM TILE IS THE SQUAD-CONTACT PATTERN, reused rather
            than reinvented — see the `monogram-*` gradients in
            tailwind.config.js, which exist because most of the club's staff have
            no photo and the initials tile is therefore the ORDINARY rendering. ── */}
        <div className="flex items-center gap-2.5">
          {authorName && (
            <span
              aria-hidden="true"
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-extrabold text-ink-invert ${
                clubWide ? 'bg-monogram-manager' : 'bg-monogram-coach'
              }`}
            >
              {initials(authorName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {authorName ? (
              <p className="truncate text-[13.5px] font-extrabold leading-tight text-ink">
                <PersonName profileId={notice.author_id} onOpen={setCardFor}>
                  {authorName}
                </PersonName>
              </p>
            ) : (
              <p className="truncate text-[13.5px] font-extrabold leading-tight text-ink-muted">
                The club
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {authorTitle && (
                <span className="text-[11.5px] font-semibold text-ink-muted">{authorTitle}</span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[.4px] ${tone.chip}`}
              >
                <NoticeAudienceIcon clubWide={clubWide} className="h-3 w-3" />
                {audienceLabel(notice, teamsById)}
              </span>
              {/* ⚠️ PINNED BELONGS ON THIS LINE, NOT BESIDE THE TITLE. It sat
                  after the title first and wrapped onto a line of its own on a
                  phone — a lone red word under a heading, which reads as a
                  rendering fault rather than as a label. This row is already
                  "what kind of notice is this", so it is where the reader is
                  looking for it, and the chips wrap against each other cleanly. */}
              {notice.pinned && !expired && (
                <span className="inline-flex items-center rounded-[6px] bg-surface-mute px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[.4px] text-ink-muted">
                  Pinned
                </span>
              )}
            </div>
          </div>
          {/* ⚠️ THE TIME IS NEW (16 Aug 2026). `created_at` was already selected
              and already ordered the list; nothing was ever showing it, and a
              notice with no date reads as something the app is displaying rather
              than something a person posted at a moment. */}
          <span className="shrink-0 self-start text-[11.5px] font-semibold text-ink-faint">
            {postedLabel(notice.created_at)}
          </span>
        </div>

        {/* ── What it says ─────────────────────────────────────────────── */}
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {/* ⚠️ THE DOT IS INSIDE THE HEADING, NOT A FLEX SIBLING OF IT. As a
                sibling in a wrapping row it was stranded on a line of its own
                the moment a title ran past one line — a lone red dot above a
                heading, which reads as a bullet nobody asked for. Inline-block
                inside the text flows with the first word and cannot separate
                from it however the title wraps.
                ⚠️ SHAPE AS WELL AS COLOUR — paired with the "New" for screen
                readers below, never colour alone (claude/specs/accessibility.md). */}
            <h3 className="text-[16px] font-extrabold leading-[1.3] tracking-[-.2px] text-ink">
              {unread && !expired && (
                <span
                  aria-hidden="true"
                  className="mr-2 inline-block h-2 w-2 rounded-full bg-brand align-middle"
                />
              )}
              {notice.title}
            </h3>
            {unread && !expired && <span className="sr-only">New</span>}
            {expired && (
              <span className="rounded-[6px] bg-surface-mute px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Expired
              </span>
            )}
          </div>

          <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-ink-muted">
            {notice.body}
          </p>
        </div>

        {/* Only rendered for somebody the database will give numbers to — the
            author, or an admin. `noticeStats` returns an empty map for everyone
            else, so this whole row simply does not appear for a parent. */}
        {(summary || onDelete) && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5">
            {summary && (
              <button
                type="button"
                data-testid="open-receipts"
                onClick={() => onOpenReceipts(notice)}
                className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {summary}
              </button>
            )}

            {onDelete && !confirming && (
              <button
                type="button"
                data-testid="delete-notice"
                onClick={() => setConfirming(true)}
                className="text-[13px] font-bold text-ink-muted underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Take it down
              </button>
            )}

            {onDelete && confirming && (
              <span className="flex items-center gap-2.5">
                <span className="text-[13px] text-ink-muted">Take it down?</span>
                <Button
                  variant="danger"
                  disabled={busy}
                  data-testid="confirm-delete-notice"
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await onDelete(notice)
                    } finally {
                      setBusy(false)
                      setConfirming(false)
                    }
                  }}
                >
                  {busy ? 'Removing…' : 'Yes'}
                </Button>
                {!busy && (
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Keep it
                  </Button>
                )}
              </span>
            )}
          </div>
        )}
        </div>
      </div>

      <PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />
    </Card>
  )
}
