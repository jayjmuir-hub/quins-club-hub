// Harness stub for src/data/photos.js. The real one signs URLs against a
// private Supabase bucket; here we hand back a local data URL so the detail
// hero renders an actual image rather than always falling back to initials —
// the fallback path is what the monogram already shows for every other stub
// player, so having one real photo is what makes the layout check meaningful.
const SWATCH =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="%23445"/><stop offset="1" stop-color="%23223"/>' +
      '</linearGradient></defs>' +
      '<rect width="240" height="240" fill="url(%23g)"/>' +
      '<circle cx="120" cy="92" r="44" fill="%23cbd0d8"/>' +
      '<path d="M28 240c0-52 41-84 92-84s92 32 92 84z" fill="%23cbd0d8"/>' +
      '</svg>',
  )

export async function signPhotoUrl(path) {
  return path ? SWATCH : null
}

export async function signPhotoUrls(paths = []) {
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, SWATCH]))
}

export async function uploadPlayerPhoto() {
  return null
}

export async function removePlayerPhoto() {}

export function forgetPhotoUrl() {}

export async function deletePlayerPhoto() {}

export function clearPhotoUrlCache() {}

export const PHOTO_BUCKET = 'player-photos'
