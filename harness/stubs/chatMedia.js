// Harness stub for src/data/chatMedia.js. The real module signs short-lived
// URLs from the PRIVATE chat-media bucket; here every path signs to an
// inline SVG so no network is touched.
//
// ⚠️ THE DELAY IS THE POINT. The dm-thread scenario exists to reproduce
// "still when i open a chat i have to scroll down" (Jay's phone,
// 25 Aug 2026): ChatPhoto renders NOTHING until the signed URL lands, so a
// photo-heavy thread grows ~400px per photo AFTER the open-scroll has
// already fired. 900ms is the shape of a real signing round-trip.

function photoSvg(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="440"><rect width="600" height="440" fill="#1c5d3a"/><rect x="24" y="24" width="552" height="392" fill="none" stroke="#ffffff55" stroke-width="4"/><text x="50%" y="52%" font-size="44" font-family="sans-serif" fill="#fff" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const CHAT_MEDIA_BUCKET = 'chat-media'

export async function signChatPhotoUrl(path) {
  await new Promise((resolve) => setTimeout(resolve, 900))
  return photoSvg(String(path).replace(/^.*\//, ''))
}

export async function uploadChatPhoto() {
  throw new Error('harness: uploadChatPhoto is not stubbed')
}

export async function removeChatPhoto() {}

// Voice notes reuse the same bucket; mirror the real module's surface so the
// harness-stubs test (tests/harness-stubs.test.js) stays satisfied.
const AUDIO_EXTENSIONS = new Set(['webm', 'm4a', 'mp4', 'aac', 'mp3', 'ogg'])

export function isAudioAttachment(path) {
  if (!path) return false
  return AUDIO_EXTENSIONS.has(path.split('.').pop()?.toLowerCase())
}

export function attachmentPreviewLabel(path) {
  return isAudioAttachment(path) ? '🎤 Voice message' : '📷 Photo'
}

export const signChatVoiceUrl = signChatPhotoUrl

export async function uploadChatVoice() {
  throw new Error('harness: uploadChatVoice is not stubbed')
}

export async function removeChatVoice() {}
