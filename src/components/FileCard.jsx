import { useEffect, useState } from 'react'
import { signChatPhotoUrl } from '../data/chatMedia.js'
import { formatBytes } from '../data/storage.js'

// A document in a chat bubble — claude/plans/2026-09-04-chat-file-attachments.md.
// Icon + original filename + human size; tap opens a signed URL. No in-bubble
// Office preview (Jay, 4 Sep 2026). Caption is deferred.

export default function FileCard({ path, name, size, compact = false }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) signChatPhotoUrl(path).then((signed) => live && setUrl(signed))
    return () => {
      live = false
    }
  }, [path])

  if (!path) return null
  const label = name || 'File'
  const href = url || undefined

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="chat-file"
      aria-label={`Open ${label}`}
      className={`mt-1 flex max-w-[280px] items-center gap-2.5 rounded-[10px] bg-black/10 px-2.5 py-2 no-underline ${
        compact ? 'py-1.5' : ''
      } ${href ? 'hover:bg-black/15' : 'pointer-events-none'}`}
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-white/20 text-[16px]"
      >
        📄
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-tight">{label}</span>
        {size != null && (
          <span className="block text-[11px] font-semibold opacity-70">{formatBytes(size)}</span>
        )}
      </span>
    </a>
  )
}

/** Composer chip for the file waiting to send. */
export function PendingFileChip({ file, error, onRemove }) {
  if (!file && !error) return null
  return (
    <div className="mb-1.5">
      {error && (
        <p role="alert" className="mb-1 px-1 text-[12px] font-semibold text-danger-ink" data-testid="file-error">
          {error}
        </p>
      )}
      {file && (
        <div
          data-testid="pending-file"
          className="flex items-center gap-2 rounded-[10px] bg-surface-mute px-2.5 py-2"
        >
          <span aria-hidden="true">📄</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{file.name}</span>
          <span className="shrink-0 text-[11px] font-semibold text-ink-muted">{formatBytes(file.size)}</span>
          <button
            type="button"
            aria-label="Remove file"
            onClick={onRemove}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
