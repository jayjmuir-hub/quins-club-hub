// THROWAWAY design review for the Staff screen (16 Aug 2026).
//
// Jay: "in Staff, we need a better design, maybe bubbles or something similar to
// the team contacts view on the home page, give options".
//
// ⚠️ TWO CONSTRAINTS SHAPE ALL THREE OPTIONS, and neither is obvious from the
// ask:
//
//   1. THIS SCREEN IS AN EDITOR. SquadStaffCard on Home is a read-only contact
//      card; /admin/staff carries an inline TITLE field and a PHOTO uploader per
//      person. A design that only looks like Home loses both. Each option below
//      says where editing went.
//
//   2. THE DOMINANT STATE IS EMPTY. claude/open-items.md records that most of
//      the club's squads have nobody attached — so the screen an admin actually
//      opens is mostly blank cards. A design optimised for full squads is
//      optimised for the case that does not happen yet, and "which squads are
//      missing staff" is the question this screen is really asked.
//
// ⚠️ NOT MEANT TO SURVIVE. The winner gets built properly; this file goes.
import Card from '../src/components/Card.jsx'
import { initials } from '../src/lib/playerFormat.js'

// Invented names, as everything published from this repo must be.
const SQUADS = [
  {
    name: 'U14B',
    staff: [
      { id: 's1', name: 'Priya Raghunathan', role: 'coach', title: 'Head Coach', email: 'p.raghunathan@example.com', phone: '+971 50 123 4567' },
      { id: 's2', name: 'Marcus Delacroix-Bell', role: 'manager', title: '', email: 'm.delacroix@example.com', phone: null },
      { id: 's3', name: 'Aisha Nkemelu', role: 'medic', title: 'Physio', email: 'a.nkemelu@example.com', phone: '+971 55 987 6543' },
    ],
  },
  { name: 'U16G', staff: [{ id: 's4', name: 'Rory Ellingham', role: 'coach', title: '', email: 'r.ellingham@example.com', phone: '+971 52 111 2222' }] },
  { name: 'U12 Mixed', staff: [] },
  { name: 'U18B', staff: [] },
]

const TONE = {
  coach: 'bg-monogram-coach',
  manager: 'bg-monogram-manager',
  medic: 'bg-monogram-medic',
}
const ROLE_LABEL = { coach: 'Coach', manager: 'Team Manager', medic: 'Medic' }

