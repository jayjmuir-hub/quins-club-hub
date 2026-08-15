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
          // No photo — the monogram branch, which is thirteen of the club's
          // fifteen staff.
          photoPath: null,
          photoUrl: null,
        },
        // ⚠️ FOUR PEOPLE, NOT TWO, SINCE THE TILE MOSAIC LANDED (15 Aug 2026).
        // At two, `tileSpans()` never produces a lead tile at all — the layout
        // under test simply does not appear, and the harness would show a
        // perfectly tidy two-up grid while the mosaic went unverified. Four is
        // the smallest size that exercises every branch at once: a lead, the
        // two tiles that stack beside it, and the odd last tile that has to go
        // full width rather than sit alone on its row. It is also a size the
        // club really has — squad sizes on 15 Aug were 1, 1, 4 and 6.
        {
          membershipId: 'stub-ms-3',
          role: 'coach',
          title: 'Assistant Coach',
          name: 'Dan Whitfield',
          email: 'dan.whitfield@adhquins-clubhub.com',
          // ⚠️ E.164, LIKE THE DATABASE STORES IT. `whatsappUrl()` strips
          // everything but digits, so a stub written with spaces would pass
          // whatever the function did to the `+`.
          phone: '+971509876543',
          photoPath: null,
          photoUrl: null,
        },
        {
          membershipId: 'stub-ms-4',
          role: 'manager',
          title: 'Team Manager',
          // A long name, because the tile is 170px wide at 390 and the name is
          // set in the display face. This is the string that finds out whether
          // it wraps or overflows.
          name: 'Priyanka Ramachandran',
          email: 'priyanka.ramachandran@adhquins-clubhub.com',
          phone: '+971551112233',
          photoPath: null,
          photoUrl: null,
        },
        // ⚠️ SIX, BECAUSE SIX IS WHAT THE CLUB'S LARGEST SQUAD HAS and it is the
        // size that exposed the old layout — Jay, 15 Aug 2026, looking at the
        // real thing: tiles wrapped BELOW the lead and back to the left margin,
        // so two of them shared a left edge with the featured one.
        // ⚠️ INVENTED NAMES. The squad this reproduces is real and its people
        // are real; CLAUDE.md rule 9 forbids either from appearing in this repo,
        // and a worked example is still writing it down. The SHAPE is what is
        // copied: six people, one titled head, a mix of who has a phone.
        {
          membershipId: 'stub-ms-5',
          role: 'coach',
          title: 'Assistant Coach',
          name: 'Tomas Iversen',
          email: 'tomas.iversen@adhquins-clubhub.com',
          phone: null,
          photoPath: null,
          photoUrl: null,
        },
        {
          membershipId: 'stub-ms-6',
          role: 'manager',
          title: 'Team Manager',
          name: 'Grace Mbeki',
          email: 'grace.mbeki@adhquins-clubhub.com',
          phone: '+971544445555',
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
