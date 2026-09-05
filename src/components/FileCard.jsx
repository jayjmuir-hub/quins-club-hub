import { useState } from 'react'
import { fileKindLabel } from '../lib/fileKind.js'
import { signChatPhotoUrl } from '../data/chatMedia.js'
import { formatBytes } from '../data/storage.js'
import { saveBlobAsFile } from '../lib/downloadBlob.js'

// A document in a chat bubble — claude/plans/2026-09-04-chat-file-attachments.md.
// Icon + original filename + type pill + human size. Download is a BUTTON that
// fetch→blob→object URL, never <a href={signedUrl}> — parents must not see a
// long signed storage URL in the status bar or on long-press (Jay, 5 Sep 2026).
// No in-bubble Office preview. Caption is deferred.

function FileTypePill({ type, name, path, className }) {
  return (
    <span
      data-testid="file-type-pill"
      className={`inline-flex shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] ${className}`}
    >
      {fileKindLabel({ type, name, path })}
    </span>
  )
}

export default function FileCard({ path, name, size, type, compact = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!path) return null
  const label = name || 'File'

  async function download() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const signed = await signChatPhotoUrl(path)
      if (!signed) throw new Error('missing')
      const res = await fetch(signed)
      if (!res.ok) throw new Error('http')
      const blob = await res.blob()
      await saveBlobAsFile(blob, label)
    } catch {
      setError('Could not download that file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="chat-file"
      className={`mt-1 flex max-w-[min(100%,22rem)] items-center gap-2.5 rounded-[10px] bg-black/10 px-2.5 py-2 ${
        compact ? 'py-1.5' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-white/20 text-[16px]"
      >
        📄
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileTypePill type={type} name={name} path={path} className="bg-white/25" />
          <span data-testid="file-name" className="min-w-0 truncate text-[13px] font-bold leading-tight">
            {label}
          </span>
        </span>
        {size != null && (
          <span className="mt-0.5 block text-[11px] font-semibold opacity-70">{formatBytes(size)}</span>
        )}
        {error && (
          <span role="alert" className="mt-0.5 block text-[11px] font-semibold text-danger-ink">
            {error}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-label={`Download ${label}`}
        className="shrink-0 rounded-[8px] bg-white/25 px-2 py-1 text-[11px] font-extrabold leading-none hover:bg-white/35 disabled:opacity-60"
      >
        {busy ? '…' : 'Download'}
      </button>
    </div>
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
          <FileTypePill type={file.type} name={file.name} className="bg-surface-sunk text-ink" />
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
