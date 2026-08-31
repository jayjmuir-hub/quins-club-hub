// The composer's attachment strip — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), task 5.
//
// One component for both threads, for the same reason useAttachmentTray is
// one hook: the single-photo preview this replaces was duplicated in
// DmThread.jsx and ChannelThread.jsx, and a strip with per-item removal and
// counted labels is several times more to keep in step.
//
// ⚠️ THUMBNAILS, NOT NAMES. A pasted screenshot arrives as `image.png`, so
// ten pasted screenshots are ten identical names and the list would be
// useless. The name survives to the database (uploadAlbum writes it); it is
// simply not what the sender needs to look at.
export default function AttachmentTray({ items, onRemove, error }) {
  if (items.length === 0 && !error) return null
  return (
    <div className="mb-1.5">
      {error && (
        <p role="alert" className="mb-1 px-1 text-[12px] font-semibold text-danger-ink" data-testid="tray-error">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul
          data-testid="attachment-tray"
          aria-label={`${items.length} ${items.length === 1 ? 'photo' : 'photos'} to send`}
          className="flex gap-2 overflow-x-auto rounded-[10px] bg-surface-mute px-2.5 py-2"
        >
          {items.map((item, index) => (
            <li key={item.id} data-testid="tray-thumb" className="relative shrink-0">
              <img
                // A preview can fail to be made (useAttachmentTray keeps the
                // photo anyway); the tile then shows as an empty square
                // rather than the tray losing a photo it is about to send.
                src={item.previewUrl ?? undefined}
                alt={item.file.name || 'Photo to send'}
                className="h-16 w-16 rounded-[8px] bg-surface object-cover"
              />
              <button
                type="button"
                // ⚠️ claude/specs/accessibility.md — ten buttons all called
                // "Remove photo" are ten identical announcements, and with
                // pasted screenshots the position is the ONLY thing telling
                // them apart. Counted, and recounted after each removal.
                aria-label={`Remove photo ${index + 1} of ${items.length}`}
                onClick={() => onRemove(item.id)}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-surface shadow-card"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