function Bubble({ member, size = 'h-12 w-12', text = 'text-[14px]' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid ${size} shrink-0 place-items-center rounded-full ${text} font-extrabold text-ink-invert ${TONE[member.role]}`}
    >
      {initials(member.name)}
    </span>
  )
}

function Label({ children, note }) {
  return (
    <div className="mb-2.5 mt-7 first:mt-0">
      <h2 className="text-[13px] font-extrabold uppercase tracking-[.8px] text-ink">{children}</h2>
      <p className="text-[12px] leading-relaxed text-ink-muted">{note}</p>
    </div>
  )
}

/* ══ A — BUBBLES, TAP TO EDIT ════════════════════════════════════════════════
   Closest to the Home card. Editing moves into a sheet behind a tap, so the
   screen reads as a directory rather than a form. Best at "who is on which
   squad"; costs a tap to change a title. */
function VariantA() {
  return (
    <>
      {SQUADS.map((squad) => (
        <Card key={squad.name} className="mb-2.5 p-3.5">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-extrabold text-ink">{squad.name}</h4>
            <span className="text-[12px] font-semibold text-ink-faint">
              {squad.staff.length || 'Nobody yet'}
            </span>
          </div>
          {squad.staff.length === 0 ? (
            <button className="flex w-full items-center gap-3 rounded-[11px] border-[1.5px] border-dashed border-line px-3 py-2.5 text-left">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-line text-[20px] font-bold text-ink-faint">
                +
              </span>
              <span className="text-[13px] font-bold text-brand">Add a coach or manager</span>
            </button>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-3.5">
              {squad.staff.map((m) => (
                <button key={m.id} className="flex w-[86px] flex-col items-center gap-1.5 text-center">
                  <Bubble member={m} size="h-14 w-14" text="text-[16px]" />
                  <span className="w-full truncate text-[12.5px] font-bold leading-tight text-ink">
                    {m.name.split(' ')[0]}
                  </span>
                  <span className="w-full truncate text-[11px] font-semibold leading-tight text-ink-muted">
                    {m.title || ROLE_LABEL[m.role]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ))}
    </>
  )
}

/* ══ B — BUBBLE ROW, EVERYTHING INLINE ═══════════════════════════════════════
   A bubble leads each row; name, role, contact and the title field all stay
   visible. Nothing is hidden behind a tap — closest in behaviour to today, just
   less like a wall of form fields. Densest of the three. */
function VariantB() {
  return (
    <>
      {SQUADS.map((squad) => (
        <Card key={squad.name} className="mb-2.5 overflow-hidden">
          <div className="flex items-baseline justify-between gap-2 border-b border-line px-3.5 py-2.5">
            <h4 className="text-[15px] font-extrabold text-ink">{squad.name}</h4>
            <span className="text-[12px] font-semibold text-ink-faint">
              {squad.staff.length ? `${squad.staff.length} staff` : 'Nobody yet'}
            </span>
          </div>
          {squad.staff.length === 0 ? (
            <p className="px-3.5 py-3 text-[12.5px] text-ink-muted">
              No coach, team manager or medic yet.{' '}
              <span className="font-bold text-brand">Add one</span>
            </p>
          ) : (
            squad.staff.map((m) => (
              <div key={m.id} className="flex gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
                <Bubble member={m} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-extrabold text-ink">{m.name}</span>
                    <span className="text-[11px] font-extrabold uppercase tracking-[.4px] text-ink-faint">
                      {ROLE_LABEL[m.role]}
                    </span>
                  </div>
                  <p className="truncate text-[12.5px] text-ink-muted">{m.email}</p>
                  <p className="text-[12.5px] text-ink-muted">{m.phone ?? 'No phone number'}</p>
                  <input
                    defaultValue={m.title}
                    placeholder="Title, e.g. Head Coach"
                    className="mt-1.5 w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand"
                  />
                </div>
              </div>
            ))
          )}
        </Card>
      ))}
    </>
  )
}

/* ══ C — WHO IS MISSING ══════════════════════════════════════════════════════
   Optimised for the state this screen is actually in: most squads empty. Every
   squad is one compact row with stacked bubbles and a gap flagged in words.
   Tap a squad to open its staff. Answers "where are the holes" in one screen at
   fifteen squads; individual detail costs a tap. */
function VariantC() {
  return (
    <Card className="overflow-hidden">
      {SQUADS.map((squad) => {
        const missing = squad.staff.length === 0
        return (
          <button
            key={squad.name}
            className="flex w-full items-center gap-3 border-b border-line px-3.5 py-3 text-left last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-extrabold text-ink">{squad.name}</span>
              <span
                className={`block text-[12px] font-semibold ${missing ? 'text-brand' : 'text-ink-muted'}`}
              >
                {missing
                  ? 'No coach or manager'
                  : squad.staff.map((m) => ROLE_LABEL[m.role]).join(' · ')}
              </span>
            </span>
            {missing ? (
              <span className="shrink-0 rounded-[8px] bg-danger-bg px-2 py-1 text-[11px] font-extrabold uppercase tracking-[.4px] text-brand-deep">
                Gap
              </span>
            ) : (
              <span className="flex shrink-0 -space-x-2">
                {squad.staff.map((m) => (
                  <span key={m.id} className="rounded-full ring-2 ring-surface-card">
                    <Bubble member={m} size="h-9 w-9" text="text-[11px]" />
                  </span>
                ))}
              </span>
            )}
            <span aria-hidden="true" className="shrink-0 text-[15px] text-ink-faint">
              ›
            </span>
          </button>
        )
      })}
    </Card>
  )
}

export default function StaffVariants() {
  return (
    <div className="px-4 py-4">
      <Label note="Two full squads and two empty ones — the mix an admin actually opens.">
        A · Bubbles, tap to edit
      </Label>
      <div data-variant="A"><VariantA /></div>

      <Label note="Bubble leads the row; title and contact stay visible. Nothing hidden.">
        B · Bubble row, all inline
      </Label>
      <div data-variant="B"><VariantB /></div>

      <Label note="Every squad on one screen, gaps called out. Detail costs a tap.">
        C · Who is missing
      </Label>
      <div data-variant="C"><VariantC /></div>
    </div>
  )
}
