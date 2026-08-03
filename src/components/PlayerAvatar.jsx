import { useEffect, useState } from 'react'
import { initials } from '../lib/playerFormat.js'
import { signPhotoUrl } from '../data/photos.js'

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
}) {
  const path = player?.photo_path ?? null
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
    sm: 'h-10 w-10 rounded-[12px] text-[14px]',
    md: 'h-14 w-14 rounded-[14px] text-[20px]',
    lg: 'h-20 w-20 rounded-[18px] text-[26px]',
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
        className={`${shared} bg-white/20 object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={`${shared} grid place-items-center bg-white/20 font-extrabold tracking-[.5px]`}
      aria-hidden="true"
    >
      {initials(player?.full_name)}
    </div>
  )
}
