import { useEffect, useState } from 'react'
import { initials } from '../lib/playerFormat.js'
import { signPhotoUrl } from '../data/photos.js'
// ⚠️ FROM `lib/`, NOT FROM `PhotoPositioner.jsx` — this component renders on the
// roster, the dashboard and the player hero, and the picker is a large module to
// drag onto all three for a percentage. See src/lib/photoFocus.js.
import { focusToObjectPosition } from '../lib/photoFocus.js'
import { isJerseyNumber } from '../lib/jersey.js'

// A player's head shot, falling back to their initials.
//
// WHY THIS IS A COMPONENT AND NOT AN <img src={player.photo_url}>: the photo
// bucket is private, so there IS no durable URL. players.photo_path holds an
// object key, and a viewable URL has to be signed on demand and expires (see
// src/data/photos.js). Every place that shows a face therefore needs the same
// sign-then-render dance, and it belongs in one place.
//
// The fallback is not an error state. Most players have no photo, and a
// monogram is what the roster and the detail hero looked like before this
// feature existed — so "no photo", "still signing" and "signing failed" all
// render identically and none of them announce themselves. A broken-image
// icon or an error box where a child's face should be would be worse than
// the monogram in every one of those cases.
//
// `url` may be passed in directly by a caller that has already signed a whole
// squad's photos in one batch (see signPhotoUrls) — the roster does this
// rather than firing one signing request per row.

export default function PlayerAvatar({
  player,
  url,
  size = 'md',
  className = '',
  // ⚠️ SENIOR SQUADS 2a — a jersey number is a per-squad decision
  // (teams.uses_jersey_numbers), never derived from the row itself, so the
  // caller states it explicitly rather than this component guessing from
  // `player.jersey_num` alone (which would show a number on a youth squad
  // roster the moment one happened to be set). Default false: every existing
  // caller that does not pass this renders exactly as before.
  showJersey = false,
}) {
  const path = player?.photo_path ?? null
  // ⚠️ READ OFF THE PLAYER ROW, NOT TAKEN AS A PROP, because every caller
  // already hands over the whole row and a prop would be a second thing each of
  // the six call sites had to remember. Null for a photo uploaded before the
  // columns existed, which `focusToObjectPosition` renders as the centre — the
  // behaviour every one of those photos has today.
  const focus =
    player?.photo_focus_x == null && player?.photo_focus_y == null
      ? null
      : { x: player.photo_focus_x, y: player.photo_focus_y }
  const [signedUrl, setSignedUrl] = useState(url ?? null)
  // A photo that 404s or whose signature has expired mid-view: fall back
  // rather than leaving a broken image frame on screen.
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [path, url])

  useEffect(() => {
    // A caller-supplied URL wins: it came from a batch signing and re-signing
    // it here would undo the point of batching.
    if (url) {
      setSignedUrl(url)
      return undefined
    }
    if (!path) {
      setSignedUrl(null)
      return undefined
    }

    let mounted = true
    signPhotoUrl(path).then((value) => {
      if (mounted) setSignedUrl(value)
    })
    return () => {
      mounted = false
    }
  }, [path, url])

  const dimensions = {
    // Table rows only. `sm` (40px) is taller than a dense table row's text
    // and would add ~14px to every one of them — on a 53-player squad that is
    // most of a screen of extra scrolling to show 53 monograms. 32px fits
    // inside the existing row height, so the table gains faces without
    // getting longer.
    xs: 'h-8 w-8 rounded-[10px] text-[11px]',
    sm: 'h-10 w-10 rounded-[12px] text-[14px]',
    md: 'h-14 w-14 rounded-[14px] text-[20px]',
    lg: 'h-20 w-20 rounded-[18px] text-[26px]',
    // Detail hero only. Big enough that a face is actually a face rather
    // than a thumbnail, which is the point of having head shots at all.
    xl: 'h-28 w-28 rounded-[22px] text-[34px]',
  }[size]

  const shared = `${dimensions} shrink-0 overflow-hidden ${className}`

  if (signedUrl && !failed) {
    return (
      <img
        src={signedUrl}
        // The name is already rendered beside every use of this component, so
        // an alt of "Photo of Tom Fletcher" would just repeat it. Empty alt
        // marks it decorative and keeps a screen reader from saying the name
        // twice.
        alt=""
        // ⚠️ THE SAME OMISSION THE SQUAD-CONTACT TILE HAD, AND FIXED IN THE SAME
        // BREATH BECAUSE IT IS THE SAME BUG. `PhotoField` has let a parent
        // position their child's head shot since 15 Aug 2026 and every screen
        // that draws one ignored the result — `object-cover` centres the crop,
        // so a face high in the frame is cropped off in the `xl` hero exactly as
        // it was on the lead tile. The columns are already on the row: the
        // roster reads `players` with `select('*')`.
        style={{ objectPosition: focusToObjectPosition(focus) }}
        className={`${shared} bg-white/20 object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }

  // The photo branch above is unchanged — a number over a photo is a
  // different design decision, not made here (task-5-brief.md). Only the
  // monogram fallback trades initials for the number, and only when the
  // squad the caller is rendering actually uses them.
  return (
    <div
      className={`${shared} grid place-items-center bg-white/20 font-extrabold tracking-[.5px]`}
      aria-hidden="true"
    >
      {showJersey && isJerseyNumber(player?.jersey_num) ? player.jersey_num : initials(player?.full_name)}
    </div>
  )
}
