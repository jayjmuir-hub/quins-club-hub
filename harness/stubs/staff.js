// Harness stub for src/data/staff.js — the Squad contacts block on Home
// (13 Aug 2026). Same contract as every other stub here: no network, and the
// shape is exactly what the real module returns so the screen cannot tell the
// difference.
//
// ⚠️ WITHOUT THIS THE WHOLE HARNESS STOPS BOOTING, not just the dashboard
// scenario. Dashboard.jsx imports '../data/staff.js', which imports
// src/lib/supabase.js at module scope — the same failure the envDir note in
// harness/vite.config.js records, and it takes out every scenario that renders
// AppShell rather than only the one under test.

/**
 * A Map keyed by team id, mirroring listMySquadStaff().
 *
 * ⚠️ THE TWO SQUADS ARE DELIBERATELY DIFFERENT SHAPES, because the interesting
 * rendering questions are not "does a name appear":
 *
 *   t1        a coach WITH a title and both contact details, plus a medic with
 *             NO title and no phone — so the title-replaces-role fallback and
 *             the "omit the contact row entirely" branch are both on screen at
 *             once.
 *   t2        absent from the Map altogether — the EMPTY state, which is the
 *             majority case in the real club (12 of 15 squads on the day this
 *             shipped) and the one most likely to be got wrong.
 *
 * ⚠️ THE EMAIL IS DELIBERATELY LONG. An email address has no spaces in it, so
 * it is one unbreakable word and the only string on this card that can push the
 * layout past 320px — the exact failure harness/check-overflow.mjs exists to
 * catch. A short address would make the overflow check pass vacuously.
 */
export async function listMySquadStaff() {
  return new Map([
    [
      't1',
      [
        {
          membershipId: 'stub-ms-1',
          role: 'coach',
          title: 'Head Coach',
          name: 'Rosa Ferreira',
          // ⚠️ LENGTHENED 13 Aug 2026, AND THE REASON IS A MEASUREMENT THAT
          // WENT THE WRONG WAY. This was
          // `rosa.ferreira.headcoach@adhquins-clubhub.com` (44 chars), chosen
          // because an email has no spaces and is the only unbreakable word on
          // this card. Before the avatar landed, removing `break-all` with that
          // address pushed the document to 322px against a 320 viewport — so
          // the fixture proved the guard.
          //
          // The 40px avatar plus its gap then took 52px out of the row, and
          // the SAME address stopped overflowing at all with or without
          // `break-all`: the fixture had quietly become vacuous, and the
          // overflow check would have passed on a card with no guard at all.
          // At 85 chars, removing `break-all` gives **521px against a 320
          // viewport** — 201px of overflow. Measured, both ways.
          email: 'rosa.ferreira.assistant.head.coach.and.welfare.officer.u13mixed@adhquins-clubhub.com',
          phone: '+971 50 123 4567',
          photoPath: 'stub/rosa.jpg',
          // ⚠️ A REAL RENDERABLE IMAGE, as a data URI. The harness never talks
          // to Supabase, so a signed URL cannot be produced — and a bogus URL
          // would 404, trip the component's onError and fall back to initials,
          // which is exactly the state this entry exists to NOT be in. A 1x1
          // PNG scaled by object-cover proves the <img> branch renders and is
          // laid out, which is the only thing the harness can check here.
          photoUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        },
        {
          membershipId: 'stub-ms-2',
          role: 'medic',
          title: null,
          name: 'Sam Okonkwo',
          email: null,
          phone: null,
          // No photo — the monogram branch, which is every member of the club
          // on the day this shipped.
          photoPath: null,
          photoUrl: null,
        },
      ],
    ],
  ])
}

// The admin directory's two exports, so a future /admin/staff scenario does not
// have to come back and add them. listSquadStaff builds from TEAMS outward —
// every squad, including the empty ones, which is that screen's whole point.
export async function listSquadStaff() {
  const staff = await listMySquadStaff()
  return [
    { id: 't1', name: 'U12 Boys', staff: staff.get('t1') ?? [] },
    { id: 't2', name: 'U14 Boys', staff: [] },
  ]
}

export async function setMembershipTitle({ membershipId, title } = {}) {
  return { id: membershipId, title: title?.trim() || null }
}

/**
 * Mirrors the real toStaffMember — a PURE row shaper with no Supabase in it.
 *
 * ⚠️ COPIED RATHER THAN RE-EXPORTED FROM src/data/staff.js, AND THAT IS FORCED
 * BY HOW THIS HARNESS WORKS. The alias in harness/vite.config.js matches
 * SPECIFIER TEXT, so a stub importing from '../../src/data/staff.js' would pull
 * in the real module — and with it src/lib/supabase.js at module scope, which is
 * the exact thing the stub exists to keep out.
 *
 * ⚠️ KEPT IN STEP BY tests/harness-stubs.test.js, which asserts this file
 * exports everything the real one does. It caught the omission the moment this
 * stub was written.
 *
 * The blank-name rule is the part worth copying faithfully: an empty string is
 * not a name, and `full_name ?? 'Unnamed'` lets one through.
 */
export function toStaffMember(row) {
  const name = String(row.profiles?.full_name ?? '').trim()
  const email = String(row.profiles?.email ?? '').trim()
  return {
    membershipId: row.id,
    role: row.role,
    title: String(row.title ?? '').trim() || null,
    name: name || email || 'No name yet',
    email: email || null,
    phone: String(row.profiles?.phone ?? '').trim() || null,
  }
}
