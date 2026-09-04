import { useCallback, useState } from 'react'
import { validateChatFile } from '../data/chatMedia.js'

// The composer's document slot — one file, never mixed into the photo tray
// (claude/plans/2026-09-04-chat-file-attachments.md). useAttachmentTray stays
// image-only: a PDF dropped on the conversation is still "not a photo". This
// hook is the file-control door beside that tray.

export function usePendingChatFile() {
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)

  const pick = useCallback((files) => {
    const incoming = Array.from(files ?? [])
    if (incoming.length === 0) return
    const first = incoming[0]
    const problem = validateChatFile(first)
    if (problem) {
      setError(problem)
      return
    }
    setFile(first)
    setError(null)
  }, [])

  const clear = useCallback(() => {
    setFile(null)
    setError(null)
  }, [])

  return { file, error, pick, clear, setError }
}
