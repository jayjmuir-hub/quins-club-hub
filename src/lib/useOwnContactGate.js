import { useEffect, useState } from 'react'
import { getPlayerDob } from '../data/players.js'
import { allowsOwnContact } from './ageGroup.js'
import { allowsOwnContactFor } from './ageGrade.js'

// "May this player hold their own email and phone?", asked with the birthday
// rather than with the squad name alone.
//
// The re-point promised since 3 Aug 2026 and deferred three times — item 3 of
// claude/plans/2026-08-16-account-creation-redesign.md. The rule itself is in
// `allowsOwnContactFor`; this is only the fetching around it.
//
// ⚠️ A HOOK BECAUSE THREE SCREENS ASK IT AND MUST NOT DISAGREE — PlayerDetail,
// PlayerForm and MyPlayerForm. Three copies of "read the birthday, then narrow"
// is three chances for one of them to fail open, and the one that did would be
// the one nobody tested.
//
// ⚠️ IT ONLY EVER NARROWS. The squad answer is returned immediately and the
// birthday can take the field away; it can never hand it back. A parent writes
// their own child's birthday, so a gate a birthday could OPEN is a gate a family
// unlocks by typing a different year.
//
// ⚠️ AND IT STARTS AT THE SQUAD'S ANSWER RATHER THAN AT `false`. Starting closed
// would blink the fields out of existence and back on every open, for every
// player old enough to have them — a flicker on a form is how people come to
// believe a field is broken. Starting open is safe because the ONLY move
// available afterwards is to close.
//
// ⚠️ NOT THE SECURITY. `player_contacts` has its own policies and an under-13's
// row is refused by the database, not by this. What this decides is whether a
// form renders a box — and the club's rule is that it must not render one at
// all rather than render it disabled, because an empty box invites somebody to
// find a way to fill it.

/**
 * @param {string|null|undefined} playerId — null for a player being created,
 *   which has no birthday to read and gets the squad's answer.
 * @param {string|null|undefined} teamName — the SELECTED squad, so that moving a
 *   child up an age group in a form takes effect immediately.
 * @returns {{ allowed: boolean, settled: boolean }}
 *
 * ⚠️ `settled` EXISTS FOR ONE CALLER AND IS WORTH THE EXTRA FIELD. MyPlayerForm
 * does not merely hide the boxes — it declines to FETCH the child's own email
 * and phone until the gate agrees, so that they are never sitting in a component
 * for the next person to render by accident. It cannot do that from `allowed`
 * alone, because `allowed` is optimistically the squad's answer while the
 * birthday is still in flight. Screens that only hide a block ignore it.
 */
export default function useOwnContactGate(playerId, teamName) {
  const bySquad = allowsOwnContact(teamName)
  const [state, setState] = useState({ allowed: bySquad, settled: !bySquad || !playerId })

  useEffect(() => {
    const needsRead = Boolean(bySquad && playerId)
    // ⚠️ RE-SEEDED ON EVERY CHANGE OF SQUAD, and this line is why the hook holds
    // state at all rather than a plain `dob`. Switching the age-group dropdown
    // from U16 to U8 must close the gate at once, before any read comes back —
    // otherwise the fields stay on screen while a request is in flight.
    setState({ allowed: bySquad, settled: !needsRead })

    if (!needsRead) return undefined

    let mounted = true
    getPlayerDob(playerId)
      .then((dob) => {
        if (!mounted) return
        setState({ allowed: allowsOwnContactFor({ teamName, dateOfBirth: dob }), settled: true })
      })
      // ⚠️ SWALLOWED, LEAVING THE SQUAD'S ANSWER STANDING. getPlayerDob already
      // returns null for "you may not see it", so a genuine failure here is a
      // network one — and closing the gate on it would remove a field a
      // thirteen-year-old is entitled to because a request timed out.
      .catch(() => {
        if (mounted) setState({ allowed: bySquad, settled: true })
      })

    return () => {
      mounted = false
    }
  }, [playerId, teamName, bySquad])

  return state
}
